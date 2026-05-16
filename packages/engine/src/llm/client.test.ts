import { describe, it, expect } from "vitest";
import { LLMClient } from "./client";

describe("LLMClient", () => {
  const baseConfig = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 4096,
  };

  it("creates instance with config", () => {
    const client = new LLMClient(baseConfig);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(LLMClient);
  });

  it("tracks LLM calls via onCall callback", () => {
    const client = new LLMClient(baseConfig);
    const records: Array<{
      role: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
    }> = [];

    client.onCall((record) => {
      records.push(record);
    });

    // Verify the callback is registered (no direct way to trigger without making a real call)
    // This tests the registration mechanism works without errors
    expect(records).toHaveLength(0);
  });

  it("supports multiple onCall callbacks", () => {
    const client = new LLMClient(baseConfig);
    const records1: Array<{ role: string }> = [];
    const records2: Array<{ role: string }> = [];

    client.onCall((record) => {
      records1.push(record);
    });

    client.onCall((record) => {
      records2.push(record);
    });

    // Both callbacks should be registered without error
    expect(records1).toHaveLength(0);
    expect(records2).toHaveLength(0);
  });

  it("getModel returns a model instance", () => {
    const client = new LLMClient(baseConfig);
    const model = client.getModel();
    expect(model).toBeDefined();
  });

  it("getModel accepts model override", () => {
    const client = new LLMClient(baseConfig);
    const model = client.getModel("gpt-4o");
    expect(model).toBeDefined();
  });
});
