import { describe, it, expect } from "vitest";
import { parseSections, countCitations } from "./sections";

describe("parseSections", () => {
  it("splits a report by ## headings", () => {
    const report = `## Intro\nfirst section\n\n## Body\nbody text\n\n## Conclusion\nwrap up`;
    const sections = parseSections(report);
    expect(sections.map((s) => s.heading)).toEqual(["Intro", "Body", "Conclusion"]);
    expect(sections[1]!.text).toContain("body text");
  });

  it("captures content before the first heading under Introduction", () => {
    const report = `Some preamble text\n\n## First\nbody`;
    const sections = parseSections(report);
    expect(sections[0]!.heading).toBe("Introduction");
    expect(sections[0]!.text).toContain("preamble");
  });

  it("preserves heading level", () => {
    const report = `# Title\nintro\n\n## Sub\nsub text`;
    const sections = parseSections(report);
    expect(sections[0]!.level).toBe(1);
    expect(sections[1]!.level).toBe(2);
  });
});

describe("countCitations", () => {
  it("counts [src:] markers with https URLs", () => {
    const text = `Claim one [src: https://a.com/x] and claim two [src: https://b.com/y].`;
    expect(countCitations(text)).toBe(2);
  });

  it("returns 0 when no markers", () => {
    expect(countCitations("plain text")).toBe(0);
  });

  it("ignores empty [src:] markers", () => {
    expect(countCitations("claim [src: ] x [src: https://x.com/p]")).toBe(1);
  });
});
