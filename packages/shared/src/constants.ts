export const DEPTH_PRESETS = [1, 2, 3] as const;
export type Depth = (typeof DEPTH_PRESETS)[number];

export const PHASES = [
  "init",
  "plan",
  "split",
  "subagents",
  "reflection",
  "synthesize",
  "cite",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_WEIGHTS: Record<Phase, number> = {
  init: 2,
  plan: 8,
  split: 5,
  subagents: 58,
  reflection: 5,
  synthesize: 12,
  cite: 8,
};
