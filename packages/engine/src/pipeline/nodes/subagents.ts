import type { PipelineContext } from "../context";
import type { LLMClient } from "../../llm/client";
import type { TavilySearchProvider } from "../../search/tavily";
import type { DepthProfile } from "../../config/config";
import { runSubagent } from "../../agents/react-agent";
import { pipelineLogger } from "../../logger";

export function createSubagentsNode(
  llm: LLMClient,
  search: TavilySearchProvider | null,
  profile: DepthProfile
) {
  return async function subagentsNode(ctx: PipelineContext, signal?: AbortSignal): Promise<PipelineContext> {
    const log = pipelineLogger(ctx.runId);

    if (!search) {
      throw new Error("Subagents node requires a TavilySearchProvider, but search is null.");
    }
    const pendingSubtasks = ctx.subtasks.filter(
      (st) => !ctx.completedSubtasks.has(st.id)
    );

    if (pendingSubtasks.length === 0) {
      log.info("subagents: no pending subtasks, marking complete");
      return { ...ctx, researchComplete: true };
    }

    // Bounded concurrency
    const concurrency = Math.min(profile.maxSubagents, pendingSubtasks.length);
    log.info({
      pendingCount: pendingSubtasks.length,
      concurrency,
      iteration: ctx.iterationCount + 1,
    }, "subagents: starting batch");

    const results = await Promise.allSettled(
      pendingSubtasks.slice(0, concurrency).map(async (subtask) => {
        const subtaskLog = log.child({ subtaskId: subtask.id });
        subtaskLog.info({ instruction: subtask.instruction.slice(0, 200) }, "subagents: running subtask");

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
          ctx.outputLanguage,
          signal,
          ctx.runId,
        );

        subtaskLog.info({
          reportLength: report.report.length,
          sourceCount: report.sources.length,
        }, "subagents: subtask done");

        return report;
      })
    );

    const newReports = [...ctx.subagentReports];
    const newSources = new Map(ctx.sources);
    const newCompleted = new Set(ctx.completedSubtasks);
    const newEvidenceSpans = [...(ctx.evidenceSpans ?? [])];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        const report = result.value;
        newReports.push(report);
        newCompleted.add(report.subtaskId);
        for (const source of report.sources) {
          if (!newSources.has(source.url ?? source.id)) {
            newSources.set(source.url ?? source.id, source);
          }
        }
        if (report.evidenceSpans) {
          newEvidenceSpans.push(...report.evidenceSpans);
        }
      } else {
        const subtask = pendingSubtasks[i];
        log.error({
          subtaskId: subtask.id,
          error: result.reason,
        }, "subagents: subtask failed");
      }
    }

    log.info({
      completedCount: newCompleted.size,
      totalReports: newReports.length,
      totalSources: newSources.size,
    }, "subagents: batch done");

    return {
      ...ctx,
      subagentReports: newReports,
      sources: newSources,
      completedSubtasks: newCompleted,
      evidenceSpans: newEvidenceSpans,
      iterationCount: ctx.iterationCount + 1,
    };
  };
}
