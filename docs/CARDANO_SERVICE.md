# Cardano side — what exists and how the dashboard uses it

For the frontend and the API3 side. Status as of Fri 30 Oct, ~15:30 CET. Everything below runs on
**Cardano preprod**, and every transaction hash listed here is real and on chain. Package:
[`cardano/`](../cardano/README.md); the overall plan stays in [`INTEGRATION.md`](INTEGRATION.md).

## What the Cardano side does

| Piece | What it does | Status |
| --- | --- | --- |
| **Hirer agent** (`cardano/src/hirer/`) | Hires the research agent, pays by locking the price in Masumi escrow (signed server-side, no browser wallet), waits for the result hash on chain, checks the delivered report against it, decides, then lets the payment go to the agent or requests + withdraws a refund | Done, proven end to end in 2.5 min |
| **Citation verifier** (`cardano/src/verify/`) | `GET /verify?doi=` paid per call over Cardano x402 (1 tADA); returns the OpenAlex record signed by API3's Airnode, checked off-chain with `api3evm/` code; verdict `valid` / `retracted` | Done, 2 paid calls on preprod — qualifies for the Cardano track |
| **Escrow tools** (`cardano/src/escrow.ts`, `refund.ts`) | Follow a Masumi job from its lock tx; refund request, refund authorization, refund withdrawal | Done |
| **Service for the dashboard** (`cardano/src/service/`) | Runs the hirer and streams every step to the dashboard in its existing event format | Done, this document |
| Research agent (`cardano/src/research/`, Efe) | Writes the report and proves every cited DOI; `setup-masumi-agent.sh` makes it hireable on Masumi | In progress (Efe) |
| Dashboard workflow (`src/lib/agent/workflows/citation-escrow.ts`, Efe) | Runs the research agent and hirer as child processes of `cardano/` and streams them into the terminal | Done (Efe) |
| `CitationEscrow.isFullyProven` | Hirer reads the API3 side's proof record on Base Sepolia | Waiting for the deployed address |

## For the frontend: two ways to drive the Cardano side

