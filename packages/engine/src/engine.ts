import { CokiDatabase, type RunRow } from "./db/database";
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
import { createExtractClaimsNode } from "./pipeline/nodes/extract-claims";
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
  private search: TavilySearchProvider | null;
  private activeRuns = new Map<string, AbortController>();

  constructor(db: CokiDatabase, configOverrides: ConfigOverrides, secrets: RuntimeSecrets) {
    this.db = db;
    this.config = new ConfigManager(configOverrides);
    const llmConfig = this.config.getConfig().llm;
    const roleModels: Record<string, string> = {};
    for (const role of ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis", "citation"]) {
      const m = this.config.getRole(role).model;
      if (m) roleModels[role] = m;
    }
    this.llm = new LLMClient({
      baseUrl: llmConfig.baseUrl,
      apiKey: secrets.llmApiKey,
      model: llmConfig.model,
      maxTokens: llmConfig.maxTokens,
      thinking: llmConfig.thinking,
      roleModels,
    });
    this.search = secrets.tavilyApiKey ? new TavilySearchProvider(secrets.tavilyApiKey) : null;

    // Persist LLM call records to database
    this.llm.onCall((record) => {
      if (!record.runId) return;
      this.db.insertLLMCall({
        run_id: record.runId,
        role: record.role,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        latency_ms: record.latencyMs,
      });
    });
  }

  async *runResearch(
    query: string,
    depth: 1 | 2 | 3,
    options?: { outputLanguage?: "zh" | "en"; signal?: AbortSignal; runId?: string }
  ): AsyncGenerator<PipelineEvent> {
    const runId = this.db.createRun(query, depth, options?.runId);
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
          run: createSubagentsNode(this.llm, this.search, profile),
        },
        {
          id: "reflection",
          run: createReflectionNode(this.llm, profile),
        },
        {
          id: "synthesize",
          run: createSynthesizeNode(this.llm, profile),
        },
        {
          id: "extract-claims",
          run: createExtractClaimsNode(this.llm),
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
        { from: "synthesize", decide: () => "extract-claims" },
        { from: "extract-claims", decide: () => "cite" },
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
      evidenceSpans: [],
      claims: [],
    };

    try {
      for await (const event of pipeline.run(initialContext, signal)) {
        yield event;

        if (event.type === "complete") {
          const completeData = event.data as { report?: string; citedReport?: string } | undefined;
          this.db.updateRunStatus(runId, "completed", undefined, completeData?.citedReport);
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

  /** Update API keys at runtime (called when the user saves new keys via Settings). */
  updateSecrets(secrets: Partial<RuntimeSecrets>): void {
    if (secrets.llmApiKey !== undefined) {
      this.llm.updateApiKey(secrets.llmApiKey);
    }
    if (secrets.tavilyApiKey !== undefined) {
      this.search = secrets.tavilyApiKey
        ? new TavilySearchProvider(secrets.tavilyApiKey)
        : null;
    }
  }

  /** Update thinking mode at runtime. */
  updateThinking(thinking: boolean): void {
    this.llm.updateThinking(thinking);
  }

  /** Update role-specific model mappings at runtime. */
  updateRoleModels(roleModels: Record<string, string>): void {
    this.llm.updateRoleModels(roleModels);
  }

  cancelRun(runId: string): void {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.db.updateRunStatus(runId, "cancelled");
    }
  }

  getHistory(): RunRow[] {
    return this.db.listRuns();
  }

  getRun(id: string): RunRow | null {
    return this.db.getRun(id);
  }

  deleteRun(id: string): void {
    this.db.deleteRun(id);
  }

}
