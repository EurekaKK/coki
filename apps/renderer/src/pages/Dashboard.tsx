import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function Dashboard() {
  const { runId } = useParams<{ runId: string }>();
  const { phase, progress, logs, isRunning, error } = useAppStore();

  useEffect(() => {
    if (!runId) return;

    const unsubscribe = api.on.researchProgress((event: unknown) => {
      const e = event as { type: string; phase?: string; message?: string; progress?: number };
      if (e.type === "progress") {
        useAppStore.getState().setPhase(e.phase ?? "unknown");
        useAppStore.getState().setProgress(e.progress ?? 0);
        useAppStore.getState().addLog({
          level: "info",
          message: e.message ?? "",
          phase: e.phase ?? "unknown",
        });
      } else if (e.type === "error") {
        useAppStore.getState().setError(e.message ?? "Unknown error");
        useAppStore.getState().setIsRunning(false);
      } else if (e.type === "complete") {
        useAppStore.getState().setIsRunning(false);
      }
    });

    return unsubscribe;
  }, [runId]);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Research in Progress</h2>
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="font-medium">{phase}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
          {error}
        </div>
      )}
      <div className="border rounded-lg p-4 h-64 overflow-y-auto">
        <h3 className="font-medium mb-2">Log Stream</h3>
        {logs.map((log, i) => (
          <div key={i} className="text-sm py-1">
            <span className="text-gray-500">[{log.phase}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
