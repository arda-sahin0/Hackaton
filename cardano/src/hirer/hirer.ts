/**
 * The hirer agent's loop for one job on Cardano preprod:
 *
 *   1. hire     POST the job to the agent's x402 endpoint; the 402 offer is paid
 *               by locking the price in Masumi's escrow, signed server-side
 *   2. watch    follow the escrow until the agent puts its result hash on chain;
 *               fetch the result and check it matches that hash (MIP-004)
 *   3. decide   ask a VerdictSource whether the result earned its payment
 *   4. act      pass → do nothing, the seller collects after unlock_time
 *               fail → request a refund before unlock_time; once the seller
 *               authorizes it, withdraw the refund
 *
 * Every step is reported through `emit` with the dashboard terminal's tags.
 */
import { createHash, randomBytes } from "node:crypto";
import { clientForKey, explorerTx, makeClient, STATE, stateName, trackEscrow, type Blockfrost, type Escrow, type EscrowStatus } from "../escrow.ts";
import { createParty } from "../refund.ts";
import { settlementTx } from "../x402-client.ts";
import type { VerdictSource } from "./verdict.ts";

/** The dashboard terminal's levels (src/lib/agent/types.ts AgentLogLevel). */
export type Tag = "AGENT" | "TOOL" | "ORACLE" | "SIGNING" | "CHAIN" | "VERIFIED" | "ERROR" | "DONE";
export interface HirerEvent { at: string; tag: Tag; message: string; txHash?: string; explorerUrl?: string }
export type Emit = (tag: Tag, message: string, txHash?: string) => void;

export interface HireOptions {
  bf: Blockfrost;
  buyerMnemonic: string;
  /** A fetch that pays x402 offers from the buyer wallet (see makePayingFetch). */
  payingFetch: typeof fetch;
  /** e.g. https://<agent>/x402/start_job/ada */
  offerUrl: string;
  /** The job's input text. */
  task: string;
  verdict: VerdictSource;
  /** Demo only: also play the honest seller and accept the refund (needs SELLER_MNEMONIC). */
  sellerAcceptsWith?: string;
  onEvent?: (event: HirerEvent) => void;
  pollMs?: number;
}

