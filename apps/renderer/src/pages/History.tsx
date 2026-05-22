import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { FileText, Clock, Trash2, X, AlertCircle, Search } from "lucide-react";

interface RunSummary {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  created_at: string;
}

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

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "destructive" },
  running: { label: "进行中", variant: "warning" },
  cancelled: { label: "已取消", variant: "secondary" },
};

const DEPTH_LABELS: Record<number, string> = {
  1: "快速",
  2: "平衡",
  3: "深度",
};

const LEVEL_ORDER = ["fatal", "error", "warn", "info", "debug", "trace"];

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [failedLogs, setFailedLogs] = useState<TraceLog[]>([]);
  const [failedRunQuery, setFailedRunQuery] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const filteredRuns = searchQuery.trim()
    ? runs.filter((run) =>
        run.user_query.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : runs;

  const loadRuns = async () => {
    const data = await api.research.history();
    setRuns((data as RunSummary[]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleDelete = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    if (!confirm("确定要删除这条研究记录吗？相关数据将全部清除。")) return;
    await api.research.delete(runId);
    await loadRuns();
  };

  const handleCardClick = async (run: RunSummary) => {
    if (run.status === "running") {
      navigate(`/dashboard/${run.id}`);
    } else if (run.status === "failed") {
      const logs: TraceLog[] = await api.research.timeline(run.id);
      const warnPlus = logs.filter((l) => ["warn", "error", "fatal"].includes(l.level));
      setFailedLogs(warnPlus);
      setFailedRunQuery(run.user_query);
      setShowModal(true);
    } else {
      navigate(`/report/${run.id}`);
    }
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
        <FileText className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="text-[17px] font-semibold mb-2">暂无研究记录</h2>
      <p className="text-[15px] text-muted-foreground mb-6">开始你的第一次深度研究</p>
      <Button onClick={() => navigate("/")}>开始新研究</Button>
    </div>
  );

  const noMatchState = (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
        <Search className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="text-[17px] font-semibold mb-2">未找到匹配记录</h2>
      <p className="text-[15px] text-muted-foreground">换个关键词试试</p>
    </div>
  );

  if (runs.length === 0) {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-16">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[22px] font-semibold tracking-tight">历史记录</h2>
      </div>
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="搜索报告标题..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {filteredRuns.length === 0 ? (
        noMatchState
      ) : (
        <div className="space-y-3">
          {filteredRuns.map((run) => (
          <Card
            key={run.id}
            className="p-5 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-border/80 group"
            onClick={() => handleCardClick(run)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground truncate">
                  {run.user_query}
                </h3>
                <div className="flex items-center gap-3 mt-1.5 text-[13px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(run.created_at).toLocaleDateString("zh-CN")}
                  </span>
                  <span>{DEPTH_LABELS[run.depth] ?? `深度 ${run.depth}`}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_MAP[run.status]?.variant ?? "secondary"}>
                  {STATUS_MAP[run.status]?.label ?? run.status}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDelete(e, run.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
            {run.status === "completed" && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <button
                  className="text-[13px] text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/timeline/${run.id}`);
                  }}
                >
                  查看日志
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
      )}

      {/* Failed task logs modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-background rounded-2xl border shadow-2xl w-full max-w-[640px] max-h-[80vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <h3 className="text-[15px] font-semibold">任务失败日志</h3>
              </div>
              <button
                className="p-1 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setShowModal(false)}
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-2 border-b border-border/50 bg-secondary/30">
              <p className="text-[13px] text-muted-foreground truncate">{failedRunQuery}</p>
            </div>
            <ScrollArea className="flex-1 px-6 py-4">
              {failedLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">暂无 warn 及以上级别的日志</p>
              ) : (
                <div className="space-y-2">
                  {failedLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 text-[12px] font-mono py-1.5 px-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <span className="text-muted-foreground shrink-0 w-[72px]">
                        {new Date(log.created_at).toLocaleTimeString("zh-CN", { hour12: false })}
                      </span>
                      <Badge
                        variant={
                          log.level === "fatal" || log.level === "error"
                            ? "destructive"
                            : log.level === "warn"
                              ? "warning"
                              : "secondary"
                        }
                        className="text-[10px] py-0 h-4 shrink-0"
                      >
                        {log.level}
                      </Badge>
                      <span className="text-muted-foreground shrink-0">[{log.phase ?? "unknown"}]</span>
                      <span className="text-foreground">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
