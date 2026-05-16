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
    this.llm = new LLMClient({
      baseUrl: llmConfig.baseUrl,
      apiKey: secrets.llmApiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
    });
    this.search = secrets.tavilyApiKey ? new TavilySearchProvider(secrets.tavilyApiKey) : null;
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
          run: createSubagentsNode(this.llm, this.search, profile),
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
