export interface TimelineLogRow {
  id: number;
  run_id: string;
  phase: string | null;
  event_type: string | null;
  message: string | null;
  details: string | null;
  level: string;
  created_at: string;
}

const LEVEL_MAP: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export function parseTimelineLogs(content: string, runId: string): TimelineLogRow[] {
  const entries = parseLogEntries(content);
  const linkedIntentRequestIds = new Set<string>();

  for (const entry of entries) {
    if (entry.runId !== runId) continue;
    if (entry.event === "research.start" && typeof entry.intentRequestId === "string") {
      linkedIntentRequestIds.add(entry.intentRequestId);
    }
  }

  const logs: TimelineLogRow[] = [];
  let id = 0;

  for (const entry of entries) {
    const isRunEntry = entry.runId === runId;
    const isLinkedIntentEntry =
      typeof entry.intentRequestId === "string" &&
      linkedIntentRequestIds.has(entry.intentRequestId);
    const isLinkedTraceEntry =
      typeof entry.traceId === "string" &&
      linkedIntentRequestIds.has(entry.traceId);

    if (!isRunEntry && !isLinkedIntentEntry && !isLinkedTraceEntry) continue;

    const { time, level: _level, pid, hostname, runId: _runId, msg, component, phase, ...rest } = entry;
    const details = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;

    logs.push({
      id: id++,
      run_id: runId,
      phase: stringOrNull(phase) ?? stringOrNull(component),
      event_type: stringOrNull(component),
      message: stringOrNull(msg),
      details,
      level: typeof _level === "number" ? LEVEL_MAP[_level] ?? "info" : "info",
      created_at: stringOrNull(time) ?? "",
    });
  }

  return logs;
}

function parseLogEntries(content: string): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === "object") {
        entries.push(entry as Record<string, unknown>);
      }
    } catch {
      // Skip unparseable lines from partial writes or external log noise.
    }
  }
  return entries;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
