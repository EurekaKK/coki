// Engine entry - will be implemented in Tasks 2-10
export { ConfigManager } from "./config";
export type {
  CokiConfig,
  ConfigOverrides,
  LLMConfig,
  RoleConfig,
  ResearchConfig,
  TavilyConfig,
  DepthProfile,
} from "./config";

export { CokiDatabase } from "./db";
export type { RunRow, SourceRow, LLMCallRow, TraceLogRow, EvidenceSpanRow, ClaimRow, ClaimEvidenceRow } from "./db";

export { LLMClient } from "./llm";
export type {
  LLMClientConfig,
  LLMCallRecord,
  OnCallCallback,
  GenerateOptions,
  StreamOptions,
  GenerateResult,
} from "./llm";

export { TavilySearchProvider } from "./search";
export type { SearchResult, ExtractResult, SearchOptions } from "./search";

export { Pipeline } from "./pipeline";
export type {
  NodeId,
  PipelineNode,
  Transition,
  PipelineConfig,
  PipelineEvent,
  Subtask,
  SubagentReport,
  SourceRecord,
  ResearchPlan,
  PipelineContext,
  EvidenceSpan,
  Claim,
} from "./pipeline";

export { ResearchEngine } from "./engine";
export type { RuntimeSecrets } from "./engine";

export { addCitations, verifyCitations } from "./citation/citation";
export type { CitedSource, CitationResult, VerificationResult } from "./citation/citation";
