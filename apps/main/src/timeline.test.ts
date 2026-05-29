import { describe, expect, it } from "vitest";
import { parseTimelineLogs } from "./timeline";

describe("parseTimelineLogs", () => {
  it("includes pre-run intent logs linked by intentRequestId", () => {
    const content = [
      JSON.stringify({
        level: 30,
        time: "2026-05-27 20:49:38.502",
        component: "intent",
        event: "intent.clarify.start",
        intentRequestId: "intent-1",
        msg: "intent: clarify start",
      }),
      JSON.stringify({
        level: 30,
        time: "2026-05-27 20:49:46.298",
        traceId: "intent-1",
        phase: "intent-clarify",
        component: "llm",
        role: "intent-clarifier",
        msg: "llm.generate start",
      }),
      JSON.stringify({
        level: 30,
        time: "2026-05-27 20:50:10.633",
        runId: "run-1",
        component: "research",
        event: "research.start",
        intentRequestId: "intent-1",
        msg: "research: start",
      }),
      JSON.stringify({
        level: 30,
        time: "2026-05-27 20:50:10.634",
        runId: "run-1",
        component: "pipeline",
        msg: "plan: start",
      }),
      JSON.stringify({
        level: 30,
        time: "2026-05-27 20:50:10.635",
        component: "intent",
        event: "intent.clarify.start",
        intentRequestId: "intent-other",
        msg: "intent: clarify start",
      }),
    ].join("\n");

    const logs = parseTimelineLogs(content, "run-1");

    expect(logs.map((log) => log.message)).toEqual([
      "intent: clarify start",
      "llm.generate start",
      "research: start",
      "plan: start",
    ]);
    expect(logs[0].phase).toBe("intent");
    expect(logs[1].phase).toBe("intent-clarify");
    expect(logs.every((log) => log.run_id === "run-1")).toBe(true);
  });
});
