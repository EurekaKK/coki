import { describe, expect, it } from "vitest";
import type { IntentClarificationResult, ResearchBrief } from "@coki/shared";
import {
  buildIntentClarificationDoneLog,
  buildIntentClarificationStartLog,
  buildResearchStartLog,
} from "./observability";

const brief: ResearchBrief = {
  originalQuery: "java后端和ai应用开发前途对比分析",
  refinedQuestion: "对比 2026 年中国就业市场中 Java 后端和 AI 应用开发的职业前途",
  objective: "compare",
  audience: "general",
  scope: {
    region: "中国",
    timeRange: "2026",
    target: "Java 后端和 AI 应用开发",
  },
  sourcePreferences: ["industry", "data"],
  outputTemplate: "decision_memo",
  mustInclude: ["岗位需求", "薪资", "成长路径"],
  exclude: ["培训广告"],
  assumptions: ["默认面向求职决策场景。"],
};

describe("intent observability logs", () => {
  it("captures the clarification input and round state", () => {
    const log = buildIntentClarificationStartLog({
      intentRequestId: "intent-1",
      originalQuery: brief.originalQuery,
      history: [{ questionId: "audience", question: "面向谁？", answer: "求职者" }],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(log).toEqual({
      component: "intent",
      event: "intent.clarify.start",
      intentRequestId: "intent-1",
      query: brief.originalQuery,
      queryLength: 19,
      historyCount: 1,
      maxRounds: 3,
      outputLanguage: "zh",
    });
  });

  it("captures the clarification decision, latency, question, and brief summary", () => {
    const result: IntentClarificationResult = {
      status: "needs_clarification",
      round: 1,
      maxRounds: 3,
      clarity: {
        objectiveClear: true,
        scopeClear: false,
        audienceClear: true,
        sourceClear: true,
        outputClear: true,
        constraintsClear: false,
        confidence: 0.61,
        missingSlots: ["scope", "constraints"],
      },
      clarificationOpportunity: {
        shouldAsk: true,
        impact: "high",
        reason: "输出形式会改变研究结构。",
        missingResearchDecisions: ["output_form"],
        defaultAssumption: "默认输出技术分析报告。",
      },
      brief,
      question: {
        id: "scope",
        text: "希望聚焦哪个地区？",
        reason: "地区不同会改变就业数据和来源选择。",
        options: [
          { id: "china", label: "中国", value: "中国", isDefault: true },
          { id: "global", label: "全球", value: "全球" },
        ],
      },
    };

    const log = buildIntentClarificationDoneLog({
      intentRequestId: "intent-1",
      latencyMs: 1234,
      result,
    });

    expect(log).toMatchObject({
      component: "intent",
      event: "intent.clarify.done",
      intentRequestId: "intent-1",
      latencyMs: 1234,
      status: "needs_clarification",
      round: 1,
      maxRounds: 3,
      confidence: 0.61,
      missingSlots: ["scope", "constraints"],
      opportunityShouldAsk: true,
      opportunityImpact: "high",
      opportunityReason: "输出形式会改变研究结构。",
      opportunityMissingResearchDecisions: ["output_form"],
      opportunityDefaultAssumption: "默认输出技术分析报告。",
      questionId: "scope",
      optionCount: 2,
      defaultOptionId: "china",
      hasResearchBrief: true,
      refinedQuestion: brief.refinedQuestion,
      objective: "compare",
      audience: "general",
      outputTemplate: "decision_memo",
    });
  });

  it("links a research run back to the clarification request and confirmed brief", () => {
    const log = buildResearchStartLog({
      runId: "run-1",
      intentRequestId: "intent-1",
      query: brief.originalQuery,
      depth: 2,
      outputLanguage: "zh",
      collectionIds: ["collection-a"],
      researchBrief: brief,
    });

    expect(log).toMatchObject({
      runId: "run-1",
      component: "research",
      event: "research.start",
      intentRequestId: "intent-1",
      query: brief.originalQuery,
      depth: 2,
      outputLanguage: "zh",
      collectionCount: 1,
      hasResearchBrief: true,
      refinedQuestion: brief.refinedQuestion,
      sourcePreferences: ["industry", "data"],
    });
  });
});
