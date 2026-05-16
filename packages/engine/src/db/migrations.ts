/**
 * Coki Engine Database Migrations
 *
 * Each migration has a version number, name, and SQL body.
 * Migrations are applied idempotently via the schema_migrations table.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_query TEXT NOT NULL,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  research_plan TEXT,
  cited_report TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  url TEXT,
  document_id TEXT,
  chunk_id TEXT,
  canonical_url TEXT,
  title TEXT,
  snippet TEXT,
  content_hash TEXT,
  fetch_status TEXT DEFAULT 'ok',
  retrieved_at TEXT NOT NULL,
  cited_in_report INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  role TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  phase TEXT,
  event_type TEXT,
  message TEXT,
  details TEXT,
  level TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB,
  plain_value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_sources_run_id ON sources(run_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_run_id ON llm_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_trace_logs_run_id_created_at ON trace_logs(run_id, created_at);
`,
  },
  {
    version: 2,
    name: "report_references",
    sql: `
CREATE TABLE IF NOT EXISTS report_references (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ref_number INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE(run_id, ref_number)
);

CREATE INDEX IF NOT EXISTS idx_report_references_run_id ON report_references(run_id);
`,
  },
];
