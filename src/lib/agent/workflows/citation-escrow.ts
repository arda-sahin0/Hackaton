/**
 * The citation-escrow happy path: a hirer agent pays a research agent for a literature summary;
 * every cited DOI must be proven real and not retracted (OpenAlex data signed by the API3
 * Airnode); proven → the researcher is paid, otherwise → the hirer is refunded on Masumi.
 *
 *   brief -> research (cardano/ pipeline, streamed) -> hirer re-check -> settle -> verify on-chain
 *
 * The signing code lives in the standalone `cardano/` package (Evolution SDK, x402, viem); this
 * workflow runs it as child processes and streams their `[LEVEL] …` lines into the terminal.
 * With the demo fallback on (or no live lock to act on) the settlement replays the real preprod
 * transactions from `src/config/cardano-proofs.ts`.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CARDANO_PROOFS } from "@/config/cardano-proofs";
import { getNetwork } from "@/config/chains";
import type { TxReceipt } from "@/lib/blockchain/types";
import { explorerTxUrl, shortHash } from "@/lib/explorer";
import type { AgentLogLevel, AgentRunContext, CitationVerification, WorkflowStep } from "../types";

const CARDANO_DIR = resolve(process.cwd(), "cardano");
const DEFAULT_BRIEF = "Write a short literature summary on deep learning for engineers.";
const LEVELS = new Set<AgentLogLevel>(["AGENT", "TOOL", "ORACLE", "VERIFY", "SIGNED", "PAY", "SIGNING", "CHAIN", "VERIFIED", "ERROR", "DONE"]);
const RESULT_MARKER = "==================== RESULT ====================";

interface ChildRun { code: number | null; stdout: string }

/** Runs a cardano/ script, forwarding every `[LEVEL] message` line to the terminal as it arrives. */
function runCardano(ctx: AgentRunContext, script: string, args: string[], env: Record<string, string>, onLine?: (line: string) => void): Promise<ChildRun> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--env-file-if-exists=.env", script, ...args], {
      cwd: CARDANO_DIR,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let buffer = "";
    let inResult = false;
    const handle = (line: string) => {
      if (line.includes(RESULT_MARKER)) { inResult = true; return; }
      if (inResult) return;
      const m = /^\[([A-Z]+)\]\s(.*)$/.exec(line);
      if (m && LEVELS.has(m[1] as AgentLogLevel)) ctx.emit(m[1] as AgentLogLevel, m[2]);
      onLine?.(line);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      buffer += text;
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        handle(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text && !text.startsWith(">")) ctx.emit("TOOL", `stderr: ${text.split("\n")[0].slice(0, 200)}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (buffer.trim()) handle(buffer);
      resolveRun({ code, stdout });
    });
  });
}

function parseVerification(result: string): CitationVerification | null {
  const block = [...result.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  if (!block) return null;
  try { return JSON.parse(block) as CitationVerification; } catch { return null; }
}

function receipt(ctx: AgentRunContext, txHash: string, action: string, simulated: boolean, network: "cardano-preprod" | "evm-sepolia" = "cardano-preprod", explorerUrl?: string): TxReceipt {
  const r: TxReceipt = {
    txHash,
    network,
    explorerUrl: explorerUrl ?? explorerTxUrl(network, txHash),
    status: "pending",
    simulated,
    submittedAt: new Date().toISOString(),
  };
  ctx.receipts = [...(ctx.receipts ?? []), r];
  ctx.emit("CHAIN", `${action}: ${shortHash(txHash)} · ${r.explorerUrl}`, { receipt: r, decision: { action } });
  return r;
}

const brief: WorkflowStep = {
  id: "brief",
  title: "Hirer brief",
  async run(ctx) {
    const net = getNetwork(ctx.input.network);
    const objective = ctx.input.objective?.trim() || DEFAULT_BRIEF;
    const minSources = ctx.input.minSources ?? 1;
    const cheat = ctx.input.cheat ?? "none";
    ctx.emit("AGENT", `Hirer agent on ${net.label}: hiring a research agent — "${objective}" (≥ ${minSources} DOI${minSources === 1 ? "" : "s"})`, { objective, minSources });
    ctx.emit("AGENT", `Seller identity: ${cheat === "none" ? "honest research agent" : `cheating twin (${cheat === "tamper" ? "forges a signed proof" : "cites a retracted paper"})`}`);
    ctx.emit("AGENT", ctx.input.demoFallback
      ? "Demo fallback ON: the report is replayed from the saved fixture; every proof still carries a real Airnode signature."
      : "Live mode: the research agent runs now; Cardano proofs are read back from Blockfrost.");
  },
};

const research: WorkflowStep = {
  id: "research",
  title: "Research agent writes and proves",
  async run(ctx) {
    const objective = ctx.input.objective?.trim() || DEFAULT_BRIEF;
    const minSources = ctx.input.minSources ?? 1;
    const input = `${objective} Cite at least ${minSources} DOI${minSources === 1 ? "" : "s"}.`;
    const mode = ctx.input.demoFallback ? "fixture" : (process.env.RESEARCH_MODE?.trim() || "fixture");
    ctx.emit("TOOL", `Research agent: cardano/src/cli/research.ts (RESEARCH_MODE=${mode}, RESEARCH_CHEAT=${ctx.input.cheat ?? "none"})`);
    const { code, stdout } = await runCardano(ctx, "src/cli/research.ts", [input, ctx.runId], {
      RESEARCH_MODE: mode,
      RESEARCH_CHEAT: ctx.input.cheat ?? "none",
      RESEARCH_PAY_VERIFY: ctx.input.demoFallback ? "false" : (process.env.RESEARCH_PAY_VERIFY ?? "false"),
    });
    const at = stdout.indexOf(RESULT_MARKER);
    if (code !== 0 || at < 0) throw new Error(`research agent exited with code ${code ?? "?"}`);
    const result = stdout.slice(at + RESULT_MARKER.length).trim();
    const verification = parseVerification(result);
    if (!verification) throw new Error("research result carries no verification block");
    ctx.resultText = result;
    ctx.verification = verification;
    ctx.emit("TOOL", `Result ready: report hash ${shortHash(verification.reportHash, 12, 8)} · ${verification.sources.length} DOI(s) · submitted to Masumi with external ref ${verification.externalRef}`, { verification });
    for (const s of verification.sources) {
      if (s.cardanoTx) receipt(ctx, s.cardanoTx, `x402 payment · verify ${s.doi}`, false);
      if (s.dataPaymentTx) receipt(ctx, s.dataPaymentTx, `aUSD data payment · ${s.doi}`, false, "evm-sepolia", `https://sepolia.basescan.org/tx/${s.dataPaymentTx}`);
    }
    if ("jobId" in verification.evm) {
      receipt(ctx, verification.evm.createTx, `CitationEscrow.createJob #${verification.evm.jobId}`, false, "evm-sepolia", `https://sepolia.basescan.org/tx/${verification.evm.createTx}`);
      receipt(ctx, verification.evm.deliverTx, `CitationEscrow.deliver #${verification.evm.jobId}`, false, "evm-sepolia", `https://sepolia.basescan.org/tx/${verification.evm.deliverTx}`);
      for (const p of verification.evm.proveTxs) if (p.txHash) receipt(ctx, p.txHash, `proveSource ${p.doi} (${p.ok ? "accepted" : "rejected"})`, false, "evm-sepolia", `https://sepolia.basescan.org/tx/${p.txHash}`);
    }
    if (ctx.input.demoFallback) {
      // Replay the paid x402 verifications this team made on preprod for the same DOIs.
      for (const s of verification.sources) {
        const known = s.doi === "10.1038/nature14539" ? CARDANO_PROOFS.verifyValid : s.doi === "10.1038/nature00870" ? CARDANO_PROOFS.verifyRetracted : null;
        if (known && !s.cardanoTx) receipt(ctx, known, `x402 payment · verify ${s.doi} (1 tADA)`, true);
      }
    }
  },
};

