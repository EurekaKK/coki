import type { PipelineContext } from "./context";

export type NodeId =
  | "init"
  | "plan"
  | "split"
  | "subagents"
  | "reflection"
  | "synthesize"
  | "cite";

export interface PipelineNode {
  id: NodeId;
  run: (ctx: PipelineContext) => Promise<PipelineContext>;
}

export interface Transition {
  from: NodeId;
  decide: (ctx: PipelineContext) => NodeId | "end";
}

export interface PipelineConfig {
  nodes: PipelineNode[];
  transitions: Transition[];
}

export interface PipelineEvent {
  type: "progress" | "log" | "complete" | "error" | "cancelled";
  phase: string;
  message: string;
  data?: unknown;
}

const SAFETY_LIMIT = 20;

export class Pipeline {
  private readonly nodes: Map<NodeId, PipelineNode>;
  private readonly transitions: Map<NodeId, Transition>;

  constructor(config: PipelineConfig) {
    // Build node map
    this.nodes = new Map();
    for (const node of config.nodes) {
      this.nodes.set(node.id, node);
    }

    // Build transition map
    this.transitions = new Map();
    for (const transition of config.transitions) {
      this.transitions.set(transition.from, transition);
    }

    // Validate: all transition targets (except "end") must exist as nodes
    for (const transition of config.transitions) {
      const target = transition.decide({} as PipelineContext);
      if (target !== "end" && !this.nodes.has(target)) {
        throw new Error(
          `Transition from "${transition.from}" targets missing node "${target}"`,
        );
      }
    }
  }

  async *run(
    initialContext: PipelineContext,
    signal?: AbortSignal,
  ): AsyncGenerator<PipelineEvent> {
    let ctx = { ...initialContext };
    let currentNodeId: NodeId = "init";
    let steps = 0;

    for (;;) {
      // Check abort signal
      if (signal?.aborted) {
        yield {
          type: "cancelled",
          phase: currentNodeId,
          message: "Pipeline cancelled by signal",
        };
        return;
      }

      // Safety limit
      if (steps >= SAFETY_LIMIT) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: `Pipeline exceeded safety limit of ${SAFETY_LIMIT} steps`,
        };
        return;
      }
      steps++;

      // Get node
      const node = this.nodes.get(currentNodeId);
      if (!node) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: `Unknown node: ${currentNodeId}`,
        };
        return;
      }

      // Yield progress
      yield {
        type: "progress",
        phase: currentNodeId,
        message: `Running node: ${currentNodeId}`,
      };

      // Run node
      try {
        ctx = await node.run(ctx);
      } catch (err) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: `Node "${currentNodeId}" failed: ${err instanceof Error ? err.message : String(err)}`,
        };
        return;
      }

      // Check context error
      if (ctx.error) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: ctx.error,
        };
        return;
      }

      // Follow transition
      const transition = this.transitions.get(currentNodeId);
      if (!transition) {
        yield {
          type: "error",
          phase: currentNodeId,
          message: `No transition defined for node: ${currentNodeId}`,
        };
        return;
      }

      const next = transition.decide(ctx);
      if (next === "end") {
        yield {
          type: "complete",
          phase: currentNodeId,
          message: "Pipeline complete",
          data: { report: ctx.report, citedReport: ctx.citedReport },
        };
        return;
      }

      currentNodeId = next;
    }
  }
}
