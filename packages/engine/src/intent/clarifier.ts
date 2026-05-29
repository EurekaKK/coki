import type {
  ClarificationOpportunity,
  ClarificationQuestion,
  IntentAnswer,
  IntentClarificationResult,
  ResearchBrief,
} from "@coki/shared";
import {
  ClarificationOpportunitySchema,
  ClarificationQuestionSchema,
  IntentClarificationResultSchema,
} from "@coki/shared";
import type { LLMClient } from "../llm/client";
import { parseJsonFromText } from "../utils/parse-json";
import { INTENT_CLARIFICATION_PHASE } from "./observability";

export interface ClarifyResearchIntentRequest {
  originalQuery: string;
  history?: IntentAnswer[];
  maxRounds?: number;
  outputLanguage?: "zh" | "en";
}

export interface ClarifyResearchIntentTelemetry {
  traceId?: string;
  timeoutMs?: {
    firstRound?: number;
    followupRound?: number;
  };
}

const DEFAULT_MAX_ROUNDS = 3;
const CONFIDENCE_THRESHOLD = 0.75;
const GENERIC_TOPIC_MAX_LENGTH = 18;
const CLARIFIER_MAX_TOKENS = 1600;
const FIRST_ROUND_TIMEOUT_MS = 20_000;
const FOLLOWUP_ROUND_TIMEOUT_MS = 25_000;

type ClarifierFailureKind = "parse_failed" | "empty_output" | "timeout";

class IntentClarifierFailure extends Error {
  constructor(
    readonly kind: ClarifierFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "IntentClarifierFailure";
  }
}

const INTENT_CLARIFIER_SYSTEM_PROMPT = [
  "You are an intent clarification agent for a deep research product.",
  "Your job is to decide whether the user's research request is clear enough to run.",
  "Ask at most one high-impact clarification question when an answer would materially improve research quality.",
  "A request can be clear enough to start and still have a high-value clarification opportunity.",
  "Do not ask generic questions such as what the user mainly wants to know; ask about concrete research-design choices.",
  "Output strict JSON only.",
].join("\n");

function buildPrompt(request: Required<ClarifyResearchIntentRequest>): string {
  const language = request.outputLanguage === "zh" ? "Chinese" : "English";
  const historyText = request.history.length
    ? request.history
        .map(
          (item, index) =>
            `${index + 1}. Q(${item.questionId}): ${item.question}\n   A: ${item.answer}`,
        )
        .join("\n")
    : "(no clarification answers yet)";

  return [
    `Original user query: ${request.originalQuery}`,
    `Output language: ${language}`,
    `Clarification round already answered: ${request.history.length}/${request.maxRounds}`,
    "",
    "Previous clarification answers:",
    historyText,
    "",
    "Judge clarity across these slots:",
    "- objective: explain, compare, recommend, forecast, evaluate, or survey",
    "- scope: region, time range, and target",
    "- audience: general, technical, academic, business, or investment",
    "- source preferences: official, academic, news, industry, local_documents, or data",
    "- output template: research_report, decision_memo, literature_review, market_analysis, or technical_analysis",
    "- constraints: must-include and exclude items",
    "",
    "Also judge whether one optional research-design clarification would significantly improve the result:",
    "- output_form: literature review, experiment design, metric framework, decision memo, market scan, or interview prep",
    "- metric_operationalization: how to define key quantities or success metrics",
    "- data_or_model_scope: target datasets, benchmarks, model family, region, or time range",
    "- evidence_strategy: academic papers, official docs, data, local documents, news, or industry sources",
    "",
    "Decision rules:",
    `- If confidence >= ${CONFIDENCE_THRESHOLD} and there is no high-impact research-design choice, return no question.`,
    "- On the first round, a broad topic or noun phrase without explicit direction is not clear enough.",
    "- A direct-start request should include a concrete comparison, time range, region, audience, source preference, output shape, or analysis angle.",
    "- If missing slots do not materially change the research path, use visible assumptions instead of asking.",
    "- If a missing slot or research-design choice materially changes research direction, ask exactly one question with 2-3 options.",
    "- The question must name a concrete choice: output form, metric definition, data/model scope, source priority, or decision criteria.",
    "- Avoid vague questions like 'what is your goal?', 'what do you want to know?', or 'which direction should we prioritize?' unless the original topic is genuinely broad.",
    "- Include a default option when reasonable so the user can continue quickly.",
    "- Never ask more than one question in this response.",
    "",
    "Return JSON with this shape:",
    JSON.stringify({
      clarity: {
        objectiveClear: true,
        scopeClear: true,
        audienceClear: true,
        sourceClear: true,
        outputClear: true,
        constraintsClear: true,
        confidence: 0.82,
        missingSlots: [],
      },
      clarificationOpportunity: {
        shouldAsk: false,
        impact: "low",
        reason: "<why asking would or would not improve the research>",
        missingResearchDecisions: [],
        defaultAssumption: "<assumption to use if no question is asked>",
      },
      brief: {
        originalQuery: "<original query>",
        refinedQuestion: "<clear research question>",
        objective: "survey",
        audience: "technical",
        scope: { region: "", timeRange: "", target: "" },
        sourcePreferences: ["academic", "industry"],
        outputTemplate: "research_report",
        mustInclude: [],
        exclude: [],
        assumptions: [],
      },
      question: {
        id: "objective",
        text: "<question text>",
        reason: "<why this affects research direction>",
        options: [
          { id: "a", label: "<short label>", value: "<answer value>" },
          { id: "default", label: "Default", value: "<default answer>", isDefault: true },
        ],
      },
    }),
    "",
    "Omit question when the request is clear enough and any clarification opportunity is low or medium impact.",
  ].join("\n");
}

