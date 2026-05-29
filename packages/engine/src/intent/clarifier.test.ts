import { describe, expect, it } from "vitest";
import { clarifyResearchIntent, formatResearchBriefForPrompt } from "./clarifier";

class FakeLLM {
  calls: Array<{
    prompt?: string;
    system?: string;
    role?: string;
    maxTokens?: number;
    thinking?: boolean;
    abortSignal?: AbortSignal;
  }> = [];

  constructor(private responses: Array<string | { text: string; stopReason?: string }>) {}

  async generate(opts: {
    prompt?: string;
    system?: string;
    role?: string;
    maxTokens?: number;
    thinking?: boolean;
    abortSignal?: AbortSignal;
  }) {
    this.calls.push(opts);
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response configured");
    if (typeof response === "string") return { text: response };
    return response;
  }
}

class HangingLLM extends FakeLLM {
  constructor() {
    super([]);
  }

  override async generate(opts: {
    prompt?: string;
    system?: string;
    role?: string;
    maxTokens?: number;
    thinking?: boolean;
    abortSignal?: AbortSignal;
  }) {
    this.calls.push(opts);
    await new Promise((_resolve, reject) => {
      opts.abortSignal?.addEventListener("abort", () => {
        reject(new Error("aborted"));
      });
    });
    return { text: "" };
  }
}

