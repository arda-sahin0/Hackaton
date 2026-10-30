# contracts/

Smart contracts and deployment scripts live here **from kickoff on** (directive §2A forbids
pitch-specific contracts before Friday 09:30 CET). Suggested layout:

```text
contracts/
  evm/            # Solidity (Foundry or Hardhat) — API3 dAPI consumer + settlement
  cardano/        # Aiken validators + deployment notes (Preprod)
  deploy/         # scripts that write addresses into src/config/chains.ts `contracts`
```

Every deployed address goes into `src/config/chains.ts` (`contracts` map) — never hardcode it
inside a component.
