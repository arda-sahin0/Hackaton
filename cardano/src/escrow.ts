/**
 * Masumi V2 escrow (`vested_pay`) on Cardano preprod: constants, the validator
 * script, slot-time rules and escrow tracking.
 *
 * Money in the escrow sits in one UTxO whose inline datum (19 fields) is the
 * job's state. Every action spends that UTxO and, unless the escrow ends,
 * recreates it with an updated datum. So a job is followed from its lock
 * transaction through each later escrow transaction to its current UTxO.
 *
 * Validator rules are cited as "ak:N" = line N of
 * masumi-payment-service smart-contracts/payment-v2/validators/vested_pay.ak.
 */
import { readFileSync } from "node:fs";
import {
  Address, Assets, CBOR, Client, Data, InlineDatum, PlutusV3, preprod, SlotConfig, Time, TransactionHash, TransactionInput, UPLC,
  type UTxO,
} from "@evolution-sdk/evolution";
import { addressCredentials, MASUMI_DEFAULT_DEPLOYMENT, masumiEscrowAddress, parseMasumiLockDatum, type MasumiDatumView } from "@x402/cardano";

export const NETWORK = "cardano:preprod";
export const ESCROW_ADDRESS = masumiEscrowAddress(NETWORK);
export const explorerTx = (txHash: string) => `https://preprod.cardanoscan.io/transaction/${txHash}`;

/** Datum `state` constructor indices (ak:32-39). */
export const STATE = {
  FundsLocked: 0n, ResultSubmitted: 1n, RefundRequested: 2n, Disputed: 3n, WithdrawAuthorized: 4n, RefundAuthorized: 5n,
} as const;
export const stateName = (s: bigint) => Object.entries(STATE).find(([, v]) => v === s)?.[0] ?? `Unknown(${s})`;

/** Redeemers: constructor index of the validator's Action type (ak:79). */
export const REDEEMER = {
  withdraw: Data.constr(0n, []),
  setRefundRequested: Data.constr(1n, []),
  authorizeWithdrawal: Data.constr(2n, []),
  withdrawRefund: Data.constr(3n, []),
  submitResult: Data.constr(5n, []),
  authorizeRefund: Data.constr(6n, []),
};

// ---------------------------------------------------------------- script

/** `vested_pay(required_admins, admin_vks, cooldown_period)` applied with Masumi's preprod deployment. */
export function paymentScript(): PlutusV3.PlutusV3 {
  const blueprint = JSON.parse(readFileSync(new URL("../contracts/payment-v2.plutus.json", import.meta.url), "utf8")) as {
    validators: Array<{ compiledCode: string }>;
  };
  const d = MASUMI_DEFAULT_DEPLOYMENT;
  const applied = UPLC.applyParamsToScript(blueprint.validators[0].compiledCode, [
    Data.int(BigInt(d.requiredAdmins)),
    Data.list(d.adminVkeys.map(v => Data.bytearray(v))),
    Data.int(BigInt(d.cooldownPeriod)),
  ]);
  // applyParamsToScript returns double-wrapped CBOR; PlutusV3 takes the inner bytes.
  const bytes = CBOR.fromCBORHex(applied);
  if (!(bytes instanceof Uint8Array)) throw new Error("Unexpected applied script encoding.");
  return new PlutusV3.PlutusV3({ bytes });
}

// ---------------------------------------------------------------- time

const SLOT = SlotConfig.SLOT_CONFIG_NETWORK.Preprod;
/** After acting, a party waits this long before acting again (7 min on preprod). */
export const COOLDOWN_MS = BigInt(MASUMI_DEFAULT_DEPLOYMENT.cooldownPeriod);
/** Scripts see a validity bound as the start of its slot. */
export const slotStartMs = (ms: bigint) => Time.slotToUnixTime(Time.unixTimeToSlot(ms, SLOT), SLOT);
/** First slot start at or after `ms` (for lower bounds that must clear a deadline). */
export const ceilToSlotMs = (ms: bigint) => (slotStartMs(ms) === ms ? ms : slotStartMs(ms) + BigInt(SLOT.slotLength));

// ---------------------------------------------------------------- keys

/** Payment key hash (hex) of a key-credential address. */
export function paymentKeyHash(address: string): string {
  const { payment } = addressCredentials(address);
  if (payment.isScript) throw new Error(`${address} has a script payment credential.`);
  return payment.hash;
}

// ---------------------------------------------------------------- Blockfrost

export interface Blockfrost { baseUrl: string; projectId: string }

export function blockfrostFromEnv(env = process.env): Blockfrost {
  const projectId = env.BLOCKFROST_PROJECT_ID?.trim();
  if (!projectId?.startsWith("preprod")) throw new Error("Set BLOCKFROST_PROJECT_ID (a preprod project id) in cardano/.env.");
  return { baseUrl: env.BLOCKFROST_BASE_URL?.trim() || "https://cardano-preprod.blockfrost.io/api/v0", projectId };
}

