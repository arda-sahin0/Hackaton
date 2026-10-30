#!/usr/bin/env sh
# Wires the Masumi/Sokosumi quickstart (a sibling clone of
# https://github.com/masumi-network/tum-hackathon-quickstart) to this research agent.
# Idempotent: run it again after changing instructions.md.
#
#   sh cardano/research-agent/setup.sh [path/to/tum-hackathon-quickstart]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
QS=${1:-"$HERE/../../../tum-hackathon-quickstart"}
[ -f "$QS/worker.mjs" ] || { echo "quickstart not found at $QS"; exit 1; }

cp "$HERE/instructions.md" "$QS/agent/instructions.md"
echo "copied instructions.md"

node - "$QS/worker.mjs" "$HERE/../src/research/agent.ts" <<'JS'
const fs = require("node:fs");
const [file, moduleDefault] = process.argv.slice(2);
let src = fs.readFileSync(file, "utf8");
if (src.includes("RESEARCH_MODULE")) { console.log("worker.mjs already patched"); process.exit(0); }
const needle = "import {answer,client} from './client.mjs';";
if (!src.includes(needle)) { console.error("worker.mjs import line not found; patch by hand"); process.exit(1); }
src = src.replace(needle,
  "import {answer as modelAnswer,client} from './client.mjs';\n" +
  "import {pathToFileURL} from 'node:url';\n" +
  "// Citation-verified research agent: wraps the model answer with DOI proofs (RESEARCH_MODULE in .env).\n" +
  "const {withProofs}=await import(pathToFileURL(process.env.RESEARCH_MODULE||" + JSON.stringify(require("node:path").resolve(moduleDefault)) + ").href);\n" +
  "const answer=withProofs(modelAnswer);");
fs.writeFileSync(file, src);
console.log("patched worker.mjs");
JS
echo "done. In $QS/.env set RESEARCH_MODULE (optional), RESEARCH_MODE=fixture|model, RESEARCH_CHEAT=none|retracted|tamper"
