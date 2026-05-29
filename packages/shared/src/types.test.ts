import { describe, it, expect } from "vitest";
import {
  IntentClarificationResultSchema,
  ResearchBriefSchema,
  ResearchOptionsSchema,
  RunReportSchema,
  RunStatusSchema,
  RunSummarySchema,
} from "./types";

describe("ResearchOptionsSchema", () => {
  it("accepts valid options", () => {
    const result = ResearchOptionsSchema.parse({ depth: 2, outputLanguage: "zh" });
    expect(result.depth).toBe(2);
    expect(result.outputLanguage).toBe("zh");
  });

  it("applies defaults", () => {
    const result = ResearchOptionsSchema.parse({});
    expect(result.depth).toBe(2);
    expect(result.outputLanguage).toBe("zh");
  });

  it("rejects depth out of range", () => {
    expect(() => ResearchOptionsSchema.parse({ depth: 0 })).toThrow();
    expect(() => ResearchOptionsSchema.parse({ depth: 4 })).toThrow();
  });

  it("rejects invalid language", () => {
    expect(() => ResearchOptionsSchema.parse({ outputLanguage: "fr" })).toThrow();
  });
});

describe("RunStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const status of ["pending", "running", "completed", "cancelled", "failed"]) {
      expect(RunStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => RunStatusSchema.parse("unknown")).toThrow();
  });
});

describe("RunSummarySchema", () => {
  it("accepts valid summary", () => {
    const summary = {
      id: "abc",
      userQuery: "test",
      depth: 2,
      status: "completed",
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: null,
      error: null,
    };
    expect(RunSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects missing required fields", () => {
    expect(() => RunSummarySchema.parse({ id: "abc" })).toThrow();
  });
});

describe("RunReportSchema", () => {
  it("accepts valid report", () => {
    const report = {
      id: "abc",
      userQuery: "test",
      depth: 2,
      status: "completed",
      researchPlan: null,
      citedReport: "report text",
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: "2025-01-01T00:01:00Z",
      sources: [{ id: "s1", url: "https://example.com", title: "Example", snippet: "text" }],
    };
    expect(RunReportSchema.parse(report)).toEqual(report);
  });

  it("accepts empty sources", () => {
    const report = {
      id: "abc",
      userQuery: "test",
      depth: 1,
      status: "pending",
      researchPlan: null,
      citedReport: null,
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: null,
      sources: [],
    };
    expect(RunReportSchema.parse(report)).toEqual(report);
  });
});

describe("ResearchBriefSchema", () => {
  it("accepts a confirmed research brief", () => {
    const brief = {
      originalQuery: "研究 AI Agent 的发展趋势",
      refinedQuestion: "研究 2024-2026 年 AI Agent 在技术演进和商业落地上的发展趋势",
      objective: "survey",
      audience: "technical",
      scope: {
        region: "global",
        timeRange: "2024-2026",
        target: "AI Agent",
      },
      sourcePreferences: ["academic", "industry", "official"],
      outputTemplate: "research_report",
      mustInclude: ["技术路线", "商业落地案例"],
      exclude: ["纯概念科普"],
      assumptions: ["默认同时覆盖中美市场"],
    };

    expect(ResearchBriefSchema.parse(brief)).toEqual(brief);
  });

  it("rejects invalid objective values", () => {
    expect(() =>
      ResearchBriefSchema.parse({
        originalQuery: "test",
        refinedQuestion: "test",
        objective: "chat",
        audience: "technical",
        scope: {},
        sourcePreferences: ["academic"],
        outputTemplate: "research_report",
        mustInclude: [],
        exclude: [],
        assumptions: [],
      }),
    ).toThrow();
  });
});

describe("IntentClarificationResultSchema", () => {
  it("accepts a needs_clarification result with one actionable question", () => {
    const result = {
      intentRequestId: "intent-123",
      status: "needs_clarification",
      round: 1,
      maxRounds: 3,
      clarity: {
        objectiveClear: false,
        scopeClear: false,
        audienceClear: true,
        sourceClear: false,
        outputClear: true,
        constraintsClear: true,
        confidence: 0.52,
        missingSlots: ["objective", "scope"],
      },
      brief: {
        originalQuery: "研究 AI Agent 的发展趋势",
        refinedQuestion: "研究 AI Agent 的发展趋势",
        objective: "survey",
        audience: "technical",
        scope: {},
        sourcePreferences: ["academic", "industry"],
        outputTemplate: "research_report",
        mustInclude: [],
        exclude: [],
        assumptions: ["默认输出综合研究报告"],
      },
      question: {
        id: "objective",
        text: "你更关注哪个研究角度？",
        reason: "这个选择会决定优先检索论文、行业报告还是投资资料。",
        options: [
          { id: "technical", label: "技术演进", value: "技术演进" },
          { id: "business", label: "商业落地", value: "商业落地" },
          { id: "default", label: "默认", value: "技术演进 + 商业落地", isDefault: true },
        ],
      },
    };

    expect(IntentClarificationResultSchema.parse(result)).toEqual(result);
  });

  it("accepts a high-impact clarification opportunity on an otherwise clear request", () => {
    const result = {
      status: "needs_clarification",
      round: 1,
      maxRounds: 3,
      clarity: {
        objectiveClear: true,
        scopeClear: true,
        audienceClear: true,
        sourceClear: true,
        outputClear: true,
        constraintsClear: true,
        confidence: 0.86,
        missingSlots: [],
      },
      clarificationOpportunity: {
        shouldAsk: true,
        impact: "high",
        reason: "The answer changes report structure and evidence selection.",
        missingResearchDecisions: ["output_form", "metric_operationalization"],
        defaultAssumption: "Default to literature review plus experiment design.",
      },
      brief: {
        originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
        refinedQuestion: "分析轮廓特征提取精准度对少样本目标检测性能的影响",
        objective: "evaluate",
        audience: "technical",
        scope: { target: "轮廓特征提取精准度与少样本目标检测性能" },
        sourcePreferences: ["academic"],
        outputTemplate: "technical_analysis",
        mustInclude: [],
        exclude: [],
        assumptions: [],
      },
      question: {
        id: "research_output",
        text: "这次研究你更希望偏哪种输出？",
        reason: "这会决定优先检索文献综述、实验方案还是评估指标资料。",
        options: [
          { id: "literature", label: "文献综述", value: "文献综述和机制分析" },
          { id: "experiment", label: "实验方案", value: "实验设计与可验证方案" },
          {
            id: "default",
            label: "默认",
            value: "文献综述 + 实验设计建议",
            isDefault: true,
          },
        ],
      },
    };

    expect(IntentClarificationResultSchema.parse(result)).toEqual(result);
  });
});
