# Vendored contract

`payment-v2.plutus.json` is Masumi's V2 escrow validator (`vested_pay`), unmodified, from
[`masumi-network/masumi-payment-service`](https://github.com/masumi-network/masumi-payment-service)
`smart-contracts/payment-v2/plutus.json` (commit `69297f308f603bffbdfd4efccb54398eaff1bd87`,
Aiken v1.1.23). Applied with Masumi's preprod parameters it hashes to the escrow address that
`@x402/cardano` derives (`masumiEscrowAddress("cardano:preprod")`).

License of the source repository:

```text
MIT License

Copyright (c) 2024 NMKR

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
