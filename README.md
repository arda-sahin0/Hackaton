# Citation Escrow — agentic research payments that only settle on proven sources

A **hirer agent** pays a **research agent** for a literature summary. Every DOI the report cites must be proven real
and not retracted with OpenAlex data **signed by the API3 Airnode**; a smart contract checks the signatures, not the
agents. Proven → the researcher is paid; otherwise → the hirer is refunded. Cardano (Masumi escrow + x402 micropayments)
moves the money, Base Sepolia (`CitationEscrow.sol`, API3 AirnodeHub) holds the public proof record.

Built at the TUM Blockchain & AI Hackathon 2026 (theme: Agentic Payments). Design and ownership split:
[`docs/INTEGRATION.md`](docs/INTEGRATION.md). Cardano side: [`cardano/README.md`](cardano/README.md). API3 side: `api3evm/`.

## Run the command center

```bash
npm install
cp .env.example .env.local            # BLOCKFROST_PROJECT_ID for live reads; demo fallback ON by default
(cd cardano && npm install && cp .env.example .env)
(cd api3evm && npx pnpm@11.5.2 install)
npm run dev                           # http://localhost:3000 opens straight into the dashboard
```

Pick the seller (honest, or a cheating twin that cites a retracted paper / forges a signed proof) and press
**Hire & Verify**. The terminal streams the research agent proving each DOI, the hirer re-checking every Airnode
signature itself, and the settlement; the proof table lists each Cardano transaction with its Cardanoscan link and
confirms it through Blockfrost. Demo fallback replays the team's real preprod transactions
(`src/config/cardano-proofs.ts`) so a dead conference Wi-Fi never breaks the pitch.

`npm run typecheck && npm run lint && npm run build` are clean (Vercel-ready).

## Proven on Cardano preprod

| What | Transaction |
| --- | --- |
| Paid `GET /verify?doi=…` over Cardano x402 (1 tADA), valid DOI | [`48eaf21b…`](https://preprod.cardanoscan.io/transaction/48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5) |
| Paid `/verify`, retracted DOI | [`af8f5f3c…`](https://preprod.cardanoscan.io/transaction/af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919) |
| Masumi escrow lock → refund request → seller authorizes → hirer withdraws | [`b69d62f7…`](https://preprod.cardanoscan.io/transaction/b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef) · [`f19d7cdd…`](https://preprod.cardanoscan.io/transaction/f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0) · [`de100c97…`](https://preprod.cardanoscan.io/transaction/de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860) · [`6125026f…`](https://preprod.cardanoscan.io/transaction/6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e) |

Sokosumi (preprod): Vendor **Citation Escrow**, Coworker **Research Agent (citation-verified)**
`01a18d05-9815-71fd-8eb2-621999aac09c`, TUM Workspace `tum-hackathon-u4ve65`. Task IDs, payment hashes and the
CitationEscrow address are added here as they land.

## Layout

```text
src/                      Next.js command center (dashboard, SSE agent runs, Blockfrost-backed Cardano adapter)
  lib/agent/workflows/citation-escrow.ts   hirer ⇄ research agent happy path, driven as child processes of cardano/
  config/cardano-proofs.ts                 the real preprod hashes the demo fallback replays
cardano/                  Cardano side: x402 citation verifier, Masumi escrow refund path, research & hirer agents
api3evm/                  API3 side: OpenAlex Airnode client, signed fixtures, CitationEscrow.sol (Foundry)
docs/INTEGRATION.md       how the two sides fit, interfaces, status per milestone
```

## Secrets

Real keys live only in gitignored `.env` files (`.env.local`, `cardano/.env`, `api3evm/.env`) or the hosting
provider's env settings. `.env.example` documents every variable. Fresh preprod test wallets only.

---

> **Prior Work & Boilerplate Disclosure:**
> We utilized our pre-existing custom AI orchestration boilerplate for base agent routing and generic UI shell structure. All blockchain integrations (Cardano / BSV / API3), smart contract logic, agentic payment workflows, and the live command-center dashboard were built entirely from scratch during the 30-hour TUM Blockchain & AI Hackathon.
