# Smart Procurement — autonomous tenders on Cardano

> Working title. AI agents run a transparent tender end to end: publish the requirement, collect supplier
> bids, evaluate them, award the contract, and settle payment through an on-chain escrow on Cardano preprod.

Built at the TUM Blockchain & AI Hackathon 2026 (theme: Agentic Payments).

## Run the command center

```bash
npm install
cp .env.example .env.local            # BLOCKFROST_PROJECT_ID for live reads; demo fallback ON by default
(cd cardano && npm install && cp .env.example .env)
npm run dev                           # http://localhost:3000 opens straight into the dashboard
```

`npm run typecheck && npm run lint && npm run build` should stay clean (Vercel-ready).

## Layout

```text
src/                      Next.js command center: dashboard, live agent terminal (SSE), on-chain proof table
  lib/agent/              agent orchestration (workflow steps, LLM client, event stream)
  lib/blockchain/         network adapters (Cardano via Blockfrost, BSV, API3/EVM) with demo fallback
cardano/                  Masumi V2 escrow on preprod: lock payment, track, pay out or refund (server-side signing)
api3evm/                  API3 AirnodeHub starter: verify signed Airnode data on-chain (Foundry)
```

## Earlier idea

The team's first idea (Citation Escrow: agents paying for research only when every cited source is proven) is
kept in git history at tag `citation-escrow-final`. The Masumi escrow and x402 code in `cardano/` carries over.

## Secrets

Real keys live only in gitignored `.env` files (`.env.local`, `cardano/.env`, `api3evm/.env`) or the hosting
provider's env settings. `.env.example` documents every variable. Fresh preprod test wallets only.

---

> **Prior Work & Boilerplate Disclosure:**
> We utilized our pre-existing custom AI orchestration boilerplate for base agent routing and generic UI shell structure. All blockchain integrations (Cardano / BSV / API3), smart contract logic, agentic payment workflows, and the live command-center dashboard were built entirely from scratch during the 30-hour TUM Blockchain & AI Hackathon.
