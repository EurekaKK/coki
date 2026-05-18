import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

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
    <Card className="border-none shadow-none bg-transparent">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary rounded-xl transition-colors duration-150">
          <span>成本与令牌</span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {data ? (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">
                    {formatTokens(data.totalInput + data.totalOutput)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">总令牌数</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">{data.callCount}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">LLM 调用</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">
                    {formatMs(data.totalLatency)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">总耗时</div>
                </div>
              </div>

              {Object.keys(data.byPhase).length > 0 && (
                <div className="rounded-xl bg-secondary overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
                        <th className="text-left py-2.5 px-4">阶段</th>
                        <th className="text-right py-2.5 px-4">调用</th>
                        <th className="text-right py-2.5 px-4">输入</th>
                        <th className="text-right py-2.5 px-4">输出</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.byPhase).map(([phase, stats]) => (
                        <tr key={phase} className="border-t border-border/50">
                          <td className="py-2 px-4 text-foreground">{phase}</td>
                          <td className="text-right py-2 px-4">{stats.calls}</td>
                          <td className="text-right py-2 px-4">{formatTokens(stats.inputTokens)}</td>
                          <td className="text-right py-2 px-4">{formatTokens(stats.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 pb-4 text-sm text-muted-foreground">加载中...</div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
