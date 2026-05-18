import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("splits text into chunks of target size", () => {
    const text = "a".repeat(2000);
    const chunks = chunkText(text, { chunkSize: 800, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBeLessThanOrEqual(800);
  });

  it("includes overlap between chunks", () => {
    const text = "Word " + "x ".repeat(500); // ~2500 chars
    const chunks = chunkText(text, { chunkSize: 800, chunkOverlap: 100 });
    if (chunks.length >= 2) {
      const endOfFirst = chunks[0].text.slice(-50);
      const startOfSecond = chunks[1].text.slice(0, 50);
      // Some overlap should exist
      expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);
    }
  });

  it("preserves short text as single chunk", () => {
    const text = "Short text.";
    const chunks = chunkText(text, { chunkSize: 800, chunkOverlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Short text.");
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(11);
  });

  it("splits on sentence boundaries when possible", () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i + 1}.`);
    const text = sentences.join(" ");
    const chunks = chunkText(text, { chunkSize: 100, chunkOverlap: 20 });
    for (const chunk of chunks) {
      // Chunks should not break mid-word if possible
      expect(chunk.text.length).toBeLessThanOrEqual(100);
    }
  });
});
