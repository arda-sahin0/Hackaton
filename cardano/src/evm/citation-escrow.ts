/**
 * The research agent's side of CitationEscrow on Base Sepolia (API3 side's
 * contract): record the delivered report and prove each DOI with its signed
 * OpenAlex response, and the hirer's read of `isFullyProven`.
 *
 * In Cardano-paid mode the job is created with amount = 0: the contract is the
 * public proof record while Masumi's escrow moves the ADA (docs/INTEGRATION.md).
 *
 * Off until the contract is deployed: without CITATION_ESCROW_ADDRESS every
 * call reports `skipped` instead of touching a chain.
 *
 * TODO(api3 side): `createJob` gains an `externalRef` (keccak256 of the Masumi
 * blockchainIdentifier / Sokosumi Task ID) and `isFullyProven` lands; adjust
 * the ABI then.
 */
import {
  createPublicClient, createWalletClient, http, keccak256, parseAbi, parseEventLogs, toHex, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { SignedResponse } from "../../../api3evm/src/airnode-v2.ts";

export const CITATION_ESCROW_ABI = parseAbi([
  "function createJob(address researcher, uint256 minSources, uint64 deadline, uint256 amount) returns (uint256 jobId)",
  "function deliver(uint256 jobId, bytes32 reportHash, string[] dois)",
  "function proveSource(uint256 jobId, uint256 index, uint256 timestamp, bytes data, bytes signature)",
  "function isFullyProven(uint256 jobId) view returns (bool)",
  "function doisOf(uint256 jobId) view returns (string[])",
  "function jobCount() view returns (uint256)",
  "event JobCreated(uint256 indexed jobId, address indexed hirer, address indexed researcher, uint256 amount, uint256 minSources, uint64 deadline)",
  "event SourceProven(uint256 indexed jobId, uint256 index, string doi, string title)",
]);

export const explorerEvmTx = (txHash: string) => `https://sepolia.basescan.org/tx/${txHash}`;

export interface EscrowConfig { address: Address; rpcUrl: string }

/** null until CITATION_ESCROW_ADDRESS is set (contract not deployed yet). */
export function escrowConfig(env = process.env): EscrowConfig | null {
  const address = env.CITATION_ESCROW_ADDRESS?.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) return null;
  return { address: address as Address, rpcUrl: env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org" };
}

const publicClient = (cfg: EscrowConfig) => createPublicClient({ chain: baseSepolia, transport: http(cfg.rpcUrl) });

/** Hirer agent: no wallet needed. */
export async function isFullyProven(jobId: bigint, env = process.env): Promise<boolean | { skipped: string }> {
  const cfg = escrowConfig(env);
  if (!cfg) return { skipped: "CITATION_ESCROW_ADDRESS not set (contract not deployed)" };
  return publicClient(cfg).readContract({ address: cfg.address, abi: CITATION_ESCROW_ABI, functionName: "isFullyProven", args: [jobId] });
}

/** keccak256 of the exact report text — what `deliver` stores. */
export const reportHashOf = (report: string): Hex => keccak256(toHex(report));

/** keccak256 of the Masumi / Sokosumi identifier — the planned `externalRef`. */
export const externalRefOf = (identifier: string): Hex => keccak256(toHex(identifier));

export interface ProofSubmission { doi: string; proof: SignedResponse }

export type RecordResult =
  | { skipped: string }
  | { jobId: string; createTx: string; deliverTx: string; proveTxs: Array<{ doi: string; txHash: string; ok: boolean; error?: string }>; fullyProven: boolean | null };

/**
 * Research agent: createJob (amount 0) → deliver(reportHash, dois) → proveSource per DOI.
 * A proof the contract rejects (retracted, bad signature) is recorded as `ok: false`, not thrown:
 * the job then stays unproven and the hirer refunds.
 */
export async function recordProofs(
  input: { report: string; dois: string[]; proofs: ProofSubmission[]; externalRef: string; minSources: number; deadlineSeconds?: number },
  env = process.env,
  log: (line: string) => void = () => {},
): Promise<RecordResult> {
  const cfg = escrowConfig(env);
  if (!cfg) return { skipped: "CITATION_ESCROW_ADDRESS not set (contract not deployed)" };
  const pk = env.RESEARCHER_EVM_PRIVATE_KEY?.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk ?? "")) return { skipped: "RESEARCHER_EVM_PRIVATE_KEY not set" };

  const account = privateKeyToAccount(pk as Hex);
  const pub = publicClient(cfg);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(cfg.rpcUrl) });
  const base = { address: cfg.address, abi: CITATION_ESCROW_ABI } as const;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (input.deadlineSeconds ?? 3600));

  log(`createJob(amount 0, minSources ${input.minSources}) externalRef ${externalRefOf(input.externalRef)}`);
  const createTx = await wallet.writeContract({ ...base, functionName: "createJob", args: [account.address, BigInt(input.minSources), deadline, 0n] });
  const receipt = await pub.waitForTransactionReceipt({ hash: createTx });
  const [created] = parseEventLogs({ abi: CITATION_ESCROW_ABI, eventName: "JobCreated", logs: receipt.logs });
  if (!created) throw new Error(`createJob ${createTx} emitted no JobCreated event`);
  const jobId = created.args.jobId;

  log(`deliver(job ${jobId}, reportHash ${reportHashOf(input.report)}, ${input.dois.length} DOIs)`);
  const deliverTx = await wallet.writeContract({ ...base, functionName: "deliver", args: [jobId, reportHashOf(input.report), input.dois] });
  await pub.waitForTransactionReceipt({ hash: deliverTx });

  const proveTxs: Array<{ doi: string; txHash: string; ok: boolean; error?: string }> = [];
  for (const [index, doi] of input.dois.entries()) {
    const sub = input.proofs.find(p => p.doi === doi);
    if (!sub) { proveTxs.push({ doi, txHash: "", ok: false, error: "no signed proof" }); continue; }
    try {
      const txHash = await wallet.writeContract({
        ...base, functionName: "proveSource",
        args: [jobId, BigInt(index), BigInt(sub.proof.timestamp), toHex(sub.proof.data), sub.proof.signature],
      });
      const r = await pub.waitForTransactionReceipt({ hash: txHash });
      proveTxs.push({ doi, txHash, ok: r.status === "success" });
      log(`proveSource #${index} ${doi} → ${r.status} ${explorerEvmTx(txHash)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      proveTxs.push({ doi, txHash: "", ok: false, error: message });
      log(`proveSource #${index} ${doi} rejected: ${message}`);
    }
  }
  let fullyProven: boolean | null = null;
  try {
    fullyProven = await pub.readContract({ ...base, functionName: "isFullyProven", args: [jobId] });
  } catch { /* isFullyProven not deployed yet */ }
  return { jobId: jobId.toString(), createTx, deliverTx, proveTxs, fullyProven };
}