1. **Child processes (what the dashboard does today, Efe's `citation-escrow.ts`):** the Next.js route
   spawns the `cardano/` scripts and forwards their `[LEVEL] message` lines. Simplest when the
   dashboard and `cardano/` run on the same machine with `npm run dev`.
2. **This service:** use it when the dashboard is **deployed on Vercel** (a live run lasts 2–5 min,
   longer than a serverless function may run, and the wallet keys must not go to Vercel), or when the
   Cardano side runs on another laptop. The browser talks to the service directly.

Both emit the same levels and explorer links, so the terminal and proof table don't change.

### Plugging in the service

The service speaks **the same protocol as the boilerplate's `/api/agent/run`**
(`src/app/api/agent/run/route.ts` + `src/hooks/use-agent-stream.ts`). The existing terminal and
proof table can be reused; only the URL and the request body change.

### Endpoints (default `http://localhost:4040`)

| Method | Path | Use |
| --- | --- | --- |
| `POST` | `/runs` | Start a run; the response **is** the event stream (Server-Sent Events) |
| `GET` | `/runs` | All runs of this process, newest first — feed for the "Recent On-Chain Activity" table |
| `GET` | `/runs/:runId` | One run with all its events — reconnect after a page reload |
| `GET` | `/health` | Config check (`busy: true` while a live run is in progress) |

### `POST /runs` request

```json
{ "task": "Literature review on …", "verdict": "fail", "sellerAccepts": true, "demoFallback": false }
```

| Field | Values | Default |
| --- | --- | --- |
| `task` | the job text for the research agent (≤ 500 chars) | a default literature-review task |
| `verdict` | `"citations"` (pay `/verify` for every DOI in the report), `"pass"`, `"fail"` | `"citations"` |
| `sellerAccepts` | demo: the service also plays the honest seller and accepts the refund, so the full refund path finishes in one run | `false` |
| `demoFallback` | `true` = replay a recorded run with real tx hashes, no network needed | `false` |

**For the live demo use `verdict: "pass"` (honest agent paid) and `verdict: "fail"` +
`sellerAccepts: true` (rejected agent refunded).** The demo agent's report has no DOIs, so
`"citations"` would fail every run until the real research agent exists.

Only one **live** run at a time (`409` while busy). If a live run fails **before** any money is
locked (Wi-Fi, Blockfrost, facilitator), the service automatically replays the recorded run and
says so in the log; once money is locked it never replays, it reports the error.

### The stream

Exactly like `/api/agent/run`:

```text
event: start
data: {"runId":"cardano-mvv2j87z-ba78","input":{"network":"cardano-preprod","task":"…","verdict":"fail","sellerAccepts":true,"demoFallback":false}}

data: {"id":"cardano-mvv2j87z-ba78-4","seq":4,"ts":"2026-10-30T14:29:33.858Z","level":"CHAIN","message":"Escrow locked — job 475edd66-…","data":{"network":"cardano-preprod","simulated":false,"txHash":"eabaa071…","explorerUrl":"https://preprod.cardanoscan.io/transaction/eabaa071…"}}

: ping

event: result
data: {"runId":"…","ok":true,"status":"done","outcome":"refunded","durationMs":151000,"verdict":"fail","simulated":false,"jobId":"…","lockTx":"…","txs":[{"step":"escrow lock","txHash":"…","explorerUrl":"…","network":"cardano-preprod","status":"verified","simulated":false}, …]}
```

- Each `data:` line is an `AgentEvent` (`src/lib/agent/types.ts`): `level` is one of `AGENT`,
  `TOOL`, `ORACLE`, `SIGNING`, `CHAIN`, `VERIFIED`, `ERROR`, `DONE`.
- Events with a transaction carry `data.txHash` and `data.explorerUrl` (Cardanoscan): show them as
  links in the terminal and add a row to the proof table as they arrive (status `Verified On-Chain`
  — the service only reports a tx after it is confirmed).
- `: ping` comment lines every 15 s keep tunnels open; the existing hook ignores them.
- `result.outcome`: `paid-out`, `refunded`, `refund-requested` (seller did not accept yet) or `failed`.
- `simulated: true` marks replayed runs (demo fallback) — show a small "replay" badge.

### Minimal change to the existing hook

In `src/hooks/use-agent-stream.ts` the run call becomes:

```ts
const CARDANO_SERVICE_URL = process.env.NEXT_PUBLIC_CARDANO_SERVICE_URL ?? "http://localhost:4040";
const response = await fetch(`${CARDANO_SERVICE_URL}/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ task, verdict, sellerAccepts, demoFallback }),
  signal: controller.signal,
});
```

The frame parser (`start` / `result` / default event) works unchanged. On `result`, use
`payload.txs` for the proof table instead of `payload.receipt`.

A run takes **2–5 minutes live** (block confirmations; ~16 s in replay). It keeps running if the
browser disconnects; reload with `GET /runs/:runId`.

### Why a separate service and not a Next.js API route

A live run lasts minutes and Vercel cuts serverless functions off long before; the Cardano
libraries and the wallet keys stay out of the web app. On Vercel, set
`NEXT_PUBLIC_CARDANO_SERVICE_URL` to a public tunnel URL of the service (see below).

## Running it

Node 22.18+. Four processes during the demo (until the real research agent replaces the demo one):

| # | What | Command | Port |
| --- | --- | --- | --- |
| 1 | Research agent (demo, Masumi-registered) + its tunnel | `sandbox/x402-cardano-demo/masumi`: `npm run agent` + `cloudflared tunnel --url http://localhost:8787` | 8787 |
| 2 | Citation verifier (only for `verdict: "citations"`) | `cd cardano && npm run verify-server` | 4030 |
| 3 | Cardano hirer service | `cd cardano && npm run service` | 4040 |
| 4 | Dashboard | `npm run dev` | 3000 |

One-time setup: `cd cardano && npm install && cp .env.example .env`, fill in
`BLOCKFROST_PROJECT_ID`, `BUYER_MNEMONIC`, `SELLER_MNEMONIC`, `VERIFY_PAY_TO`, `AGENT_OFFER_URL`;
and `cd api3evm && npx pnpm@11.5.2 install` (the verifier uses its code). Fresh preprod test wallets
only; `.env` is gitignored.

