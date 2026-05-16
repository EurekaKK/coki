/**
 * Pipeline context types for the Coki research pipeline.
 */

export interface Subtask {
  id: string;
  instruction: string;
  keywords: string[];
}

export interface SubagentReport {
  subtaskId: string;
  report: string;
  sources: SourceRecord[];
}

export interface SourceRecord {
  id: string;
  sourceType: "web" | "document";
  url?: string;
  title?: string;
  snippet?: string;
  contentHash?: string;
  fetchStatus: "ok" | "failed";
}

export interface ResearchPlan {
  dimensions: string[];
  outputStructure: string;
  methodology: string;
}

export interface PipelineContext {
  runId: string;
  userQuery: string;
  depth: 1 | 2 | 3;
  outputLanguage: "zh" | "en";
  plan: ResearchPlan | null;
  subtasks: Subtask[];
  completedSubtasks: Set<string>;
  subagentReports: SubagentReport[];
  sources: Map<string, SourceRecord>;
  iterationCount: number;
  maxIterations: number;
  qualityScore: number;
  qualityThreshold: number;
  researchComplete: boolean;
  report: string | null;
  citedReport: string | null;
  done?: boolean;
  error?: string;
}
