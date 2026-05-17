import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const api = (window as any).coki;

interface TraceLog {
  id: number;
  run_id: string;
  phase: string | null;
  event_type: string | null;
  message: string | null;
  details: string | null;
  level: string;
  created_at: string;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "bg-gray-200 text-gray-600",
  info: "bg-blue-100 text-blue-700",
  warn: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

const PHASE_ORDER = ["init", "plan", "split", "subagents", "reflection", "synthesize", "extract-claims", "cite"];

export function Timeline() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<TraceLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!runId) return;
    api.research.timeline(runId).then(setLogs);
  }, [runId]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Group logs by phase
  const grouped: Record<string, TraceLog[]> = {};
  for (const log of logs) {
    const phase = log.phase ?? "unknown";
    if (!grouped[phase]) grouped[phase] = [];
    grouped[phase].push(log);
  }

  const sortedPhases = PHASE_ORDER.filter((p) => grouped[p]);
  // Add any phases not in PHASE_ORDER
  for (const p of Object.keys(grouped)) {
    if (!sortedPhases.includes(p)) sortedPhases.push(p);
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Timeline</h1>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Back
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="text-gray-400">No trace logs found.</p>
      ) : (
        <div className="space-y-6">
          {sortedPhases.map((phase) => (
            <div key={phase}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {phase}
              </h2>
              <div className="border-l-2 border-gray-200 ml-2 space-y-1">
                {grouped[phase].map((log) => (
                  <div key={log.id} className="pl-4 relative">
                    <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-gray-300" />
                    <div
                      className="cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                      onClick={() => toggle(log.id)}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-gray-400 font-mono">
                          {formatTime(log.created_at)}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_COLORS[log.level] ?? "bg-gray-100"}`}
                        >
                          {log.level}
                        </span>
                        {log.event_type && (
                          <span className="text-xs text-gray-500">{log.event_type}</span>
                        )}
                        <span className="text-gray-700">{log.message}</span>
                      </div>
                      {expanded.has(log.id) && log.details && (
                        <pre className="mt-1 text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(log.details), null, 2);
                            } catch {
                              return log.details;
                            }
                          })()}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
