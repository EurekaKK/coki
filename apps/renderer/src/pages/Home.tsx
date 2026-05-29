import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import type { IntentAnswer, IntentClarificationResult, ResearchBrief } from "@coki/shared";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canSubmitCustomClarificationAnswer,
  getClarificationStatus,
  getResearchStartLabel,
  normalizeCustomClarificationAnswer,
  shouldStartResearchAfterClarification,
} from "./home-flow";

const DEPTH_OPTIONS = [
  { value: 1, label: "快速", desc: "概览式研究" },
  { value: 2, label: "平衡", desc: "标准深度" },
  { value: 3, label: "深度", desc: "全面分析" },
] as const;

const CLARIFICATION_SLOW_NOTICE_MS = 8_000;

export function Home() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const [mounted, setMounted] = useState(false);
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [intentResult, setIntentResult] = useState<IntentClarificationResult | null>(null);
  const [intentHistory, setIntentHistory] = useState<IntentAnswer[]>([]);
  const [clarifying, setClarifying] = useState(false);
  const [clarificationSlow, setClarificationSlow] = useState(false);
  const [customClarificationAnswer, setCustomClarificationAnswer] = useState("");
  const navigate = useNavigate();
  const { initRun, setRunIsRunning } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    api.documents.getCollections().then(setCollections);
  }, []);

  useEffect(() => {
    if (!clarifying) {
      setClarificationSlow(false);
      return;
    }

    const timer = setTimeout(() => {
      setClarificationSlow(true);
    }, CLARIFICATION_SLOW_NOTICE_MS);

    return () => clearTimeout(timer);
  }, [clarifying]);

  const startResearch = async (brief?: ResearchBrief, intentRequestId?: string) => {
    if (!query.trim()) return;
    const cfg = await api.config.get();
    if (!cfg.llm.baseUrl || !cfg.llm.apiKeyConfigured || !cfg.llm.model || !cfg.tavily.apiKeyConfigured) {
      navigate("/settings");
      return;
    }
    const runId = await api.research.start(query, {
      depth,
      collectionIds: selectedCollections.length > 0 ? selectedCollections : undefined,
      researchBrief: brief,
      intentRequestId,
    });
    initRun(runId);
    setRunIsRunning(runId, true);
    navigate(`/dashboard/${runId}`);
  };

  const handleStart = async () => {
    if (!query.trim()) return;

    const cfg = await api.config.get();
    if (!cfg.llm.baseUrl || !cfg.llm.apiKeyConfigured || !cfg.llm.model || !cfg.tavily.apiKeyConfigured) {
      navigate("/settings");
      return;
    }

    if (intentResult?.status === "clear") {
      await startResearch(intentResult.brief, intentResult.intentRequestId);
      return;
    }

    setClarifying(true);
    try {
      const result = await api.intent.clarify({
        originalQuery: query.trim(),
        history: intentHistory,
        maxRounds: 3,
        outputLanguage: "zh",
      }) as IntentClarificationResult;
      setIntentResult(result);
      if (shouldStartResearchAfterClarification(result)) {
        await startResearch(result.brief, result.intentRequestId);
      }
    } catch (error) {
      console.error("Intent clarification failed; starting research without a brief.", error);
      if (shouldStartResearchAfterClarification({ failed: true })) {
        await startResearch();
      }
    } finally {
      setClarifying(false);
    }
  };

  const handleClarificationAnswer = async (answer: string, questionId: string, question: string) => {
    const nextHistory = [...intentHistory, { questionId, question, answer }];
    setIntentHistory(nextHistory);
    setCustomClarificationAnswer("");
    setClarifying(true);
    try {
      const result = await api.intent.clarify({
        originalQuery: query.trim(),
        history: nextHistory,
        maxRounds: 3,
        outputLanguage: "zh",
      }) as IntentClarificationResult;
      setIntentResult(result);
      if (shouldStartResearchAfterClarification(result)) {
        await startResearch(result.brief, result.intentRequestId);
      }
    } catch (error) {
      console.error("Intent clarification failed after an answer; starting research with the current brief.", error);
      if (shouldStartResearchAfterClarification({ failed: true })) {
        await startResearch(intentResult?.brief, intentResult?.intentRequestId);
      }
    } finally {
      setClarifying(false);
    }
  };

  const resetClarification = () => {
    setIntentResult(null);
    setIntentHistory([]);
    setCustomClarificationAnswer("");
  };

  const handleCustomClarificationSubmit = () => {
    if (!intentResult?.question) return;
    if (!canSubmitCustomClarificationAnswer(customClarificationAnswer, clarifying)) return;

    handleClarificationAnswer(
      normalizeCustomClarificationAnswer(customClarificationAnswer),
      intentResult.question.id,
      intentResult.question.text,
    );
  };

  const clarificationStatus = getClarificationStatus({
    clarifying,
    hasIntentResult: !!intentResult,
    hasHistory: intentHistory.length > 0,
    slow: clarificationSlow,
  });

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
          onChange={(e) => {
            setQuery(e.target.value);
            resetClarification();
          }}
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

      {/* Intent clarification */}
      {clarificationStatus && (
        <div
          className={cn(
            "w-full mt-5 rounded-2xl border border-border bg-secondary/50 p-4 transition-all duration-500 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">
                {clarificationStatus.title}
              </div>
              <div className="text-[13px] text-muted-foreground mt-1">
                {clarificationStatus.description}
              </div>
            </div>
          </div>
          <button
            className="mt-3 text-[13px] text-primary hover:underline"
            onClick={() => startResearch()}
          >
            跳过，直接开始研究
          </button>
        </div>
      )}

      {intentResult?.status === "needs_clarification" && intentResult.question && (
        <div
          className={cn(
            "w-full mt-5 rounded-2xl border border-border bg-secondary/50 p-4 transition-all duration-500 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          )}
        >
          <div className="text-[13px] font-medium text-muted-foreground mb-1">
            需要确认研究方向
          </div>
          <div className="text-[15px] font-semibold text-foreground">
            {intentResult.question.text}
          </div>
          <div className="text-[13px] text-muted-foreground mt-1">
            {intentResult.question.reason}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {intentResult.question.options.map((option) => (
              <button
                key={option.id}
                onClick={() =>
                  handleClarificationAnswer(
                    option.value,
                    intentResult.question!.id,
                    intentResult.question!.text,
                  )
                }
                disabled={clarifying}
                className="px-3 py-1.5 rounded-full bg-background border border-border text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Textarea
              placeholder="也可以自己输入研究方向、范围或输出要求..."
              value={customClarificationAnswer}
              onChange={(e) => setCustomClarificationAnswer(e.target.value)}
              disabled={clarifying}
              className="min-h-[72px] text-sm leading-relaxed bg-background"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCustomClarificationSubmit}
                disabled={!canSubmitCustomClarificationAnswer(customClarificationAnswer, clarifying)}
              >
                提交自定义回答
              </Button>
            </div>
          </div>
          <button
            className="mt-3 text-[13px] text-muted-foreground hover:text-foreground"
            onClick={() => startResearch(intentResult.brief, intentResult.intentRequestId)}
            disabled={clarifying}
          >
            跳过澄清，按当前默认设定开始
          </button>
        </div>
      )}

      {intentResult?.status === "clear" && intentHistory.length > 0 && (
        <div
          className={cn(
            "w-full mt-5 rounded-2xl border border-border bg-secondary/50 p-4 transition-all duration-500 ease-out",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          )}
        >
          <div className="text-[13px] font-medium text-muted-foreground mb-1">
            研究设定已明确
          </div>
          <div className="text-[15px] font-semibold text-foreground">
            {intentResult.brief.refinedQuestion}
          </div>
          <div className="mt-3 grid gap-1.5 text-[13px] text-muted-foreground">
            <div>目标：{intentResult.brief.objective}</div>
            <div>受众：{intentResult.brief.audience}</div>
            <div>模板：{intentResult.brief.outputTemplate}</div>
            {intentResult.brief.sourcePreferences.length > 0 && (
              <div>来源：{intentResult.brief.sourcePreferences.join(" / ")}</div>
            )}
            {intentResult.brief.assumptions.length > 0 && (
              <div>默认假设：{intentResult.brief.assumptions.join("；")}</div>
            )}
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
          disabled={!query.trim() || clarifying}
        >
          {getResearchStartLabel({
            clarifying,
            isClear: intentResult?.status === "clear",
          })}
        </Button>
      </div>
    </div>
  );
}
