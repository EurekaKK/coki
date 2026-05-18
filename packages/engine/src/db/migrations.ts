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
  {
    version: 3,
    name: "evidence_spans_claims",
    sql: `
CREATE TABLE IF NOT EXISTS evidence_spans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  subtask_id TEXT,
  quote TEXT NOT NULL,
  url TEXT,
  page_title TEXT,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  section_heading TEXT,
  claim_index INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_span_id TEXT NOT NULL REFERENCES evidence_spans(id) ON DELETE CASCADE,
  relevance_score REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_spans_run_id ON evidence_spans(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_spans_source_id ON evidence_spans(source_id);
CREATE INDEX IF NOT EXISTS idx_claims_run_id ON claims(run_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim_id ON claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_evidence_span_id ON claim_evidence(evidence_span_id);
`,
  },
  {
    version: 4,
    name: "document_rag",
    sql: `
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL DEFAULT 800,
  chunk_overlap INTEGER NOT NULL DEFAULT 100,
  hybrid_alpha REAL NOT NULL DEFAULT 0.5,
  top_k INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT,
  parser_version TEXT,
  chunk_count INTEGER,
  status TEXT NOT NULL DEFAULT 'indexing',
  indexed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_collection_id ON document_chunks(collection_id);
`,
  },
];
