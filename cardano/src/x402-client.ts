/**
 * An agent's x402 wallet on Cardano preprod: a fetch that answers 402 Payment
 * Required by signing the payment server-side from a seed phrase (no browser
 * wallet). Works for plain payments and for Masumi escrow locks.
 */
import { decodePaymentResponseHeader } from "@x402/core/http";
import { toClientCardanoSigner } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { NETWORK, type Blockfrost } from "./escrow.ts";

/** A fetch that pays at most `maxLovelacePerPayment` per call, in tADA only. */
export function makePayingFetch(bf: Blockfrost, mnemonic: string, maxLovelacePerPayment: bigint): typeof fetch {
  const signer = toClientCardanoSigner({ mnemonic, network: NETWORK, provider: { blockfrost: { baseUrl: bf.baseUrl, projectId: bf.projectId } } });
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactCardanoScheme(signer) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: "lovelace", maxAmountPerPayment: maxLovelacePerPayment.toString() }] },
  }) as typeof fetch;
}

/** The Cardano transaction that settled a paid response, if any. */
export function settlementTx(response: Response): string | undefined {
  const header = response.headers.get("PAYMENT-RESPONSE");
  if (!header) return undefined;
  const settlement = decodePaymentResponseHeader(header);
  return settlement.success && settlement.transaction ? settlement.transaction : undefined;
}

/**
 * A settlement can fail transiently (e.g. the previous payment's change is not
 * visible to the facilitator yet). Nothing is charged then, so retry once with
 * a freshly signed payment.
 */
export async function payOnceWithRetry(payingFetch: typeof fetch, url: string, init?: RequestInit, onRetry?: () => void) {
  const response = await payingFetch(url, init);
  if (response.status !== 402) return response;
  onRetry?.();
  await new Promise(r => setTimeout(r, 20_000));
  return payingFetch(url, init);
}
