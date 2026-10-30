# Agent Command Center — boilerplate

A generic, plug-and-play **AI agent + Web3 command center**: an autonomous agent reasons, queries
an oracle, signs and broadcasts a testnet transaction, and the dashboard proves it with a live
explorer link. Built for a 30-hour hackathon sprint; sponsor SDKs are injected at kickoff.

## Quick start

```bash
npm install
cp .env.example .env.local      # defaults: demo fallback ON, mock reasoning
npm run dev                     # http://localhost:3000 opens straight into the dashboard
npm run typecheck && npm run lint && npm run build
```

Press **Trigger Autonomous Agent Action**: the terminal streams `[AGENT] → [TOOL] → [ORACLE] →
[AGENT] → [SIGNING] → [CHAIN] → [VERIFIED]`, the proof table gets a row that flips from
*Pending* to *Verified On-Chain*, and *View on Explorer* opens the testnet explorer.

## Layout

```text
src/
  app/
    page.tsx                     # "/" = the dashboard (no landing, no login)
    api/agent/run/route.ts       # POST -> Server-Sent Events stream of agent steps
    api/state/route.ts           # GET  -> balance + oracle for the metric cards
  components/
    dashboard/                   # top-nav, metric-cards, action-panel, activity-table, command-center
    terminal/agent-terminal.tsx  # auto-scrolling live log
    wallet/connect-wallet-button.tsx
    ui/                          # shadcn/ui
  hooks/use-agent-stream.ts      # SSE client
  lib/
    agent/                       # orchestrator, workflow steps, event bus, LLM layer
    blockchain/                  # BlockchainAdapter + cardano.ts / bsv.ts / api3-evm.ts + fallback
    explorer.ts                  # explorer URL helper
  config/chains.ts               # networks, explorers, env wiring, replay hashes
contracts/                       # Solidity / Aiken from kickoff on
```

## How the pieces fit

- **`BlockchainAdapter`** (`src/lib/blockchain/types.ts`) — `connectWallet`, `getBalance`,
  `readOracle`, `executeAgentTransaction`, `getTransactionStatus`. One implementation per
  network; `getAdapter(network)` is the only switch.
- **Demo fallback** (`src/lib/blockchain/fallback.ts`) — every adapter call runs through
  `withDemoFallback`. With `NEXT_PUBLIC_DEMO_FALLBACK=true` (or the nav toggle) nothing touches
  the network and the pre-verified hash from `.env` is replayed after 2 s. With it off, a
  timeout or RPC error degrades to the same replay instead of crashing the UI.
- **Agent engine** (`src/lib/agent/`) — `runAgentWorkflow` executes the steps in
  `workflows/agentic-payment.ts` and emits `[LEVEL] message` events on an `AgentEventBus`;
  the SSE route forwards them to the browser. The LLM layer uses the Anthropic SDK when
  `ANTHROPIC_API_KEY` is set (10 s timeout, no retries) and a deterministic mock otherwise;
  with the demo fallback on it never calls the network at all.

## Kickoff checklist (≈15 min per chain)

1. Pick the primary network; set `NEXT_PUBLIC_DEFAULT_NETWORK`.
2. Open the matching adapter — each file header holds the exact `npm install` + code to inject.
3. Broadcast one real testnet tx yourself and put its hash in `NEXT_PUBLIC_FALLBACK_TX_*`.
4. Deploy contracts under `contracts/`, write addresses into `src/config/chains.ts`.
5. Flip `NEXT_PUBLIC_DEMO_FALLBACK=false` for the live run; keep the nav toggle as the panic
   switch during the pitch.

## Secrets

Real keys live only in `.env.local` (gitignored) or the hosting provider's env settings.
`.env.example` documents every variable with a placeholder.

---

> **Prior Work & Boilerplate Disclosure:**
> We utilized our pre-existing custom AI orchestration boilerplate for base agent routing and generic UI shell structure. All blockchain integrations (Cardano / BSV / API3), smart contract logic, agentic payment workflows, and the live command-center dashboard were built entirely from scratch during the 30-hour TUM Blockchain & AI Hackathon.
