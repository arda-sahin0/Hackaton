/**
 * The research agent's answer pipeline, plugged into the Masumi quickstart
 * worker (see ../../research-agent/setup.sh): the model writes the report,
 * then every cited DOI is pre-checked on OpenAlex (free), proven with a signed
 * Airnode response (replayed fixture, or paid over Cardano x402 / aUSD), and
 * recorded on CitationEscrow when the contract is deployed. The result that
 * goes to Masumi is the report plus a "## Verification" section and a final
 * JSON block, so anyone can match the Cardano job to its proofs on Base Sepolia.
 *
 *   RESEARCH_MODE     model (default) | fixture: replay a saved report (no model key needed)
 *   RESEARCH_CHEAT    none (default) | retracted: also cite a retracted DOI | tamper: forge is_retracted=false
 *                     in the signed data (the signature no longer matches → contract rejects it)
 *   RESEARCH_PAY_VERIFY  true: pay the x402 verifier per DOI from SELLER_MNEMONIC (Cardano tx per proof)
 */
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import type { SignedResponse } from "../../../api3evm/src/airnode-v2.ts";
import { explorerTx } from "../escrow.ts";
import { getCitationProof, proofMode, type CitationProof } from "../verify/proof.ts";
import { precheckDoi } from "../verify/openalex-precheck.ts";
import { createVerifyClient } from "../verify/x402-client.ts";
import { externalRefOf, recordProofs, reportHashOf, type RecordResult } from "../evm/citation-escrow.ts";
import { FIXTURE_RETRACTED_DOI, fixtureReport } from "./fixtures.ts";
import { parseReport } from "./parse.ts";

// The worker runs with the quickstart's .env; the Cardano settings live in cardano/.env.
const CARDANO_ENV = new URL("../../.env", import.meta.url);
if (existsSync(CARDANO_ENV)) process.loadEnvFile(CARDANO_ENV);

export type ModelAnswer = (input: string, journal: string, deadline?: number) => Promise<string>;
export type Log = (line: string) => void;

export interface SourceResult {
  doi: string;
  precheck: "found" | "not-found" | "retracted" | "error";
  title?: string;
  proof?: SignedResponse;
  verdict?: "valid" | "retracted";
  proofSource?: "live" | "fixture" | "x402";
  proven: boolean;
  reason?: string;
  cardanoTx?: string;
  dataPaymentTx?: string;
}

export interface Verification {
  reportHash: string;
  resultSha256?: string;
  externalRef: string;
  externalRefHash: string;
  minSources: number;
  sources: SourceResult[];
  evm: RecordResult;
  allProven: boolean;
  cheat: string;
}

