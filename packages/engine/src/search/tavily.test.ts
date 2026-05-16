import { describe, it, expect } from "vitest";
import { TavilySearchProvider } from "./tavily";

describe("TavilySearchProvider", () => {
  it("constructs with API key", () => {
    const provider = new TavilySearchProvider("test-api-key");
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(TavilySearchProvider);
  });

  it("has search method", () => {
    const provider = new TavilySearchProvider("test-api-key");
    expect(typeof provider.search).toBe("function");
  });

  it("has extract method", () => {
    const provider = new TavilySearchProvider("test-api-key");
    expect(typeof provider.extract).toBe("function");
  });
});
