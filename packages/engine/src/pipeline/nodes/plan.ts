/**
 * Plan Pipeline Node
 *
 * Generates a research plan (dimensions, output structure, methodology)
 * using the LLM. For depth 2-3, first performs a Tavily search to provide
 * the planner with background context.
 */

import { Output } from "ai";
import { z } from "zod";
import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, ResearchPlan } from "../context";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  dimensions: z.array(z.string()).min(1),
  outputStructure: z.string(),
  methodology: z.string(),
});

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
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the plan node runner.
 *
 * @param llm   - LLM client for generating the plan
 * @param search - Tavily provider (null when API key is absent)
 * @param profile - Depth profile controlling planner behavior
 */
export function createPlanNode(
  llm: LLMClient,
  search: TavilySearchProvider | null,
  profile: DepthProfile,
) {
  return async function planNode(ctx: PipelineContext): Promise<PipelineContext> {
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
      } catch {
        // Search failure is non-fatal; proceed without context
        searchContext = null;
      }
    }

    const prompt = buildPlannerPrompt(ctx.userQuery, searchContext);

    const result = await llm.generate({
      role: "planner",
      prompt,
      output: Output.object({ schema: PlanSchema }),
    });

    const plan = result.output as ResearchPlan;

    return {
      ...ctx,
      plan,
    };
  };
}
