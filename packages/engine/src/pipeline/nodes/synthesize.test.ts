import { describe, it, expect } from "vitest";
import { createSynthesizeNode } from "./synthesize";
import { createTestLLMClient } from "../../test-utils/helper";
import { ConfigManager } from "../../config/config";
import type { PipelineContext, SubagentReport } from "../context";

const mockReports: SubagentReport[] = [
  {
    subtaskId: "st-1",
    report: "量子计算利用量子比特进行计算。量子比特可以同时处于0和1的叠加状态。[src: https://example.com/qc1]",
    sources: [],
    evidenceSpans: [],
  },
  {
    subtaskId: "st-2",
    report: "量子计算在密码学、药物发现和优化问题中有广泛应用。[src: https://example.com/qc2]",
    sources: [],
    evidenceSpans: [],
  },
];

function makeCtx(reports: SubagentReport[]): PipelineContext {
  return {
    runId: "test-synthesize",
    userQuery: "量子计算的原理和应用",
    depth: 2,
    outputLanguage: "zh",
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
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

describe("Synthesize Node", () => {
  const llm = createTestLLMClient();
  const config = new ConfigManager({});
  const profile = config.getDepthProfile(2);

  it("combines reports into a single comprehensive report", async () => {
    const node = createSynthesizeNode(llm, profile);
    const ctx = await node(makeCtx(mockReports));

    expect(ctx.report).toBeTruthy();
    expect(ctx.report!.length).toBeGreaterThan(200);
  }, 60_000);

  it("handles single report", async () => {
    const node = createSynthesizeNode(llm, profile);
    const ctx = await node(makeCtx([mockReports[0]]));

    expect(ctx.report).toBeTruthy();
    expect(ctx.report!.length).toBeGreaterThan(100);
  }, 60_000);
});
