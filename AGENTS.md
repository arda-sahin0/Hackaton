# AI Agent Directives & Hackathon Architecture Guide (`AGENTS.md` / `README.md`)

> **CRITICAL DIRECTIVE FOR AI CODING ASSISTANTS (Claude Code / Cursor / Windsurf / Copilot):**
> Read this entire document before generating, refactoring, or modifying any code in this repository. Every architectural decision, UI component, and integration MUST strictly optimize for **1st Place at the TUM Blockchain & AI Hackathon (30-hour sprint)**.

## 1. Hackathon Context & Core Mission

- **Event:** TUM Blockchain & AI Hackathon 2026 (Munich)
- **Sprint Duration:** 30 Hours (Friday 09:00 – Saturday 15:00 CET)
- **Primary Theme:** **Agentic Payments** — Developing infrastructure and applications that allow autonomous AI agents to transact, verify data, and execute payments safely on-chain.
- **Judging Format:** Science-fair / Booth-style live demos directly in front of sponsor engineers and judges.
- **Winning Condition:** A visually striking B2B-grade Web App Dashboard demonstrating a **100% real, verifiable on-chain transaction (TxHash)** triggered by an autonomous AI workflow, integrating multiple sponsor technologies ("Double/Triple Dip" strategy).

## 2. Compliance & Pre-Hackathon Boundary Rules (STRICT)

To maintain 100% compliance with public repository commit history rules:

### A. Pre-Hackathon Phase (Allowed Before Friday 09:30 CET)

- **ONLY Generic Boilerplate & Infrastructure:** Build and refine generic AI agent routing, LLM orchestration pipelines, generic Web3 wallet adapter wrappers, and empty UI dashboard shells.
- **NO Hackathon-Specific Business Logic:** Do NOT hardcode specific sponsor use-cases, custom smart contracts for the final pitch, or domain-specific branding before the official kickoff.
- **Modular Plug-and-Play Design:** Structure all AI workflows and blockchain connectors using clean interfaces/adapters so sponsor SDKs (Cardano, BSV, API3) can be wired in within 15 minutes after kickoff.

### B. Hackathon Sprint Phase (After Friday 09:30 CET)

- Initialize the official public hackathon repository after kickoff with the initial commit message:
  `Initial commit: Base AI agent orchestration & Web3 dashboard boilerplate`
- Commit frequently (20–30+ incremental commits across Friday and Saturday) showing clear development of smart contracts, sponsor SDK integrations, and use-case workflows.
- Always maintain the **"Prior Work & Transparency"** section at the bottom of the public `README.md`.

## 3. Sponsor Tech Stack & Integration Strategy

Whenever implementing blockchain interactions, prioritize these three official sponsors to maximize prize eligibility (€12,000+ cash pool + €16,000 audit credits):

| Sponsor / Track | Prize Pool | Technical Integration Directives for AI Assistant |
| :--- | :--- | :--- |
| **Cardano** | €6,000 | **Non-EVM Layer-1.** Use TypeScript/JavaScript SDKs (**MeshJS** `@meshsdk/core` or **Lucid**) for rapid wallet connection (Nami, Eternl, Lace) and agentic transaction building on Cardano Testnet (Preprod/Preview). |
| **BSV Association** | €4,000 | **High-Throughput Micropayments.** Ideal for pay-per-API-call, pay-per-token, or high-frequency machine-to-machine (M2M) data streams where an AI agent pays fractions of a cent per action. |
| **API3** | €2,000 | **Decentralized Oracles & dAPIs (EVM).** Use API3 Data Feeds (`@api3/contracts`) to fetch verifiable real-world data (prices, IoT/sensor metrics, external APIs) on-chain before an AI agent executes a decision. |
| **EVM / Scaffold-ETH 2** | General / API3 | When targeting EVM chains (for API3 or cross-chain settlement), use **Scaffold-ETH 2** (`wagmi`, `viem`, `RainbowKit`) on Testnets (Arbitrum Sepolia, Base Sepolia, or Ethereum Sepolia). |

## 4. UI / UX Architecture Rules (Web App Dashboard Only)

