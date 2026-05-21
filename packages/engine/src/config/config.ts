/**
 * Coki Engine Configuration Module
 *
 * Provides ConfigManager with deep-merge of user overrides onto sensible defaults,
 * role-specific LLM configuration with fallback, and depth-based research profiles.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface LLMConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  maxTokens: number;
  thinking: boolean;
}

export interface RoleConfig {
  model: string;
}

export interface ResearchConfig {
  depth: number;
  outputLanguage: "zh" | "en";
  qualityThreshold: number;
  maxIterations: number;
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  continuationMaxRounds: number;
  maxInputChars: number;
}

export interface TavilyConfig {
  apiKey: string | null;
}

export interface RAGConfig {
  embeddingProvider: "zhipu" | "local";
  embeddingModel: string;
  embeddingDimension: number;
  chunkSize: number;
  chunkOverlap: number;
  hybridAlpha: number;
  topK: number;
}

export interface CokiConfig {
  llm: LLMConfig;
  research: ResearchConfig;
  tavily: TavilyConfig;
  rag: RAGConfig;
  roles: Record<string, Partial<RoleConfig>>;
}

export type ConfigOverrides = Partial<{
  llm: Partial<LLMConfig>;
  research: Partial<ResearchConfig>;
  tavily: Partial<TavilyConfig>;
  rag: Partial<RAGConfig>;
  roles: Record<string, Partial<RoleConfig>>;
}>;

export interface DepthProfile {
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  maxIterations: number;
  plannerUseReact: boolean;
  useSplitter: boolean;
  continuationMaxRounds: number;
  maxInputChars: number;
  /** When true, run the deepen node after synthesis to expand thin sections. */
  deepenThinSections: boolean;
  /** Max number of sections to deepen in one pass. */
  maxDeepenSections: number;
  /** Parallelism for the deepen pass. */
  deepenConcurrency: number;
  /** Section content shorter than this (chars) is considered thin. */
  deepenCharThreshold: number;
  /** Section with fewer than this many [src:] markers is considered thin. */
  deepenCitationThreshold: number;
  /** When true, subagent calls the evaluate_sources tool before fetching. */
  useSourceEvaluation: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LLM: LLMConfig = {
  baseUrl: "",
  apiKey: null,
  model: "",
  maxTokens: 4096,
  thinking: false,
};

const DEFAULT_RESEARCH: ResearchConfig = {
  depth: 2,
  outputLanguage: "zh",
  qualityThreshold: 0.8,
  maxIterations: 2,
  maxSubagents: 4,
  searchBudgetPerSubagent: 8,
  reactMaxSteps: 12,
  continuationMaxRounds: 3,
  maxInputChars: 60000,
};

const DEFAULT_TAVILY: TavilyConfig = {
  apiKey: null,
};

const DEFAULT_RAG: RAGConfig = {
  embeddingProvider: "zhipu",
  embeddingModel: "embedding-3",
  embeddingDimension: 512,
  chunkSize: 800,
  chunkOverlap: 100,
  hybridAlpha: 0.5,
  topK: 10,
};

// 7 roles with sensible defaults
const DEFAULT_ROLES: Record<string, RoleConfig> = {
  planner:    { model: "" },
  splitter:   { model: "" },
  subagent:   { model: "" },
  evaluator:  { model: "" },
  reflection: { model: "" },
  synthesis:  { model: "" },
};

