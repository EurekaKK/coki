/**
 * Paragraph-importance-based report compression.
 *
 * When the combined size of subagent reports exceeds a budget, trim
 * lower-importance paragraphs while preserving citation-dense and
 * data-dense paragraphs intact.
 *
 * Ported from the original Deep-Research-Agent's _trim_reports_by_whole.
 */

import type { SubagentReport, Subtask } from "../pipeline/context";

interface ScoredParagraph {
  reportIdx: number;
  paraIdx: number;
  score: number;
  text: string;
}

const TRANSITIONAL_RE = /^(综上所述|总之|因此|此外|另外|首先|其次|再次|最后|in summary|in conclusion|moreover|furthermore|additionally|finally)[，,：:]/i;

function scoreParagraph(para: string, paraIdx: number): number {
  let score = 0;
  if (/\[src:\s*https?:/.test(para)) score += 3;
  if (/\b(19|20)\d{2}\b|\d+(\.\d+)?%|\$\d|￥\d|```/.test(para)) score += 2;
  if (/^#+\s/.test(para)) score += 2;
  if (paraIdx < 2) score += 1;
  if (TRANSITIONAL_RE.test(para)) score -= 1;
  return score;
}

/**
 * Compress a single report's paragraphs to fit within a character budget.
 * Returns the compressed report text with paragraphs in original order.
 */
export function compressReport(report: string, maxChars: number): string {
  if (report.length <= maxChars) return report;

  const paras = report.split(/\n{2,}/);
  if (paras.length <= 1) return report.slice(0, maxChars);

  const scored: ScoredParagraph[] = paras.map((text, paraIdx) => ({
    reportIdx: 0,
    paraIdx,
    score: scoreParagraph(text, paraIdx),
    text,
  }));

  const ordered = [...scored].sort((a, b) => b.score - a.score);

  const kept = new Set<number>();
  let total = 0;
  for (const p of ordered) {
    if (total + p.text.length + 2 > maxChars) continue;
    kept.add(p.paraIdx);
    total += p.text.length + 2;
  }

  return scored
    .filter((p) => kept.has(p.paraIdx))
    .map((p) => p.text)
    .join("\n\n");
}

/**
 * Render multiple subagent reports as a single string, compressing if
 * the combined size exceeds the budget. Section headings come from the
 * subtask instructions, not their UUIDs.
 */
export function compressReports(
  reports: SubagentReport[],
  subtasks: Subtask[],
  maxChars: number,
): string {
  const subtaskById = new Map(subtasks.map((s) => [s.id, s]));
  const rendered = reports.map((r) => {
    const subtask = subtaskById.get(r.subtaskId);
    const heading = subtask?.instruction ?? `Subtask ${r.subtaskId}`;
    return { heading, report: r.report };
  });

  const total = rendered.reduce((s, r) => s + r.report.length + r.heading.length + 10, 0);
  if (total <= maxChars) {
    return rendered.map((r) => `## ${r.heading}\n\n${r.report}`).join("\n\n---\n\n");
  }

  // Allocate budget proportionally to each report's length
  const perReportBudget = Math.floor(maxChars / Math.max(1, rendered.length));
  const compressed = rendered.map(({ heading, report }) => {
    const body = report.length > perReportBudget ? compressReport(report, perReportBudget) : report;
    return `## ${heading}\n\n${body}`;
  });

  return compressed.join("\n\n---\n\n");
}
