/**
 * The hirer (buyer) agent on the Sokosumi side: creates a research Task, waits
 * for the result, re-checks every signed proof itself (never trusting the
 * seller's own verdict), reads CitationEscrow.isFullyProven when the contract
 * is deployed, and decides: all proven -> let Masumi pay the researcher;
 * otherwise -> request a refund on the Masumi escrow before unlockTime.
 * (`npm run hire` is the Masumi-native x402 loop; both share hirer/proof-check.ts.)
 *
 *   npm run hirer -- create "<brief>" [minSources]        create, wait, verify, decide
 *   npm run hirer -- check  <taskId> [lockTxHash]        re-evaluate; with a lock tx, act on it
 *   npm run hirer -- verify <resultFile> [lockTxHash]    re-check a saved result (no Sokosumi needed)
 *
 * Every decision is appended as an orchestrator event to .local/hirer-events.jsonl
 * (what the dashboard terminal streams) and printed as [LEVEL] lines.
 */
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { blockfrostFromEnv, clientForKey, explorerTx, makeClient, trackEscrow } from "../escrow.ts";
import { checkProofs, parseVerification } from "../hirer/proof-check.ts";
import { createParty } from "../refund.ts";

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


async function decide(taskId: string, result: string): Promise<"pay" | "refund"> {
  const v = parseVerification(result);
  if (!v) { emit("ERROR", "result carries no verification block"); return "refund"; }
  emit("AGENT", `result for ${taskId}: ${v.sources.length} cited DOI(s), minSources ${v.minSources}, report hash ${v.reportHash}`);
  const { proven, total, reasons, chain, ok } = await checkProofs(v, (tag, message) => emit(tag, message), env);
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
if (command !== "verify" && (!COWORKER_ID || !ORG_SLUG)) throw new Error("Set COWORKER_ID and SOKOSUMI_ORGANIZATION_SLUG (cardano/.env or the quickstart .env).");

if (command === "verify" && arg) {
  const result = readFileSync(arg, "utf8");
  const label = parseVerification(result)?.externalRef ?? arg;
  const decision = await decide(label, result);
  if (decision === "refund" && arg2) await requestRefund(arg2, `verifier: result not fully proven`);
  emit("DONE", `${decision} — ${label}`);
} else if (command === "create") {
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
  console.log('Usage: npm run hirer -- create "<brief>" [minSources] | check <taskId> [lockTxHash] | verify <resultFile> [lockTxHash]');
  process.exit(1);
}
