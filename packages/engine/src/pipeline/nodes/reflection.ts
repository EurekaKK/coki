/**
 * Reflection Pipeline Node
 *
 * Audits subagent reports against the plan and the user's requirements.
 * Scores each dimension on 4 axes, runs compliance and depth checks,
 * and generates focused gap subtasks when quality is insufficient.
 */

import { randomUUID } from "node:crypto";
import type { PipelineContext, Subtask } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import {
  REFLECTION_PROMPT,
  REFLECTION_SYSTEM_PROMPT,
} from "../../agents/prompts";
import { parseJsonFromText } from "../../utils/parse-json";
import { compressReports } from "../../utils/compress-report";
import { formatRequirements } from "../../utils/format-requirements";
import { pipelineLogger } from "../../logger";

interface DimensionScore {
  comprehensiveness: number;
  insight: number;
  evidence: number;
  instruction_following: number;
}

interface ReflectionGap {
  gap_type: "task_compliance" | "depth" | "low_score";
  dimension?: string;
  gap_detail: string;
  expected_score_improvement?: number;
  suggested_queries?: string[];
  instruction?: string;
}

interface ReflectionResult {
  dimension_scores: Record<string, DimensionScore>;
  overall_score: number;
  research_complete: boolean;
  gaps: ReflectionGap[];
}

const MIN_IMPROVEMENT_GATE = 0.08;

