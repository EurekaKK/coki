import { describe, it, expect } from "vitest";
import { Pipeline } from "./pipeline";
import type {
  PipelineConfig,
  PipelineEvent,
  PipelineNode,
  Transition,
} from "./pipeline";
import type { PipelineContext } from "./context";

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    runId: "test-run",
    userQuery: "test query",
    depth: 1,
    outputLanguage: "en",
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
    subagentReports: [],
    sources: new Map(),
    iterationCount: 0,
    maxIterations: 3,
    qualityScore: 0,
    qualityThreshold: 0.8,
    researchComplete: false,
    report: null,
    citedReport: null,
    evidenceSpans: [],
    claims: [],
    ...overrides,
  };
}

function makeNode(
  id: PipelineNode["id"],
  transform?: (ctx: PipelineContext) => PipelineContext,
): PipelineNode {
  return {
    id,
    run: async (ctx) => (transform ? transform(ctx) : ctx),
  };
}

describe("Pipeline", () => {
  it("runs nodes in sequence and yields progress/complete events", async () => {
    const order: string[] = [];
    const nodes: PipelineNode[] = [
      {
        id: "init",
        run: async (ctx) => {
          order.push("init");
          return ctx;
        },
      },
      {
        id: "plan",
        run: async (ctx) => {
          order.push("plan");
          return ctx;
        },
      },
      {
        id: "synthesize",
        run: async (ctx) => {
          order.push("synthesize");
          return { ...ctx, report: "done" };
        },
      },
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "plan" },
      { from: "plan", decide: () => "synthesize" },
      { from: "synthesize", decide: () => "end" },
    ];

    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];
    for await (const event of pipeline.run(makeCtx())) {
      events.push(event);
    }

    expect(order).toEqual(["init", "plan", "synthesize"]);

    const progressPhases = events
      .filter((e) => e.type === "progress")
      .map((e) => e.phase);
    expect(progressPhases).toEqual(["init", "plan", "synthesize"]);

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    expect(complete!.phase).toBe("synthesize");
  });

  it("supports looping transitions (reflection -> subagents loop)", async () => {
    let subagentRuns = 0;
    const nodes: PipelineNode[] = [
      makeNode("init"),
      makeNode("subagents", (ctx) => {
        subagentRuns++;
        return { ...ctx, iterationCount: subagentRuns };
      }),
      makeNode("reflection", (ctx) => ({
        ...ctx,
        researchComplete: subagentRuns >= 3,
      })),
      makeNode("synthesize", (ctx) => ({ ...ctx, report: "final" })),
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "subagents" },
      {
        from: "subagents",
        decide: () => "reflection",
      },
      {
        from: "reflection",
        decide: (ctx) => (ctx.researchComplete ? "synthesize" : "subagents"),
      },
      { from: "synthesize", decide: () => "end" },
    ];

    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];
    for await (const event of pipeline.run(makeCtx())) {
      events.push(event);
    }

    expect(subagentRuns).toBe(3);

    const progressPhases = events
      .filter((e) => e.type === "progress")
      .map((e) => e.phase);
    // init -> subagents -> reflection -> subagents -> reflection -> subagents -> reflection -> synthesize
    expect(progressPhases).toEqual([
      "init",
      "subagents",
      "reflection",
      "subagents",
      "reflection",
      "subagents",
      "reflection",
      "synthesize",
    ]);

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
  });

  it("handles node errors and yields error event", async () => {
    const nodes: PipelineNode[] = [
      makeNode("init"),
      {
        id: "plan",
        run: async () => {
          throw new Error("LLM call failed");
        },
      },
      makeNode("synthesize"),
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "plan" },
      { from: "plan", decide: () => "synthesize" },
      { from: "synthesize", decide: () => "end" },
    ];

    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];
    for await (const event of pipeline.run(makeCtx())) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain("LLM call failed");
    expect(errorEvent!.phase).toBe("plan");

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeUndefined();
  });

  it("supports cancellation via AbortSignal", async () => {
    let subagentRuns = 0;
    const nodes: PipelineNode[] = [
      makeNode("init"),
      makeNode("subagents", (ctx) => {
        subagentRuns++;
        return { ...ctx, iterationCount: subagentRuns };
      }),
      makeNode("reflection", (ctx) => ({
        ...ctx,
        researchComplete: false, // never completes
      })),
      makeNode("synthesize"),
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "subagents" },
      { from: "subagents", decide: () => "reflection" },
      {
        from: "reflection",
        decide: (ctx) => (ctx.researchComplete ? "synthesize" : "subagents"),
      },
      { from: "synthesize", decide: () => "end" },
    ];

    const controller = new AbortController();
    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];

    // Cancel after first iteration
    let collected = 0;
    for await (const event of pipeline.run(makeCtx(), controller.signal)) {
      events.push(event);
      collected++;
      if (collected === 4) {
        // init, subagents, reflection, (next subagents would start)
        controller.abort();
      }
    }

    const cancelled = events.find((e) => e.type === "cancelled");
    expect(cancelled).toBeDefined();

    // Should not have reached synthesize
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeUndefined();
  });

  it("enforces safety limit of 20 steps", async () => {
    const nodes: PipelineNode[] = [
      makeNode("init"),
      makeNode("subagents"),
      makeNode("reflection", (ctx) => ({
        ...ctx,
        researchComplete: false, // never completes
      })),
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "subagents" },
      { from: "subagents", decide: () => "reflection" },
      { from: "reflection", decide: () => "subagents" },
    ];

    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];
    for await (const event of pipeline.run(makeCtx())) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain("safety limit");

    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents.length).toBeLessThanOrEqual(20);
  });

  it("validates nodes map covers transitions", () => {
    const nodes: PipelineNode[] = [makeNode("init")];
    const transitions: Transition[] = [
      { from: "init", decide: () => "plan" },
    ];

    expect(() => new Pipeline({ nodes, transitions })).toThrow();
  });

  it("supports startFrom parameter to skip initial nodes", async () => {
    const order: string[] = [];
    const nodes: PipelineNode[] = [
      {
        id: "init",
        run: async (ctx) => {
          order.push("init");
          return ctx;
        },
      },
      {
        id: "plan",
        run: async (ctx) => {
          order.push("plan");
          return ctx;
        },
      },
      {
        id: "synthesize",
        run: async (ctx) => {
          order.push("synthesize");
          return { ...ctx, report: "done" };
        },
      },
    ];

    const transitions: Transition[] = [
      { from: "init", decide: () => "plan" },
      { from: "plan", decide: () => "synthesize" },
      { from: "synthesize", decide: () => "end" },
    ];

    const pipeline = new Pipeline({ nodes, transitions });
    const events: PipelineEvent[] = [];
    for await (const event of pipeline.run(makeCtx(), undefined, "plan")) {
      events.push(event);
    }

    // init should be skipped
    expect(order).toEqual(["plan", "synthesize"]);
    expect(order).not.toContain("init");

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
  });
});
