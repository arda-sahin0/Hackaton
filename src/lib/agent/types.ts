import type { NetworkId } from "@/config/chains";
import type { Balance, BlockchainAdapter, OracleReading, TxReceipt } from "@/lib/blockchain/types";

/** Bracketed tags shown in the live terminal: `[AGENT] …`, `[SIGNING] …`. */
export type AgentLogLevel =
  | "AGENT"
  | "TOOL"
  | "ORACLE"
  | "SIGNING"
  | "CHAIN"
  | "VERIFIED"
  | "ERROR"
  | "DONE";

export interface AgentEvent {
  id: string;
  seq: number;
  ts: string;
  level: AgentLogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface AgentRunInput {
  network: NetworkId;
  /** Free-text goal; defaults to the generic happy path when empty. */
  objective?: string;
  demoFallback: boolean;
  walletAddress?: string;
}

export interface AgentDecision {
  proceed: boolean;
  action: string;
  amount: string;
  to: string;
  rationale: string;
}

export interface AgentRunResult {
  runId: string;
  ok: boolean;
  durationMs: number;
  decision?: AgentDecision;
  receipt?: TxReceipt;
  events: AgentEvent[];
}

/** Minimal LLM surface the workflow needs — swap the implementation, keep the steps. */
export interface LlmClient {
  readonly mode: "live" | "mock";
  readonly model: string;
  complete(req: LlmRequest): Promise<string>;
}

export type LlmTask = "plan" | "decide";

export interface LlmRequest {
  task: LlmTask;
  system: string;
  prompt: string;
  maxTokens?: number;
}

/** Shared mutable state that flows through the workflow steps. */
export interface AgentRunContext {
  runId: string;
  input: AgentRunInput;
  adapter: BlockchainAdapter;
  llm: LlmClient;
  emit: (level: AgentLogLevel, message: string, data?: Record<string, unknown>) => AgentEvent;
  balance?: Balance;
  oracle?: OracleReading;
  decision?: AgentDecision;
  receipt?: TxReceipt;
  /** Set by a step to stop the workflow early without error (e.g. the agent declined). */
  halted?: boolean;
}

export interface WorkflowStep {
  id: string;
  title: string;
  run(ctx: AgentRunContext): Promise<void>;
}
