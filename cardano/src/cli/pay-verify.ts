/**
 * An agent paying the citation verifier over Cardano x402, signing server-side
 * from BUYER_MNEMONIC (no browser wallet).
 *
 *   npm run pay-verify -- <doi> [verifierUrl]
 *
 * Prints the verdict, the signed proof and the Cardano payment transaction.
 */
import { blockfrostFromEnv, explorerTx } from "../escrow.ts";
import { makePayingFetch, payOnceWithRetry, settlementTx } from "../x402-client.ts";

const [doi, base = process.env.VERIFY_URL?.trim() || "http://localhost:4030"] = process.argv.slice(2);
if (!doi) {
  console.log("Usage: npm run pay-verify -- <doi> [verifierUrl]");
  process.exit(1);
}
const mnemonic = process.env.BUYER_MNEMONIC?.trim();
if (!mnemonic) throw new Error("Set BUYER_MNEMONIC in cardano/.env.");
const payingFetch = makePayingFetch(blockfrostFromEnv(), mnemonic, BigInt(process.env.VERIFY_MAX_LOVELACE?.trim() || "3000000"));

const url = `${base.replace(/\/+$/, "")}/verify?doi=${encodeURIComponent(doi)}`;
console.log(`Paying for ${url} …`);
const response = await payOnceWithRetry(payingFetch, url, undefined, () => console.log("Payment not settled; retrying once in 20 s …"));
const body = (await response.json()) as Record<string, unknown>;
if (!response.ok) {
  console.log(`HTTP ${response.status}:`, body);
  process.exit(1);
}
const tx = settlementTx(response);
const work = body.work as { title: string; is_retracted: boolean };
console.log(`\nVerdict: ${String(body.verdict).toUpperCase()} — "${work.title}" (is_retracted=${work.is_retracted}, source ${body.source})`);
console.log(`Off-chain check passed: signer ${(body.checks as { signer: string }).signer}`);
console.log(tx ? `Cardano payment: ${explorerTx(tx)}` : "No settlement in the response.");
console.log("\nSigned proof:\n" + JSON.stringify(body.proof, null, 2));
