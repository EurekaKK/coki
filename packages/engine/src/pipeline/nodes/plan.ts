/**
 * Plan Pipeline Node
 *
 * Generates a research plan (dimensions, output structure, methodology)
 * using the LLM. For depth 2-3, first performs a Tavily search to provide
 * the planner with background context.
 */

import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, ResearchPlan } from "../context";
import { pipelineLogger } from "../../logger";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPlannerPrompt(
  userQuery: string,
  searchContext: string | null,
): string {
  const parts: string[] = [
    `You are a research planner. Given the user's research question, produce a structured research plan.`,
    ``,
    `User question: ${userQuery}`,
  ];

  if (searchContext) {
    parts.push(
      ``,
      `Background search results for context:`,
      searchContext,
    );
  }

  parts.push(
    ``,
    `Respond with a JSON object containing:`,
    `- "dimensions": an array of 1-5 research dimensions (sub-topics to investigate)`,
    `- "outputStructure": a brief description of the desired output format`,
    `- "methodology": a brief description of the research methodology to follow`,
    ``,
    `Output ONLY the JSON object, no other text.`,
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonFromText(text: string): unknown {
  // Try to extract JSON from markdown code blocks or plain text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (jsonMatch?.[1]) {
    return JSON.parse(jsonMatch[1].trim());
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPlanNode(
  llm: LLMClient,
  search: TavilySearchProvider | null,
  profile: DepthProfile,
) {
  return async function planNode(ctx: PipelineContext): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);
    log.info({ query: ctx.userQuery }, "plan: start");

    let searchContext: string | null = null;

    // For depth 2-3, perform a preliminary search to seed the planner
    if (profile.plannerUseReact && search) {
      try {
        const results = await search.search(ctx.userQuery, {
          maxResults: 5,
          includeAnswer: true,
        });
        searchContext = results
          .map((r) => `[${r.title}](${r.url}): ${r.snippet}`)
          .join("\n");
        log.info({ resultCount: results.length }, "plan: preliminary search done");
      } catch (err) {
        log.warn({ err }, "plan: preliminary search failed");
        searchContext = null;
      }
    }

    const prompt = buildPlannerPrompt(ctx.userQuery, searchContext);
    log.debug({ prompt }, "plan: generated prompt");

    const result = await llm.generate({
      role: "planner",
      prompt,
      runId: ctx.runId,
      phase: "plan",
    });

    const plan = parseJsonFromText(result.text) as ResearchPlan;
    log.debug({ plan }, "plan: full result");
    log.info({ dimensions: plan.dimensions.length }, "plan: done");

    return {
      ...ctx,
      plan,
    };
  };
}
