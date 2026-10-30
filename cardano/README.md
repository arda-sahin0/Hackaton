# Cardano side — Masumi escrow (preprod)

Reusable building blocks for paying an agent through Masumi's V2 escrow on Cardano preprod, signed
server-side (no browser wallet):

| File | What it does |
| --- | --- |
| `src/escrow.ts` | Masumi escrow constants, validator script, slot-time rules; follow a job from its lock tx |
| `src/refund.ts` | Refund path: request (buyer) → authorize (seller) → withdraw (buyer) |
| `src/x402-client.ts` | A `fetch` that answers HTTP 402 by paying from a seed phrase, capped per payment |
| `src/hirer/hirer.ts` | Buyer loop: lock payment via the seller's x402 offer → watch for the result hash → decide → pay out or refund |
| `src/hirer/verdict.ts` | Pluggable pass/fail decision (plug the use case's acceptance check in here) |

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
npm run escrow -- request   <lockTxHash> [reason]   # buyer: refund request (ResultSubmitted -> Disputed)
npm run escrow -- authorize <lockTxHash>            # seller: accept the refund (-> RefundAuthorized)
npm run escrow -- withdraw  <lockTxHash>            # buyer: take the money back (escrow closed)

npm run hire -- --task "text" [--verdict pass|fail] [--seller-accepts]   # one job end to end
```

A refund request must land before the job's `unlockTime`; after that the seller can collect.
After a result is submitted, a refund request puts the escrow into `Disputed`. The honest seller
accepts (`authorize`); a seller who stays silent leaves it to Masumi's admin keys after
`externalDisputeUnlockTime`.

The full refund path was proven on preprod on 2026-10-30: lock
[`b69d62f7…`](https://preprod.cardanoscan.io/transaction/b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef),
request [`f19d7cdd…`](https://preprod.cardanoscan.io/transaction/f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0),
authorize [`de100c97…`](https://preprod.cardanoscan.io/transaction/de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860),
withdraw [`6125026f…`](https://preprod.cardanoscan.io/transaction/6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e).

`contracts/payment-v2.plutus.json` is Masumi's compiled validator (see `contracts/NOTICE.md`).
