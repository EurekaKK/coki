import { describe, it, expect } from "vitest";
import { DEPTH_PRESETS, PHASES, PHASE_WEIGHTS } from "./constants";

describe("Constants", () => {
  it("DEPTH_PRESETS is [1, 2, 3]", () => {
    expect(DEPTH_PRESETS).toEqual([1, 2, 3]);
  });

  it("PHASES has 8 entries", () => {
    expect(PHASES).toHaveLength(8);
    expect(PHASES).toContain("init");
    expect(PHASES).toContain("extract-claims");
    expect(PHASES).toContain("cite");
  });

  it("PHASE_WEIGHTS sums to 100", () => {
    const total = Object.values(PHASE_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
  });

  it("every phase has a weight", () => {
    for (const phase of PHASES) {
      expect(PHASE_WEIGHTS[phase]).toBeDefined();
      expect(PHASE_WEIGHTS[phase]).toBeGreaterThan(0);
    }
  });
});
