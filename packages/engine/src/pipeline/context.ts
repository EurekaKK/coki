/**
 * Pipeline context types for the Coki research pipeline.
 */

export interface Subtask {
  id: string;
  instruction: string;
  keywords: string[];
  dimension?: string;
  boundaries?: string;
  sourceTypes?: string;
}

export interface ResearchRequirements {
  coreObjectives: string[];
  explicitRequirements: string[];
  scopeConstraints: {
    region?: string;
    time?: string;
    target?: string;
  };
  subQuestions: string[];
}

export interface EvidenceSpan {
  id: string;
  sourceId?: string;
  subtaskId: string;
  quote: string;
  url?: string;
  pageTitle?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface Claim {
  id: string;
  claimText: string;
  sectionHeading?: string;
  claimIndex?: number;
  evidenceLinks: Array<{ evidenceSpanId: string; relevanceScore?: number }>;
}

export interface SubagentReport {
  subtaskId: string;
  report: string;
  sources: SourceRecord[];
  evidenceSpans: EvidenceSpan[];
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
  outputStructure: string[];
  methodology: string;
  requirements: ResearchRequirements;
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
  evidenceSpans: EvidenceSpan[];
  claims: Claim[];
  done?: boolean;
  error?: string;
  collectionId?: string;
}
