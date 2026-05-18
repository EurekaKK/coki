import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VectraStore } from "./vectra-store";

describe("VectraStore", () => {
  let indexPath: string;
  let store: VectraStore;

  beforeEach(async () => {
    indexPath = join(tmpdir(), `vectra-test-${Date.now()}`);
    mkdirSync(indexPath, { recursive: true });
    store = new VectraStore(indexPath, { hybridAlpha: 0.5, topK: 3 });
    await store.open();
  });

  afterEach(() => {
    try { rmSync(indexPath, { recursive: true }); } catch {}
  });

  it("adds and searches documents", async () => {
    await store.addDocument("doc1", "The quick brown fox jumps over the lazy dog.", [0.1, 0.2, 0.3]);
    await store.addDocument("doc2", "Machine learning is a subset of artificial intelligence.", [0.4, 0.5, 0.6]);
    await store.addDocument("doc3", "The dog barked at the fox.", [0.15, 0.25, 0.35]);

    const results = await store.search("fox", [0.12, 0.22, 0.32]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe("doc1");
  });

  it("deletes documents", async () => {
    await store.addDocument("doc1", "Hello world", [0.1, 0.2, 0.3]);
    await store.deleteDocument("doc1");
    const results = await store.search("hello", [0.1, 0.2, 0.3]);
    expect(results).toHaveLength(0);
  });
});