async function blockfrostGet<T>(bf: Blockfrost, path: string): Promise<T | null> {
  const r = await fetch(`${bf.baseUrl}${path}`, { headers: { project_id: bf.projectId } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Blockfrost ${path} returned ${r.status}`);
  return (await r.json()) as T;
}

interface TxOutputRow { output_index: number; address: string; consumed_by_tx?: string | null; collateral?: boolean }
const escrowOutputs = async (bf: Blockfrost, txHash: string) =>
  ((await blockfrostGet<{ outputs: TxOutputRow[] }>(bf, `/txs/${txHash}/utxos`))?.outputs ?? [])
    .filter(o => o.address === ESCROW_ADDRESS && !o.collateral);

/** Chain time from the latest block; validity windows are built from it, not the local clock. */
export async function chainTimeMs(bf: Blockfrost): Promise<bigint> {
  const block = await blockfrostGet<{ time: number }>(bf, "/blocks/latest");
  if (!block) throw new Error("Blockfrost returned no latest block.");
  return BigInt(block.time) * 1000n;
}

// ---------------------------------------------------------------- clients

export type CardanoClient = ReturnType<typeof makeClient>;

export const makeClient = (bf: Blockfrost, mnemonic: string, paymentIndex = 0) =>
  Client.make(preprod).withBlockfrost(bf).withSeed({ mnemonic, paymentIndex });

/**
 * Wallets such as Eternl spread one seed over many addresses, but the escrow
 * names a single payment key. Find the address index whose key matches.
 */
export async function clientForKey(bf: Blockfrost, mnemonic: string, keyHash: string) {
  for (let i = 0; i < 30; i++) {
    const client = makeClient(bf, mnemonic, i);
    const address = Address.toBech32(await client.address());
    if (paymentKeyHash(address) === keyHash) return { client, address, keyHash };
  }
  throw new Error(`None of the first 30 addresses of this mnemonic has payment key ${keyHash}. Wrong wallet?`);
}

// ---------------------------------------------------------------- tracking

export interface Escrow {
  utxo: UTxO.UTxO;
  /** `txHash#index` of the current escrow UTxO. */
  ref: string;
  datum: MasumiDatumView;
  lovelace: bigint;
  /** Every escrow transaction from the lock to now, oldest first. */
  history: string[];
}
export type EscrowStatus = ({ open: true } & Escrow) | { open: false; closedBy: string; history: string[] };

/** Follows a job's escrow from its lock transaction to its current UTxO, or to the transaction that closed it. */
export async function trackEscrow(bf: Blockfrost, client: CardanoClient, lockTxHash: string): Promise<EscrowStatus> {
  const history = [lockTxHash];
  let txHash = lockTxHash;
  for (let hop = 0; hop < 25; hop++) {
    const [row] = await escrowOutputs(bf, txHash);
    if (!row) throw new Error(`Transaction ${txHash} has no escrow output (unknown, not confirmed yet, or not an escrow lock).`);
    if (row.consumed_by_tx) {
      const next = row.consumed_by_tx;
      history.push(next);
      if (!(await escrowOutputs(bf, next)).length) return { open: false, closedBy: next, history };
      txHash = next;
      continue;
    }
    const input = new TransactionInput.TransactionInput({ transactionId: TransactionHash.fromHex(txHash), index: BigInt(row.output_index) });
    const [utxo] = await client.getUtxosByOutRef([input]);
    if (!utxo || !(utxo.datumOption instanceof InlineDatum.InlineDatum)) throw new Error(`Escrow output ${txHash}#${row.output_index} has no inline datum.`);
    const datum = parseMasumiLockDatum(utxo.datumOption.data);
    if (!datum) throw new Error(`Escrow output ${txHash}#${row.output_index} does not carry a vested_pay datum.`);
    return { open: true, utxo, ref: `${txHash}#${row.output_index}`, datum, lovelace: Assets.lovelaceOf(utxo.assets), history };
  }
  throw new Error("Escrow history longer than 25 transactions.");
}

/** The raw datum of an escrow UTxO with some of its 19 fields replaced. */
export function withDatumFields(utxo: UTxO.UTxO, changes: Record<number, Data.Data>): Data.Data {
  const datum = (utxo.datumOption as InlineDatum.InlineDatum).data;
  if (!Data.isConstr(datum) || datum.index !== 0n || datum.fields.length !== 19) throw new Error("Not a vested_pay V2 datum.");
  const fields = [...datum.fields];
  for (const [i, v] of Object.entries(changes)) fields[Number(i)] = v;
  return Data.constr(0n, fields);
}
