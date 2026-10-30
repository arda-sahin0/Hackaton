import { getNetwork, type NetworkId } from "@/config/chains";

/** Official testnet explorer URL for a transaction hash (Cardanoscan / WhatsOnChain / Etherscan). */
export function explorerTxUrl(network: NetworkId, txHash: string): string {
  return `${getNetwork(network).explorer.txBase}${txHash}`;
}

/** Official testnet explorer URL for an address. */
export function explorerAddressUrl(network: NetworkId, address: string): string {
  return `${getNetwork(network).explorer.addressBase}${address}`;
}

/** Explorer display name, e.g. "Cardanoscan". */
export function explorerName(network: NetworkId): string {
  return getNetwork(network).explorer.name;
}

/** `0xabcd…1234` style truncation for tables and log lines. */
export function shortHash(value: string, lead = 8, tail = 6): string {
  if (!value || value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
