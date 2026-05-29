# AGENTS.md

## Collaboration Rules

- 要有批判精神，不要一味迎合用户的话。
- 提出质疑和问题时必须给出准确、具体的原因和依据。
- 先读本文件和 `CLAUDE.md`，再动代码；`CLAUDE.md` 记录了很多历史架构决策和已踩过的坑。
- 这是一个桌面应用仓库，改动后要用真实命令验证，不要只凭静态判断说完成。

## Project Shape

- Monorepo managed by `pnpm@9.15.0`.
- `packages/engine`: core research engine. It must stay Electron-free and testable in Node.js.
- `packages/shared`: shared zod schemas, statuses, phases, depth presets, and phase weights used across process boundaries.
- `apps/main`: Electron main process, database/config/secret wiring, IPC handlers, security policy.
- `apps/preload`: narrow `contextBridge` API exposed as `window.coki`.
- `apps/renderer`: React 19 + Vite + HashRouter + Zustand UI.

## Common Commands

- `pnpm dev`: start Vite renderer and Electron main concurrently.
- `pnpm build`: build renderer, preload, then main. Keep this order.
- `pnpm typecheck`: TypeScript project references.
- `pnpm lint`: ESLint. Current config ignores `apps/renderer/**`.
- `pnpm test`: Vitest suite.
- `pnpm --filter @coki/preload build`: run this manually after editing `apps/preload/src/index.ts`; `pnpm dev` does not rebuild preload automatically.

Prefer targeted tests while iterating, for example `pnpm test packages/engine/src/citation/citation.test.ts`. Some tests exercise real LLM, Tavily, embedding, or the user's local SQLite config via `packages/engine/src/test-utils/helper.ts`, so do not treat a missing key failure as a product regression without checking the test's dependency.

## Dev Startup Discipline

- Every time the user asks to start or restart Coki, first inspect stale Coki/Electron/Vite/pnpm/concurrently processes and occupied dev ports, especially `5173` and `9222`.
- Kill only repo-scoped Coki dev processes. Avoid broad Electron kills because Codex, VS Code, and other desktop apps may also be Electron processes.
- Start the development build with `pnpm dev`; do not open or rely on the installed release app.
- Verify the dev app before reporting success: check the listening port, request the renderer URL, and confirm the Electron process path comes from this repo's `node_modules/.pnpm/electron...`.
- In this environment Vite may bind to IPv6. If `localhost` or `127.0.0.1` looks unavailable, also verify `http://[::1]:5173/` before concluding startup failed.
- After changing `apps/main`, `packages/engine`, or shared code consumed by Electron main, restart the dev process before app-level testing; renderer hot reload alone is not enough.

## Architecture Invariants

- The research pipeline is `init -> plan -> split -> subagents -> reflection -> synthesize -> extract-claims -> cite`.
- If changing phases, update all coupled places together: `packages/shared/src/constants.ts`, `packages/engine/src/pipeline/pipeline.ts`, phase labels in `apps/renderer/src/components/Timeline.tsx`, tests, and progress assumptions.
- Pipeline nodes should take and return `PipelineContext`. Keep state propagation explicit and avoid hidden global state.
- `packages/engine` must not import Electron APIs. Electron-only behavior belongs in `apps/main` or `apps/preload`.
- SQLite columns use `snake_case`; TypeScript objects generally use `camelCase`. Map explicitly at IPC/UI boundaries instead of relying on accidental shapes.
- Add database changes as new migrations in `packages/engine/src/db/migrations.ts`; do not rewrite old migrations unless intentionally resetting local development data.

## LLM And Prompting

- `LLMClient` uses the Anthropic SDK against Anthropic-compatible providers. It sends both `api-key` and `Authorization: Bearer` headers for MiMo compatibility.
- Role model selection is `opts.model ?? roleModels[role] ?? defaultModel`.
- Do not add temperature unless there is a concrete provider-tested reason; provider defaults are intentional.
- Do not inject `ResearchRequirements` into prompts with `JSON.stringify`. Use `formatRequirements()` because JSON-shaped requirement blocks have caused Chinese gateway compliance-filter failures.
- `parseJsonFromText()` is the standard parser for LLM JSON. Prefer improving it over adding ad hoc regex parsing in nodes.
- Synthesis is responsible for the final complete report. `deepenReport()` intentionally runs inside `synthesize`, not as a separate pipeline node.
- Keep intent clarification LLM-first. Local rules should be guardrails, fallbacks, and latency protection, not the primary classifier.
- `clarifyResearchIntent` should distinguish whether a query is clear enough to start from whether there is a high-impact `clarificationOpportunity`. A query can be basically clear and still deserve one targeted research-design question.
- Good clarification questions should resolve concrete research decisions: output format, metric operationalization, data/model scope, time/region constraints, evidence strategy, or source preference. Avoid vague prompts like "你主要想了解什么" or "这个主题比较宽" unless the original query is genuinely broad.
- When asking a clarification question, ask only one, tie it directly to the original query, and provide a reasonable default option so the user can continue quickly.
- On clarification fallback, only consume the user's answer text for the refined brief. Do not leak the assistant's clarification question into `brief.refinedQuestion`, `mustInclude`, or downstream research prompts.
- For MiMo or other Anthropic-compatible providers, keep `thinking=false` explicit by sending disabled thinking instead of merely omitting the option. SSE debugging should distinguish connect events, thinking deltas, and visible text deltas.
- Prefer normalizing common LLM JSON shape drift, such as `snake_case` fields or missing `brief.refinedQuestion`, before dropping to fallback behavior.

