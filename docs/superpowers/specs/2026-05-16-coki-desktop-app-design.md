# Coki — TypeScript Desktop Deep Research App

## Overview

Coki is a complete TypeScript rewrite of [Deep-Research-Agent](/Users/eureka/codes/Deep-Research-Agent) as an Electron desktop application. It preserves the original 7-node multi-agent research pipeline while replacing the Python/LangGraph backend with TypeScript and the vanilla JS frontend with React.

**Key decisions:**
- Full TypeScript rewrite (no Python dependency)
- Electron 42 + React 19 + shadcn/ui + Tailwind CSS
- Custom state-machine pipeline + Vercel AI SDK 6 for LLM interactions
- Tavily as the sole search provider (Search + Extract APIs)
- vectra (TS-native) for vector + BM25 hybrid search in document RAG
- pino for structured logging, AsyncLocalStorage for trace context
- Evidence-span based citation system with claims and references
- API keys encrypted via Electron safeStorage
- Document import via main-process dialog (no arbitrary path from renderer)

---

## 0. Version Matrix

| Component | Locked Version | Notes |
|-----------|---------------|-------|
| Electron | **42.x** | Node 24.15.0 runtime |
| Node.js (runtime) | **24.x** | Bundled with Electron 42 |
| vectra | **0.14.x** | Requires Node >=22.19.0 |
| ai (Vercel AI SDK) | **6.x** | `stopWhen`, `stepCountIs`, `Output.object()` |
| @ai-sdk/* | **3.x** | Provider packages |
| React | **19.x** | |
| better-sqlite3 | **12.x** | Must rebuild via `@electron/rebuild` |
| pnpm | **9.x** | Workspace protocol |

All runtime and build dependencies must be pinned in `package.json` — no floating `latest`.

---

## 1. Project Structure

```
coki/
├── apps/
│   ├── main/                    # Electron main process
│   │   ├── src/
│   │   │   ├── index.ts         # App entry, BrowserWindow creation
│   │   │   ├── ipc.ts           # IPC handlers (research, config, documents)
│   │   │   ├── security.ts      # CSP, permission handlers, safeStorage
│   │   │   ├── tray.ts          # System tray
│   │   │   └── updater.ts       # Auto-update
│   │   └── package.json
│   ├── preload/                 # Electron preload script (thin, esbuild single-file)
│   │   ├── src/
│   │   │   └── index.ts         # contextBridge only: exposeInMainWorld("coki", api)
│   │   └── package.json
│   └── renderer/                # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/           # Home, Dashboard, Report, History, Library, Settings
│       │   ├── components/      # Shared components
│       │   ├── hooks/           # useResearch, useStream, etc.
│       │   ├── stores/          # Zustand stores
│       │   └── lib/             # Utilities
│       ├── index.html           # Includes CSP meta tag
│       └── package.json
├── packages/
│   ├── engine/                  # Research engine (pure logic, no Electron dependency)
│   │   ├── src/
│   │   │   ├── pipeline/        # Pipeline state machine + 7 nodes
│   │   │   ├── agents/          # ReAct Agent implementation
│   │   │   ├── search/          # Tavily client (search + extract)
│   │   │   ├── rag/             # Document RAG (vectra vector + BM25)
│   │   │   ├── citation/        # Evidence/Citation subsystem
│   │   │   ├── extraction/      # Content extraction fallback (readability)
│   │   │   ├── llm/             # LLM client wrapper (AI SDK 6)
│   │   │   ├── db/              # SQLite persistence
│   │   │   ├── config/          # Configuration management
│   │   │   ├── tracing/         # Observability (pino + AsyncLocalStorage)
│   │   │   └── models/          # Type definitions (Zod schemas)
│   │   └── package.json
│   └── shared/                  # Cross-package shared types
│       ├── src/
│       │   ├── types.ts         # Shared types
│       │   ├── events.ts        # IPC event definitions
│       │   └── constants.ts
│       └── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── electron-builder.yml
└── package.json
```

**Key constraints:**
- `packages/engine` has zero Electron dependencies — can run and be tested independently in Node.js
- `apps/main` imports `packages/engine` and wires it to IPC
- `apps/preload` is extremely thin: only `contextBridge.exposeInMainWorld`. No file I/O, no DB access, no complex logic. Built by esbuild into a single file for sandbox compatibility.
- `packages/shared` ensures type consistency between main and renderer

---

## 2. Core Architecture — Pipeline State Machine

### 2.1 Explicit state machine

```typescript
// packages/engine/src/pipeline/pipeline.ts
type NodeId = "init" | "plan" | "split" | "subagents" | "reflection" | "synthesize" | "cite";

interface PipelineNode {
  id: NodeId;
  run: (ctx: PipelineContext) => Promise<PipelineContext>;
}

interface Transition {
  from: NodeId;
  decide: (ctx: PipelineContext) => NodeId | "end";
}

class Pipeline {
  private nodes: Map<NodeId, PipelineNode>;
  private transitions: Transition[];

  constructor(config: PipelineConfig);
  run(initialState: ResearchState): AsyncGenerator<PipelineEvent>;
}
```

- `Pipeline.run()` returns an `AsyncGenerator` yielding progress events
- Main process forwards events to renderer via IPC
- Transitions are explicit: reflection → subagents (if gaps), reflection → synthesize (if no gaps), etc.
- Cancellation, resume, debug timeline, and failure retry all operate on node boundaries

### 2.2 Seven-node mapping

All LLM calls use AI SDK 6. Structured output via `generateText({ output: Output.object({ schema }) })`, NOT the deprecated `generateObject`. Tool loops via `stopWhen: stepCountIs(N)`.

When combining tools with structured output, structured output itself consumes one step — reserve one extra step.

| Node | Implementation | LLM Usage |
|------|---------------|-----------|
| **init** | Pure function, no LLM | None |
| **plan** | `generateText({ output: Output.object({ schema }) })` | Structured output; depth 2-3 use `stopWhen: stepCountIs(N+1)` + search tool |
| **split** | `generateText({ output: Output.object({ schema }) })` | Structured output with JSON self-healing retry |
| **subagents** | Bounded concurrent execution (see 2.4) | Each subagent runs independent ReAct loop |
| **reflection** | `generateText({ output: Output.object({ schema }) })` | Structured scoring + gap detection |
| **synthesize** | `streamText({ prompt })` | Streaming synthesis, truncation continuation up to 6 rounds |
| **cite** | Evidence/Citation subsystem (see §3) | Maps evidence spans to numbered references |

### 2.3 ReAct Subagent

```typescript
// packages/engine/src/agents/react-agent.ts
import { generateText, Output, stepCountIs } from "ai";

async function runSubagent(
  subtask: Subtask,
  tools: ToolSet,
  config: AgentConfig,
  signal: AbortSignal
): Promise<SubagentReport> {
  const { output } = await generateText({
    model: config.model,
    system: SUBAGENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: subtask.instruction }],
    tools,
    output: Output.object({ schema: SubagentReportSchema }),
    stopWhen: stepCountIs(config.maxSteps + 1),  // +1 for final structured output step
    abortSignal: signal,
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Emit progress events, guard rail checks
    }
  });
  return output;  // schema-validated SubagentReport
}
```

Guard rails from the original (search round limits, consecutive failure detection, forced search disable in writing phase) are implemented via `onStepFinish` callbacks.

### 2.4 Bounded concurrency for subagents

```typescript
import pLimit from 'p-limit';

const CONCURRENCY: Record<Depth, number> = {
  1: 2,  // Quick
  2: 3,  // Balanced
  3: 4,  // Deep
};

async function runSubagentsParallel(
  subtasks: Subtask[],
  config: AgentConfig,
  signal: AbortSignal
): Promise<SubagentReport[]> {
  const limit = pLimit(CONCURRENCY[config.depth]);
  return Promise.all(
    subtasks.map((task) =>
      limit(() => runSubagent(task, tools, {
        ...config,
        timeoutMs: config.timeoutMs,
        maxSearchCalls: config.maxSearchCalls,
        maxFetchCalls: config.maxFetchCalls,
        maxToolErrors: config.maxToolErrors,
        maxTokens: config.maxTokens,
      }, signal))
    )
  );
}
```

Each subagent has per-run budgets: `timeoutMs`, `maxSearchCalls`, `maxFetchCalls`, `maxToolErrors`, `maxTokens`.

---

## 3. Citation System — Evidence Spans + Claims

### 3.1 Data model

```typescript
interface SourceRecord {
  id: string;            // TEXT UUID
  runId: string;
  sourceType: "web" | "document";
  url?: string;          // web sources only
  documentId?: string;   // document sources only
  chunkId?: string;      // document sources only
  canonicalUrl?: string;
  title?: string;
  retrievedAt: string;
  contentHash: string;
  fetchStatus: "ok" | "failed" | "stale";
}

interface EvidenceSpan {
  id: string;            // TEXT UUID
  runId: string;
  sourceId: string;      // → sources.id
  quote: string;
  startOffset?: number;
  endOffset?: number;
}

interface Claim {
  id: string;            // TEXT UUID
  runId: string;
  text: string;
  confidence: "high" | "medium" | "low";
}

interface ReportReference {
  runId: string;
  sourceId: string;      // → sources.id
  referenceNumber: number;
  citedText?: string;
}
```

### 3.2 Flow

1. **During subagent research**: each subagent produces evidence spans linked to source records
2. **During synthesis**: the synthesizer outputs a draft with evidence IDs inline, e.g. `市场规模在2024年继续增长。[E12][E15]`
3. **During cite**:
   - Map `[E12]` → source → `[^1]` numbered references
   - Verify URL liveness
   - Deduplicate and strip orphan references
   - Write `report_references` table

This is significantly more reliable than regex-replacing `[src: url]` patterns.

---

## 4. Search Provider — Tavily

### 4.1 Tools

Two tools for subagents, both using Tavily:

1. **`tavily_search`** — Tavily `/search` API, returns results with content excerpts
2. **`tavily_extract`** — Tavily `/extract` API, fetches full page content for given URLs

### 4.2 Fallback extraction

If Tavily Extract fails (rate limit, blocked, etc.):

1. **Primary fallback**: `@mozilla/readability` + `jsdom` (~200ms, static HTML)
2. **Optional advanced fallback**: `playwright` headless browser (not bundled by default, opt-in)

Playwright is NOT included in the default build. Users can enable it in settings if needed.

### 4.3 Implementation

```typescript
interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  extract(urls: string[]): Promise<ExtractResult[]>;
}
```

Tavily API key stored encrypted in SQLite (see §6.5).

---

## 5. Document RAG

### 5.1 Vector Store + Hybrid Search

Use **vectra** (v0.14.x) — TS-native vector database with built-in BM25 hybrid search (via `wink-bm25-text-search`). File-based local storage.

### 5.2 Embedding Models

```yaml
embedding:
  online:
    provider: zhipu
    model: embedding-3
    dimensions: 512  # must be explicitly requested; default may be 2048
  local:
    model: bge-small-zh-v1.5
    dimensions: 512
```

Both use 512-dimension vectors. Online and local are separate indexes (different embedding spaces). Rebuild index when switching models.

### 5.3 Chinese tokenization

vectra's built-in BM25 uses `wink-bm25-text-search` which has limited CJK support. Configure a tokenizer:

```yaml
rag:
  tokenizer:
    zh: "jieba-wasm"          # Chinese segmentation
    fallback: "unicode-word-boundary"  # Latin scripts
```

### 5.4 RAG Configuration

```yaml
rag:
  embedding_provider: "zhipu"  # or "local"
  chunk_size: 800
  chunk_overlap: 100
  hybrid_alpha: 0.5            # 0 = pure BM25, 1 = pure vector
  top_k: 10
  tokenizer:
    zh: "jieba-wasm"
    fallback: "unicode-word-boundary"
```

### 5.5 Document Processing

Supports three formats (first version):

- **TXT**: Direct read
- **Markdown**: `marked` parse → extract plain text
- **PDF**: `pdf-parse` (text extraction only)

**First version limitations**: PDF first version extracts text only. Tables, scanned PDFs, images, formulas are not guaranteed. OCR is out of scope for MVP.

Pipeline: upload → parse → chunk (800 chars, 100 overlap) → embed → index

Document indexing runs in a **Worker Thread** with an **IndexingQueue**:
- Same collection: serial (one indexer at a time)
- Different collections: can run in parallel
- Each Worker opens its own DB connection (no shared connection with main)

```typescript
class IndexingQueue {
  enqueue(collectionId: string, job: IndexJob): Promise<void>;
  // Per-collection serialization; cross-collection parallelism
}
```

---

## 6. Persistence

Using **better-sqlite3** (synchronous, high-performance SQLite binding).

### 6.1 Native module rebuild

```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  }
}
```

Or configure in `electron-builder.yml` to rebuild automatically during packaging.

Electron 42 no longer auto-downloads its binary via postinstall. CI pipelines should run `npx install-electron` before `electron-rebuild`.

### 6.2 Performance considerations

- **Trace logs**: batched flush (buffer writes, flush every 500ms or 100 entries)
- **Document indexing**: runs in Worker Thread (own DB connection)
- **Bulk inserts** (chunks, sources): use transactions (`db.transaction(...)`)
- **Main process**: only does IPC orchestration; heavy work goes to engine workers

### 6.3 Database location

`app.getPath('userData')` + `/data.db`
- macOS: `~/Library/Application Support/coki/data.db`

### 6.4 API key encryption

API keys are encrypted using Electron `safeStorage.encryptString()` before being stored in SQLite.

```typescript
import { safeStorage } from 'electron';

// Encrypt before storing (async API — non-blocking, supports key rotation)
const encrypted = await safeStorage.encryptStringAsync(apiKey);
// encrypted is a Buffer → store as BLOB

// Decrypt when reading — returns { result, shouldReEncrypt }
const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encryptedBuffer);
if (shouldReEncrypt) {
  const newEncrypted = await safeStorage.encryptStringAsync(result);
  // update SQLite encrypted_value
}
return result;
```

On startup, check availability: `await safeStorage.isAsyncEncryptionAvailable()` — especially important on Linux where the libsecret/kwallet backend may be missing.

`packages/engine` never imports Electron APIs. Secret encryption/decryption is handled in `apps/main` only. Engine receives decrypted runtime secrets through dependency injection.

Settings page shows only "configured" / "not configured" — never echoes full API keys.

### 6.5 Schema

```sql
PRAGMA foreign_keys = ON;
-- Every SQLite connection (main process + Worker Threads) must execute this after opening.

-- 1. Research runs
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_query TEXT NOT NULL,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL,           -- pending/running/completed/cancelled/failed
  research_plan TEXT,             -- JSON: dimensions, keywords, methodology
  cited_report TEXT,              -- Final report (Markdown)
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);

-- 2. Subtask reports
CREATE TABLE subtask_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  subtask_index INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  report TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 3. Sources
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,      -- 'web' | 'document'
  url TEXT,                       -- web sources
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  chunk_id TEXT REFERENCES document_chunks(id) ON DELETE SET NULL,
  canonical_url TEXT,
  title TEXT,
  snippet TEXT,
  content_hash TEXT,
  fetch_status TEXT DEFAULT 'ok', -- ok/failed/stale
  retrieved_at TEXT NOT NULL,
  cited_in_report INTEGER DEFAULT 0
);

-- 4. Evidence spans
CREATE TABLE evidence_spans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL
);

-- 5. Claims
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  confidence TEXT NOT NULL,       -- high/medium/low
  created_at TEXT NOT NULL
);

-- 6. Claim ↔ Evidence mapping
CREATE TABLE claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence_spans(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, evidence_id)
);

-- 7. Report references (final numbered citations in the report)
CREATE TABLE report_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  reference_number INTEGER NOT NULL,
  cited_text TEXT,
  UNIQUE(run_id, reference_number),
  UNIQUE(run_id, source_id)      -- one source = one reference number per run
);

-- 8. Document collections
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_provider TEXT NOT NULL,  -- 'zhipu' | 'local'
  embedding_model TEXT NOT NULL,     -- 'embedding-3' | 'bge-small-zh-v1.5'
  embedding_dimension INTEGER NOT NULL,  -- 512
  chunk_size INTEGER NOT NULL DEFAULT 800,
  chunk_overlap INTEGER NOT NULL DEFAULT 100,
  index_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 9. Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,         -- app-managed copy under userData
  content_hash TEXT,
  parser_version TEXT,
  chunk_count INTEGER,
  status TEXT NOT NULL,           -- indexing/ready/error
  indexed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- 10. Document chunks
CREATE TABLE document_chunks (
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

-- 11. Config (encrypted API keys)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB,           -- safeStorage encrypted; NULL for non-secret values
  plain_value TEXT,               -- for non-secret config (log level, UI prefs, etc.)
  updated_at TEXT NOT NULL
);

-- 12. Trace logs
CREATE TABLE trace_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  phase TEXT,
  event_type TEXT,
  message TEXT,
  details TEXT,                   -- JSON
  level TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 13. LLM call records
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  role TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_sources_run_id ON sources(run_id);
CREATE INDEX idx_sources_cited ON sources(run_id, cited_in_report);
CREATE INDEX idx_evidence_run_id ON evidence_spans(run_id);
CREATE INDEX idx_evidence_source_id ON evidence_spans(source_id);
CREATE INDEX idx_claims_run_id ON claims(run_id);
CREATE INDEX idx_trace_logs_run_id_created_at ON trace_logs(run_id, created_at);
CREATE INDEX idx_llm_calls_run_id ON llm_calls(run_id);
CREATE INDEX idx_documents_collection_id ON documents(collection_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_collection_id ON document_chunks(collection_id);

-- 14. Schema migrations
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

All schema changes are applied through ordered migrations, not ad-hoc `CREATE TABLE` statements. Desktop users have long-lived local databases that cannot be rebuilt from scratch.

---

## 7. Observability

### 7.1 Logging

Using **pino** + **AsyncLocalStorage** for trace context propagation.

```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const traceContext = new AsyncLocalStorage<TraceState>();

function trace(phase: string, eventType: string, message: string, details?: object) {
  const ctx = traceContext.getStore();
  logger.info({ runId: ctx?.runId, phase, eventType, ...details }, message);
}
```

- Logs batched-flushed to SQLite (not per-write synchronous)
- Renderer receives real-time log events via IPC

### 7.2 IPC event buffering

**Problem**: If renderer calls `start()` then registers `on.researchProgress`, early events may be lost.

**Solution**: Main buffers events per runId. `getTimeline(runId)` returns full history. `researchProgress` only handles real-time incremental events after subscription.

```typescript
// Renderer usage pattern:
const timeline = await window.coki.research.getTimeline(runId);  // full history
const unsubscribe = window.coki.on.researchProgress((event) => { /* incremental */ });
```

### 7.3 LLM Call Tracking

Every AI SDK call records: role, model, token counts (input/output), latency.

---

## 8. UI Design

### 8.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (240px)  │         Main Content Area        │
│                    │                                 │
│  ┌──────────────┐  │  ┌──────────────────────────┐  │
│  │ New Research │  │  │                          │  │
│  │       [+]    │  │  │   Current page content   │  │
│  ├──────────────┤  │  │                          │  │
│  │ History      │  │  │                          │  │
│  │  ├ Research A│  │  │                          │  │
│  │  ├ Research B│  │  │                          │  │
│  │  └ Research C│  │  │                          │  │
│  ├──────────────┤  │  │                          │  │
│  │ Library      │  │  │                          │  │
│  ├──────────────┤  │  │                          │  │
│  │ Settings     │  │  │                          │  │
│  └──────────────┘  │  └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 8.2 Pages

**New Research (Home)**
- Large query input (multi-line)
- Depth selector: Quick / Balanced / Deep (with time estimates)
- Collapsible advanced options: output language, document collection selection, custom prompt

**Research Dashboard (running)**
- Progress bar + current phase text + estimated time remaining
- **Cost/token panel**: total tokens used, estimated cost, per-subagent LLM call count, search call count, cited vs found sources count
- Real-time log stream (collapsible)
- Subtask card grid: each card shows instruction, status, live output preview

**Report (completed)**
- Left: Full report (Markdown rendered, citations clickable)
- Right: Sources panel (collapsible), showing all sources with "cited" vs "found but not cited" distinction
- Toolbar: Export (Markdown), copy, re-research (see below)

**History**
- Card list view: query summary, depth, time, status, token usage
- Search and filter by depth/status
- Click to view report
- **Re-run options**:
  - Full re-run (new research from scratch)
  - Reuse sources, re-synthesize only
  - Reuse plan/subtasks, re-search only

**Library**
- Left: Collection list
- Right: Document list for selected collection + upload button
- Upload triggers main-process `dialog.showOpenDialog` (renderer never passes file paths)
- Formats: TXT, MD, PDF only

**Settings**
- Sectioned form: LLM config (base_url, model, encrypted API key), Tavily API key (encrypted), embedding model, RAG parameters, UI preferences
- API key fields show "configured" / "not configured", never echo the key

### 8.3 Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| UI library | **shadcn/ui** | Customizable, zero runtime, TS-native |
| CSS | **Tailwind CSS** | Pairs with shadcn/ui |
| State | **Zustand** | Lightweight, TS-friendly |
| Routing | **React Router** | SPA routing for desktop |
| Markdown | **react-markdown** + **remark-gfm** | React-native, GFM support |
| Icons | **Lucide React** | shadcn/ui default |

---

## 9. Electron Architecture

### 9.1 Process model

```
┌──────────────────┐     IPC      ┌──────────────────┐
│   Main Process   │◄────────────►│ Renderer Process  │
│                  │ (contextBridge)                   │
│  - engine        │              │  - React App      │
│  - SQLite        │              │  - Zustand Store  │
│  - Pipeline      │              │  - UI Components  │
│  - Search/RAG    │              │                   │
│  - safeStorage   │              │                   │
│  - dialog        │              │                   │
└──────────────────┘              └──────────────────┘
        │
        ▼
