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

## Proven on preprod (2026-10-30)

| Step | Transaction |
| --- | --- |
| x402 payment, 2 tADA | [`89f34549…`](https://preprod.cardanoscan.io/transaction/89f34549e6b96ae4d35325d65727d8d09f781e7168b88e22cfbc6e4bebf99863) |
| Refund path — job lock | [`b69d62f7…`](https://preprod.cardanoscan.io/transaction/b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef) |
| Refund request (→ Disputed) | [`f19d7cdd…`](https://preprod.cardanoscan.io/transaction/f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0) |
| Seller authorizes refund | [`de100c97…`](https://preprod.cardanoscan.io/transaction/de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860) |
| Hirer withdraws refund | [`6125026f…`](https://preprod.cardanoscan.io/transaction/6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e) |

## Files

- `src/escrow.ts` — escrow address, validator script, slot-time rules, escrow tracking.
- `src/refund.ts` — refund request, refund authorization, refund withdrawal.
- `src/cli/escrow.ts` — the command line above.
- `contracts/payment-v2.plutus.json` — Masumi's validator, vendored unmodified (MIT, see `NOTICE.md`).

Escrow rules follow Masumi's validator `vested_pay.ak` (cited as `ak:N` in the code).
