/**
 * Synthesize Pipeline Node
 *
 * Combines all subagent reports into a single comprehensive report
 * using the LLM, with continuation support for long outputs.
 */

import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import { SYNTHESIS_PROMPT } from "../../agents/prompts";
import { pipelineLogger } from "../../logger";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSynthesizeNode(
  llm: LLMClient,
  profile: DepthProfile,
) {
  return async function synthesizeNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);
    log.info({ reportCount: ctx.subagentReports.length }, "synthesize: start");

    const reports = ctx.subagentReports
      .map((r) => `## Subtask: ${r.subtaskId}\n\n${r.report}`)
      .join("\n\n---\n\n");

    const prompt = SYNTHESIS_PROMPT
      .replace(/{query}/g, ctx.userQuery)
      .replace(/{language}/g, ctx.outputLanguage === "zh" ? "Chinese" : "English")
      .replace("{reports}", reports);

    log.debug({ prompt, inputReports: reports.length }, "synthesize: full prompt");

    // Main synthesis
    const fullReport = await llm.stream({
      role: "synthesis",
      system: "You are a research synthesizer. Write comprehensive reports.",
      prompt,
      maxTokens: 30000,
      runId: ctx.runId,
      phase: "synthesize",
    });

    let report = fullReport;
    log.debug({ report: report.slice(0, 1000) }, "synthesize: main report preview");
    log.info({ length: report.length }, "synthesize: main report generated");

    // Continue if truncated (up to continuationMaxRounds)
    for (let i = 0; i < profile.continuationMaxRounds; i++) {
      if (report.length > 0 && !report.match(/[.!?。！？]\s*$/)) {
        log.info({ round: i + 1 }, "synthesize: continuing truncated report");
        const continuePrompt = `Continue the following report seamlessly from where it left off. Do not repeat any content:\n\n${report.slice(-500)}`;
        log.debug({ continuePrompt }, "synthesize: continuation prompt");
        const continuation = await llm.stream({
          role: "synthesis",
          system:
            "Continue the report. Do not add headers or repetition.",
          prompt: continuePrompt,
          maxTokens: 10000,
          runId: ctx.runId,
          phase: "synthesize",
        });
        report += continuation;
        log.debug({ continuation: continuation.slice(0, 500) }, "synthesize: continuation preview");
        log.info({ length: report.length }, "synthesize: continuation done");
      } else {
        break;
      }
    }

    log.info({ finalLength: report.length }, "synthesize: done");
    return { ...ctx, report };
  };
}