function normalizeResult(
  raw: unknown,
  request: Required<ClarifyResearchIntentRequest>,
): IntentClarificationResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const round = Math.max(1, request.history.length + 1);
  const maxRounds = request.maxRounds;
  const question = normalizeQuestion(r.question);
  const clarificationOpportunity = normalizeClarificationOpportunity(
    r.clarificationOpportunity ?? r.clarification_opportunity,
  );

  const normalized = {
    status: "clear",
    round: Math.min(round, maxRounds),
    maxRounds,
    clarity: r.clarity,
    clarificationOpportunity,
    brief: normalizeBrief(r.brief, request),
    question,
  };

  const parsed = IntentClarificationResultSchema.parse(normalized);
  const shouldForceClarification = shouldForceFirstRoundClarification(
    normalizedRequestToInput(request),
  );
  if (shouldForceClarification && request.history.length < maxRounds) {
    return {
      ...parsed,
      status: "needs_clarification",
      clarity: {
        ...parsed.clarity,
        confidence: Math.min(parsed.clarity.confidence, 0.72),
        missingSlots: addMissingSlot(parsed.clarity.missingSlots, "research_direction"),
      },
      question: parsed.question ?? createDefaultResearchDirectionQuestion(request.outputLanguage),
    };
  }

  const opportunity = parsed.clarificationOpportunity;
  if (shouldAskHighImpactOpportunity(opportunity) && parsed.question && request.history.length < maxRounds) {
    if (isUsefulClarificationQuestion(parsed.question, opportunity)) {
      return {
        ...parsed,
        status: "needs_clarification",
        question: contextualizeClarificationQuestion(parsed.question, request.originalQuery),
      };
    }
  }

  const shouldAsk =
    parsed.clarity.confidence < CONFIDENCE_THRESHOLD &&
    parsed.clarity.missingSlots.length > 0 &&
    request.history.length < maxRounds;

  if (shouldAsk) {
    return {
      ...parsed,
      status: "needs_clarification",
      question: parsed.question
        ? contextualizeClarificationQuestion(parsed.question, request.originalQuery)
        : createDefaultResearchDirectionQuestion(request.outputLanguage),
    };
  }

  const assumptions = [...parsed.brief.assumptions];
  if (
    parsed.clarificationOpportunity?.shouldAsk &&
    parsed.clarificationOpportunity.defaultAssumption &&
    !assumptions.includes(parsed.clarificationOpportunity.defaultAssumption)
  ) {
    assumptions.push(parsed.clarificationOpportunity.defaultAssumption);
  }

  if (
    request.history.length >= maxRounds &&
    parsed.clarity.confidence < CONFIDENCE_THRESHOLD &&
    !assumptions.some((a) => a.includes("澄清轮次上限") || a.includes("clarification round limit"))
  ) {
    assumptions.push(
      request.outputLanguage === "zh"
        ? "已达到澄清轮次上限，按当前设定和默认假设继续。"
        : "Reached the clarification round limit; continuing with the current brief and default assumptions.",
    );
  }

  return {
    ...parsed,
    status: "clear",
    question: undefined,
    brief: { ...parsed.brief, assumptions },
  };
}

