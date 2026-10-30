/**
 * Testnet network registry — the ONE place where explorer bases, RPC env vars, contract
 * addresses, oracle labels and the demo-fallback replay hashes live. Everything else imports
 * from here (explorer helper, adapters, UI badges).
 *
 * Pre-kickoff: generic placeholders only. At kickoff:
 *   1. fill `contracts` with the deployed addresses,
 *   2. set the RPC / API-key env vars named in `rpc.envVar` (see .env.example),
 *   3. replace every `sampleTxHash` with a REAL, pre-verified testnet transaction you broadcast
 *      yourself — the demo fallback replays it when Wi-Fi or the RPC drops.
 */

export type NetworkId = "cardano-preprod" | "bsv-testnet" | "evm-sepolia";
export type ChainFamily = "cardano" | "bsv" | "evm";

export interface NetworkConfig {
  id: NetworkId;
  family: ChainFamily;
  /** Human label, e.g. "Cardano Preprod". */
  label: string;
  /** Short badge text for the top nav. */
  badge: string;
  /** Sponsor track this network serves. */
  sponsor: string;
  currency: { symbol: string; decimals: number };
  explorer: { name: string; txBase: string; addressBase: string };
  /** Which env var carries the provider key / RPC URL (server-side). */
  rpc: { envVar: string; url?: string };
  /** EVM only. */
  chainId?: number;
  /** What the agent reads before deciding (API3 dAPI on EVM; reference feed elsewhere). */
  oracle: { label: string; source: string; feed?: string };
  /** Deployed contract addresses — empty until kickoff. */
  contracts: Record<string, string>;
  /** Placeholder recipient for the happy-path transfer. */
  sampleRecipient: string;
  /** Pre-verified testnet tx replayed by the demo fallback. PLACEHOLDER until kickoff. */
  sampleTxHash: string;
}

// NEXT_PUBLIC_* vars must be referenced literally so Next.js can inline them on the client.
const EVM_EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EVM_EXPLORER_BASE ?? "https://sepolia.etherscan.io";

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  "cardano-preprod": {
    id: "cardano-preprod",
    family: "cardano",
    label: "Cardano Preprod",
    badge: "Cardano Preprod",
    sponsor: "Cardano",
    currency: { symbol: "ADA", decimals: 6 },
    explorer: {
      name: "Cardanoscan",
      txBase: "https://preprod.cardanoscan.io/transaction/",
      addressBase: "https://preprod.cardanoscan.io/address/",
    },
    rpc: {
      envVar: "BLOCKFROST_PROJECT_ID",
      url: process.env.NEXT_PUBLIC_CARDANO_RPC_URL ?? "https://cardano-preprod.blockfrost.io/api/v0",
    },
    oracle: { label: "ADA/USD reference", source: "reference feed (placeholder)" },
    contracts: {},
    sampleRecipient:
      process.env.NEXT_PUBLIC_RECIPIENT_CARDANO ??
      "addr_test1PLACEHOLDER_replace_at_kickoff_with_a_real_preprod_address",
    sampleTxHash:
      process.env.NEXT_PUBLIC_FALLBACK_TX_CARDANO ??
      "0000000000000000000000000000000000000000000000000000000000000001",
  },
  "bsv-testnet": {
    id: "bsv-testnet",
    family: "bsv",
    label: "BSV Testnet",
    badge: "BSV Testnet",
    sponsor: "BSV Association",
    currency: { symbol: "BSV", decimals: 8 },
    explorer: {
      name: "WhatsOnChain",
      txBase: "https://test.whatsonchain.com/tx/",
      addressBase: "https://test.whatsonchain.com/address/",
    },
    rpc: {
      envVar: "WHATSONCHAIN_API_KEY",
      url: process.env.NEXT_PUBLIC_BSV_RPC_URL ?? "https://api.whatsonchain.com/v1/bsv/test",
    },
    oracle: { label: "BSV/USD reference", source: "reference feed (placeholder)" },
    contracts: {},
    sampleRecipient:
      process.env.NEXT_PUBLIC_RECIPIENT_BSV ?? "mPLACEHOLDERreplaceAtKickoffWithRealTestnetAddr",
    sampleTxHash:
      process.env.NEXT_PUBLIC_FALLBACK_TX_BSV ??
      "0000000000000000000000000000000000000000000000000000000000000002",
  },
  "evm-sepolia": {
    id: "evm-sepolia",
    family: "evm",
    label: "EVM Sepolia",
    badge: "EVM Sepolia · API3",
    sponsor: "API3",
    currency: { symbol: "ETH", decimals: 18 },
    explorer: {
      name: "Etherscan",
      txBase: `${EVM_EXPLORER_BASE}/tx/`,
      addressBase: `${EVM_EXPLORER_BASE}/address/`,
    },
    rpc: {
      envVar: "EVM_RPC_URL",
      url: process.env.NEXT_PUBLIC_EVM_RPC_URL ?? "https://rpc.sepolia.org",
    },
    chainId: Number(process.env.NEXT_PUBLIC_EVM_CHAIN_ID ?? 11155111),
    oracle: {
      label: "ETH/USD (API3 dAPI)",
      source: "API3 Api3ReaderProxyV1 (placeholder)",
      feed: process.env.NEXT_PUBLIC_API3_PROXY_ADDRESS ?? "",
    },
    contracts: {},
    sampleRecipient:
      process.env.NEXT_PUBLIC_RECIPIENT_EVM ?? "0x0000000000000000000000000000000000000000",
    sampleTxHash:
      process.env.NEXT_PUBLIC_FALLBACK_TX_EVM ??
      "0x0000000000000000000000000000000000000000000000000000000000000003",
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (NETWORK_IDS as string[]).includes(value);
}

export function getNetwork(id: NetworkId): NetworkConfig {
  return NETWORKS[id];
}

/** Network the dashboard opens on. Override with NEXT_PUBLIC_DEFAULT_NETWORK. */
export const DEFAULT_NETWORK: NetworkId = isNetworkId(process.env.NEXT_PUBLIC_DEFAULT_NETWORK)
  ? process.env.NEXT_PUBLIC_DEFAULT_NETWORK
  : "cardano-preprod";

/**
 * Demo fallback flag (directive §5.3). Defaults to ON — a live pitch must never crash. Set
 * NEXT_PUBLIC_DEMO_FALLBACK=false once a real adapter is wired and you want live execution.
 */
export const DEMO_FALLBACK_DEFAULT: boolean = process.env.NEXT_PUBLIC_DEMO_FALLBACK !== "false";

/** Title shown in the top nav. Generic until kickoff (directive §2A). */
export const PROJECT_TITLE: string = process.env.NEXT_PUBLIC_PROJECT_TITLE ?? "Smart Procurement";

/** Hard ceiling on what the agent may move in one action (in the network's base currency). */
export const AGENT_MAX_AMOUNT: string = process.env.NEXT_PUBLIC_AGENT_MAX_AMOUNT ?? "1";
