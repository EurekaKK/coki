/**
 * LLM Client Wrapper for Coki Engine
 *
 * Uses the Anthropic SDK to provide a unified interface for all pipeline nodes.
 * Supports generate and stream with call tracking and tool calling.
 *
 * Works with Claude, MiMo (via Anthropic-compatible endpoint), and other
 * Anthropic-compatible providers — just change baseUrl, apiKey, and model.
 */

import Anthropic from "@anthropic-ai/sdk";
import { llmLogger, logger } from "../logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMClientConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  maxTokens: number;
  thinking: boolean;
  roleModels?: Record<string, string>;
}

export interface LLMCallRecord {
  role: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  runId?: string;
  phase?: string;
  traceId?: string;
}

export type OnCallCallback = (record: LLMCallRecord) => void;

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface GenerateOptions {
  role?: string;
  model?: string;
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
  maxTokens?: number;
  tools?: ToolDef[];
  abortSignal?: AbortSignal;
  /** For structured logging — pipeline run ID */
  runId?: string;
  /** For structured logging — pipeline phase */
  phase?: string;
  /** For structured logging before a pipeline run exists */
  traceId?: string;
  /** Override global thinking mode for short deterministic calls. */
  thinking?: boolean;
}

export interface StreamOptions {
  role?: string;
  model?: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: {
    type: string;
    textDelta?: string;
    thinkingDelta?: string;
    eventType?: string;
  }) => void;
  /** For structured logging — pipeline run ID */
  runId?: string;
  /** For structured logging — pipeline phase */
  phase?: string;
  /** For structured logging before a pipeline run exists */
  traceId?: string;
  /** Override global thinking mode for short deterministic calls. */
  thinking?: boolean;
}

function createCallLogger(opts: { runId?: string; phase?: string; traceId?: string }) {
  if (opts.runId && opts.phase) {
    const base = llmLogger(opts.runId, opts.phase);
    return opts.traceId ? base.child({ traceId: opts.traceId }) : base;
  }

  if (opts.traceId && opts.phase) {
    return logger.child({
      traceId: opts.traceId,
      phase: opts.phase,
      component: "llm",
    });
  }

  return null;
}

export interface GenerateResult {
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  thinking?: string;
  stopReason?: string;
}

function setProviderThinking(params: Anthropic.MessageCreateParams, enabled: boolean): void {
  (params as unknown as { thinking?: { type: "enabled" } | { type: "disabled" } }).thinking =
    enabled ? { type: "enabled" } : { type: "disabled" };
}

// ---------------------------------------------------------------------------
// LLMClient
// ---------------------------------------------------------------------------

export class LLMClient {
  private client: Anthropic;
  private defaultModel: string;
  private readonly defaultMaxTokens: number;
  private defaultThinking: boolean;
  private roleModels: Record<string, string>;
  private readonly callbacks: OnCallCallback[] = [];

  constructor(config: LLMClientConfig) {
    this.client = new Anthropic({
      baseURL: config.baseUrl,
      // Don't set apiKey to avoid x-api-key header; use api-key header instead for MiMo compatibility
      apiKey: undefined,
      defaultHeaders: {
        "api-key": config.apiKey ?? "",
        ...(config.apiKey ? { "Authorization": `Bearer ${config.apiKey}` } : {}),
      },
    });
    this.defaultModel = config.model;
    this.defaultMaxTokens = config.maxTokens;
    this.defaultThinking = config.thinking;
    this.roleModels = config.roleModels ?? {};
  }

  /** Recreate the client with a new API key (used when the user updates their key at runtime). */
  updateApiKey(apiKey: string, baseUrl?: string): void {
    this.client = new Anthropic({
      baseURL: baseUrl ?? this.client.baseURL,
      apiKey: undefined,
      defaultHeaders: {
        "api-key": apiKey || "",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
      },
    });
  }

  /** Update the default model at runtime. */
  updateModel(model: string): void {
    this.defaultModel = model;
    logger.info({ model }, "llm: default model updated");
  }

  /** Update thinking mode at runtime. */
  updateThinking(thinking: boolean): void {
    this.defaultThinking = thinking;
    logger.info({ thinking }, "llm: thinking mode updated");
  }

  /** Update role-specific model mappings at runtime. */
  updateRoleModels(roleModels: Record<string, string>): void {
    this.roleModels = roleModels;
    logger.info({ roleModels }, "llm: role models updated");
  }

  /** Register a callback that fires after every LLM call with usage stats. */
  onCall(callback: OnCallCallback): void {
    this.callbacks.push(callback);
  }

