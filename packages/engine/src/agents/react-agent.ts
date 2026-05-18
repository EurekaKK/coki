import type { LLMClient, ToolDef, GenerateResult } from "../llm/client";
import type { TavilySearchProvider } from "../search/tavily";
import type {
  SubagentReport,
  SourceRecord,
  EvidenceSpan,
  Subtask,
  ResearchRequirements,
} from "../pipeline/context";
import {
  buildSubagentSystemPrompt,
  SUBAGENT_USER_TEMPLATE,
  SUBAGENT_REPORT_FALLBACK_PROMPT,
  SOURCE_EVALUATE_PROMPT,
} from "./prompts";
import { parseJsonFromText } from "../utils/parse-json";
import { formatRequirements as formatRequirementsBlock } from "../utils/format-requirements";
import { randomUUID } from "node:crypto";
import { toolLogger } from "../logger";

function splitIntoSpans(content: string, maxChars: number): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const paragraphs = content.split(/\n{2,}/);
  let offset = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      offset += para.length + 2;
      continue;
    }
    if (trimmed.length <= maxChars) {
      spans.push({ text: trimmed, start: offset, end: offset + trimmed.length });
    } else {
      for (let i = 0; i < trimmed.length; i += maxChars) {
        const chunk = trimmed.slice(i, i + maxChars);
        spans.push({ text: chunk, start: offset + i, end: offset + i + chunk.length });
      }
    }
    offset += para.length + 2;
  }
  return spans;
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const QUERY_STRIP_TOKENS = new Set([
  "research", "paper", "study", "pdf", "github", "source", "code",
  "repository", "official", "documentation", "site:.gov", ".gov",
  "latest", "2024", "2025", "2026", "report",
]);

function broadenQuery(original: string): string | null {
  const tokens = original.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const stripped = tokens.filter((t) => !QUERY_STRIP_TOKENS.has(t.toLowerCase()));
  if (stripped.length && stripped.length < tokens.length) {
    return stripped.join(" ");
  }

  // Drop the last token as fallback
  return tokens.slice(0, -1).join(" ");
}

function wordTargets(depth: 1 | 2 | 3): { min: number; max: number } {
  if (depth === 1) return { min: 400, max: 800 };
  if (depth === 3) return { min: 1500, max: 3000 };
  return { min: 800, max: 1500 };
}

function formatRequirements(req?: ResearchRequirements): string {
  if (!req) return "";
  const block = formatRequirementsBlock(req);
  if (block === "(none extracted)") return "";
  return `\nUser requirements (must be respected):\n${block}\n`;
}

export interface AgentConfig {
  maxSteps: number;
  maxSearchCalls: number;
  maxFetchCalls: number;
  maxToolErrors: number;
  timeoutMs: number;
  /** When true, allow a one-shot broader-query fallback on empty search results. */
  allowQueryFallback?: boolean;
  /** Max results per domain across the subagent run. */
  maxResultsPerDomain?: number;
  /** When true, expose the evaluate_sources tool to the subagent. */
  useSourceEvaluation?: boolean;
}

