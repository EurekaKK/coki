/**
 * Cite Pipeline Node
 *
 * Processes the synthesized report to convert inline [src: url] markers
 * into numbered footnotes and persists sources to the database.
 */

import { randomUUID } from "node:crypto";
import type { PipelineContext } from "../context";
import type { CokiDatabase } from "../../db/database";
import { addCitations } from "../../citation/citation";

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

    return { ...ctx, citedReport };
  };
}