export function createReflectionNode(llm: LLMClient, profile: DepthProfile) {
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

    const reportsText = compressReports(
      ctx.subagentReports,
      ctx.subtasks,
      profile.maxInputChars,
    );

    // Hard-coded thin-report detection: if any subagent report is below the
    // minimum viable length, flag it as a forced gap BEFORE calling the LLM.
    // The LLM tends to over-score fallback reports that are technically coherent
    // but underdeveloped. We need objective enforcement.
    const THIN_CHARS = ctx.depth === 3 ? 3000 : ctx.depth === 2 ? 2000 : 0;
    const forcedGaps: Subtask[] = [];
    if (THIN_CHARS > 0) {
      for (const report of ctx.subagentReports) {
        if (report.report.length < THIN_CHARS) {
          const subtask = ctx.subtasks.find((s) => s.id === report.subtaskId);
          if (subtask) {
            log.warn({
              subtaskId: report.subtaskId,
              reportLength: report.report.length,
              threshold: THIN_CHARS,
            }, "reflection: thin subagent report — forcing gap subtask");
            forcedGaps.push({
              id: randomUUID(),
              instruction: `The previous research on "${subtask.instruction.slice(0, 120)}" produced insufficient content (${report.report.length} chars). Conduct a deeper, more targeted investigation. Find specific data points, benchmarks, or primary sources that were missed. Target at least 800 words of analytical prose.`,
              keywords: subtask.keywords,
              dimension: subtask.dimension,
              boundaries: subtask.boundaries,
              sourceTypes: subtask.sourceTypes,
            });
          }
        }
      }
    }

    const dimensions = ctx.plan?.dimensions ?? [];
    const requirementsBlock = formatRequirements(ctx.plan?.requirements);

    // Tell the LLM about thin reports as hard facts so it doesn't over-score them
    const thinReportFacts = ctx.subagentReports
      .filter((r) => THIN_CHARS > 0 && r.report.length < THIN_CHARS)
      .map((r) => {
        const subtask = ctx.subtasks.find((s) => s.id === r.subtaskId);
        return `- "${subtask?.dimension ?? r.subtaskId}": only ${r.report.length} chars — MUST be scored low on comprehensiveness and insight`;
      })
      .join("\n");

    const thinFactsBlock = thinReportFacts
      ? `\nHARD FACTS (these override your judgment):\n${thinReportFacts}\n`
      : "";

    const prompt = REFLECTION_PROMPT
      .replace("{query}", ctx.userQuery)
      .replace("{methodology}", ctx.plan?.methodology ?? "")
      .replace("{dimensions}", dimensions.map((d) => `- ${d}`).join("\n"))
      .replace("{requirements}", requirementsBlock)
      .replace("{reports}", reportsText)
      .replace(/{quality_threshold}/g, ctx.qualityThreshold.toFixed(2))
      + thinFactsBlock;

    log.debug({ prompt, reportsLength: reportsText.length }, "reflection: full prompt");

    try {
      const result = await llm.generate({
        role: "reflection",
        system: REFLECTION_SYSTEM_PROMPT,
        prompt,
        runId: ctx.runId,
        phase: "reflection",
      });

      const reflection = parseJsonFromText(result.text) as ReflectionResult;
      log.debug({ reflection }, "reflection: full LLM result");

      const overallScore = typeof reflection.overall_score === "number"
        ? reflection.overall_score
        : 0;
      const qualityScore = overallScore > 1 ? overallScore / 10 : overallScore;

      log.info({
        dimensionScores: reflection.dimension_scores,
        overallScore,
        normalized: qualityScore,
        gapCount: reflection.gaps?.length ?? 0,
        researchComplete: reflection.research_complete,
      }, "reflection: evaluation result");

      // Min-improvement gate: if this iteration didn't improve much, stop
      const improvement = qualityScore - ctx.qualityScore;
      if (
        ctx.iterationCount > 0 &&
        improvement < MIN_IMPROVEMENT_GATE &&
        improvement >= 0
      ) {
        log.info({ improvement }, "reflection: improvement below gate, marking complete");
        return { ...ctx, qualityScore, researchComplete: true };
      }

      // Forced gaps from thin-report detection override the LLM's "complete" verdict
      const hasForcedGaps = forcedGaps.length > 0 && ctx.iterationCount < ctx.maxIterations - 1;

      if ((reflection.research_complete || qualityScore >= ctx.qualityThreshold) && !hasForcedGaps) {
        log.info({ qualityScore }, "reflection: quality sufficient, marking complete");
        return { ...ctx, qualityScore, researchComplete: true };
      }

      if (reflection.research_complete && hasForcedGaps) {
        log.info({
          qualityScore,
          forcedGapCount: forcedGaps.length,
        }, "reflection: LLM said complete but forced gaps exist — continuing");
      }

      const llmGaps = (reflection.gaps ?? [])
        .filter((g) => g && typeof g.gap_detail === "string" && g.gap_detail.trim())
        .filter((g) =>
          g.expected_score_improvement === undefined ||
          g.expected_score_improvement >= 0.1,
        )
        .slice(0, 3);

      const llmSubtasks: Subtask[] = llmGaps.map((gap) => ({
        id: randomUUID(),
        instruction:
          gap.instruction ??
          `Address research gap (${gap.gap_type}) in dimension "${gap.dimension ?? "unspecified"}": ${gap.gap_detail}`,
        keywords:
          gap.suggested_queries?.flatMap((q) => q.split(/\s+/)).filter((w) => w.length > 1) ??
          gap.gap_detail.split(/[，,、\s]+/).filter(Boolean),
        dimension: gap.dimension,
        boundaries: undefined,
      }));

      // Deduplicate: don't add a forced gap for a dimension already covered by LLM gaps
      const llmDimensions = new Set(llmSubtasks.map((s) => s.dimension).filter(Boolean));
      const dedupedForcedGaps = forcedGaps.filter(
        (s) => !s.dimension || !llmDimensions.has(s.dimension),
      );

      const newSubtasks = [...llmSubtasks, ...dedupedForcedGaps];

      if (newSubtasks.length === 0) {
        log.info("reflection: no usable gaps, marking complete");
        return { ...ctx, qualityScore, researchComplete: true };
      }

      log.info({
        llmGapCount: llmSubtasks.length,
        forcedGapCount: dedupedForcedGaps.length,
        totalNewSubtasks: newSubtasks.length,
      }, "reflection: adding gap subtasks");

      return {
        ...ctx,
        qualityScore,
        subtasks: [...ctx.subtasks, ...newSubtasks],
      };
    } catch (err) {
      log.error({ err }, "reflection: evaluation failed, proceeding to synthesis");
      return { ...ctx, researchComplete: true };
    }
  };
}
