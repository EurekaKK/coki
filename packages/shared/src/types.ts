import { z } from "zod";

export const ResearchOptionsSchema = z.object({
  depth: z.number().int().min(1).max(3).default(2),
  outputLanguage: z.enum(["zh", "en"]).default("zh"),
});
export type ResearchOptions = z.infer<typeof ResearchOptionsSchema>;

export const ResearchObjectiveSchema = z.enum([
  "explain",
  "compare",
  "recommend",
  "forecast",
  "evaluate",
  "survey",
]);
export type ResearchObjective = z.infer<typeof ResearchObjectiveSchema>;

export const ResearchAudienceSchema = z.enum([
  "general",
  "technical",
  "academic",
  "business",
  "investment",
]);
export type ResearchAudience = z.infer<typeof ResearchAudienceSchema>;

export const SourcePreferenceSchema = z.enum([
  "official",
  "academic",
  "news",
  "industry",
  "local_documents",
  "data",
]);
export type SourcePreference = z.infer<typeof SourcePreferenceSchema>;

export const OutputTemplateSchema = z.enum([
  "research_report",
  "decision_memo",
  "literature_review",
  "market_analysis",
  "technical_analysis",
]);
export type OutputTemplate = z.infer<typeof OutputTemplateSchema>;

export const ResearchBriefSchema = z.object({
  originalQuery: z.string().min(1),
  refinedQuestion: z.string().min(1),
  objective: ResearchObjectiveSchema,
  audience: ResearchAudienceSchema,
  scope: z
    .object({
      region: z.string().optional(),
      timeRange: z.string().optional(),
      target: z.string().optional(),
    })
    .default({}),
  sourcePreferences: z.array(SourcePreferenceSchema).default([]),
  outputTemplate: OutputTemplateSchema,
  mustInclude: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export const IntentClaritySchema = z.object({
  objectiveClear: z.boolean(),
  scopeClear: z.boolean(),
  audienceClear: z.boolean(),
  sourceClear: z.boolean(),
  outputClear: z.boolean(),
  constraintsClear: z.boolean(),
  confidence: z.number().min(0).max(1),
  missingSlots: z.array(z.string()).default([]),
});
export type IntentClarity = z.infer<typeof IntentClaritySchema>;

export const ClarificationOpportunitySchema = z.object({
  shouldAsk: z.boolean(),
  impact: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  missingResearchDecisions: z.array(z.string()).default([]),
  defaultAssumption: z.string().min(1).optional(),
});
export type ClarificationOpportunity = z.infer<
  typeof ClarificationOpportunitySchema
>;

export const ClarificationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  isDefault: z.boolean().optional(),
});
export type ClarificationOption = z.infer<typeof ClarificationOptionSchema>;

export const ClarificationQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  reason: z.string().min(1),
  options: z.array(ClarificationOptionSchema).min(1).max(3),
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

export const IntentAnswerSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});
export type IntentAnswer = z.infer<typeof IntentAnswerSchema>;

export const IntentClarificationResultSchema = z.object({
  intentRequestId: z.string().optional(),
  fallbackReason: z.string().optional(),
  status: z.enum(["clear", "needs_clarification"]),
  round: z.number().int().min(1),
  maxRounds: z.number().int().min(1),
  clarity: IntentClaritySchema,
  clarificationOpportunity: ClarificationOpportunitySchema.optional(),
  brief: ResearchBriefSchema,
  question: ClarificationQuestionSchema.optional(),
});
export type IntentClarificationResult = z.infer<
  typeof IntentClarificationResultSchema
>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  userQuery: z.string(),
  depth: z.number(),
  status: RunStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunReportSchema = z.object({
  id: z.string(),
  userQuery: z.string(),
  depth: z.number(),
  status: RunStatusSchema,
  researchPlan: z.string().nullable(),
  citedReport: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  sources: z.array(
    z.object({
      id: z.string(),
      url: z.string().nullable(),
      title: z.string().nullable(),
      snippet: z.string().nullable(),
    })
  ),
});
export type RunReport = z.infer<typeof RunReportSchema>;