function normalizeBrief(
  rawBrief: unknown,
  request: Required<ClarifyResearchIntentRequest>,
): ResearchBrief {
  const brief = rawBrief && typeof rawBrief === "object"
    ? (rawBrief as Record<string, unknown>)
    : {};
  const combinedText = `${request.originalQuery} ${stringValue(brief.refinedQuestion) ?? ""}`;

  return {
    originalQuery: stringValue(brief.originalQuery ?? brief.original_query) ?? request.originalQuery,
    refinedQuestion: stringValue(brief.refinedQuestion ?? brief.refined_question) ??
      request.originalQuery,
    objective: coerceObjective(brief.objective, request.originalQuery),
    audience: coerceAudience(brief.audience, combinedText),
    scope: normalizeScope(brief.scope, request.originalQuery),
    sourcePreferences: coerceSourcePreferences(
      brief.sourcePreferences ?? brief.source_preferences,
      combinedText,
    ),
    outputTemplate: coerceOutputTemplate(
      brief.outputTemplate ?? brief.output_template,
      combinedText,
    ),
    mustInclude: stringArray(brief.mustInclude ?? brief.must_include),
    exclude: stringArray(brief.exclude),
    assumptions: stringArray(brief.assumptions),
  };
}

function normalizeScope(rawScope: unknown, fallbackTarget: string): ResearchBrief["scope"] {
  const scope = rawScope && typeof rawScope === "object"
    ? (rawScope as Record<string, unknown>)
    : {};

  return {
    region: stringValue(scope.region),
    timeRange: stringValue(scope.timeRange ?? scope.time_range),
    target: stringValue(scope.target) ?? fallbackTarget,
  };
}

function normalizeQuestion(rawQuestion: unknown) {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    return undefined;
  }

  const question = { ...(rawQuestion as Record<string, unknown>) };
  if (Array.isArray(question.options)) {
    question.options = question.options.slice(0, 3);
  }

  const parsed = ClarificationQuestionSchema.safeParse(question);
  return parsed.success ? parsed.data : undefined;
}

function normalizeClarificationOpportunity(rawOpportunity: unknown) {
  if (!rawOpportunity || typeof rawOpportunity !== "object") {
    return undefined;
  }

  const opportunity = { ...(rawOpportunity as Record<string, unknown>) };
  if ("missing_research_decisions" in opportunity && !("missingResearchDecisions" in opportunity)) {
    opportunity.missingResearchDecisions = opportunity.missing_research_decisions;
  }
  if ("default_assumption" in opportunity && !("defaultAssumption" in opportunity)) {
    opportunity.defaultAssumption = opportunity.default_assumption;
  }

  const parsed = ClarificationOpportunitySchema.safeParse(opportunity);
  return parsed.success ? parsed.data : undefined;
}

function shouldAskHighImpactOpportunity(
  opportunity?: ClarificationOpportunity,
): opportunity is ClarificationOpportunity {
  return opportunity?.shouldAsk === true && opportunity.impact === "high";
}

function isUsefulClarificationQuestion(
  question: ClarificationQuestion,
  opportunity: ClarificationOpportunity,
) {
  if (!question.options.some((option) => option.isDefault)) return false;
  if (isGenericClarificationQuestion(question)) return false;

  const combinedText = [
    question.text,
    question.reason,
    ...question.options.flatMap((option) => [option.label, option.value]),
    opportunity.reason,
    ...opportunity.missingResearchDecisions,
  ].join(" ");

  const hasDecisionSignal =
    /输出|报告|结构|文献|综述|实验|指标|评估|度量|量化|数据|模型|范围|来源|证据|benchmark|dataset|metric|experiment|literature|scope|source|evidence|evaluation|report/i
      .test(combinedText);
  const hasActionableOption = question.options.some(
    (option) => option.value.length >= 6 && !/^方向\s*[A-ZＡ-Ｚ]?$/i.test(option.value),
  );

  return hasDecisionSignal && hasActionableOption;
}