export interface ResearchOptions {
  /** Masumi blockchainIdentifier or Sokosumi Task ID; becomes the EVM externalRef. */
  externalRef?: string;
  log?: Log;
  env?: NodeJS.ProcessEnv;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function proveOne(doi: string, env: NodeJS.ProcessEnv, log: Log, pay: ReturnType<typeof createVerifyClient> | null): Promise<SourceResult> {
  const r: SourceResult = { doi, precheck: "error", proven: false };
  try {
    const pre = await precheckDoi(doi, env);
    if (pre.status === "not-found") { r.precheck = "not-found"; r.reason = "OpenAlex does not know this DOI"; log(`[VERIFY] ${doi}: unknown to OpenAlex — skipped, nothing paid`); return r; }
    r.title = pre.work.title;
    r.precheck = pre.work.is_retracted ? "retracted" : "found";
    log(`[VERIFY] ${doi}: OpenAlex ${pre.cached ? "(cached) " : ""}"${pre.work.title}"${pre.work.is_retracted ? " — RETRACTED" : ""}`);
  } catch (error) {
    r.reason = `OpenAlex pre-check failed: ${error instanceof Error ? error.message : String(error)}`;
    log(`[VERIFY] ${doi}: ${r.reason}`);
  }
  try {
    let proof: CitationProof;
    if (pay) {
      log(`[PAY] ${doi}: paying the x402 verifier at ${pay.url} …`);
      const paid = await pay.verify(doi, line => log(`[PAY] ${line}`));
      proof = paid.proof;
      r.proofSource = "x402";
      if (paid.payment) { r.cardanoTx = paid.payment.txHash; log(`[CHAIN] ${doi}: Cardano payment ${explorerTx(paid.payment.txHash)}`); }
    } else {
      proof = await getCitationProof(doi, env);
      r.proofSource = proof.source;
    }
    r.proof = proof.proof;
    r.verdict = proof.verdict;
    r.title ??= proof.work.title;
    if (proof.dataPayment) r.dataPaymentTx = proof.dataPayment.txHash;
    r.proven = proof.verdict === "valid";
    if (!r.proven) r.reason = "retracted";
    log(`[SIGNED] ${doi}: Airnode proof ${proof.source}, signer ${proof.checks.signer.slice(0, 10)}…, verdict ${proof.verdict.toUpperCase()}`);
  } catch (error) {
    r.reason = `no signed proof: ${error instanceof Error ? error.message : String(error)}`;
    log(`[VERIFY] ${doi}: ${r.reason}`);
  }
  return r;
}

/** Runs the whole pipeline on a finished report; exported for the local CLI and tests. */
export async function verifyReport(report: string, opts: ResearchOptions = {}): Promise<{ result: string; verification: Verification }> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => {});
  const cheat = (env.RESEARCH_CHEAT?.trim() || "none").toLowerCase();
  const parsed = parseReport(report);
  const dois = [...parsed.dois];
  if ((cheat === "retracted" || cheat === "tamper") && !dois.includes(FIXTURE_RETRACTED_DOI)) {
    dois.push(FIXTURE_RETRACTED_DOI);
    report = report.replace(/```json[\s\S]*$/, "") + `[${dois.length}] (2002). RETRACTED ARTICLE. Nature. https://doi.org/${FIXTURE_RETRACTED_DOI}\n\n\`\`\`json\n${JSON.stringify({ topic: parsed.topic, minSources: parsed.minSources, dois })}\n\`\`\`\n`;
    log(`[AGENT] cheat=${cheat}: also citing retracted ${FIXTURE_RETRACTED_DOI}`);
  }
  if (parsed.rejected.length) log(`[AGENT] dropped ${parsed.rejected.length} malformed DOI(s): ${parsed.rejected.join(", ")}`);
  log(`[AGENT] report cites ${dois.length} DOI(s); minSources ${parsed.minSources}; proofs: ${proofMode(env)}`);

  const payer = env.RESEARCH_PAY_VERIFY === "true" && env.SELLER_MNEMONIC?.trim()
    ? createVerifyClient({ mnemonic: env.SELLER_MNEMONIC.trim() }, env)
    : null;

  const sources: SourceResult[] = [];
  for (const doi of dois) sources.push(await proveOne(doi, env, log, payer));

  if (cheat === "tamper") {
    for (const s of sources) {
      if (s.proof && s.verdict === "retracted") {
        s.proof = { ...s.proof, data: s.proof.data.replace('"is_retracted":true', '"is_retracted":false') };
        s.verdict = "valid"; s.proven = true; s.reason = undefined;
        log(`[AGENT] cheat=tamper: forged is_retracted=false for ${s.doi} (signature no longer matches)`);
      }
    }
  }

  const externalRef = opts.externalRef ?? "unassigned";
  const evm = await recordProofs(
    {
      report, dois, minSources: parsed.minSources, externalRef,
      proofs: sources.filter(s => s.proof).map(s => ({ doi: s.doi, proof: s.proof! })),
    },
    env,
    line => log(`[CHAIN] ${line}`),
  );
  if ("skipped" in evm) log(`[CHAIN] CitationEscrow record skipped: ${evm.skipped}`);

  const allProven = dois.length > 0 && dois.length >= parsed.minSources && sources.every(s => s.proven) && (!("fullyProven" in evm) || evm.fullyProven !== false);
  log(`[AGENT] verdict: ${allProven ? "ALL SOURCES PROVEN" : "NOT PROVEN"} (${sources.filter(s => s.proven).length}/${dois.length})`);

  const verification: Verification = {
    reportHash: reportHashOf(report), externalRef, externalRefHash: externalRefOf(externalRef), minSources: parsed.minSources,
    sources, evm, allProven, cheat,
  };
  const lines = sources.map(s =>
    `- ${s.doi} — ${s.title ?? "?"} — ${s.proven ? "PROVEN" : `NOT PROVEN (${s.reason ?? "unknown"})`}` +
    (s.cardanoTx ? ` — paid ${explorerTx(s.cardanoTx)}` : "") + (s.dataPaymentTx ? ` — data payment ${s.dataPaymentTx}` : ""),
  );
  const evmLine = "skipped" in evm
    ? `EVM proof record: skipped (${evm.skipped})`
    : `EVM proof record: CitationEscrow job ${evm.jobId} — createJob ${evm.createTx} — deliver ${evm.deliverTx}`;
  const result =
    `${report.trimEnd()}\n\n## Verification\n\n` +
    `Report hash (keccak256): ${verification.reportHash}\nExternal ref: ${externalRef} → ${verification.externalRefHash}\n${evmLine}\n\n` +
    `${lines.join("\n")}\n\nVerdict: ${allProven ? "all sources proven" : "not all sources proven"}\n\n` +
    "```json\n" + JSON.stringify({ ...verification, sources: sources.map(({ proof, ...rest }) => ({ ...rest, proof })) }) + "\n```\n";
  verification.resultSha256 = sha256(result);
  return { result, verification };
}

/**
 * Wraps the quickstart's `answer` (Eve session → model text). Same signature,
 * so worker.mjs and paid-task.mjs call it unchanged.
 */
export function withProofs(modelAnswer: ModelAnswer, opts: ResearchOptions = {}): ModelAnswer {
  return async function answer(input, journal, deadline) {
    const env = opts.env ?? process.env;
    const log = opts.log ?? ((line: string) => console.log(line));
    const mode = env.RESEARCH_MODE?.trim() || "model";
    let report: string;
    if (mode === "fixture") {
      log("[AGENT] RESEARCH_MODE=fixture: replaying the saved report (no model call)");
      report = fixtureReport(input);
    } else {
      log("[AGENT] asking the model for the report …");
      try {
        report = await modelAnswer(input, journal, deadline);
      } catch (error) {
        if (env.RESEARCH_FALLBACK === "false") throw error;
        log(`[AGENT] model failed (${error instanceof Error ? error.message : String(error)}); falling back to the saved report`);
        report = fixtureReport(input);
      }
    }
    const taskId = journal.match(/([0-9a-f-]{36})/)?.[1];
    const { result } = await verifyReport(report, { ...opts, externalRef: opts.externalRef ?? taskId, log });
    return result;
  };
}
