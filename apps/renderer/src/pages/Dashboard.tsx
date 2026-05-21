import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/app-store";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

export function Dashboard() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const run = useAppStore((state) => state.getRun(runId ?? ""));
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wasRunningRef = useRef(run.isRunning);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.logs]);

  useEffect(() => {
    if (!runId) return;
    if (wasRunningRef.current && !run.isRunning && !run.error && run.logs.length > 0) {
      navigate(`/report/${runId}`);
    }
    wasRunningRef.current = run.isRunning;
  }, [runId, run.isRunning, run.error, run.logs.length, navigate]);

  return (
    <div className="flex flex-col items-center min-h-full max-w-[680px] mx-auto px-8 py-12">
      {/* Header */}
      <div className="w-full flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight">正在研究</h2>
          <p className="text-[15px] text-muted-foreground mt-1">
            {runId ? "研究任务执行中..." : ""}
          </p>
        </div>
        <Badge variant="default" className="mt-1">
          {run.phase}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full mb-8">
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{
              width: `${run.progress}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        <div className="mt-2 text-[13px] font-medium text-muted-foreground">
          {Math.round(run.progress)}%
        </div>
      </div>

      {/* Error */}
      {run.error && (
        <Card className="w-full mb-6 border-l-4 border-l-destructive bg-[rgba(255,59,48,0.06)] dark:bg-[rgba(255,69,58,0.08)]">
          <div className="p-4 text-sm text-foreground">{run.error}</div>
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
            {run.logs.map((log, i) => (
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