- **NO Mobile Apps:** Build exclusively as a responsive **Next.js (App Router) + TypeScript + Tailwind CSS + `shadcn/ui`** Web Application.
- **NO Marketing Landing Pages:** Do NOT waste time building "About Us", "Pricing", or "Login/Signup" pages. The root URL (`/`) must open **directly into the live Command Center / App Dashboard**.
- **B2B SaaS Aesthetic:** Use a clean, high-contrast Dark Mode aesthetic (`shadcn/ui` cards, badges, tables, and toast notifications).
- **Mandatory Dashboard Layout (4-Step Proof of Work):**
  1. **Top Navigation Bar:** Project title, active network indicator badge (e.g., `Cardano Preprod` / `API3 Oracle Active` / `BSV Testnet`), and live **Connect Wallet** button.
  2. **Left/Center Panel (Core Action & State):** 2–3 real-time metric cards (balances, oracle feed values, agent status) + the primary trigger interface for the **Happy Path**.
  3. **Right Panel (Live AI Agent Terminal):** A real-time streaming log viewer showing the AI agent's reasoning steps, oracle queries, and cryptographic signing events (`[AGENT] Verifying API3 feed... -> [SIGNING] Broadcasting transaction...`).
  4. **Bottom Panel (On-Chain Proof Table):** A "Recent On-Chain Activity" table displaying every executed action with a **clickable `View on Explorer` link (`TxHash`)** pointing directly to the official Testnet Block Explorer (Cardanoscan, WhatsOnChain, Etherscan/Blockscout) and live status transition (`Pending` -> `Verified On-Chain`).

## 5. Development Speed & "Happy Path" Execution Rules

1. **Zero Scope Creep:** Only code what is visible and required for the 3-minute live demo (**The Happy Path**). Mock or hardcode secondary settings, user profiles, or non-essential CRUD operations.
2. **Real On-Chain Execution is Non-Negotiable:** While peripheral UI elements can be mocked, the **core transaction** (AI agent decision -> wallet/private-key signature -> smart contract / on-chain transfer -> real `TxHash` returned) **MUST work 100% live on Testnet**.
3. **Resilient Fallback Mode (Demo Safety):** Always implement an environment flag (`NEXT_PUBLIC_DEMO_FALLBACK=true` or a subtle UI toggle) that gracefully handles sudden conference Wi-Fi drops or Testnet RPC timeouts by replaying a pre-verified recent Testnet transaction hash without crashing the UI during a live pitch.
4. **Instant Deployment Ready:** Ensure zero TypeScript/ESLint build errors (`ignoreBuildErrors: true` in `next.config.js` if necessary during crunch time) so every `git push` deploys cleanly to **Vercel**.

## 6. Project Structure Blueprint

```text
├── src/
│   ├── app/                    # Next.js App Router (Root '/' goes straight to Dashboard)
│   ├── components/
│   │   ├── dashboard/          # Main metric cards, Action Trigger, On-Chain Proof Table
│   │   ├── terminal/           # Live AI Agent reasoning & execution log stream
│   │   ├── wallet/             # Modular Wallet Connect (MeshJS / RainbowKit / BSV)
│   │   └── ui/                 # shadcn/ui pre-built components
│   ├── lib/
│   │   ├── agent/              # Pre-existing AI workflow & LLM orchestration engine
│   │   ├── blockchain/         # Modular adapters: cardano.ts, bsv.ts, api3-evm.ts
│   │   └── explorer.ts         # Helper to generate dynamic Testnet Explorer URLs from TxHash
│   └── config/
│       └── chains.ts           # Testnet RPCs, Contract Addresses, Sponsor Flags
├── contracts/                  # Smart contracts (Solidity / Aiken) & deployment scripts
└── README.md                   # Public Hackathon Submission Documentation
```

## 7. Transparency & Prior Work Disclosure (Keep in Public Submission README)

> **Prior Work & Boilerplate Disclosure:**
> We utilized our pre-existing custom AI orchestration boilerplate for base agent routing and generic UI shell structure. All blockchain integrations (Cardano / BSV / API3), smart contract logic, agentic payment workflows, and the live command-center dashboard were built entirely from scratch during the 30-hour TUM Blockchain & AI Hackathon.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
