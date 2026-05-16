import { z } from "zod";

export const ResearchOptionsSchema = z.object({
  depth: z.number().int().min(1).max(3).default(2),
  outputLanguage: z.enum(["zh", "en"]).default("zh"),
});
export type ResearchOptions = z.infer<typeof ResearchOptionsSchema>;

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
