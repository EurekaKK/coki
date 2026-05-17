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

- **Pipeline**: 7-phase async generator (init → plan → split → subagents → reflection → synthesize → cite). Each node is a pure async function taking/returning `PipelineContext`.
- **LLM**: Uses `@ai-sdk/openai` v3 with `provider.chat()` (Chat Completions API, not Responses API). Compatible with any OpenAI-compatible endpoint.
- **Config**: `ConfigManager` deep-merges user overrides onto defaults. API keys stored encrypted in SQLite via Electron `safeStorage`.
- **IPC**: Main↔Renderer communication via `ipcMain.handle` / `contextBridge.exposeInMainWorld`. Event streaming via `webContents.send` + `on` listeners.

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

- TypeScript strict mode, no `any` casts except where AI SDK types require it.
- snake_case for SQLite columns, camelCase for TypeScript. IPC boundary may need explicit mapping.
- Engine package must remain Electron-free (testable in Node.js).
- Pipeline progress events include a numeric `progress` field (0-99) computed from `PHASE_WEIGHTS`.
