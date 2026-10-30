/**
 * Run the research agent's pipeline locally, without Sokosumi:
 *
 *   npm run research -- "<topic or task brief>" [externalRef]
 *
 * Honours RESEARCH_MODE / RESEARCH_CHEAT / RESEARCH_PAY_VERIFY from cardano/.env.
 * Prints the agent log, then the full result that would be submitted to Masumi.
 */
import { withProofs } from "../research/agent.ts";

const [input = "Deep learning: a short overview for engineers. Cite at least 1 DOI.", externalRef] = process.argv.slice(2);
const answer = withProofs(async () => { throw new Error("no model provider in the local CLI; set RESEARCH_MODE=fixture"); }, { externalRef });
const result = await answer(input, "local-run.json");
console.log("\n==================== RESULT ====================\n");
console.log(result);
