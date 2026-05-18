import { describe, it, expect } from "vitest";
import { parseJsonFromText } from "./parse-json";

describe("parseJsonFromText", () => {
  it("parses raw JSON", () => {
    expect(parseJsonFromText('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const text = "Sure!\n```json\n{\"a\": 1}\n```";
    expect(parseJsonFromText(text)).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    const text = "```\n{\"x\": [1,2,3]}\n```";
    expect(parseJsonFromText(text)).toEqual({ x: [1, 2, 3] });
  });

  it("extracts embedded object from prose", () => {
    const text = `Here's the plan: {"dimensions": ["a", "b"]} hope this helps.`;
    expect(parseJsonFromText(text)).toEqual({ dimensions: ["a", "b"] });
  });

  it("extracts embedded array when no object is present", () => {
    const text = `Claims: ["c1", "c2"]`;
    expect(parseJsonFromText(text)).toEqual(["c1", "c2"]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonFromText("not json at all")).toThrow();
  });
});
