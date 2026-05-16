/**
 * Tavily Search Provider
 *
 * Wraps the @tavily/core SDK to provide search and extract
 * functionality for the Coki research engine.
 */

import { tavily } from "@tavily/core";
import type { TavilyClient } from "@tavily/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface ExtractResult {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface SearchOptions {
  maxResults?: number;
  includeAnswer?: boolean;
}

// ---------------------------------------------------------------------------
// TavilySearchProvider
// ---------------------------------------------------------------------------

export class TavilySearchProvider {
  private readonly client: TavilyClient;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  /**
   * Search for web results matching the query.
   */
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const includeAnswer = options?.includeAnswer ?? false;

    const response = await this.client.search(query, {
      maxResults,
      includeAnswer,
    });

    return response.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
    }));
  }

  /**
   * Extract readable content from a list of URLs via Tavily.
   */
  async extract(urls: string[]): Promise<ExtractResult[]> {
    try {
      const response = await this.client.extract(urls);

      const successes: ExtractResult[] = response.results.map((r) => ({
        url: r.url,
        content: r.rawContent,
        success: true,
      }));

      const failures: ExtractResult[] = response.failedResults.map((f) => ({
        url: f.url,
        content: "",
        success: false,
        error: f.error,
      }));

      return [...successes, ...failures];
    } catch (err) {
      // On catastrophic error, mark all requested URLs as failed
      const message =
        err instanceof Error ? err.message : "Unknown extraction error";
      return urls.map((url) => ({
        url,
        content: "",
        success: false,
        error: message,
      }));
    }
  }
}
