/**
 * Init Pipeline Node
 *
 * Resets all transient pipeline state while preserving identity/config fields.
 * Pure function -- no LLM calls, no side effects.
 */

import type { PipelineContext } from "../context";

export async function initNode(ctx: PipelineContext): Promise<PipelineContext> {
  return {
    // Preserved
    runId: ctx.runId,
    userQuery: ctx.userQuery,
    depth: ctx.depth,
    outputLanguage: ctx.outputLanguage,
    maxIterations: ctx.maxIterations,
    qualityThreshold: ctx.qualityThreshold,
    collectionIds: ctx.collectionIds,
    researchBrief: ctx.researchBrief,

    // Reset transient state
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
    subagentReports: [],
    sources: new Map(),
    iterationCount: 0,
    qualityScore: 0,
    researchComplete: false,
    report: null,
    citedReport: null,
    evidenceSpans: [],
    claims: [],
  };
}
