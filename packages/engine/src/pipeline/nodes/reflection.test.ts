import { describe, it, expect } from "vitest";
import { createReflectionNode } from "./reflection";
import { createTestLLMClient } from "../../test-utils/helper";
import type { PipelineContext, SubagentReport } from "../context";

const mockReports: SubagentReport[] = [
  {
    subtaskId: "st-1",
    report: "量子计算利用量子比特进行计算，具有叠加和纠缠等特性。量子比特可以同时处于0和1的状态。[src: https://example.com/qc]",
    sources: [{ id: "s1", sourceType: "web", url: "https://example.com/qc", fetchStatus: "ok" }],
    evidenceSpans: [],
  },
];

function makeCtx(reports: SubagentReport[]): PipelineContext {
  return {
    runId: "test-reflection",
    userQuery: "量子计算的原理和应用",
    depth: 2,
    outputLanguage: "zh",
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(["st-1"]),
    subagentReports: reports,
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

describe("Reflection Node", () => {
  const llm = createTestLLMClient();

  it("evaluates reports and returns quality score", async () => {
    const node = createReflectionNode(llm);
    const ctx = await node(makeCtx(mockReports));

    expect(ctx.qualityScore).toBeGreaterThanOrEqual(0);
    expect(ctx.qualityScore).toBeLessThanOrEqual(1);
    expect(typeof ctx.researchComplete).toBe("boolean");
  });

  it("skips evaluation when max iterations reached", async () => {
    const node = createReflectionNode(llm);
    const ctx = await node({
      ...makeCtx(mockReports),
      iterationCount: 2,
      maxIterations: 2,
    });

    expect(ctx.researchComplete).toBe(true);
  });
});
