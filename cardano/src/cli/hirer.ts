/**
 * The hirer (buyer) agent: creates a research Task on Sokosumi, waits for the
 * result, re-checks every signed proof itself (never trusting the seller's own
 * verdict), reads CitationEscrow.isFullyProven when the contract is deployed,
 * and decides: all proven -> let Masumi pay the researcher; otherwise -> request
 * a refund on the Masumi escrow before unlockTime.
 *
 *   npm run hirer -- create "<brief>" [minSources]        create, wait, verify, decide
 *   npm run hirer -- check  <taskId> [lockTxHash]        re-evaluate; with a lock tx, act on it
 *
 * Every decision is appended as an orchestrator event to .local/hirer-events.jsonl
 * (what the dashboard terminal streams) and printed as [LEVEL] lines.
 */
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { verifySignedResponse, type SignedResponse } from "../../../api3evm/src/airnode-v2.ts";
import { deriveWorkRequestHash, OPENALEX_AIRNODE_V2_ADDRESS, type SignedWork } from "../../../api3evm/src/openalex.ts";
import { isFullyProven } from "../evm/citation-escrow.ts";
import { blockfrostFromEnv, clientForKey, explorerTx, makeClient, trackEscrow } from "../escrow.ts";
import { createParty } from "../refund.ts";
import type { Verification } from "../research/agent.ts";

const run = promisify(execFile);
const env = process.env;
const COWORKER_ID = env.COWORKER_ID?.trim() ?? "";
const ORG_SLUG = env.SOKOSUMI_ORGANIZATION_SLUG?.trim() ?? "";
const EVENTS = new URL("../../.local/hirer-events.jsonl", import.meta.url);
mkdirSync(new URL("./", EVENTS), { recursive: true });

type Level = "AGENT" | "TOOL" | "VERIFY" | "CHAIN" | "SIGNING" | "ERROR" | "DONE";
function emit(level: Level, message: string, data?: Record<string, unknown>) {
  console.log(`[${level}] ${message}`);
  appendFileSync(EVENTS, JSON.stringify({ at: new Date().toISOString(), level, message, ...(data ? { data } : {}) }) + "\n");
}

