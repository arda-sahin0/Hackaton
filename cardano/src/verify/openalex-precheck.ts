/**
 * Free, unsigned OpenAlex lookup used as a pre-check before anyone pays for a
 * signed proof: a DOI that OpenAlex does not know (404) or marks retracted
 * cannot be proven, so the agent drops it without spending aUSD or tADA.
 *
 * Responses are cached on disk (OpenAlex quotas are shared by the whole team).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeDoi, type SignedWork } from "../../../api3evm/src/openalex.ts";

export type Precheck =
  | { status: "found"; work: SignedWork; cached: boolean }
  | { status: "not-found"; cached: boolean };

const CACHE_FILE = new URL("../../.cache/openalex.json", import.meta.url);

function readCache(): Record<string, Precheck> {
  try {
    return existsSync(CACHE_FILE) ? (JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<string, Precheck>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Precheck>) {
  mkdirSync(new URL("./", CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export async function precheckDoi(input: string, env = process.env): Promise<Precheck> {
  const doi = normalizeDoi(input);
  const cache = readCache();
  const hit = cache[doi];
  if (hit) return { ...hit, cached: true };

  const mailto = env.OPENALEX_MAILTO?.trim();
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=doi,is_retracted,title${mailto ? `&mailto=${encodeURIComponent(mailto)}` : ""}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  let result: Precheck;
  if (r.status === 404) result = { status: "not-found", cached: false };
  else if (!r.ok) throw new Error(`OpenAlex returned ${r.status} for ${doi}`);
  else result = { status: "found", work: (await r.json()) as SignedWork, cached: false };
  cache[doi] = { ...result, cached: true };
  writeCache(cache);
  return result;
}
