import { describe, it, expect } from "vitest";
import { addCitations } from "./citation";

describe("addCitations", () => {
  it("converts [src: url] to numbered references", () => {
    const report = "Market grew 20% [src: https://example.com]. Revenue hit $1B [src: https://report.com].";
    const result = addCitations(report);
    expect(result.citedReport).toContain("[^1]");
    expect(result.citedReport).toContain("[^2]");
    expect(result.citedReport).toContain("## References");
    expect(result.citedReport).toContain("https://example.com");
    expect(result.sources).toHaveLength(2);
  });

  it("deduplicates same URL", () => {
    const report = "First fact [src: https://example.com]. Second fact [src: https://example.com].";
    const result = addCitations(report);
    expect(result.sources).toHaveLength(1);
    expect(result.citedReport).toContain("[^1]");
    expect(result.citedReport.match(/\[\^1\]/g)?.length).toBe(2);
  });

  it("strips orphaned [src:] markers", () => {
    const report = "Fact [src: ]. Another [src: https://valid.com].";
    const result = addCitations(report);
    expect(result.citedReport).not.toContain("[src: ]");
    expect(result.sources).toHaveLength(1);
  });

  it("normalizes URLs with trailing punctuation", () => {
    const report = "Fact [src: https://example.com/path).";
    const result = addCitations(report);
    expect(result.sources[0]!.url).toBe("https://example.com/path");
  });

  it("handles report with no citations", () => {
    const report = "No citations here.";
    const result = addCitations(report);
    expect(result.citedReport).toBe("No citations here.");
    expect(result.sources).toHaveLength(0);
  });

  it("strips existing References section", () => {
    const report = `Content [src: https://a.com].

## References
1. Old reference`;
    const result = addCitations(report);
    expect(result.citedReport).not.toContain("Old reference");
    expect(result.citedReport).toContain("## References");
  });
});
