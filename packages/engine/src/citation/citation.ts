/**
 * Citation System for Coki Engine
 *
 * Converts inline [src: url] markers into numbered footnotes
 * and builds a References section.
 */

export interface CitedSource {
  id: number;
  url: string;
}

export interface CitationResult {
  citedReport: string;
  sources: CitedSource[];
}

// Match [src: url] — closing ] is optional to handle malformed markers like [src: url)
const SRC_PATTERN = /\[src:\s*((?:https?)[^\]\)]*)\]?[)]?/g;
// Match empty/orphaned [src: ] markers (no URL)
const EMPTY_SRC_PATTERN = /\[src:\s*\]/g;

function normalizeUrl(url: string): string {
  // Strip trailing punctuation
  url = url.replace(/[),.;:!?]+$/, "");
  // Remove #:~:text= anchors
  url = url.replace(/#:~:text=.*$/, "");
  return url;
}

function stripExistingReferences(report: string): string {
  // Remove existing References/Sources/Bibliography sections
  return report.replace(
    /\n##\s*(References|Sources|Bibliography|参考文献|来源)\s*\n[\s\S]*$/i,
    "",
  );
}

export function addCitations(report: string): CitationResult {
  // Strip existing reference sections
  let cleaned = stripExistingReferences(report);

  // Strip empty [src: ] markers first
  cleaned = cleaned.replace(EMPTY_SRC_PATTERN, "");

  // Find all [src: url] markers
  const urlMap = new Map<string, number>(); // normalized url -> ref number
  const sources: CitedSource[] = [];
  let nextRef = 1;

  // First pass: collect all unique URLs
  const matches = [...cleaned.matchAll(SRC_PATTERN)];
  for (const match of matches) {
    const rawUrl = match[1]!.trim();
    if (!rawUrl) continue;

    const normalized = normalizeUrl(rawUrl);
    if (!normalized) continue;

    if (!urlMap.has(normalized)) {
      urlMap.set(normalized, nextRef++);
      sources.push({ id: urlMap.get(normalized)!, url: normalized });
    }
  }

  // Second pass: replace [src: url] with [^N]
  cleaned = cleaned.replace(SRC_PATTERN, (_match, rawUrl: string) => {
    const normalized = normalizeUrl(rawUrl.trim());
    if (!normalized) return ""; // Strip orphaned markers
    const refNum = urlMap.get(normalized);
    return refNum ? `[^${refNum}]` : "";
  });

  // Build references section
  if (sources.length > 0) {
    const referencesSection = sources
      .map((s) => `[^${s.id}]: ${s.url}`)
      .join("\n");
    cleaned += `\n\n## References\n${referencesSection}`;
  }

  return { citedReport: cleaned.trim(), sources };
}
