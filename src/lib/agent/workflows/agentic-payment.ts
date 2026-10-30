/**
 * The generic agentic-payment happy path, as an ordered list of steps. Each step emits terminal
 * events and mutates the shared context. Sponsor-specific logic is NOT here (directive §2A) —
 * it lives behind the BlockchainAdapter the context carries.
 *
 *   analyze -> wallet -> oracle -> decide -> sign -> broadcast -> verify -> done
 */
import { AGENT_MAX_AMOUNT, getNetwork } from "@/config/chains";
import { sleep } from "@/lib/blockchain/fallback";
import { shortHash } from "@/lib/explorer";
import type { AgentDecision, WorkflowStep } from "../types";

const DEFAULT_OBJECTIVE = "Pay for one verified data reading and prove it on-chain.";

function clampAmount(raw: string, max: string): string {
  const n = Number(raw);
  const cap = Number(max);
  if (!Number.isFinite(n) || n <= 0) return cap.toString();
  return Math.min(n, cap).toString();
}

function parseDecision(text: string, fallbackTo: string): AgentDecision {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: Partial<AgentDecision> = {};
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1)) as Partial<AgentDecision>;
    } catch {
      parsed = {};
    }
  }
  return {
    proceed: parsed.proceed !== false,
    action: parsed.action || "bounded-payment",
    amount: clampAmount(parsed.amount ?? "", AGENT_MAX_AMOUNT),
    to: parsed.to && parsed.to.length > 0 ? parsed.to : fallbackTo,
    rationale:
      parsed.rationale || "Inputs within policy; executing one bounded payment (default rationale).",
  };
}

const analyze: WorkflowStep = {
  id: "analyze",
  title: "Analyze objective",
  async run(ctx) {
    const objective = ctx.input.objective?.trim() || DEFAULT_OBJECTIVE;
    const net = getNetwork(ctx.input.network);
    ctx.emit("AGENT", `Objective received on ${net.label} (${net.sponsor} track): "${objective}"`, { objective });
    ctx.emit("AGENT", `Reasoning engine: ${ctx.llm.mode} — ${ctx.llm.model}`);
    if (ctx.llm.mode === "live") ctx.emit("AGENT", `Consulting ${ctx.llm.model}…`);
    const plan = await ctx.llm.complete({
      task: "plan",
      system:
        "You are an autonomous payment agent operating on a blockchain testnet. Answer in at most 4 short numbered steps, plain text, no markdown.",
      prompt: `Network: ${net.label} (${net.currency.symbol}). Objective: ${objective}. Produce the execution plan.`,
      maxTokens: 300,
    });
    ctx.emit("AGENT", `Plan: ${plan.replace(/\s+/g, " ").trim()}`);
  },
};

const wallet: WorkflowStep = {
  id: "wallet",
  title: "Read wallet state",
  async run(ctx) {
    ctx.emit("TOOL", `Reading wallet balance via ${ctx.adapter.network} adapter…`);
    const balance = await ctx.adapter.getBalance(ctx.input.walletAddress);
    ctx.balance = balance;
    ctx.emit("TOOL", `Balance: ${balance.amount} ${balance.symbol}${balance.simulated ? " (simulated)" : ""}`, {
      balance,
    });
  },
};

const oracle: WorkflowStep = {
  id: "oracle",
  title: "Query oracle",
  async run(ctx) {
    const net = getNetwork(ctx.input.network);
    ctx.emit("ORACLE", `Querying ${net.oracle.label} …`);
    const reading = await ctx.adapter.readOracle();
    ctx.oracle = reading;
    ctx.emit(
      "ORACLE",
      `${reading.label} = ${reading.value}${reading.unit ? ` ${reading.unit}` : ""} · source: ${reading.source}`,
      { oracle: reading },
    );
  },
};

