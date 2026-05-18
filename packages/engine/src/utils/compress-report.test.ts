import { describe, it, expect } from "vitest";
import { compressReport, compressReports } from "./compress-report";
import type { SubagentReport, Subtask } from "../pipeline/context";

describe("compressReport", () => {
  it("returns the report unchanged if under the budget", () => {
    const r = "short paragraph";
    expect(compressReport(r, 1000)).toBe(r);
  });

  it("keeps citation-dense paragraphs over transitional ones", () => {
    const report = [
      "First paragraph with [src: https://x.com/a] a real citation.",
      "综上所述，这是一段过渡性段落.",
      "Another claim with [src: https://y.com/b] data point 42%.",
    ].join("\n\n");
    const compressed = compressReport(report, 120);
    expect(compressed).toContain("[src: https://x.com/a]");
    expect(compressed).not.toContain("综上所述");
  });

  it("preserves the original paragraph order", () => {
    const report = ["A [src: https://x.com/1]", "B [src: https://x.com/2]", "C [src: https://x.com/3]"].join("\n\n");
    const compressed = compressReport(report, 200);
    const aIdx = compressed.indexOf("A [src");
    const bIdx = compressed.indexOf("B [src");
    const cIdx = compressed.indexOf("C [src");
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });
});

describe("compressReports", () => {
  const subtasks: Subtask[] = [
    { id: "s1", instruction: "Investigate area A", keywords: ["a"] },
    { id: "s2", instruction: "Investigate area B", keywords: ["b"] },
  ];

  it("uses real subtask instructions as section headings, not UUIDs", () => {
    const reports: SubagentReport[] = [
      { subtaskId: "s1", report: "Area A content [src: https://x.com/a]", sources: [], evidenceSpans: [] },
      { subtaskId: "s2", report: "Area B content [src: https://x.com/b]", sources: [], evidenceSpans: [] },
    ];
    const out = compressReports(reports, subtasks, 10000);
    expect(out).toContain("## Investigate area A");
    expect(out).toContain("## Investigate area B");
    expect(out).not.toContain("## Subtask: s1");
  });

  it("falls back to subtask id when subtask is unknown", () => {
    const reports: SubagentReport[] = [
      { subtaskId: "unknown-id", report: "orphan content", sources: [], evidenceSpans: [] },
    ];
    const out = compressReports(reports, subtasks, 10000);
    expect(out).toContain("## Subtask unknown-id");
  });
});
