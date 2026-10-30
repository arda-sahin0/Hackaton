# Cardano side — Masumi escrow (preprod)

The hirer agent's on-chain actions on Masumi's V2 escrow: follow a job from its lock transaction,
request a refund when the delivered report fails verification, and withdraw the refund. See
[`../docs/INTEGRATION.md`](../docs/INTEGRATION.md) for how this fits the API3 side.

## Setup

Node 22.18+ (runs TypeScript directly, no build step).

```sh
cd cardano
npm install
cp .env.example .env   # fill in BLOCKFROST_PROJECT_ID, BUYER_MNEMONIC, SELLER_MNEMONIC
npm run typecheck
```

Use fresh preprod test wallets only. `.env` is gitignored; never commit it.

## Commands

```sh
npm run escrow -- status    <lockTxHash>            # current state, deadlines, or the closing tx
npm run escrow -- request   <lockTxHash> [reason]   # hirer: refund request (ResultSubmitted -> Disputed)
npm run escrow -- authorize <lockTxHash>            # seller: accept the refund (-> RefundAuthorized)
npm run escrow -- withdraw  <lockTxHash>            # hirer: take the money back (escrow closed)
```

A refund request must land before the job's `unlockTime`; after that the seller can collect.
After a result is submitted, a refund request puts the escrow into `Disputed`. The honest seller
accepts (`authorize`); a seller who stays silent leaves it to Masumi's admin keys after
`externalDisputeUnlockTime`.

## Citation verifier — paid per request over Cardano x402

`GET /verify?doi=10.xxxx/yyyy` costs 1 tADA (paid straight to `VERIFY_PAY_TO`, no escrow) and returns
the OpenAlex record signed by API3's OpenAlex Airnode, checked off-chain (signer + request hash)
with the API3 side's code, plus a verdict: `valid` or `retracted`. Bad input (not a DOI, or no
proof available) is rejected before the payment step, and a failed lookup is not settled.

```sh
npm run verify-server                     # http://localhost:4030
npm run pay-verify -- 10.1038/nature14539 # an agent pays from BUYER_MNEMONIC, server-side
```

Proofs come from `api3evm/` (run `npx pnpm@11.5.2 install` there once):

- **fixture** (default): replays the signed responses in `api3evm/test/fixtures` — real Airnode
  signatures, so the off-chain check still runs.
- **live**: set `PAYER_PRIVATE_KEY` (an EVM account with aUSD on Base Sepolia); each lookup pays
  0.01 aUSD to the Airnode and the response includes that Base Sepolia transaction.

On Windows, stop the server with Ctrl+C in its own terminal; a stopped `npm run` can leave the
`node` process holding port 4030.

## Hirer agent — one job end to end

```sh
npm run hire -- --task "text" [--verdict citations|pass|fail] [--seller-accepts] [--min-sources N]
```

1. **Hire:** POSTs the job to the agent's x402 endpoint (`AGENT_OFFER_URL`) and pays the 402 offer
   by locking the price in Masumi's escrow, signed server-side from `BUYER_MNEMONIC`.
2. **Watch:** follows the escrow until the agent puts its result hash on chain, fetches the result
   and checks it matches that hash (MIP-004 `sha256(identifier;result)`).
3. **Decide:** `citations` (default) pays `/verify` for every DOI in the report and fails on a
   retracted or unprovable source; `proofs` re-checks the signed proofs our research agent ships inside its
   report (no fee, `src/hirer/proof-check.ts`); `pass` / `fail` force a verdict for testing. Next: read the API3
   side's `CitationEscrow.isFullyProven(jobId)` on Base Sepolia.
4. **Act:** pass → nothing on chain, the agent collects after `unlockTime`; fail → refund request,
   then withdraw once the seller authorizes. `--seller-accepts` (demo only) also plays the honest
   seller with `SELLER_MNEMONIC`, so the whole refund path runs in one command.

