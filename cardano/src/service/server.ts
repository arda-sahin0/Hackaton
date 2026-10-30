/**
 * Cardano hirer service for the dashboard. Speaks the dashboard's existing run
 * protocol (src/app/api/agent/run/route.ts + src/hooks/use-agent-stream.ts):
 *
 *   POST /runs          body { task?, verdict?, sellerAccepts?, demoFallback? }
 *                       → Server-Sent Events: `event: start`, then one `data: <AgentEvent>`
 *                         per step, then `event: result` with the run summary
 *   GET  /runs          summaries of all runs this process saw, newest first (proof table)
 *   GET  /runs/:id      one run: summary + every event (reconnect after a page reload)
 *   GET  /health        config check
 *
 * A run keeps going when the browser disconnects: money is in flight, so it
 * must finish; fetch it again with GET /runs/:id. One run at a time.
 */
import { randomBytes } from "node:crypto";
import express, { type Response } from "express";
import { blockfrostFromEnv, explorerTx } from "../escrow.ts";
import { runHirerJob, type HireResult, type Tag } from "../hirer/hirer.ts";
import { citationVerdict, fixedVerdict } from "../hirer/verdict.ts";
import { makePayingFetch } from "../x402-client.ts";
import { REPLAY } from "./replay.ts";

const env = process.env;
const PORT = Number(env.SERVICE_PORT ?? 4040);
const ORIGINS = (env.CORS_ORIGINS?.trim() || "*").split(",").map(s => s.trim());
const VERIFY_URL = env.VERIFY_URL?.trim() || "http://localhost:4030";
const DEFAULT_TASK = "Literature review on deep learning, citing at least 1 source with its DOI";
const NETWORK_ID = "cardano-preprod"; // the dashboard's NetworkId

// ---------------------------------------------------------------- run store

/** Same shape as the dashboard's AgentEvent (src/lib/agent/types.ts). */
interface AgentEvent { id: string; seq: number; ts: string; level: Tag; message: string; data?: Record<string, unknown> }
interface TxRow { step: string; txHash: string; explorerUrl: string; network: string; status: "verified"; simulated: boolean }
interface RunSummary {
  runId: string;
  ok: boolean;
  status: "running" | "done";
  startedAt: string;
  durationMs: number;
  outcome?: HireResult["outcome"];
  verdict: "citations" | "pass" | "fail";
  simulated: boolean;
  jobId?: string;
  lockTx?: string;
  txs: TxRow[];
}
interface Run { summary: RunSummary; events: AgentEvent[]; listeners: Set<(chunk: string) => void> }

const runs = new Map<string, Run>();
let active: string | null = null;

function publish(run: Run, chunk: string) {
  for (const send of run.listeners) send(chunk);
}
function emitEvent(run: Run, level: Tag, message: string, txHash?: string) {
  const seq = run.events.length + 1;
  const event: AgentEvent = {
    id: `${run.summary.runId}-${seq}`, seq, ts: new Date().toISOString(), level, message,
    data: { network: NETWORK_ID, simulated: run.summary.simulated, ...(txHash ? { txHash, explorerUrl: explorerTx(txHash) } : {}) },
  };
  run.events.push(event);
  publish(run, `data: ${JSON.stringify(event)}\n\n`);
}
function finish(run: Run, outcome: HireResult["outcome"], txs: HireResult["txs"], extra: Partial<RunSummary> = {}) {
  const s = run.summary;
  Object.assign(s, extra, {
    status: "done", outcome, ok: outcome !== "failed", durationMs: Date.now() - Date.parse(s.startedAt),
    txs: txs.map(t => ({ ...t, explorerUrl: explorerTx(t.txHash), network: NETWORK_ID, status: "verified" as const, simulated: s.simulated })),
  });
  publish(run, `event: result\ndata: ${JSON.stringify(s)}\n\n`);
  for (const send of run.listeners) send("");
  run.listeners.clear();
  if (active === s.runId) active = null;
}

// ---------------------------------------------------------------- runners

async function replay(run: Run, verdict: "pass" | "fail") {
  run.summary.simulated = true;
  const script = REPLAY[verdict];
  emitEvent(run, "AGENT", "Demo fallback: replaying a pre-verified preprod run (every tx hash is real and on chain)");
  for (const step of script.steps) {
    await new Promise(r => setTimeout(r, step.delayMs));
    emitEvent(run, step.tag, step.message, step.txHash);
  }
  finish(run, script.outcome, script.txs, { lockTx: script.txs[0].txHash });
}

