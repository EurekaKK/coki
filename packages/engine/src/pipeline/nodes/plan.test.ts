import { describe, it, expect, beforeAll } from "vitest";
import { createPlanNode } from "./plan";
import { createTestLLMClient, createTestSearch } from "../../test-utils/helper";
import { ConfigManager } from "../../config/config";
import type { PipelineContext } from "../context";

function makeCtx(query: string): PipelineContext {
  return {
    runId: "test-plan",
    userQuery: query,
    depth: 2,
    outputLanguage: "zh",
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
    subagentReports: [],
    sources: new Map(),
    iterationCount: 0,
    maxIterations: 2,
    qualityScore: 0,
    qualityThreshold: 0.7,
    researchComplete: false,
    report: null,
    citedReport: null,
    evidenceSpans: [],
    claims: [],
  };
}

describe("Plan Node", () => {
  const llm = (() => {
    try {
      return createTestLLMClient();
    } catch {
      return null;
    }
  })();
  const search = createTestSearch();
  const config = new ConfigManager({});
  const profile = config.getDepthProfile(2);

  it("produces a plan with dimensions, outputStructure, methodology", async () => {
    if (!llm) return;
    const node = createPlanNode(llm, search, profile);
    const ctx = await node(makeCtx("量子计算的最新进展"));

    expect(ctx.plan).not.toBeNull();
    expect(ctx.plan!.dimensions).toBeInstanceOf(Array);
    expect(ctx.plan!.dimensions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.plan!.outputStructure).toBeTruthy();
    expect(ctx.plan!.methodology).toBeTruthy();
  });

  it("works without Tavily search (depth 1)", async () => {
    if (!llm) return;
    const profile1 = config.getDepthProfile(1);
    const node = createPlanNode(llm, null, profile1);
    const ctx = await node(makeCtx("人工智能发展史"));

    expect(ctx.plan).not.toBeNull();
    expect(ctx.plan!.dimensions.length).toBeGreaterThanOrEqual(1);
  });

  it("includes a confirmed research brief in the planner prompt", async () => {
    const prompts: string[] = [];
    const fakeLlm = {
      generate: async (opts: { prompt: string }) => {
        prompts.push(opts.prompt);
        return {
          text: JSON.stringify({
            dimensions: ["技术演进", "商业落地"],
            outputStructure: ["技术演进", "商业落地", "结论"],
            methodology: "基于确认后的研究设定进行规划",
            requirements: {
              coreObjectives: ["分析 AI Agent 趋势"],
              explicitRequirements: ["覆盖技术与商业"],
              scopeConstraints: {
                region: "global",
                time: "2024-2026",
                target: "AI Agent",
              },
              subQuestions: ["技术路线如何变化？"],
            },
          }),
        };
      },
    };
    const node = createPlanNode(fakeLlm as any, null, config.getDepthProfile(1));
    const ctx = await node({
      ...makeCtx("研究 AI Agent 的发展趋势"),
      researchBrief: {
        originalQuery: "研究 AI Agent 的发展趋势",
        refinedQuestion: "研究 2024-2026 年 AI Agent 在技术演进和商业落地上的发展趋势",
        objective: "survey",
        audience: "business",
        scope: { region: "global", timeRange: "2024-2026", target: "AI Agent" },
        sourcePreferences: ["industry", "official"],
        outputTemplate: "market_analysis",
        mustInclude: ["商业案例"],
        exclude: ["纯概念介绍"],
        assumptions: ["默认覆盖中美案例"],
      },
    });

    expect(ctx.plan).not.toBeNull();
    expect(prompts[0]).toContain("Research brief confirmed by the user");
    expect(prompts[0]).toContain("Refined question: 研究 2024-2026 年 AI Agent");
    expect(prompts[0]).toContain("Audience: business");
  });
});
