import { describe, it, expect } from "vitest";
import { createSplitNode } from "./split";
import { createTestLLMClient } from "../../test-utils/helper";
import { ConfigManager } from "../../config/config";
import type { PipelineContext, ResearchPlan } from "../context";

const testPlan: ResearchPlan = {
  dimensions: ["技术原理", "应用场景", "发展趋势"],
  outputStructure: ["技术原理", "应用场景", "发展趋势"],
  methodology: "综合分析",
  requirements: {
    coreObjectives: [],
    explicitRequirements: [],
    scopeConstraints: {},
    subQuestions: [],
  },
};

function makeCtx(query: string): PipelineContext {
  return {
    runId: "test-split",
    userQuery: query,
    depth: 2,
    outputLanguage: "zh",
    plan: testPlan,
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

describe("Split Node", () => {
  const llm = createTestLLMClient();
  const config = new ConfigManager({});

  it("depth 1: directly maps dimensions to subtasks without LLM", async () => {
    const profile1 = config.getDepthProfile(1);
    const node = createSplitNode(llm, profile1);
    const ctx = await node(makeCtx("量子计算"));

    expect(ctx.subtasks).toHaveLength(3);
    expect(ctx.subtasks[0].instruction).toContain("技术原理");
    expect(ctx.subtasks[0].keywords.length).toBeGreaterThanOrEqual(1);
  });

  it("depth 2: uses LLM to generate subtasks", async () => {
    const profile2 = config.getDepthProfile(2);
    const node = createSplitNode(llm, profile2);
    const ctx = await node(makeCtx("量子计算"));

    expect(ctx.subtasks.length).toBeGreaterThanOrEqual(1);
    ctx.subtasks.forEach((st) => {
      expect(st.id).toBeTruthy();
      expect(st.instruction).toBeTruthy();
      expect(st.keywords.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles empty plan gracefully", async () => {
    const profile2 = config.getDepthProfile(2);
    const node = createSplitNode(llm, profile2);
    const ctx = await node({ ...makeCtx("test"), plan: null });

    expect(ctx.subtasks).toEqual([]);
  });
});
