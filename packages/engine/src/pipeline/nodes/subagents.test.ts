import { describe, it, expect, beforeAll } from "vitest";
import { createSubagentsNode } from "./subagents";
import { createTestLLMClient, createTestSearch } from "../../test-utils/helper";
import { ConfigManager } from "../../config/config";
import type { PipelineContext, Subtask } from "../context";

const testSubtasks: Subtask[] = [
  { id: "st-1", instruction: "搜索量子计算的基本原理和关键技术", keywords: ["量子计算", "原理"] },
];

function makeCtx(subtasks: Subtask[]): PipelineContext {
  return {
    runId: "test-subagents",
    userQuery: "量子计算",
    depth: 2,
    outputLanguage: "zh",
    plan: null,
    subtasks,
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

describe("Subagents Node", () => {
  let llm: ReturnType<typeof createTestLLMClient>;
  let search: ReturnType<typeof createTestSearch>;

  beforeAll(() => {
    llm = createTestLLMClient();
    search = createTestSearch();
  });

  it("runs subtasks and produces reports with sources", async () => {
    if (!search) {
      console.warn("Skipping: no Tavily API key");
      return;
    }
    const config = new ConfigManager({});
    const profile = config.getDepthProfile(2);
    const node = createSubagentsNode(llm, search, profile);

    const ctx = await node(makeCtx(testSubtasks));

    expect(ctx.subagentReports.length).toBeGreaterThanOrEqual(1);
    const report = ctx.subagentReports[0];
    expect(report.report).toBeTruthy();
    expect(report.report.length).toBeGreaterThan(100);
    expect(report.subtaskId).toBe("st-1");
    expect(ctx.completedSubtasks.has("st-1")).toBe(true);
  }, 120_000);

  it("handles empty subtasks", async () => {
    if (!search) return;
    const config = new ConfigManager({});
    const profile = config.getDepthProfile(2);
    const node = createSubagentsNode(llm, search, profile);

    const ctx = await node(makeCtx([]));
    expect(ctx.researchComplete).toBe(true);
    expect(ctx.subagentReports).toEqual([]);
  });

  it("throws if search is null", async () => {
    const config = new ConfigManager({});
    const profile = config.getDepthProfile(2);
    const node = createSubagentsNode(llm, null, profile);

    await expect(node(makeCtx(testSubtasks))).rejects.toThrow("TavilySearchProvider");
  });
});
