/**
 * Run the buyer agent for one job, end to end on Cardano preprod.
 *
 *   npm run hire -- --task "text" [--verdict pass|fail] [--seller-accepts]
 *
 *   --verdict pass        payout path: nothing to do, the seller collects after unlock_time
 *   --verdict fail        refund path: refund request (+ withdraw once the seller authorizes)
 *   --seller-accepts      demo: also play the honest seller and authorize the refund (SELLER_MNEMONIC)
 *
 * Reads AGENT_OFFER_URL (the agent's x402 endpoint), BUYER_MNEMONIC, BLOCKFROST_PROJECT_ID.
 */
import { parseArgs } from "node:util";
import { blockfrostFromEnv } from "../escrow.ts";
import { runHirerJob } from "../hirer/hirer.ts";
import { fixedVerdict } from "../hirer/verdict.ts";
import { makePayingFetch } from "../x402-client.ts";

const { values } = parseArgs({
  options: {
    task: { type: "string" },
    verdict: { type: "string", default: "pass" },
    "seller-accepts": { type: "boolean", default: false },
  },
});
const env = process.env;
const need = (name: string) => {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Set ${name} in cardano/.env.`);
  return v;
};
if (!values.task) {
  console.log('Usage: npm run hire -- --task "text" [--verdict pass|fail] [--seller-accepts]');
  process.exit(1);
}
if (!["pass", "fail"].includes(values.verdict!)) throw new Error("--verdict must be pass or fail");

const bf = blockfrostFromEnv();
const buyerMnemonic = need("BUYER_MNEMONIC");
// The most the buyer locks for one job (the price plus Masumi's refundable collateral).
const payingFetch = makePayingFetch(bf, buyerMnemonic, BigInt(env.HIRE_MAX_LOVELACE?.trim() || "10000000"));

const result = await runHirerJob({
  bf,
  buyerMnemonic,
  payingFetch,
  offerUrl: need("AGENT_OFFER_URL"),
  task: values.task,
  verdict: fixedVerdict(values.verdict as "pass" | "fail"),
  ...(values["seller-accepts"] ? { sellerAcceptsWith: need("SELLER_MNEMONIC") } : {}),
  onEvent: e => console.log(`${e.at.slice(11, 19)} [${e.tag}] ${e.message}${e.explorerUrl ? `\n           ${e.explorerUrl}` : ""}`),
});

console.log(`\nOutcome: ${result.outcome}  (job ${result.jobId})`);
for (const t of result.txs) console.log(`  ${t.step.padEnd(18)} ${t.txHash}`);
