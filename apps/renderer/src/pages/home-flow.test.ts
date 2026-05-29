import { describe, expect, it } from "vitest";
import {
  getResearchStartLabel,
  getClarificationStatus,
  shouldStartResearchAfterClarification,
  canSubmitCustomClarificationAnswer,
  normalizeCustomClarificationAnswer,
} from "./home-flow";

describe("home clarification flow copy", () => {
  it("shows an explicit judging state while the first clarification call is pending", () => {
    expect(
      getClarificationStatus({
        clarifying: true,
        hasIntentResult: false,
        hasHistory: false,
      }),
    ).toEqual({
      title: "正在判断研究需求",
      description: "Coki 正在判断这个问题是否足够明确；如果不需要追问，会直接进入研究。",
    });
  });

  it("shows a stronger waiting state after clarification takes longer than expected", () => {
    expect(
      getClarificationStatus({
        clarifying: true,
        hasIntentResult: false,
        hasHistory: false,
        slow: true,
      }),
    ).toEqual({
      title: "仍在分析研究需求",
      description: "模型响应比预期慢；你可以继续等待，也可以跳过澄清按当前理解开始。",
    });
  });

  it("keeps the primary button focused on starting research after a brief is clear", () => {
    expect(getResearchStartLabel({ clarifying: false, isClear: true })).toBe(
      "开始研究",
    );
  });

  it("starts research whenever clarification has produced a clear brief", () => {
    expect(shouldStartResearchAfterClarification({ status: "clear" })).toBe(true);
    expect(
      shouldStartResearchAfterClarification({ status: "needs_clarification" }),
    ).toBe(false);
  });

  it("does not start raw research when clarification fails before producing a brief", () => {
    expect(shouldStartResearchAfterClarification({ failed: true })).toBe(false);
  });

  it("allows submitting a non-empty custom clarification answer", () => {
    expect(canSubmitCustomClarificationAnswer(" 偏技术和面试准备 ", false)).toBe(true);
    expect(normalizeCustomClarificationAnswer(" 偏技术和面试准备 ")).toBe("偏技术和面试准备");
  });

  it("does not allow empty or pending custom clarification answers", () => {
    expect(canSubmitCustomClarificationAnswer("   ", false)).toBe(false);
    expect(canSubmitCustomClarificationAnswer("偏商业", true)).toBe(false);
  });
});
