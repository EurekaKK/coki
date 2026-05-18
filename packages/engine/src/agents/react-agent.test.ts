import { describe, it, expect } from "vitest";
import {
  buildSubagentSystemPrompt,
  SUBAGENT_REPORT_FALLBACK_PROMPT,
} from "./prompts";

describe("Agent prompts", () => {
  it("subagent system prompt advertises only the actual tools", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: false });
    expect(prompt).toContain("tavily_search");
    expect(prompt).toContain("tavily_extract");
    expect(prompt).not.toContain("evaluate_sources");
    expect(prompt).not.toContain("submit_report");
  });

  it("subagent system prompt includes evaluate_sources when enabled", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: true });
    expect(prompt).toContain("tavily_search");
    expect(prompt).toContain("evaluate_sources");
    expect(prompt).toContain("tavily_extract");
  });

  it("fallback report prompt requires citations", () => {
    expect(SUBAGENT_REPORT_FALLBACK_PROMPT).toContain("[src:");
  });
});