const decide: WorkflowStep = {
  id: "decide",
  title: "Decide",
  async run(ctx) {
    const net = getNetwork(ctx.input.network);
    ctx.emit("AGENT", `Evaluating policy (max ${AGENT_MAX_AMOUNT} ${net.currency.symbol} per action)…`);
    if (ctx.llm.mode === "live") ctx.emit("AGENT", `Consulting ${ctx.llm.model}…`);
    const raw = await ctx.llm.complete({
      task: "decide",
      system:
        'You are an autonomous payment agent. Decide whether to execute ONE bounded payment. Respond with ONLY a JSON object: {"proceed": boolean, "action": string, "amount": string, "to": string, "rationale": string}. amount must be <= the policy maximum. No prose outside the JSON.',
      prompt: JSON.stringify({
        network: net.label,
        currency: net.currency.symbol,
        balance: ctx.balance?.amount,
        oracle: ctx.oracle ? { label: ctx.oracle.label, value: ctx.oracle.value, unit: ctx.oracle.unit } : null,
        policyMaxAmount: AGENT_MAX_AMOUNT,
        defaultRecipient: net.sampleRecipient,
        objective: ctx.input.objective?.trim() || DEFAULT_OBJECTIVE,
      }),
      maxTokens: 400,
    });
    const decision = parseDecision(raw, net.sampleRecipient);
    ctx.decision = decision;
    if (!decision.proceed) {
      ctx.emit("AGENT", `Decision: DO NOT transact — ${decision.rationale}`, { decision });
      ctx.emit("DONE", "Run finished without a transaction (agent declined).");
      ctx.halted = true;
      return;
    }
    ctx.emit(
      "AGENT",
      `Decision: ${decision.action} · ${decision.amount} ${net.currency.symbol} → ${shortHash(decision.to, 10, 6)} — ${decision.rationale}`,
      { decision },
    );
  },
};

const sign: WorkflowStep = {
  id: "sign",
  title: "Sign",
  async run(ctx) {
    const net = getNetwork(ctx.input.network);
    const d = ctx.decision!;
    ctx.emit("SIGNING", `Preparing transaction: ${d.amount} ${net.currency.symbol} → ${shortHash(d.to, 10, 6)}`);
    await sleep(400);
    ctx.emit(
      "SIGNING",
      ctx.input.demoFallback
        ? "Demo fallback: no live signature — the pre-verified transaction will be replayed…"
        : "Requesting a signature from the agent wallet (live path — falls back to the pre-verified replay if no wallet SDK is wired)…",
    );
  },
};

const broadcast: WorkflowStep = {
  id: "broadcast",
  title: "Broadcast",
  async run(ctx) {
    const d = ctx.decision!;
    const net = getNetwork(ctx.input.network);
    ctx.emit("CHAIN", `Broadcasting to ${net.label} …`);
    const receipt = await ctx.adapter.executeAgentTransaction({
      to: d.to,
      amount: d.amount,
      memo: d.action,
      metadata: { runId: ctx.runId, oracle: ctx.oracle?.value },
    });
    ctx.receipt = receipt;
    ctx.emit(
      "CHAIN",
      `${receipt.simulated ? "Replayed pre-verified tx" : "Transaction accepted"}: ${shortHash(receipt.txHash)} · ${receipt.explorerUrl}`,
      { receipt },
    );
  },
};

const verify: WorkflowStep = {
  id: "verify",
  title: "Verify on-chain",
  async run(ctx) {
    const receipt = ctx.receipt!;
    const net = getNetwork(ctx.input.network);
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const status = await ctx.adapter.getTransactionStatus(receipt.txHash);
      if (status === "verified") {
        ctx.receipt = { ...receipt, status };
        ctx.emit(
          "VERIFIED",
          receipt.simulated
            ? `Replay confirmed (pre-verified tx, not a live broadcast): ${shortHash(receipt.txHash)}`
            : `Confirmed on ${net.explorer.name}: ${shortHash(receipt.txHash)}`,
          {
          txHash: receipt.txHash,
          status,
          explorerUrl: receipt.explorerUrl,
        });
        return;
      }
      if (status === "failed") {
        ctx.receipt = { ...receipt, status };
        ctx.emit("ERROR", `Transaction failed on-chain: ${shortHash(receipt.txHash)}`, { txHash: receipt.txHash, status });
        ctx.emit("DONE", "Run finished with a failed transaction.");
        ctx.halted = true;
        return;
      }
      ctx.emit("CHAIN", `Pending… (poll ${attempt})`, { txHash: receipt.txHash, status });
    }
    ctx.emit("ERROR", "Verification timed out — leaving the transaction as Pending.", { txHash: receipt.txHash });
    ctx.emit("DONE", "Run finished without on-chain confirmation (verification timed out).");
    ctx.halted = true;
  },
};

export const agenticPaymentWorkflow: WorkflowStep[] = [analyze, wallet, oracle, decide, sign, broadcast, verify];
