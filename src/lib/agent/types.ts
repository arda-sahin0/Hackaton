import type { NetworkId } from "@/config/chains";
import type { Balance, BlockchainAdapter, OracleReading, TxReceipt } from "@/lib/blockchain/types";

/** Bracketed tags shown in the live terminal: `[AGENT] …`, `[SIGNING] …`. */
export type AgentLogLevel =
  | "AGENT"
  | "TOOL"
  | "ORACLE"
  | "VERIFY"
  | "SIGNED"
  | "PAY"
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
  /** citation-escrow (hirer ⇄ research agent, default on Cardano) or the generic happy path. */
  workflow?: AgentWorkflowId;
  /** The seller identity for the demo: honest, or a cheating twin. */
  cheat?: SellerMode;
  /** Minimum number of DOIs the report must cite and prove. */
  minSources?: number;
}

export type AgentWorkflowId = "citation-escrow" | "generic";
export type SellerMode = "none" | "retracted" | "tamper";

/** The `## Verification` JSON block the research agent appends to its Masumi result (cardano/src/research/agent.ts). */
export interface CitationVerification {
  reportHash: string;
  externalRef: string;
  externalRefHash: string;
  minSources: number;
  sources: Array<{
    doi: string;
    title?: string;
    proven: boolean;
    reason?: string;
    verdict?: "valid" | "retracted";
    proofSource?: string;
    cardanoTx?: string;
    dataPaymentTx?: string;
  }>;
  evm: { skipped: string } | { jobId: string; createTx: string; deliverTx: string; proveTxs: Array<{ doi: string; txHash: string; ok: boolean }>; fullyProven: boolean | null };
  allProven: boolean;
  cheat: string;
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
  /** citation-escrow workflow: the research agent's result and the hirer's verdict. */
  verification?: CitationVerification;
  resultText?: string;
  hirerDecision?: "pay" | "refund";
  hirerProven?: { proven: number; total: number };
  /** Every on-chain receipt produced by the run (rows of the proof table). */
  receipts?: TxReceipt[];
  /** Set by a step to stop the workflow early without error (e.g. the agent declined). */
  halted?: boolean;
}

export interface WorkflowStep {
  id: string;
  title: string;
  run(ctx: AgentRunContext): Promise<void>;
}
