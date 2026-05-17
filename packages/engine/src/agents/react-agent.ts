import type { LLMClient, ToolDef, GenerateResult } from "../llm/client";
import type { TavilySearchProvider } from "../search/tavily";
import type { SubagentReport, SourceRecord } from "../pipeline/context";
import { SUBAGENT_SYSTEM_PROMPT, SUBAGENT_REPORT_PROMPT } from "./prompts";
import { randomUUID } from "node:crypto";
import { toolLogger } from "../logger";

export interface AgentConfig {
  maxSteps: number;
  maxSearchCalls: number;
  maxFetchCalls: number;
  maxToolErrors: number;
  timeoutMs: number;
}

export async function runSubagent(
  subtaskId: string,
  instruction: string,
  llm: LLMClient,
  search: TavilySearchProvider,
  config: AgentConfig,
  language: "zh" | "en" = "zh",
  signal?: AbortSignal,
  runId?: string,
): Promise<SubagentReport> {
  const log = runId ? toolLogger(runId, "subagents") : null;
  const sources: SourceRecord[] = [];
  const evidence: string[] = [];
  let searchCount = 0;
  let fetchCount = 0;
  const seenUrls = new Set<string>();

  // Tool definitions in Anthropic format
  const toolDefs: ToolDef[] = [
    {
      name: "tavily_search",
      description: "Search the web for information using Tavily. Use specific, focused queries.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "tavily_extract",
      description: "Extract full content from specific URLs found in search results.",
      input_schema: {
        type: "object" as const,
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "URLs to extract content from",
          },
        },
        required: ["urls"],
      },
    },
  ];

  // Tool execution handlers
  async function executeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    if (name === "tavily_search") {
      const query = input.query as string;
      if (searchCount >= config.maxSearchCalls) {
        log?.warn({ query, searchCount }, "tavily_search: budget exceeded");
        return { error: "Search budget exceeded" };
      }
      searchCount++;
      log?.info({ query, searchCount }, "tavily_search: executing");
      try {
        const results = await search.search(query, { maxResults: 5 });
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
        log?.debug({ query, results }, "tavily_search: raw results");
        log?.info({
          query,
          resultCount: results.length,
          newCount: newResults.length,
        }, "tavily_search: done");
        return newResults.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        }));
      } catch (error) {
        log?.error({ query, error }, "tavily_search: failed");
        return { error: String(error) };
      }
    }

    if (name === "tavily_extract") {
      const urls = input.urls as string[];
      if (fetchCount >= config.maxFetchCalls) {
        log?.warn({ urls, fetchCount }, "tavily_extract: budget exceeded");
        return { error: "Fetch budget exceeded" };
      }
      fetchCount++;
      log?.info({ urls, fetchCount }, "tavily_extract: executing");
      try {
        const results = await search.extract(urls);
        for (const r of results) {
          if (r.success) {
            evidence.push(`[Source: ${r.url}]\n${r.content.slice(0, 2000)}`);
          }
        }
        log?.debug({ results }, "tavily_extract: raw results");
        log?.info({
          urlCount: urls.length,
          successCount: results.filter((r) => r.success).length,
        }, "tavily_extract: done");
        return results;
      } catch (error) {
        log?.error({ urls, error }, "tavily_extract: failed");
        return { error: String(error) };
      }
    }

    return { error: `Unknown tool: ${name}` };
  }

  // ReAct loop with tool calling
  const languageName = language === "zh" ? "Chinese" : "English";
  log?.info({ subtaskId }, "subagent: start");
  log?.debug({ subtaskId, instruction }, "subagent: full instruction");

  const messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }> = [
    {
      role: "user",
      content: `Research subtask: ${instruction}\n\nYou MUST write your final report in ${languageName}.`,
    },
  ];

  let finalReport = "";
  const startTime = Date.now();

  for (let step = 0; step < config.maxSteps; step++) {
    if (signal?.aborted) break;
    if (Date.now() - startTime > config.timeoutMs) break;

    // Force writing phase in last 3 steps
    const isWritingPhase = step >= config.maxSteps - 3;
    const systemPrompt = isWritingPhase
      ? SUBAGENT_SYSTEM_PROMPT + "\n\nIMPORTANT: You are now in the writing phase. Do NOT search anymore. Write your final report now."
      : SUBAGENT_SYSTEM_PROMPT;

    const result: GenerateResult = await llm.generate({
      system: systemPrompt,
      messages,
      tools: isWritingPhase ? undefined : toolDefs,
      maxTokens: 4096,
      runId,
      phase: "subagents",
    });

    // If model returned tool calls, execute them and continue
    if (result.toolCalls?.length && !isWritingPhase) {
      log?.debug({
        step,
        toolCalls: result.toolCalls.map((tc) => ({ name: tc.name, input: tc.input })),
      }, "subagent: tool calls");

      // Add assistant message with thinking, text, and tool calls
      const assistantContent: Array<Record<string, unknown>> = [];
      if (result.thinking) {
        assistantContent.push({ type: "thinking", thinking: result.thinking });
      }
      if (result.text) {
        assistantContent.push({ type: "text", text: result.text });
      }
      for (const tc of result.toolCalls) {
        assistantContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      messages.push({ role: "assistant", content: assistantContent });

      // Execute tools and add results
      const toolResults: Array<Record<string, unknown>> = [];
      for (const tc of result.toolCalls) {
        const toolResult = await executeTool(tc.name, tc.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
      messages.push({ role: "user", content: toolResults });

      continue;
    }

    // No tool calls — model produced final text
    finalReport = result.text;
    break;
  }

  // If no final report, generate one from evidence
  if (!finalReport || finalReport.length < 200) {
    log?.warn({
      reportLength: finalReport?.length ?? 0,
      evidenceCount: evidence.length,
    }, "subagent: report too short, generating fallback");

    const reportPrompt = SUBAGENT_REPORT_PROMPT
      .replace("{instruction}", instruction)
      .replace("{language}", languageName)
      .replace("{evidence}", evidence.join("\n\n---\n\n"));

    const generated = await llm.generate({
      system: "Write a research report. Cite sources with [src: <url>].",
      prompt: reportPrompt,
      maxTokens: 4096,
      runId,
      phase: "subagents",
    });
    finalReport = generated.text;
  }

  log?.info({
    subtaskId,
    reportLength: finalReport.length,
    sourceCount: sources.length,
    searchCount,
    fetchCount,
  }, "subagent: done");

  return {
    subtaskId,
    report: finalReport,
    sources,
  };
}
