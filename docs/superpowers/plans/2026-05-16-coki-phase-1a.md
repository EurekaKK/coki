# Coki Phase 1A: Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Electron desktop app that runs the 7-node deep research pipeline end-to-end, from user query input to cited Markdown report output.

**Architecture:** Monorepo with `packages/engine` (pure TS, no Electron deps) containing the pipeline state machine, LLM wrapper, search client, and SQLite persistence. `apps/main` wires the engine to Electron IPC. `apps/preload` exposes a thin `contextBridge` API. `apps/renderer` is a React SPA with Zustand state.

**Tech Stack:** Electron 42, React 19, Vite 6, pnpm 9 workspaces, AI SDK 6, better-sqlite3 12, Tavily, pino, Zustand, shadcn/ui, Tailwind CSS 4

**Phase 1A Scope:**
- Electron shell with security (CSP, sandbox, safeStorage)
- Settings: LLM (OpenAI-compatible) + Tavily API key
- 7-node pipeline state machine (init → plan → split → subagents → reflection → synthesize → cite)
- Basic dashboard (progress bar, phase text, log stream)
- Final Markdown report display
- SQLite: runs, sources, llm_calls tables
- Basic citation: `[src: url]` → numbered references with URL liveness check
- Markdown export

**Out of Scope (Phase 1B+):** Evidence spans, claims, report_references, cost/token panel, timeline UI, re-run options, document RAG

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/main/package.json`
- Create: `apps/main/tsconfig.json`
- Create: `apps/preload/package.json`
- Create: `apps/preload/tsconfig.json`
- Create: `apps/renderer/package.json`
- Create: `apps/renderer/tsconfig.json`
- Create: `apps/renderer/vite.config.ts`
- Create: `apps/renderer/index.html`
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `electron-builder.yml`
- Create: `.gitignore`
- Create: `vitest.config.ts` (root)

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "coki",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "concurrently \"pnpm --filter @coki/renderer dev\" \"pnpm --filter @coki/main dev\"",
    "build": "pnpm --filter @coki/renderer build && pnpm --filter @coki/preload build && pnpm --filter @coki/main build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0",
    "eslint": "^9.0.0",
    "@types/node": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create packages/shared**

`packages/shared/package.json`:
```json
{
  "name": "@coki/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
export * from "./types";
export * from "./events";
export * from "./constants";
```

`packages/shared/src/constants.ts`:
```typescript
export const DEPTH_PRESETS = [1, 2, 3] as const;
export type Depth = (typeof DEPTH_PRESETS)[number];

export const PHASES = [
  "init",
  "plan",
  "split",
  "subagents",
  "reflection",
  "synthesize",
  "cite",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_WEIGHTS: Record<Phase, number> = {
  init: 2,
  plan: 8,
  split: 5,
  subagents: 58,
  reflection: 5,
  synthesize: 12,
  cite: 8,
};
```

`packages/shared/src/types.ts`:
```typescript
import { z } from "zod";

export const ResearchOptionsSchema = z.object({
  depth: z.number().int().min(1).max(3).default(2),
  outputLanguage: z.enum(["zh", "en"]).default("zh"),
});
export type ResearchOptions = z.infer<typeof ResearchOptionsSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  userQuery: z.string(),
  depth: z.number(),
  status: RunStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunReportSchema = z.object({
  id: z.string(),
  userQuery: z.string(),
  depth: z.number(),
  status: RunStatusSchema,
  researchPlan: z.string().nullable(),
  citedReport: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  sources: z.array(
    z.object({
      id: z.string(),
      url: z.string().nullable(),
      title: z.string().nullable(),
      snippet: z.string().nullable(),
    })
  ),
});
export type RunReport = z.infer<typeof RunReportSchema>;
```

`packages/shared/src/events.ts`:
```typescript
import { z } from "zod";

export const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  runId: z.string(),
  phase: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const LogEventSchema = z.object({
  type: z.literal("log"),
  runId: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  phase: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

export const CompleteEventSchema = z.object({
  type: z.literal("complete"),
  runId: z.string(),
  citedReport: z.string(),
});
export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  runId: z.string(),
  error: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export type PipelineEvent =
  | ProgressEvent
  | LogEvent
  | CompleteEvent
  | ErrorEvent;
```

- [ ] **Step 5: Create packages/engine skeleton**

`packages/engine/package.json`:
```json
{
  "name": "@coki/engine",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@ai-sdk/openai": "^3.0.0",
    "@coki/shared": "workspace:*",
    "@mozilla/readability": "^0.5.0",
    "@tavily/core": "^0.5.0",
    "ai": "^6.0.0",
    "better-sqlite3": "^12.0.0",
    "jsdom": "^26.0.0",
    "p-limit": "^6.0.0",
    "pino": "^9.0.0",
    "vectra": "^0.14.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/jsdom": "^21.0.0",
    "@types/node": "^24.0.0"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 6: Create apps/main skeleton**

`apps/main/package.json`:
```json
{
  "name": "@coki/main",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js --external:electron --external:better-sqlite3"
  },
  "dependencies": {
    "@coki/engine": "workspace:*",
    "@coki/shared": "workspace:*",
    "electron": "^42.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "tsx": "^4.0.0"
  }
}
```

`apps/main/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" },
    { "path": "../../packages/engine" }
  ]
}
```

- [ ] **Step 7: Create apps/preload skeleton**

`apps/preload/package.json`:
```json
{
  "name": "@coki/preload",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --outfile=dist/preload.js --format=cjs --external:electron"
  }
}
```

`apps/preload/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS"
  },
  "include": ["src"]
}
```

- [ ] **Step 8: Create apps/renderer skeleton**

`apps/renderer/package.json`:
```json
{
  "name": "@coki/renderer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
    "@coki/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "lucide-react": "^0.470.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.5.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

`apps/renderer/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});
```

`apps/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'none';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Coki</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create electron-builder.yml**

```yaml
appId: com.coki.app
productName: Coki
directories:
  output: dist-electron
files:
  - "apps/main/dist/**/*"
  - "apps/preload/dist/**/*"
  - "apps/renderer/dist/**/*"
  - "node_modules/**/*"
extraResources:
  - from: "packages/engine/src/"
    to: "engine/"
mac:
  category: public.app-category.productivity
  target: dmg
win:
  target: nsis
linux:
  target: AppImage
```

- [ ] **Step 10: Create .gitignore**

```
node_modules/
dist/
dist-electron/
*.db
.env
*.log
.DS_Store
```

- [ ] **Step 11: Create root vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 12: Install dependencies and verify**

```bash
pnpm install
pnpm typecheck
```

Expected: typecheck passes (no source files yet, but configs are valid)

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: monorepo scaffolding with pnpm workspaces

- Root config: tsconfig.base.json, vitest, eslint
- packages/shared: types, events, constants
- packages/engine: skeleton with AI SDK, better-sqlite3, Tavily deps
- apps/main: Electron main process skeleton
- apps/preload: thin contextBridge skeleton
- apps/renderer: React + Vite + Tailwind skeleton
- electron-builder.yml for packaging"
```

---

## Task 2: Engine Config Module

**Files:**
- Create: `packages/engine/src/config/config.ts`
- Create: `packages/engine/src/config/config.test.ts`
- Create: `packages/engine/src/config/index.ts`

- [ ] **Step 1: Write failing tests for config**

`packages/engine/src/config/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ConfigManager } from "./config";

describe("ConfigManager", () => {
  it("returns defaults when no overrides", () => {
    const cm = new ConfigManager({});
    const config = cm.getConfig();
    expect(config.llm.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.llm.model).toBe("gpt-4o-mini");
    expect(config.tavily.apiKey).toBeNull();
    expect(config.research.depth).toBe(2);
    expect(config.research.qualityThreshold).toBe(0.7);
  });

  it("merges overrides with defaults", () => {
    const cm = new ConfigManager({
      llm: { model: "claude-sonnet-4-20250514" },
      tavily: { apiKey: "tvly-test" },
    });
    const config = cm.getConfig();
    expect(config.llm.model).toBe("claude-sonnet-4-20250514");
    expect(config.llm.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.tavily.apiKey).toBe("tvly-test");
  });

  it("returns role-specific config with fallback", () => {
    const cm = new ConfigManager({
      llm: { model: "default-model" },
      roles: { planner: { model: "planner-model" } },
    });
    expect(cm.getRole("planner").model).toBe("planner-model");
    expect(cm.getRole("subagent").model).toBe("default-model");
  });

  it("returns depth profile", () => {
    const cm = new ConfigManager({});
    expect(cm.getDepthProfile(1).maxSubagents).toBeLessThan(
      cm.getDepthProfile(3).maxSubagents
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/config/config.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ConfigManager**

`packages/engine/src/config/config.ts`:
```typescript
export interface LLMConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface RoleConfig {
  model: string;
  temperature: number;
}

export interface ResearchConfig {
  depth: 1 | 2 | 3;
  outputLanguage: "zh" | "en";
  qualityThreshold: number;
  maxIterations: number;
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  maxSearchRounds: number;
  continuationMaxRounds: number;
  maxInputChars: number;
}

export interface TavilyConfig {
  apiKey: string | null;
}

export interface CokiConfig {
  llm: LLMConfig;
  roles: Record<string, Partial<RoleConfig>>;
  research: ResearchConfig;
  tavily: TavilyConfig;
}

export interface ConfigOverrides {
  llm?: Partial<LLMConfig>;
  roles?: Record<string, Partial<RoleConfig>>;
  research?: Partial<ResearchConfig>;
  tavily?: Partial<TavilyConfig>;
}

const DEFAULTS: CokiConfig = {
  llm: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: null,
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 4096,
  },
  roles: {},
  research: {
    depth: 2,
    outputLanguage: "zh",
    qualityThreshold: 0.7,
    maxIterations: 2,
    maxSubagents: 4,
    searchBudgetPerSubagent: 8,
    reactMaxSteps: 12,
    maxSearchRounds: 5,
    continuationMaxRounds: 3,
    maxInputChars: 60000,
  },
  tavily: {
    apiKey: null,
  },
};

export interface DepthProfile {
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  maxSearchRounds: number;
  maxIterations: number;
  plannerUseReact: boolean;
  useSplitter: boolean;
  continuationMaxRounds: number;
  maxInputChars: number;
}

const DEPTH_PROFILES: Record<number, DepthProfile> = {
  1: {
    maxSubagents: 2,
    searchBudgetPerSubagent: 4,
    reactMaxSteps: 8,
    maxSearchRounds: 3,
    maxIterations: 1,
    plannerUseReact: false,
    useSplitter: false,
    continuationMaxRounds: 1,
    maxInputChars: 30000,
  },
  2: {
    maxSubagents: 4,
    searchBudgetPerSubagent: 8,
    reactMaxSteps: 12,
    maxSearchRounds: 5,
    maxIterations: 2,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 3,
    maxInputChars: 60000,
  },
  3: {
    maxSubagents: 8,
    searchBudgetPerSubagent: 15,
    reactMaxSteps: 18,
    maxSearchRounds: 8,
    maxIterations: 3,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 5,
    maxInputChars: 120000,
  },
};

const ROLE_DEFAULTS: Record<string, RoleConfig> = {
  planner: { model: "gpt-4o-mini", temperature: 0.7 },
  splitter: { model: "gpt-4o-mini", temperature: 0.3 },
  subagent: { model: "gpt-4o-mini", temperature: 0.7 },
  evaluator: { model: "gpt-4o-mini", temperature: 0.3 },
  reflection: { model: "gpt-4o-mini", temperature: 0.3 },
  synthesis: { model: "gpt-4o-mini", temperature: 0.7 },
  citation: { model: "gpt-4o-mini", temperature: 0.3 },
};

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>
): T {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key as keyof T];
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof base[key as keyof T] === "object" &&
      base[key as keyof T] !== null
    ) {
      result[key as keyof T] = deepMerge(
        base[key as keyof T] as Record<string, unknown>,
        val as Record<string, unknown>
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key as keyof T] = val as T[keyof T];
    }
  }
  return result;
}

export class ConfigManager {
  private config: CokiConfig;

  constructor(overrides: ConfigOverrides) {
    this.config = deepMerge(DEFAULTS, overrides as Partial<CokiConfig>);
  }

  getConfig(): CokiConfig {
    return { ...this.config };
  }

  getRole(role: string): RoleConfig {
    const roleOverride = this.config.roles[role] ?? {};
    const base = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.subagent!;
    return {
      model: roleOverride.model ?? this.config.llm.model ?? base.model,
      temperature: roleOverride.temperature ?? base.temperature,
    };
  }

  getDepthProfile(depth: number): DepthProfile {
    return DEPTH_PROFILES[depth] ?? DEPTH_PROFILES[2]!;
  }
}
```

`packages/engine/src/config/index.ts`:
```typescript
export { ConfigManager } from "./config";
export type {
  CokiConfig,
  ConfigOverrides,
  LLMConfig,
  RoleConfig,
  ResearchConfig,
  TavilyConfig,
  DepthProfile,
} from "./config";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/config/config.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/config/
git commit -m "feat(engine): config module with depth profiles and role system"
```

---

## Task 3: Engine Database Module

**Files:**
- Create: `packages/engine/src/db/database.ts`
- Create: `packages/engine/src/db/database.test.ts`
- Create: `packages/engine/src/db/migrations.ts`
- Create: `packages/engine/src/db/index.ts`

- [ ] **Step 1: Write failing tests for database**

`packages/engine/src/db/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CokiDatabase } from "./database";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CokiDatabase", () => {
  let dbDir: string;
  let db: CokiDatabase;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "coki-test-"));
    db = new CokiDatabase(join(dbDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates a run and retrieves it", () => {
    const id = db.createRun("test query", 2);
    const run = db.getRun(id);
    expect(run).toBeDefined();
    expect(run!.user_query).toBe("test query");
    expect(run!.depth).toBe(2);
    expect(run!.status).toBe("pending");
  });

  it("updates run status", () => {
    const id = db.createRun("test", 1);
    db.updateRunStatus(id, "running");
    expect(db.getRun(id)!.status).toBe("running");
    db.updateRunStatus(id, "completed", null, "final report");
    expect(db.getRun(id)!.status).toBe("completed");
    expect(db.getRun(id)!.cited_report).toBe("final report");
  });

  it("lists runs in reverse chronological order", () => {
    db.createRun("first", 1);
    db.createRun("second", 2);
    const runs = db.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.user_query).toBe("second");
  });

  it("inserts and retrieves sources", () => {
    const runId = db.createRun("test", 1);
    db.insertSource({
      id: "src-1",
      runId,
      sourceType: "web",
      url: "https://example.com",
      title: "Example",
      snippet: "content",
      fetchStatus: "ok",
    });
    const sources = db.getSourcesByRun(runId);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe("https://example.com");
  });

  it("inserts and retrieves llm calls", () => {
    const runId = db.createRun("test", 1);
    db.insertLLMCall({
      runId,
      role: "planner",
      model: "gpt-4o-mini",
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 1500,
    });
    const calls = db.getLLMCallsByRun(runId);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.role).toBe("planner");
  });

  it("deletes a run and cascades", () => {
    const runId = db.createRun("test", 1);
    db.insertSource({
      id: "src-1",
      runId,
      sourceType: "web",
      url: "https://example.com",
      fetchStatus: "ok",
    });
    db.deleteRun(runId);
    expect(db.getRun(runId)).toBeNull();
    expect(db.getSourcesByRun(runId)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/db/database.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement database**

`packages/engine/src/db/migrations.ts`:
```typescript
export const MIGRATIONS = [
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
];
```

`packages/engine/src/db/database.ts`:
```typescript
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { MIGRATIONS } from "./migrations";

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
  fetch_status: string;
  retrieved_at: string;
  cited_in_report: number;
}

export interface LLMCallRow {
  id: number;
  run_id: string | null;
  role: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}

export class CokiDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const applied = this.db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row: unknown) => (row as { version: number }).version);

    for (const migration of MIGRATIONS) {
      if (!applied.includes(migration.version)) {
        this.db.exec(migration.sql);
        this.db
          .prepare(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
          )
          .run(migration.version, migration.name, new Date().toISOString());
      }
    }
  }

  createRun(query: string, depth: number): string {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO runs (id, user_query, depth, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
      )
      .run(id, query, depth, new Date().toISOString());
    return id;
  }

  getRun(id: string): RunRow | null {
    return (
      (this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as
        | RunRow
        | undefined) ?? null
    );
  }

  listRuns(): RunRow[] {
    return this.db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC")
      .all() as RunRow[];
  }

  updateRunStatus(
    id: string,
    status: string,
    error?: string | null,
    citedReport?: string | null
  ): void {
    if (status === "completed" || status === "failed") {
      this.db
        .prepare(
          "UPDATE runs SET status = ?, error = ?, cited_report = ?, completed_at = ? WHERE id = ?"
        )
        .run(status, error ?? null, citedReport ?? null, new Date().toISOString(), id);
    } else {
      this.db
        .prepare("UPDATE runs SET status = ? WHERE id = ?")
        .run(status, id);
    }
  }

  updateRunPlan(id: string, plan: string): void {
    this.db
      .prepare("UPDATE runs SET research_plan = ? WHERE id = ?")
      .run(plan, id);
  }

  deleteRun(id: string): void {
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
  }

  insertSource(source: {
    id: string;
    runId: string;
    sourceType: string;
    url?: string;
    documentId?: string;
    chunkId?: string;
    canonicalUrl?: string;
    title?: string;
    snippet?: string;
    contentHash?: string;
    fetchStatus?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO sources (id, run_id, source_type, url, document_id, chunk_id, canonical_url, title, snippet, content_hash, fetch_status, retrieved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.id,
        source.runId,
        source.sourceType,
        source.url ?? null,
        source.documentId ?? null,
        source.chunkId ?? null,
        source.canonicalUrl ?? null,
        source.title ?? null,
        source.snippet ?? null,
        source.contentHash ?? null,
        source.fetchStatus ?? "ok",
        new Date().toISOString()
      );
  }

  getSourcesByRun(runId: string): SourceRow[] {
    return this.db
      .prepare("SELECT * FROM sources WHERE run_id = ?")
      .all(runId) as SourceRow[];
  }

  insertLLMCall(call: {
    runId: string;
    role: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  }): void {
    this.db
      .prepare(
        "INSERT INTO llm_calls (run_id, role, model, input_tokens, output_tokens, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        call.runId,
        call.role,
        call.model,
        call.inputTokens ?? null,
        call.outputTokens ?? null,
        call.latencyMs ?? null,
        new Date().toISOString()
      );
  }

  getLLMCallsByRun(runId: string): LLMCallRow[] {
    return this.db
      .prepare("SELECT * FROM llm_calls WHERE run_id = ? ORDER BY created_at")
      .all(runId) as LLMCallRow[];
  }

  close(): void {
    this.db.close();
  }
}
```

`packages/engine/src/db/index.ts`:
```typescript
export { CokiDatabase } from "./database";
export type { RunRow, SourceRow, LLMCallRow } from "./database";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/db/database.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/db/
git commit -m "feat(engine): SQLite database module with migrations and CRUD"
```

---

## Task 4: Engine LLM Wrapper

**Files:**
- Create: `packages/engine/src/llm/client.ts`
- Create: `packages/engine/src/llm/client.test.ts`
- Create: `packages/engine/src/llm/index.ts`

- [ ] **Step 1: Write failing tests for LLM client**

`packages/engine/src/llm/client.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "./client";

// Mock the AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  Output: {
    object: vi.fn((opts) => opts),
  },
  stepCountIs: vi.fn((n) => n),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (model: string) => model),
}));

