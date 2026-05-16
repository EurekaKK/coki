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
  temperature: number;
  maxTokens: number;
}

export interface RoleConfig {
  model: string;
  temperature: number;
}

export interface ResearchConfig {
  depth: number;
  outputLanguage: "zh" | "en";
  qualityThreshold: number;
  maxIterations: number;
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  maxSearchRounds: number;
  continuationMaxRounds: number;
  maxInputChars: number;
}

export interface TavilyConfig {
  apiKey: string | null;
}

export interface CokiConfig {
  llm: LLMConfig;
  research: ResearchConfig;
  tavily: TavilyConfig;
  roles: Record<string, Partial<RoleConfig>>;
}

export type ConfigOverrides = Partial<{
  llm: Partial<LLMConfig>;
  research: Partial<ResearchConfig>;
  tavily: Partial<TavilyConfig>;
  roles: Record<string, Partial<RoleConfig>>;
}>;

export interface DepthProfile {
  maxSubagents: number;
  searchBudgetPerSubagent: number;
  reactMaxSteps: number;
  maxSearchRounds: number;
  maxIterations: number;
  plannerUseReact: boolean;
  useSplitter: boolean;
  continuationMaxRounds: number;
  maxInputChars: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LLM: LLMConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: null,
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 4096,
};

const DEFAULT_RESEARCH: ResearchConfig = {
  depth: 2,
  outputLanguage: "zh",
  qualityThreshold: 0.7,
  maxIterations: 2,
  maxSubagents: 4,
  searchBudgetPerSubagent: 8,
  reactMaxSteps: 12,
  maxSearchRounds: 5,
  continuationMaxRounds: 3,
  maxInputChars: 60000,
};

const DEFAULT_TAVILY: TavilyConfig = {
  apiKey: null,
};

// 7 roles with sensible defaults
const DEFAULT_ROLES: Record<string, RoleConfig> = {
  planner:    { model: "gpt-4o-mini", temperature: 0.4 },
  splitter:   { model: "gpt-4o-mini", temperature: 0.3 },
  subagent:   { model: "gpt-4o-mini", temperature: 0.7 },
  evaluator:  { model: "gpt-4o-mini", temperature: 0.2 },
  reflection: { model: "gpt-4o-mini", temperature: 0.5 },
  synthesis:  { model: "gpt-4o-mini", temperature: 0.5 },
  citation:   { model: "gpt-4o-mini", temperature: 0.1 },
};

// 3 depth profiles: 1 = quick, 2 = balanced, 3 = deep
const DEPTH_PROFILES: Record<number, DepthProfile> = {
  1: {
    maxSubagents: 2,
    searchBudgetPerSubagent: 4,
    reactMaxSteps: 8,
    maxSearchRounds: 3,
    maxIterations: 1,
    plannerUseReact: false,
    useSplitter: false,
    continuationMaxRounds: 1,
    maxInputChars: 30000,
  },
  2: {
    maxSubagents: 4,
    searchBudgetPerSubagent: 8,
    reactMaxSteps: 12,
    maxSearchRounds: 5,
    maxIterations: 2,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 3,
    maxInputChars: 60000,
  },
  3: {
    maxSubagents: 8,
    searchBudgetPerSubagent: 15,
    reactMaxSteps: 18,
    maxSearchRounds: 8,
    maxIterations: 3,
    plannerUseReact: true,
    useSplitter: true,
    continuationMaxRounds: 5,
    maxInputChars: 120000,
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
      roles: mergedRoles,
    };
    this.userRoles = this.config.roles;
  }

  /** Return the full resolved configuration. */
  getConfig(): CokiConfig {
    return this.config;
  }

  /** Return role-specific LLM settings, falling back to the global llm.model / temperature. */
  getRole(role: string): RoleConfig {
    const userRole = this.userRoles[role];
    const defaultRole = DEFAULT_ROLES[role];
    return {
      model: userRole?.model ?? defaultRole?.model ?? this.config.llm.model,
      temperature: userRole?.temperature ?? defaultRole?.temperature ?? this.config.llm.temperature,
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
}
