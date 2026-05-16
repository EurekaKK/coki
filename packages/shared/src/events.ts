import { z } from "zod";

export const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  runId: z.string(),
  phase: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const LogEventSchema = z.object({
  type: z.literal("log"),
  runId: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  phase: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

export const CompleteEventSchema = z.object({
  type: z.literal("complete"),
  runId: z.string(),
  citedReport: z.string(),
});
export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  runId: z.string(),
  error: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export type PipelineEvent =
  | ProgressEvent
  | LogEvent
  | CompleteEvent
  | ErrorEvent;