Each step is emitted as an event with the dashboard terminal's tags (`AGENT`, `TOOL`, `ORACLE`,
`VERIFY`, `SIGNING`, `CHAIN`, `VERIFIED`, `DONE`, `ERROR`) and its explorer link, so the dashboard
can stream the same loop (`runHirerJob(..., { onEvent })` in `src/hirer/hirer.ts`).

## Proven on preprod (2026-10-30)

| Step | Transaction |
| --- | --- |
| x402 payment, 2 tADA | [`89f34549…`](https://preprod.cardanoscan.io/transaction/89f34549e6b96ae4d35325d65727d8d09f781e7168b88e22cfbc6e4bebf99863) |
| `/verify` paid, 1 tADA — `10.1038/nature14539` → valid | [`48eaf21b…`](https://preprod.cardanoscan.io/transaction/48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5) |
| `/verify` paid, 1 tADA — `10.1038/nature00870` → retracted | [`af8f5f3c…`](https://preprod.cardanoscan.io/transaction/af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919) |
| **Hirer agent, one command (`npm run hire -- --verdict fail --seller-accepts`), 2.5 min:** | |
| escrow lock, signed server-side | [`eabaa071…`](https://preprod.cardanoscan.io/transaction/eabaa0710080fbe650776fcf3934f46a3d224d72a496d21c59be32b62c25226d) |
| agent submits result hash | [`9635c837…`](https://preprod.cardanoscan.io/transaction/9635c837f8a463d7c125ea9b410afbcd5b89bc06b749350dea1b1ba6cdedd0ce) |
| refund request (→ Disputed) | [`588dc258…`](https://preprod.cardanoscan.io/transaction/588dc2583f782b5da2dcc8fc5867f2296b3878f1fa3f5551664c40c8a243c62f) |
| seller authorizes | [`eb8d7f89…`](https://preprod.cardanoscan.io/transaction/eb8d7f89bd7cacf7358401be1f608fd0461af2ff90ed0f90af91dc41dce288ef) |
| refund withdrawn | [`a178b8d5…`](https://preprod.cardanoscan.io/transaction/a178b8d5945edfeaccd03eb7a2db85bf8f701b1674f4304576467bd4c1dbf8f1) |
| Refund path — job lock | [`b69d62f7…`](https://preprod.cardanoscan.io/transaction/b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef) |
| Refund request (→ Disputed) | [`f19d7cdd…`](https://preprod.cardanoscan.io/transaction/f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0) |
| Seller authorizes refund | [`de100c97…`](https://preprod.cardanoscan.io/transaction/de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860) |
| Hirer withdraws refund | [`6125026f…`](https://preprod.cardanoscan.io/transaction/6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e) |

## Research agent — a Masumi/Sokosumi Coworker that proves its citations

The seller is a Sokosumi Coworker built on the [TUM quickstart](https://github.com/masumi-network/tum-hackathon-quickstart)
(a sibling clone, not vendored). Its instructions and the proof pipeline live here; `setup.sh` wires them in.

```sh
git clone https://github.com/masumi-network/tum-hackathon-quickstart.git ../tum-hackathon-quickstart
(cd ../tum-hackathon-quickstart && npm ci && cp .env.example .env && chmod 600 .env)
sh research-agent/setup.sh          # copies instructions.md, patches worker.mjs (idempotent)
```

In the quickstart `.env`: `COWORKER_ID`, `SOKOSUMI_ORGANIZATION_ID` + `_SLUG` (TUM Workspace), the model
provider (`ZAI_*`, any OpenAI-compatible endpoint) and `RESEARCH_MODULE=<this repo>/cardano/src/research/agent.ts`.
Then `npm start` (Eve) and `npm run worker` in two terminals; create a Task with
`sokosumi --preprod tasks create --organization-slug <slug> --coworker-id <id> --name … --description … --status READY --json`.

What happens per Task (`src/research/agent.ts`, `withProofs`):

1. the model writes the report (or, with `RESEARCH_MODE=fixture`, a saved report is replayed — demo safety, no model key needed);
2. every cited DOI is pre-checked on OpenAlex for free (cached in `.cache/`), so unknown or retracted DOIs cost nothing;
3. each DOI gets a signed Airnode proof — replayed fixture, live aUSD lookup, or paid over Cardano x402 via `/verify`
   (`RESEARCH_PAY_VERIFY=true`, one preprod tx per DOI from `SELLER_MNEMONIC`);
4. when `CITATION_ESCROW_ADDRESS` is set, the proofs are recorded on Base Sepolia (`createJob` with amount 0,
   `deliver(reportHash, dois)`, `proveSource` per DOI) with `externalRef = keccak256(<Task ID>)`;
5. the Masumi result = report + `## Verification` + a JSON block (report hash, external ref, per-DOI proof, EVM job).

`RESEARCH_CHEAT=retracted|tamper` runs the cheating twin for the demo (cites a retracted paper / forges
`is_retracted=false` in signed data). Try it without Sokosumi: `npm run research -- "<brief>" [externalRef]`.

Registered on preprod (IDs are public): Vendor **Citation Escrow** `01a18d04-27d3-76c6-ae83-b8ef6dbfab51`,
Coworker **Research Agent (citation-verified)** `01a18d05-9815-71fd-8eb2-621999aac09c`, TUM Workspace
`tum-hackathon-u4ve65`. Paid Tasks additionally need a Masumi Payment Service (see the quickstart README).

## Hirer agent

```sh
npm run hirer -- create "<brief>" [minSources]      # create the Task, wait, verify, decide
npm run hirer -- check  <taskId> [lockTxHash]       # re-evaluate a Task; with a lock tx, request the refund
npm run hirer -- verify <resultFile> [lockTxHash]   # re-check a saved result (no Sokosumi needed)
```

The hirer never trusts the seller's verdict: it recovers every Airnode signature and request hash itself, reads
`CitationEscrow.isFullyProven` when deployed, and only then decides — all proven → Masumi releases the ADA after the
dispute window; otherwise → `SetRefundRequested` before `unlockTime` (`src/refund.ts`). Decisions are appended to
`.local/hirer-events.jsonl`, the feed of the dashboard terminal.

## Dashboard

The Next.js command center at the repo root runs this package as child processes (`src/lib/agent/workflows/citation-escrow.ts`):
pick the seller identity, press **Hire & Verify**, and the terminal streams the research agent, the hirer's re-check
and the settlement; the proof table lists each Cardano transaction and confirms it through Blockfrost.

## Files

- `src/escrow.ts` — escrow address, validator script, slot-time rules, escrow tracking.
- `src/refund.ts` — refund request, refund authorization, refund withdrawal.
- `src/cli/escrow.ts` — the escrow command line above.
- `src/verify/server.ts`, `src/verify/proof.ts` — the paid citation verifier.
- `src/cli/pay-verify.ts` — an agent paying the verifier, signing server-side.
- `src/hirer/hirer.ts`, `src/hirer/verdict.ts`, `src/cli/hire.ts` — the hirer agent loop.
- `src/x402-client.ts` — paying x402 offers from a seed phrase (plain payments and escrow locks).
- `src/verify/openalex-precheck.ts`, `src/verify/x402-client.ts` — free pre-check with cache; the paid `/verify` client built on `src/x402-client.ts`.
- `src/research/agent.ts`, `parse.ts`, `fixtures.ts` — the research agent's proof pipeline (`withProofs`).
- `src/evm/citation-escrow.ts` — CitationEscrow calls on Base Sepolia (viem), off until the contract is deployed.
- `src/cli/research.ts`, `src/cli/hirer.ts` — local pipeline run; the Sokosumi-Task hirer (`hirer`), complementing the Masumi x402 hirer loop (`hire`).
- `research-agent/instructions.md`, `research-agent/setup.sh` — the Coworker's instructions and quickstart wiring.
- `contracts/payment-v2.plutus.json` — Masumi's validator, vendored unmodified (MIT, see `NOTICE.md`).

Escrow rules follow Masumi's validator `vested_pay.ak` (cited as `ak:N` in the code).