┌──────────────────┐
│  Preload (thin)   │
│  contextBridge    │
│  esbuild single   │
└──────────────────┘
```

### 9.2 IPC API

```typescript
interface CokiAPI {
  research: {
    start(query: string, options: ResearchOptions): Promise<string>;  // returns runId
    cancel(runId: string): Promise<void>;
    getHistory(): Promise<RunSummary[]>;
    getReport(runId: string): Promise<RunReport>;
    getTimeline(runId: string): Promise<TraceEvent[]>;
  };

  documents: {
    importFiles(collectionId: string): Promise<Document[]>;  // main shows dialog
    deleteDocument(documentId: string): Promise<void>;
    reindexDocument(documentId: string): Promise<void>;
    getCollections(): Promise<Collection[]>;
    createCollection(name: string, desc?: string): Promise<Collection>;
    deleteCollection(id: string): Promise<void>;
    search(collectionIds: string[], query: string): Promise<ChunkResult[]>;
  };

  config: {
    get(): Promise<CokiConfig>;
    update(patch: Partial<CokiConfig>): Promise<void>;
  };

  on: {
    researchProgress(callback: (event: ProgressEvent) => void): () => void;
    researchLog(callback: (event: LogEvent) => void): () => void;
    researchComplete(callback: (event: CompleteEvent) => void): () => void;
    researchError(callback: (event: ErrorEvent) => void): () => void;
  };
}
```

**Document import security**: Renderer calls `importFiles(collectionId)`. Main process opens `dialog.showOpenDialog` with extension filter (`*.txt, *.md, *.pdf`). Files are copied to `app.getPath("userData")/documents/{collectionId}/{docId}/original.ext`. All subsequent indexing, parsing, and display operate on the app-managed copy. Renderer never specifies an absolute file path.

**Engine ↔ Main boundary**:

```typescript
// packages/engine — never imports Electron
interface RuntimeSecrets {
  llmApiKey: string;
  tavilyApiKey: string;
}

