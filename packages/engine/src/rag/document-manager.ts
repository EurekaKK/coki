import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import type { CokiDatabase } from "../db/database";
import type { EmbeddingProvider } from "./embeddings";
import { parseDocument } from "./parser";
import { chunkText } from "./chunker";
import { VectraStore } from "./vectra-store";

export interface CreateCollectionParams {
  name: string;
  description?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  hybridAlpha?: number;
  topK?: number;
}

export interface ChunkSearchResult {
  documentId: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export class DocumentManager {
  private db: CokiDatabase;
  private indexBasePath: string;
  private embeddingProvider: EmbeddingProvider;
  private openStores = new Map<string, VectraStore>();

  constructor(db: CokiDatabase, indexBasePath: string, embeddingProvider: EmbeddingProvider) {
    this.db = db;
    this.indexBasePath = indexBasePath;
    this.embeddingProvider = embeddingProvider;
    mkdirSync(indexBasePath, { recursive: true });
  }

  async createCollection(params: CreateCollectionParams): Promise<string> {
    const id = this.db.createCollection({
      name: params.name,
      description: params.description,
      embeddingProvider: params.embeddingProvider ?? "zhipu",
      embeddingModel: params.embeddingModel ?? "embedding-3",
      embeddingDimension: params.embeddingDimension ?? this.embeddingProvider.dimensions,
      chunkSize: params.chunkSize,
      chunkOverlap: params.chunkOverlap,
      hybridAlpha: params.hybridAlpha,
      topK: params.topK,
    });
    return id;
  }

  listCollections() {
    return this.db.listCollections();
  }

  getCollection(id: string) {
    return this.db.getCollection(id);
  }

  async deleteCollection(id: string): Promise<void> {
    const store = this.openStores.get(id);
    if (store) {
      this.openStores.delete(id);
    }
    const indexPath = join(this.indexBasePath, id);
    try { rmSync(indexPath, { recursive: true }); } catch {}
    this.db.deleteCollection(id);
  }

  async importDocument(collectionId: string, filename: string, filePath: string): Promise<string> {
    const collection = this.db.getCollection(collectionId);
    if (!collection) throw new Error(`Collection not found: ${collectionId}`);

    const ext = extname(filename).slice(1).toLowerCase();
    if (!["txt", "md", "pdf"].includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    const docId = this.db.createDocument({ collectionId, filename, filePath });

    try {
      const buffer = readFileSync(filePath);
      const parsed = await parseDocument(buffer, ext);
      const chunks = chunkText(parsed.text, {
        chunkSize: collection.chunk_size,
        chunkOverlap: collection.chunk_overlap,
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.db.insertDocumentChunk({
          documentId: docId,
          collectionId,
          chunkIndex: i,
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
        });
      }

      if (chunks.length > 0) {
        const texts = chunks.map((c) => c.text);
        const embeddings = await this.embeddingProvider.embed(texts);
        const store = await this.getStore(collectionId, collection.hybrid_alpha, collection.top_k);

        for (let i = 0; i < chunks.length; i++) {
          await store.addDocument(`${docId}#${i}`, chunks[i].text, embeddings[i]);
        }
      }

      this.db.updateDocumentStatus(docId, "ready", undefined, chunks.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db.updateDocumentStatus(docId, "error", message);
      throw err;
    }

    return docId;
  }

  async deleteDocument(documentId: string): Promise<void> {
    const doc = this.db.getDocument(documentId);
    if (!doc) return;

    const chunks = this.db.getDocumentChunks(documentId);
    const store = this.openStores.get(doc.collection_id);
    if (store) {
      for (let i = 0; i < chunks.length; i++) {
        await store.deleteDocument(`${documentId}#${i}`);
      }
    }

    this.db.deleteDocumentChunks(documentId);
    this.db.deleteDocument(documentId);
  }

  listDocuments(collectionId: string) {
    return this.db.listDocumentsByCollection(collectionId);
  }

  getDocument(documentId: string) {
    return this.db.getDocument(documentId);
  }

  async search(collectionId: string, query: string, topK?: number): Promise<ChunkSearchResult[]> {
    const collection = this.db.getCollection(collectionId);
    if (!collection) throw new Error(`Collection not found: ${collectionId}`);

    const store = await this.getStore(collectionId, collection.hybrid_alpha, topK ?? collection.top_k);
    const queryEmbedding = await this.embeddingProvider.embed([query]);
    const results = await store.search(query, queryEmbedding[0]);

    return results.map((r) => {
      const [documentId, chunkIndexStr] = r.documentId.split("#");
      return {
        documentId,
        chunkIndex: parseInt(chunkIndexStr, 10),
        text: r.text,
        score: r.score,
      };
    });
  }

  private async getStore(collectionId: string, hybridAlpha: number, topK: number): Promise<VectraStore> {
    let store = this.openStores.get(collectionId);
    if (!store) {
      const indexPath = join(this.indexBasePath, collectionId);
      mkdirSync(indexPath, { recursive: true });
      store = new VectraStore(indexPath, { hybridAlpha, topK });
      await store.open();
      this.openStores.set(collectionId, store);
    }
    return store;
  }

  async close(): Promise<void> {
    this.openStores.clear();
  }
}
