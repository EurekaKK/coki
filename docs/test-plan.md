# Coki 测试计划

## 现状

- 9 个测试文件，约 40 个用例
- 基础设施层（DB、Config、Pipeline 调度、Citation）覆盖较好
- 核心业务层（6 个 pipeline node、LLM client、React Agent）零覆盖
- Renderer 和 Shared 包零覆盖

## 测试策略

**真实 LLM 调用，不用 mock。** 测试使用用户配置的 API key 和 endpoint，验证真实的端到端行为。

- 测试较慢、消耗 token，但覆盖真实链路
- 断言侧重**结构和行为**（输出有 plan 字段、subtask 数量 > 0），不验证具体文本内容
- 需要一个测试辅助函数从 SQLite 读取 API key 初始化 LLMClient

## 优先级分层

### P0 — 核心 pipeline 节点

| # | 测试目标 | 文件 | 验证点 |
|---|---------|------|--------|
| 1 | **LLM Client 真实调用** | `llm/client.test.ts` | `generate()` 能返回非空文本；`stream()` 能流式返回；回调触发且有 token 计数；无效 key 抛错 |
| 2 | **Plan node** | `pipeline/nodes/plan.test.ts` | 输出 ctx.plan 非空；包含 dimensions 数组；depth 2-3 时有 Tavily 搜索结果 |
| 3 | **Split node** | `pipeline/nodes/split.test.ts` | depth 1 直接映射不调 LLM，subtask 数 == dimensions 数；depth 2-3 LLM 拆分后 subtask 数 > 0 |
| 4 | **Subagents node** | `pipeline/nodes/subagents.test.ts` | 每个 subtask 产出 report；sources 被收集；并发不超过 maxSubagents |
| 5 | **Reflection node** | `pipeline/nodes/reflection.test.ts` | 返回 qualityScore 0-1；决定 proceed/refine/sufficient；refine 时生成 gap subtasks |
| 6 | **Synthesize node** | `pipeline/nodes/synthesize.test.ts` | ctx.report 非空且长度 > 100 字；continuation 多轮时报告更长 |
| 7 | **Cite node** | `pipeline/nodes/cite.test.ts` | `[src:N]` 被替换为脚注；sources 写入 DB；citedReport 非空 |

### P1 — 集成与端到端

| # | 测试目标 | 文件 | 验证点 |
|---|---------|------|--------|
| 8 | **Engine 端到端** | `engine.test.ts` | 跑完整 pipeline（depth 1，短 query），status 最终为 completed，citedReport 非空 |
| 9 | **React Agent** | `agents/react-agent.test.ts` | 用真实 LLM 跑一次 subagent，返回 report 文本，source 数 > 0 |
| 10 | **Pipeline progress** | `pipeline/pipeline.test.ts` | 新增测试：progress 事件包含 0-99 的数值，逐节点递增 |

### P2 — Shared 包 & Renderer

| # | 测试目标 | 文件 | 验证点 |
|---|---------|------|--------|
| 11 | **Zod schemas** | `shared/src/types.test.ts` | 合法输入通过校验；缺字段报错；边界值处理 |
| 12 | **Constants** | `shared/src/constants.test.ts` | PHASE_WEIGHTS 总和为 98；PHASES 有 7 个；DEPTH_PRESETS 为 [1,2,3] |
| 13 | **Settings 页面** | `renderer/src/pages/Settings.test.tsx` | 已配置时显示 dots；未配置时显示 placeholder |
| 14 | **Dashboard 页面** | `renderer/src/pages/Dashboard.test.tsx` | progress 事件更新进度条；complete 事件触发跳转 |
| 15 | **Report 页面** | `renderer/src/pages/Report.test.tsx` | 兼容 snake_case 和 camelCase；空报告显示提示 |

### P3 — 补充覆盖

| # | 测试目标 | 文件 | 验证点 |
|---|---------|------|--------|
| 16 | **Tavily extract** | `search/extract.test.ts` | HTML → 纯文本提取；空 HTML 返回空字符串 |
| 17 | **DB migrations** | `db/migrations.test.ts` | 空库执行 migration 后表结构完整 |
| 18 | **SecretStore** | `main/src/secret-store.test.ts` | 加密存入后能解密读回（Electron 环境下测试） |

## 实施顺序

```
Phase 1: 测试辅助 + LLM 真实调用
  └─ 写 test-utils/helper.ts（从 DB 读 key，创建 LLMClient）
  └─ #1 LLM Client 真实调用测试

Phase 2: Pipeline 节点
  └─ #2-#7（可并行编写）

Phase 3: 集成测试
  └─ #8-#10

Phase 4: Shared & Renderer
  └─ #11-#15

Phase 5: 补充
  └─ #16-#18
```

## 测试辅助

```typescript
// packages/engine/src/test-utils/helper.ts
import { CokiDatabase } from "../db/database";
import { LLMClient } from "../llm/client";
import { TavilySearchProvider } from "../search/tavily";
import { ConfigManager } from "../config/config";

/** 从 SQLite 读取已保存的 API key，创建真实的 LLMClient */
export function createTestLLMClient(dbPath?: string) {
  const db = new CokiDatabase(dbPath ?? defaultTestDbPath());
  const row = db.db.prepare("SELECT encrypted_value, plain_value FROM config WHERE key = ?")
    .get("llm_api_key") as any;
  // 解密逻辑同 SecretStore...
  const config = new ConfigManager({});
  const cfg = config.getConfig().llm;
  return new LLMClient({ baseUrl: cfg.baseUrl, apiKey: decryptedKey, model: cfg.model, ... });
}
```

## 注意事项

- 真实调用消耗 token，depth 1 测试用短 query 控制成本
- 测试可能因网络或 API 限流偶发失败，可设置 `retry: 1`
- CI 环境需要配置 API key 环境变量，或跳过这些测试（`test.skip`）
