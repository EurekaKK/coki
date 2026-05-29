import { describe, expect, it } from "vitest";
import { documentIdFromSourceUrl } from "./cite";

describe("documentIdFromSourceUrl", () => {
  it("extracts document IDs from active https://doc.coki URLs", () => {
    expect(documentIdFromSourceUrl("https://doc.coki/doc-123")).toBe("doc-123");
  });

  it("keeps legacy doc:// URLs recognizable for old reports", () => {
    expect(documentIdFromSourceUrl("doc://legacy-doc")).toBe("legacy-doc");
  });

  it("returns null for normal web URLs", () => {
    expect(documentIdFromSourceUrl("https://example.com/doc-123")).toBeNull();
  });
});
