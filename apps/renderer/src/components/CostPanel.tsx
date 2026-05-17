import { useState, useEffect } from "react";

const api = (window as any).coki;

interface CostSummary {
  totalInput: number;
  totalOutput: number;
  totalLatency: number;
  callCount: number;
  byPhase: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
}

export function CostPanel({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CostSummary | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    api.research.costSummary(runId).then(setData);
  }, [open, runId]);

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
    String(n);

  const formatMs = (ms: number) =>
    ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` :
    ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` :
    `${ms}ms`;

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        <span>Cost &amp; Tokens</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && data && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-semibold">{formatTokens(data.totalInput + data.totalOutput)}</div>
              <div className="text-xs text-gray-500">Total Tokens</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{data.callCount}</div>
              <div className="text-xs text-gray-500">LLM Calls</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{formatMs(data.totalLatency)}</div>
              <div className="text-xs text-gray-500">Total Latency</div>
            </div>
          </div>
          {Object.keys(data.byPhase).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left py-1">Phase</th>
                  <th className="text-right py-1">Calls</th>
                  <th className="text-right py-1">Input</th>
                  <th className="text-right py-1">Output</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byPhase).map(([phase, stats]) => (
                  <tr key={phase} className="border-t">
                    <td className="py-1">{phase}</td>
                    <td className="text-right">{stats.calls}</td>
                    <td className="text-right">{formatTokens(stats.inputTokens)}</td>
                    <td className="text-right">{formatTokens(stats.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {open && !data && (
        <div className="px-4 pb-4 text-sm text-gray-400">Loading...</div>
      )}
    </div>
  );
}
