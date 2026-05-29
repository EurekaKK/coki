export interface ClarificationStatusInput {
  clarifying: boolean;
  hasIntentResult: boolean;
  hasHistory: boolean;
  slow?: boolean;
}

export function getClarificationStatus(input: ClarificationStatusInput) {
  if (!input.clarifying) return null;

  if (input.slow) {
    return {
      title: "仍在分析研究需求",
      description: "模型响应比预期慢；你可以继续等待，也可以跳过澄清按当前理解开始。",
    };
  }

  if (!input.hasIntentResult && !input.hasHistory) {
    return {
      title: "正在判断研究需求",
      description: "Coki 正在判断这个问题是否足够明确；如果不需要追问，会直接进入研究。",
    };
  }

  return {
    title: "正在优化研究设定",
    description: "Coki 正在根据你的回答更新研究范围和输出要求。",
  };
}

export function getResearchStartLabel(input: {
  clarifying: boolean;
  isClear: boolean;
}) {
  if (input.clarifying) return "正在判断需求...";
  if (input.isClear) return "开始研究";
  return "开始研究";
}

export function shouldStartResearchAfterClarification(input: {
  status?: "clear" | "needs_clarification";
  failed?: boolean;
}) {
  if (input.failed) return false;
  return input.status === "clear";
}

export function normalizeCustomClarificationAnswer(answer: string) {
  return answer.trim();
}

export function canSubmitCustomClarificationAnswer(
  answer: string,
  clarifying: boolean,
) {
  return !clarifying && normalizeCustomClarificationAnswer(answer).length > 0;
}