For a dashboard on Vercel, expose the service: `cloudflared tunnel --url http://localhost:4040`,
put that URL in `NEXT_PUBLIC_CARDANO_SERVICE_URL`, and set `CORS_ORIGINS` in `cardano/.env` to the
dashboard's origin. The service spends test funds on every live run, so don't share the URL widely.

## Proven on preprod

| What | Transaction |
| --- | --- |
| First x402 payment, 2 tADA | [`89f34549…`](https://preprod.cardanoscan.io/transaction/89f34549e6b96ae4d35325d65727d8d09f781e7168b88e22cfbc6e4bebf99863) |
| `/verify` paid — "Deep learning" → valid | [`48eaf21b…`](https://preprod.cardanoscan.io/transaction/48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5) |
| `/verify` paid — retracted stem-cell paper → retracted | [`af8f5f3c…`](https://preprod.cardanoscan.io/transaction/af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919) |
| Hirer run: escrow lock (signed server-side) | [`eabaa071…`](https://preprod.cardanoscan.io/transaction/eabaa0710080fbe650776fcf3934f46a3d224d72a496d21c59be32b62c25226d) |
| Hirer run: agent submits result hash | [`9635c837…`](https://preprod.cardanoscan.io/transaction/9635c837f8a463d7c125ea9b410afbcd5b89bc06b749350dea1b1ba6cdedd0ce) |
| Hirer run: refund request (→ Disputed) | [`588dc258…`](https://preprod.cardanoscan.io/transaction/588dc2583f782b5da2dcc8fc5867f2296b3878f1fa3f5551664c40c8a243c62f) |
| Hirer run: seller authorizes refund | [`eb8d7f89…`](https://preprod.cardanoscan.io/transaction/eb8d7f89bd7cacf7358401be1f608fd0461af2ff90ed0f90af91dc41dce288ef) |
| Hirer run: refund withdrawn | [`a178b8d5…`](https://preprod.cardanoscan.io/transaction/a178b8d5945edfeaccd03eb7a2db85bf8f701b1674f4304576467bd4c1dbf8f1) |
| **Through the service** (`POST /runs` `{"verdict":"fail","sellerAccepts":true}`, live, 131 s): escrow lock | [`ecc10803…`](https://preprod.cardanoscan.io/transaction/ecc10803d02bbdd13c6be8875ee052913e72d9b8ebb114b5181791ee8f107737) |
| … result hash | [`a3df4db3…`](https://preprod.cardanoscan.io/transaction/a3df4db36a2a4c7d84666b15eebf5834adbe6205341208c927ea136edb4c1849) |
| … refund request | [`851e5dca…`](https://preprod.cardanoscan.io/transaction/851e5dcace76b3d4261e0abe2f9d33cd5b515b0fd3ca9a30479eb624880f6da3) |
| … seller authorizes | [`54b86d2b…`](https://preprod.cardanoscan.io/transaction/54b86d2b7fcdc758ee2c4f2b90e525ee52ad34751fef6583e045dd609b9df1ac) |
| … refund withdrawn | [`11b438e9…`](https://preprod.cardanoscan.io/transaction/11b438e93bd559492bfdae714c697f2c621731b37461ee3603efc5834a0237e4) |

The honest payout path (lock → result → seller collects after unlock) was also run end to end this
morning with the demo UI; the collect landed at 13:28 CET.

## Good to know for the pitch

- After a result is on chain, a refund request moves Masumi's escrow to **Disputed**. The honest
  seller accepts it at once; a seller who stays silent leaves it to Masumi's admins after the
  dispute deadline — say "contested refunds go to Masumi arbitration".
- An honest seller is paid only after the job's unlock time (~40 min after hiring with the x402
  defaults): the pass path shows the money safely in escrow, the collect happens later.
- Each escrow action costs ~0.5–0.7 tADA in fees on preprod (the ~10 KB validator rides along in
  every transaction).

## Next on the Cardano side

1. Real research agent: topic in, report with DOIs out (also needed for the Sokosumi Task that
   Masumi's submission checklist asks for).
2. Pass `externalRef` to `CitationEscrow.createJob` and read `isFullyProven(jobId)` as the verdict
   — API3 side: please send the deployed address.
