# Coki — TypeScript Desktop Deep Research App

## Overview

Coki is a complete TypeScript rewrite of [Deep-Research-Agent](/Users/eureka/codes/Deep-Research-Agent) as an Electron desktop application. It preserves the original 7-node multi-agent research pipeline while replacing the Python/LangGraph backend with TypeScript and the vanilla JS frontend with React.

**Key decisions:**
- Full TypeScript rewrite (no Python dependency)
- Electron + React + shadcn/ui + Tailwind CSS
- Custom state-machine pipeline + Vercel AI SDK for LLM interactions
- Tavily as the sole search provider (first version)
- vectra (TS-native) for vector + BM25 hybrid search in document RAG
- pino for structured logging, AsyncLocalStorage for trace context
- Evidence-span based citation system (not regex-only)

---

## 0. Version Matrix

All versions locked to avoid ABI / API mismatches.

| Component | Version | Constraint |
|-----------|---------|------------|
| Electron | 41+ (recommend 42) | Node 24.x runtime |
| Node.js (runtime) | >=22.19.0 or 24.x | Required by vectra 0.14+ |
| vectra | 0.14.x | Node >=22.19.0 minimum |
| ai (Vercel AI SDK) | 5.x or 6.x | Uses `stopWhen` / `stepCountIs`, NOT `maxSteps` |
| better-sqlite3 | latest | Must rebuild via `@electron/rebuild` per Electron ABI |
| React | 18 or 19 | Lock to template compatibility; default to 19 if shadcn/ui supports it |
| pnpm | 9+ | Workspace protocol |

---

## 1. Project Structure

```
coki/
├── apps/
│   ├── main/                    # Electron main process
│   │   ├── src/
│   │   │   ├── index.ts         # App entry, BrowserWindow creation
│   │   │   ├── ipc.ts           # IPC handlers (research, config, documents)
│   │   │   ├── tray.ts          # System tray
│   │   │   └── updater.ts       # Auto-update
│   │   └── package.json
│   ├── preload/                 # Electron preload script
│   │   ├── src/
│   │   │   └── index.ts         # contextBridge: exposes safe API to renderer
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
│   │   │   ├── llm/             # LLM client wrapper (Vercel AI SDK)
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
- `apps/preload` only exposes typed APIs via `contextBridge`
- `packages/shared` ensures type consistency between main and renderer

---

## 2. Core Architecture — Pipeline State Machine

### 2.1 Explicit state machine (not array of nodes)

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
- Each node is a plain async function: receive context, return updated context
- Transitions are explicit: reflection → subagents (if gaps), reflection → synthesize (if no gaps), etc.
- This makes cancellation, resume, debug timeline, and failure retry straightforward

### 2.2 Seven-node mapping

| Node | Implementation | LLM Usage |
|------|---------------|-----------|
| **init** | Pure function, no LLM | None |
| **plan** | `generateObject({ schema: ResearchPlanSchema })` | Structured output; depth 2-3 use `stopWhen: stepCountIs(N)` + search tool |
| **split** | `generateObject({ schema: SubtaskListSchema })` | Structured output with JSON self-healing retry |
| **subagents** | Bounded concurrent execution (see 2.4) | Each subagent runs independent ReAct loop |
| **reflection** | `generateObject({ schema: ReflectionSchema })` | Structured scoring + gap detection |
| **synthesize** | `streamText({ prompt })` | Streaming synthesis, truncation continuation up to 6 rounds |
| **cite** | Evidence/Citation subsystem (see §3) | Maps evidence spans to numbered references |

### 2.3 ReAct Subagent

```typescript
// packages/engine/src/agents/react-agent.ts
async function runSubagent(
  subtask: Subtask,
  tools: ToolSet,
  config: AgentConfig,
  signal: AbortSignal
): Promise<SubagentReport> {
  const result = await generateText({
    model: config.model,
    system: SUBAGENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: subtask.instruction }],
    tools,
    // AI SDK 5/6: multi-step tool use via stopWhen
    stopWhen: stepCountIs(config.maxSteps),
    abortSignal: signal,
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Emit progress events, guard rail checks
    }
  });
  return extractReport(result);
}
```

AI SDK 5/6 uses `stopWhen` + `stepCountIs` instead of the deprecated `maxSteps`. This lets the LLM autonomously decide when to stop searching and submit a report. Guard rails from the original (search round limits, consecutive failure detection, forced search disable in writing phase) are implemented via `onStepFinish` callbacks.

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
    subtasks.map((task, i) =>
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

## 3. Citation System — Evidence Spans

The `cite` node is upgraded from regex replacement to an evidence/citation subsystem.

### 3.1 Data model

```typescript
interface SourceRecord {
  id: string;
  url: string;
  canonicalUrl: string;
  title?: string;
  retrievedAt: string;
  contentHash: string;
  fetchStatus: "ok" | "failed" | "stale";
}

interface EvidenceSpan {
  sourceId: string;
  quote: string;
  startOffset?: number;
  endOffset?: number;
  usedByClaimId?: string;
}