// apps/main — decrypts, then injects
const secrets = await secretStore.load();  // decrypts via safeStorage
const engine = new ResearchEngine(db, config, secrets);
```

### 9.3 Security

```typescript
// apps/main/src/security.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
});

// Block all permission requests (camera, microphone, geolocation, etc.)
session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
  callback(false);
});

// External links: open in system browser, https: only
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") {
    shell.openExternal(url);
  }
  return { action: "deny" };
});

// Allow app's own origin, open external https: links in system browser
mainWindow.webContents.on("will-navigate", (event, url) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    event.preventDefault();
    return;
  }

  const isProdApp = parsed.protocol === "file:";
  const isDevServer =
    isDev && parsed.protocol === "http:" && parsed.hostname === "localhost";

  if (isProdApp || isDevServer) return;

  event.preventDefault();
  if (parsed.protocol === "https:") {
    shell.openExternal(url);
  }
});
```

**CSP** (in renderer `index.html`):

Production:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'none';
```

Development (add Vite dev server + HMR websocket):
```
default-src 'self'; script-src 'self' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'none';
```

**Preload constraints**: Preload is built by esbuild into a single file. It contains only `contextBridge.exposeInMainWorld("coki", api)`. No file I/O, no DB access, no complex logic.

### 9.4 Cancellation propagation

