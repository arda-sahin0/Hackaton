import type { NetworkId } from "@/config/chains";
import { Api3EvmAdapter } from "./api3-evm";
import { BsvAdapter } from "./bsv";
import { CardanoAdapter } from "./cardano";
import type { AdapterOptions, BlockchainAdapter } from "./types";

export * from "./types";
export { NotWiredError, withDemoFallback } from "./fallback";

/** Adapter registry — the only switch on `network` in the whole codebase. */
export function getAdapter(network: NetworkId, opts: AdapterOptions): BlockchainAdapter {
  switch (network) {
    case "cardano-preprod":
      return new CardanoAdapter(opts);
    case "bsv-testnet":
      return new BsvAdapter(opts);
    case "evm-sepolia":
      return new Api3EvmAdapter(opts);
  }
}