async function sokosumi<T>(args: string[]): Promise<T> {
  const { stdout } = await run("sokosumi", ["--preprod", ...args, "--json"], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

interface Task { id: string; status: string; name?: string; result?: string | null; [k: string]: unknown }

async function getTask(taskId: string): Promise<Task> {
  const r = await sokosumi<{ task?: Task } & Task>(["tasks", "get", taskId, "--organization-slug", ORG_SLUG]);
  return r.task ?? r;
}

async function taskResult(taskId: string): Promise<string | undefined> {
  const task = await getTask(taskId);
  if (typeof task.result === "string" && task.result.trim()) return task.result;
  // The completion event carries the result as its comment.
  const ev = await sokosumi<{ events: Array<{ status?: string; comment?: string; createdAt?: string }> }>(["tasks", "events", taskId, "--organization-slug", ORG_SLUG]);
  const done = (ev.events ?? []).filter(e => e.status === "COMPLETED" && typeof e.comment === "string" && e.comment.includes("## Verification")).at(-1);
  return done?.comment;
}

/** Independent re-check of the seller's proofs. Returns the number proven and the reasons for the rest. */
async function recheck(v: Verification): Promise<{ proven: number; total: number; reasons: string[]; chain: boolean | null }> {
  const reasons: string[] = [];
  let proven = 0;
  for (const s of v.sources) {
    const proof = s.proof as SignedResponse | undefined;
    if (!proof) { reasons.push(`${s.doi}: no signed proof`); continue; }
    try {
      await verifySignedResponse(proof, OPENALEX_AIRNODE_V2_ADDRESS, deriveWorkRequestHash(s.doi));
      const work = JSON.parse(proof.data) as SignedWork;
      if (work.is_retracted) { reasons.push(`${s.doi}: retracted`); continue; }
      proven++;
      emit("VERIFY", `${s.doi}: Airnode signature valid, not retracted — "${work.title}"`);
    } catch (error) {
      const m = error instanceof Error ? error.message : String(error);
      reasons.push(`${s.doi}: ${m}`);
      emit("VERIFY", `${s.doi}: REJECTED — ${m}`);
    }
  }
  let chain: boolean | null = null;
  if ("jobId" in v.evm) {
    const r = await isFullyProven(BigInt(v.evm.jobId), env);
    if (typeof r === "boolean") { chain = r; emit("CHAIN", `CitationEscrow.isFullyProven(${v.evm.jobId}) = ${r}`); }
    else emit("CHAIN", `isFullyProven skipped: ${r.skipped}`);
  }
  return { proven, total: v.sources.length, reasons, chain };
}

function parseVerification(result: string): Verification | null {
  const block = [...result.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  if (!block) return null;
  try { return JSON.parse(block) as Verification; } catch { return null; }
}

async function decide(taskId: string, result: string): Promise<"pay" | "refund"> {
  const v = parseVerification(result);
  if (!v) { emit("ERROR", "result carries no verification block"); return "refund"; }
  emit("AGENT", `result for ${taskId}: ${v.sources.length} cited DOI(s), minSources ${v.minSources}, report hash ${v.reportHash}`);
  const { proven, total, reasons, chain } = await recheck(v);
  const enough = proven >= Math.max(1, v.minSources) && proven === total;
  const ok = chain === null ? enough : chain && enough;
  for (const r of reasons) emit("AGENT", `unproven: ${r}`);
  emit("AGENT", ok ? `DECISION: all ${proven}/${total} sources proven → let Masumi release the payment` : `DECISION: ${proven}/${total} proven → request a refund`, { taskId, proven, total, chain });
  return ok ? "pay" : "refund";
}

async function requestRefund(lockTxHash: string, reason: string) {
  const bf = blockfrostFromEnv(env);
  const mnemonic = env.BUYER_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("Set BUYER_MNEMONIC in cardano/.env to request a refund.");
  const status = await trackEscrow(bf, makeClient(bf, mnemonic), lockTxHash);
  if (!status.open) { emit("CHAIN", `escrow already closed by ${explorerTx(status.closedBy)}`); return; }
  const { client, address, keyHash } = await clientForKey(bf, mnemonic, status.datum.buyer.payment.hash);
  emit("SIGNING", `requesting refund on escrow ${status.ref} from ${address}`);
  const party = createParty({ bf, client, address, keyHash });
  const r = await party.requestRefund(status, [reason], tx => emit("CHAIN", `submitted ${tx}, waiting for confirmation…`));
  emit("CHAIN", `refund requested: ${r.newState} ${explorerTx(r.txHash)}`, { txHash: r.txHash });
}

const [command, arg, arg2] = process.argv.slice(2);
if (!COWORKER_ID || !ORG_SLUG) throw new Error("Set COWORKER_ID and SOKOSUMI_ORGANIZATION_SLUG (cardano/.env or the quickstart .env).");

if (command === "create") {
  const brief = arg ?? "Write a short literature summary on deep learning for engineers.";
  const minSources = Number(arg2 ?? 1);
  const description = `${brief} Cite at least ${minSources} DOI${minSources === 1 ? "" : "s"}.`;
  emit("AGENT", `creating research task for Coworker ${COWORKER_ID} in ${ORG_SLUG}`);
  const created = await sokosumi<{ task?: Task } & Task>(["tasks", "create", "--organization-slug", ORG_SLUG, "--coworker-id", COWORKER_ID, "--name", brief.slice(0, 60), "--description", description, "--status", "READY"]);
  const task = created.task ?? created;
  emit("TOOL", `task ${task.id} created (${task.status})`, { taskId: task.id });
  const deadline = Date.now() + 15 * 60_000;
  let result: string | undefined;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10_000));
    const t = await getTask(task.id);
    if (t.status === "COMPLETED") { result = await taskResult(task.id); break; }
    if (["FAILED", "CANCELLED"].includes(t.status)) { emit("ERROR", `task ${task.id} ${t.status}`); process.exit(1); }
    emit("TOOL", `task ${task.id} is ${t.status}; waiting`);
  }
  if (!result) { emit("ERROR", `task ${task.id} did not complete in 15 min`); process.exit(1); }
  const decision = await decide(task.id, result);
  emit("DONE", `${decision === "pay" ? "paying" : "refund"} — task ${task.id}`);
} else if (command === "check" && arg) {
  const result = await taskResult(arg);
  if (!result) { emit("ERROR", `task ${arg} has no completed result yet`); process.exit(1); }
  const decision = await decide(arg, result);
  if (decision === "refund" && arg2) await requestRefund(arg2, `verifier: task ${arg} not fully proven`);
  emit("DONE", `${decision} — task ${arg}`);
} else {
  console.log('Usage: npm run hirer -- create "<brief>" [minSources] | check <taskId> [lockTxHash]');
  process.exit(1);
}
