import { getAdapter } from "@/lib/blockchain";
import type { AgentEventBus } from "./events";
import { createLlmClient } from "./llm";
import type { AgentRunContext, AgentRunInput, AgentRunResult, LlmClient, WorkflowStep } from "./types";
import { agenticPaymentWorkflow } from "./workflows/agentic-payment";
import { citationEscrowWorkflow } from "./workflows/citation-escrow";

export interface RunOptions {
  steps?: WorkflowStep[];
  llm?: LlmClient;
  /** Aborted when the browser disconnects; the run stops at the next step boundary. */
  signal?: AbortSignal;
}

/**
 * Runs a workflow (default: the agentic-payment happy path) step by step, streaming every
 * `[LEVEL] message` through the bus. Never throws: failures surface as `[ERROR]` + `[DONE]`.
 */
export async function runAgentWorkflow(
  input: AgentRunInput,
  bus: AgentEventBus,
  runId: string,
  options: RunOptions = {},
): Promise<AgentRunResult> {
  const started = Date.now();
  const workflow = input.workflow ?? (input.network === "cardano-preprod" ? "citation-escrow" : "generic");
  const steps = options.steps ?? (workflow === "citation-escrow" ? citationEscrowWorkflow : agenticPaymentWorkflow);
  const adapter = getAdapter(input.network, {
    demoFallback: input.demoFallback,
    onFallback: ({ operation, reason }) => {
      if (reason !== "demo fallback enabled") {
        bus.emit("CHAIN", `Fallback engaged for ${operation}: ${reason}`);
      }
    },
  });

  const ctx: AgentRunContext = {
    runId,
    input,
    adapter,
    llm: options.llm ?? createLlmClient({ demoFallback: input.demoFallback }),
    emit: (level, message, data) => bus.emit(level, message, data),
  };

  let ok = true;
  try {
    for (const step of steps) {
      if (options.signal?.aborted) {
        bus.emit("DONE", "Run cancelled — client disconnected.");
        ctx.halted = true;
        break;
      }
      await step.run(ctx);
      if (ctx.halted) break;
    }
    if (!ctx.halted) {
      bus.emit("DONE", `Run complete in ${((Date.now() - started) / 1000).toFixed(1)}s`, {
        receipt: ctx.receipt,
      });
    }
  } catch (error) {
    ok = false;
    const message = error instanceof Error ? error.message : String(error);
    bus.emit("ERROR", message);
    bus.emit("DONE", "Run aborted after an unrecoverable error.");
  }

  ok = ok && !bus.events.some((e) => e.level === "ERROR");

  return {
    runId,
    ok,
    durationMs: Date.now() - started,
    decision: ctx.decision,
    receipt: ctx.receipt,
    events: bus.events,
  };
}