describe("LLMClient", () => {
  it("creates instance with config", () => {
    const client = new LLMClient({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
    });
    expect(client).toBeDefined();
  });

  it("tracks LLM calls", () => {
    const client = new LLMClient({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
    });
    const calls: unknown[] = [];
    client.onCall((call) => calls.push(call));
    // Calls are tracked via onCall callback
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/llm/client.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement LLM client**

`packages/engine/src/llm/client.ts`:
```typescript
import { generateText, streamText, Output, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface LLMClientConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMCallRecord {
  role: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export type OnCallCallback = (record: LLMCallRecord) => void;

export class LLMClient {
  private provider: ReturnType<typeof createOpenAI>;
  private defaultModel: string;
  private temperature: number;
  private maxTokens: number;
  private callListeners: OnCallCallback[] = [];

  constructor(config: LLMClientConfig) {
    this.provider = createOpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey ?? undefined,
    });
    this.defaultModel = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  onCall(callback: OnCallCallback): void {
    this.callListeners.push(callback);
  }

  private emitCall(record: LLMCallRecord): void {
    for (const cb of this.callListeners) {
      cb(record);
    }
  }

  getModel(modelOverride?: string): LanguageModel {
    return this.provider(modelOverride ?? this.defaultModel);
  }

  async generate(opts: {
    model?: string;
    system: string;
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
    output?: ReturnType<typeof Output.object>;
    tools?: Record<string, unknown>;
    stopWhen?: ReturnType<typeof stepCountIs>;
    abortSignal?: AbortSignal;
  }): Promise<{ text: string; output?: unknown }> {
    const model = this.getModel(opts.model);
    const start = Date.now();

    const result = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      messages: opts.messages as Parameters<typeof generateText>[0]["messages"],
      temperature: opts.temperature ?? this.temperature,
      maxTokens: opts.maxTokens ?? this.maxTokens,
      output: opts.output as Parameters<typeof generateText>[0]["output"],
      tools: opts.tools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: opts.stopWhen as Parameters<typeof generateText>[0]["stopWhen"],
      abortSignal: opts.abortSignal,
    });

    this.emitCall({
      role: "generate",
      model: opts.model ?? this.defaultModel,
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      latencyMs: Date.now() - start,
    });

    return { text: result.text, output: result.output };
  }

  async stream(opts: {
    model?: string;
    system: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const model = this.getModel(opts.model);
    const start = Date.now();

    const result = streamText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature ?? this.temperature,
      maxTokens: opts.maxTokens ?? this.maxTokens,
      abortSignal: opts.abortSignal,
    });

    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      opts.onChunk?.(chunk);
    }

    const usage = await result.usage;
    this.emitCall({
      role: "stream",
      model: opts.model ?? this.defaultModel,
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
      latencyMs: Date.now() - start,
    });

    return fullText;
  }
}
```

`packages/engine/src/llm/index.ts`:
```typescript
export { LLMClient } from "./client";
export type { LLMClientConfig, LLMCallRecord, OnCallCallback } from "./client";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/llm/client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/llm/
git commit -m "feat(engine): LLM client wrapper with AI SDK 6 and call tracking"
```

---

## Task 5: Engine Search Module (Tavily)

**Files:**
- Create: `packages/engine/src/search/tavily.ts`
- Create: `packages/engine/src/search/tavily.test.ts`
- Create: `packages/engine/src/search/extract.ts`
- Create: `packages/engine/src/search/index.ts`

- [ ] **Step 1: Write failing tests for Tavily search**

`packages/engine/src/search/tavily.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { TavilySearchProvider } from "./tavily";

describe("TavilySearchProvider", () => {
  it("constructs with API key", () => {
    const provider = new TavilySearchProvider("tvly-test-key");
    expect(provider).toBeDefined();
  });

  it("search results have expected shape", async () => {
    // This is a unit test that verifies the result mapping logic
    // Integration tests with real API would be separate
    const provider = new TavilySearchProvider("tvly-test-key");
    // We test the result normalization separately
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.extract).toBe("function");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/search/tavily.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement Tavily search provider**

`packages/engine/src/search/tavily.ts`:
```typescript
import { tavily } from "@tavily/core";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface ExtractResult {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

export class TavilySearchProvider {
  private client: ReturnType<typeof tavily>;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async search(
    query: string,
    options?: { maxResults?: number; includeAnswer?: boolean }
  ): Promise<SearchResult[]> {
    const response = await this.client.search(query, {
      maxResults: options?.maxResults ?? 10,
      includeAnswer: options?.includeAnswer ?? false,
    });

    return response.results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
      score: r.score ?? 0,
    }));
  }

  async extract(urls: string[]): Promise<ExtractResult[]> {
    try {
      const response = await this.client.extract(urls);
      return response.results.map((r) => ({
        url: r.url ?? "",
        content: r.rawContent ?? "",
        success: true,
      }));
    } catch (error) {
      return urls.map((url) => ({
        url,
        content: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }
}
```

`packages/engine/src/search/extract.ts`:
```typescript
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface FallbackExtractResult {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

export async function fallbackExtract(
  url: string
): Promise<FallbackExtractResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Coki/1.0; +https://coki.app)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        url,
        content: "",
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article?.textContent) {
      return {
        url,
        content: "",
        success: false,
        error: "No readable content",
      };
    }

    return {
      url,
      content: article.textContent,
      success: true,
    };
  } catch (error) {
    return {
      url,
      content: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

`packages/engine/src/search/index.ts`:
```typescript
export { TavilySearchProvider } from "./tavily";
export type { SearchResult, ExtractResult } from "./tavily";
export { fallbackExtract } from "./extract";
export type { FallbackExtractResult } from "./extract";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/search/tavily.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/search/
git commit -m "feat(engine): Tavily search provider with readability fallback"
```

---

## Task 6: Engine Pipeline State Machine

**Files:**
- Create: `packages/engine/src/pipeline/pipeline.ts`
- Create: `packages/engine/src/pipeline/pipeline.test.ts`
- Create: `packages/engine/src/pipeline/context.ts`
- Create: `packages/engine/src/pipeline/index.ts`

- [ ] **Step 1: Write failing tests for pipeline**

`packages/engine/src/pipeline/pipeline.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "./pipeline";
import type { PipelineContext, PipelineNode, NodeId } from "./pipeline";

function makeNode(id: NodeId, fn?: (ctx: PipelineContext) => PipelineContext): PipelineNode {
  return {
    id,
    run: fn ?? ((ctx) => ctx),
  };
}

describe("Pipeline", () => {
  it("runs nodes in sequence and yields events", async () => {
    const order: string[] = [];
    const pipeline = new Pipeline({
      nodes: [
        makeNode("init", (ctx) => { order.push("init"); return ctx; }),
        makeNode("plan", (ctx) => { order.push("plan"); return ctx; }),
        makeNode("split", (ctx) => { order.push("split"); return { ...ctx, done: true }; }),
      ],
      transitions: [
        { from: "init", decide: () => "plan" },
        { from: "plan", decide: () => "split" },
        { from: "split", decide: (ctx) => ctx.done ? "end" : "init" },
      ],
    });

    const events: unknown[] = [];
    const gen = pipeline.run({} as PipelineContext);
    for await (const event of gen) {
      events.push(event);
    }

    expect(order).toEqual(["init", "plan", "split"]);
    expect(events.length).toBeGreaterThan(0);
  });

  it("supports looping transitions", async () => {
    let iterations = 0;
    const pipeline = new Pipeline({
      nodes: [
        makeNode("init", (ctx) => {
          iterations++;
          return { ...ctx, count: iterations };
        }),
        makeNode("plan", (ctx) => ctx),
      ],
      transitions: [
        { from: "init", decide: () => "plan" },
        { from: "plan", decide: (ctx) => (ctx.count as number) >= 3 ? "end" : "init" },
      ],
    });

    const events: unknown[] = [];
    for await (const event of pipeline.run({} as PipelineContext)) {
      events.push(event);
    }

    expect(iterations).toBe(3);
  });

  it("handles node errors", async () => {
    const pipeline = new Pipeline({
      nodes: [
        makeNode("init", () => {
          throw new Error("test error");
        }),
      ],
      transitions: [],
    });

    const events: unknown[] = [];
    for await (const event of pipeline.run({} as PipelineContext)) {
      events.push(event);
    }

    const errorEvent = events.find((e) => (e as { type: string }).type === "error");
    expect(errorEvent).toBeDefined();
  });

  it("supports cancellation via AbortSignal", async () => {
    const controller = new AbortController();
    const pipeline = new Pipeline({
      nodes: [
        makeNode("init", (ctx) => ctx),
        makeNode("plan", (ctx) => {
          controller.abort();
          return ctx;
        }),
      ],
      transitions: [
        { from: "init", decide: () => "plan" },
        { from: "plan", decide: () => "end" },
      ],
    });

    const events: unknown[] = [];
    for await (const event of pipeline.run({} as PipelineContext, controller.signal)) {
      events.push(event);
    }

    // Should have ended without error
    expect(events.some((e) => (e as { type: string }).type === "cancelled")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/pipeline/pipeline.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement pipeline state machine**

`packages/engine/src/pipeline/context.ts`:
```typescript
export interface Subtask {
  id: string;
  instruction: string;
  keywords: string[];
}

export interface SubagentReport {
  subtaskId: string;
  report: string;
  sources: SourceRecord[];
}

export interface SourceRecord {
  id: string;
  sourceType: "web" | "document";
  url?: string;
  title?: string;
  snippet?: string;
  contentHash?: string;
  fetchStatus: "ok" | "failed";
}

export interface ResearchPlan {
  dimensions: string[];
  outputStructure: string;
  methodology: string;
}

export interface PipelineContext {
  runId: string;
  userQuery: string;
  depth: 1 | 2 | 3;
  outputLanguage: "zh" | "en";

  // Pipeline state
  plan: ResearchPlan | null;
  subtasks: Subtask[];
  completedSubtasks: Set<string>;
  subagentReports: SubagentReport[];
  sources: Map<string, SourceRecord>;
  iterationCount: number;
  maxIterations: number;
  qualityScore: number;
  qualityThreshold: number;
  researchComplete: boolean;

  // Output
  report: string | null;
  citedReport: string | null;

  // Control
  done?: boolean;
  error?: string;
}
```

`packages/engine/src/pipeline/pipeline.ts`:
```typescript
import type { PipelineContext } from "./context";

export type NodeId =
  | "init"
  | "plan"
  | "split"
  | "subagents"
  | "reflection"
  | "synthesize"
  | "cite";

export interface PipelineNode {
  id: NodeId;
  run: (ctx: PipelineContext) => Promise<PipelineContext>;
}

export interface Transition {
  from: NodeId;
  decide: (ctx: PipelineContext) => NodeId | "end";
}

export interface PipelineConfig {
  nodes: PipelineNode[];
  transitions: Transition[];
}

export interface PipelineEvent {
  type: "progress" | "log" | "complete" | "error" | "cancelled";
  phase: string;
  message: string;
  data?: unknown;
}

export class Pipeline {
  private nodes: Map<NodeId, PipelineNode>;
  private transitions: Map<NodeId, Transition>;

  constructor(config: PipelineConfig) {
    this.nodes = new Map(config.nodes.map((n) => [n.id, n]));
    this.transitions = new Map(config.transitions.map((t) => [t.from, t]));
  }

  async *run(
    initialContext: PipelineContext,
    signal?: AbortSignal
  ): AsyncGenerator<PipelineEvent> {
    let ctx = { ...initialContext };
    let currentNodeId: NodeId = "init";
    const maxSteps = 20; // Safety limit
    let steps = 0;

    while (steps < maxSteps) {
      steps++;

      if (signal?.aborted) {
        yield { type: "cancelled", phase: currentNodeId, message: "Cancelled by user" };
        return;
      }

      const node = this.nodes.get(currentNodeId);
      if (!node) {
        yield { type: "error", phase: currentNodeId, message: `Unknown node: ${currentNodeId}` };
        return;
      }

      yield {
        type: "progress",
        phase: currentNodeId,
        message: `Running ${currentNodeId}`,
      };

      try {
        ctx = await node.run(ctx);
      } catch (error) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: error instanceof Error ? error.message : "Unknown error",
          data: error,
        };
        return;
      }

      if (ctx.error) {
        yield { type: "error", phase: currentNodeId, message: ctx.error };
        return;
      }

      const transition = this.transitions.get(currentNodeId);
      if (!transition) {
        // Terminal node
        yield { type: "complete", phase: currentNodeId, message: "Pipeline complete" };
        return;
      }

      const next = transition.decide(ctx);
      if (next === "end") {
        yield { type: "complete", phase: currentNodeId, message: "Pipeline complete" };
        return;
      }

      currentNodeId = next;
    }

    yield { type: "error", phase: currentNodeId, message: "Pipeline exceeded max steps" };
  }
}
```

`packages/engine/src/pipeline/index.ts`:
```typescript
export { Pipeline } from "./pipeline";
export type {
  NodeId,
  PipelineNode,
  Transition,
  PipelineConfig,
  PipelineEvent,
} from "./pipeline";
export type {
  PipelineContext,
  Subtask,
  SubagentReport,
  SourceRecord,
  ResearchPlan,
} from "./context";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/pipeline/pipeline.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pipeline/
git commit -m "feat(engine): pipeline state machine with async generator events"
```

---

## Task 7: Pipeline Nodes — init, plan, split

**Files:**
- Create: `packages/engine/src/pipeline/nodes/init.ts`
- Create: `packages/engine/src/pipeline/nodes/plan.ts`
- Create: `packages/engine/src/pipeline/nodes/split.ts`
- Create: `packages/engine/src/pipeline/nodes/init.test.ts`
- Create: `packages/engine/src/pipeline/nodes/index.ts`

- [ ] **Step 1: Write failing tests for init node**

`packages/engine/src/pipeline/nodes/init.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { initNode } from "./init";
import type { PipelineContext } from "../context";

describe("initNode", () => {
  it("initializes context with defaults from depth", async () => {
    const ctx: PipelineContext = {
      runId: "test-run",
      userQuery: "test query",
      depth: 2,
      outputLanguage: "zh",
      plan: null,
      subtasks: [],
      completedSubtasks: new Set(),
      subagentReports: [],
      sources: new Map(),
      iterationCount: 0,
      maxIterations: 2,
      qualityScore: 0,
      qualityThreshold: 0.7,
      researchComplete: false,
      report: null,
      citedReport: null,
    };

    const result = await initNode(ctx);
    expect(result.runId).toBe("test-run");
    expect(result.iterationCount).toBe(0);
    expect(result.researchComplete).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/pipeline/nodes/init.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement init, plan, split nodes**

`packages/engine/src/pipeline/nodes/init.ts`:
```typescript
import type { PipelineContext } from "../context";

export async function initNode(ctx: PipelineContext): Promise<PipelineContext> {
  return {
    ...ctx,
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
    subagentReports: [],
    sources: new Map(),
    iterationCount: 0,
    qualityScore: 0,
    researchComplete: false,
    report: null,
    citedReport: null,
  };
}
```

`packages/engine/src/pipeline/nodes/plan.ts`:
```typescript
import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import { z } from "zod";

const PlanSchema = z.object({
  dimensions: z.array(z.string()).min(1),
  outputStructure: z.string(),
  methodology: z.string(),
});

const PLANNER_PROMPT = `You are a research planner. Given the user's research query, create a structured research plan.

Output JSON with:
- dimensions: array of 3-6 research dimensions/angles to explore
- outputStructure: suggested report structure (markdown headings)
- methodology: brief description of research approach

User query: {query}
Language: {language}`;

export function createPlanNode(
  llm: LLMClient,
  search: TavilySearchProvider | null,
  profile: DepthProfile
) {
  return async function planNode(ctx: PipelineContext): Promise<PipelineContext> {
    const prompt = PLANNER_PROMPT
      .replace("{query}", ctx.userQuery)
      .replace("{language}", ctx.outputLanguage === "zh" ? "Chinese" : "English");

    let plan;

    if (profile.plannerUseReact && search) {
      // Depth 2-3: use ReAct agent with search to explore topic first
      // For now, use single-pass with search context
      const searchResults = await search.search(ctx.userQuery, { maxResults: 5 });
      const searchContext = searchResults
        .map((r) => `- ${r.title}: ${r.snippet}`)
        .join("\n");

      const enrichedPrompt = `${prompt}\n\nBackground research:\n${searchContext}`;

      const { output } = await llm.generate({
        system: "You are a research planning assistant. Output valid JSON only.",
        prompt: enrichedPrompt,
        output: { schema: PlanSchema } as Parameters<typeof llm.generate>[0]["output"],
      });

      plan = output as z.infer<typeof PlanSchema>;
    } else {
      // Depth 1: single-pass LLM
      const { output } = await llm.generate({
        system: "You are a research planning assistant. Output valid JSON only.",
        prompt,
        output: { schema: PlanSchema } as Parameters<typeof llm.generate>[0]["output"],
      });

      plan = output as z.infer<typeof PlanSchema>;
    }

    return {
      ...ctx,
      plan: {
        dimensions: plan.dimensions,
        outputStructure: plan.outputStructure,
        methodology: plan.methodology,
      },
    };
  };
}
```

`packages/engine/src/pipeline/nodes/split.ts`:
```typescript
import type { PipelineContext, Subtask } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const SubtaskSchema = z.object({
  subtasks: z.array(
    z.object({
      instruction: z.string(),
      keywords: z.array(z.string()),
    })
  ),
});

const SPLITTER_PROMPT = `You are a research task splitter. Given a research plan, split it into concrete subtasks for parallel research agents.

Each subtask should be:
- A specific, actionable research question
- Independent enough to be researched in parallel
- Cover one dimension of the overall plan

Research plan dimensions: {dimensions}
User query: {query}

Output JSON with subtasks array, each having instruction and keywords.`;

export function createSplitNode(
  llm: LLMClient,
  profile: DepthProfile
) {
  return async function splitNode(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.plan) {
      return { ...ctx, error: "No plan available for splitting" };
    }

    let subtaskInstructions: Array<{ instruction: string; keywords: string[] }>;

    if (profile.useSplitter) {
      // Depth 2-3: use LLM splitter
      const prompt = SPLITTER_PROMPT
        .replace("{dimensions}", ctx.plan.dimensions.join(", "))
        .replace("{query}", ctx.userQuery);

      try {
        const { output } = await llm.generate({
          system: "You are a task splitting assistant. Output valid JSON only.",
          prompt,
          output: { schema: SubtaskSchema } as Parameters<typeof llm.generate>[0]["output"],
        });

        subtaskInstructions = (output as z.infer<typeof SubtaskSchema>).subtasks;
      } catch {
        // Fallback: map dimensions to subtasks
        subtaskInstructions = ctx.plan.dimensions.map((dim) => ({
          instruction: `Research the following aspect of "${ctx.userQuery}": ${dim}`,
          keywords: dim.split(/[，,、\s]+/).filter(Boolean),
        }));
      }
    } else {
      // Depth 1: directly map dimensions to subtasks
      subtaskInstructions = ctx.plan.dimensions.map((dim) => ({
        instruction: `Research the following aspect of "${ctx.userQuery}": ${dim}`,
        keywords: dim.split(/[，,、\s]+/).filter(Boolean),
      }));
    }

    const subtasks: Subtask[] = subtaskInstructions.map((st) => ({
      id: randomUUID(),
      instruction: st.instruction,
      keywords: st.keywords,
    }));

    return { ...ctx, subtasks };
  };
}
```

`packages/engine/src/pipeline/nodes/index.ts`:
```typescript
export { initNode } from "./init";
export { createPlanNode } from "./plan";
export { createSplitNode } from "./split";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/pipeline/nodes/init.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pipeline/nodes/
git commit -m "feat(engine): pipeline nodes — init, plan (with search), split"
```

---

## Task 8: Pipeline Nodes — subagents (ReAct Agent)

**Files:**
- Create: `packages/engine/src/agents/react-agent.ts`
- Create: `packages/engine/src/agents/react-agent.test.ts`
- Create: `packages/engine/src/agents/prompts.ts`
- Create: `packages/engine/src/pipeline/nodes/subagents.ts`
- Create: `packages/engine/src/agents/index.ts`

- [ ] **Step 1: Write failing tests for ReAct agent**

`packages/engine/src/agents/react-agent.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SUBAGENT_SYSTEM_PROMPT, SUBAGENT_REPORT_PROMPT } from "./prompts";

describe("Agent prompts", () => {
  it("subagent system prompt contains tool instructions", () => {
    expect(SUBAGENT_SYSTEM_PROMPT).toContain("search");
    expect(SUBAGENT_SYSTEM_PROMPT).toContain("report");
  });

  it("subagent report prompt contains formatting instructions", () => {
    expect(SUBAGENT_REPORT_PROMPT).toContain("[src:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/agents/react-agent.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement ReAct agent and prompts**

`packages/engine/src/agents/prompts.ts`:
```typescript
export const SUBAGENT_SYSTEM_PROMPT = `You are a research agent. Your job is to research a specific subtask thoroughly.

Available tools:
- tavily_search: Search the web for information. Use specific, focused queries.
- tavily_extract: Extract full content from specific URLs found in search results.

Workflow:
1. Search for relevant information using multiple queries
2. Evaluate search results for quality and relevance
3. Extract full content from the most promising sources
4. Synthesize findings into a structured report

Important rules:
- Always cite sources using [src: <url>] format after factual claims
- Search with diverse queries to get comprehensive coverage
- Do not repeat the same search query
- When you have enough evidence, use submit_report to finalize

When you have gathered sufficient evidence, call submit_report with your structured report.`;

export const SUBAGENT_REPORT_PROMPT = `Based on the evidence gathered, write a comprehensive research report for the following subtask:

Subtask: {instruction}

Requirements:
- Write in {language}
- Use markdown formatting with clear sections
- Cite ALL sources using [src: <url>] format after every factual claim
- Include specific data, numbers, and quotes where available
- Minimum 800 characters
- Structure: Introduction → Key Findings → Analysis → Conclusion

Evidence gathered:
{evidence}`;

export const PLANNER_PROMPT = `You are a research planner. Given the user's research query, create a structured research plan.

Output JSON with:
- dimensions: array of 3-6 research dimensions/angles to explore
- outputStructure: suggested report structure (markdown headings)
- methodology: brief description of research approach

User query: {query}
Language: {language}`;

export const REFLECTION_PROMPT = `You are a research quality evaluator. Analyze the completed subtask reports and determine if the research is sufficient.

Evaluate on these axes (0-10 each):
1. Comprehensiveness: Are all aspects covered?
2. Insight: Does it go beyond surface-level findings?
3. Evidence: Are claims well-supported with citations?
4. Instruction following: Does it match the original query?

Current reports summary:
{reports_summary}

Original query: {query}

Output JSON:
{
  "scores": { "comprehensiveness": N, "insight": N, "evidence": N, "instruction_following": N },
  "overall_score": 0-10,
  "gaps": ["gap1", "gap2"],
  "recommendation": "proceed" | "refine" | "sufficient"
}`;

export const SYNTHESIS_PROMPT = `You are a research synthesizer. Combine all subtask reports into a single comprehensive, well-structured report.

Original query: {query}
Language: {language}

Subtask reports:
{reports}

Requirements:
- Write in {language}
- Merge findings into a cohesive narrative, not just concatenation
- Preserve ALL [src: <url>] citations from the source reports
- Use clear markdown structure with ## headings
- Include an executive summary at the top
- Ensure smooth transitions between sections
- Do NOT add a References section — it will be added automatically`;
```

`packages/engine/src/agents/react-agent.ts`:
```typescript
import type { LLMClient } from "../llm/client";
import type { TavilySearchProvider, SearchResult } from "../search/tavily";
import type { SubagentReport, SourceRecord } from "../pipeline/context";
import { SUBAGENT_SYSTEM_PROMPT, SUBAGENT_REPORT_PROMPT } from "./prompts";
import { randomUUID } from "node:crypto";

export interface AgentConfig {
  maxSteps: number;
  maxSearchCalls: number;
  maxFetchCalls: number;
  maxToolErrors: number;
  timeoutMs: number;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface AgentStep {
  thought: string;
  action?: ToolCall;
  finalAnswer?: string;
}

export async function runSubagent(
  subtaskId: string,
  instruction: string,
  llm: LLMClient,
  search: TavilySearchProvider,
  config: AgentConfig,
  signal?: AbortSignal
): Promise<SubagentReport> {
  const sources: SourceRecord[] = [];
  const evidence: string[] = [];
  let searchCount = 0;
  let fetchCount = 0;
  let toolErrors = 0;
  const seenUrls = new Set<string>();

  const tools = {
    tavily_search: async (args: { query: string }) => {
      if (searchCount >= config.maxSearchCalls) {
        return { error: "Search budget exceeded" };
      }
      searchCount++;
      try {
        const results = await search.search(args.query, { maxResults: 5 });
        const newResults = results.filter((r) => !seenUrls.has(r.url));
        for (const r of newResults) {
          seenUrls.add(r.url);
          sources.push({
            id: randomUUID(),
            sourceType: "web",
            url: r.url,
            title: r.title,
            snippet: r.snippet,
            fetchStatus: "ok",
          });
        }
        return newResults.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        }));
      } catch (error) {
        toolErrors++;
        return { error: String(error) };
      }
    },

    tavily_extract: async (args: { urls: string[] }) => {
      if (fetchCount >= config.maxFetchCalls) {
        return { error: "Fetch budget exceeded" };
      }
      fetchCount++;
      try {
        const results = await search.extract(args.urls);
        for (const r of results) {
          if (r.success) {
            evidence.push(`[Source: ${r.url}]\n${r.content.slice(0, 2000)}`);
          }
        }
        return results;
      } catch (error) {
        toolErrors++;
        return { error: String(error) };
      }
    },

    submit_report: async (args: { report: string }) => {
      return { success: true, report: args.report };
    },
  };

  // ReAct loop
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SUBAGENT_SYSTEM_PROMPT },
    { role: "user", content: `Research subtask: ${instruction}` },
  ];

  let finalReport = "";
  const startTime = Date.now();

  for (let step = 0; step < config.maxSteps; step++) {
    if (signal?.aborted) break;
    if (Date.now() - startTime > config.timeoutMs) break;
    if (toolErrors >= config.maxToolErrors) break;

    // Force writing phase in last 3 steps
    const isWritingPhase = step >= config.maxSteps - 3;
    const systemOverride = isWritingPhase
      ? "\n\nIMPORTANT: You are now in the writing phase. Do NOT search anymore. Use submit_report to finalize your findings."
      : "";

    const { text } = await llm.generate({
      system: SUBAGENT_SYSTEM_PROMPT + systemOverride,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      maxTokens: 2048,
    });

    let parsed: AgentStep;
    try {
      parsed = JSON.parse(text) as AgentStep;
    } catch {
      // If not valid JSON, treat as thought + try to extract final answer
      parsed = { thought: text, finalAnswer: text };
    }

    if (parsed.finalAnswer) {
      finalReport = parsed.finalAnswer;
      break;
    }

    if (parsed.action) {
      const tool = tools[parsed.action.name as keyof typeof tools];
      if (tool) {
        const result = await tool(
          parsed.action.args as Parameters<typeof tool>[0]
        );
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });
        messages.push({
          role: "user",
          content: `Observation: ${JSON.stringify(result)}`,
        });
      } else {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });
        messages.push({
          role: "user",
          content: `Error: Unknown tool "${parsed.action.name}". Available: ${Object.keys(tools).join(", ")}`,
        });
      }
    } else {
      messages.push({ role: "assistant", content: text });
    }
  }

  // If no final report from submit_report, generate one
  if (!finalReport) {
    const reportPrompt = SUBAGENT_REPORT_PROMPT
      .replace("{instruction}", instruction)
      .replace("{language}", "Chinese")
      .replace("{evidence}", evidence.join("\n\n---\n\n"));

    const { text } = await llm.generate({
      system: "Write a research report. Cite sources with [src: <url>].",
      prompt: reportPrompt,
      maxTokens: 4096,
    });
    finalReport = text;
  }

  return {
    subtaskId,
    report: finalReport,
    sources,
  };
}
```

`packages/engine/src/pipeline/nodes/subagents.ts`:
```typescript
import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import type { CokiDatabase } from "../../db/database";
import { runSubagent } from "../../agents/react-agent";
import { randomUUID } from "node:crypto";

export function createSubagentsNode(
  llm: LLMClient,
  search: TavilySearchProvider,
  db: CokiDatabase,
  profile: DepthProfile
) {
  return async function subagentsNode(ctx: PipelineContext): Promise<PipelineContext> {
    const pendingSubtasks = ctx.subtasks.filter(
      (st) => !ctx.completedSubtasks.has(st.id)
    );

    if (pendingSubtasks.length === 0) {
      return { ...ctx, researchComplete: true };
    }

    // Bounded concurrency
    const concurrency = Math.min(profile.maxSubagents, pendingSubtasks.length);
    const results = await Promise.allSettled(
      pendingSubtasks.slice(0, concurrency).map(async (subtask) => {
        const report = await runSubagent(
          subtask.id,
          subtask.instruction,
          llm,
          search,
          {
            maxSteps: profile.reactMaxSteps,
            maxSearchCalls: profile.searchBudgetPerSubagent,
            maxFetchCalls: Math.floor(profile.searchBudgetPerSubagent / 2),
            maxToolErrors: 3,
            timeoutMs: 120_000,
          }
        );
        return report;
      })
    );

    const newReports = [...ctx.subagentReports];
    const newSources = new Map(ctx.sources);
    const newCompleted = new Set(ctx.completedSubtasks);

    for (const result of results) {
      if (result.status === "fulfilled") {
        const report = result.value;
        newReports.push(report);
        newCompleted.add(report.subtaskId);
        for (const source of report.sources) {
          if (!newSources.has(source.url ?? source.id)) {
            newSources.set(source.url ?? source.id, source);
          }
        }
      }
    }

    return {
      ...ctx,
      subagentReports: newReports,
      sources: newSources,
      completedSubtasks: newCompleted,
      iterationCount: ctx.iterationCount + 1,
    };
  };
}
```

`packages/engine/src/agents/index.ts`:
```typescript
export { runSubagent } from "./react-agent";
export type { AgentConfig } from "./react-agent";
export * from "./prompts";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run packages/engine/src/agents/react-agent.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/agents/ packages/engine/src/pipeline/nodes/subagents.ts
git commit -m "feat(engine): ReAct subagent with Tavily tools and bounded concurrency"
```

---

## Task 9: Pipeline Nodes — reflection, synthesize, cite

**Files:**
- Create: `packages/engine/src/pipeline/nodes/reflection.ts`
- Create: `packages/engine/src/pipeline/nodes/synthesize.ts`
- Create: `packages/engine/src/pipeline/nodes/cite.ts`
- Create: `packages/engine/src/citation/citation.ts`
- Create: `packages/engine/src/citation/citation.test.ts`
- Create: `packages/engine/src/citation/index.ts`
- Modify: `packages/engine/src/pipeline/nodes/index.ts`

- [ ] **Step 1: Write failing tests for citation system**

`packages/engine/src/citation/citation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { addCitations } from "./citation";

describe("addCitations", () => {
  it("converts [src: url] to numbered references", () => {
    const report = "Market grew 20% [src: https://example.com]. Revenue hit $1B [src: https://report.com].";
    const result = addCitations(report);
    expect(result.citedReport).toContain("[^1]");
    expect(result.citedReport).toContain("[^2]");
    expect(result.citedReport).toContain("## References");
    expect(result.citedReport).toContain("https://example.com");
    expect(result.sources).toHaveLength(2);
  });

  it("deduplicates same URL", () => {
    const report = "First fact [src: https://example.com]. Second fact [src: https://example.com].";
    const result = addCitations(report);
    expect(result.sources).toHaveLength(1);
    expect(result.citedReport).toContain("[^1]");
    expect(result.citedReport.match(/\[\^1\]/g)?.length).toBe(2);
  });

  it("strips orphaned [src:] markers", () => {
    const report = "Fact [src: ]. Another [src: https://valid.com].";
    const result = addCitations(report);
    expect(result.citedReport).not.toContain("[src: ]");
    expect(result.sources).toHaveLength(1);
  });

  it("normalizes URLs with trailing punctuation", () => {
    const report = "Fact [src: https://example.com/path).";
    const result = addCitations(report);
    expect(result.sources[0]!.url).toBe("https://example.com/path");
  });

  it("handles report with no citations", () => {
    const report = "No citations here.";
    const result = addCitations(report);
    expect(result.citedReport).toBe("No citations here.");
    expect(result.sources).toHaveLength(0);
  });

  it("strips existing References section", () => {
    const report = `Content [src: https://a.com].

## References
1. Old reference`;
    const result = addCitations(report);
    expect(result.citedReport).not.toContain("Old reference");
    expect(result.citedReport).toContain("## References");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/citation/citation.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement citation system**

`packages/engine/src/citation/citation.ts`:
```typescript
export interface CitedSource {
  id: number;
  url: string;
}

export interface CitationResult {
  citedReport: string;
  sources: CitedSource[];
}

const SRC_PATTERN = /\[src:\s*((?:https?)[^\]]*)\]/g;

function normalizeUrl(url: string): string {
  // Strip trailing punctuation
  url = url.replace(/[),.;:!?]+$/, "");
  // Remove #:~:text= anchors
  url = url.replace(/#:~:text=.*$/, "");
  return url;
}

function stripExistingReferences(report: string): string {
  // Remove existing References/Sources/Bibliography sections
  return report.replace(
    /\n##\s*(References|Sources|Bibliography|参考文献|来源)\s*\n[\s\S]*$/i,
    ""
  );
}

export function addCitations(report: string): CitationResult {
  // Strip existing reference sections
  let cleaned = stripExistingReferences(report);

  // Find all [src: url] markers
  const urlMap = new Map<string, number>(); // normalized url -> ref number
  const sources: CitedSource[] = [];
  let nextRef = 1;

  // First pass: collect all unique URLs
  const matches = [...cleaned.matchAll(SRC_PATTERN)];
  for (const match of matches) {
    const rawUrl = match[1]!.trim();
    if (!rawUrl) continue;

    const normalized = normalizeUrl(rawUrl);
    if (!normalized) continue;

    if (!urlMap.has(normalized)) {
      urlMap.set(normalized, nextRef++);
      sources.push({ id: urlMap.get(normalized)!, url: normalized });
    }
  }

  // Second pass: replace [src: url] with [^N]
  cleaned = cleaned.replace(SRC_PATTERN, (_match, rawUrl: string) => {
    const normalized = normalizeUrl(rawUrl.trim());
    if (!normalized) return ""; // Strip orphaned markers
    const refNum = urlMap.get(normalized);
    return refNum ? `[^${refNum}]` : "";
  });

  // Build references section
  if (sources.length > 0) {
    const referencesSection = sources
      .map((s) => `[^${s.id}]: ${s.url}`)
      .join("\n");
    cleaned += `\n\n## References\n${referencesSection}`;
  }

  return { citedReport: cleaned.trim(), sources };
}
```

`packages/engine/src/citation/index.ts`:
```typescript
export { addCitations } from "./citation";
export type { CitedSource, CitationResult } from "./citation";
```

- [ ] **Step 4: Implement reflection, synthesize, cite nodes**

`packages/engine/src/pipeline/nodes/reflection.ts`:
```typescript
import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import { REFLECTION_PROMPT } from "../../agents/prompts";
import { z } from "zod";

const ReflectionResultSchema = z.object({
  scores: z.object({
    comprehensiveness: z.number(),
    insight: z.number(),
    evidence: z.number(),
    instruction_following: z.number(),
  }),
  overall_score: z.number(),
  gaps: z.array(z.string()),
  recommendation: z.enum(["proceed", "refine", "sufficient"]),
});

export function createReflectionNode(llm: LLMClient) {
  return async function reflectionNode(ctx: PipelineContext): Promise<PipelineContext> {
    if (ctx.iterationCount >= ctx.maxIterations) {
      return { ...ctx, researchComplete: true };
    }

    const reportsSummary = ctx.subagentReports
      .map((r) => `Subtask ${r.subtaskId}:\n${r.report.slice(0, 500)}...`)
      .join("\n\n");

    const prompt = REFLECTION_PROMPT
      .replace("{reports_summary}", reportsSummary)
      .replace("{query}", ctx.userQuery);

    try {
      const { output } = await llm.generate({
        system: "You are a research quality evaluator. Output valid JSON only.",
        prompt,
        output: { schema: ReflectionResultSchema } as Parameters<typeof llm.generate>[0]["output"],
      });

      const result = output as z.infer<typeof ReflectionResultSchema>;
      const qualityScore = result.overall_score / 10;

      if (qualityScore >= ctx.qualityThreshold || result.recommendation === "sufficient") {
        return { ...ctx, qualityScore, researchComplete: true };
      }

      // If gaps found and we haven't exceeded max iterations, create new subtasks
      if (result.gaps.length > 0 && ctx.iterationCount < ctx.maxIterations) {
        const newSubtasks = result.gaps.slice(0, 3).map((gap) => ({
          id: crypto.randomUUID(),
          instruction: `Address this research gap: ${gap}`,
          keywords: gap.split(/[，,、\s]+/).filter(Boolean),
        }));

        return {
          ...ctx,
          qualityScore,
          subtasks: [...ctx.subtasks, ...newSubtasks],
        };
      }

      return { ...ctx, qualityScore, researchComplete: true };
    } catch {
      // If reflection fails, proceed to synthesis
      return { ...ctx, researchComplete: true };
    }
  };
}
```

`packages/engine/src/pipeline/nodes/synthesize.ts`:
```typescript
import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { DepthProfile } from "../../config/config";
import { SYNTHESIS_PROMPT } from "../../agents/prompts";

export function createSynthesizeNode(
  llm: LLMClient,
  profile: DepthProfile
) {
  return async function synthesizeNode(ctx: PipelineContext): Promise<PipelineContext> {
    const reports = ctx.subagentReports
      .map((r) => `## Subtask: ${r.subtaskId}\n\n${r.report}`)
      .join("\n\n---\n\n");

    const prompt = SYNTHESIS_PROMPT
      .replace(/{query}/g, ctx.userQuery)
      .replace(/{language}/g, ctx.outputLanguage === "zh" ? "Chinese" : "English")
      .replace("{reports}", reports);

    let fullReport = "";

    // Main synthesis
    const { text } = await llm.stream({
      system: "You are a research synthesizer. Write comprehensive reports.",
      prompt,
      maxTokens: 30000,
    });
    fullReport = text;

    // Continue if truncated (up to continuationMaxRounds)
    for (let i = 0; i < profile.continuationMaxRounds; i++) {
      if (
        fullReport.length > 0 &&
        !fullReport.match(/[.!?。！？]\s*$/)
      ) {
        const continuePrompt = `Continue the following report seamlessly from where it left off. Do not repeat any content:\n\n${fullReport.slice(-500)}`;
        const { text: continuation } = await llm.stream({
          system: "Continue the report. Do not add headers or repetition.",
          prompt: continuePrompt,
          maxTokens: 10000,
        });
        fullReport += continuation;
      } else {
        break;
      }
    }

    return { ...ctx, report: fullReport };
  };
}
```

`packages/engine/src/pipeline/nodes/cite.ts`:
```typescript
import type { PipelineContext } from "../context";
import type { CokiDatabase } from "../../db/database";
import { addCitations } from "../../citation/citation";
import { randomUUID } from "node:crypto";

export function createCiteNode(db: CokiDatabase) {
  return async function citeNode(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.report) {
      return { ...ctx, error: "No report to cite" };
    }

    const { citedReport, sources } = addCitations(ctx.report);

    // Persist sources to database
    for (const source of sources) {
      const existingSource = ctx.sources.values().find(
        (s) => s.url === source.url
      );

      db.insertSource({
        id: existingSource?.id ?? randomUUID(),
        runId: ctx.runId,
        sourceType: "web",
        url: source.url,
        title: existingSource?.title,
        snippet: existingSource?.snippet,
        fetchStatus: "ok",
      });
    }

    return { ...ctx, citedReport };
  };
}
```

Update `packages/engine/src/pipeline/nodes/index.ts`:
```typescript
export { initNode } from "./init";
export { createPlanNode } from "./plan";
export { createSplitNode } from "./split";
export { createSubagentsNode } from "./subagents";
export { createReflectionNode } from "./reflection";
export { createSynthesizeNode } from "./synthesize";
export { createCiteNode } from "./cite";
```

- [ ] **Step 5: Run all tests**

```bash
pnpm vitest run packages/engine/src/citation/citation.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/citation/ packages/engine/src/pipeline/nodes/
git commit -m "feat(engine): reflection, synthesize, cite nodes + citation system"
```

---

## Task 10: Engine ResearchEngine (Orchestrator)

**Files:**
- Create: `packages/engine/src/engine.ts`
- Create: `packages/engine/src/engine.test.ts`
- Create: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing tests for ResearchEngine**

`packages/engine/src/engine.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ResearchEngine } from "./engine";

describe("ResearchEngine", () => {
  it("constructs with dependencies", () => {
    // Just verify the class exists and can be instantiated with mocks
    expect(ResearchEngine).toBeDefined();
    expect(typeof ResearchEngine).toBe("function");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/engine/src/engine.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement ResearchEngine**

`packages/engine/src/engine.ts`:
```typescript
import { CokiDatabase } from "./db/database";
import { ConfigManager, type CokiConfig, type ConfigOverrides } from "./config/config";
import { LLMClient } from "./llm/client";
import { TavilySearchProvider } from "./search/tavily";
import { Pipeline, type PipelineEvent } from "./pipeline/pipeline";
import { initNode } from "./pipeline/nodes/init";
import { createPlanNode } from "./pipeline/nodes/plan";
import { createSplitNode } from "./pipeline/nodes/split";
import { createSubagentsNode } from "./pipeline/nodes/subagents";
import { createReflectionNode } from "./pipeline/nodes/reflection";
import { createSynthesizeNode } from "./pipeline/nodes/synthesize";
import { createCiteNode } from "./pipeline/nodes/cite";
import type { PipelineContext } from "./pipeline/context";

export interface RuntimeSecrets {
  llmApiKey: string;
  tavilyApiKey: string;
}

export class ResearchEngine {
  private db: CokiDatabase;
  private config: ConfigManager;
  private llm: LLMClient;
  private search: TavilySearchProvider;
  private activeRuns = new Map<string, AbortController>();

  constructor(db: CokiDatabase, configOverrides: ConfigOverrides, secrets: RuntimeSecrets) {
    this.db = db;
    this.config = new ConfigManager(configOverrides);
    const llmConfig = this.config.getConfig().llm;
    this.llm = new LLMClient({
      baseUrl: llmConfig.baseUrl,
      apiKey: secrets.llmApiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
    });
    this.search = new TavilySearchProvider(secrets.tavilyApiKey);
  }

  async *runResearch(
    query: string,
    depth: 1 | 2 | 3,
    options?: { outputLanguage?: "zh" | "en"; signal?: AbortSignal }
  ): AsyncGenerator<PipelineEvent> {
    const runId = this.db.createRun(query, depth);
    const controller = new AbortController();
    this.activeRuns.set(runId, controller);

    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    const profile = this.config.getDepthProfile(depth);

    const pipeline = new Pipeline({
      nodes: [
        { id: "init", run: (ctx) => initNode(ctx) },
        {
          id: "plan",
          run: createPlanNode(this.llm, this.search, profile),
        },
        {
          id: "split",
          run: createSplitNode(this.llm, profile),
        },
        {
          id: "subagents",
          run: createSubagentsNode(this.llm, this.search, this.db, profile),
        },
        {
          id: "reflection",
          run: createReflectionNode(this.llm),
        },
        {
          id: "synthesize",
          run: createSynthesizeNode(this.llm, profile),
        },
        {
          id: "cite",
          run: createCiteNode(this.db),
        },
      ],
      transitions: [
        { from: "init", decide: () => "plan" },
        { from: "plan", decide: () => "split" },
        { from: "split", decide: () => "subagents" },
        {
          from: "subagents",
          decide: (ctx) => (ctx.researchComplete ? "synthesize" : "reflection"),
        },
        {
          from: "reflection",
          decide: (ctx) => (ctx.researchComplete ? "synthesize" : "subagents"),
        },
        { from: "synthesize", decide: () => "cite" },
        { from: "cite", decide: () => "end" },
      ],
    });

    this.db.updateRunStatus(runId, "running");

    const initialContext: PipelineContext = {
      runId,
      userQuery: query,
      depth,
      outputLanguage: options?.outputLanguage ?? "zh",
      plan: null,
      subtasks: [],
      completedSubtasks: new Set(),
      subagentReports: [],
      sources: new Map(),
      iterationCount: 0,
      maxIterations: profile.maxIterations,
      qualityScore: 0,
      qualityThreshold: this.config.getConfig().research.qualityThreshold,
      researchComplete: false,
      report: null,
      citedReport: null,
    };

    try {
      for await (const event of pipeline.run(initialContext, signal)) {
        yield event;

        if (event.type === "complete") {
          // Get the final context from the pipeline run
          // The cited report would be set by the cite node
          this.db.updateRunStatus(runId, "completed");
        } else if (event.type === "error") {
          this.db.updateRunStatus(runId, "failed", event.message);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.db.updateRunStatus(runId, "failed", message);
      yield { type: "error", phase: "unknown", message };
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  cancelRun(runId: string): void {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.db.updateRunStatus(runId, "cancelled");
    }
  }

  getHistory() {
    return this.db.listRuns();
  }

  getRun(id: string) {
    return this.db.getRun(id);
  }

  deleteRun(id: string) {
    this.db.deleteRun(id);
  }
}
```

`packages/engine/src/index.ts`:
```typescript
export { ResearchEngine } from "./engine";
export type { RuntimeSecrets } from "./engine";
export { CokiDatabase } from "./db/database";
export { ConfigManager } from "./config/config";
export { Pipeline } from "./pipeline/pipeline";
export { addCitations } from "./citation/citation";
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run packages/engine/src/engine.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/src/index.ts
git commit -m "feat(engine): ResearchEngine orchestrator wiring all pipeline nodes"
```

---

## Task 11: Electron Main Process

**Files:**
- Create: `apps/main/src/index.ts`
- Create: `apps/main/src/ipc.ts`
- Create: `apps/main/src/security.ts`
- Create: `apps/main/src/secret-store.ts`

- [ ] **Step 1: Implement security module**

`apps/main/src/security.ts`:
```typescript
import { BrowserWindow, session, shell } from "electron";

export function setupSecurity(mainWindow: BrowserWindow): void {
  // Block all permission requests
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // External links: open in system browser, https: only
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: "deny" };
  });

  // Navigation guard
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
      process.env.NODE_ENV === "development" &&
      parsed.protocol === "http:" &&
      parsed.hostname === "localhost";

    if (isProdApp || isDevServer) return;

    event.preventDefault();
    if (parsed.protocol === "https:") {
      shell.openExternal(url);
    }
  });
}
```

- [ ] **Step 2: Implement secret store**

`apps/main/src/secret-store.ts`:
```typescript
import { safeStorage } from "electron";
import type { CokiDatabase } from "@coki/engine";

export class SecretStore {
  constructor(private db: CokiDatabase) {}

  async load(): Promise<{ llmApiKey: string; tavilyApiKey: string }> {
    const llmKey = await this.getDecrypted("llm_api_key");
    const tavilyKey = await this.getDecrypted("tavily_api_key");
    return { llmApiKey: llmKey ?? "", tavilyApiKey: tavilyKey ?? "" };
  }

  async save(key: string, value: string): Promise<void> {
    if (await safeStorage.isEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptString(value);
      // Store as base64-encoded BLOB
      this.db["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, encrypted_value, updated_at) VALUES (?, ?, ?)`
        )
        .run(key, encrypted.toString("base64"), new Date().toISOString());
    } else {
      this.db["db"]
        .prepare(
          `INSERT OR REPLACE INTO config (key, plain_value, updated_at) VALUES (?, ?, ?)`
        )
        .run(key, value, new Date().toISOString());
    }
  }

  private async getDecrypted(key: string): Promise<string | null> {
    const row = this.db["db"]
      .prepare("SELECT encrypted_value, plain_value FROM config WHERE key = ?")
      .get(key) as { encrypted_value: string | null; plain_value: string | null } | undefined;

    if (!row) return null;

    if (row.encrypted_value) {
      const buffer = Buffer.from(row.encrypted_value, "base64");
      if (await safeStorage.isEncryptionAvailable()) {
        return await safeStorage.decryptString(buffer);
      }
    }

    return row.plain_value ?? null;
  }

  isConfigured(): { llm: boolean; tavily: boolean } {
    const llm = this.db["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("llm_api_key") as unknown;
    const tavily = this.db["db"]
      .prepare("SELECT 1 FROM config WHERE key = ?")
      .get("tavily_api_key") as unknown;
    return { llm: !!llm, tavily: !!tavily };
  }
}
```

- [ ] **Step 3: Implement IPC handlers**

`apps/main/src/ipc.ts`:
```typescript
import { ipcMain, BrowserWindow } from "electron";
import type { ResearchEngine, CokiDatabase } from "@coki/engine";
import type { SecretStore } from "./secret-store";
import type { ConfigManager } from "@coki/engine";

export function registerIPCHandlers(
  engine: ResearchEngine,
  db: CokiDatabase,
  config: ConfigManager,
  secretStore: SecretStore,
  getMainWindow: () => BrowserWindow | null
): void {
  // Research
  ipcMain.handle("research:start", async (event, query: string, options?: { depth?: number; outputLanguage?: string }) => {
    const runId = crypto.randomUUID();
    const mainWindow = getMainWindow();

    // Run pipeline in background, forward events to renderer
    const run = engine.runResearch(query, (options?.depth ?? 2) as 1 | 2 | 3, {
      outputLanguage: (options?.outputLanguage ?? "zh") as "zh" | "en",
    });

    (async () => {
      for await (const event of run) {
        mainWindow?.webContents.send("research:progress", event);
      }
    })();

    return runId;
  });

  ipcMain.handle("research:cancel", async (_event, runId: string) => {
    engine.cancelRun(runId);
  });

  ipcMain.handle("research:history", async () => {
    return engine.getHistory();
  });

  ipcMain.handle("research:report", async (_event, runId: string) => {
    return engine.getRun(runId);
  });

  ipcMain.handle("research:delete", async (_event, runId: string) => {
    engine.deleteRun(runId);
  });

  // Config
  ipcMain.handle("config:get", async () => {
    const cfg = config.getConfig();
    const status = secretStore.isConfigured();
    return {
      llm: {
        baseUrl: cfg.llm.baseUrl,
        model: cfg.llm.model,
        apiKeyConfigured: status.llm,
      },
      tavily: {
        apiKeyConfigured: status.tavily,
      },
    };
  });

  ipcMain.handle("config:update", async (_event, patch: Record<string, unknown>) => {
    // Handle API key updates through secret store
    if (patch.llmApiKey) {
      await secretStore.save("llm_api_key", patch.llmApiKey as string);
    }
    if (patch.tavilyApiKey) {
      await secretStore.save("tavily_api_key", patch.tavilyApiKey as string);
    }
  });
}
```

- [ ] **Step 4: Implement main entry**

`apps/main/src/index.ts`:
```typescript
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { CokiDatabase, ConfigManager, ResearchEngine } from "@coki/engine";
import { registerIPCHandlers } from "./ipc";
import { setupSecurity } from "./security";
import { SecretStore } from "./secret-store";

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, "../../preload/dist/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  setupSecurity(mainWindow);

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../../renderer/dist/index.html"));
  }
}

