import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Clock } from "lucide-react";

interface RunSummary {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "destructive" },
  running: { label: "进行中", variant: "warning" },
};

const DEPTH_LABELS: Record<number, string> = {
  1: "快速",
  2: "平衡",
  3: "深度",
};

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.research.history().then((data: unknown) => {
      setRuns(data as RunSummary[]);
    });
  }, []);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full max-w-[720px] mx-auto px-8 py-16">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
          <FileText className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-[17px] font-semibold mb-2">暂无研究记录</h2>
        <p className="text-[15px] text-muted-foreground mb-6">开始你的第一次深度研究</p>
        <Button onClick={() => navigate("/")}>开始新研究</Button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-8 py-8">
      <h2 className="text-[22px] font-semibold tracking-tight mb-6">历史记录</h2>
      <div className="space-y-3">
        {runs.map((run) => (
          <Card
            key={run.id}
            className="p-5 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-border/80"
            onClick={() => navigate(`/report/${run.id}`)}
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
              <Badge variant={STATUS_MAP[run.status]?.variant ?? "secondary"}>
                {STATUS_MAP[run.status]?.label ?? run.status}
              </Badge>
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
                  查看时间线
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
