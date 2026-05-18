import { describe, it, expect, vi } from "vitest";

// Mock pdf-parse before importing parser
vi.mock("pdf-parse", () => ({
  default: vi.fn(async (_buffer: Buffer) => ({ text: "Hello PDF" })),
}));

import { parseDocument } from "./parser";

describe("parseDocument", () => {
  it("parses plain text", async () => {
    const result = await parseDocument(Buffer.from("Hello world\nLine two"), "txt");
    expect(result.text).toBe("Hello world\nLine two");
  });

  it("parses markdown to plain text", async () => {
    const md = "# Title\n\nThis is **bold** and _italic_.\n\n- Item 1\n- Item 2";
    const result = await parseDocument(Buffer.from(md), "md");
    expect(result.text).toContain("Title");
    expect(result.text).toContain("This is bold and italic.");
    expect(result.text).not.toContain("#");
    expect(result.text).not.toContain("**");
  });

  it("parses PDF text", async () => {
    const result = await parseDocument(Buffer.from("dummy pdf bytes"), "pdf");
    expect(result.text).toContain("Hello PDF");
  });

  it("throws on unsupported format", async () => {
    await expect(parseDocument(Buffer.from("data"), "docx")).rejects.toThrow("Unsupported");
  });
});
