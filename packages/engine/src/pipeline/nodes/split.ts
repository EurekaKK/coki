/**
 * Split Pipeline Node
 *
 * Splits the research plan dimensions into concrete subtasks.
 * For depth 2-3, uses an LLM with structured output to generate
 * keyword-rich subtask instructions. For depth 1, directly maps
 * dimensions to subtasks without an LLM call.
 */

import { Output } from "ai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, Subtask } from "../context";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SubtaskSchema = z.object({
  subtasks: z.array(
    z.object({
      instruction: z.string(),
      keywords: z.array(z.string()),
    }),
  ),
});

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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the split node runner.
 *
 * @param llm     - LLM client for generating subtasks
 * @param profile - Depth profile controlling splitter behavior
 */
export function createSplitNode(
  llm: LLMClient,
  profile: DepthProfile,
) {
  return async function splitNode(ctx: PipelineContext): Promise<PipelineContext> {
    const dimensions = ctx.plan?.dimensions;
    if (!dimensions || dimensions.length === 0) {
      // No plan or empty dimensions -- fall back to empty subtasks
      return { ...ctx, subtasks: [] };
    }

    // Depth 1: direct mapping, no LLM call
    if (!profile.useSplitter) {
      return {
        ...ctx,
        subtasks: dimensionsToSubtasks(dimensions),
      };
    }

    // Depth 2-3: use LLM with structured output
    const prompt = buildSplitterPrompt(ctx.userQuery, dimensions);

    try {
      const result = await llm.generate({
        role: "splitter",
        prompt,
        output: Output.object({ schema: SubtaskSchema }),
      });

      const parsed = result.output as { subtasks: Array<{ instruction: string; keywords: string[] }> };

      const subtasks: Subtask[] = parsed.subtasks.map((s) => ({
        id: randomUUID(),
        instruction: s.instruction,
        keywords: s.keywords,
      }));

      return { ...ctx, subtasks };
    } catch {
      // JSON parse failure or LLM error -- fall back to dimension mapping
      return {
        ...ctx,
        subtasks: dimensionsToSubtasks(dimensions),
      };
    }
  };
}
