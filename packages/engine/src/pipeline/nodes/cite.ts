/**
 * Cite Pipeline Node
 *
 * Processes the synthesized report to convert inline [src: url] markers
 * into numbered footnotes and persists sources to the database.
 */

import type { PipelineContext } from "../context";
import type { CokiDatabase } from "../../db/database";
import { addCitations } from "../../citation/citation";

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

    // Persist sources to database
    for (const source of sources) {
      const existingSource = [...ctx.sources.values()].find(
        (s) => s.url === source.url,
      );

      db.insertSource({
        run_id: ctx.runId,
        source_type: "web",
        url: source.url,
        title: existingSource?.title,
        snippet: existingSource?.snippet,
        fetch_status: "ok",
      });
    }

    return { ...ctx, citedReport };
  };
}
