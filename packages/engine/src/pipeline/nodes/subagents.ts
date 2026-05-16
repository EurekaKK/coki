import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import { runSubagent } from "../../agents/react-agent";
import { randomUUID } from "node:crypto";

export function createSubagentsNode(
  llm: LLMClient,
  search: TavilySearchProvider,
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
          },
          ctx.outputLanguage
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
