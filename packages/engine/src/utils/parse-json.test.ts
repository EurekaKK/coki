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

  it("repairs truncated object with missing closing brace", () => {
    const text = '{"evaluations": [{"url": "a", "score": 0.5}';
    const result = parseJsonFromText(text) as { evaluations: unknown[] };
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]).toMatchObject({ url: "a", score: 0.5 });
  });

  it("repairs truncated array with missing closing bracket", () => {
    const text = '[1, 2, 3';
    expect(parseJsonFromText(text)).toEqual([1, 2, 3]);
  });

  it("repairs nested truncated JSON (object inside array)", () => {
    const text = '{"items": [{"id": 1}, {"id": 2';
    const result = parseJsonFromText(text) as { items: unknown[] };
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ id: 1 });
    expect(result.items[1]).toEqual({ id: 2 });
  });

  it("repairs truncated JSON with unclosed string", () => {
    const text = '{"message": "hello';
    const result = parseJsonFromText(text) as { message: string };
    expect(result.message).toBe("hello");
  });
});
