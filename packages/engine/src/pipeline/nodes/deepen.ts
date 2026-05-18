/**
 * Deepen Pipeline Node
 *
 * After synthesis, detects thin sections (low char count or few citations)
 * and expands them in parallel using relevant evidence from the sub-agent
 * reports. This addresses the common failure mode where the synthesizer
 * gives short, surface-level treatments to harder dimensions.
 */

import pLimit from "p-limit";
import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import { DEEPEN_SECTION_PROMPT } from "../../agents/prompts";
import { parseSections, countCitations, type Section } from "../../utils/sections";
import { pipelineLogger } from "../../logger";

interface ThinSection {
  index: number;
  heading: string;
  text: string;
  level: number;
  citationCount: number;
}

// Never deepen sections that synthesise across dimensions — they don't have
// dedicated evidence in individual sub-agent reports.
const SKIP_DEEPEN_RE =
  /^(结论|conclusions?|recommendations?|建议|总结|综合|summary|abstract|overall|integrated|推荐)/i;

function detectThinSections(
  sections: Section[],
  charThreshold: number,
  citationThreshold: number,
): ThinSection[] {
  const thin: ThinSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.level > 2) continue; // only top-level sections
    if (s.heading === "Introduction") continue;
    if (/^references?|sources?|bibliography|参考文献|来源$/i.test(s.heading)) continue;
    if (SKIP_DEEPEN_RE.test(s.heading)) continue;

    const citations = countCitations(s.text);
    const isThin = s.text.length < charThreshold || citations < citationThreshold;
    if (isThin) {
      thin.push({
        index: i,
        heading: s.heading,
        text: s.text,
        level: s.level,
        citationCount: citations,
      });
    }
  }
  thin.sort((a, b) => {
    if (a.citationCount !== b.citationCount) return a.citationCount - b.citationCount;
    return a.text.length - b.text.length;
  });
  return thin;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s一-鿿]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function selectRelevantEvidence(
  sectionHeading: string,
  sectionText: string,
  reports: PipelineContext["subagentReports"],
  budgetChars: number,
): string {
  const queryTokens = tokenize(`${sectionHeading} ${sectionText}`);
  if (queryTokens.size === 0) return "";

  const scored: Array<{ text: string; score: number }> = [];
  for (const report of reports) {
    const paragraphs = report.report.split(/\n{2,}/);
    for (const para of paragraphs) {
      const paraTokens = tokenize(para);
      if (paraTokens.size === 0) continue;
      let intersection = 0;
      for (const t of queryTokens) {
        if (paraTokens.has(t)) intersection++;
      }
      if (intersection < 2) continue;
      const score = intersection / Math.sqrt(paraTokens.size);
      scored.push({ text: para.trim(), score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const kept: string[] = [];
  let used = 0;
  for (const p of scored) {
    if (used + p.text.length + 2 > budgetChars) continue;
    kept.push(p.text);
    used += p.text.length + 2;
    if (kept.length >= 10) break;
  }
  return kept.join("\n\n");
}

function replaceSection(
  report: string,
  oldHeading: string,
  newContent: string,
): string {
  const headingRe = new RegExp(`^(##\\s+${escapeRegex(oldHeading)})\\s*$`, "m");
  const match = report.match(headingRe);
  if (!match) return report; // section not found, leave report alone

  const startIdx = match.index!;
  const afterHeading = startIdx + match[0].length;
  const nextHeadingMatch = report.slice(afterHeading).match(/^##\s+\S/m);
  const endIdx = nextHeadingMatch
    ? afterHeading + nextHeadingMatch.index!
    : report.length;

  const trimmedNewContent = newContent.trim();
  // newContent should already include its own ## heading; if not, prepend
  const block = trimmedNewContent.startsWith("##")
    ? trimmedNewContent
    : `## ${oldHeading}\n\n${trimmedNewContent}`;

  return report.slice(0, startIdx) + block + "\n\n" + report.slice(endIdx);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expand thin sections of a synthesized report in-place using evidence from
 * sub-agent reports. Called internally by createSynthesizeNode — NOT a
 * separate pipeline node, matching the original Deep-Research-Agent design
 * where deepen runs inside synthesis before the function returns.
 */
export async function deepenReport(
  report: string,
  subagentReports: PipelineContext["subagentReports"],
  userQuery: string,
  language: "zh" | "en",
  profile: DepthProfile,
  llm: LLMClient,
  runId: string,
): Promise<string> {
  const log = pipelineLogger(runId);

  if (!profile.deepenThinSections) {
    return report;
  }

  const sections = parseSections(report);
  const thin = detectThinSections(
    sections,
    profile.deepenCharThreshold,
    profile.deepenCitationThreshold,
  );

  if (thin.length === 0) {
    log.info({ sectionCount: sections.length }, "deepen: no thin sections found");
    return report;
  }

  const targets = thin.slice(0, profile.maxDeepenSections);
  log.info({
    thinTotal: thin.length,
    deepening: targets.length,
    headings: targets.map((t) => t.heading),
  }, "deepen: expanding thin sections");

  const languageName = language === "zh" ? "Chinese" : "English";
  const limit = pLimit(profile.deepenConcurrency);

  const expansions = await Promise.all(
    targets.map((target) =>
      limit(async () => {
        const evidence = selectRelevantEvidence(
          target.heading,
          target.text,
          subagentReports,
          4000,
        );

        if (!evidence) {
          log.info({ heading: target.heading }, "deepen: no relevant evidence, skipping section");
          return null;
        }

        const prompt = DEEPEN_SECTION_PROMPT
          .replace(/{query}/g, userQuery)
          .replace(/{section_heading}/g, target.heading)
          .replace("{current_chars}", String(target.text.length))
          .replace("{current_content}", target.text)
          .replace("{evidence}", evidence)
          .replace("{language}", languageName);

        try {
          const result = await llm.generate({
            role: "synthesis",
            system: "You expand thin sections of research reports with rigorous analysis. Preserve all citations.",
            prompt,
            maxTokens: 8000,
            runId,
            phase: "synthesize",
          });
          return { heading: target.heading, content: result.text.trim() };
        } catch (err) {
          log.warn({ err, heading: target.heading }, "deepen: section expansion failed");
          return null;
        }
      }),
    ),
  );

  let updated = report;
  let appliedCount = 0;
  for (const exp of expansions) {
    if (!exp || !exp.content) continue;
    const next = replaceSection(updated, exp.heading, exp.content);
    if (next !== updated) {
      updated = next;
      appliedCount++;
    } else {
      log.warn({ heading: exp.heading }, "deepen: section heading not found in report, skipped");
    }
  }

  log.info({ appliedCount, finalLength: updated.length }, "deepen: done");
  return updated;
}
