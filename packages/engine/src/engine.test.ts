import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ResearchEngine } from "./engine";
import { CokiDatabase } from "./db/database";
import { getLlmApiKey, getTavilyApiKey, getTestConfigOverrides } from "./test-utils/helper";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ResearchEngine", () => {
  let tmpDir: string;
  let db: CokiDatabase;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "coki-engine-test-"));
    db = new CokiDatabase(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("end-to-end: runs pipeline and produces report (depth 1)", async () => {
    const apiKey = getLlmApiKey();
    const tavilyKey = getTavilyApiKey();
    if (!tavilyKey) {
      console.warn("Skipping: no Tavily API key");
      return;
    }

    const engine = new ResearchEngine(
      db,
      getTestConfigOverrides(),
      { llmApiKey: apiKey, tavilyApiKey: tavilyKey },
    );

    const events: Array<{ type: string; phase?: string; message?: string; progress?: number }> = [];
    const run = engine.runResearch("什么是量子纠缠", 1, { outputLanguage: "zh" });

    for await (const event of run) {
      events.push(event);
      if (event.type === "error") {
        console.error("Pipeline error:", event.phase, event.message);
      }
    }

    const completeEvent = events.find((e) => e.type === "complete");
    expect(completeEvent).toBeDefined();

    // Check that the run was persisted
    const runs = db.listRuns();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].cited_report).toBeTruthy();
    expect(runs[0].cited_report!.length).toBeGreaterThan(100);
  }, 300_000);

  it("progress events include numeric progress field", async () => {
    const apiKey = getLlmApiKey();
    const tavilyKey = getTavilyApiKey();
    if (!tavilyKey) return;

    const engine = new ResearchEngine(
      db,
      getTestConfigOverrides(),
      { llmApiKey: apiKey, tavilyApiKey: tavilyKey },
    );

    const progressEvents: Array<{ phase: string; progress: number }> = [];
    const run = engine.runResearch("AI简史", 1, { outputLanguage: "zh" });

    for await (const event of run) {
      if (event.type === "progress" && event.progress !== undefined) {
        progressEvents.push({ phase: event.phase, progress: event.progress });
      }
    }

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    progressEvents.forEach((e) => {
      expect(e.progress).toBeGreaterThanOrEqual(0);
      expect(e.progress).toBeLessThanOrEqual(99);
    });
    // Progress should generally increase
    const first = progressEvents[0].progress;
    const last = progressEvents[progressEvents.length - 1].progress;
    expect(last).toBeGreaterThan(first);
  }, 300_000);
});
