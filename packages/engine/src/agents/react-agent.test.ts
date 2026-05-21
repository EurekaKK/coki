import { describe, it, expect } from "vitest";
import {
  buildSubagentSystemPrompt,
  SUBAGENT_REPORT_FALLBACK_PROMPT,
} from "./prompts";
import { createDocumentSearchTool } from "./tools";

describe("Agent prompts", () => {
  it("subagent system prompt advertises only the actual tools", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: false });
    expect(prompt).toContain("tavily_search");
    expect(prompt).toContain("tavily_extract");
    expect(prompt).not.toContain("evaluate_sources");
    // "submit_report" may appear in the "no such tool exists" warning,
    // but it must not be listed under Available tools.
    const toolsSection = prompt.split("Workflow:")[0] ?? prompt;
    expect(toolsSection).not.toContain("submit_report");
  });

  it("subagent system prompt includes evaluate_sources when enabled", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: true });
    expect(prompt).toContain("tavily_search");
    expect(prompt).toContain("evaluate_sources");
    expect(prompt).toContain("tavily_extract");
  });

  it("subagent system prompt includes search_documents when hasDocuments is true", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: false, hasDocuments: true });
    expect(prompt).toContain("search_documents");
    expect(prompt).toContain("tavily_search");
    expect(prompt).toContain("tavily_extract");
  });

  it("subagent system prompt omits search_documents when hasDocuments is false", () => {
    const prompt = buildSubagentSystemPrompt({ withEvaluate: false, hasDocuments: false });
    expect(prompt).not.toContain("search_documents");
  });

  it("fallback report prompt requires citations", () => {
    expect(SUBAGENT_REPORT_FALLBACK_PROMPT).toContain("[src:");
  });
});

describe("createDocumentSearchTool", () => {
  it("builds a tool def with joined collection names", () => {
    const tool = createDocumentSearchTool(["test1", "medical-papers"]);
    expect(tool.name).toBe("search_documents");
    expect(tool.description).toContain("test1");
    expect(tool.description).toContain("medical-papers");
    expect(tool.input_schema).toEqual({
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    });
  });

  it("handles a single collection name", () => {
    const tool = createDocumentSearchTool(["test1"]);
    expect(tool.description).toContain('"test1"');
  });
});
