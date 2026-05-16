# Coki — TypeScript Desktop Deep Research App

## Overview

Coki is a complete TypeScript rewrite of [Deep-Research-Agent](/Users/eureka/codes/Deep-Research-Agent) as an Electron desktop application. It preserves the original 7-node multi-agent research pipeline while replacing the Python/LangGraph backend with TypeScript and the vanilla JS frontend with React.

**Key decisions:**
- Full TypeScript rewrite (no Python dependency)
- Electron + React + shadcn/ui + Tailwind CSS
- Custom pipeline orchestrator + Vercel AI SDK for LLM interactions
- Tavily as the sole search provider (first version)
- TS-native vector store + custom BM25 for document RAG
- pino for structured logging, AsyncLocalStorage for trace context

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
│   │   │   ├── pipeline/        # Pipeline orchestrator + 7 nodes
│   │   │   ├── agents/          # ReAct Agent implementation
│   │   │   ├── search/          # Search provider abstraction (Tavily)
│   │   │   ├── rag/             # Document RAG (vector store + BM25)
│   │   │   ├── extraction/      # Content extraction (web pages, PDF)
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

## 2. Core Architecture — Pipeline Orchestrator

### 2.1 Pipeline class

```typescript
// packages/engine/src/pipeline/pipeline.ts
type NodeFn = (ctx: PipelineContext) => Promise<PipelineContext>;

interface PipelineContext {
  state: ResearchState;
  emit: (event: PipelineEvent) => void;
  signal: AbortSignal;  // cancellation support
}

class Pipeline {
  private nodes: NodeFn[];
  private loopCheck?: (ctx: PipelineContext) => { shouldLoop: boolean; targetNode: string };

  constructor(config: PipelineConfig);
  run(initialState: ResearchState): AsyncGenerator<PipelineEvent>;
}
```

- `Pipeline.run()` returns an `AsyncGenerator` yielding progress events
- Main process forwards events to renderer via IPC
- Pipeline nodes are plain async functions: receive context, return updated context
- Reflection loop via `loopCheck`: after reflection node, check for gaps and decide whether to jump back to subagents

### 2.2 Seven-node mapping

| Node | Implementation | LLM Usage |
|------|---------------|-----------|
| **init** | Pure function, no LLM | None |
| **plan** | `generateObject({ schema: ResearchPlanSchema })` | Structured output; depth 2-3 use `maxSteps` + search tool |
| **split** | `generateObject({ schema: SubtaskListSchema })` | Structured output with JSON self-healing retry |
| **subagents** | `Promise.all(subtasks.map(runSubagent))` | Each subagent runs independent ReAct loop |
| **reflection** | `generateObject({ schema: ReflectionSchema })` | Structured scoring + gap detection |
| **synthesize** | `streamText({ prompt })` | Streaming synthesis, truncation continuation up to 6 rounds |
| **cite** | Regex replacement + URL liveness check | No LLM |

### 2.3 ReAct Subagent

```typescript
// packages/engine/src/agents/react-agent.ts
async function runSubagent(
  subtask: Subtask,
  tools: ToolSet,         // search, evaluate, fetch, synthesize, submit
  config: AgentConfig
): Promise<SubagentReport> {
  const result = await generateText({
    model: config.model,
    system: SUBAGENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: subtask.instruction }],
    tools,
    maxSteps: config.maxSteps,  // LLM decides when to stop calling tools
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Emit progress events, guard rail checks
    }
  });
  return extractReport(result);
}
```

`maxSteps` lets the LLM autonomously decide when to stop searching and submit a report, matching the original ReAct loop behavior. Guard rails from the original (search round limits, consecutive failure detection, forced search disable in writing phase) are implemented via `onStepFinish` callbacks.

---

## 3. Search Provider

### 3.1 Interface

```typescript
// packages/engine/src/search/provider.ts
interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  score?: number;
}
```

### 3.2 Tools

Two search tools for subagents:

1. **`tavily_search`** — Tavily API search, returns result list (title, URL, snippet, content excerpt)
2. **`fetch_fulltext`** — Fetch full webpage content by URL. Strategy:
   - Primary: `@mozilla/readability` + `jsdom` for static HTML (~200ms)
   - Fallback: `playwright` headless browser for JS-rendered pages (~3-5s)

### 3.3 Implementation

First version uses Tavily only. The provider interface allows adding more providers later without changing agent code.

Configuration: user enters Tavily API key in Settings. Stored in SQLite `config` table.

---

## 4. Document RAG

### 4.1 Vector Store + Hybrid Search

Use **vectra** (v0.14+) — a TS-native vector database with built-in BM25 hybrid search (via `wink-bm25-text-search`). File-based local storage, supports Pinecone-compatible filtering.

This eliminates the need for a custom BM25 implementation. vectra handles:
- Vector similarity search
- BM25 keyword search
- Hybrid ranking (configurable vector/BM25 weight)

### 4.2 Embedding Models

User selects in settings:

- **Online**: Zhipu Embedding-3, dimension 512
- **Local**: `bge-small-zh-v1.5` ONNX, dimension 384

Online and local are separate indexes — dimensions are not forced to align. Rebuild index when switching models.

### 4.3 RAG Configuration

