/**
 * A Cardano x402 paying client for the citation verifier: an agent pays the
 * per-lookup fee from its own mnemonic, server-side, and gets the signed proof
 * plus the preprod payment transaction back. Shared by `npm run pay-verify`
 * and the research agent.
 */
import { decodePaymentResponseHeader } from "@x402/core/http";
import { toClientCardanoSigner } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { blockfrostFromEnv, explorerTx, NETWORK, type Blockfrost } from "../escrow.ts";
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
  const maxAmountPerPayment = opts.maxLovelace ?? env.VERIFY_MAX_LOVELACE?.trim() ?? "3000000";
  const signer = toClientCardanoSigner({
    mnemonic: opts.mnemonic,
    network: NETWORK,
    provider: { blockfrost: { baseUrl: bf.baseUrl, projectId: bf.projectId } },
  });
  const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactCardanoScheme(signer) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: "lovelace", maxAmountPerPayment }] },
  });

  async function verify(doi: string, log: (line: string) => void = () => {}): Promise<PaidVerification> {
    const url = `${base}/verify?doi=${encodeURIComponent(doi)}`;
    // A settlement can fail transiently (the previous payment's change may not be visible yet).
    // Nothing is charged then, so retry once with a freshly signed payment.
    let response = await payingFetch(url);
    if (response.status === 402) {
      log("payment not settled; retrying once in 20 s");
      await new Promise(r => setTimeout(r, 20_000));
      response = await payingFetch(url);
    }
    const body = (await response.json()) as CitationProof | { error: string };
    if (!response.ok) throw new Error(`verifier HTTP ${response.status}: ${"error" in body ? body.error : JSON.stringify(body)}`);
    const header = response.headers.get("PAYMENT-RESPONSE");
    const settlement = header ? decodePaymentResponseHeader(header) : undefined;
    const payment = settlement?.success && settlement.transaction
      ? { txHash: settlement.transaction, explorer: explorerTx(settlement.transaction) }
      : undefined;
    return { proof: body as CitationProof, payment };
  }

  return { verify, url: base };
}
