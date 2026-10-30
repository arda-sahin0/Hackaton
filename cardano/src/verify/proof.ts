/**
 * Signed citation proofs: an OpenAlex work record signed by the API3 AirnodeHub
 * OpenAlex Airnode, checked off-chain (signer + request hash) before anyone
 * pays a fee for it. The API3 side's code (api3evm/) does the fetching and the
 * signature check; this module only picks the source and shapes the answer.
 *
 *   live     PAYER_PRIVATE_KEY set: pay 0.01 aUSD on Base Sepolia per lookup
 *   fixture  otherwise: replay a saved signed response from api3evm/test/fixtures
 *            (real Airnode signatures, so the off-chain check still runs)
 */
import { existsSync, readFileSync } from "node:fs";
import { verifySignedResponse, type SignedResponse } from "../../../api3evm/src/airnode-v2.ts";
import {
  deriveWorkRequestHash, fetchSignedWork, normalizeDoi, OPENALEX_AIRNODE_V2_ADDRESS, type SignedWork,
} from "../../../api3evm/src/openalex.ts";
import { createPayingFetch, readPaymentSettlement } from "../../../api3evm/src/x402.ts";

export type Verdict = "valid" | "retracted";

export interface CitationProof {
  doi: string;
  verdict: Verdict;
  work: SignedWork;
  /** The signed response exactly as the Airnode returned it — pass it on as is, never re-serialise `data`. */
  proof: SignedResponse;
  checks: { signer: string; requestHash: string; offChain: "passed" };
  source: "live" | "fixture";
  /** Base Sepolia settlement of the aUSD data payment (live mode). */
  dataPayment?: { txHash: string; explorer: string };
}

export class ProofError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIXTURES = new URL("../../../api3evm/test/fixtures/", import.meta.url);
const fixtureFor = (doi: string) => new URL(`openalex-${doi.replaceAll(/[^a-z0-9]+/g, "-")}.json`, FIXTURES);

export const proofMode = (env = process.env): "live" | "fixture" => (env.PAYER_PRIVATE_KEY?.trim() ? "live" : "fixture");

/** Throws ProofError(400) for input that is not a DOI, so callers can reject it before taking payment. */
export function parseDoi(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new ProofError(400, "Pass ?doi=10.xxxx/yyyy");
  try {
    return normalizeDoi(input);
  } catch (error) {
    throw new ProofError(400, error instanceof Error ? error.message : String(error));
  }
}

export function hasFixture(doi: string) {
  return existsSync(fixtureFor(doi));
}

export async function getCitationProof(doi: string, env = process.env): Promise<CitationProof> {
  const mode = proofMode(env);
  let signed: SignedResponse;
  let dataPayment: CitationProof["dataPayment"];

  if (mode === "live") {
    let settlement: ReturnType<typeof readPaymentSettlement>;
    const paying = createPayingFetch(env.PAYER_PRIVATE_KEY!.trim() as `0x${string}`);
    const recording: typeof fetch = async (input, init) => {
      const response = await paying(input, init);
      settlement = readPaymentSettlement(response) ?? settlement;
      return response;
    };
    signed = await fetchSignedWork(doi, recording);
    if (settlement?.success && settlement.transaction) {
      dataPayment = { txHash: settlement.transaction, explorer: `https://sepolia.basescan.org/tx/${settlement.transaction}` };
    }
  } else {
    if (!hasFixture(doi)) throw new ProofError(404, `No saved signed response for ${doi} (fixture mode). Set PAYER_PRIVATE_KEY for live lookups.`);
    signed = JSON.parse(readFileSync(fixtureFor(doi), "utf8")) as SignedResponse;
  }

  // Never trust the response's own airnode field: compare with the hard-coded signer and the expected request hash.
  const requestHash = deriveWorkRequestHash(doi);
  await verifySignedResponse(signed, OPENALEX_AIRNODE_V2_ADDRESS, requestHash);

  const work = JSON.parse(signed.data) as SignedWork;
  return {
    doi,
    verdict: work.is_retracted ? "retracted" : "valid",
    work,
    proof: signed,
    checks: { signer: OPENALEX_AIRNODE_V2_ADDRESS, requestHash, offChain: "passed" },
    source: mode,
    ...(dataPayment ? { dataPayment } : {}),
  };
}
