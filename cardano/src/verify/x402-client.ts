/**
 * A paying client for the citation verifier: an agent pays the per-lookup fee
 * from its own mnemonic, server-side, and gets the signed proof plus the preprod
 * payment transaction back. Built on the x402 wallet primitives in
 * `../x402-client.ts`; used by the research agent (`RESEARCH_PAY_VERIFY=true`).
 */
import { blockfrostFromEnv, explorerTx, type Blockfrost } from "../escrow.ts";
import { makePayingFetch, payOnceWithRetry, settlementTx } from "../x402-client.ts";
import type { CitationProof } from "./proof.ts";

export interface VerifyClientOptions {
  mnemonic: string;
  bf?: Blockfrost;
  /** Verifier base URL, default VERIFY_URL or http://localhost:4030. */
  url?: string;
  /** The most the agent pays per call (lovelace), default VERIFY_MAX_LOVELACE or 3 tADA. */
  maxLovelace?: string;
}

export interface PaidVerification {
  proof: CitationProof;
  /** The Cardano preprod payment, when the facilitator settled one. */
  payment?: { txHash: string; explorer: string };
}

export function createVerifyClient(opts: VerifyClientOptions, env = process.env) {
  const bf = opts.bf ?? blockfrostFromEnv(env);
  const base = (opts.url ?? env.VERIFY_URL?.trim() ?? "http://localhost:4030").replace(/\/+$/, "");
  const payingFetch = makePayingFetch(bf, opts.mnemonic, BigInt(opts.maxLovelace ?? env.VERIFY_MAX_LOVELACE?.trim() ?? "3000000"));

  async function verify(doi: string, log: (line: string) => void = () => {}): Promise<PaidVerification> {
    const url = `${base}/verify?doi=${encodeURIComponent(doi)}`;
    const response = await payOnceWithRetry(payingFetch, url, undefined, () => log("payment not settled; retrying once in 20 s"));
    const body = (await response.json()) as CitationProof | { error: string };
    if (!response.ok) throw new Error(`verifier HTTP ${response.status}: ${"error" in body ? body.error : JSON.stringify(body)}`);
    const txHash = settlementTx(response);
    return { proof: body as CitationProof, payment: txHash ? { txHash, explorer: explorerTx(txHash) } : undefined };
  }

  return { verify, url: base };
}
