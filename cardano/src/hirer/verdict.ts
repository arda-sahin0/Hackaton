/**
 * How the hirer decides whether a delivered report earned its payment. The
 * loop only needs a pass/fail with reasons; where it comes from is pluggable.
 *
 *   fixed      a forced verdict, for testing the payout and refund paths
 *   citations  pay the /verify service for every DOI in the report; fail on a
 *              retracted or unprovable source, or on fewer than `minSources`
 *   (next)     the API3 side's CitationEscrow.isFullyProven(jobId) on Base Sepolia
 */
import { payOnceWithRetry, settlementTx } from "../x402-client.ts";
import type { Emit } from "./hirer.ts";

export interface Verdict {
  verdict: "pass" | "fail";
  reasons: string[];
  /** Cardano transactions this decision paid for (verification fees). */
  paidTxs: string[];
}
export type VerdictSource = (report: string, emit: Emit) => Promise<Verdict>;

export const fixedVerdict = (verdict: "pass" | "fail"): VerdictSource => async (_report, emit) => {
  emit("VERIFY", `Forced verdict for this test run: ${verdict.toUpperCase()}`);
  return { verdict, reasons: [`forced ${verdict}`], paidTxs: [] };
};

/** DOIs in free text (Crossref's recommended pattern, trailing punctuation trimmed). */
export const extractDois = (text: string) =>
  [...new Set([...text.matchAll(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi)].map(m => m[0].replace(/[.,;:)]+$/, "").toLowerCase()))];

export function citationVerdict(opts: { verifierUrl: string; payingFetch: typeof fetch; minSources: number }): VerdictSource {
  return async (report, emit) => {
    const dois = extractDois(report);
    emit("VERIFY", `Report cites ${dois.length} DOI(s); ${opts.minSources} required`);
    const reasons: string[] = [];
    const paidTxs: string[] = [];
    if (dois.length < opts.minSources) reasons.push(`only ${dois.length} DOI(s) cited, ${opts.minSources} required`);
    for (const doi of dois) {
      const url = `${opts.verifierUrl.replace(/\/+$/, "")}/verify?doi=${encodeURIComponent(doi)}`;
      emit("TOOL", `Paying the citation verifier for ${doi} …`);
      const response = await payOnceWithRetry(opts.payingFetch, url, undefined, () => emit("TOOL", "Payment not settled; retrying once"));
      const body = (await response.json().catch(() => ({}))) as { verdict?: string; work?: { title?: string }; error?: string };
      const tx = settlementTx(response);
      if (tx) paidTxs.push(tx);
      if (!response.ok) {
        reasons.push(`${doi}: no signed proof (${body.error ?? `HTTP ${response.status}`})`);
        emit("VERIFY", `${doi} → UNPROVEN (${body.error ?? response.status})`, tx);
        continue;
      }
      emit("ORACLE", `${doi} → ${String(body.verdict).toUpperCase()} — "${body.work?.title ?? "?"}" (API3 signature checked off-chain)`, tx);
      if (body.verdict !== "valid") reasons.push(`${doi}: ${body.verdict}`);
    }
    return { verdict: reasons.length ? "fail" : "pass", reasons, paidTxs };
  };
}
