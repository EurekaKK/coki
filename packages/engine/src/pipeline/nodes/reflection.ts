/**
 * Reflection Pipeline Node
 *
 * Evaluates research quality and decides whether to proceed,
 * refine with additional subtasks, or accept as sufficient.
 */

import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import { REFLECTION_PROMPT } from "../../agents/prompts";
import { randomUUID } from "node:crypto";
import { pipelineLogger } from "../../logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReflectionResult {
  scores: {
    comprehensiveness: number;
    insight: number;
    evidence: number;
    instruction_following: number;
  };
  overall_score: number;
  gaps: string[];
  recommendation: "proceed" | "refine" | "sufficient";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonFromText(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (jsonMatch?.[1]) {
    return JSON.parse(jsonMatch[1].trim());
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReflectionNode(llm: LLMClient) {
  return async function reflectionNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);

    if (ctx.iterationCount >= ctx.maxIterations) {
      log.info({ iteration: ctx.iterationCount }, "reflection: max iterations reached, marking complete");
      return { ...ctx, researchComplete: true };
    }

    log.info({
      iteration: ctx.iterationCount,
      reportCount: ctx.subagentReports.length,
    }, "reflection: evaluating research quality");

    const reportsSummary = ctx.subagentReports
      .map((r) => `Subtask ${r.subtaskId}:\n${r.report.slice(0, 500)}...`)
      .join("\n\n");

    const prompt = REFLECTION_PROMPT
      .replace("{reports_summary}", reportsSummary)
      .replace("{query}", ctx.userQuery);

    log.debug({ prompt, reportsSummary }, "reflection: full prompt");

    try {
      const result = await llm.generate({
        role: "reflection",
        system: "You are a research quality evaluator. Output valid JSON only.",
        prompt,
        runId: ctx.runId,
        phase: "reflection",
      });

      const reflection = parseJsonFromText(result.text) as ReflectionResult;
      log.debug({ reflection }, "reflection: full LLM result");
      const qualityScore = reflection.overall_score / 10;

      log.info({
        scores: reflection.scores,
        overallScore: reflection.overall_score,
        recommendation: reflection.recommendation,
        gaps: reflection.gaps,
      }, "reflection: evaluation result");

      if (
        qualityScore >= ctx.qualityThreshold ||
        reflection.recommendation === "sufficient"
      ) {
        log.info({ qualityScore }, "reflection: quality sufficient, marking complete");
        return { ...ctx, qualityScore, researchComplete: true };
      }

      // If gaps found and we haven't exceeded max iterations, create new subtasks
      if (
        reflection.gaps.length > 0 &&
        ctx.iterationCount < ctx.maxIterations
      ) {
        const newSubtasks = reflection.gaps.slice(0, 3).map((gap) => ({
          id: randomUUID(),
          instruction: `Address this research gap: ${gap}`,
          keywords: gap.split(/[，,、\s]+/).filter(Boolean),
        }));

        log.info({ newSubtaskCount: newSubtasks.length }, "reflection: adding gap subtasks");
        return {
          ...ctx,
          qualityScore,
          subtasks: [...ctx.subtasks, ...newSubtasks],
        };
      }

      return { ...ctx, qualityScore, researchComplete: true };
    } catch (err) {
      log.error({ err }, "reflection: evaluation failed, proceeding to synthesis");
      return { ...ctx, researchComplete: true };
    }
  };
}
