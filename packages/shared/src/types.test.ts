import { describe, it, expect } from "vitest";
import { ResearchOptionsSchema, RunStatusSchema, RunSummarySchema, RunReportSchema } from "./types";

describe("ResearchOptionsSchema", () => {
  it("accepts valid options", () => {
    const result = ResearchOptionsSchema.parse({ depth: 2, outputLanguage: "zh" });
    expect(result.depth).toBe(2);
    expect(result.outputLanguage).toBe("zh");
  });

  it("applies defaults", () => {
    const result = ResearchOptionsSchema.parse({});
    expect(result.depth).toBe(2);
    expect(result.outputLanguage).toBe("zh");
  });

  it("rejects depth out of range", () => {
    expect(() => ResearchOptionsSchema.parse({ depth: 0 })).toThrow();
    expect(() => ResearchOptionsSchema.parse({ depth: 4 })).toThrow();
  });

  it("rejects invalid language", () => {
    expect(() => ResearchOptionsSchema.parse({ outputLanguage: "fr" })).toThrow();
  });
});

describe("RunStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const status of ["pending", "running", "completed", "cancelled", "failed"]) {
      expect(RunStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => RunStatusSchema.parse("unknown")).toThrow();
  });
});

describe("RunSummarySchema", () => {
  it("accepts valid summary", () => {
    const summary = {
      id: "abc",
      userQuery: "test",
      depth: 2,
      status: "completed",
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: null,
      error: null,
    };
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects missing required fields", () => {
    expect(() => RunSummarySchema.parse({ id: "abc" })).toThrow();
  });
});

describe("RunReportSchema", () => {
  it("accepts valid report", () => {
    const report = {
      id: "abc",
      userQuery: "test",
      depth: 2,
      status: "completed",
      researchPlan: null,
      citedReport: "report text",
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: "2025-01-01T00:01:00Z",
      sources: [{ id: "s1", url: "https://example.com", title: "Example", snippet: "text" }],
    };
    expect(RunReportSchema.parse(report)).toEqual(report);
  });

  it("accepts empty sources", () => {
    const report = {
      id: "abc",
      userQuery: "test",
      depth: 1,
      status: "pending",
      researchPlan: null,
      citedReport: null,
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: null,
      sources: [],
    };
    expect(RunReportSchema.parse(report)).toEqual(report);
  });
});
