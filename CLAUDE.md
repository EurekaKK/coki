# Coki

AI deep research agent built with Electron + React + TypeScript.

## Architecture

pnpm monorepo with 5 packages:

- `packages/engine` — Core research pipeline (LLM client, search, DB, config). No Electron dependency.
- `packages/shared` — Shared types, schemas, constants (phase weights, depth presets).
- `apps/main` — Electron main process. Wires engine + secret store + IPC handlers.
- `apps/preload` — contextBridge API exposed to renderer.
- `apps/renderer` — React SPA (Vite + React Router + Zustand).

## Key patterns

- **Pipeline**: 8-phase async generator (init → plan → split → subagents → reflection → synthesize → extract-claims → cite). Each node is a pure async function taking/returning `PipelineContext`.
- **LLM**: Uses `@anthropic-ai/sdk` with `messages.create()`. Compatible with Claude, MiMo, and other Anthropic-compatible providers via `baseUrl` + `api-key` header. Supports per-role model overrides (`roleModels` map resolved as `opts.model ?? roleModels[role] ?? defaultModel`).
- **Config**: `ConfigManager` deep-merges user overrides onto defaults. API keys stored encrypted in SQLite via Electron `safeStorage`. Thinking mode (`llm.thinking`) and per-role models persisted via `secretStore.saveConfig()`.
- **IPC**: Main↔Renderer communication via `ipcMain.handle` / `contextBridge.exposeInMainWorld`. Event streaming via `webContents.send` + `on` listeners.
- **Logging**: Pino logger with custom timestamp format (`YYYY-MM-DD HH:mm:ss.SSS`). Logs written to `~/Library/Logs/@coki/main/coki.log`. Timeline UI reads from this log file (not DB).
- **Citation system**: `addCitations()` converts `[src: url]` → `[^N]` footnotes. `verifyCitations()` checks footnotes against evidence spans (observability-only, logs warn for unverified refs). Evidence spans and claims persisted to DB via cite node.
- **Concurrency**: `p-limit` used in extract-claims node (concurrency=3) for parallel section processing.

## Commands

```bash
pnpm dev          # Start renderer (Vite) + main (Electron) concurrently
pnpm build        # Build renderer → preload → main (order matters)
pnpm test         # Run tests with vitest
pnpm typecheck    # Type-check all packages
pnpm lint         # ESLint
```

Main process uses esbuild (bundles to single CJS file). Renderer uses Vite.

## Conventions

- TypeScript strict mode, no `any` casts except where Anthropic SDK types require it.
- snake_case for SQLite columns, camelCase for TypeScript. IPC boundary may need explicit mapping.
- Engine package must remain Electron-free (testable in Node.js).
- Pipeline progress events include a numeric `progress` field (0-99) computed from `PHASE_WEIGHTS`.

## Phase 1B additions (trust & polish)

- **LLM call tracking**: `LLMClient.onCall()` callback persists records to `llm_calls` table with `runId`, `role`, `model`, token counts, latency.
- **Evidence spans**: Subagent reports produce paragraph-level `EvidenceSpan` objects (~500 chars) during `tavily_extract`. Collected into context and persisted by cite node.
- **Claims extraction**: `extract-claims` node parses report sections, uses LLM to extract factual claims, matches to evidence via Jaccard token-overlap heuristic.
- **Cost panel**: IPC handler `research:costSummary` aggregates tokens/latency by phase from `llm_calls` table.
- **Timeline**: IPC handler `research:timeline` reads pino log file (not DB), filters by `runId`, returns structured entries.
- **Re-run modes**: `research:rerun(runId, mode)` supports `"full"`, `"reuse-sources"`, `"reuse-plan"` via mini-pipelines in `engine.ts`.
- **Per-role models**: Settings UI allows overriding model per pipeline role (planner, splitter, subagent, evaluator, reflection, synthesis, citation).
