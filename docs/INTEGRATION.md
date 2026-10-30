# Combining the API3 (EVM) and Cardano sides

How the two halves of the citation-verified research escrow fit together, who builds what, and the interface between
them. Keep this file up to date when the plan changes.

## The product in one paragraph

A hiring agent pays a research agent for a literature summary that cites at least N sources. The research agent must
prove every cited DOI exists and is not retracted, using OpenAlex responses signed by the API3 AirnodeHub Airnode.
If all sources are proven before the deadline, the researcher gets paid; otherwise the hirer gets a refund. Signatures
are checked by a smart contract, not by trusting either agent.

## Who owns what

| Part | Chain | Owner | Track it scores for |
| --- | --- | --- | --- |
| `CitationEscrow.sol`: verifies Airnode signatures, records proven sources, holds aUSD escrow | Base Sepolia | API3 side | API3 (€2,000) |
| OpenAlex fetch + x402 aUSD payments (`api3evm/src/openalex.ts`, `fetch-work.ts`) | Base Sepolia | API3 side, done | API3 |
| Research agent registered on Masumi/Sokosumi, paid per job in ADA | Cardano preprod | Cardano side | Cardano (€6,000) |
| "Verify a citation" paid endpoint over Cardano x402 | Cardano preprod | Cardano side | Cardano |
| Agent loop (schedule, spending caps, retries) tying both together | both | shared | API3 agent bonus (+10) |

## The end-to-end flow (demo happy path)

```
Hirer agent                 Cardano (preprod)                 Research agent                  Base Sepolia
-----------                 -----------------                 --------------                  ------------
1. create paid job  ───────► Masumi escrow locks ADA
                             (Cardano tx hash #1)
2.                                                   ───────► picks sources, writes report
3.                                                            for each DOI: pay 0.01 aUSD ──► x402 tx (Base Sepolia)
                                                              receive signed OpenAlex response
                                                              pre-check signer + requestHash off-chain
4.                                                            createJob + deliver(report hash, DOIs) ─► CitationEscrow
5.                                                            proveSource(...) per DOI ──────────────► contract checks
                                                                                                       signature itself,
                                                                                                       emits SourceProven
6.                                                   ◄─────── submits result to Masumi
                             result hash stored on-chain
7. reads CitationEscrow ◄───────────────────────────────────────────────────────────────────────────── isFullyProven(jobId)
   all proven → do nothing, Masumi releases ADA to researcher after the dispute window
   any unproven → request refund on Masumi before unlockTime
```

The link between the two chains is the **report hash** plus an **external reference**: the EVM job stores
`externalRef = keccak256(<Masumi blockchainIdentifier or Sokosumi Task ID>)`, so anyone can match a Cardano job to
its proofs on Base Sepolia.

### Two escrow modes for the EVM contract

- **Standalone mode (API3 demo):** the hirer locks aUSD in `CitationEscrow`; `release`/`refund` move the aUSD. This is
  what the API3 judges test, because the signed data must decide where money goes.
- **Cardano-paid mode:** the job is created with `amount = 0`. `CitationEscrow` then only acts as the public proof
  record, and the Masumi escrow moves the ADA. The hirer agent bases its refund decision on `isFullyProven`.

### Trust gap to say openly in the pitch

Masumi's escrow releases on a timer unless the buyer requests a refund; it cannot check Airnode signatures. In
Cardano-paid mode the hirer agent could request a refund unfairly, and a disputed refund goes to Masumi's team. The
EVM proof record makes such a dispute easy to settle, but it is not enforced on Cardano. Option A (below) removes the
gap.

## What each side needs from the other

### Cardano side needs from the API3 side

- `CitationEscrow` address on Base Sepolia (goes in the README once deployed).
- A read call: `isFullyProven(uint256 jobId) returns (bool)`, and `doisOf(jobId)` / `jobs(jobId)` for details.
- Events to show in the dashboard: `SourceProven(jobId, index, doi, title)`, `Released`, `Refunded`.
- A TypeScript helper to fetch a signed response for a DOI (exists: `fetchSignedWork` in `api3evm/src/openalex.ts`).

Reading from Node (viem, no wallet needed):

