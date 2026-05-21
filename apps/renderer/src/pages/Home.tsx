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
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const navigate = useNavigate();
  const { initRun, setRunIsRunning } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    api.documents.getCollections().then(setCollections);
  }, []);

  const handleStart = async () => {
    if (!query.trim()) return;
    const cfg = await api.config.get();
    if (!cfg.llm.baseUrl || !cfg.llm.apiKeyConfigured || !cfg.llm.model || !cfg.tavily.apiKeyConfigured) {
      navigate("/settings");
      return;
    }
    const runId = await api.research.start(query, {
      depth,
      collectionIds: selectedCollections.length > 0 ? selectedCollections : undefined,
    });
    initRun(runId);
    setRunIsRunning(runId, true);
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

      {/* Collection selector */}
      {collections.length > 0 && (
        <div
          className={cn(
            "w-full mt-4 transition-all duration-500 ease-out delay-300",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          )}
        >
          <label className="text-sm font-medium text-muted-foreground mb-2 block">关联知识库（可选，多选）</label>
          <div className="flex flex-wrap gap-2">
            {collections.map((c) => {
              const checked = selectedCollections.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-all duration-200 border",
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => {
                      setSelectedCollections((prev) =>
                        checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      );
                    }}
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

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
