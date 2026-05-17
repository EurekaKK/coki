import { describe, it, expect } from "vitest";
import { addCitations, verifyCitations } from "./citation";
import type { CitedSource } from "./citation";

describe("addCitations", () => {
  it("converts [src: url] to numbered references", () => {
    const report = "Market grew 20% [src: https://example.com]. Revenue hit $1B [src: https://report.com].";
    const result = addCitations(report);
    expect(result.citedReport).toContain("[^1]");
    expect(result.citedReport).toContain("[^2]");
    expect(result.citedReport).toContain("## References");
    expect(result.citedReport).toContain("https://example.com");
    expect(result.sources).toHaveLength(2);
    // Verify exact reference format
    expect(result.citedReport).toMatch(/\[\^1\]: https:\/\/example\.com/);
    expect(result.citedReport).toMatch(/\[\^2\]: https:\/\/report\.com/);
  });

  it("deduplicates same URL", () => {
    const report = "First fact [src: https://example.com]. Second fact [src: https://example.com].";
    const result = addCitations(report);
    expect(result.sources).toHaveLength(1);
    expect(result.citedReport).toContain("[^1]");
    // 2 inline references in body + 1 in References section
    expect(result.citedReport.match(/\[\^1\]/g)?.length).toBe(3);
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

describe("verifyCitations", () => {
  const sources: CitedSource[] = [
    { id: 1, url: "https://example.com/a" },
    { id: 2, url: "https://example.com/b" },
    { id: 3, url: "https://example.com/c" },
  ];

  it("verifies citations with matching evidence spans", () => {
    const citedReport = "Fact one [^1]. Fact two [^2].";
    const spans = [
      { quote: "Evidence for a", url: "https://example.com/a" },
      { quote: "Evidence for b", url: "https://example.com/b" },
    ];
    const results = verifyCitations(citedReport, sources, spans);
    expect(results).toHaveLength(2);
    expect(results[0].verified).toBe(true);
    expect(results[0].matchedSpanCount).toBe(1);
    expect(results[1].verified).toBe(true);
  });

  it("marks citations without matching evidence as unverified", () => {
    const citedReport = "Fact [^1] and [^3].";
    const spans = [
      { quote: "Evidence for a", url: "https://example.com/a" },
      // No span for example.com/c
    ];
    const results = verifyCitations(citedReport, sources, spans);
    const ref3 = results.find((r) => r.refNumber === 3);
    expect(ref3).toBeDefined();
    expect(ref3!.verified).toBe(false);
    expect(ref3!.matchedSpanCount).toBe(0);
  });

  it("only checks references that appear in the report", () => {
    const citedReport = "Only [^1] here.";
    const spans = [{ quote: "test", url: "https://example.com/a" }];
    const results = verifyCitations(citedReport, sources, spans);
    expect(results).toHaveLength(1);
    expect(results[0].refNumber).toBe(1);
  });

  it("handles empty evidence spans", () => {
    const citedReport = "Fact [^1].";
    const results = verifyCitations(citedReport, sources, []);
    expect(results).toHaveLength(1);
    expect(results[0].verified).toBe(false);
  });

  it("handles report with no footnotes", () => {
    const citedReport = "No citations here.";
    const results = verifyCitations(citedReport, sources, []);
    expect(results).toHaveLength(0);
  });

  it("counts multiple matching spans", () => {
    const citedReport = "Fact [^1].";
    const spans = [
      { quote: "Evidence one", url: "https://example.com/a" },
      { quote: "Evidence two", url: "https://example.com/a" },
      { quote: "Evidence three", url: "https://example.com/a" },
    ];
    const results = verifyCitations(citedReport, sources, spans);
    expect(results[0].matchedSpanCount).toBe(3);
  });
});
