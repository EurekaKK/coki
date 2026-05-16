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

  createRun(query: string, depth: number): string {
    this.checkNotClosed();
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO runs (id, user_query, depth, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(id, query, depth, now);
    return id;
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
  // Lifecycle
  // -------------------------------------------------------------------------

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
