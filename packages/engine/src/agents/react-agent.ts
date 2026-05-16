import type { LLMClient } from "../llm/client";
import type { TavilySearchProvider } from "../search/tavily";
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
      const toolName = parsed.action.name as keyof typeof tools;
      const tool = tools[toolName];
      if (tool) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (tool as any)(parsed.action.args);
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
