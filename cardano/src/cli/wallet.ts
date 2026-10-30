/**
 * Fresh preprod test wallets for the team, without ever printing a seed phrase.
 *
 *   npm run wallet -- new <name>        write a new 24-word seed to .local/wallet-<name>.txt, print the address
 *   npm run wallet -- show <ENV_VAR>    address, balance and explorer link of the seed in that env var
 *
 * .local/ is gitignored. Copy the seed from the file into cardano/.env by hand; never paste it in chat.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Address, PrivateKey } from "@evolution-sdk/evolution";
import { blockfrostFromEnv, makeClient } from "../escrow.ts";

const [command, arg] = process.argv.slice(2);
const usage = () => {
  console.log("Usage: npm run wallet -- new <name> | show <ENV_VAR>");
  process.exit(1);
};
if (!arg) usage();

const addressOf = async (mnemonic: string) => Address.toBech32(await makeClient(blockfrostFromEnv(), mnemonic).address());
const explorer = (address: string) => `https://preprod.cardanoscan.io/address/${address}`;

if (command === "new") {
  if (!/^[a-z0-9-]+$/.test(arg!)) throw new Error("name: lowercase letters, digits and dashes only");
  const file = `.local/wallet-${arg}.txt`;
  if (existsSync(file)) throw new Error(`${file} exists; pick another name or delete it first.`);
  const mnemonic = PrivateKey.generateMnemonic(256);
  mkdirSync(".local", { recursive: true });
  writeFileSync(file, mnemonic + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  const address = await addressOf(mnemonic);
  console.log(`Seed written to cardano/${file} (gitignored). Copy it into cardano/.env by hand.`);
  console.log(`Address: ${address}`);
  console.log(`Fund it: https://docs.cardano.org/cardano-testnets/tools/faucet  (network: Preprod)`);
  console.log(`Watch:   ${explorer(address)}`);
} else if (command === "show") {
  const mnemonic = process.env[arg!]?.trim();
  if (!mnemonic) throw new Error(`${arg} is empty in cardano/.env.`);
  const bf = blockfrostFromEnv();
  const address = await addressOf(mnemonic);
  const res = await fetch(`${bf.baseUrl}/addresses/${address}`, { headers: { project_id: bf.projectId } });
  const lovelace = res.status === 404 ? 0n : BigInt(((await res.json()) as { amount: { unit: string; quantity: string }[] }).amount.find(a => a.unit === "lovelace")?.quantity ?? "0");
  console.log(`${arg}: ${address}`);
  console.log(`Balance: ${Number(lovelace) / 1e6} tADA${res.status === 404 ? " (address not seen on chain yet)" : ""}`);
  console.log(`Watch:   ${explorer(address)}`);
} else usage();