```yaml
rag:
  embedding_provider: "zhipu"  # or "local"
  chunk_size: 800
  chunk_overlap: 100
  hybrid_alpha: 0.5            # 0 = pure BM25, 1 = pure vector
  top_k: 10
```

### 4.5 Document Processing

Supports three formats only (first version):

- **TXT**: Direct read
- **Markdown**: `marked` parse → extract plain text (preserve structure markers)
- **PDF**: `pdf-parse` (based on pdfjs-dist, pure JS, no native dependencies)

Pipeline: upload → parse → chunk (800 chars, 100 overlap) → embed → index

---

## 5. Persistence

Using **better-sqlite3** (synchronous, high-performance SQLite binding, standard for Electron main process).

### 5.1 Database location

`app.getPath('userData')` + `/data.db`
- macOS: `~/Library/Application Support/coki/data.db`

### 5.2 Schema

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
  title TEXT,
  snippet TEXT,
  cited_in_report INTEGER DEFAULT 0
);

-- 4. Document collections
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_provider TEXT NOT NULL,  -- 'zhipu' | 'local'
  created_at TEXT NOT NULL
);

-- 5. Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  chunk_count INTEGER,
  status TEXT NOT NULL,           -- indexing/ready/error
  created_at TEXT NOT NULL
);

-- 6. Trace logs (optional, observability)
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

-- 7. LLM call records (optional, observability)
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

**Differences from original:**
- Removed `checkpoints` table — desktop app doesn't need crash recovery (just re-run)
- `runs` absorbs checkpoint data, directly stores `research_plan` and `cited_report`
- `subtask_reports` stored independently for process inspection
- `sources` adds `cited_in_report` flag to distinguish "found" vs "actually cited"
- WAL mode enabled

---

## 6. Observability

### 6.1 Logging

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

function traceLLMCall(call: LLMCallRecord) {
  // Write to llm_calls table + emit event to renderer
}
```

- `AsyncLocalStorage` replaces Python's `contextvars` — implicitly propagates `run_id` without explicit parameter passing
- Logs written to both SQLite (`trace_logs` table) and console
- Renderer receives real-time log events via IPC for timeline visualization

### 6.2 LLM Call Tracking

Every `generateText` / `streamText` / `generateObject` call records:
- Role (planner, subagent, synthesizer, etc.)
- Model name
- Token counts (input/output)
- Latency

---

## 7. UI Design

### 7.1 Layout

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

### 7.2 Pages

**New Research (Home)**
- Large query input (multi-line)
- Depth selector: Quick / Balanced / Deep (with time estimates)
- Collapsible advanced options: output language, document collection selection, custom prompt

**Research Dashboard (running)**
- Progress bar + current phase text + estimated time remaining
- Real-time log stream (collapsible)
- Subtask card grid: each card shows instruction, status, live output preview

**Report (completed)**
- Left: Full report (Markdown rendered, citations clickable)
- Right: Sources panel (collapsible), showing all cited sources
- Toolbar: Export (Markdown/PDF), copy, re-research

**History**
- Card list view: query summary, depth, time, status
- Search and filter by depth/status
- Click to view report

**Library**
- Left: Collection list
- Right: Document list for selected collection + upload area
- Drag-and-drop upload

**Settings**
- Sectioned form: LLM config, search config, embedding model, RAG parameters, UI preferences

### 7.3 Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| UI library | **shadcn/ui** | Customizable, zero runtime, TS-native |
| CSS | **Tailwind CSS** | Pairs with shadcn/ui, high dev velocity |
| State | **Zustand** | Lightweight, TS-friendly, supports subscriptions |
| Routing | **React Router** | SPA routing for desktop |
| Markdown | **react-markdown** + **remark-gfm** | React-native, GFM support |
| Icons | **Lucide React** | shadcn/ui default icon set |

---

## 8. Electron Architecture

### 8.1 Process model

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

### 8.2 IPC API

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

### 8.3 Security

- Preload exposes `window.coki` via `contextBridge.exposeInMainWorld`
- No direct `ipcRenderer.invoke` exposed to renderer
- All IPC communication is type-constrained (types from `packages/shared`)

### 8.4 Main process entry

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

## 9. Key Libraries Summary

| Purpose | Library | Notes |
|---------|---------|-------|
| Desktop framework | Electron | Main process runs engine |
| Frontend framework | React 18 | Renderer process |
| UI components | shadcn/ui | Customizable, TS-native |
| CSS | Tailwind CSS | Utility-first |
| State management | Zustand | Lightweight |
| LLM interaction | Vercel AI SDK (`ai`) | generateText, streamText, generateObject, tools |
| SQLite | better-sqlite3 | Synchronous, high-performance |
| Vector store + BM25 | vectra | Pure TS, built-in hybrid search |
| Web content extraction | @mozilla/readability + jsdom | Primary path |
| Browser extraction | playwright | Fallback for JS-rendered pages |
| PDF parsing | pdf-parse | Pure JS |
| Logging | pino | Structured JSON logs |
| Trace context | AsyncLocalStorage | Implicit run_id propagation |
| Markdown rendering | react-markdown | React component |
| Build | Vite (renderer) + esbuild (main/preload) | Fast builds |
| Packaging | electron-builder | Cross-platform packaging |
| Package manager | pnpm | Monorepo with workspaces |
