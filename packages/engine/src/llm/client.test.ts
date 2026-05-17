import { describe, it, expect, beforeAll } from "vitest";
import { LLMClient } from "./client";
import { createTestLLMClient } from "../test-utils/helper";

describe("LLMClient", () => {
  let client: LLMClient;

  beforeAll(() => {
    client = createTestLLMClient();
  });

  it("creates instance with config", () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(LLMClient);
  });

  it("generate() returns non-empty text from real LLM", async () => {
    const result = await client.generate({
      role: "test",
      prompt: "Reply with exactly one word: hello",
    });
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("stream() returns non-empty text from real LLM", async () => {
    const text = await client.stream({
      role: "test",
      prompt: "Reply with exactly one word: hello",
    });
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });

  it("onCall callback fires after generate()", async () => {
    const records: Array<{ role: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number }> = [];
    const cb = (record: { role: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number }) => {
      records.push(record);
    };
    client.onCall(cb);

    await client.generate({
      role: "test-callback",
      prompt: "Say yes",
    });

    expect(records.length).toBeGreaterThanOrEqual(1);
    const last = records[records.length - 1];
    expect(last.role).toBe("test-callback");
    expect(last.latencyMs).toBeGreaterThan(0);
  });

  it("onCall callback includes runId and phase when provided", async () => {
    const records: Array<{ role: string; runId?: string; phase?: string }> = [];
    const cb = (record: { role: string; runId?: string; phase?: string }) => {
      records.push(record);
    };
    client.onCall(cb);

    await client.generate({
      role: "test-runid",
      prompt: "Say yes",
      runId: "test-run-123",
      phase: "test-phase",
    });

    expect(records.length).toBeGreaterThanOrEqual(1);
    const last = records[records.length - 1];
    expect(last.role).toBe("test-runid");
    expect(last.runId).toBe("test-run-123");
    expect(last.phase).toBe("test-phase");
  });
});
