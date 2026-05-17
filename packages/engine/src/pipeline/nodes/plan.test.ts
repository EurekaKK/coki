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
  };
}

describe("Plan Node", () => {
  const llm = createTestLLMClient();
  const search = createTestSearch();
  const config = new ConfigManager({});
  const profile = config.getDepthProfile(2);

  it("produces a plan with dimensions, outputStructure, methodology", async () => {
    const node = createPlanNode(llm, search, profile);
    const ctx = await node(makeCtx("量子计算的最新进展"));

    expect(ctx.plan).not.toBeNull();
    expect(ctx.plan!.dimensions).toBeInstanceOf(Array);
    expect(ctx.plan!.dimensions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.plan!.outputStructure).toBeTruthy();
    expect(ctx.plan!.methodology).toBeTruthy();
  });

  it("works without Tavily search (depth 1)", async () => {
    const profile1 = config.getDepthProfile(1);
    const node = createPlanNode(llm, null, profile1);
    const ctx = await node(makeCtx("人工智能发展史"));

    expect(ctx.plan).not.toBeNull();
    expect(ctx.plan!.dimensions.length).toBeGreaterThanOrEqual(1);
  });
});