interface Claim {
  id: string;
  text: string;
  evidenceIds: string[];
  confidence: "high" | "medium" | "low";
}
```

### 3.2 Flow

1. **During subagent research**: each subagent produces evidence spans linked to source records
2. **During synthesis**: the synthesizer outputs a draft with evidence IDs inline, e.g. `市场规模在2024年继续增长。[E12][E15]`
3. **During cite**: the cite node maps `[E12]` → `[^1]` numbered references, verifies URL liveness, deduplicates, and strips orphan references

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
2. **Optional advanced fallback**: `playwright` headless browser (not bundled by default, opt-in for JS-rendered pages)

Playwright is NOT included in the default build. It increases package size and startup time significantly. Users can enable it in settings if they need JS-rendered page extraction.

### 4.3 Implementation

```typescript
interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  extract(urls: string[]): Promise<ExtractResult[]>;
}
```

Configuration: user enters Tavily API key in Settings. Stored in SQLite `config` table.

---

## 5. Document RAG

### 5.1 Vector Store + Hybrid Search

Use **vectra** (v0.14.x) — a TS-native vector database with built-in BM25 hybrid search (via `wink-bm25-text-search`). File-based local storage, supports Pinecone-compatible filtering.

vectra handles:
- Vector similarity search
- BM25 keyword search
- Hybrid ranking (configurable vector/BM25 weight via `hybrid_alpha`)

### 5.2 Embedding Models

User selects in settings:

- **Online**: Zhipu Embedding-3, dimension 512
- **Local**: `bge-small-zh-v1.5` ONNX, dimension 512

Both use 512-dimension vectors. Online and local are still separate indexes (different embedding spaces), but same dimension simplifies validation. Rebuild index when switching models.

### 5.3 RAG Configuration

```yaml
rag:
  embedding_provider: "zhipu"  # or "local"
  chunk_size: 800
  chunk_overlap: 100
  hybrid_alpha: 0.5            # 0 = pure BM25, 1 = pure vector
  top_k: 10
```

### 5.4 Document Processing

Supports three formats (first version):

- **TXT**: Direct read
- **Markdown**: `marked` parse → extract plain text (preserve structure markers)
- **PDF**: `pdf-parse` (based on pdfjs-dist, pure JS, no native dependencies)

Pipeline: upload → parse → chunk (800 chars, 100 overlap) → embed → index

Document indexing runs in a **Worker Thread** to avoid blocking the main process.

---

## 6. Persistence

Using **better-sqlite3** (synchronous, high-performance SQLite binding, standard for Electron main process).

### 6.1 Native module rebuild

better-sqlite3 is a native module. Must rebuild for Electron's ABI:

```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  }
}
```

Or configure in `electron-builder.yml` / Electron Forge to rebuild automatically during packaging.

### 6.2 Performance considerations

better-sqlite3 is synchronous. To avoid blocking the main process event loop:

- **Trace logs**: batched flush (buffer writes, flush every 500ms or 100 entries)
- **Document indexing**: runs in Worker Thread
- **Bulk inserts** (chunks, sources): use transactions (`db.transaction(...)`)
- **Main process**: only does IPC orchestration; heavy work goes to engine workers

### 6.3 Database location

`app.getPath('userData')` + `/data.db`
- macOS: `~/Library/Application Support/coki/data.db`

### 6.4 Schema

```sql
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
  run_id TEXT NOT NULL REFERENCES runs(id),
  subtask_index INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  report TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 3. Sources
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  snippet TEXT,
  content_hash TEXT,
  fetch_status TEXT DEFAULT 'ok',   -- ok/failed/stale
  cited_in_report INTEGER DEFAULT 0
);

-- 4. Document collections
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

-- 5. Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT,
  parser_version TEXT,
  chunk_count INTEGER,
  status TEXT NOT NULL,           -- indexing/ready/error
  indexed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- 6. Evidence spans (citation system)
CREATE TABLE evidence_spans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  source_id INTEGER REFERENCES sources(id),
  quote TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  used_by_claim_id TEXT,
  created_at TEXT NOT NULL
);

-- 7. Trace logs
CREATE TABLE trace_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  phase TEXT,
  event_type TEXT,
  message TEXT,
  details TEXT,                   -- JSON
  level TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 8. LLM call records
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  role TEXT,                      -- planner/subagent/synthesizer etc.
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
```

---

## 7. Observability

### 7.1 Logging

Using **pino** (high-performance structured JSON logger) + **AsyncLocalStorage** for trace context propagation.

```typescript
// packages/engine/src/tracing/logger.ts
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const traceContext = new AsyncLocalStorage<TraceState>();