export interface HireResult {
  jobId: string;
  lockTx: string;
  outcome: "paid-out" | "refunded" | "refund-requested" | "failed";
  txs: Array<{ step: string; txHash: string }>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const agentBase = (offerUrl: string) => offerUrl.replace(/\/x402\/start_job(\/[a-z]+)?\/?$/, "");

export async function runHirerJob(opts: HireOptions): Promise<HireResult> {
  const pollMs = opts.pollMs ?? 15_000;
  const txs: HireResult["txs"] = [];
  const emit: Emit = (tag, message, txHash) => {
    opts.onEvent?.({ at: new Date().toISOString(), tag, message, ...(txHash ? { txHash, explorerUrl: explorerTx(txHash) } : {}) });
  };
  const record = (step: string, txHash: string) => { txs.push({ step, txHash }); };

  // ---- 1. hire
  const identifier = randomBytes(10).toString("hex");
  const body = { identifier_from_purchaser: identifier, input_data: { text: opts.task } };
  emit("AGENT", `Hiring agent at ${agentBase(opts.offerUrl)} — task: "${opts.task.slice(0, 80)}"`);
  emit("SIGNING", "Answering the agent's 402 offer: locking the price in Masumi escrow (signed server-side)");
  const response = await opts.payingFetch(opts.offerUrl, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const job = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  const lockTx = settlementTx(response);
  if (!response.ok || !lockTx || !job.id) {
    emit("ERROR", `Hire failed: HTTP ${response.status} ${job.error ?? ""}`.trim());
    return { jobId: job.id ?? "", lockTx: lockTx ?? "", outcome: "failed", txs };
  }
  record("escrow lock", lockTx);
  emit("CHAIN", `Escrow locked — job ${job.id}`, lockTx);

  // ---- 2. watch
  const reader = makeClient(opts.bf, opts.buyerMnemonic); // any client can read the chain
  emit("AGENT", "Waiting for the agent to deliver and put its result hash on chain …");
  let status: EscrowStatus | undefined;
  while (!status || (status.open && status.datum.state === STATE.FundsLocked)) {
    await sleep(pollMs);
    try {
      status = await trackEscrow(opts.bf, reader, lockTx);
    } catch (error) {
      // The lock may not be indexed yet; keep polling.
      if (!String(error).includes("no escrow output")) emit("ERROR", `Tracking: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (status.open && status.datum.state === STATE.FundsLocked && Date.now() > Number(status.datum.submitResultTime) + 60_000) {
      emit("ERROR", "No result before submit_result_time — the hirer can reclaim the lock (WithdrawRefund).");
      return { jobId: job.id, lockTx, outcome: "failed", txs };
    }
  }
  if (!status.open) {
    emit("ERROR", `Escrow closed unexpectedly by ${status.closedBy}`, status.closedBy);
    return { jobId: job.id, lockTx, outcome: "failed", txs };
  }
  const escrow: Escrow = status;
  // The lock names one payment key of the buyer's seed; resolve the matching address for signing.
  const buyer = await clientForKey(opts.bf, opts.buyerMnemonic, escrow.datum.buyer.payment.hash);
  const resultTx = escrow.history.at(-1)!;
  record("result submitted", resultTx);
  emit("CHAIN", `Agent submitted its result hash (state ${stateName(escrow.datum.state)})`, resultTx);

  const delivered = (await (await fetch(`${agentBase(opts.offerUrl)}/status?job_id=${job.id}`)).json()) as { result?: string };
  const report = delivered.result ?? "";
  const onChain = escrow.datum.resultHash;
  const matches = sha256(`${identifier};${report}`) === onChain;
  emit(matches ? "VERIFIED" : "ERROR", matches
    ? "Delivered result matches the result hash on chain (MIP-004)"
    : "Delivered result does NOT match the on-chain result hash — treating as failed delivery");

  // ---- 3. decide
  const decision = matches ? await opts.verdict(report, emit) : { verdict: "fail" as const, reasons: ["result hash mismatch"], paidTxs: [] };
  for (const tx of decision.paidTxs) record("verification fee", tx);
  emit("AGENT", `Decision: ${decision.verdict.toUpperCase()}${decision.reasons.length ? ` — ${decision.reasons.join("; ")}` : ""}`);

  // ---- 4. act
  if (decision.verdict === "pass") {
    emit("DONE", `Payment stays in escrow for the agent: it can collect after ${new Date(Number(escrow.datum.unlockTime)).toISOString()}`);
    return { jobId: job.id, lockTx, outcome: "paid-out", txs };
  }

  const party = createParty({ bf: opts.bf, ...buyer });
  emit("SIGNING", "Requesting a refund on the Masumi escrow (SetRefundRequested)");
  const requested = await party.requestRefund(escrow, [`verifier: ${decision.reasons[0] ?? "failed"}`.slice(0, 64)]);
  record("refund request", requested.txHash);
  emit("CHAIN", `Refund requested — escrow now ${requested.newState}`, requested.txHash);

  if (opts.sellerAcceptsWith) {
    const after = await trackEscrow(opts.bf, buyer.client, lockTx);
    if (after.open) {
      const seller = await clientForKey(opts.bf, opts.sellerAcceptsWith, after.datum.seller.payment.hash);
      emit("SIGNING", "[demo] Honest seller accepts the refund (AuthorizeRefund)");
      const authorized = await createParty({ bf: opts.bf, ...seller }).authorizeRefund(after);
      record("refund authorized", authorized.txHash);
      emit("CHAIN", "Seller authorized the refund", authorized.txHash);
    }
  }

  emit("AGENT", "Waiting for the seller to authorize the refund …");
  for (let i = 0; i < 40; i++) {
    const now = await trackEscrow(opts.bf, buyer.client, lockTx);
    if (!now.open) break;
    if (now.datum.state === STATE.RefundAuthorized) {
      emit("SIGNING", "Withdrawing the refund (WithdrawRefund)");
      const withdrawn = await party.withdrawRefund(now);
      record("refund withdrawn", withdrawn.txHash);
      emit("VERIFIED", "Refund back in the hirer's wallet — escrow closed", withdrawn.txHash);
      emit("DONE", "Rejected result: payment refunded");
      return { jobId: job.id, lockTx, outcome: "refunded", txs };
    }
    await sleep(pollMs);
  }
  emit("DONE", "Refund requested; the seller has not authorized it yet (a contested refund goes to Masumi arbitration)");
  return { jobId: job.id, lockTx, outcome: "refund-requested", txs };
}
