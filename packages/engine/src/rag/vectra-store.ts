import { LocalIndex } from "vectra";

export interface SearchResult {
  documentId: string;
  text: string;
  score: number;
}

export interface VectraStoreConfig {
  hybridAlpha: number;
  topK: number;
}

export class VectraStore {
  private readonly indexPath: string;
  private readonly config: VectraStoreConfig;
  private index: LocalIndex | null = null;

  constructor(indexPath: string, config: VectraStoreConfig) {
    this.indexPath = indexPath;
    this.config = config;
  }

  async open(): Promise<void> {
    this.index = new LocalIndex(this.indexPath);
    // Create index if it doesn't exist; otherwise load existing
    const exists = await this.index.isIndexCreated();
    if (!exists) {
      await this.index.createIndex({ version: 1 });
    } else {
      await this.index.loadIndexData();
    }
  }

  async addDocument(documentId: string, text: string, vector: number[]): Promise<void> {
    if (!this.index) throw new Error("VectraStore not open");
    await this.index.insertItem({
      id: documentId,
      metadata: { documentId },
      vector,
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!this.index) throw new Error("VectraStore not open");
    // Find all chunks for this document by metadata filter
    const items = await this.index.listItemsByMetadata({ documentId });
    for (const item of items) {
      await this.index.deleteItem(item.id);
    }
  }

  async search(queryText: string, queryVector: number[]): Promise<SearchResult[]> {
    if (!this.index) throw new Error("VectraStore not open");
    try {
      const results = await this.index.queryItems(
        queryVector,
        queryText,
        this.config.topK,
        undefined,
        true, // isBm25
      );
      return results.map((r) => ({
        documentId: (r.item.metadata as { documentId: string }).documentId,
        text: r.item.metadata?.text as string ?? "",
        score: r.score,
      }));
    } catch (err) {
      // Fallback to vector-only search if BM25 fails (e.g., collection too small)
      const results = await this.index.queryItems(
        queryVector,
        queryText,
        this.config.topK,
        undefined,
        false,
      );
      return results.map((r) => ({
        documentId: (r.item.metadata as { documentId: string }).documentId,
        text: r.item.metadata?.text as string ?? "",
        score: r.score,
      }));
    }
  }
}
