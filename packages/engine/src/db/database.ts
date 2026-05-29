/**
 * Coki Engine Database Module
 *
 * Wraps better-sqlite3 with WAL mode, foreign keys, and migration support.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { MIGRATIONS } from "./migrations";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface RunRow {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  research_plan: string | null;
  cited_report: string | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface SourceRow {
  id: string;
  run_id: string;
  source_type: string;
  url: string | null;
  document_id: string | null;
  chunk_id: string | null;
  canonical_url: string | null;
  title: string | null;
  snippet: string | null;
  content_hash: string | null;
  fetch_status: string | null;
  retrieved_at: string;
  cited_in_report: number;
}

export interface LLMCallRow {
  id: number;
  run_id: string;
  role: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface TraceLogRow {
  id: number;
  run_id: string;
  phase: string | null;
  event_type: string | null;
  message: string | null;
  details: string | null;
  level: string;
  created_at: string;
}

export interface EvidenceSpanRow {
  id: string;
  run_id: string;
  source_id: string | null;
  subtask_id: string | null;
  quote: string;
  url: string | null;
  page_title: string | null;
  start_offset: number | null;
  end_offset: number | null;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  run_id: string;
  claim_text: string;
  section_heading: string | null;
  claim_index: number | null;
  created_at: string;
}

export interface ClaimEvidenceRow {
  id: string;
  claim_id: string;
  evidence_span_id: string;
  relevance_score: number | null;
  created_at: string;
}

export interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimension: number;
  chunk_size: number;
  chunk_overlap: number;
  hybrid_alpha: number;
  top_k: number;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  collection_id: string;
  filename: string;
  file_path: string;
  content_hash: string | null;
  parser_version: string | null;
  chunk_count: number | null;
  status: string;
  indexed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface DocumentChunkRow {
  id: string;
  document_id: string;
  collection_id: string;
  chunk_index: number;
  text: string;
  content_hash: string | null;
  start_offset: number | null;
  end_offset: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CokiDatabase
// ---------------------------------------------------------------------------

export class CokiDatabase {
  private readonly db: Database.Database;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");

    // Enable foreign key enforcement
    this.db.pragma("foreign_keys = ON");

    // Run pending migrations
    this.runMigrations();
  }

  // -------------------------------------------------------------------------
  // Guard
  // -------------------------------------------------------------------------

  private checkNotClosed(): void {
    if (this.closed) {
      throw new Error("CokiDatabase has been closed");
    }
  }

  // -------------------------------------------------------------------------
  // Migration runner
  // -------------------------------------------------------------------------

  private runMigrations(): void {
    try {
      // Ensure schema_migrations table exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);

      const applied = new Set<number>();
      const rows = this.db
        .prepare("SELECT version FROM schema_migrations")
        .all() as { version: number }[];
      for (const row of rows) {
        applied.add(row.version);
      }

      const now = () => new Date().toISOString();
      const insertMigration = this.db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      );

      for (const migration of MIGRATIONS) {
        if (!applied.has(migration.version)) {
          const applyMigration = this.db.transaction(() => {
            this.db.exec(migration.sql);
            insertMigration.run(migration.version, migration.name, now());
          });
          applyMigration();
        }
      }
    } catch (err) {
      throw new Error(
        `Database migration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  createRun(query: string, depth: number, id?: string): string {
    this.checkNotClosed();
    const runId = id ?? randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO runs (id, user_query, depth, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(runId, query, depth, now);
    return runId;
  }

  getRun(id: string): RunRow | null {
    this.checkNotClosed();
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(id) as RunRow | undefined;
    return row ?? null;
  }

  listRuns(): RunRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC, ROWID DESC")
      .all() as RunRow[];
  }

  updateRunStatus(
    id: string,
    status: string,
    error?: string,
    citedReport?: string,
  ): void {
    this.checkNotClosed();
    const isTerminal = status === "completed" || status === "failed";
    const now = new Date().toISOString();

    if (isTerminal) {
      this.db
        .prepare(
          "UPDATE runs SET status = ?, error = ?, cited_report = ?, completed_at = ? WHERE id = ?",
        )
        .run(status, error ?? null, citedReport ?? null, now, id);
    } else {
      this.db
        .prepare("UPDATE runs SET status = ? WHERE id = ?")
        .run(status, id);
    }
  }

  markInterruptedRuns(error: string): number {
    this.checkNotClosed();
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE runs
         SET status = 'failed', error = ?, completed_at = ?
         WHERE status IN ('pending', 'running')`,
      )
      .run(error, now);
    return result.changes;
  }

  updateRunPlan(id: string, plan: string): void {
    this.checkNotClosed();
    this.db
      .prepare("UPDATE runs SET research_plan = ? WHERE id = ?")
      .run(plan, id);
  }

  deleteRun(id: string): void {
    this.checkNotClosed();
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------------------
  // Sources
  // -------------------------------------------------------------------------

  insertSource(
    source: Pick<SourceRow, "run_id" | "source_type"> &
      Partial<Omit<SourceRow, "id" | "run_id" | "source_type" | "retrieved_at">>,
  ): string {
    this.checkNotClosed();
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sources
          (id, run_id, source_type, url, document_id, chunk_id, canonical_url,
           title, snippet, content_hash, fetch_status, retrieved_at, cited_in_report)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        source.run_id,
        source.source_type,
        source.url ?? null,
        source.document_id ?? null,
        source.chunk_id ?? null,
        source.canonical_url ?? null,
        source.title ?? null,
        source.snippet ?? null,
        source.content_hash ?? null,
        source.fetch_status ?? "ok",
        now,
        source.cited_in_report ?? 0,
      );
    return id;
  }

  getSourcesByRun(runId: string): SourceRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM sources WHERE run_id = ?")
      .all(runId) as SourceRow[];
  }

  getSourceByUrlAndRunId(url: string, runId: string): { id: string } | undefined {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT id FROM sources WHERE url = ? AND run_id = ?")
      .get(url, runId) as { id: string } | undefined;
  }

  // -------------------------------------------------------------------------
  // Report References
  // -------------------------------------------------------------------------

  insertReportReference(ref: {
    id: string;
    runId: string;
    refNumber: number;
    sourceId: string;
  }): void {
    this.checkNotClosed();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO report_references (id, run_id, ref_number, source_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(ref.id, ref.runId, ref.refNumber, ref.sourceId);
  }

  // -------------------------------------------------------------------------
  // LLM Calls
  // -------------------------------------------------------------------------

  insertLLMCall(
    call: Omit<LLMCallRow, "id" | "created_at">,
  ): void {
    this.checkNotClosed();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO llm_calls
          (run_id, role, model, input_tokens, output_tokens, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        call.run_id,
        call.role ?? null,
        call.model ?? null,
        call.input_tokens ?? null,
        call.output_tokens ?? null,
        call.latency_ms ?? null,
        now,
      );
  }

  getLLMCallsByRun(runId: string): LLMCallRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM llm_calls WHERE run_id = ? ORDER BY id")
      .all(runId) as LLMCallRow[];
  }

  // -------------------------------------------------------------------------
  // Trace Logs
  // -------------------------------------------------------------------------

  getTraceLogsByRun(runId: string): TraceLogRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM trace_logs WHERE run_id = ? ORDER BY created_at")
      .all(runId) as TraceLogRow[];
  }

  // -------------------------------------------------------------------------
  // Evidence Spans
  // -------------------------------------------------------------------------

  insertEvidenceSpan(span: Omit<EvidenceSpanRow, "created_at">): void {
    this.checkNotClosed();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO evidence_spans
          (id, run_id, source_id, subtask_id, quote, url, page_title, start_offset, end_offset, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        span.id,
        span.run_id,
        span.source_id ?? null,
        span.subtask_id ?? null,
        span.quote,
        span.url ?? null,
        span.page_title ?? null,
        span.start_offset ?? null,
        span.end_offset ?? null,
        now,
      );
  }

  getEvidenceSpansByRun(runId: string): EvidenceSpanRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM evidence_spans WHERE run_id = ? ORDER BY created_at")
      .all(runId) as EvidenceSpanRow[];
  }

  // -------------------------------------------------------------------------
  // Claims
  // -------------------------------------------------------------------------

  insertClaim(claim: Omit<ClaimRow, "created_at">): void {
    this.checkNotClosed();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO claims (id, run_id, claim_text, section_heading, claim_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        claim.id,
        claim.run_id,
        claim.claim_text,
        claim.section_heading ?? null,
        claim.claim_index ?? null,
        now,
      );
  }

  getClaimsByRun(runId: string): ClaimRow[] {
    this.checkNotClosed();
    return this.db
      .prepare("SELECT * FROM claims WHERE run_id = ? ORDER BY claim_index")
      .all(runId) as ClaimRow[];
  }

  // -------------------------------------------------------------------------
  // Claim-Evidence Links
  // -------------------------------------------------------------------------

  insertClaimEvidence(link: Omit<ClaimEvidenceRow, "created_at">): void {
    this.checkNotClosed();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO claim_evidence (id, claim_id, evidence_span_id, relevance_score, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(link.id, link.claim_id, link.evidence_span_id, link.relevance_score ?? null, now);
  }

  getClaimEvidenceByRun(runId: string): ClaimEvidenceRow[] {
    this.checkNotClosed();
    return this.db
      .prepare(
        `SELECT ce.* FROM claim_evidence ce
         JOIN claims c ON ce.claim_id = c.id
         WHERE c.run_id = ? ORDER BY ce.created_at`,
      )
      .all(runId) as ClaimEvidenceRow[];
  }

  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------

  createCollection(params: {
    name: string;
    description?: string;
    embeddingProvider: string;
    embeddingModel: string;
    embeddingDimension: number;
    chunkSize?: number;
    chunkOverlap?: number;
    hybridAlpha?: number;
    topK?: number;
  }): string {
    this.checkNotClosed();
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO collections
          (id, name, description, embedding_provider, embedding_model, embedding_dimension,
           chunk_size, chunk_overlap, hybrid_alpha, top_k, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.name,
        params.description ?? null,
        params.embeddingProvider,
        params.embeddingModel,
        params.embeddingDimension,
        params.chunkSize ?? 800,
        params.chunkOverlap ?? 100,
        params.hybridAlpha ?? 0.5,
        params.topK ?? 10,
        now,
      );
    return id;
  }

  listCollections(): CollectionRow[] {
    this.checkNotClosed();
    return this.db.prepare("SELECT * FROM collections ORDER BY created_at DESC").all() as CollectionRow[];
  }

  getCollection(id: string): CollectionRow | null {
    this.checkNotClosed();
    const row = this.db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRow | undefined;
    return row ?? null;
  }

  deleteCollection(id: string): void {
    this.checkNotClosed();
    this.db.prepare("DELETE FROM collections WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  createDocument(params: {
    collectionId: string;
    filename: string;
    filePath: string;
    contentHash?: string;
  }): string {
    this.checkNotClosed();
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO documents
          (id, collection_id, filename, file_path, content_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'indexing', ?)`,
      )
      .run(id, params.collectionId, params.filename, params.filePath, params.contentHash ?? null, now);
    return id;
  }

  getDocument(id: string): DocumentRow | null {
    this.checkNotClosed();
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
    return row ?? null;
  }

  listDocumentsByCollection(collectionId: string): DocumentRow[] {
    this.checkNotClosed();
    return this.db.prepare("SELECT * FROM documents WHERE collection_id = ? ORDER BY created_at DESC, ROWID DESC").all(collectionId) as DocumentRow[];
  }

  updateDocumentStatus(id: string, status: string, errorMessage?: string, chunkCount?: number): void {
    this.checkNotClosed();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE documents SET status = ?, error_message = ?, chunk_count = ?, indexed_at = ? WHERE id = ?",
      )
      .run(status, errorMessage ?? null, chunkCount ?? null, now, id);
  }

  deleteDocument(id: string): void {
    this.checkNotClosed();
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------------------
  // Document Chunks
  // -------------------------------------------------------------------------

  insertDocumentChunk(params: {
    documentId: string;
    collectionId: string;
    chunkIndex: number;
    text: string;
    contentHash?: string;
    startOffset?: number;
    endOffset?: number;
  }): void {
    this.checkNotClosed();
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO document_chunks
          (id, document_id, collection_id, chunk_index, text, content_hash, start_offset, end_offset, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.documentId,
        params.collectionId,
        params.chunkIndex,
        params.text,
        params.contentHash ?? null,
        params.startOffset ?? null,
        params.endOffset ?? null,
        now,
      );
  }

  getDocumentChunks(documentId: string): DocumentChunkRow[] {
    this.checkNotClosed();
    return this.db.prepare("SELECT * FROM document_chunks WHERE document_id = ? ORDER BY chunk_index").all(documentId) as DocumentChunkRow[];
  }

  getDocumentChunk(documentId: string, chunkIndex: number): DocumentChunkRow | null {
    this.checkNotClosed();
    const row = this.db.prepare("SELECT * FROM document_chunks WHERE document_id = ? AND chunk_index = ?").get(documentId, chunkIndex) as DocumentChunkRow | undefined;
    return row ?? null;
  }

  deleteDocumentChunks(documentId: string): void {
    this.checkNotClosed();
    this.db.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(documentId);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
