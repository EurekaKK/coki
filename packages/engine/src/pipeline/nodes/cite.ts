/**
 * Cite Pipeline Node
 *
 * Processes the synthesized report to convert inline [src: url] markers
 * into numbered footnotes and persists sources to the database.
 */

import { randomUUID } from "node:crypto";
import type { PipelineContext } from "../context";
import type { CokiDatabase } from "../../db/database";
import { addCitations, normalizeUrl, verifyCitations } from "../../citation/citation";
import { pipelineLogger } from "../../logger";

const DOC_URL_PREFIX = "https://doc.coki/";
const LEGACY_DOC_URL_PREFIX = "doc://";

// ---------------------------------------------------------------------------
// URL liveness check
// ---------------------------------------------------------------------------

async function checkUrlLiveness(url: string): Promise<"ok" | "failed"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return response.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export function documentIdFromSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = normalizeUrl(url.trim());
  if (normalized.startsWith(DOC_URL_PREFIX)) {
    return normalized.slice(DOC_URL_PREFIX.length) || null;
  }
  if (normalized.startsWith(LEGACY_DOC_URL_PREFIX)) {
    return normalized.slice(LEGACY_DOC_URL_PREFIX.length) || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCiteNode(db: CokiDatabase) {
  return async function citeNode(
    ctx: PipelineContext,
  ): Promise<PipelineContext> {
    if (!ctx.report) {
      return { ...ctx, error: "No report to cite" };
    }

    // Build URL -> Title map from sub-agent SourceRecord pool so the rendered
    // footnote definitions show a human-readable title, not bare URLs.
    const titleByUrl = new Map<string, string>();
    for (const src of ctx.sources.values()) {
      if (!src.url || !src.title) continue;
      const title = src.title.trim();
      if (!title) continue;
      const key = normalizeUrl(src.url);
      if (!titleByUrl.has(key)) titleByUrl.set(key, title);
    }

    const { citedReport, sources } = addCitations(ctx.report, titleByUrl);
    const sourceDescriptors = sources.map((source) => ({
      source,
      documentId: documentIdFromSourceUrl(source.url),
    }));

    // Check URL liveness concurrently for all sources
    const livenessResults = await Promise.all(
      sourceDescriptors.map(({ source, documentId }) =>
        documentId
          ? Promise.resolve("ok" as const)
          : source.url
            ? checkUrlLiveness(source.url)
            : Promise.resolve("failed" as const),
      ),
    );

    // Persist sources to database and write report_references
    for (let i = 0; i < sourceDescriptors.length; i++) {
      const { source, documentId } = sourceDescriptors[i]!;
      const fetchStatus = livenessResults[i];

      const existingSource = [...ctx.sources.values()].find(
        (s) => s.url === source.url,
      );

      // Avoid duplicate source rows for the same URL within this run
      const existing = source.url
        ? db.getSourceByUrlAndRunId(source.url, ctx.runId)
        : undefined;

      const isDocument = documentId !== null;
      const sourceId = existing?.id ?? db.insertSource({
        run_id: ctx.runId,
        source_type: isDocument ? "document" : "web",
        url: isDocument ? null : source.url,
        document_id: documentId,
        title: existingSource?.title,
        snippet: existingSource?.snippet,
        fetch_status: isDocument ? "ok" : fetchStatus,
      });

      // Write to report_references table
      db.insertReportReference({
        id: randomUUID(),
        runId: ctx.runId,
        refNumber: source.id,
        sourceId,
      });
    }

    // Verify citations against evidence spans (observability-only)
    const log = pipelineLogger(ctx.runId);
    if (ctx.evidenceSpans?.length) {
      const verification = verifyCitations(citedReport, sources, ctx.evidenceSpans);
      const unverified = verification.filter((v) => !v.verified);
      if (unverified.length > 0) {
        log.warn({
          unverifiedCount: unverified.length,
          totalCount: verification.length,
          unverifiedRefs: unverified.map((v) => v.refNumber),
        }, "cite: some citations could not be verified against evidence spans");
      } else {
        log.info({
          verifiedCount: verification.length,
        }, "cite: all citations verified against evidence spans");
      }
    }

    // Persist evidence spans
    let evidenceCount = 0;
    for (const span of ctx.evidenceSpans ?? []) {
      db.insertEvidenceSpan({
        id: span.id,
        run_id: ctx.runId,
        source_id: span.sourceId ?? null,
        subtask_id: span.subtaskId,
        quote: span.quote,
        url: span.url ?? null,
        page_title: span.pageTitle ?? null,
        start_offset: span.startOffset ?? null,
        end_offset: span.endOffset ?? null,
      });
      evidenceCount++;
    }

    // Persist claims and claim-evidence links
    let claimCount = 0;
    let linkCount = 0;
    for (const claim of ctx.claims ?? []) {
      db.insertClaim({
        id: claim.id,
        run_id: ctx.runId,
        claim_text: claim.claimText,
        section_heading: claim.sectionHeading ?? null,
        claim_index: claim.claimIndex ?? null,
      });
      claimCount++;
      for (const link of claim.evidenceLinks) {
        db.insertClaimEvidence({
          id: randomUUID(),
          claim_id: claim.id,
          evidence_span_id: link.evidenceSpanId,
          relevance_score: link.relevanceScore ?? null,
        });
        linkCount++;
      }
    }

    log.info({
      evidenceCount,
      claimCount,
      claimEvidenceLinks: linkCount,
      sourcesCited: sources.length,
    }, "cite: persisted evidence and claims");

    return { ...ctx, citedReport };
  };
}