`AbortSignal` must be threaded through:
- AI SDK calls (`abortSignal` parameter)
- Tavily HTTP requests
- readability/jsdom extraction
- Embedding batches
- Document indexing queue

Terminal events: `research.cancelled`, `research.failed`, `research.completed`.

### 9.5 Main process entry

```typescript
app.whenReady().then(async () => {
  const db = new CokiDatabase(getDataPath());
  const configStore = new ConfigStore(db);
  const secretStore = new SecretStore(db);
  const secrets = await secretStore.load();
  const config = await configStore.loadPlainConfig();

  const engine = new ResearchEngine(db, config, secrets);

  registerIPCHandlers(engine, db, configStore, secretStore);
  createMainWindow();
});
```

---

## 10. Key Libraries Summary

| Purpose | Library | Notes |
|---------|---------|-------|
| Desktop framework | Electron 42.x | Node 24.x runtime |
| Frontend framework | React 19.x | |
| UI components | shadcn/ui | Pinned, TS-native |
| CSS | Tailwind CSS 4.x | Utility-first |
| State management | Zustand 5.x | Lightweight |
| LLM interaction | ai 6.x (Vercel AI SDK) | `generateText`, `streamText`, `Output.object()`, `stopWhen` |
| SQLite | better-sqlite3 12.x | Native, requires `@electron/rebuild` |
| Vector store + BM25 | vectra 0.14.x | Pure TS, built-in hybrid search |
| Search | @tavily/core | Pinned, Search + Extract APIs |
| Content extraction | @mozilla/readability + jsdom | Pinned, fallback |
| PDF parsing | pdf-parse | Pinned, pure JS |
| Concurrency | p-limit | Pinned, bounded parallelism |
| Logging | pino 9.x | Structured JSON |
| Trace context | AsyncLocalStorage | Node.js native |
| Chinese tokenization | jieba-wasm | Pinned, for BM25 |
| Markdown rendering | react-markdown | Pinned |
| Build (renderer) | Vite 6.x | |
| Build (main/preload) | esbuild | Pinned, single-file preload |
| Packaging | electron-builder | Pinned, native module rebuild |
| Package manager | pnpm 9.x | Monorepo workspaces |

---

## 11. MVP Phasing

### Phase 1A: Run the loop (core pipeline)

- Electron shell with security config (CSP, sandbox, safeStorage)
- Settings: LLM (OpenAI-compatible) + Tavily API key
- 7-node pipeline state machine
- Basic dashboard (progress bar, phase text, log stream)
- Final Markdown report display
- SQLite: runs, sources, llm_calls tables
- Basic citation: `[src: url]` → numbered references with URL liveness check
- Markdown export

### Phase 1B: Trust and polish

- Evidence spans + claims + report_references
- Citation verifier (evidence → numbered references)
- Cost/token panel in dashboard
- Timeline UI (trace_logs visualization)
- Re-run options (full, reuse sources, reuse plan)

### Phase 2: Document Library RAG

- TXT / MD / PDF parsing
- Collection / document management UI
- vectra index with hybrid search + jieba-wasm tokenization
- IndexingQueue with per-collection serialization
- Document search tool for subagents
- Report citations linking to local documents (source_type: "document")

### Phase 3: Engineering polish

- Playwright optional fallback for JS pages
- Auto-update (electron-updater)
- System tray
- Advanced cost analytics
- Re-run with source/plan reuse persistence
