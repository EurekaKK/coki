/**
 * Split Pipeline Node
 *
 * Splits the research plan dimensions into concrete subtasks.
 * For depth 2-3, uses an LLM to generate keyword-rich subtask instructions.
 * For depth 1, directly maps dimensions to subtasks without an LLM call.
 */

import { randomUUID } from "node:crypto";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, Subtask } from "../context";
import { pipelineLogger } from "../../logger";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSplitterPrompt(
  userQuery: string,
  dimensions: string[],
): string {
  return [
    `You are a research task splitter. Given a research question and a list of dimensions, produce a list of concrete subtasks.`,
    ``,
    `Research question: ${userQuery}`,
    `Dimensions: ${dimensions.join(", ")}`,
    ``,
    `Respond with a JSON object containing:`,
    `- "subtasks": an array of objects, each with:`,
    `  - "instruction": a clear, actionable research instruction`,
    `  - "keywords": an array of 2-5 search keywords for this subtask`,
    ``,
    `Each dimension should map to one subtask. Do not merge or split dimensions.`,
    ``,
    `Output ONLY the JSON object, no other text.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dimensionsToSubtasks(dimensions: string[]): Subtask[] {
  return dimensions.map((dim) => ({
    id: randomUUID(),
    instruction: `Research: ${dim}`,
    keywords: [dim],
  }));
}

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

    // Depth 1: direct mapping, no LLM call
    if (!profile.useSplitter) {
      log.info({ dimensionCount: dimensions.length }, "split: direct mapping (depth 1)");
      return {
        ...ctx,
        subtasks: dimensionsToSubtasks(dimensions),
      };
    }

    // Depth 2-3: use LLM
    log.info({ dimensionCount: dimensions.length }, "split: using LLM splitter");
    const prompt = buildSplitterPrompt(ctx.userQuery, dimensions);
    log.debug({ prompt }, "split: generated prompt");

    try {
      const result = await llm.generate({
        role: "splitter",
        prompt,
        runId: ctx.runId,
        phase: "split",
      });

      const parsed = parseJsonFromText(result.text) as { subtasks: Array<{ instruction: string; keywords: string[] }> };
      log.debug({ parsed }, "split: LLM result");

      const subtasks: Subtask[] = parsed.subtasks.map((s) => ({
        id: randomUUID(),
        instruction: s.instruction,
        keywords: s.keywords,
      }));

      log.info({ subtaskCount: subtasks.length }, "split: done");
      return { ...ctx, subtasks };
    } catch (err) {
      log.warn({ err }, "split: LLM failed, falling back to dimension mapping");
      return {
        ...ctx,
        subtasks: dimensionsToSubtasks(dimensions),
      };
    }
  };
}