const hirerCheck: WorkflowStep = {
  id: "hirer-check",
  title: "Hirer re-checks every proof",
  async run(ctx) {
    const dir = mkdtempSync(join(tmpdir(), "citation-"));
    const file = join(dir, "result.txt");
    writeFileSync(file, ctx.resultText ?? "");
    ctx.emit("AGENT", "Hirer agent: re-verifying each Airnode signature and request hash myself (never trusting the seller's verdict)…");
    const { stdout, code } = await runCardano(ctx, "src/cli/hirer.ts", ["verify", file], {});
    if (code !== 0) throw new Error(`hirer verify exited with code ${code ?? "?"}`);
    const done = /\[DONE\] (pay|refund)/.exec(stdout);
    ctx.hirerDecision = done?.[1] === "pay" ? "pay" : "refund";
    const counted = /DECISION: (?:all )?(\d+)\/(\d+)/.exec(stdout);
    if (counted) ctx.hirerProven = { proven: Number(counted[1]), total: Number(counted[2]) };
  },
};

const settle: WorkflowStep = {
  id: "settle",
  title: "Settle on Masumi",
  async run(ctx) {
    const decision = ctx.hirerDecision ?? "refund";
    const lock = process.env.CARDANO_LOCK_TX_HASH?.trim();
    const live = !ctx.input.demoFallback && /^[0-9a-f]{64}$/.test(lock ?? "");
    receipt(ctx, live ? lock! : CARDANO_PROOFS.escrowLock, "Masumi escrow: hirer's ADA locked for the job", !live);
    if (decision === "pay") {
      ctx.emit("AGENT", "DECISION: all sources proven → no action; Masumi releases the ADA to the research agent after the dispute window.");
      return;
    }
    ctx.emit("AGENT", "DECISION: not all sources proven → request a refund on the Masumi escrow before unlockTime.");
    if (live) {
      ctx.emit("SIGNING", `Hirer wallet signs SetRefundRequested on escrow ${shortHash(lock!)} …`);
      let txHash: string | undefined;
      const { code } = await runCardano(ctx, "src/cli/escrow.ts", ["request", lock!, `verifier: run ${ctx.runId} not fully proven`], {}, (line) => {
        const m = /submitted ([0-9a-f]{64})/.exec(line) ?? /transaction\/([0-9a-f]{64})/.exec(line);
        if (m) txHash = m[1];
      });
      if (code !== 0 || !txHash) throw new Error("refund request failed (see terminal)");
      receipt(ctx, txHash, "Refund requested (escrow → Disputed)", false);
      return;
    }
    ctx.emit("SIGNING", "Replaying the proven refund path (hirer request → seller authorizes → hirer withdraws)…");
    receipt(ctx, CARDANO_PROOFS.refundRequest, "Refund requested (escrow → Disputed)", true);
    receipt(ctx, CARDANO_PROOFS.refundAuthorize, "Seller authorizes the refund", true);
    receipt(ctx, CARDANO_PROOFS.refundWithdraw, "Hirer withdraws the refund (escrow closed)", true);
  },
};

