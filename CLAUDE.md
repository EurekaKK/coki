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
- **LLM**: Uses `@anthropic-ai/sdk` with `messages.create()`. Compatible with Claude, MiMo, and other Anthropic-compatible providers via `baseUrl` + `api-key` header. Supports per-role model overrides (`roleModels` map resolved as `opts.model ?? roleModels[role] ?? defaultModel`). Temperature is intentionally NOT set — provider default is used.
- **Config**: `ConfigManager` deep-merges user overrides onto defaults. API keys stored encrypted in SQLite via Electron `safeStorage`. Thinking mode (`llm.thinking`) and per-role models persisted via `secretStore.saveConfig()`. Quality threshold defaults to 0.8.
- **IPC**: Main↔Renderer communication via `ipcMain.handle` / `contextBridge.exposeInMainWorld`. Event streaming via `webContents.send` + `on` listeners.
- **Logging**: Pino logger with custom timestamp format (`YYYY-MM-DD HH:mm:ss.SSS`). Logs written to `~/Library/Logs/@coki/main/coki.log`. Timeline UI reads from this log file (not DB). Do NOT truncate the log on dev restart — it preserves timeline history for past runs.
- **Citation system**: `addCitations(report, titleByUrl?)` converts `[src: url]` → `[^N]` footnotes with titled links. Source titles come from `ctx.sources` Map (built up by subagents). Footnote definitions are emitted without a `## References` heading — remark-gfm auto-generates the references section. `verifyCitations()` checks footnotes against evidence spans (observability-only).
- **Concurrency**: `p-limit` used in extract-claims node (concurrency=3) and deepen (per-profile concurrency).

## Commands

```bash
pnpm dev          # Start renderer (Vite) + main (Electron) concurrently
pnpm build        # Build renderer → preload → main (order matters)
pnpm test         # Run tests with vitest
pnpm typecheck    # Type-check all packages
pnpm lint         # ESLint
```

**Important**: when editing `apps/preload/src/index.ts`, rebuild it manually before restarting:
```bash
pnpm --filter @coki/preload build
```
The `pnpm dev` script does NOT rebuild preload automatically.

Main process uses esbuild (bundles to single CJS file). Renderer uses Vite.

## Conventions

- TypeScript strict mode, no `any` casts except where Anthropic SDK types require it.
- snake_case for SQLite columns, camelCase for TypeScript. IPC boundary may need explicit mapping.
- Engine package must remain Electron-free (testable in Node.js).
- Pipeline progress events include a numeric `progress` field (0-99) computed from `PHASE_WEIGHTS`.

## Phase 1C additions (report quality recovery)

All changes restore quality from the original Python `Deep-Research-Agent` while keeping the TypeScript/Electron architecture.

### Intent extraction chain
- `ResearchPlan` now includes `requirements: ResearchRequirements` (coreObjectives, explicitRequirements, scopeConstraints, subQuestions).
- Planner extracts these 4 axes and propagates through split → subagent user message → reflection → synthesis.
- `Subtask` type extended with `dimension`, `boundaries`, `sourceTypes`.

### Prompt rewrites
All prompts rewritten to mirror the original project. Key rules:
- Never use `JSON.stringify` to embed requirements in prompts — it triggers mimo's compliance filter and returns a garbage "high risk" rejection template. Use `formatRequirements()` from `utils/format-requirements.ts` (natural prose).
- Synthesis prompt enforces `outputStructure` as a MANDATORY section list. Conclusion must be the last analytical section; `<<END_OF_REPORT>>` immediately follows.
- Subagent system prompt built via `buildSubagentSystemPrompt({ withEvaluate })` — dynamically includes/excludes `evaluate_sources` tool to avoid phantom-tool hallucinations.

### Synthesize node (major rework)
- Uses `compressReports()` to fit subagent reports within `maxInputChars` budget.
- Retries once if main stream returns < 500 chars (provider rejection detection).
- Continuation prompt includes query + outputStructure context to prevent hallucination on truncation.
- **Deepen runs INSIDE synthesize** (not as a separate pipeline node) — calls `deepenReport()` from `pipeline/nodes/deepen.ts` before returning. This matches the original project's architecture where synthesis is responsible for the complete, fully-developed report.
- Deepen excludes conclusion/recommendations/综合/推荐 headings — these cross-dimensional synthesis sections have no dedicated evidence in individual subagent reports.
- No post-synthesis content appending — compliance audit append removed to prevent content appearing after the conclusion.

### Reflection (stricter quality enforcement)
- Per-dimension 4-axis scoring (comprehensiveness, insight, evidence, instruction_following).
- **Code-level thin report enforcement**: before calling LLM, measures each subagent report length. depth-3 < 3000 chars or depth-2 < 2000 chars → forced gap subtask regardless of LLM opinion. Also injects thin-report facts into the prompt as HARD FACTS.
- Forced gaps are merged with LLM gaps (dedup by dimension). If LLM says "complete" but forced gaps exist and iterations remain, the decision is overridden.
- Quality threshold raised to 0.8 (was 0.7).

### evaluate_sources tool
- Subagent ReAct loop has an `evaluate_sources` tool (when `profile.useSourceEvaluation = true`, depth ≥ 2).
- Candidates capped at 6 before calling the LLM to prevent JSON truncation on mimo.
- Graceful fallback on parse failure: returns neutral scores so the subagent is not blocked.

### Shared utilities (new)
- `utils/parse-json.ts` — robust JSON extraction from LLM output (fenced, embedded, raw).
- `utils/sections.ts` — `parseSections()`, `countCitations()`.
- `utils/compress-report.ts` — `compressReport()`, `compressReports()` — paragraph-importance-based compression for reflection/synthesis input budgets.
- `utils/format-requirements.ts` — `formatRequirements()` — natural-prose serialiser for `ResearchRequirements`. Never use JSON for this.

### Frontend (renderer)
- Full markdown render stack: `@tailwindcss/typography` + `remark-math` + `rehype-katex` + `rehype-highlight` + `remark-gfm`.
- **HashRouter footnote fix**: `ReactMarkdown` overrides the `<a>` component to intercept `href="#..."` links and use `scrollIntoView` instead of letting HashRouter intercept the hash. External links use `target="_blank"`.
- "Copy Markdown" replaced with "Save as .md" — triggers `dialog.showSaveDialog` via IPC.
- Re-run functionality removed (all UI, IPC handlers, and engine methods).
- Report page: `code::before/::after { content: none }` to suppress typography plugin's auto-backticks. GFM footnotes section heading renamed from "Footnotes" to "References" via `components.h2`.

### Removed
- `search/extract.ts` (Readability + jsdom fallback — never called).
- `PLANNER_PROMPT` constant (dead — plan.ts used its own inline builder).
- `maxSearchRounds` from `DepthProfile` (unused).
- Temperature config from all roles and global LLM config — provider defaults used.
- `ResearchEngine.rerunSynthesize()` and `ResearchEngine.rerunWithPlan()`.
- `deepen` as a pipeline node (now internal to synthesize).
