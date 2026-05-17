/**
 * Cite Pipeline Node
 *
 * Processes the synthesized report to convert inline [src: url] markers
 * into numbered footnotes and persists sources to the database.
 */

import { randomUUID } from "node:crypto";
import type { PipelineContext } from "../context";
import type { CokiDatabase } from "../../db/database";
import { addCitations, verifyCitations } from "../../citation/citation";
import { pipelineLogger } from "../../logger";

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

    const { citedReport, sources } = addCitations(ctx.report);

    // Check URL liveness concurrently for all sources
    const livenessResults = await Promise.all(
      sources.map((s) => (s.url ? checkUrlLiveness(s.url) : Promise.resolve("failed" as const))),
    );

    // Persist sources to database and write report_references
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const fetchStatus = livenessResults[i];

      const existingSource = [...ctx.sources.values()].find(
        (s) => s.url === source.url,
      );

      // Avoid duplicate source rows for the same URL within this run
      const existing = source.url
        ? db.getSourceByUrlAndRunId(source.url, ctx.runId)
        : undefined;
      const sourceId = existing?.id ?? db.insertSource({
        run_id: ctx.runId,
        source_type: "web",
        url: source.url,
        title: existingSource?.title,
        snippet: existingSource?.snippet,
        fetch_status: fetchStatus,
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