// 3 depth profiles: 1 = quick, 2 = balanced, 3 = deep
const DEPTH_PROFILES: Record<number, DepthProfile> = {
  1: {
    maxSubagents: 2,
    searchBudgetPerSubagent: 4,
    reactMaxSteps: 8,
    maxIterations: 1,
    plannerUseReact: false,
    useSplitter: false,
    continuationMaxRounds: 1,
    maxInputChars: 30000,
    deepenThinSections: false,
    maxDeepenSections: 0,
    deepenConcurrency: 1,
    deepenCharThreshold: 0,
    deepenCitationThreshold: 0,
    useSourceEvaluation: false,
  },
  2: {
    maxSubagents: 4,
    searchBudgetPerSubagent: 8,
    reactMaxSteps: 12,
    maxIterations: 2,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 3,
    maxInputChars: 60000,
    deepenThinSections: true,
    maxDeepenSections: 5,
    deepenConcurrency: 3,
    deepenCharThreshold: 800,
    deepenCitationThreshold: 3,
    useSourceEvaluation: true,
  },
  3: {
    maxSubagents: 8,
    searchBudgetPerSubagent: 15,
    reactMaxSteps: 18,
    maxIterations: 3,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 5,
    maxInputChars: 120000,
    deepenThinSections: true,
    maxDeepenSections: 8,
    deepenConcurrency: 5,
    deepenCharThreshold: 600,
    deepenCitationThreshold: 3,
    useSourceEvaluation: true,
  },
};

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>,
): T {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = result[key];
    const overVal = (override as Record<string, unknown>)[key];
    if (isPlainObject(baseVal) && isPlainObject(overVal)) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

export class ConfigManager {
  private readonly config: CokiConfig;
  private readonly userRoles: Record<string, Partial<RoleConfig>>;

  constructor(overrides: ConfigOverrides) {
    const mergedRoles: Record<string, Partial<RoleConfig>> = {};
    if (overrides.roles) {
      for (const [name, userRole] of Object.entries(overrides.roles)) {
        const defaultRole = DEFAULT_ROLES[name];
        mergedRoles[name] = defaultRole
          ? { ...defaultRole, ...userRole }
          : { ...userRole };
      }
    }
    this.config = {
      llm: deepMerge(
        { ...DEFAULT_LLM },
        (overrides.llm ?? {}) as Partial<LLMConfig>,
      ),
      research: deepMerge(
        { ...DEFAULT_RESEARCH },
        (overrides.research ?? {}) as Partial<ResearchConfig>,
      ),
      tavily: deepMerge(
        { ...DEFAULT_TAVILY },
        (overrides.tavily ?? {}) as Partial<TavilyConfig>,
      ),
      rag: deepMerge(
        { ...DEFAULT_RAG },
        (overrides.rag ?? {}) as Partial<RAGConfig>,
      ),
      roles: mergedRoles,
    };
    this.userRoles = this.config.roles;
  }

  /** Return the full resolved configuration. */
  getConfig(): CokiConfig {
    return this.config;
  }

  /** Return role-specific LLM settings, falling back to the global llm.model. */
  getRole(role: string): RoleConfig {
    const userRole = this.userRoles[role];
    const defaultRole = DEFAULT_ROLES[role];
    return {
      model: userRole?.model ?? defaultRole?.model ?? this.config.llm.model,
    };
  }

  /** Return the depth profile for a given depth level (1-3). */
  getDepthProfile(depth: number): DepthProfile {
    const profile = DEPTH_PROFILES[depth];
    if (!profile) {
      throw new Error(`Invalid depth: ${depth}. Must be 1, 2, or 3.`);
    }
    return profile;
  }

  /** Return the RAG configuration. */
  getRAGConfig(): RAGConfig {
    return this.config.rag;
  }

  /** Apply a partial config patch at runtime (mutates in place). */
  updateConfig(patch: ConfigOverrides): void {
    if (patch.llm) {
      Object.assign(this.config.llm, patch.llm);
    }
    if (patch.research) {
      Object.assign(this.config.research, patch.research);
    }
    if (patch.rag) {
      Object.assign(this.config.rag, patch.rag);
    }
    if (patch.roles) {
      for (const [name, rolePatch] of Object.entries(patch.roles)) {
        if (!this.config.roles[name]) {
          this.config.roles[name] = {};
        }
        Object.assign(this.config.roles[name], rolePatch);
      }
    }
  }
}
