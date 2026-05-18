import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CokiDatabase } from "../db/database";
import { DocumentManager } from "./document-manager";
import type { EmbeddingProvider } from "./embeddings";

class FakeEmbeddingProvider implements EmbeddingProvider {
  dimensions = 3;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
}

describe("DocumentManager", () => {
  let dbPath: string;
  let indexDir: string;
  let db: CokiDatabase;
  let manager: DocumentManager;
  let embeddings: FakeEmbeddingProvider;

  beforeEach(() => {
    dbPath = join(tmpdir(), `coki-doc-test-${Date.now()}.db`);
    indexDir = join(tmpdir(), `coki-index-test-${Date.now()}`);
    mkdirSync(indexDir, { recursive: true });
    db = new CokiDatabase(dbPath);
    embeddings = new FakeEmbeddingProvider();
    manager = new DocumentManager(db, indexDir, embeddings);
  });

  afterEach(() => {
    db.close();
    try { rmSync(dbPath); } catch {}
    try { rmSync(indexDir, { recursive: true }); } catch {}
  });

  it("creates a collection", async () => {
    const id = await manager.createCollection({ name: "Research Papers" });
    const coll = db.getCollection(id);
    expect(coll).not.toBeNull();
    expect(coll?.name).toBe("Research Papers");
  });

  it("imports, indexes, and searches a document", async () => {
    const collId = await manager.createCollection({ name: "Test" });
    const filePath = join(tmpdir(), `test-doc-${Date.now()}.txt`);
    writeFileSync(filePath, "Hello world. This is a test document for search.");

    const docId = await manager.importDocument(collId, "test.txt", filePath);
    const doc = db.getDocument(docId);
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe("ready");

    const chunks = db.getDocumentChunks(docId);
    expect(chunks.length).toBeGreaterThan(0);

    const results = await manager.search(collId, "test document");
    expect(results.length).toBeGreaterThan(0);
  });

  it("deletes a document and its index entries", async () => {
    const collId = await manager.createCollection({ name: "Test" });
    const filePath = join(tmpdir(), `del-test-${Date.now()}.txt`);
    writeFileSync(filePath, "Delete me");

    const docId = await manager.importDocument(collId, "del.txt", filePath);
    await manager.deleteDocument(docId);

    expect(db.getDocument(docId)).toBeNull();
    expect(db.getDocumentChunks(docId)).toHaveLength(0);
  });
});
