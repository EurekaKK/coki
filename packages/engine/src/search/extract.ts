/**
 * Fallback content extraction using @mozilla/readability + jsdom.
 *
 * Used when the Tavily extract API fails or is unavailable for a given URL.
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FallbackExtractResult {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// fallbackExtract
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and extract readable content via Readability.
 *
 * Uses a realistic User-Agent to avoid bot-blocking and enforces a 10-second
 * timeout so callers are never stalled indefinitely.
 */
export async function fallbackExtract(
  url: string,
): Promise<FallbackExtractResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        url,
        content: "",
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return {
        url,
        content: "",
        success: false,
        error: "Could not parse readable content",
      };
    }

    return {
      url,
      content: article.textContent,
      success: true,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown extraction error";
    return {
      url,
      content: "",
      success: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
