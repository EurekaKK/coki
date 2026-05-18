import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

export function Dashboard() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { phase, progress, logs, isRunning, error } = useAppStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

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
        navigate(`/report/${runId}`);
      }
    });

    return unsubscribe;
  }, [runId, navigate]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col items-center min-h-full max-w-[680px] mx-auto px-8 py-12">
      {/* Header */}
      <div className="w-full flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight">正在研究</h2>
          <p className="text-[15px] text-muted-foreground mt-1">
            {useAppStore.getState().currentRunId ? "研究任务执行中..." : ""}
          </p>
        </div>
        <Badge variant="default" className="mt-1">
          {phase}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full mb-8">
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{
              width: `${progress}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        <div className="mt-2 text-[13px] font-medium text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="w-full mb-6 border-l-4 border-l-destructive bg-[rgba(255,59,48,0.06)] dark:bg-[rgba(255,69,58,0.08)]">
          <div className="p-4 text-sm text-foreground">{error}</div>
        </Card>
      )}

      {/* Log stream */}
      <Card className="w-full flex-1 min-h-[320px]">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">
            执行日志
          </h3>
        </div>
        <ScrollArea className="h-[320px]">
          <div className="p-4 space-y-2">
            {logs.map((log, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-[13px] font-mono py-1 px-2 rounded-lg hover:bg-secondary transition-colors duration-150"
              >
                <span className="text-muted-foreground shrink-0 w-[80px]">
                  [{log.phase}]
                </span>
                <span className="text-muted-foreground">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
