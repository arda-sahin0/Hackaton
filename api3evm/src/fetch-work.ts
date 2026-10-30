import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { verifySignedResponse } from './airnode-v2.ts';
import {
  DEFAULT_DOI,
  deriveWorkRequestHash,
  fetchSignedWork,
  normalizeDoi,
  OPENALEX_AIRNODE_V2_ADDRESS,
  type SignedWork,
} from './openalex.ts';
import { createScriptFetch } from './script-options.ts';

// pnpm fetch-work [doi] [--save]
// Pays 0.01 aUSD for one signed getWork, checks the signer and request hash, and prints the response. --save also
// writes it to test/fixtures/openalex-<doi>.json for the Foundry tests.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { save: { type: 'boolean', default: false } },
});
const doi = normalizeDoi(positionals[0] ?? DEFAULT_DOI);

const signedResponse = await fetchSignedWork(doi, createScriptFetch());
await verifySignedResponse(signedResponse, OPENALEX_AIRNODE_V2_ADDRESS, deriveWorkRequestHash(doi));

const work = JSON.parse(signedResponse.data) as SignedWork;
console.error(`Signed: "${work.title}" (${work.doi}), is_retracted=${work.is_retracted}`);

const output = JSON.stringify(signedResponse, null, 2);
if (values.save) {
  const path = `test/fixtures/openalex-${doi.replaceAll(/[^a-z0-9]+/g, '-')}.json`;
  writeFileSync(path, `${output}\n`);
  console.error(`Saved ${path}`);
}
console.log(output);
