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
// Supports http(s) URLs and doc:// synthetic URLs for document sources
const DOC_URL_PREFIX = "https://doc.coki/";
const SRC_PATTERN = /\[src:\s*((?:https?|doc:)[^\]\)]*)\]?[)]?/g;
// Match empty/orphaned [src: ] markers (no URL)
const EMPTY_SRC_PATTERN = /\[src:\s*\]/g;

export function normalizeUrl(url: string): string {
  // Strip trailing punctuation
  url = url.replace(/[),.;:!?]+$/, "");
  // Remove #:~:text= anchors
  url = url.replace(/#:~:text=.*$/, "");
  return url;
}

/**
 * Escape characters that have special meaning inside markdown link text.
 */
function escapeLinkText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function stripExistingReferences(report: string): string {
  // Remove existing References/Sources/Bibliography sections
  return report.replace(
    /\n##\s*(References|Sources|Bibliography|参考文献|来源|脚注|Footnotes)\s*\n[\s\S]*$/i,
    "",
  );
}

export function addCitations(
  report: string,
  /** Optional map from URL (raw or normalized) to a human-readable title. */
  titleByUrl?: Map<string, string>,
): CitationResult {
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

  // Emit footnote definitions with a References heading.  remark-gfm v3
  // may or may not render its own "Footnotes" heading depending on
  // configuration; adding the heading here guarantees it is present.
  // The renderer component suppresses any duplicate auto-generated heading.
  if (sources.length > 0) {
    const definitions = sources
      .map((s) => {
        const title = lookupTitle(titleByUrl, s.url);
        if (s.url.startsWith(DOC_URL_PREFIX)) {
          // Document sources render as a link so Report.tsx can intercept clicks
          const docId = s.url.slice(DOC_URL_PREFIX.length);
          const docTitle = title ?? `Document ${docId.slice(0, 8)}`;
          return `[^${s.id}]: [${escapeLinkText(docTitle)}](${s.url})`;
        }
        if (title) {
          return `[^${s.id}]: [${escapeLinkText(title)}](${s.url})`;
        }
        return `[^${s.id}]: <${s.url}>`;
      })
      .join("\n");
    cleaned += `\n\n## References\n\n${definitions}`;
  }

  return { citedReport: cleaned.trim(), sources };
}

function lookupTitle(
  titleByUrl: Map<string, string> | undefined,
  normalizedUrl: string,
): string | undefined {
  if (!titleByUrl) return undefined;
  const direct = titleByUrl.get(normalizedUrl);
  if (direct) return direct;
  // Try raw URL variants the caller might have keyed with
  for (const [k, v] of titleByUrl) {
    if (normalizeUrl(k) === normalizedUrl) return v;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Citation Verifier — observability-only check
// ---------------------------------------------------------------------------

export interface VerificationResult {
  refNumber: number;
  sourceUrl: string;
  verified: boolean;
  matchedSpanCount: number;
}

/**
 * Verify that each [^N] footnote in the cited report has supporting evidence
 * from extracted spans. Returns per-reference verification results.
 * This is observability-only — it does not modify the report.
 */
export function verifyCitations(
  citedReport: string,
  sources: CitedSource[],
  evidenceSpans: Array<{ url?: string; quote: string }>,
): VerificationResult[] {
  const results: VerificationResult[] = [];
  const refPattern = /\[\^(\d+)\]/g;
  const foundRefs = new Set<number>();

  // Collect all footnote numbers used in the report
  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(citedReport)) !== null) {
    foundRefs.add(Number(match[1]));
  }

  // Build a set of evidence URLs for quick lookup
  const evidenceUrls = new Set<string>();
  for (const span of evidenceSpans) {
    if (span.url) {
      evidenceUrls.add(normalizeUrl(span.url));
    }
  }

  // Check each source against evidence
  for (const source of sources) {
    if (!foundRefs.has(source.id)) continue;

    const normalizedSourceUrl = normalizeUrl(source.url);
    const verified = evidenceUrls.has(normalizedSourceUrl);
    const matchedSpanCount = evidenceSpans.filter(
      (s) => s.url && normalizeUrl(s.url) === normalizedSourceUrl,
    ).length;

    results.push({
      refNumber: source.id,
      sourceUrl: source.url,
      verified,
      matchedSpanCount,
    });
  }

  return results;
}
