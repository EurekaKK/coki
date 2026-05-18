import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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

const LEVEL_VARIANTS: Record<string, "default" | "secondary" | "warning" | "destructive"> = {
  debug: "secondary",
  info: "secondary",
  warn: "warning",
  error: "destructive",
};

const PHASE_ORDER = ["init", "plan", "split", "subagents", "reflection", "synthesize", "extract-claims", "cite"];

const PHASE_LABELS: Record<string, string> = {
  init: "初始化",
  plan: "计划",
  split: "拆分",
  subagents: "子代理",
  reflection: "反思",
  synthesize: "综合",
  "extract-claims": "提取论点",
  cite: "引用",
};

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

  const grouped: Record<string, TraceLog[]> = {};
  for (const log of logs) {
    const phase = log.phase ?? "unknown";
    if (!grouped[phase]) grouped[phase] = [];
    grouped[phase].push(log);
  }

  const sortedPhases = PHASE_ORDER.filter((p) => grouped[p]);
  for (const p of Object.keys(grouped)) {
    if (!sortedPhases.includes(p)) sortedPhases.push(p);
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  };

  return (
    <div className="max-w-[800px] mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight">时间线</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">暂无追踪日志</p>
      ) : (
        <div className="space-y-8">
          {sortedPhases.map((phase) => (
            <div key={phase}>
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {PHASE_LABELS[phase] ?? phase}
              </h2>
              <div className="relative pl-4">
                {/* Timeline line */}
                <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-border" />

                <div className="space-y-1">
                  {grouped[phase].map((log) => (
                    <div key={log.id} className="relative pl-5">
                      {/* Dot */}
                      <div
                        className="absolute left-0 top-[10px] w-[10px] h-[10px] rounded-full bg-primary"
                        style={{
                          boxShadow: `0 0 0 3px var(--background), 0 0 0 4px var(--border)`,
                        }}
                      />

                      <div
                        className="cursor-pointer rounded-lg px-3 py-2 hover:bg-secondary transition-colors duration-150"
                        onClick={() => toggle(log.id)}
                      >
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="text-muted-foreground font-mono shrink-0 w-[72px]">
                            {formatTime(log.created_at)}
                          </span>
                          <Badge variant={LEVEL_VARIANTS[log.level] ?? "secondary"} className="text-[11px] py-0 h-5">
                            {log.level}
                          </Badge>
                          {log.event_type && (
                            <span className="text-muted-foreground">{log.event_type}</span>
                          )}
                          <span className="text-foreground flex-1">{log.message}</span>
                          {log.details && (
                            <span className="text-muted-foreground">
                              {expanded.has(log.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>
                          )}
                        </div>

                        {expanded.has(log.id) && log.details && (
                          <Card className="mt-2 p-3 bg-secondary/50 border-none">
                            <pre className="text-[12px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(log.details), null, 2);
                                } catch {
                                  return log.details;
                                }
                              })()}
                            </pre>
                          </Card>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
