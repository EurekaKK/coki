/**
 * Test helpers — create real LLM/search clients from environment or database.
 *
 * Priority for API keys:
 *   1. Environment variables (LLM_API_KEY, TAVILY_API_KEY)
 *   2. SQLite config table (plain_value column — works when safeStorage is unavailable)
 *
 * Usage:
 *   LLM_API_KEY=sk-xxx pnpm test
 */

import { execSync } from "node:child_process";
import { LLMClient } from "../llm/client";
import { TavilySearchProvider } from "../search/tavily";
import { ConfigManager } from "../config/config";

const DEFAULT_DB_PATH =
  process.env.COKI_DB_PATH ??
  `${process.env.HOME}/Library/Application Support/@coki/main/data.db`;

function queryDB(sql: string): string {
  return execSync(`sqlite3 "${DEFAULT_DB_PATH}" "${sql}"`, {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
}

function readKeyFromDB(key: string): string | null {
  try {
    const result = queryDB(
      `SELECT plain_value FROM config WHERE key = '${key}' AND plain_value IS NOT NULL`
    );
    return result || null;
  } catch {
    return null;
  }
}

function readConfigFromDB(): Record<string, string> {
  try {
    const result = queryDB(
      "SELECT key || '=' || plain_value FROM config WHERE key NOT LIKE '%api_key%' AND plain_value IS NOT NULL"
    );
    const config: Record<string, string> = {};
    for (const line of result.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length > 0) config[key] = rest.join("=");
    }
    return config;
  } catch {
    return {};
  }
}

export function getLlmApiKey(): string {
  const key = process.env.LLM_API_KEY ?? readKeyFromDB("llm_api_key");
  if (!key) throw new Error("No LLM API key found. Set LLM_API_KEY env var.");
  return key;
}

export function getTavilyApiKey(): string | null {
  return process.env.TAVILY_API_KEY ?? readKeyFromDB("tavily_api_key");
}

export function createTestLLMClient(): LLMClient {
  const apiKey = getLlmApiKey();
  const persisted = readConfigFromDB();
  const config = new ConfigManager({
    llm: {
      ...(persisted["llm.baseUrl"] ? { baseUrl: persisted["llm.baseUrl"] } : {}),
      ...(persisted["llm.model"] ? { model: persisted["llm.model"] } : {}),
      ...(persisted["llm.thinking"] ? { thinking: persisted["llm.thinking"] === "true" } : {}),
    },
  });
  const cfg = config.getConfig().llm;
  return new LLMClient({
    baseUrl: cfg.baseUrl,
    apiKey,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    thinking: cfg.thinking,
  });
}

export function createTestSearch(): TavilySearchProvider | null {
  const key = getTavilyApiKey();
  return key ? new TavilySearchProvider(key) : null;
}

/** Get config overrides from the database for engine construction. */
export function getTestConfigOverrides(): Record<string, unknown> {
  const persisted = readConfigFromDB();
  const overrides: Record<string, unknown> = {};
  if (persisted["llm.baseUrl"] || persisted["llm.model"]) {
    overrides.llm = {
      ...(persisted["llm.baseUrl"] ? { baseUrl: persisted["llm.baseUrl"] } : {}),
      ...(persisted["llm.model"] ? { model: persisted["llm.model"] } : {}),
    };
  }
  return overrides;
}