export async function runSubagent(
  subtask: Subtask,
  llm: LLMClient,
  search: TavilySearchProvider,
  config: AgentConfig,
  language: "zh" | "en",
  depth: 1 | 2 | 3,
  requirements: ResearchRequirements | undefined,
  signal?: AbortSignal,
  runId?: string,
): Promise<SubagentReport> {
  const log = runId ? toolLogger(runId, "subagents") : null;
  const sources: SourceRecord[] = [];
  const evidence: string[] = [];
  const evidenceSpans: EvidenceSpan[] = [];
  let searchCount = 0;
  let fetchCount = 0;
  const seenUrls = new Set<string>();
  const domainCounts = new Map<string, number>();
  const maxPerDomain = config.maxResultsPerDomain ?? 3;
  const allowFallback = config.allowQueryFallback ?? true;
  const triedFallback = new Set<string>();

  const useEvaluate = config.useSourceEvaluation === true;

  const toolDefs: ToolDef[] = [
    {
      name: "tavily_search",
      description: "Search the web for information. Use specific, focused queries.",
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
      description: "Extract full content from specific URLs found in previous search results.",
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

  if (useEvaluate) {
    toolDefs.push({
      name: "evaluate_sources",
      description: "Rate candidate search results (relevance, authority, density) and pick which deserve full-text extraction. Call this AFTER tavily_search and BEFORE tavily_extract.",
      input_schema: {
        type: "object" as const,
        properties: {
          sources: {
            type: "array",
            description: "Candidate sources from previous searches",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                snippet: { type: "string" },
              },
              required: ["url"],
            },
          },
        },
        required: ["sources"],
      },
    });
  }

  async function runSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const results = await search.search(query, { maxResults: 5 });
    const filtered: Array<{ title: string; url: string; snippet: string }> = [];
    for (const r of results) {
      if (seenUrls.has(r.url)) continue;
      const domain = domainOf(r.url);
      if (domain) {
        const count = domainCounts.get(domain) ?? 0;
        if (count >= maxPerDomain) {
          log?.debug({ url: r.url, domain }, "tavily_search: domain cap reached, skipping");
          continue;
        }
        domainCounts.set(domain, count + 1);
      }
      seenUrls.add(r.url);
      sources.push({
        id: randomUUID(),
        sourceType: "web",
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        fetchStatus: "ok",
      });
      filtered.push({ title: r.title, url: r.url, snippet: r.snippet });
    }
    return filtered;
  }

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
        let results = await runSearch(query);

        if (results.length === 0 && allowFallback && !triedFallback.has(query)) {
          const broader = broadenQuery(query);
          if (broader && broader !== query && !triedFallback.has(broader)) {
            triedFallback.add(query);
            triedFallback.add(broader);
            log?.info({ original: query, broader }, "tavily_search: empty, retrying with broader query");
            results = await runSearch(broader);
          }
        }

        log?.info({
          query,
          resultCount: results.length,
        }, "tavily_search: done");
        return results;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log?.error({ query, errMsg }, "tavily_search: failed");
        return { error: errMsg };
      }
    }

    if (name === "evaluate_sources") {
      const candidates = (input.sources as Array<{ url: string; title?: string; snippet?: string }>) ?? [];
      if (candidates.length === 0) {
        return { error: "No sources provided" };
      }
      // Cap at 6 to keep the JSON output small enough for mimo to complete.
      // evaluate_sources truncates mid-JSON when given too many sources.
      const capped = candidates.slice(0, 6);
      log?.info({ total: candidates.length, capped: capped.length }, "evaluate_sources: scoring");

      const sourcesBlock = capped
        .map((s, i) => `${i + 1}. ${s.title ?? "(untitled)"}\n   URL: ${s.url}\n   Snippet: ${(s.snippet ?? "").slice(0, 300)}`)
        .join("\n\n");

      const prompt = SOURCE_EVALUATE_PROMPT
        .replace("{subtask_instruction}", subtask.instruction)
        .replace("{sources}", sourcesBlock);

      let rawText = "";
      try {
        const result = await llm.generate({
          role: "evaluator",
          system: "You evaluate research sources rigorously. Output strict JSON only.",
          prompt,
          maxTokens: 4096,
          runId,
          phase: "subagents",
        });
        rawText = result.text;

        const parsed = parseJsonFromText(rawText) as {
          evaluations?: Array<{ url: string; normalized_score?: number; full_text?: boolean; reason?: string }>;
        };
        const evaluations = (parsed.evaluations ?? []).slice(0, 12);
        log?.info({ evaluations }, "evaluate_sources: done");
        return { evaluations };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log?.error({
          errMsg,
          rawTextLength: rawText.length,
          rawTextHead: rawText.slice(0, 400),
          rawTextTail: rawText.length > 400 ? rawText.slice(-200) : undefined,
          sourceCount: candidates.length,
        }, "evaluate_sources: failed — falling back to neutral scoring");

        // Graceful degradation: return neutral scores so the subagent can still
        // proceed to tavily_extract. Top half are flagged for full-text fetch.
        const half = Math.max(1, Math.min(3, Math.ceil(capped.length / 2)));
        return {
          evaluations: capped.map((s, idx) => ({
            url: s.url,
            normalized_score: 0.5,
            full_text: idx < half,
            reason: "evaluator parse failed; fallback neutral score",
          })),
        };
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
            const chunks = splitIntoSpans(r.content, 500);
            for (const chunk of chunks) {
              evidenceSpans.push({
                id: randomUUID(),
                subtaskId: subtask.id,
                quote: chunk.text,
                url: r.url,
                startOffset: chunk.start,
                endOffset: chunk.end,
              });
            }
          }
        }
        log?.info({
          urlCount: urls.length,
          successCount: results.filter((r) => r.success).length,
        }, "tavily_extract: done");
        return results;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log?.error({ urls, errMsg }, "tavily_extract: failed");
        return { error: errMsg };
      }
    }

    return { error: `Unknown tool: ${name}` };
  }

  const languageName = language === "zh" ? "Chinese" : "English";
  const { min, max } = wordTargets(depth);

  const boundariesBlock = subtask.boundaries
    ? `Boundaries (do NOT cover): ${subtask.boundaries}\n`
    : "";
  const sourceTypesBlock = subtask.sourceTypes
    ? `Preferred source types: ${subtask.sourceTypes}\n`
    : "";
  const requirementsBlock = formatRequirements(requirements);

  const userMessage = SUBAGENT_USER_TEMPLATE
    .replace("{instruction}", subtask.instruction)
    .replace("{boundaries_block}", boundariesBlock)
    .replace("{source_types_block}", sourceTypesBlock)
    .replace("{requirements_block}", requirementsBlock)
    .replace("{language}", languageName)
    .replace("{min_words}", String(min))
    .replace("{max_words}", String(max));

  log?.info({ subtaskId: subtask.id }, "subagent: start");
  log?.debug({ subtaskId: subtask.id, userMessage }, "subagent: initial user message");

  const messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }> = [
    { role: "user", content: userMessage },
  ];

  let finalReport = "";
  const startTime = Date.now();

  for (let step = 0; step < config.maxSteps; step++) {
    if (signal?.aborted) break;
    if (Date.now() - startTime > config.timeoutMs) break;

    const isWritingPhase = step >= config.maxSteps - 3;
    const baseSystem = buildSubagentSystemPrompt({ withEvaluate: useEvaluate });
    const systemPrompt = isWritingPhase
      ? baseSystem + "\n\nWRITING PHASE: stop searching. Write your final markdown report as plain text now."
      : baseSystem;

    const result: GenerateResult = await llm.generate({
      role: "subagent",
      system: systemPrompt,
      messages,
      tools: isWritingPhase ? undefined : toolDefs,
      maxTokens: 4096,
      runId,
      phase: "subagents",
    });

    if (result.toolCalls?.length && !isWritingPhase) {
      log?.debug({
        step,
        toolCalls: result.toolCalls.map((tc) => ({ name: tc.name, input: tc.input })),
      }, "subagent: tool calls");

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

    finalReport = result.text;
    break;
  }

  if (!finalReport || finalReport.length < 200) {
    log?.warn({
      subtaskId: subtask.id,
      instruction: subtask.instruction.slice(0, 150),
      reportLength: finalReport?.length ?? 0,
      evidenceCount: evidence.length,
    }, "subagent: report too short, generating fallback");

    const fallbackPrompt = SUBAGENT_REPORT_FALLBACK_PROMPT
      .replace("{instruction}", subtask.instruction)
      .replace("{boundaries_block}", boundariesBlock)
      .replace("{language}", languageName)
      .replace("{evidence}", evidence.join("\n\n---\n\n"));

    const generated = await llm.generate({
      role: "subagent",
      system: "You write evidence-backed research reports. Cite every claim with [src: <url>].",
      prompt: fallbackPrompt,
      maxTokens: 4096,
      runId,
      phase: "subagents",
    });
    finalReport = generated.text;
  }

  log?.info({
    subtaskId: subtask.id,
    reportLength: finalReport.length,
    sourceCount: sources.length,
    searchCount,
    fetchCount,
  }, "subagent: done");

  return {
    subtaskId: subtask.id,
    report: finalReport,
    sources,
    evidenceSpans,
  };
}
