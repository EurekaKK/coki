/**
 * Extract Claims Pipeline Node
 *
 * Parses the synthesized report into sections, uses the LLM to extract
 * factual claims from each section, and matches claims to evidence spans
 * via token-overlap heuristic.
 */

import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import type { PipelineContext, Claim, EvidenceSpan } from "../context";
import type { LLMClient } from "../../llm/client";

const EXTRACT_CLAIMS_PROMPT = `Extract individual factual claims from the following text section.
A claim is a single, verifiable statement that could be checked against a source.
Return a JSON array of strings, each being one claim.
Do NOT extract opinions, transitions, or meta-commentary.
Return ONLY the JSON array, no other text.

Section: {section_heading}
Text: {section_text}`;

export function parseSections(report: string): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  const lines = report.split("\n");
  let currentHeading = "Introduction";
  let currentText = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (currentText.trim()) {
        sections.push({ heading: currentHeading, text: currentText.trim() });
      }
      currentHeading = headingMatch[2]!.trim();
      currentText = "";
    } else {
      currentText += line + "\n";
    }
  }
  if (currentText.trim()) {
    sections.push({ heading: currentHeading, text: currentText.trim() });
  }
  return sections;
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s一-鿿]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function matchClaimToEvidence(
  claimText: string,
  evidenceSpans: EvidenceSpan[],
): Array<{ evidenceSpanId: string; relevanceScore: number }> {
  const claimTokens = tokenize(claimText);
  if (claimTokens.size === 0) return [];

  const scored: Array<{ evidenceSpanId: string; score: number }> = [];
  for (const span of evidenceSpans) {
    const spanTokens = tokenize(span.quote);
    if (spanTokens.size === 0) continue;
    // Jaccard similarity
    let intersection = 0;
    for (const token of claimTokens) {
      if (spanTokens.has(token)) intersection++;
    }
    const union = claimTokens.size + spanTokens.size - intersection;
    const score = union > 0 ? intersection / union : 0;
    if (score > 0.05) {
      scored.push({ evidenceSpanId: span.id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => ({
    evidenceSpanId: s.evidenceSpanId,
    relevanceScore: Math.round(s.score * 100) / 100,
  }));
}

export function createExtractClaimsNode(llm: LLMClient) {
  return async function extractClaimsNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    if (!ctx.report) {
      return { ...ctx, claims: [] };
    }

    const sections = parseSections(ctx.report);
    const evidenceSpans = ctx.evidenceSpans ?? [];
    const limit = pLimit(3);

    const sectionResults = await Promise.all(
      sections
        .filter((s) => s.text.length >= 50)
        .map((section) =>
          limit(async () => {
            const prompt = EXTRACT_CLAIMS_PROMPT
              .replace("{section_heading}", section.heading)
              .replace("{section_text}", section.text.slice(0, 4000));

            try {
              const result = await llm.generate({
                role: "extract-claims",
                prompt,
                maxTokens: 2048,
                runId: ctx.runId,
                phase: "extract-claims",
              });

              const jsonMatch = result.text.match(/\[[\s\S]*\]/);
              if (!jsonMatch) return [];

              const claimTexts: string[] = JSON.parse(jsonMatch[0]);
              return claimTexts
                .filter((t) => typeof t === "string" && t.length >= 10)
                .map((claimText) => ({
                  claimText,
                  sectionHeading: section.heading,
                  evidenceLinks: matchClaimToEvidence(claimText, evidenceSpans),
                }));
            } catch {
              return [];
            }
          }),
        ),
    );

    const allClaims: Claim[] = [];
    let globalIndex = 0;
    for (const sectionClaims of sectionResults) {
      for (const { claimText, sectionHeading, evidenceLinks } of sectionClaims) {
        allClaims.push({
          id: randomUUID(),
          claimText,
          sectionHeading,
          claimIndex: globalIndex++,
          evidenceLinks,
        });
      }
    }

    return { ...ctx, claims: allClaims };
  };
}