function trace(phase: string, eventType: string, message: string, details?: object) {
  const ctx = traceContext.getStore();
  logger.info({ runId: ctx?.runId, phase, eventType, ...details }, message);
}
```

- `AsyncLocalStorage` replaces Python's `contextvars` — implicitly propagates `run_id`
- Logs batched-flushed to SQLite (`trace_logs` table) — not per-write synchronous
- Renderer receives real-time log events via IPC for timeline visualization

### 7.2 LLM Call Tracking

Every `generateText` / `streamText` / `generateObject` call records: role, model, token counts (input/output), latency.

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
- **Cost/token panel**: total tokens used, estimated cost, per-subagent LLM call count, search call count
- Real-time log stream (collapsible)
- Subtask card grid: each card shows instruction, status, live output preview

**Report (completed)**
- Left: Full report (Markdown rendered, citations clickable)
- Right: Sources panel (collapsible), showing all cited sources with "cited" vs "found but not cited" distinction
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
- Right: Document list for selected collection + upload area
- Drag-and-drop upload (TXT, MD, PDF)

**Settings**
- Sectioned form: LLM config, Tavily API key, embedding model, RAG parameters, UI preferences

### 8.3 Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| UI library | **shadcn/ui** | Customizable, zero runtime, TS-native |
| CSS | **Tailwind CSS** | Pairs with shadcn/ui, high dev velocity |
| State | **Zustand** | Lightweight, TS-friendly, supports subscriptions |
| Routing | **React Router** | SPA routing for desktop |
| Markdown | **react-markdown** + **remark-gfm** | React-native, GFM support |
| Icons | **Lucide React** | shadcn/ui default icon set |

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
└──────────────────┘              └──────────────────┘
        │
        ▼
┌──────────────────┐
│  Preload Script   │
│  contextBridge    │
└──────────────────┘
```

### 9.2 IPC API

```typescript
// packages/shared/src/events.ts
interface CokiAPI {
  research: {
    start(query: string, options: ResearchOptions): Promise<string>;  // returns runId
    cancel(runId: string): Promise<void>;
    getHistory(): Promise<RunSummary[]>;
    getReport(runId: string): Promise<RunReport>;
    getTimeline(runId: string): Promise<TraceEvent[]>;
  };

  documents: {
    getCollections(): Promise<Collection[]>;
    createCollection(name: string, desc?: string): Promise<Collection>;
    deleteCollection(id: string): Promise<void>;
    uploadDocument(collectionId: string, filePath: string): Promise<void>;
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

### 9.3 Security

```typescript
// apps/main/src/index.ts
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

// Block new windows and navigation
mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
mainWindow.webContents.on("will-navigate", (event, url) => {
  // Only allow app's own origin
});

// External links: shell.openExternal with protocol validation (https: only)
```

- Preload exposes `window.coki` via `contextBridge.exposeInMainWorld`
- No direct `ipcRenderer.invoke` exposed to renderer
- All IPC communication is type-constrained (types from `packages/shared`)

### 9.4 Cancellation propagation

`AbortSignal` must be threaded through:
- AI SDK calls (`abortSignal` parameter)
- Tavily HTTP requests
- readability/jsdom extraction
- Embedding batches
- Document indexing queue

Terminal events: `research.cancelled`, `research.failed`, `research.completed` — renderer does not rely on Promise rejection alone.

### 9.5 Main process entry

```typescript
// apps/main/src/index.ts
app.whenReady().then(() => {
  const db = new CokiDatabase(getDataPath());
  const engine = new ResearchEngine(db, config);
  registerIPCHandlers(engine, db);
  createMainWindow();
});
```

---

## 10. Key Libraries Summary

| Purpose | Library | Notes |
|---------|---------|-------|
| Desktop framework | Electron 41+ | Main process runs engine |
| Frontend framework | React 18/19 | Lock to template compatibility |
| UI components | shadcn/ui | Customizable, TS-native |
| CSS | Tailwind CSS | Utility-first |
| State management | Zustand | Lightweight |
| LLM interaction | Vercel AI SDK 5/6 (`ai`) | `generateText`, `streamText`, `generateObject`, `stopWhen` |
| SQLite | better-sqlite3 | Native, requires `@electron/rebuild` |
| Vector store + BM25 | vectra 0.14.x | Pure TS, built-in hybrid search |
| Search | Tavily SDK | Search + Extract APIs |
| Content extraction | @mozilla/readability + jsdom | Fallback when Tavily Extract fails |
| PDF parsing | pdf-parse | Pure JS |
| Concurrency | p-limit | Bounded subagent parallelism |
| Logging | pino | Structured JSON logs |
| Trace context | AsyncLocalStorage | Implicit run_id propagation |
| Markdown rendering | react-markdown | React component |
| Build | Vite (renderer) + esbuild (main/preload) | Fast builds |
| Packaging | electron-builder | Cross-platform, native module rebuild |
| Package manager | pnpm 9+ | Monorepo with workspaces |

---

## 11. MVP Phasing

### Phase 1: Web Research Core

- Electron shell with security config
- Settings: LLM (OpenAI-compatible) + Tavily API key
- 7-node pipeline state machine
- Streaming dashboard with cost/token panel
- Evidence-span citation system
- History / report / source persistence
- Markdown export

### Phase 2: Document Library RAG

- TXT / MD / PDF parsing
- Collection / document management UI
- vectra index with hybrid search
- Document search tool for subagents
- Report citations linking to local documents

### Phase 3: Engineering Polish

- Playwright optional fallback for JS pages
- Auto-update (electron-updater)
- System tray
- Advanced tracing / timeline UI
- Cost analytics dashboard
- Re-run with source/plan reuse
