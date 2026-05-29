/**
 * Plan Pipeline Node
 *
 * Extracts the user's intent (objectives, requirements, constraints, sub-questions)
 * and produces a structured research plan. For depth 2-3, runs a preliminary
 * Tavily search first to seed the planner with up-to-date context.
 */

import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import type { PipelineContext, ResearchPlan } from "../context";
import { PLANNER_PROMPT, PLANNER_SYSTEM_PROMPT } from "../../agents/prompts";
import { parseJsonFromText } from "../../utils/parse-json";
import { pipelineLogger } from "../../logger";
import { formatResearchBriefForPrompt } from "../../intent/clarifier";

function normalizePlan(raw: unknown): ResearchPlan {
  const r = (raw ?? {}) as Record<string, unknown>;

  const dimensions = Array.isArray(r.dimensions)
    ? (r.dimensions as unknown[]).map(String).filter(Boolean)
    : [];

  let outputStructure: string[];
  if (Array.isArray(r.outputStructure)) {
    outputStructure = (r.outputStructure as unknown[]).map(String).filter(Boolean);
  } else if (typeof r.outputStructure === "string" && r.outputStructure.trim()) {
    // Backward-compat: some older models may return a string
    outputStructure = r.outputStructure.split(/\n+/).map((s) => s.replace(/^[-*\s]+/, "").trim()).filter(Boolean);
  } else {
    outputStructure = dimensions.slice();
  }

  const methodology = typeof r.methodology === "string" ? r.methodology : "";

  const reqRaw = (r.requirements ?? {}) as Record<string, unknown>;
  const scope = (reqRaw.scopeConstraints ?? {}) as Record<string, unknown>;

  return {
    dimensions,
    outputStructure,
    methodology,
    requirements: {
      coreObjectives: Array.isArray(reqRaw.coreObjectives)
        ? (reqRaw.coreObjectives as unknown[]).map(String).filter(Boolean)
        : [],
      explicitRequirements: Array.isArray(reqRaw.explicitRequirements)
        ? (reqRaw.explicitRequirements as unknown[]).map(String).filter(Boolean)
        : [],
      scopeConstraints: {
        region: typeof scope.region === "string" ? scope.region : undefined,
        time: typeof scope.time === "string" ? scope.time : undefined,
        target: typeof scope.target === "string" ? scope.target : undefined,
      },
      subQuestions: Array.isArray(reqRaw.subQuestions)
        ? (reqRaw.subQuestions as unknown[]).map(String).filter(Boolean)
        : [],
    },
  };
}

export function createPlanNode(
  llm: LLMClient,
  search: TavilySearchProvider | null,
  profile: DepthProfile,
) {
  return async function planNode(ctx: PipelineContext): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);
    log.info({ query: ctx.userQuery }, "plan: start");

    let searchContextBlock = "";
    if (profile.plannerUseReact && search) {
      try {
        const results = await search.search(ctx.userQuery, {
          maxResults: 5,
          includeAnswer: true,
        });
        const lines = results
          .map((r) => `- [${r.title}](${r.url}): ${r.snippet}`)
          .join("\n");
        searchContextBlock = `\nBackground search results (for orientation only — do not cite):\n${lines}\n`;
        log.info({ resultCount: results.length }, "plan: preliminary search done");
      } catch (err) {
        log.warn({ err }, "plan: preliminary search failed");
      }
    }

    const language = ctx.outputLanguage === "zh" ? "Chinese" : "English";
    const briefBlock = ctx.researchBrief
      ? `\nResearch brief confirmed by the user:\n${formatResearchBriefForPrompt(ctx.researchBrief)}\n`
      : "";
    const prompt = PLANNER_PROMPT
      .replace("{query}", ctx.researchBrief?.refinedQuestion ?? ctx.userQuery)
      .replace("{language}", language)
      .replace("{search_context}", `${briefBlock}${searchContextBlock}`);

    log.debug({ prompt }, "plan: generated prompt");

    const result = await llm.generate({
      role: "planner",
      system: PLANNER_SYSTEM_PROMPT,
      prompt,
      runId: ctx.runId,
      phase: "plan",
    });

    const plan = normalizePlan(parseJsonFromText(result.text));
    log.debug({ plan }, "plan: full result");
    log.info({
      dimensions: plan.dimensions.length,
      sections: plan.outputStructure.length,
      coreObjectives: plan.requirements.coreObjectives,
      subQuestions: plan.requirements.subQuestions.length,
    }, "plan: done");

    return { ...ctx, plan };
  };
}
