/**
 * Reflection Pipeline Node
 *
 * Evaluates research quality and decides whether to proceed,
 * refine with additional subtasks, or accept as sufficient.
 */

import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import { REFLECTION_PROMPT } from "../../agents/prompts";
import { Output } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ReflectionResultSchema = z.object({
  scores: z.object({
    comprehensiveness: z.number(),
    insight: z.number(),
    evidence: z.number(),
    instruction_following: z.number(),
  }),
  overall_score: z.number(),
  gaps: z.array(z.string()),
  recommendation: z.enum(["proceed", "refine", "sufficient"]),
});

type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReflectionNode(llm: LLMClient) {
  return async function reflectionNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    if (ctx.iterationCount >= ctx.maxIterations) {
      return { ...ctx, researchComplete: true };
    }

    const reportsSummary = ctx.subagentReports
      .map((r) => `Subtask ${r.subtaskId}:\n${r.report.slice(0, 500)}...`)
      .join("\n\n");

    const prompt = REFLECTION_PROMPT
      .replace("{reports_summary}", reportsSummary)
      .replace("{query}", ctx.userQuery);

    try {
      const result = await llm.generate({
        role: "reflection",
        system:
          "You are a research quality evaluator. Output valid JSON only.",
        prompt,
        output: Output.object({ schema: ReflectionResultSchema }),
      });

      const reflection = result.output as ReflectionResult;
      const qualityScore = reflection.overall_score / 10;

      if (
        qualityScore >= ctx.qualityThreshold ||
        reflection.recommendation === "sufficient"
      ) {
        return { ...ctx, qualityScore, researchComplete: true };
      }

      // If gaps found and we haven't exceeded max iterations, create new subtasks
      if (
        reflection.gaps.length > 0 &&
        ctx.iterationCount < ctx.maxIterations
      ) {
        const newSubtasks = reflection.gaps.slice(0, 3).map((gap) => ({
          id: crypto.randomUUID(),
          instruction: `Address this research gap: ${gap}`,
          keywords: gap.split(/[，,、\s]+/).filter(Boolean),
        }));

        return {
          ...ctx,
          qualityScore,
          subtasks: [...ctx.subtasks, ...newSubtasks],
        };
      }

      return { ...ctx, qualityScore, researchComplete: true };
    } catch {
      // If reflection fails, proceed to synthesis
      return { ...ctx, researchComplete: true };
    }
  };
}
