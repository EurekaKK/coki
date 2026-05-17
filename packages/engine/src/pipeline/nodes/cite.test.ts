import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCiteNode } from "./cite";
import { CokiDatabase } from "../../db/database";
import type { PipelineContext } from "../context";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeCtx(report: string, runId: string): PipelineContext {
  return {
    runId,
    userQuery: "test",
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
    report,
    citedReport: null,
  };
}

describe("Cite Node", () => {
  let tmpDir: string;
  let db: CokiDatabase;
  let runId: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "coki-cite-test-"));
    db = new CokiDatabase(join(tmpDir, "test.db"));
    runId = db.createRun("test", 2);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("converts [src: url] markers to numbered footnotes", async () => {
    const report = "量子计算很重要。[src: https://example.com/a] 它有很多应用。[src: https://example.com/b]";
    const node = createCiteNode(db);
    const ctx = await node(makeCtx(report, runId));

    expect(ctx.citedReport).toBeTruthy();
    expect(ctx.citedReport).not.toContain("[src:");
    expect(ctx.citedReport).toMatch(/\[\^1\]|\[\^2\]/);
  });

  it("handles report with no citations", async () => {
    const report = "这是一段没有引用的报告。量子计算很重要。";
    const node = createCiteNode(db);
    const ctx = await node(makeCtx(report, runId));

    expect(ctx.citedReport).toBeTruthy();
  });

  it("returns error when report is null", async () => {
    const node = createCiteNode(db);
    const ctx = await node({ ...makeCtx("", runId), report: null });

    expect(ctx.error).toBe("No report to cite");
  });

  it("persists sources to database", async () => {
    const report = "测试。[src: https://example.com/test]";
    const node = createCiteNode(db);
    await node(makeCtx(report, runId));

    const sources = db.getSourcesByRun(runId);
    expect(sources.length).toBeGreaterThanOrEqual(1);
  });
});
