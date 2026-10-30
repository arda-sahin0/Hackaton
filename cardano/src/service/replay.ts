/**
 * Demo fallback: a recorded hirer run with real, pre-verified preprod
 * transactions (2026-10-30 13:31 UTC, `npm run hire -- --verdict fail --seller-accepts`).
 * Replayed when the dashboard asks for demoFallback, or when a live run fails
 * (conference Wi-Fi, Blockfrost or facilitator down). Every hash is on chain.
 */
import type { Tag } from "../hirer/hirer.ts";

export interface ReplayStep { delayMs: number; tag: Tag; message: string; txHash?: string }

const LOCK = "eabaa0710080fbe650776fcf3934f46a3d224d72a496d21c59be32b62c25226d";
const RESULT = "9635c837f8a463d7c125ea9b410afbcd5b89bc06b749350dea1b1ba6cdedd0ce";
const REQUEST = "588dc2583f782b5da2dcc8fc5867f2296b3878f1fa3f5551664c40c8a243c62f";
const AUTHORIZE = "eb8d7f89bd7cacf7358401be1f608fd0461af2ff90ed0f90af91dc41dce288ef";
const WITHDRAW = "a178b8d5945edfeaccd03eb7a2db85bf8f701b1674f4304576467bd4c1dbf8f1";

const common: ReplayStep[] = [
  { delayMs: 400, tag: "AGENT", message: "Hiring research agent — task: \"hello from the hirer agent\"" },
  { delayMs: 900, tag: "SIGNING", message: "Answering the agent's 402 offer: locking the price in Masumi escrow (signed server-side)" },
  { delayMs: 2200, tag: "CHAIN", message: "Escrow locked — job 475edd66-b04c-4ad2-94b6-45b1652c8597", txHash: LOCK },
  { delayMs: 800, tag: "AGENT", message: "Waiting for the agent to deliver and put its result hash on chain …" },
  { delayMs: 2000, tag: "CHAIN", message: "Agent submitted its result hash (state ResultSubmitted)", txHash: RESULT },
  { delayMs: 700, tag: "VERIFIED", message: "Delivered report matches the result hash on chain (MIP-004)" },
];

export const REPLAY: Record<"pass" | "fail", { steps: ReplayStep[]; outcome: "paid-out" | "refunded"; txs: Array<{ step: string; txHash: string }> }> = {
  fail: {
    outcome: "refunded",
    steps: [
      ...common,
      { delayMs: 700, tag: "TOOL", message: "Verdict for this run: FAIL" },
      { delayMs: 500, tag: "AGENT", message: "Decision: FAIL — report rejected" },
      { delayMs: 600, tag: "SIGNING", message: "Requesting a refund on the Masumi escrow (SetRefundRequested)" },
      { delayMs: 2000, tag: "CHAIN", message: "Refund requested — escrow now Disputed", txHash: REQUEST },
      { delayMs: 700, tag: "SIGNING", message: "[demo] Honest seller accepts the refund (AuthorizeRefund)" },
      { delayMs: 1800, tag: "CHAIN", message: "Seller authorized the refund", txHash: AUTHORIZE },
      { delayMs: 600, tag: "SIGNING", message: "Withdrawing the refund (WithdrawRefund)" },
      { delayMs: 1800, tag: "VERIFIED", message: "Refund back in the hirer's wallet — escrow closed", txHash: WITHDRAW },
      { delayMs: 400, tag: "DONE", message: "Rejected report: payment refunded" },
    ],
    txs: [
      { step: "escrow lock", txHash: LOCK },
      { step: "result submitted", txHash: RESULT },
      { step: "refund request", txHash: REQUEST },
      { step: "refund authorized", txHash: AUTHORIZE },
      { step: "refund withdrawn", txHash: WITHDRAW },
    ],
  },
  pass: {
    outcome: "paid-out",
    steps: [
      ...common,
      { delayMs: 700, tag: "TOOL", message: "Verdict for this run: PASS" },
      { delayMs: 500, tag: "AGENT", message: "Decision: PASS — report accepted" },
      { delayMs: 500, tag: "DONE", message: "Payment stays in escrow for the agent: it collects after the unlock time" },
    ],
    txs: [
      { step: "escrow lock", txHash: LOCK },
      { step: "result submitted", txHash: RESULT },
    ],
  },
};
