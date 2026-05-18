/**
 * Split Pipeline Node
 *
 * Decomposes the research plan into parallel sub-tasks, propagating user
 * requirements, boundaries, and source-type hints into each sub-task so the
 * downstream sub-agent always knows the user's original intent.
 *
 * Depth 1: direct mapping (no LLM call).
 * Depth 2-3: LLM splitter with boundary + non-overlap rules.
 */

import { randomUUID } from "node:crypto";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, Subtask } from "../context";
import { SPLITTER_PROMPT, SPLITTER_SYSTEM_PROMPT } from "../../agents/prompts";
import { parseJsonFromText } from "../../utils/parse-json";
import { formatRequirements } from "../../utils/format-requirements";
import { pipelineLogger } from "../../logger";

function dimensionsToSubtasks(dimensions: string[]): Subtask[] {
  return dimensions.map((dim) => ({
    id: randomUUID(),
    instruction: `Research: ${dim}`,
    keywords: [dim],
    dimension: dim,
  }));
}

export function createSplitNode(
  llm: LLMClient,
  profile: DepthProfile,
) {
  return async function splitNode(ctx: PipelineContext): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);
    const dimensions = ctx.plan?.dimensions;
    if (!dimensions || dimensions.length === 0) {
      log.warn("split: no dimensions, returning empty subtasks");
      return { ...ctx, subtasks: [] };
    }

    if (!profile.useSplitter) {
      log.info({ dimensionCount: dimensions.length }, "split: direct mapping (depth 1)");
      return { ...ctx, subtasks: dimensionsToSubtasks(dimensions) };
    }

    const language = ctx.outputLanguage === "zh" ? "Chinese" : "English";
    const requirementsBlock = ctx.plan?.requirements
      ? formatRequirements(ctx.plan.requirements)
      : "(none)";

    const prompt = SPLITTER_PROMPT
      .replace("{query}", ctx.userQuery)
      .replace("{language}", language)
      .replace("{dimensions}", dimensions.map((d) => `- ${d}`).join("\n"))
      .replace("{requirements}", requirementsBlock);

    log.debug({ prompt }, "split: generated prompt");

    try {
      const result = await llm.generate({
        role: "splitter",
        system: SPLITTER_SYSTEM_PROMPT,
        prompt,
        runId: ctx.runId,
        phase: "split",
      });

      const parsed = parseJsonFromText(result.text) as {
        subtasks: Array<{
          instruction: string;
          keywords: string[];
          dimension?: string;
          sourceTypes?: string;
          boundaries?: string;
        }>;
      };
      log.debug({ parsed }, "split: LLM result");

      const subtasks: Subtask[] = (parsed.subtasks ?? []).map((s, i) => ({
        id: randomUUID(),
        instruction: s.instruction ?? `Research: ${dimensions[i] ?? "subtask"}`,
        keywords: Array.isArray(s.keywords) ? s.keywords.filter(Boolean) : [],
        dimension: s.dimension ?? dimensions[i],
        sourceTypes: s.sourceTypes,
        boundaries: s.boundaries,
      }));

      log.info({ subtaskCount: subtasks.length }, "split: done");
      return { ...ctx, subtasks };
    } catch (err) {
      log.warn({ err }, "split: LLM failed, falling back to dimension mapping");
      return { ...ctx, subtasks: dimensionsToSubtasks(dimensions) };
    }
  };
}
