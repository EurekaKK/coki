import { describe, it, expect } from "vitest";
import { SUBAGENT_SYSTEM_PROMPT, SUBAGENT_REPORT_PROMPT } from "./prompts";

describe("Agent prompts", () => {
  it("subagent system prompt contains tool instructions", () => {
    expect(SUBAGENT_SYSTEM_PROMPT).toContain("tavily_search");
    expect(SUBAGENT_SYSTEM_PROMPT).toContain("tavily_extract");
    expect(SUBAGENT_SYSTEM_PROMPT).toContain("submit_report");
  });

  it("subagent report prompt contains formatting instructions", () => {
    expect(SUBAGENT_REPORT_PROMPT).toContain("[src:");
  });
});
