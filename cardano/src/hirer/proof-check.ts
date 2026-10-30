/**
 * The hirer's independent check of a research result: recover every Airnode
 * signature in the `## Verification` block itself, confirm the request hash
 * and the not-retracted flag, and read CitationEscrow.isFullyProven when the
 * contract is deployed. Never trusts the seller's own `allProven`.
 *
 * Shared by the Sokosumi-Task hirer (cli/hirer.ts) and the Masumi x402 hirer
 * loop (`--verdict proofs` in cli/hire.ts).
 */
import { verifySignedResponse, type SignedResponse } from "../../../api3evm/src/airnode-v2.ts";
import { deriveWorkRequestHash, OPENALEX_AIRNODE_V2_ADDRESS, type SignedWork } from "../../../api3evm/src/openalex.ts";
import { isFullyProven } from "../evm/citation-escrow.ts";
import type { Verification } from "../research/agent.ts";

export interface ProofCheck {
  proven: number;
  total: number;
  reasons: string[];
  /** CitationEscrow.isFullyProven, or null when the contract is not deployed / the result names no job. */
  chain: boolean | null;
  /** The hirer's decision: every cited DOI proven and at least minSources of them. */
  ok: boolean;
}

export function parseVerification(result: string): Verification | null {
  const block = [...result.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  if (!block) return null;
  try { return JSON.parse(block) as Verification; } catch { return null; }
}

export async function checkProofs(v: Verification, log: (tag: "VERIFY" | "CHAIN", message: string) => void, env = process.env): Promise<ProofCheck> {
  const reasons: string[] = [];
  let proven = 0;
  for (const s of v.sources) {
    const proof = s.proof as SignedResponse | undefined;
    if (!proof) { reasons.push(`${s.doi}: no signed proof`); log("VERIFY", `${s.doi}: no signed proof`); continue; }
    try {
      await verifySignedResponse(proof, OPENALEX_AIRNODE_V2_ADDRESS, deriveWorkRequestHash(s.doi));
      const work = JSON.parse(proof.data) as SignedWork;
      if (work.is_retracted) { reasons.push(`${s.doi}: retracted`); log("VERIFY", `${s.doi}: signature valid but RETRACTED`); continue; }
      proven++;
      log("VERIFY", `${s.doi}: Airnode signature valid, not retracted — "${work.title}"`);
    } catch (error) {
      const m = error instanceof Error ? error.message : String(error);
      reasons.push(`${s.doi}: ${m}`);
      log("VERIFY", `${s.doi}: REJECTED — ${m}`);
    }
  }
  let chain: boolean | null = null;
  if ("jobId" in v.evm) {
    const r = await isFullyProven(BigInt(v.evm.jobId), env);
    if (typeof r === "boolean") { chain = r; log("CHAIN", `CitationEscrow.isFullyProven(${v.evm.jobId}) = ${r}`); }
    else log("CHAIN", `isFullyProven skipped: ${r.skipped}`);
  }
  const total = v.sources.length;
  const enough = proven >= Math.max(1, v.minSources) && proven === total;
  return { proven, total, reasons, chain, ok: chain === null ? enough : chain && enough };
}
