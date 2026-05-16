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
    const reports = ctx.subagentReports
      .map((r) => `## Subtask: ${r.subtaskId}\n\n${r.report}`)
      .join("\n\n---\n\n");

    const prompt = SYNTHESIS_PROMPT
      .replace(/{query}/g, ctx.userQuery)
      .replace(/{language}/g, ctx.outputLanguage === "zh" ? "Chinese" : "English")
      .replace("{reports}", reports);

    // Main synthesis
    const fullReport = await llm.stream({
      role: "synthesis",
      system: "You are a research synthesizer. Write comprehensive reports.",
      prompt,
      maxTokens: 30000,
    });

    let report = fullReport;

    // Continue if truncated (up to continuationMaxRounds)
    for (let i = 0; i < profile.continuationMaxRounds; i++) {
      if (report.length > 0 && !report.match(/[.!?。！？]\s*$/)) {
        const continuePrompt = `Continue the following report seamlessly from where it left off. Do not repeat any content:\n\n${report.slice(-500)}`;
        const continuation = await llm.stream({
          role: "synthesis",
          system:
            "Continue the report. Do not add headers or repetition.",
          prompt: continuePrompt,
          maxTokens: 10000,
        });
        report += continuation;
      } else {
        break;
      }
    }

    return { ...ctx, report };
  };
}
