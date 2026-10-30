/**
 * An agent paying the citation verifier over Cardano x402, signing server-side
 * from BUYER_MNEMONIC (no browser wallet).
 *
 *   npm run pay-verify -- <doi> [verifierUrl]
 *
 * Prints the verdict, the signed proof and the Cardano payment transaction.
 */
import { decodePaymentResponseHeader } from "@x402/core/http";
import { toClientCardanoSigner } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { blockfrostFromEnv, explorerTx, NETWORK } from "../escrow.ts";

const [doi, base = process.env.VERIFY_URL?.trim() || "http://localhost:4030"] = process.argv.slice(2);
if (!doi) {
  console.log("Usage: npm run pay-verify -- <doi> [verifierUrl]");
  process.exit(1);
}
const mnemonic = process.env.BUYER_MNEMONIC?.trim();
if (!mnemonic) throw new Error("Set BUYER_MNEMONIC in cardano/.env.");
const bf = blockfrostFromEnv();

/** The most this agent pays per call (lovelace). */
const MAX_LOVELACE_PER_CALL = process.env.VERIFY_MAX_LOVELACE?.trim() || "3000000";

const signer = toClientCardanoSigner({ mnemonic, network: NETWORK, provider: { blockfrost: { baseUrl: bf.baseUrl, projectId: bf.projectId } } });
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactCardanoScheme(signer) }],
  spendControls: { allowedAssets: [{ network: NETWORK, asset: "lovelace", maxAmountPerPayment: MAX_LOVELACE_PER_CALL }] },
});

const url = `${base.replace(/\/+$/, "")}/verify?doi=${encodeURIComponent(doi)}`;
console.log(`Paying for ${url} …`);
// A settlement can fail transiently (e.g. the previous payment's change is not visible to the facilitator yet).
// Nothing is charged then, so retry once after a short wait with a freshly signed payment.
let response = await payingFetch(url);
if (response.status === 402) {
  console.log("Payment not settled; retrying once in 20 s …");
  await new Promise(r => setTimeout(r, 20_000));
  response = await payingFetch(url);
}
const body = (await response.json()) as Record<string, unknown>;
if (!response.ok) {
  console.log(`HTTP ${response.status}:`, body);
  process.exit(1);
}
const header = response.headers.get("PAYMENT-RESPONSE");
const settlement = header ? decodePaymentResponseHeader(header) : undefined;
const work = body.work as { title: string; is_retracted: boolean };
console.log(`\nVerdict: ${String(body.verdict).toUpperCase()} — "${work.title}" (is_retracted=${work.is_retracted}, source ${body.source})`);
console.log(`Off-chain check passed: signer ${(body.checks as { signer: string }).signer}`);
if (settlement?.success && settlement.transaction) console.log(`Cardano payment: ${explorerTx(settlement.transaction)}`);
else console.log("No settlement in the response:", settlement);
console.log("\nSigned proof:\n" + JSON.stringify(body.proof, null, 2));
