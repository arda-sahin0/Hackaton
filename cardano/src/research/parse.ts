/**
 * Reads the machine-readable part of a research report: the final ```json
 * block {"topic", "minSources", "dois": [...]} that agent instructions ask for,
 * with a fallback that scrapes DOIs from the References section.
 */
import { normalizeDoi } from "../../../api3evm/src/openalex.ts";

export interface ParsedReport {
  topic: string;
  minSources: number;
  /** Normalized (lowercase, bare), in citation order, no duplicates. */
  dois: string[];
  /** DOIs the model listed that are not valid DOI syntax. */
  rejected: string[];
}

const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>)\]]+/g;

export function parseReport(report: string): ParsedReport {
  const blocks = [...report.matchAll(/```json\s*([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  let topic = "";
  let minSources = 0;
  let raw: string[] = [];
  if (last) {
    try {
      const j = JSON.parse(last) as { topic?: unknown; minSources?: unknown; dois?: unknown };
      topic = typeof j.topic === "string" ? j.topic : "";
      minSources = Number.isInteger(j.minSources) ? (j.minSources as number) : 0;
      raw = Array.isArray(j.dois) ? j.dois.filter((d): d is string => typeof d === "string") : [];
    } catch { /* fall through to scraping */ }
  }
  if (!raw.length) raw = [...report.matchAll(DOI_RE)].map(m => m[0].replace(/[.,;:]+$/, ""));

  const dois: string[] = [];
  const rejected: string[] = [];
  for (const d of raw) {
    try {
      const n = normalizeDoi(d);
      if (!dois.includes(n)) dois.push(n);
    } catch {
      rejected.push(d);
    }
  }
  return { topic, minSources, dois, rejected };
}

/** The report without the trailing verification section (what `deliver` hashes). */
export const stripVerification = (text: string) => text.split(/\n## Verification\n/)[0]!.trimEnd();