## Search, RAG, And Citations

- Subagents must cite factual claims inline as `[src: <exact url>]`; synthesis must preserve those markers.
- The active document URL convention is `https://doc.coki/<documentId>`. Do not introduce new `doc://` behavior. There are still legacy comments/checks mentioning `doc://`, so keep new work aligned on `https://doc.coki/`.
- Document search returns Vectra item IDs as `{docId}#{chunkIndex}`. `DocumentManager.search()` must fetch actual chunk text from SQLite via `db.getDocumentChunk`; Vectra metadata does not store full text.
- `search_documents` should populate the subagent-local document cache before `extract_document` runs.
- `addCitations()` converts `[src: ...]` markers to GFM footnotes and appends `## References`. The renderer depends on this shape for tooltips and local document opening.
- When touching citation persistence, keep document sources, footnote URLs, `Report.tsx`, and `createCiteNode()` in sync.

## Electron, IPC, And Security

- Keep `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true` unless there is a concrete security review.
- New renderer capabilities should flow through all relevant layers: `apps/main/src/ipc.ts`, `apps/preload/src/index.ts`, `apps/renderer/src/types/global.d.ts`, and the renderer caller.
- Main process security allows production `file:` navigation and development `http://localhost`; external navigation should be blocked and `https:` links opened through the system browser.
- Local document opening belongs behind `documents:openDocument` IPC and `shell.openPath`; do not make renderer access filesystem paths directly.
- API keys are stored through `SecretStore` and SQLite config. Do not commit `.env`, `*.db`, `*.log`, local key notes, generated `dist*`, or `node_modules`.
- The timeline UI reads `~/Library/Logs/@coki/main/coki.log`, not DB `trace_logs`. Do not truncate this log during dev startup.

## Renderer Guidelines

- Follow the existing quiet Apple-minimal UI style, CSS variables in `apps/renderer/src/index.css`, and shadcn/Radix primitive patterns.
- Use lucide icons for icon buttons when available.
- Keep HashRouter anchor behavior in mind. `Report.tsx` overrides hash links and footnote refs to avoid router interference.
- The report markdown stack is delicate: `remark-gfm`, `remark-math` with `singleDollarTextMath: false`, `ensureProperties`, `rehype-katex`, and `rehype-highlight` work together. Test report rendering after changing it.
- For settings, preserve the autosave debounce and runtime engine update path; updating saved config alone is not enough.

## Testing Notes

- For engine changes, add or update focused Vitest coverage near the touched module.
- For intent-clarifier changes, run focused coverage such as `pnpm test packages/shared/src/types.test.ts packages/engine/src/intent/clarifier.test.ts packages/engine/src/intent/observability.test.ts packages/engine/src/intent/clarity-node.llm.test.ts`, then run `pnpm typecheck`.
- Real LLM clarification experiments are opt-in and should be run deliberately: `RUN_INTENT_CLARITY_LLM=1 pnpm test packages/engine/src/intent/clarity-node.llm.test.ts` and `RUN_INTENT_CLARITY_SSE=1 pnpm test packages/engine/src/intent/clarity-node.llm.test.ts`. Keep the default suite free of network/token dependency.
- For DB changes, use temp directories and close `CokiDatabase` in `afterEach`, matching existing tests.
- For pipeline changes, assert events, context state, and error/cancellation behavior rather than only final report text.
- For renderer changes, at minimum run typecheck/build for the renderer path; use browser verification for visual or routing changes when practical.
- If a test expectation conflicts with current code or `CLAUDE.md`, investigate the architectural decision first instead of blindly changing either side.

## Before Finishing

- Check `git status --short` and avoid overwriting unrelated user changes.
- Run the narrowest meaningful verification command for the files touched, then report exactly what passed or what could not be run.
- If you find an existing unrelated bug while reading code, mention it separately with file references instead of silently fixing it in an unrelated change.
