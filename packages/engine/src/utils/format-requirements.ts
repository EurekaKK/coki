/**
 * Natural-language formatter for ResearchRequirements.
 *
 * Important: do NOT serialize requirements as JSON when injecting into LLM
 * prompts. JSON-shaped requirement blocks have been observed to trigger
 * provider-side "compliance review" pattern filters on some Chinese gateways
 * (notably mimo), which return a generic rejection template instead of running
 * the actual model. Natural prose avoids this entirely.
 */

import type { ResearchRequirements } from "../pipeline/context";

export function formatRequirements(req: ResearchRequirements | undefined | null): string {
  if (!req) return "(none extracted)";

  const lines: string[] = [];

  if (req.coreObjectives?.length) {
    lines.push(`- Core objectives: ${req.coreObjectives.join("; ")}`);
  }
  if (req.explicitRequirements?.length) {
    lines.push(`- Explicit requirements:\n  ${req.explicitRequirements.map((r) => `· ${r}`).join("\n  ")}`);
  }

  const scope = req.scopeConstraints ?? {};
  const scopeParts = [
    scope.region && `region=${scope.region}`,
    scope.time && `time=${scope.time}`,
    scope.target && `target=${scope.target}`,
  ].filter(Boolean);
  if (scopeParts.length) {
    lines.push(`- Scope constraints: ${scopeParts.join(", ")}`);
  }

  if (req.subQuestions?.length) {
    lines.push(`- Sub-questions to answer:\n  ${req.subQuestions.map((q) => `· ${q}`).join("\n  ")}`);
  }

  return lines.length ? lines.join("\n") : "(none extracted)";
}
