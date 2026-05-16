import { describe, it, expect } from "vitest";
import { ConfigManager } from "./config";

describe("ConfigManager", () => {
  it("returns defaults when no overrides", () => {
    const cm = new ConfigManager({});
    const config = cm.getConfig();
    expect(config.llm.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.llm.model).toBe("gpt-4o-mini");
    expect(config.tavily.apiKey).toBeNull();
    expect(config.research.depth).toBe(2);
    expect(config.research.qualityThreshold).toBe(0.7);
  });

  it("merges overrides with defaults", () => {
    const cm = new ConfigManager({
      llm: { model: "claude-sonnet-4-20250514" },
      tavily: { apiKey: "tvly-test" },
    });
    const config = cm.getConfig();
    expect(config.llm.model).toBe("claude-sonnet-4-20250514");
    expect(config.llm.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.tavily.apiKey).toBe("tvly-test");
  });

  it("returns role-specific config with fallback", () => {
    const cm = new ConfigManager({
      llm: { model: "default-model" },
      roles: { planner: { model: "planner-model" } },
    });
    expect(cm.getRole("planner").model).toBe("planner-model");
    // subagent has no user override but has a DEFAULT_ROLES entry, so uses that model
    expect(cm.getRole("subagent").model).toBe("gpt-4o-mini");
    // an unknown role with no default falls back to global llm.model
    expect(cm.getRole("custom-role").model).toBe("default-model");
  });

  it("falls back to default role model when user override has no model", () => {
    const cm = new ConfigManager({
      roles: { planner: { temperature: 0.9 } },
    });
    // Should use DEFAULT_ROLES.planner.model, not the global llm.model
    expect(cm.getRole("planner").model).toBe("gpt-4o-mini");
    expect(cm.getRole("planner").temperature).toBe(0.9);
  });

  it("returns depth profile", () => {
    const cm = new ConfigManager({});
    expect(cm.getDepthProfile(1).maxSubagents).toBeLessThan(
      cm.getDepthProfile(3).maxSubagents
    );
  });
});
