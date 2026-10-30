/**
 * How the buyer decides whether a delivered result earned its payment. The
 * loop only needs a pass/fail with reasons; where it comes from is pluggable
 * (plug the use-case's acceptance check in here).
 *
 *   fixed      a forced verdict, for testing the payout and refund paths
 */
import type { Emit } from "./hirer.ts";

export interface Verdict {
  verdict: "pass" | "fail";
  reasons: string[];
  /** Cardano transactions this decision paid for (e.g. paid checks). */
  paidTxs: string[];
}
export type VerdictSource = (result: string, emit: Emit) => Promise<Verdict>;

export const fixedVerdict = (verdict: "pass" | "fail"): VerdictSource => async (_result, emit) => {
  emit("TOOL", `Forced verdict for this test run: ${verdict.toUpperCase()}`);
  return { verdict, reasons: [`forced ${verdict}`], paidTxs: [] };
};
