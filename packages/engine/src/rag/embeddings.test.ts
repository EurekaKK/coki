import { describe, it, expect, vi } from "vitest";
import { ZhipuEmbeddingProvider, LocalEmbeddingProvider } from "./embeddings";

describe("ZhipuEmbeddingProvider", () => {
  it("embeds texts via 智谱 embedding-3 HTTP API", async () => {
    const provider = new ZhipuEmbeddingProvider({
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "test-key",
      model: "embedding-3",
      dimensions: 512,
    });

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(512).fill(0.1) },
          { embedding: new Array(512).fill(0.2) },
        ],
      }),
    });

    const embeddings = await provider.embed(["hello", "world"]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(512);
    expect(embeddings[1]).toHaveLength(512);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://open.bigmodel.cn/api/paas/v4/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("throws on HTTP error", async () => {
    const provider = new ZhipuEmbeddingProvider({
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "bad-key",
      model: "embedding-3",
      dimensions: 512,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(provider.embed(["test"])).rejects.toThrow("Embedding API error: 401");
  });
});

describe("LocalEmbeddingProvider", () => {
  it("has correct dimensions", () => {
    const provider = new LocalEmbeddingProvider({ dimensions: 512 });
    expect(provider.dimensions).toBe(512);
  });

  // Note: actual embedding test is skipped by default because it downloads a ~100MB model
  it.skip("embeds texts locally", async () => {
    const provider = new LocalEmbeddingProvider({ dimensions: 512 });
    const embeddings = await provider.embed(["hello world"]);
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]).toHaveLength(512);
  });
});