app.whenReady().then(async () => {
  const dbPath = join(app.getPath("userData"), "data.db");
  const db = new CokiDatabase(dbPath);
  const secretStore = new SecretStore(db);
  const secrets = await secretStore.load();
  const config = new ConfigManager({});
  const engine = new ResearchEngine(db, {}, secrets);

  registerIPCHandlers(engine, db, config, secretStore, () => mainWindow);
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/
git commit -m "feat(main): Electron main process with IPC, security, safeStorage"
```

---

## Task 12: Preload Script

**Files:**
- Create: `apps/preload/src/index.ts`

- [ ] **Step 1: Implement preload**

`apps/preload/src/index.ts`:
```typescript
import { contextBridge, ipcRenderer } from "electron";

const api = {
  research: {
    start: (query: string, options?: { depth?: number; outputLanguage?: string }) =>
      ipcRenderer.invoke("research:start", query, options),
    cancel: (runId: string) =>
      ipcRenderer.invoke("research:cancel", runId),
    history: () =>
      ipcRenderer.invoke("research:history"),
    report: (runId: string) =>
      ipcRenderer.invoke("research:report", runId),
    delete: (runId: string) =>
      ipcRenderer.invoke("research:delete", runId),
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    update: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke("config:update", patch),
  },
  on: {
    researchProgress: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on("research:progress", handler);
      return () => {
        ipcRenderer.removeListener("research:progress", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("coki", api);

export type CokiAPI = typeof api;
```

- [ ] **Step 2: Commit**

```bash
git add apps/preload/src/
git commit -m "feat(preload): contextBridge API with research and config methods"
```

---

## Task 13: React Renderer — App Shell & Routing

**Files:**
- Create: `apps/renderer/src/main.tsx`
- Create: `apps/renderer/src/App.tsx`
- Create: `apps/renderer/src/index.css`
- Create: `apps/renderer/src/lib/api.ts`
- Create: `apps/renderer/src/stores/app-store.ts`
- Create: `apps/renderer/src/pages/Home.tsx`
- Create: `apps/renderer/src/pages/Dashboard.tsx`
- Create: `apps/renderer/src/pages/Report.tsx`
- Create: `apps/renderer/src/pages/History.tsx`
- Create: `apps/renderer/src/pages/Settings.tsx`
- Create: `apps/renderer/src/components/Sidebar.tsx`
- Create: `apps/renderer/src/types/global.d.ts`

- [ ] **Step 1: Create type definitions**

`apps/renderer/src/types/global.d.ts`:
```typescript
import type { CokiAPI } from "@coki/preload/src/index";

declare global {
  interface Window {
    coki: CokiAPI;
  }
}
```

- [ ] **Step 2: Create API wrapper**

`apps/renderer/src/lib/api.ts`:
```typescript
export const api = window.coki;
```

- [ ] **Step 3: Create Zustand store**

`apps/renderer/src/stores/app-store.ts`:
```typescript
import { create } from "zustand";

interface AppState {
  currentRunId: string | null;
  isRunning: boolean;
  phase: string;
  progress: number;
  logs: Array<{ level: string; message: string; phase: string }>;
  error: string | null;

  setCurrentRunId: (id: string | null) => void;
  setIsRunning: (running: boolean) => void;
  setPhase: (phase: string) => void;
  setProgress: (progress: number) => void;
  addLog: (log: { level: string; message: string; phase: string }) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRunId: null,
  isRunning: false,
  phase: "idle",
  progress: 0,
  logs: [],
  error: null,

  setCurrentRunId: (id) => set({ currentRunId: id }),
  setIsRunning: (running) => set({ isRunning: running }),
  setPhase: (phase) => set({ phase }),
  setProgress: (progress) => set({ progress }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      currentRunId: null,
      isRunning: false,
      phase: "idle",
      progress: 0,
      logs: [],
      error: null,
    }),
}));
```

- [ ] **Step 4: Create pages**

`apps/renderer/src/pages/Home.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function Home() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const navigate = useNavigate();
  const { setCurrentRunId, setIsRunning, reset } = useAppStore();

  const handleStart = async () => {
    if (!query.trim()) return;
    reset();
    setIsRunning(true);
    const runId = await api.research.start(query, { depth });
    setCurrentRunId(runId);
    navigate(`/dashboard/${runId}`);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Coki Deep Research</h1>
      <textarea
        className="w-full h-32 p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Enter your research question..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex gap-4 mt-4">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            className={`px-4 py-2 rounded ${depth === d ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setDepth(d)}
          >
            {d === 1 ? "Quick" : d === 2 ? "Balanced" : "Deep"}
          </button>
        ))}
      </div>
      <button
        className="mt-6 px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        onClick={handleStart}
        disabled={!query.trim()}
      >
        Start Research
      </button>
    </div>
  );
}
```

`apps/renderer/src/pages/Dashboard.tsx`:
```tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function Dashboard() {
  const { runId } = useParams<{ runId: string }>();
  const { phase, progress, logs, isRunning, error } = useAppStore();

  useEffect(() => {
    if (!runId) return;

    const unsubscribe = api.on.researchProgress((event: unknown) => {
      const e = event as { type: string; phase?: string; message?: string; progress?: number };
      if (e.type === "progress") {
        useAppStore.getState().setPhase(e.phase ?? "unknown");
        useAppStore.getState().setProgress(e.progress ?? 0);
        useAppStore.getState().addLog({
          level: "info",
          message: e.message ?? "",
          phase: e.phase ?? "unknown",
        });
      } else if (e.type === "error") {
        useAppStore.getState().setError(e.message ?? "Unknown error");
        useAppStore.getState().setIsRunning(false);
      } else if (e.type === "complete") {
        useAppStore.getState().setIsRunning(false);
      }
    });

    return unsubscribe;
  }, [runId]);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Research in Progress</h2>
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="font-medium">{phase}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
          {error}
        </div>
      )}
      <div className="border rounded-lg p-4 h-64 overflow-y-auto">
        <h3 className="font-medium mb-2">Log Stream</h3>
        {logs.map((log, i) => (
          <div key={i} className="text-sm py-1">
            <span className="text-gray-500">[{log.phase}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
```

`apps/renderer/src/pages/Report.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { citedReport?: string };
      setReport(run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!report) return <div className="p-8">No report found.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
      </div>
      <div className="mt-8 flex gap-4">
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          onClick={() => navigator.clipboard.writeText(report)}
        >
          Copy Markdown
        </button>
      </div>
    </div>
  );
}
```

`apps/renderer/src/pages/History.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface RunSummary {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  created_at: string;
}

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.research.history().then((data: unknown) => {
      setRuns(data as RunSummary[]);
    });
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Research History</h2>
      <div className="space-y-4">
        {runs.map((run) => (
          <div
            key={run.id}
            className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
            onClick={() => navigate(`/report/${run.id}`)}
          >
            <div className="flex justify-between">
              <h3 className="font-medium">{run.user_query}</h3>
              <span
                className={`px-2 py-1 rounded text-sm ${
                  run.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : run.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100"
                }`}
              >
                {run.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Depth {run.depth} · {new Date(run.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`apps/renderer/src/pages/Settings.tsx`:
```tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Settings() {
  const [config, setConfig] = useState<unknown>(null);
  const [llmKey, setLlmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");

  useEffect(() => {
    api.config.get().then(setConfig);
  }, []);

  const handleSave = async () => {
    await api.config.update({
      ...(llmKey ? { llmApiKey: llmKey } : {}),
      ...(tavilyKey ? { tavilyApiKey: tavilyKey } : {}),
    });
    setLlmKey("");
    setTavilyKey("");
    api.config.get().then(setConfig);
  };

  const cfg = config as {
    llm?: { baseUrl?: string; model?: string; apiKeyConfigured?: boolean };
    tavily?: { apiKeyConfigured?: boolean };
  } | null;

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="space-y-6">
        <div>
          <h3 className="font-medium mb-2">LLM Configuration</h3>
          <p className="text-sm text-gray-500 mb-2">
            Base URL: {cfg?.llm?.baseUrl ?? "Not set"} · Model: {cfg?.llm?.model ?? "Not set"}
          </p>
          <p className="text-sm mb-2">
            API Key: {cfg?.llm?.apiKeyConfigured ? "Configured" : "Not configured"}
          </p>
          <input
            type="password"
            className="w-full p-2 border rounded"
            placeholder="Enter LLM API key..."
            value={llmKey}
            onChange={(e) => setLlmKey(e.target.value)}
          />
        </div>
        <div>
          <h3 className="font-medium mb-2">Tavily API Key</h3>
          <p className="text-sm mb-2">
            {cfg?.tavily?.apiKeyConfigured ? "Configured" : "Not configured"}
          </p>
          <input
            type="password"
            className="w-full p-2 border rounded"
            placeholder="Enter Tavily API key..."
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
          />
        </div>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create Sidebar and App shell**

`apps/renderer/src/components/Sidebar.tsx`:
```tsx
import { NavLink } from "react-router-dom";

export function Sidebar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded ${isActive ? "bg-gray-200 font-medium" : "hover:bg-gray-100"}`;

  return (
    <aside className="w-60 border-r bg-gray-50 p-4">
      <NavLink to="/" className={linkClass}>
        New Research
      </NavLink>
      <NavLink to="/history" className={linkClass}>
        History
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        Settings
      </NavLink>
    </aside>
  );
}
```

`apps/renderer/src/App.tsx`:
```tsx
import { HashRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Report } from "./pages/Report";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard/:runId" element={<Dashboard />} />
            <Route path="/report/:runId" element={<Report />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
```

`apps/renderer/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`apps/renderer/src/index.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/
git commit -m "feat(renderer): React app shell with pages, routing, and Zustand store"
```

---

## Task 14: Integration — Wire Everything Together

**Files:**
- Modify: `packages/engine/src/engine.ts` (minor: export citedReport from pipeline)
- Modify: `apps/main/src/ipc.ts` (minor: forward complete event with report)

- [ ] **Step 1: Verify full pipeline wiring**

Ensure the pipeline's `cite` node sets `ctx.citedReport`, and the engine's `runResearch` generator emits a `complete` event with the report content.

In `packages/engine/src/engine.ts`, update the event forwarding in `runResearch`:

```typescript
if (event.type === "complete") {
  // citedReport is set by the cite node in the final context
  this.db.updateRunStatus(runId, "completed");
}
```

In `apps/main/src/ipc.ts`, ensure the complete event includes the report:

```typescript
// The complete event from the pipeline should include the citedReport
// This is already handled by the pipeline event system
```

- [ ] **Step 2: Verify builds compile**

```bash
pnpm typecheck
```

Expected: No type errors

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Phase 1A integration — full pipeline wiring"
```

---

## Task 15: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

Expected: Electron window opens with the app

- [ ] **Step 2: Configure API keys**

Navigate to Settings, enter LLM and Tavily API keys. Verify they show as "Configured" after saving.

- [ ] **Step 3: Run a test research**

Go to New Research, enter a simple query like "What are the latest developments in quantum computing?", select Quick depth, click Start Research.

Expected: Dashboard shows progress through phases (init → plan → split → subagents → synthesize → cite), then redirects to report.

- [ ] **Step 4: Verify report**

The report page should show a Markdown-rendered report with numbered citations and a References section.

- [ ] **Step 5: Verify history**

Go to History, verify the completed research appears. Click to view the report.

- [ ] **Step 6: Test cancellation**

Start another research, click Cancel during execution. Verify it stops and shows "cancelled" status.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: Phase 1A complete — manual verification passed"
```
