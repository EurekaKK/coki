import type { IntentAnswer, IntentClarificationResult, ResearchBrief } from "@coki/shared";

export const INTENT_CLARIFICATION_PHASE = "intent-clarify";

export interface IntentClarificationStartLogInput {
  intentRequestId: string;
  originalQuery: string;
  history?: IntentAnswer[];
  maxRounds: number;
  outputLanguage: "zh" | "en";
}

export interface IntentClarificationDoneLogInput {
  intentRequestId: string;
  latencyMs: number;
  result: IntentClarificationResult;
}

export interface IntentClarificationErrorLogInput {
  intentRequestId: string;
  latencyMs: number;
  error: unknown;
}

export interface ResearchStartLogInput {
  runId: string;
  intentRequestId?: string;
  query: string;
  depth: 1 | 2 | 3;
  outputLanguage: "zh" | "en";
  collectionIds?: string[];
  researchBrief?: ResearchBrief;
}

export function buildIntentClarificationStartLog(input: IntentClarificationStartLogInput) {
  return {
    component: "intent",
    event: "intent.clarify.start",
    intentRequestId: input.intentRequestId,
    query: input.originalQuery,
    queryLength: input.originalQuery.trim().length,
    historyCount: input.history?.length ?? 0,
    maxRounds: input.maxRounds,
    outputLanguage: input.outputLanguage,
  };
}

export function buildIntentClarificationDoneLog(input: IntentClarificationDoneLogInput) {
  const { result } = input;

  return {
    component: "intent",
    event: "intent.clarify.done",
    intentRequestId: input.intentRequestId,
    latencyMs: input.latencyMs,
    status: result.status,
    fallbackReason: result.fallbackReason ?? null,
    round: result.round,
    maxRounds: result.maxRounds,
    confidence: result.clarity.confidence,
    missingSlots: result.clarity.missingSlots,
    opportunityShouldAsk: result.clarificationOpportunity?.shouldAsk ?? null,
    opportunityImpact: result.clarificationOpportunity?.impact ?? null,
    opportunityReason: result.clarificationOpportunity?.reason ?? null,
    opportunityMissingResearchDecisions:
      result.clarificationOpportunity?.missingResearchDecisions ?? [],
    opportunityDefaultAssumption: result.clarificationOpportunity?.defaultAssumption ?? null,
    questionId: result.question?.id ?? null,
    questionText: result.question?.text ?? null,
    questionReason: result.question?.reason ?? null,
    optionCount: result.question?.options.length ?? 0,
    defaultOptionId: result.question?.options.find((option) => option.isDefault)?.id ?? null,
    ...summarizeResearchBrief(result.brief),
  };
}

export function buildIntentClarificationErrorLog(input: IntentClarificationErrorLogInput) {
  return {
    component: "intent",
    event: "intent.clarify.error",
    intentRequestId: input.intentRequestId,
    latencyMs: input.latencyMs,
    errorMessage: input.error instanceof Error ? input.error.message : String(input.error),
  };
}

export function buildResearchStartLog(input: ResearchStartLogInput) {
  return {
    runId: input.runId,
    component: "research",
    event: "research.start",
    intentRequestId: input.intentRequestId ?? null,
    query: input.query,
    queryLength: input.query.trim().length,
    depth: input.depth,
    outputLanguage: input.outputLanguage,
    collectionCount: input.collectionIds?.length ?? 0,
    collectionIds: input.collectionIds ?? [],
    ...summarizeResearchBrief(input.researchBrief),
  };
}

function summarizeResearchBrief(brief?: ResearchBrief) {
  if (!brief) {
    return {
      hasResearchBrief: false,
      refinedQuestion: null,
      objective: null,
      audience: null,
      scope: null,
      sourcePreferences: [],
      outputTemplate: null,
      mustInclude: [],
      exclude: [],
      assumptions: [],
    };
  }

  return {
    hasResearchBrief: true,
    refinedQuestion: brief.refinedQuestion,
    objective: brief.objective,
    audience: brief.audience,
    scope: brief.scope,
    sourcePreferences: brief.sourcePreferences,
    outputTemplate: brief.outputTemplate,
    mustInclude: brief.mustInclude,
    exclude: brief.exclude,
    assumptions: brief.assumptions,
  };
}
