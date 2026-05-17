import { describe, it, expect } from "vitest";
import {
  parseSections,
  tokenize,
  matchClaimToEvidence,
  createExtractClaimsNode,
} from "./extract-claims";
import type { PipelineContext, EvidenceSpan } from "../context";

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    runId: "test-extract-claims",
    userQuery: "test",
    depth: 2,
    outputLanguage: "zh",
    plan: null,
    subtasks: [],
    completedSubtasks: new Set(),
    subagentReports: [],
    sources: new Map(),
    iterationCount: 0,
    maxIterations: 2,
    qualityScore: 0,
    qualityThreshold: 0.7,
    researchComplete: false,
    report: null,
    citedReport: null,
    evidenceSpans: [],
    claims: [],
    ...overrides,
  };
}

describe("parseSections", () => {
  it("parses markdown into heading/text sections", () => {
    const report = `Some intro text.

## First Section
Content of first section.

## Second Section
Content of second section.
More content.`;

    const sections = parseSections(report);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[0].text).toContain("Some intro text");
    expect(sections[1].heading).toBe("First Section");
    expect(sections[1].text).toContain("Content of first section");
  });

  it("handles report with no headings", () => {
    const report = "Just plain text without any headings.";
    const sections = parseSections(report);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[0].text).toBe("Just plain text without any headings.");
  });

  it("handles h1 and h3 headings", () => {
    const report = `# Main Title
Intro text.

### Sub-heading
Sub content.`;

    const sections = parseSections(report);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    // No text before first heading, so first section is "Main Title"
    expect(sections[0].heading).toBe("Main Title");
    expect(sections[0].text).toContain("Intro text");
  });

  it("handles empty report", () => {
    const sections = parseSections("");
    expect(sections).toHaveLength(0);
  });
});

describe("tokenize", () => {
  it("tokenizes English text", () => {
    const tokens = tokenize("Quantum computing uses qubits for calculation");
    expect(tokens.has("quantum")).toBe(true);
    expect(tokens.has("computing")).toBe(true);
    expect(tokens.has("qubits")).toBe(true);
    expect(tokens.has("for")).toBe(true); // 3 chars, passes > 2 filter
    expect(tokens.has("ab")).toBe(false); // too short (<=2)
  });

  it("handles Chinese text", () => {
    const tokens = tokenize("量子计算利用量子比特进行计算");
    expect(tokens.size).toBeGreaterThan(0);
  });

  it("removes punctuation", () => {
    const tokens = tokenize("hello, world! test.");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
  });

  it("returns empty set for empty string", () => {
    expect(tokenize("").size).toBe(0);
  });
});

describe("matchClaimToEvidence", () => {
  const spans: EvidenceSpan[] = [
    { id: "s1", subtaskId: "st1", quote: "Quantum computing uses qubits for calculation", url: "https://a.com" },
    { id: "s2", subtaskId: "st1", quote: "Machine learning requires large datasets", url: "https://b.com" },
    { id: "s3", subtaskId: "st1", quote: "Quantum entanglement enables teleportation of information", url: "https://c.com" },
  ];

  it("matches claim to relevant evidence spans", () => {
    const matches = matchClaimToEvidence("Quantum computing uses qubits", spans);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].evidenceSpanId).toBe("s1");
    expect(matches[0].relevanceScore).toBeGreaterThan(0);
  });

  it("returns empty for unrelated claim", () => {
    const matches = matchClaimToEvidence("blockchain cryptocurrency mining", spans);
    expect(matches).toHaveLength(0);
  });

  it("returns at most 3 matches", () => {
    const manySpans: EvidenceSpan[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      subtaskId: "st1",
      quote: "Quantum computing uses qubits for calculation and entanglement",
    }));
    const matches = matchClaimToEvidence("Quantum computing qubits entanglement", manySpans);
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("sorts by relevance score descending", () => {
    const matches = matchClaimToEvidence("Quantum computing qubits", spans);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].relevanceScore).toBeGreaterThanOrEqual(matches[i].relevanceScore);
    }
  });
});

describe("createExtractClaimsNode", () => {
  it("returns empty claims when report is null", async () => {
    const mockLlm = {
      generate: async () => ({ text: "[]" }),
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const ctx = await node(makeCtx({ report: null }));
    expect(ctx.claims).toEqual([]);
  });

  it("skips sections shorter than 50 chars", async () => {
    const generateCalls: string[] = [];
    const mockLlm = {
      generate: async (opts: any) => {
        generateCalls.push(opts.prompt);
        return { text: '["claim one", "claim two"]' };
      },
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const report = `## Short
Tiny.

## Long Enough Section
${"This is a much longer section with enough content to pass the threshold. ".repeat(3)}`;
    await node(makeCtx({ report }));
    // Only the long section should trigger an LLM call
    expect(generateCalls.length).toBe(1);
  });

  it("parses JSON array from LLM response and creates claims", async () => {
    const mockLlm = {
      generate: async () => ({
        text: '["Quantum computing uses qubits for calculation", "Entanglement enables teleportation"]',
      }),
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const report = `## Findings
${"Quantum computing leverages quantum mechanics for computation. ".repeat(5)}`;
    const ctx = await node(makeCtx({ report }));
    expect(ctx.claims.length).toBe(2);
    expect(ctx.claims[0].claimText).toBe("Quantum computing uses qubits for calculation");
    expect(ctx.claims[0].sectionHeading).toBe("Findings");
    expect(ctx.claims[0].claimIndex).toBe(0);
    expect(ctx.claims[1].claimIndex).toBe(1);
  });

  it("matches claims to evidence spans", async () => {
    const mockLlm = {
      generate: async () => ({
        text: '["Quantum computing uses qubits for calculation"]',
      }),
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const evidenceSpans: EvidenceSpan[] = [
      { id: "e1", subtaskId: "st1", quote: "Quantum computing uses qubits for calculation", url: "https://a.com" },
    ];
    const report = `## Findings
${"Quantum computing leverages quantum mechanics. ".repeat(5)}`;
    const ctx = await node(makeCtx({ report, evidenceSpans }));
    expect(ctx.claims.length).toBe(1);
    expect(ctx.claims[0].evidenceLinks.length).toBeGreaterThanOrEqual(1);
    expect(ctx.claims[0].evidenceLinks[0].evidenceSpanId).toBe("e1");
  });

  it("skips claim texts shorter than 10 chars", async () => {
    const mockLlm = {
      generate: async () => ({
        text: '["short", "This is a valid claim text"]',
      }),
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const report = `## Section
${"Content that is long enough to pass the threshold. ".repeat(5)}`;
    const ctx = await node(makeCtx({ report }));
    expect(ctx.claims).toHaveLength(1);
    expect(ctx.claims[0].claimText).toBe("This is a valid claim text");
  });

  it("handles LLM returning non-JSON gracefully", async () => {
    const mockLlm = {
      generate: async () => ({ text: "I cannot extract claims from this text." }),
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const report = `## Section
${"Some content that is long enough for the node to process. ".repeat(5)}`;
    const ctx = await node(makeCtx({ report }));
    expect(ctx.claims).toEqual([]);
  });

  it("handles LLM errors gracefully (non-fatal)", async () => {
    const mockLlm = {
      generate: async () => { throw new Error("LLM timeout"); },
    } as any;
    const node = createExtractClaimsNode(mockLlm);
    const report = `## Section
${"Some content that is long enough for the node to process. ".repeat(5)}`;
    const ctx = await node(makeCtx({ report }));
    expect(ctx.claims).toEqual([]);
  });
});
