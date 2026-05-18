import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEPTH_OPTIONS = [
  { value: 1, label: "快速", desc: "概览式研究" },
  { value: 2, label: "平衡", desc: "标准深度" },
  { value: 3, label: "深度", desc: "全面分析" },
] as const;

export function Home() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { setCurrentRunId, setIsRunning, reset } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = async () => {
    if (!query.trim()) return;
    reset();
    setIsRunning(true);
    const runId = await api.research.start(query, { depth });
    setCurrentRunId(runId);
    navigate(`/dashboard/${runId}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-xl mx-auto px-8 py-16">
      {/* Title */}
      <div
        className={cn(
          "text-center transition-all duration-500 ease-out",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <h1 className="text-[28px] font-bold tracking-tight mb-2">Coki</h1>
        <p className="text-[15px] text-muted-foreground">深度研究，由 AI 驱动</p>
      </div>

      {/* Input */}
      <div
        className={cn(
          "w-full mt-12 transition-all duration-500 ease-out delay-100",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <Textarea
          placeholder="输入研究主题，例如：AI Agent 发展趋势..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[120px] text-[15px] leading-relaxed"
        />
      </div>

      {/* Depth selector */}
      <div
        className={cn(
          "flex gap-2 mt-6 transition-all duration-500 ease-out delay-200",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        {DEPTH_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDepth(opt.value)}
            className={cn(
              "px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200",
              depth === opt.value
                ? "bg-primary text-primary-foreground scale-[1.02]"
                : "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Start button */}
      <div
        className={cn(
          "w-full mt-6 transition-all duration-500 ease-out delay-300",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <Button
          size="lg"
          className="w-full h-12 text-base"
          onClick={handleStart}
          disabled={!query.trim()}
        >
          开始研究
        </Button>
      </div>
    </div>
  );
}