describe("clarifyResearchIntent", () => {
  it("returns one clarification question when the query is ambiguous", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
        clarity: {
          objectiveClear: false,
          scopeClear: false,
          audienceClear: true,
          sourceClear: false,
          outputClear: true,
          constraintsClear: true,
          confidence: 0.48,
          missingSlots: ["objective", "scope", "source"],
        },
        brief: {
          originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          refinedQuestion: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          objective: "compare",
          audience: "technical",
          scope: { target: "Claude Code and Cursor" },
          sourcePreferences: ["official", "industry"],
          outputTemplate: "technical_analysis",
          mustInclude: [],
          exclude: [],
          assumptions: ["默认面向技术读者输出综合研究报告"],
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
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.question?.id).toBe("objective");
    expect(result.question?.options).toHaveLength(3);
    expect(result.round).toBe(1);
    expect(llm.calls[0].role).toBe("intent-clarifier");
    expect(llm.calls[0].thinking).toBe(false);
    expect(llm.calls[0].maxTokens).toBe(1600);
  });

  it("finalizes when confidence is high", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
        brief: {
          originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          refinedQuestion: "对比 Claude Code 和 Cursor 在软件开发中的适用场景、优缺点和推荐用法",
          objective: "compare",
          audience: "technical",
          scope: { target: "Claude Code and Cursor" },
          sourcePreferences: ["official", "industry"],
          outputTemplate: "technical_analysis",
          mustInclude: ["适用场景", "优缺点", "推荐用法"],
          exclude: [],
          assumptions: [],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.brief.objective).toBe("compare");
  });

  it("asks a high-value research-design question even when the query is clear enough to start", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
          reason: "输出形态会直接改变检索来源、子问题拆分和报告结构。",
          missingResearchDecisions: ["output_form", "metric_operationalization"],
          defaultAssumption: "默认按文献综述、机制分析和可验证实验建议综合研究。",
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
            { id: "default", label: "默认", value: "文献综述 + 实验设计建议", isDefault: true },
          ],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.question?.id).toBe("research_output");
    expect(result.question?.text).toContain("哪种输出");
    expect(result.question?.text).toContain("轮廓");
    expect(result.question?.text).not.toContain("主题比较宽");
    expect(result.clarificationOpportunity?.impact).toBe("high");
  });

  it("does not ask a generic high-opportunity question that will not help research design", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
          reason: "可能存在多个研究方向。",
          missingResearchDecisions: ["research_direction"],
          defaultAssumption: "默认按文献综述、机制分析和可验证实验建议综合研究。",
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
          id: "goal",
          text: "你主要想了解什么？",
          reason: "这样可以确定方向。",
          options: [
            { id: "a", label: "方向 A", value: "方向 A" },
            { id: "default", label: "默认", value: "默认方向", isDefault: true },
          ],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.brief.assumptions.join(" ")).toContain("默认按文献综述");
  });

  it("repairs a usable malformed brief so a high-value clarification is not lost to fallback", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
          reason: "指标口径会改变实验方案和证据检索。",
          missingResearchDecisions: ["metric_operationalization"],
          defaultAssumption: "默认同时覆盖边界指标和检测指标。",
        },
        brief: {
          originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
          refined_question: "分析轮廓特征提取精准度对少样本目标检测性能的影响",
          objective: "evaluate",
          audience: "technical",
          scope: { target: "轮廓特征提取精准度与少样本目标检测性能" },
          source_preferences: ["academic"],
          output_template: "technical_analysis",
          must_include: [],
          exclude: [],
          assumptions: [],
        },
        question: {
          id: "metric_operationalization",
          text: "你希望把轮廓特征提取的精准程度主要按哪类指标来界定？",
          reason: "这会决定后续优先检索边界评估、检测指标还是消融实验资料。",
          options: [
            { id: "boundary", label: "边界指标", value: "边界 F-score、IoU、轮廓一致性等指标" },
            { id: "detection", label: "检测指标", value: "mAP、AP50/AP75、novel AP 等检测性能指标" },
            { id: "default", label: "默认", value: "边界指标 + 检测指标", isDefault: true },
          ],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.fallbackReason).toBeUndefined();
    expect(result.status).toBe("needs_clarification");
    expect(result.brief.refinedQuestion).toContain("轮廓特征");
    expect(result.brief.sourcePreferences).toEqual(["academic"]);
    expect(result.question?.id).toBe("metric_operationalization");
  });

  it("returns a default clarification immediately for a broad first-round topic", async () => {
    const llm = new FakeLLM([]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "AI Agent",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.question?.id).toBe("research_direction");
    expect(result.question?.options).toHaveLength(3);
    expect(result.clarity.confidence).toBeLessThan(0.75);
    expect(result.clarity.missingSlots).toContain("research_direction");
    expect(llm.calls).toHaveLength(0);
  });

  it("lets a short but specific interview-prep query reach the LLM clarifier", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
        brief: {
          originalQuery: "阿里云ai应用开发面经",
          refinedQuestion: "整理阿里云 AI 应用开发岗位面经，覆盖常见问题、考察方向和准备建议",
          objective: "survey",
          audience: "technical",
          scope: { target: "阿里云 AI 应用开发岗位面经" },
          sourcePreferences: ["industry", "news"],
          outputTemplate: "technical_analysis",
          mustInclude: ["常见问题", "考察方向", "准备建议"],
          exclude: [],
          assumptions: ["默认面向准备 AI 应用开发岗位面试的候选人。"],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "阿里云ai应用开发面经",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].role).toBe("intent-clarifier");
    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.brief.refinedQuestion).toContain("阿里云");
  });

  it("ignores an empty question object when the request is clear", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
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
        brief: {
          originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          refinedQuestion: "对比 Claude Code 和 Cursor 在软件开发中的适用场景、优缺点和推荐用法",
          objective: "compare",
          audience: "technical",
          scope: { target: "Claude Code and Cursor" },
          sourcePreferences: ["official", "industry"],
          outputTemplate: "technical_analysis",
          mustInclude: ["适用场景", "优缺点", "推荐用法"],
          exclude: [],
          assumptions: [],
        },
        question: {
          id: "",
          text: "",
          reason: "",
          options: [],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
  });

  it("uses a default question when confidence is low but the model omits a valid question", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
        clarity: {
          objectiveClear: true,
          scopeClear: false,
          audienceClear: true,
          sourceClear: false,
          outputClear: true,
          constraintsClear: true,
          confidence: 0.58,
          missingSlots: ["scope", "source"],
        },
        brief: {
          originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          refinedQuestion: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
          objective: "compare",
          audience: "technical",
          scope: { target: "Claude Code and Cursor" },
          sourcePreferences: ["official", "industry"],
          outputTemplate: "technical_analysis",
          mustInclude: [],
          exclude: [],
          assumptions: [],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "对比 Claude Code 和 Cursor 在软件开发中的适用场景",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.question?.id).toBe("research_direction");
  });

  it("finalizes at the max round even if the model still asks a question", async () => {
    const llm = new FakeLLM([
      JSON.stringify({
        clarity: {
          objectiveClear: true,
          scopeClear: false,
          audienceClear: true,
          sourceClear: false,
          outputClear: true,
          constraintsClear: true,
          confidence: 0.62,
          missingSlots: ["scope", "source"],
        },
        brief: {
          originalQuery: "研究 AI Agent",
          refinedQuestion: "研究 AI Agent 的技术演进和商业落地",
          objective: "survey",
          audience: "technical",
          scope: {},
          sourcePreferences: ["academic", "industry"],
          outputTemplate: "research_report",
          mustInclude: [],
          exclude: [],
          assumptions: ["已达到澄清轮次上限，按当前设定继续"],
        },
        question: {
          id: "scope",
          text: "希望覆盖哪个时间范围？",
          reason: "时间范围会影响资料检索。",
          options: [
            { id: "one_year", label: "最近一年", value: "最近一年" },
            { id: "three_years", label: "最近三年", value: "最近三年", isDefault: true },
          ],
        },
      }),
    ]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "研究 AI Agent",
      history: [
        { questionId: "objective", question: "角度？", answer: "技术演进" },
        { questionId: "audience", question: "受众？", answer: "技术人员" },
        { questionId: "output", question: "输出？", answer: "研究报告" },
      ],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.brief.assumptions.join(" ")).toContain("澄清轮次上限");
  });

  it("falls back to a clear brief with the user's answer when second-round JSON parsing fails", async () => {
    const llm = new FakeLLM(["not json"]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "AI Agent 未来的发展机会",
      history: [
        {
          questionId: "research_direction",
          question: "这个主题比较宽，你更希望这次研究优先回答哪个方向？",
          answer: "偏技术和商业落地，重点看未来两年的产品机会",
        },
      ],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.fallbackReason).toBe("clarifier_parse_failed_after_answer");
    expect(result.brief.refinedQuestion).toContain("偏技术和商业落地");
    expect(result.brief.refinedQuestion).not.toContain("这个主题比较宽");
    expect(result.brief.mustInclude.join(" ")).toContain("未来两年的产品机会");
    expect(result.brief.mustInclude.join(" ")).not.toContain("这个主题比较宽");
    expect(result.brief.assumptions.join(" ")).not.toContain("需先确认研究方向");
  });

  it("starts with fallback assumptions instead of asking a broad default question when a clear query gets empty output", async () => {
    const llm = new FakeLLM([{ text: "", stopReason: "max_tokens" }]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.fallbackReason).toBe("clarifier_empty_output_first_round");
    expect(result.brief.objective).toBe("evaluate");
    expect(result.brief.audience).toBe("technical");
    expect(result.brief.assumptions.join(" ")).toContain("意图判断模型返回空结果");
    expect(result.brief.assumptions.join(" ")).not.toContain("主题比较宽");
  });

  it("starts with fallback assumptions instead of asking a broad default question when a clear query times out", async () => {
    const llm = new HangingLLM();

    const result = await clarifyResearchIntent(
      llm as any,
      {
        originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
        history: [],
        maxRounds: 3,
        outputLanguage: "zh",
      },
      {
        timeoutMs: { firstRound: 5 },
      },
    );

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.fallbackReason).toBe("clarifier_timeout_first_round");
    expect(result.brief.refinedQuestion).toBe("模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响");
    expect(result.brief.assumptions.join(" ")).toContain("意图判断模型响应超时");
    expect(result.brief.assumptions.join(" ")).not.toContain("主题比较宽");
    expect(llm.calls[0].abortSignal).toBeDefined();
    expect(llm.calls[0].abortSignal?.aborted).toBe(true);
  });

  it("starts with fallback assumptions instead of asking a broad default question when first-round parsing fails for a clear query", async () => {
    const llm = new FakeLLM(["not json"]);

    const result = await clarifyResearchIntent(llm as any, {
      originalQuery: "模型对物体轮廓特征提取的精准程度对少样本目标检测性能的影响",
      history: [],
      maxRounds: 3,
      outputLanguage: "zh",
    });

    expect(result.status).toBe("clear");
    expect(result.question).toBeUndefined();
    expect(result.fallbackReason).toBe("clarifier_parse_failed_first_round");
    expect(result.brief.assumptions.join(" ")).toContain("意图判断模型返回无效结果");
    expect(result.brief.assumptions.join(" ")).not.toContain("主题比较宽");
  });
});

describe("formatResearchBriefForPrompt", () => {
  it("formats a confirmed brief as natural language for planner prompts", () => {
    const text = formatResearchBriefForPrompt({
      originalQuery: "研究 AI Agent 的发展趋势",
      refinedQuestion: "研究 2024-2026 年 AI Agent 在技术和商业上的发展趋势",
      objective: "survey",
      audience: "business",
      scope: { region: "global", timeRange: "2024-2026", target: "AI Agent" },
      sourcePreferences: ["industry", "official"],
      outputTemplate: "market_analysis",
      mustInclude: ["商业案例"],
      exclude: ["纯概念介绍"],
      assumptions: ["默认覆盖中美案例"],
    });

    expect(text).toContain("Refined question");
    expect(text).toContain("Objective: survey");
    expect(text).toContain("商业案例");
    expect(text).not.toContain("{");
  });
});
