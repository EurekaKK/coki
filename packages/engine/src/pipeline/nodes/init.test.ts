import { describe, it, expect } from "vitest";
import { initNode } from "./init";
import type { PipelineContext } from "../context";

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    runId: "test-run-001",
    userQuery: "What is quantum computing?",
    depth: 2,
    outputLanguage: "en",
    plan: {
      dimensions: ["history", "applications"],
      outputStructure: "essay",
      methodology: "survey",
    },
    subtasks: [
      { id: "st-1", instruction: "Research history", keywords: ["history"] },
    ],
    completedSubtasks: new Set(["st-1"]),
    subagentReports: [
      {
        subtaskId: "st-1",
        report: "History report",
        sources: [],
      },
    ],
    sources: new Map([["s1", {
      id: "s1",
      sourceType: "web",
      url: "https://example.com",
      title: "Example",
      fetchStatus: "ok",
    }]]),
    iterationCount: 3,
    maxIterations: 5,
    qualityScore: 0.85,
    qualityThreshold: 0.7,
    researchComplete: true,
    report: "Final report",
    citedReport: "Cited report",
    ...overrides,
  };
}

describe("initNode", () => {
  it("resets all transient state to defaults", async () => {
    const ctx = makeCtx();
    const result = await initNode(ctx);

    expect(result.plan).toBeNull();
    expect(result.subtasks).toEqual([]);
    expect(result.completedSubtasks.size).toBe(0);
    expect(result.subagentReports).toEqual([]);
    expect(result.sources.size).toBe(0);
    expect(result.iterationCount).toBe(0);
    expect(result.qualityScore).toBe(0);
    expect(result.researchComplete).toBe(false);
    expect(result.report).toBeNull();
    expect(result.citedReport).toBeNull();
  });

  it("preserves runId, userQuery, depth, outputLanguage, maxIterations, qualityThreshold", async () => {
    const ctx = makeCtx({
      runId: "preserved-run-42",
      userQuery: "Explain dark matter",
      depth: 3,
      outputLanguage: "zh",
      maxIterations: 7,
      qualityThreshold: 0.95,
    });
    const result = await initNode(ctx);

    expect(result.runId).toBe("preserved-run-42");
    expect(result.userQuery).toBe("Explain dark matter");
    expect(result.depth).toBe(3);
    expect(result.outputLanguage).toBe("zh");
    expect(result.maxIterations).toBe(7);
    expect(result.qualityThreshold).toBe(0.95);
  });

  it("returns a new object (immutability)", async () => {
    const ctx = makeCtx();
    const result = await initNode(ctx);
    expect(result).not.toBe(ctx);
  });

  it("handles already-clean context without errors", async () => {
    const ctx = makeCtx({
      plan: null,
      subtasks: [],
      completedSubtasks: new Set(),
      subagentReports: [],
      sources: new Map(),
      iterationCount: 0,
      qualityScore: 0,
      researchComplete: false,
      report: null,
      citedReport: null,
    });
    const result = await initNode(ctx);
    expect(result.plan).toBeNull();
    expect(result.subtasks).toEqual([]);
    expect(result.iterationCount).toBe(0);
  });
});
