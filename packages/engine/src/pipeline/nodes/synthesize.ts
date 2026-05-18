/**
 * Synthesize Pipeline Node
 *
 * Combines all subagent reports into a single comprehensive research report.
 * Uses the plan's outputStructure as a MANDATORY section list and propagates
 * user requirements directly into the prompt. Does NOT post-process or append
 * content after the fact — synthesis is the single authoritative step for
 * producing the final report structure.
 */

import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import {
  SYNTHESIS_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
} from "../../agents/prompts";
import { compressReports } from "../../utils/compress-report";
import { formatRequirements } from "../../utils/format-requirements";
import { deepenReport } from "./deepen";
import { pipelineLogger } from "../../logger";

const END_MARKER = "<<END_OF_REPORT>>";
const MIN_VIABLE_REPORT_CHARS = 500;

function looksTruncated(report: string): boolean {
  if (!report.trim()) return false;
  if (report.includes(END_MARKER)) return false;
  return !report.match(/[.!?。！？]\s*$/);
}

function stripEndMarker(report: string): string {
  return report.replace(new RegExp(`\\s*${END_MARKER}\\s*$`), "").trimEnd();
}

export function createSynthesizeNode(
  llm: LLMClient,
  profile: DepthProfile,
) {
  return async function synthesizeNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);
    log.info({ reportCount: ctx.subagentReports.length }, "synthesize: start");

    const reportsText = compressReports(
      ctx.subagentReports,
      ctx.subtasks,
      profile.maxInputChars,
    );

    const language = ctx.outputLanguage === "zh" ? "Chinese" : "English";
    const outputStructure = ctx.plan?.outputStructure?.length
      ? ctx.plan.outputStructure.map((s) => `- ${s}`).join("\n")
      : "- (use natural sections derived from the sub-reports)";
    const requirementsBlock = formatRequirements(ctx.plan?.requirements);

    const prompt = SYNTHESIS_PROMPT
      .replace("{query}", ctx.userQuery)
      .replace(/{language}/g, language)
      .replace("{methodology}", ctx.plan?.methodology ?? "")
      .replace("{requirements}", requirementsBlock)
      .replace("{output_structure}", outputStructure)
      .replace("{reports}", reportsText);

    log.debug({ prompt: prompt.slice(0, 2000), inputReportsChars: reportsText.length }, "synthesize: prompt prepared");

    let report = await llm.stream({
      role: "synthesis",
      system: SYNTHESIS_SYSTEM_PROMPT,
      prompt,
      maxTokens: 30000,
      runId: ctx.runId,
      phase: "synthesize",
    });
    log.info({ length: report.length }, "synthesize: main report generated");

    // If the main stream returned almost nothing, the provider may have
    // rejected the prompt (e.g. mimo gateway returning a "high risk" template
    // with 0 output tokens). Retry once before falling back to continuation.
    if (report.length < MIN_VIABLE_REPORT_CHARS) {
      log.warn({
        length: report.length,
        preview: report.slice(0, 200),
      }, "synthesize: main report suspiciously short, retrying once");
      const retry = await llm.stream({
        role: "synthesis",
        system: SYNTHESIS_SYSTEM_PROMPT,
        prompt,
        maxTokens: 30000,
        runId: ctx.runId,
        phase: "synthesize",
      });
      log.info({ length: retry.length, firstAttempt: report.length }, "synthesize: retry done");
      if (retry.length > report.length) {
        report = retry;
      }
    }

    // Only continue truncated reports when the body is large enough to be
    // genuinely "in progress". If the main call essentially failed, do NOT
    // ask the model to continue from a garbage tail — it will hallucinate.
    if (report.length >= MIN_VIABLE_REPORT_CHARS) {
      for (let i = 0; i < profile.continuationMaxRounds; i++) {
        if (!looksTruncated(report)) break;
        log.info({ round: i + 1 }, "synthesize: continuing truncated report");
        const continuationPrompt = [
          `You are continuing an in-progress research report.`,
          ``,
          `Research topic: ${ctx.userQuery}`,
          `Output language: ${language}`,
          `Expected sections still to address (skip ones already covered above):`,
          outputStructure,
          ``,
          `Report so far (last 800 chars — pick up exactly from here):`,
          `...${report.slice(-800)}`,
          ``,
          `Continue seamlessly. Do not repeat content. Do not add a new title. Preserve [src: <url>] citations. End with <<END_OF_REPORT>> when finished.`,
        ].join("\n");

        const continuation = await llm.stream({
          role: "synthesis",
          system: SYNTHESIS_SYSTEM_PROMPT,
          prompt: continuationPrompt,
          maxTokens: 10000,
          runId: ctx.runId,
          phase: "synthesize",
        });
        if (continuation.length < 50) {
          log.warn({ length: continuation.length }, "synthesize: continuation returned almost nothing, stopping");
          break;
        }
        report += continuation;
        log.info({ length: report.length }, "synthesize: continuation done");
      }
    } else {
      log.warn({
        length: report.length,
      }, "synthesize: skipping continuation — main output too short, would amplify garbage");
    }

    report = stripEndMarker(report);

    // Expand thin body sections in-place using evidence from sub-agent reports.
    // Runs here (inside synthesize) — not as a separate pipeline node — so the
    // final report exits synthesize complete. Conclusion/references headings are
    // excluded from deepening inside deepenReport().
    if (profile.deepenThinSections && report.length > 500) {
      report = await deepenReport(
        report,
        ctx.subagentReports,
        ctx.userQuery,
        ctx.outputLanguage,
        profile,
        llm,
        ctx.runId,
      );
    }

    log.info({ finalLength: report.length }, "synthesize: done");
    return { ...ctx, report };
  };
}