```ts
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const abi = parseAbi(['function isFullyProven(uint256 jobId) view returns (bool)']);
const ok = await client.readContract({ address: CITATION_ESCROW, abi, functionName: 'isFullyProven', args: [jobId] });
```

### API3 side needs from the Cardano side

- The Masumi/Sokosumi job identifier, to put into `externalRef`.
- The exact report text (or its hash) that the research agent submits to Masumi, so the same hash goes into `deliver`.
- The Cardano preprod transaction hashes for the README and the dashboard's on-chain activity table.

### Shared data format: a signed source proof

Every component passes proofs around in the format that `pnpm fetch-work` prints and saves:

```json
{
  "airnode": "0xc5E9B3263ac154d7694Db5F3894997DaaB4F464c",
  "requestHash": "0x470e1257...",
  "timestamp": "1793358351",
  "data": "{\"doi\":\"https://doi.org/10.1038/nature14539\",\"is_retracted\":false,\"title\":\"Deep learning\"}",
  "signature": "0x74f8..."
}
```

Rules: never re-serialise `data` (send it as the exact bytes, `toHex(data)`); never trust the `airnode` field, always
compare with the hard-coded signer; request DOIs as `doi:<lowercase doi>`.

## Cardano milestones, in order

1. **Qualify first (paid x402 request).** Start from the Cardano x402-express template
   (https://developers.cardano.org/x402/). Add one route, `GET /verify?doi=10.xxxx/yyyy`, priced at about 1 ADA
   (Cardano's minimum UTxO makes smaller payments impractical). The route calls `fetchSignedWork` (paying aUSD on Base
   Sepolia), runs the off-chain pre-check, and returns the signed proof JSON above. One paid call on preprod and its
   transaction hash already qualifies for the Cardano track. This is "citation verification as a paid service" for any
   agent.
   **Done** (`cardano/src/verify/`, `npm run verify-server` + `npm run pay-verify -- <doi>`): two paid calls on preprod,
   the agent signing server-side — valid `10.1038/nature14539`
   ([`48eaf21b…`](https://preprod.cardanoscan.io/transaction/48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5))
   and retracted `10.1038/nature00870`
   ([`af8f5f3c…`](https://preprod.cardanoscan.io/transaction/af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919)).
   It uses `fetchSignedWork` / `verifySignedResponse` from `api3evm/`; without `PAYER_PRIVATE_KEY` it replays the
   signed fixtures instead of paying aUSD.
2. **Masumi research agent.** Follow https://github.com/masumi-network/tum-hackathon-quickstart (Node 24, Sokosumi CLI
   1.0.4). Put the research instructions in `agent/instructions.md`: given a topic and N, write a summary citing at
   least N DOIs, and return the report plus the DOI list. First run one unpaid Task, then enable
   `PAID_TASKS_ENABLED=true` and complete one paid Task. Save the Task ID and payment tx hash.
   **Code done, registration done, first Task blocked (2026-10-30):** `cardano/research-agent/` + `cardano/src/research/`;
   Vendor `Citation Escrow`, Coworker `01a18d05-9815-71fd-8eb2-621999aac09c` registered on preprod with its runtime key.
   The TUM Workspace access request is `PENDING` (a Workspace admin must approve it) and the preprod personal-workspace
   route answers 404, so no Task could be created yet. No model-provider key is configured either: the worker runs
   with `RESEARCH_MODE=fixture` (saved report, real signed proofs) until one is set. Paid Tasks also need a Masumi
   Payment Service (not set up; no Docker on this machine, Postgres is available).
3. **Hook the proofs in.** After the agent writes the report, call the API3 side's scripts (or the `/verify` endpoint)
   to prove each DOI on `CitationEscrow`, then submit the result to Masumi with the EVM `jobId` in it.
   **Done** (`cardano/src/research/agent.ts`, `cardano/src/evm/citation-escrow.ts`): per DOI → free OpenAlex
   pre-check → signed proof (fixture / live aUSD / paid x402) → `createJob(amount 0)` + `deliver` + `proveSource`
   once `CITATION_ESCROW_ADDRESS` and `RESEARCHER_EVM_PRIVATE_KEY` are set; the Masumi result carries the report
   hash, external ref, every proof and the EVM job id. Needs from the API3 side: the deployed address, the
   `externalRef` parameter on `createJob` (the ABI in `citation-escrow.ts` is the current one), and a funded
   researcher key on Base Sepolia.
4. **Hirer agent.** Before Masumi's `unlockTime`, read `isFullyProven(jobId)`; if false, request a refund.
   **Done** (`cardano/src/cli/hirer.ts`): creates the Task, waits, re-checks every Airnode signature itself (catches
   the tampered-proof demo), reads `isFullyProven` when deployed, then pays (no action) or requests the refund.
   **Refund path done and proven on preprod** (`cardano/`, no Masumi Payment Service needed): the hirer signs
   `SetRefundRequested` itself (`npm run escrow -- request <lockTxHash>`). Once a result is submitted this moves the
   escrow to `Disputed`; the honest seller accepts (`authorize`) and the hirer withdraws (`withdraw`) — three tx
   hashes in ~3 min. A silent seller leaves it to Masumi's admin keys after `externalDisputeUnlockTime`. Proven tx
   hashes: [`cardano/README.md`](../cardano/README.md).
   **Hirer loop done** (`cardano/src/hirer/`, `npm run hire`): hire via x402 escrow lock (signed server-side) → watch
   for the result hash → check the delivered report against it → verdict → refund or let it pay out, streamed as
   tagged events for the dashboard. Proven end to end in 2.5 min. The verdict source is pluggable; still to add:
   read `isFullyProven(jobId)` from `CitationEscrow` once it is deployed (send us the address).

   **Masumi-native path prepared:** `cardano/research-agent/setup-masumi-agent.sh` turns the CF Masumi x402 agent demo
   into our seller, so `npm run hire -- --verdict proofs` can lock ADA, get a citation-proven report, check the
   signatures and pay or refund, all on preprod with no Sokosumi dependency. Waiting on a funded seller mnemonic.
5. **Dashboard.** Done: the root Next.js app runs the research agent and the hirer as child processes of `cardano/`
   (`src/lib/agent/workflows/citation-escrow.ts`), streams their reasoning into the terminal, lists every Cardano
   transaction in the proof table and confirms it through Blockfrost; the balance card reads the Masumi escrow address
   live. With the demo fallback on it replays the real preprod hashes from `src/config/cardano-proofs.ts`.

## API3 milestones, in order

1. Done: OpenAlex request builder, paid fetch, two signed fixtures (one clean, one retracted).
2. `CitationEscrow.sol` (steps 1–6) plus tests, including the four tamper cases.
3. Add `externalRef` to `createJob`/`JobCreated`, allow `amount = 0`, add `isFullyProven(jobId)`.
4. Deploy to Base Sepolia; put the address in the README.
5. Judge script: `pnpm submit-source --file response.json --job <id> --index <i>`.
6. Agent loop for the bonus: schedule, per-cycle and per-day aUSD caps (the faucet gives 10 aUSD per account, ever),
   retries with backoff, response cache.

## Stretch: Option A (Cardano escrow that checks signatures itself)

Plutus V3 has `keccak_256` and `verifyEcdsaSecp256k1Signature`, so an Aiken validator could verify an Airnode
signature directly (no `ecrecover`: store the Airnode's public key and add the EIP-191 prefix by hand). Test this
against the starter's Nodary fixture first. If it works, a Cardano x402 payment can lock ADA in that validator instead
of Masumi's escrow, and the trust gap above disappears. Only try this after both qualifying milestones are done.

## Ground rules for both sides

- Never commit `.env`, keys or seed phrases. Before each commit: `git status --short | grep -i env` (only
  `.env.example` may appear). Never paste keys in chat.
- Each side uses its own fresh test wallets.
- Commit small and often, with clear messages (the hackathon judges look at commit history).
- Shared upstream quotas: cache OpenAlex responses and never poll in a tight loop.
- Still to check: the Cardano track's judging criteria and the submission deadline on
  https://hackathon.tum-blockchain.com/prizes (expand the Cardano and "How to submit" sections).
