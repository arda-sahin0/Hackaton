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

## Proven on preprod (2026-10-30)

| Step | Transaction |
| --- | --- |
| x402 payment, 2 tADA | [`89f34549…`](https://preprod.cardanoscan.io/transaction/89f34549e6b96ae4d35325d65727d8d09f781e7168b88e22cfbc6e4bebf99863) |
| `/verify` paid, 1 tADA — `10.1038/nature14539` → valid | [`48eaf21b…`](https://preprod.cardanoscan.io/transaction/48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5) |
| `/verify` paid, 1 tADA — `10.1038/nature00870` → retracted | [`af8f5f3c…`](https://preprod.cardanoscan.io/transaction/af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919) |
| Refund path — job lock | [`b69d62f7…`](https://preprod.cardanoscan.io/transaction/b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef) |
| Refund request (→ Disputed) | [`f19d7cdd…`](https://preprod.cardanoscan.io/transaction/f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0) |
| Seller authorizes refund | [`de100c97…`](https://preprod.cardanoscan.io/transaction/de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860) |
| Hirer withdraws refund | [`6125026f…`](https://preprod.cardanoscan.io/transaction/6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e) |

## Files

- `src/escrow.ts` — escrow address, validator script, slot-time rules, escrow tracking.
- `src/refund.ts` — refund request, refund authorization, refund withdrawal.
- `src/cli/escrow.ts` — the escrow command line above.
- `src/verify/server.ts`, `src/verify/proof.ts` — the paid citation verifier.
- `src/cli/pay-verify.ts` — an agent paying the verifier, signing server-side.
- `contracts/payment-v2.plutus.json` — Masumi's validator, vendored unmodified (MIT, see `NOTICE.md`).

Escrow rules follow Masumi's validator `vested_pay.ak` (cited as `ak:N` in the code).
