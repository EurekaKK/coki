/**
 * LLM Client Wrapper for Coki Engine
 *
 * Wraps Vercel AI SDK 6 to provide a unified interface for all pipeline nodes.
 * Supports generateText and streamText with call tracking.
 */

import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, ToolSet, StopCondition } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface GenerateOptions {
  role?: string;
  model?: string;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
  tools?: ToolSet;
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  abortSignal?: AbortSignal;
}

export interface StreamOptions {
  role?: string;
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: { type: string; textDelta?: string }) => void;
}

export interface GenerateResult {
  text: string;
  output?: unknown;
}

// ---------------------------------------------------------------------------
// LLMClient
// ---------------------------------------------------------------------------

export class LLMClient {
  private readonly provider: OpenAIProvider;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;
  private readonly callbacks: OnCallCallback[] = [];

  constructor(config: LLMClientConfig) {
    this.provider = createOpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey ?? undefined,
    });
    this.defaultModel = config.model;
    this.defaultTemperature = config.temperature;
    this.defaultMaxTokens = config.maxTokens;
  }

  /** Register a callback that fires after every LLM call with usage stats. */
  onCall(callback: OnCallCallback): void {
    this.callbacks.push(callback);
  }

  /** Returns a LanguageModel instance, optionally with a model override. */
  getModel(modelOverride?: string): LanguageModel {
    return this.provider(modelOverride ?? this.defaultModel);
  }

  /** Call generateText from AI SDK 6 with call tracking. */
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const model = this.getModel(opts.model);
    const role = opts.role ?? "default";
    const startTime = Date.now();

    const result = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: opts.messages as any,
      temperature: opts.temperature ?? this.defaultTemperature,
      maxTokens: opts.maxTokens ?? this.defaultMaxTokens,
      output: opts.output,
      tools: opts.tools,
      stopWhen: opts.stopWhen,
      abortSignal: opts.abortSignal,
    } as any);

    const latencyMs = Date.now() - startTime;
    this.emitCall({
      role,
      model: typeof opts.model === "string" ? opts.model : this.defaultModel,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs,
    });

    return {
      text: result.text,
      output: opts.output ? result.output : undefined,
    };
  }

  /** Call streamText from AI SDK 6 with call tracking. Returns the full text. */
  async stream(opts: StreamOptions): Promise<string> {
    const model = this.getModel(opts.model);
    const role = opts.role ?? "default";
    const startTime = Date.now();

    const result = streamText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature ?? this.defaultTemperature,
      maxTokens: opts.maxTokens ?? this.defaultMaxTokens,
      abortSignal: opts.abortSignal,
      onChunk: opts.onChunk
        ? ({ chunk }: { chunk: { type: string; textDelta?: string } }) => {
            if (chunk.type === "text-delta") {
              opts.onChunk!({
                type: chunk.type,
                textDelta: chunk.textDelta,
              });
            }
          }
        : undefined,
    } as any);

    // Consume the stream to get the full text
    const text = await result.text;
    const usage = await result.usage;
    const latencyMs = Date.now() - startTime;

    this.emitCall({
      role,
      model: typeof opts.model === "string" ? opts.model : this.defaultModel,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      latencyMs,
    });

    return text;
  }

  /** Emit a call record to all registered callbacks. */
  private emitCall(record: LLMCallRecord): void {
    for (const cb of this.callbacks) {
      cb(record);
    }
  }
}