const verifyOnChain: WorkflowStep = {
  id: "verify",
  title: "Verify on-chain",
  async run(ctx) {
    const pending = (ctx.receipts ?? []).filter((r) => r.network === "cardano-preprod");
    if (!pending.length) { ctx.emit("DONE", "No Cardano transactions to verify."); return; }
    ctx.emit("CHAIN", `Confirming ${pending.length} Cardano transaction(s) on Blockfrost …`);
    for (const r of pending) {
      let status = r.status;
      for (let attempt = 1; attempt <= 6 && status === "pending"; attempt += 1) {
        status = await ctx.adapter.getTransactionStatus(r.txHash);
      }
      if (status === "verified") ctx.emit("VERIFIED", `Confirmed on Cardanoscan: ${shortHash(r.txHash)}${r.simulated ? " (replayed, real preprod tx)" : ""}`, { txHash: r.txHash, status, explorerUrl: r.explorerUrl });
      else ctx.emit("ERROR", `Could not confirm ${shortHash(r.txHash)} — left as Pending.`, { txHash: r.txHash, status: "pending" });
    }
    ctx.receipt = ctx.receipts?.at(-1);
    const proven = ctx.hirerProven ?? { proven: 0, total: ctx.verification?.sources.length ?? 0 };
    ctx.emit("DONE", `${ctx.hirerDecision === "pay" ? "Research agent paid" : "Hirer refunded"} · ${proven.proven}/${proven.total} sources proven by the hirer's own check`);
  },
};

export const citationEscrowWorkflow: WorkflowStep[] = [brief, research, hirerCheck, settle, verifyOnChain];