function isGenericClarificationQuestion(question: ClarificationQuestion) {
  const text = question.text.trim();
  if (
    /主题比较宽|主要想了解什么|想了解什么|主要目标是什么|主要目的是什么|获取.*主要目的|了解.*主要目标|更关注哪个研究角度|哪个方向/.test(
      text,
    )
  ) {
    return true;
  }

  const optionText = question.options.map((option) => `${option.label} ${option.value}`).join(" ");
  return /方向\s*[A-ZＡ-Ｚ]|默认方向/.test(optionText);
}

function contextualizeClarificationQuestion(
  question: ClarificationQuestion,
  originalQuery: string,
): ClarificationQuestion {
  if (questionTextAnchorsQuery(question.text, originalQuery)) return question;

  const target = shortenQuestionContext(originalQuery);
  if (/本次研究|这次研究/.test(question.text)) {
    return {
      ...question,
      text: question.text.replace(/本次研究|这次研究/, `本次关于“${target}”的研究`),
    };
  }

  return {
    ...question,
    text: `针对“${target}”，${question.text}`,
  };
}

function questionTextAnchorsQuery(text: string, query: string) {
  const anchors = query.match(/AI|[A-Za-z][A-Za-z0-9+-]{1,}|少样本|目标检测|物体轮廓|轮廓|特征提取|特征|性能|模型|面经|应用开发|阿里云/g);
  return Boolean(anchors?.some((anchor) => text.includes(anchor)));
}

