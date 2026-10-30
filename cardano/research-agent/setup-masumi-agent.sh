#!/usr/bin/env sh
# Turns the Cardano Foundation's Masumi x402 agent demo (a sibling clone of
# https://github.com/cardano-foundation/x402-cardano-demo, folder masumi/) into our
# research agent: the escrow lock, result hash and collection stay the demo's; the
# "task" becomes the citation-proving pipeline in src/research/agent.ts. Idempotent.
#
#   sh cardano/research-agent/setup-masumi-agent.sh [path/to/x402-cardano-demo/masumi]
#
# Then in masumi/.env: BLOCKFROST_PROJECT_ID, SELLER_MNEMONIC (funded, ~20 tADA),
# AGENT_PUBLIC_URL (http://localhost:8787 for a local hirer), RESEARCH_MODULE=<repo>/cardano/src/research/agent.ts,
# RESEARCH_MODE=fixture|model. MASUMI_AGENT_IDENTIFIER may stay empty: the unlisted tADA offer
# (/x402/start_job/ada) needs no registration, and that is what `npm run hire` pays.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT=${1:-"$HERE/../../../x402-cardano-demo/masumi"}
[ -f "$AGENT/src/agent.ts" ] || { echo "Masumi agent demo not found at $AGENT"; exit 1; }

node - "$AGENT/src/agent.ts" <<'JS'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
let src = fs.readFileSync(file, "utf8");
if (src.includes("RESEARCH_MODULE")) { console.log("agent.ts already patched"); process.exit(0); }
const replace = (from, to) => {
  if (!src.includes(from)) { console.error(`pattern not found, patch by hand:\n${from}`); process.exit(1); }
  src = src.replace(from, to);
};
replace(
  'import { randomUUID } from "node:crypto";',
  'import { randomUUID } from "node:crypto";\nimport { pathToFileURL } from "node:url";',
);
replace(
  'const runTask = (input: { text: string }) => [...input.text].reverse().join("").toUpperCase();',
  `const runTask = (input: { text: string }) => [...input.text].reverse().join("").toUpperCase();

// ---- Citation-verified research agent (RESEARCH_MODULE) --------------------
// The job's "work" becomes the research pipeline: report + signed Airnode proof per
// DOI (+ CitationEscrow record when deployed). The Masumi job id is the externalRef.
type ResearchAnswer = (input: string, journal: string, deadline?: number) => Promise<string>;
type ResearchModule = { withProofs: (model: ResearchAnswer, opts: { externalRef?: string }) => ResearchAnswer };
const researchModule = process.env.RESEARCH_MODULE?.trim();
const research = researchModule ? (import(pathToFileURL(researchModule).href) as Promise<ResearchModule>) : undefined;
async function runJob(job: Job): Promise<string> {
  if (!research) return runTask(job.input.input_data);
  const { withProofs } = await research;
  const externalRef = String((job.terms as { blockchainIdentifier?: unknown }).blockchainIdentifier ?? job.id);
  const answer = withProofs(async () => { throw new Error("no model provider in the Masumi agent; set RESEARCH_MODE=fixture"); }, { externalRef });
  return answer(job.input.input_data.text, \`.local/\${job.id}.json\`, Number(job.expected.submitResultTime));
}`,
);
replace(
  'const result = runTask(job.input.input_data);',
  'const result = await runJob(job);',
);
replace(
  'const agentIdentifier = configuredAgentIdentifier();',
  '// Unregistered is fine for the unlisted tADA offer (no registry claim); the tUSDM offer needs the NFT.\nconst agentIdentifier = process.env.MASUMI_AGENT_IDENTIFIER?.trim() ? configuredAgentIdentifier() : "";',
);
replace(
  '  x402Offer("/x402/start_job", { amount: priceUnits.toString(), asset: TUSDM_X402_ASSET }, agentIdentifier),',
  '  ...(agentIdentifier ? [x402Offer("/x402/start_job", { amount: priceUnits.toString(), asset: TUSDM_X402_ASSET }, agentIdentifier)] : []),',
);
replace(
  'message: "Reverses and upper-cases text."',
  'message: research ? "Citation-verified literature summaries: every cited DOI proven with an API3 Airnode-signed OpenAlex response." : "Reverses and upper-cases text."',
);
fs.writeFileSync(file, src);
console.log("patched agent.ts");
JS
mkdir -p "$AGENT/.local"
echo "done. Configure $AGENT/.env (see the header of this script), then: cd $AGENT && npm install && npm run agent"
