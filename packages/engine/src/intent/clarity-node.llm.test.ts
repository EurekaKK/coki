import { describe, expect, it } from "vitest";
import { clarifyResearchIntent } from "./clarifier";
import { createTestLLMClient } from "../test-utils/helper";

type GenerateOptions = Parameters<ReturnType<typeof createTestLLMClient>["generate"]>[0];
type GenerateResult = Awaited<ReturnType<ReturnType<typeof createTestLLMClient>["generate"]>>;

class CountingLLM {
  calls: GenerateOptions[] = [];

  constructor(private readonly delegate = createTestLLMClient()) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    this.calls.push(opts);
    return this.delegate.generate(opts);
  }
}

class StreamingGenerateLLM {
  calls: GenerateOptions[] = [];
  events: Array<{ atMs: number; type: string; eventType?: string }> = [];
  textChunks: Array<{ atMs: number; text: string }> = [];
  thinkingChunks: Array<{ atMs: number; text: string }> = [];

  constructor(private readonly delegate = createTestLLMClient()) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    this.calls.push(opts);
    if (!opts.prompt) {
      throw new Error("StreamingGenerateLLM requires a prompt");
    }

    const startedAt = Date.now();
    const text = await this.delegate.stream({
      role: opts.role,
      model: opts.model,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      abortSignal: opts.abortSignal,
      runId: opts.runId,
      phase: opts.phase,
      traceId: opts.traceId,
      thinking: opts.thinking,
      onChunk: (chunk) => {
        this.events.push({
          atMs: Date.now() - startedAt,
          type: chunk.type,
          eventType: chunk.eventType,
        });
        if (chunk.type === "text-delta" && chunk.textDelta) {
          this.textChunks.push({
            atMs: Date.now() - startedAt,
            text: chunk.textDelta,
          });
        }
        if (chunk.type === "thinking-delta" && chunk.thinkingDelta) {
          this.thinkingChunks.push({
            atMs: Date.now() - startedAt,
            text: chunk.thinkingDelta,
          });
        }
      },
    });

    return { text };
  }
}

const runLlmExperiment = process.env.RUN_INTENT_CLARITY_LLM === "1";
const runSseExperiment = process.env.RUN_INTENT_CLARITY_SSE === "1";

describe.runIf(runLlmExperiment)("intent clarity node with real LLM", () => {
  it(
    "uses the LLM to judge a short but specific interview-prep query",
    { retry: 0, timeout: 40_000 },
    async () => {
      const llm = new CountingLLM();

      const result = await clarifyResearchIntent(llm as any, {
        originalQuery: "阿里云ai应用开发面经",
        history: [],
        maxRounds: 3,
        outputLanguage: "zh",
      });

      console.table([
        {
          query: result.brief.originalQuery,
          status: result.status,
          fallbackReason: result.fallbackReason ?? "",
          question: result.question?.text ?? "",
          refinedQuestion: result.brief.refinedQuestion,
          assumptions: result.brief.assumptions.join("；"),
        },
      ]);

      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0].role).toBe("intent-clarifier");
      expect(llm.calls[0].thinking).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.brief.refinedQuestion).toMatch(/阿里云|AI|ai|面经|面试/);
      expect(result.question?.text ?? "").not.toContain("主题比较宽");
      if (result.question) {
        expect(result.question.text).toMatch(/阿里云|AI|ai|应用开发|面经|面试|目标/);
      }
      expect(result.brief.assumptions.join(" ")).not.toContain("主题比较宽");
    },
  );

  it(
    "surfaces a high-value research-design clarification for a technical query",
    { retry: 0, timeout: 40_000 },
    async () => {
      const llm = new CountingLLM();

      const result = await clarifyResearchIntent(llm as any, {
        originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
        history: [],
        maxRounds: 3,
        outputLanguage: "zh",
      });

      console.table([
        {
          status: result.status,
          fallbackReason: result.fallbackReason ?? "",
          question: result.question?.text ?? "",
          opportunityImpact: result.clarificationOpportunity?.impact ?? "",
          opportunityReason: result.clarificationOpportunity?.reason ?? "",
          missingResearchDecisions:
            result.clarificationOpportunity?.missingResearchDecisions.join(",") ?? "",
          defaultAssumption: result.clarificationOpportunity?.defaultAssumption ?? "",
          refinedQuestion: result.brief.refinedQuestion,
        },
      ]);

      expect(llm.calls).toHaveLength(1);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.status).toBe("needs_clarification");
      expect(result.question?.text).toMatch(/输出|指标|实验|文献|轮廓|少样本|检测|性能/);
      expect(result.question?.text).not.toContain("主题比较宽");
    },
  );
});

describe.runIf(runSseExperiment)("intent clarity node with SSE", () => {
  it(
    "captures visible text deltas before the clarifier timeout",
    { retry: 0, timeout: 40_000 },
    async () => {
      const llm = new StreamingGenerateLLM();

      const result = await clarifyResearchIntent(llm as any, {
        originalQuery: "阿里云ai应用开发面经",
        history: [],
        maxRounds: 3,
        outputLanguage: "zh",
      });

      const streamedText = llm.textChunks.map((chunk) => chunk.text).join("");
      const thinkingText = llm.thinkingChunks.map((chunk) => chunk.text).join("");
      const eventTypes = [...new Set(llm.events.map((event) => event.eventType ?? event.type))];
      console.table([
        {
          status: result.status,
          fallbackReason: result.fallbackReason ?? "",
          eventCount: llm.events.length,
          eventTypes: eventTypes.join(","),
          textChunkCount: llm.textChunks.length,
          firstTextChunkAtMs: llm.textChunks[0]?.atMs ?? "",
          streamedPreview: streamedText.slice(0, 300),
          thinkingChunkCount: llm.thinkingChunks.length,
          thinkingPreview: thinkingText.slice(0, 120),
          finalRefinedQuestion: result.brief.refinedQuestion,
        },
      ]);

      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0].role).toBe("intent-clarifier");
      expect(llm.textChunks.length).toBeGreaterThan(0);
    },
  );
});