function shortenQuestionContext(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ");
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function coerceObjective(value: unknown, fallbackText: string): ResearchBrief["objective"] {
  const text = stringValue(value);
  if (
    text &&
    ["explain", "compare", "recommend", "forecast", "evaluate", "survey"].includes(text)
  ) {
    return text as ResearchBrief["objective"];
  }
  return inferObjective(fallbackText);
}

function coerceAudience(value: unknown, fallbackText: string): ResearchBrief["audience"] {
  const text = stringValue(value);
  if (
    text &&
    ["general", "technical", "academic", "business", "investment"].includes(text)
  ) {
    return text as ResearchBrief["audience"];
  }
  return inferAudience(fallbackText);
}

function coerceOutputTemplate(
  value: unknown,
  fallbackText: string,
): ResearchBrief["outputTemplate"] {
  const text = stringValue(value);
  if (
    text &&
    [
      "research_report",
      "decision_memo",
      "literature_review",
      "market_analysis",
      "technical_analysis",
    ].includes(text)
  ) {
    return text as ResearchBrief["outputTemplate"];
  }
  return inferOutputTemplate(fallbackText);
}

function coerceSourcePreferences(
  value: unknown,
  fallbackText: string,
): ResearchBrief["sourcePreferences"] {
  const valid = new Set(["official", "academic", "news", "industry", "local_documents", "data"]);
  const values = stringArray(value).filter((item) => valid.has(item));
  return values.length
    ? values as ResearchBrief["sourcePreferences"]
    : inferSourcePreferences(fallbackText);
}

function normalizedRequestToInput(request: Required<ClarifyResearchIntentRequest>) {
  return {
    originalQuery: request.originalQuery,
    historyCount: request.history.length,
  };
}

function shouldForceFirstRoundClarification(input: {
  originalQuery: string;
  historyCount: number;
}) {
  if (input.historyCount > 0) return false;

  const query = normalizeQueryForRules(input.originalQuery);
  if (!query) return true;

  const compactLength = query.replace(/\s/g, "").length;
  const constraintCount = countExplicitConstraints(query);

  if (compactLength <= GENERIC_TOPIC_MAX_LENGTH && constraintCount < 2) {
    return true;
  }

  if (isGenericResearchRequest(query) && constraintCount < 2) {
    return true;
  }

  return false;
}

function normalizeQueryForRules(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function countExplicitConstraints(query: string) {
  const checks = [
    /对比|比较|区别|差异|vs\.?|versus|compare|comparison/i,
    /20\d{2}|202\d|最近|近[一二三四五六七八九十\d]+[年月日]|过去|未来|today|recent|last|next/i,
    /中国|国内|美国|全球|海外|欧洲|日本|北京|上海|华东|华南|global|china|us|usa|europe|japan/i,
    /技术|学术|论文|商业|市场|投资|产品|工程|架构|政策|开发|后端|前端|客户端|工程师|ct|mri|影像|算法|模型|性能|technical|academic|business|market|investment|policy|benchmark/i,
    /临床|诊断|治疗|指南|病例|患者|clinical|diagnosis|treatment|guideline|patient/i,
    /报告|表格|清单|备忘录|方案|建议|模板|research report|memo|table|checklist|recommendation/i,
    /官方|数据|新闻|行业|本地文档|official|data|news|industry|local documents/i,
    /适用场景|优缺点|案例|风险|成本|路线|原理|机制|落地|strategy|risk|cost|case|scenario/i,
    /面试|面经|笔试|面试题|岗位|职位|招聘|实习|校招|秋招|春招|求职|interview|job|role|hiring|recruit/i,
  ];

  return checks.reduce((count, pattern) => count + (pattern.test(query) ? 1 : 0), 0);
}

function isGenericResearchRequest(query: string) {
  return /^(研究|分析|调研|了解|看看|介绍|总结|解释)\s*/.test(query) ||
    /^(research|analyze|analyse|study|explain|summarize)\s+/i.test(query);
}

function addMissingSlot(slots: string[], slot: string) {
  return slots.includes(slot) ? slots : [...slots, slot];
}

function createDefaultResearchDirectionQuestion(
  language: "zh" | "en",
): ClarificationQuestion {
  if (language === "en") {
    return {
      id: "research_direction",
      text: "This topic is broad. Which direction should the research prioritize?",
      reason: "The direction changes source selection, subquestions, and report structure.",
      options: [
        {
          id: "overview",
          label: "Overview",
          value: "Build a structured overview with key facts, concepts, and conclusions.",
          isDefault: true,
        },
        {
          id: "technical",
          label: "Technical",
          value: "Prioritize mechanisms, evidence, technical details, and open questions.",
        },
        {
          id: "decision",
          label: "Decision",
          value: "Prioritize risks, options, trade-offs, and actionable recommendations.",
        },
      ],
    };
  }

  return {
    id: "research_direction",
    text: "这个主题比较宽，你更希望这次研究优先回答哪个方向？",
    reason: "不同方向会影响检索来源、子问题拆分和报告结构。",
    options: [
      {
        id: "overview",
        label: "综合概览",
        value: "先建立结构化全局框架，覆盖关键事实、核心概念和主要结论。",
        isDefault: true,
      },
      {
        id: "technical",
        label: "专业分析",
        value: "偏专业分析，重点关注机制、证据、技术细节和争议问题。",
      },
      {
        id: "decision",
        label: "决策建议",
        value: "围绕选择、风险、方案和下一步行动形成建议。",
      },
    ],
  };
}

export async function clarifyResearchIntent(
  llm: LLMClient,
  request: ClarifyResearchIntentRequest,
  telemetry?: ClarifyResearchIntentTelemetry,
): Promise<IntentClarificationResult> {
  const normalizedRequest: Required<ClarifyResearchIntentRequest> = {
    originalQuery: request.originalQuery,
    history: request.history ?? [],
    maxRounds: Math.max(1, request.maxRounds ?? DEFAULT_MAX_ROUNDS),
    outputLanguage: request.outputLanguage ?? "zh",
  };

  const immediateResult = createImmediateFirstRoundClarification(normalizedRequest);
  if (immediateResult) {
    return immediateResult;
  }

  try {
    const timeoutMs = getClarifierTimeoutMs(normalizedRequest, telemetry?.timeoutMs);
    const result = await generateWithTimeout(
      llm,
      {
        role: "intent-clarifier",
        system: INTENT_CLARIFIER_SYSTEM_PROMPT,
        prompt: buildPrompt(normalizedRequest),
        maxTokens: CLARIFIER_MAX_TOKENS,
        thinking: false,
        phase: telemetry?.traceId ? INTENT_CLARIFICATION_PHASE : undefined,
        traceId: telemetry?.traceId,
      },
      timeoutMs,
    );
    assertUsableClarifierText(result.text, result.stopReason);
    return normalizeResult(parseJsonFromText(result.text), normalizedRequest);
  } catch (error) {
    return createFallbackClarification(normalizedRequest, error);
  }
}

function getClarifierTimeoutMs(
  request: Required<ClarifyResearchIntentRequest>,
  overrides?: ClarifyResearchIntentTelemetry["timeoutMs"],
) {
  if (request.history.length > 0) {
    return overrides?.followupRound ?? FOLLOWUP_ROUND_TIMEOUT_MS;
  }

  return overrides?.firstRound ?? FIRST_ROUND_TIMEOUT_MS;
}

async function generateWithTimeout(
  llm: LLMClient,
  opts: Parameters<LLMClient["generate"]>[0],
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutError = new IntentClarifierFailure(
    "timeout",
    `Intent clarifier timed out after ${timeoutMs}ms`,
  );
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      llm.generate({ ...opts, abortSignal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function assertUsableClarifierText(text: string, stopReason?: string) {
  if (text.trim().length > 0) return;

  throw new IntentClarifierFailure(
    "empty_output",
    stopReason
      ? `Intent clarifier returned empty text with stop reason: ${stopReason}`
      : "Intent clarifier returned empty text",
  );
}

function createFallbackClarification(
  request: Required<ClarifyResearchIntentRequest>,
  error: unknown,
): IntentClarificationResult {
  const failureKind = getClarifierFailureKind(error);
  if (request.history.length > 0) {
    return createFallbackBriefFromHistory(request, error, failureKind);
  }

  if (!shouldAskDefaultQuestionOnFirstRoundFailure(request)) {
    return createFallbackBriefFromOriginalQuery(request, error, failureKind);
  }

  return {
    status: "needs_clarification",
    fallbackReason: createFallbackReason(failureKind, request.history.length),
    round: 1,
    maxRounds: request.maxRounds,
    clarity: {
      objectiveClear: false,
      scopeClear: false,
      audienceClear: false,
      sourceClear: false,
      outputClear: false,
      constraintsClear: false,
      confidence: 0.5,
      missingSlots: ["research_direction"],
    },
    brief: {
      ...createDefaultResearchBrief(request),
      assumptions: [
        request.outputLanguage === "zh"
          ? `意图判断模型${formatFailureKindZh(failureKind)}，先用默认澄清问题确认研究方向。`
          : `The intent clarifier ${formatFailureKindEn(failureKind)}; asking the default clarification question before research.`,
        ],
    },
    question: createDefaultResearchDirectionQuestion(request.outputLanguage),
  };
}

function shouldAskDefaultQuestionOnFirstRoundFailure(
  request: Required<ClarifyResearchIntentRequest>,
) {
  return shouldForceFirstRoundClarification(normalizedRequestToInput(request));
}

function createFallbackBriefFromOriginalQuery(
  request: Required<ClarifyResearchIntentRequest>,
  error: unknown,
  failureKind: ClarifierFailureKind,
): IntentClarificationResult {
  const assumption = request.outputLanguage === "zh"
    ? `意图判断模型${formatFailureKindZh(failureKind)}，已按原始问题和默认假设开始研究。错误：${errorMessage(error)}`
    : `The intent clarifier ${formatFailureKindEn(failureKind)}; starting from the original query and default assumptions. Error: ${errorMessage(error)}`;

  return {
    status: "clear",
    fallbackReason: createFallbackReason(failureKind, request.history.length),
    round: 1,
    maxRounds: request.maxRounds,
    clarity: {
      objectiveClear: true,
      scopeClear: true,
      audienceClear: true,
      sourceClear: true,
      outputClear: true,
      constraintsClear: true,
      confidence: 0.74,
      missingSlots: [],
    },
    brief: {
      ...createDefaultResearchBrief(request),
      objective: inferObjective(request.originalQuery),
      audience: inferAudience(request.originalQuery),
      outputTemplate: inferOutputTemplate(request.originalQuery),
      sourcePreferences: inferSourcePreferences(request.originalQuery),
      scope: {
        target: request.originalQuery,
        timeRange: inferTimeRange(request.originalQuery),
        region: inferRegion(request.originalQuery),
      },
      assumptions: [assumption],
    },
    question: undefined,
  };
}

function createFallbackBriefFromHistory(
  request: Required<ClarifyResearchIntentRequest>,
  error: unknown,
  failureKind: ClarifierFailureKind,
): IntentClarificationResult {
  const historySummary = formatAnswerSummary(request.history);
  const combinedText = `${request.originalQuery} ${historySummary}`;

  return {
    status: "clear",
    fallbackReason: createFallbackReason(failureKind, request.history.length),
    round: Math.min(request.history.length + 1, request.maxRounds),
    maxRounds: request.maxRounds,
    clarity: {
      objectiveClear: true,
      scopeClear: true,
      audienceClear: true,
      sourceClear: true,
      outputClear: true,
      constraintsClear: true,
      confidence: 0.76,
      missingSlots: [],
    },
    brief: {
      originalQuery: request.originalQuery,
      refinedQuestion: request.outputLanguage === "zh"
        ? `${request.originalQuery}，重点按用户补充方向研究：${historySummary}`
        : `${request.originalQuery}, focusing on the user's clarification: ${historySummary}`,
      objective: inferObjective(combinedText),
      audience: inferAudience(combinedText),
      scope: {
        target: request.originalQuery,
        timeRange: inferTimeRange(combinedText),
        region: inferRegion(combinedText),
      },
      sourcePreferences: inferSourcePreferences(combinedText),
      outputTemplate: inferOutputTemplate(combinedText),
      mustInclude: [historySummary],
      exclude: [],
      assumptions: [
        request.outputLanguage === "zh"
          ? `意图优化模型${formatFailureKindZh(failureKind)}，已按用户澄清回答生成保底研究设定。错误：${errorMessage(error)}`
          : `The intent refinement model ${formatFailureKindEn(failureKind)}; continuing with a fallback brief based on the user's clarification. Error: ${errorMessage(error)}`,
      ],
    },
    question: undefined,
  };
}

function formatAnswerSummary(history: IntentAnswer[]) {
  return history
    .map((answer) => answer.answer.trim())
    .filter(Boolean)
    .join("；");
}

function getClarifierFailureKind(error: unknown): ClarifierFailureKind {
  if (error instanceof IntentClarifierFailure) {
    return error.kind;
  }

  return "parse_failed";
}

function createFallbackReason(kind: ClarifierFailureKind, historyCount: number) {
  const phase = historyCount > 0 ? "after_answer" : "first_round";
  return `clarifier_${kind}_${phase}`;
}

function formatFailureKindZh(kind: ClarifierFailureKind) {
  if (kind === "timeout") return "响应超时";
  if (kind === "empty_output") return "返回空结果";
  return "返回无效结果";
}

function formatFailureKindEn(kind: ClarifierFailureKind) {
  if (kind === "timeout") return "timed out";
  if (kind === "empty_output") return "returned an empty result";
  return "returned an invalid result";
}

function inferObjective(text: string): ResearchBrief["objective"] {
  if (/对比|比较|区别|差异|vs\.?|versus|compare|comparison/i.test(text)) return "compare";
  if (/推荐|建议|选择|怎么做|路线|方案|recommend|suggest|choose/i.test(text)) return "recommend";
  if (/预测|趋势|未来|forecast|predict|trend/i.test(text)) return "forecast";
  if (/评估|评价|影响|效果|风险|evaluate|impact|risk/i.test(text)) return "evaluate";
  if (/解释|原理|机制|explain|why|how/i.test(text)) return "explain";
  return "survey";
}

function inferAudience(text: string): ResearchBrief["audience"] {
  if (/投资|估值|二级市场|investment|investor/i.test(text)) return "investment";
  if (/学术|论文|综述|paper|academic|literature/i.test(text)) return "academic";
  if (/技术|工程|架构|模型|算法|开发|technical|engineering/i.test(text)) return "technical";
  if (/商业|市场|产品|创业|落地|business|market|product|startup/i.test(text)) return "business";
  return "general";
}

function inferOutputTemplate(text: string): ResearchBrief["outputTemplate"] {
  if (/技术|工程|架构|模型|算法|开发|technical|engineering/i.test(text)) return "technical_analysis";
  if (/市场|商业|产品|创业|落地|market|business|product|startup/i.test(text)) return "market_analysis";
  if (/文献|论文|综述|literature|paper/i.test(text)) return "literature_review";
  if (/决策|选择|建议|方案|decision|recommend/i.test(text)) return "decision_memo";
  return "research_report";
}

function inferSourcePreferences(text: string): ResearchBrief["sourcePreferences"] {
  const preferences = new Set<ResearchBrief["sourcePreferences"][number]>();
  if (/学术|论文|文献|paper|academic|literature/i.test(text)) preferences.add("academic");
  if (/官方|政策|标准|official|standard/i.test(text)) preferences.add("official");
  if (/市场|商业|产品|创业|行业|落地|market|business|industry|startup/i.test(text)) preferences.add("industry");
  if (/数据|统计|规模|薪资|benchmark|data|statistics/i.test(text)) preferences.add("data");
  if (/新闻|最近|动态|news|recent/i.test(text)) preferences.add("news");
  return [...preferences];
}

function inferTimeRange(text: string) {
  return text.match(/未来[一二三四五六七八九十\d]+年|近[一二三四五六七八九十\d]+年|20\d{2}(?:[-—~至到]\s*20\d{2})?/i)?.[0];
}

function inferRegion(text: string) {
  return text.match(/中国|国内|美国|全球|海外|欧洲|日本|global|china|us|usa|europe|japan/i)?.[0];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createImmediateFirstRoundClarification(
  request: Required<ClarifyResearchIntentRequest>,
): IntentClarificationResult | null {
  const shouldAsk =
    request.history.length < request.maxRounds &&
    shouldForceFirstRoundClarification(normalizedRequestToInput(request));

  if (!shouldAsk) return null;

  return {
    status: "needs_clarification",
    round: 1,
    maxRounds: request.maxRounds,
    clarity: {
      objectiveClear: false,
      scopeClear: false,
      audienceClear: false,
      sourceClear: false,
      outputClear: false,
      constraintsClear: false,
      confidence: 0.5,
      missingSlots: ["research_direction"],
    },
    brief: createDefaultResearchBrief(request),
    question: createDefaultResearchDirectionQuestion(request.outputLanguage),
  };
}

function createDefaultResearchBrief(
  request: Required<ClarifyResearchIntentRequest>,
): ResearchBrief {
  return {
    originalQuery: request.originalQuery,
    refinedQuestion: request.originalQuery,
    objective: "survey",
    audience: "general",
    scope: { target: request.originalQuery },
    sourcePreferences: [],
    outputTemplate: "research_report",
    mustInclude: [],
    exclude: [],
    assumptions: [
      request.outputLanguage === "zh"
        ? "该主题较宽，需先确认研究方向。"
        : "This topic is broad and needs a confirmed research direction first.",
    ],
  };
}

export function formatResearchBriefForPrompt(brief: ResearchBrief): string {
  const scopeParts = [
    brief.scope.region && `region=${brief.scope.region}`,
    brief.scope.timeRange && `time range=${brief.scope.timeRange}`,
    brief.scope.target && `target=${brief.scope.target}`,
  ].filter(Boolean);

  const lines = [
    `Original query: ${brief.originalQuery}`,
    `Refined question: ${brief.refinedQuestion}`,
    `Objective: ${brief.objective}`,
    `Audience: ${brief.audience}`,
    scopeParts.length ? `Scope: ${scopeParts.join(", ")}` : "Scope: not specified",
    brief.sourcePreferences.length
      ? `Preferred sources: ${brief.sourcePreferences.join(", ")}`
      : "Preferred sources: not specified",
    `Output template: ${brief.outputTemplate}`,
  ];

  if (brief.mustInclude.length) {
    lines.push(`Must include: ${brief.mustInclude.join("; ")}`);
  }
  if (brief.exclude.length) {
    lines.push(`Exclude: ${brief.exclude.join("; ")}`);
  }
  if (brief.assumptions.length) {
    lines.push(`Assumptions: ${brief.assumptions.join("; ")}`);
  }

  return lines.join("\n");
}
