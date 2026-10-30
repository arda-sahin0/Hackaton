/**
 * Escrow CLI for one Masumi job, addressed by its lock transaction hash.
 *
 *   npm run escrow -- status    <lockTxHash>
 *   npm run escrow -- request   <lockTxHash> [reason]   hirer:  request a refund (-> Disputed)
 *   npm run escrow -- authorize <lockTxHash>            seller: accept it (-> RefundAuthorized)
 *   npm run escrow -- withdraw  <lockTxHash>            hirer:  take the money back
 *
 * Reads BLOCKFROST_PROJECT_ID, BUYER_MNEMONIC and SELLER_MNEMONIC from cardano/.env.
 */
import { blockfrostFromEnv, clientForKey, explorerTx, makeClient, stateName, trackEscrow } from "../escrow.ts";
import { createParty } from "../refund.ts";

const [command, lockTxHash, ...reason] = process.argv.slice(2);
const COMMANDS = ["status", "request", "authorize", "withdraw"];
if (!COMMANDS.includes(command ?? "") || !/^[0-9a-f]{64}$/.test(lockTxHash ?? "")) {
  console.log(`Usage: npm run escrow -- <${COMMANDS.join("|")}> <lockTxHash (64 hex)> [reason]`);
  process.exit(1);
}
const mnemonic = (name: string) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Set ${name} in cardano/.env.`);
  return v;
};
const at = (ms: bigint) => `${new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 19)} UTC`;

const bf = blockfrostFromEnv();
const reader = makeClient(bf, mnemonic(command === "authorize" ? "SELLER_MNEMONIC" : "BUYER_MNEMONIC"));
const status = await trackEscrow(bf, reader, lockTxHash!);
if (!status.open) {
  console.log(`Escrow closed by ${explorerTx(status.closedBy)}  (${status.history.length} escrow transactions)`);
  process.exit(0);
}
const d = status.datum;
console.log(`Escrow ${status.ref}  —  ${Number(status.lovelace) / 1e6} tADA`);
console.log(`  state:          ${stateName(d.state)}`);
console.log(`  result hash:    ${d.resultHash || "(none)"}`);
console.log(`  submit result:  ${at(d.submitResultTime)}`);
console.log(`  unlock:         ${at(d.unlockTime)}   (a refund request must land before this)`);
console.log(`  dispute unlock: ${at(d.externalDisputeUnlockTime)}`);
if (command === "status") process.exit(0);

const seller = command === "authorize";
const keyHash = seller ? d.seller.payment.hash : d.buyer.payment.hash;
const { client, address } = await clientForKey(bf, mnemonic(seller ? "SELLER_MNEMONIC" : "BUYER_MNEMONIC"), keyHash);
console.log(`\n${seller ? "seller" : "buyer"} address: ${address}`);
const party = createParty({ bf, client, address, keyHash });
const onSubmitted = (tx: string) => console.log(`  submitted ${tx}, waiting for confirmation…`);

const result =
  command === "request" ? await party.requestRefund(status, [reason.join(" ") || "verifier: report failed"], onSubmitted)
  : command === "authorize" ? await party.authorizeRefund(status, onSubmitted)
  : await party.withdrawRefund(status, onSubmitted);
console.log(`\nDone: ${result.newState}\n  ${explorerTx(result.txHash)}`);