  /** Call Anthropic messages.create with call tracking. */
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const role = opts.role ?? "default";
    const model = opts.model ?? this.roleModels[role] ?? this.defaultModel;
    const thinkingEnabled = opts.thinking ?? this.defaultThinking;
    const startTime = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    const log = createCallLogger(opts);

    // Build messages array
    const messages: Anthropic.MessageParam[] = [];
    if (opts.messages) {
      for (const m of opts.messages) {
        messages.push({
          role: m.role as "user" | "assistant",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: m.content as any,
        });
      }
    }
    if (opts.prompt) {
      messages.push({ role: "user", content: opts.prompt });
    }

    log?.debug({
      role,
      model,
      system: opts.system,
      messageCount: messages.length,
      hasTools: !!opts.tools?.length,
    }, "llm.generate request");

    log?.info({ role, model, thinking: thinkingEnabled }, "llm.generate start");

    try {
      const params: Anthropic.MessageCreateParams = {
        model,
        max_tokens: opts.maxTokens ?? this.defaultMaxTokens,
        messages,
      };

      setProviderThinking(params, thinkingEnabled);

      if (opts.system) {
        params.system = opts.system;
      }

      if (opts.tools?.length) {
        params.tools = opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool["input_schema"],
        }));
      }

      const result = await this.client.messages.create(params, {
        signal: opts.abortSignal,
      });

      inputTokens = result.usage.input_tokens;
      outputTokens = result.usage.output_tokens;

      // Extract text, tool calls, and thinking from response
      let text = "";
      let thinkingText = "";
      const toolCalls: GenerateResult["toolCalls"] = [];
      const contentBlockTypes = result.content.map((block) => block.type);

      for (const block of result.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolCalls?.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        } else if (block.type === "thinking") {
          thinkingText += block.thinking;
        }
      }

      log?.debug({
        contentBlockTypes,
        fullText: text,
        toolCalls: toolCalls?.map((tc) => ({ name: tc.name, input: tc.input })),
        stopReason: result.stop_reason,
      }, "llm.generate response");

      log?.info({
        role,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startTime,
        textLength: text.length,
        contentBlockTypes,
        toolCallCount: toolCalls?.length ?? 0,
        stopReason: result.stop_reason,
      }, "llm.generate end");

      return { text, toolCalls, thinking: thinkingText || undefined, stopReason: result.stop_reason ?? undefined };
    } finally {
      const latencyMs = Date.now() - startTime;
      this.emitCall({
        role,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        runId: opts.runId,
        phase: opts.phase,
        traceId: opts.traceId,
      });
    }
  }

  /** Call Anthropic streaming with call tracking. Returns the full text. */
  async stream(opts: StreamOptions): Promise<string> {
    const role = opts.role ?? "default";
    const model = opts.model ?? this.roleModels[role] ?? this.defaultModel;
    const thinkingEnabled = opts.thinking ?? this.defaultThinking;
    const startTime = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    const log = createCallLogger(opts);

    log?.debug({
      role,
      model,
      system: opts.system,
      prompt: opts.prompt,
    }, "llm.stream request");

    log?.info({ role, model, thinking: thinkingEnabled }, "llm.stream start");

    try {
      const streamParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: opts.maxTokens ?? this.defaultMaxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.prompt }],
      };

      setProviderThinking(streamParams, thinkingEnabled);

      const stream = this.client.messages.stream(
        streamParams,
        { signal: opts.abortSignal },
      );

      let text = "";

      stream.on("connect", () => {
        opts.onChunk?.({ type: "connect" });
      });

      stream.on("streamEvent", (event) => {
        opts.onChunk?.({ type: "stream-event", eventType: event.type });
      });

      stream.on("thinking", (thinkingDelta) => {
        opts.onChunk?.({ type: "thinking-delta", thinkingDelta });
      });

      // Drive the onChunk callback by iterating over text events
      stream.on("text", (textDelta) => {
        if (opts.onChunk) {
          opts.onChunk({ type: "text-delta", textDelta });
        }
        text += textDelta;
      });

      // Wait for stream to complete
      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

      const latencyMs = Date.now() - startTime;

      log?.debug({ fullText: text }, "llm.stream response");

      log?.info({
        role,
        inputTokens,
        outputTokens,
        latencyMs,
        textLength: text.length,
      }, "llm.stream end");

      return text;
    } finally {
      const latencyMs = Date.now() - startTime;
      this.emitCall({
        role,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        runId: opts.runId,
        phase: opts.phase,
        traceId: opts.traceId,
      });
    }
  }

  /** Emit a call record to all registered callbacks. */
  private emitCall(record: LLMCallRecord): void {
    for (const cb of this.callbacks) {
      cb(record);
    }
  }
}