async function live(run: Run, input: { task: string; verdict: "citations" | "pass" | "fail"; sellerAccepts: boolean }) {
  const bf = blockfrostFromEnv();
  const buyerMnemonic = env.BUYER_MNEMONIC?.trim();
  const offerUrl = env.AGENT_OFFER_URL?.trim();
  if (!buyerMnemonic || !offerUrl) throw new Error("BUYER_MNEMONIC and AGENT_OFFER_URL must be set in cardano/.env");
  const sellerMnemonic = env.SELLER_MNEMONIC?.trim();
  if (input.sellerAccepts && !sellerMnemonic) throw new Error("sellerAccepts needs SELLER_MNEMONIC in cardano/.env");
  const result = await runHirerJob({
    bf,
    buyerMnemonic,
    payingFetch: makePayingFetch(bf, buyerMnemonic, BigInt(env.HIRE_MAX_LOVELACE?.trim() || "10000000")),
    offerUrl,
    task: input.task,
    verdict: input.verdict === "citations"
      ? citationVerdict({ verifierUrl: VERIFY_URL, payingFetch: makePayingFetch(bf, buyerMnemonic, BigInt(env.VERIFY_MAX_LOVELACE?.trim() || "3000000")), minSources: 1 })
      : fixedVerdict(input.verdict),
    ...(input.sellerAccepts ? { sellerAcceptsWith: sellerMnemonic! } : {}),
    onEvent: e => {
      // The first transaction of a run is the escrow lock: from here on, real money is in flight.
      if (e.txHash && !run.summary.lockTx) run.summary.lockTx = e.txHash;
      emitEvent(run, e.tag, e.message, e.txHash);
    },
  });
  finish(run, result.outcome, result.txs, { jobId: result.jobId, lockTx: result.lockTx });
}

// ---------------------------------------------------------------- HTTP

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (ORIGINS.includes("*")) res.set("Access-Control-Allow-Origin", "*");
  else if (origin && ORIGINS.includes(origin)) res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin" });
  res.set({ "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: NETWORK_ID, busy: Boolean(active), agentOfferUrl: env.AGENT_OFFER_URL ?? null, verifyUrl: VERIFY_URL });
});
app.get("/runs", (_req, res) => {
  res.json([...runs.values()].map(r => r.summary).reverse());
});
app.get("/runs/:id", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Unknown run" }); return; }
  res.json({ ...run.summary, events: run.events });
});

app.post("/runs", (req, res) => {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const verdict = (body.verdict ?? "citations") as RunSummary["verdict"];
  if (!["citations", "pass", "fail"].includes(verdict)) { res.status(400).json({ error: "verdict must be citations, pass or fail" }); return; }
  const task = typeof body.task === "string" && body.task.trim() ? body.task.trim().slice(0, 500) : DEFAULT_TASK;
  const demoFallback = body.demoFallback === true || body.demoFallback === "true";
  const sellerAccepts = body.sellerAccepts === true || body.sellerAccepts === "true";
  if (active && !demoFallback) { res.status(409).json({ error: "A live run is in progress", runId: active }); return; }

  const runId = `cardano-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
  const run: Run = {
    summary: { runId, ok: false, status: "running", startedAt: new Date().toISOString(), durationMs: 0, verdict, simulated: demoFallback, txs: [] },
    events: [], listeners: new Set(),
  };
  runs.set(runId, run);
  if (!demoFallback) active = runId;

  streamTo(res, run);
  publish(run, `event: start\ndata: ${JSON.stringify({ runId, input: { network: NETWORK_ID, task, verdict, sellerAccepts, demoFallback } })}\n\n`);

  const replayVerdict = verdict === "pass" ? "pass" : "fail";
  const job = demoFallback ? replay(run, replayVerdict) : live(run, { task, verdict, sellerAccepts });
  job.catch(async error => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[run ${runId}] ${message}`);
    emitEvent(run, "ERROR", `Live run failed: ${message}`);
    if (run.summary.txs.length === 0 && !run.summary.lockTx && body.fallbackOnError !== false && !demoFallback) {
      // Nothing was locked yet, so a replay cannot hide a real payment in flight.
      if (active === runId) active = null;
      await replay(run, replayVerdict);
    } else {
      finish(run, "failed", []);
    }
  });
});

/** Attach an SSE response to a run; the run continues if the client goes away. */
function streamTo(res: Response, run: Run) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const send = (chunk: string) => { if (chunk) res.write(chunk); else res.end(); };
  run.listeners.add(send);
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000); // keeps tunnels and proxies from closing an idle stream
  res.on("close", () => { clearInterval(ping); run.listeners.delete(send); });
}

app.listen(PORT, () => {
  console.log(`Cardano hirer service on http://localhost:${PORT}  (POST /runs, GET /runs, GET /runs/:id)`);
  console.log(`  agent offer ${env.AGENT_OFFER_URL ?? "(AGENT_OFFER_URL not set — live runs disabled, demo fallback works)"}`);
  console.log(`  CORS origins ${ORIGINS.join(", ")}`);
});
