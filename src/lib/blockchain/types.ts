import type { NetworkId } from "@/config/chains";

export interface WalletConnection {
  address: string;
  network: NetworkId;
  /** Wallet / provider name, e.g. "Eternl", "RainbowKit", "demo". */
  provider: string;
  simulated: boolean;
}

export interface Balance {
  /** Human amount in the network's base unit, e.g. "1250.000000". */
  amount: string;
  symbol: string;
  network: NetworkId;
  simulated: boolean;
  fetchedAt: string;
}

export interface OracleReading {
  label: string;
  value: string;
  unit?: string;
  source: string;
  simulated: boolean;
  fetchedAt: string;
}

export interface AgentTxPayload {
  to: string;
  /** Human amount in the base unit (the adapter converts to lovelace / satoshi / wei). */
  amount: string;
  memo?: string;
  metadata?: Record<string, unknown>;
}

export type TxStatus = "pending" | "verified" | "failed";

export interface TxReceipt {
  txHash: string;
  network: NetworkId;
  explorerUrl: string;
  status: TxStatus;
  /** true when the hash came from the demo fallback, not a live broadcast. */
  simulated: boolean;
  submittedAt: string;
  amount?: string;
  to?: string;
}

/**
 * The unified contract every chain adapter implements. The agent orchestrator and the UI only
 * ever talk to this interface, so swapping Cardano / BSV / EVM is a one-line change.
 */
export interface BlockchainAdapter {
  readonly network: NetworkId;
  connectWallet(): Promise<WalletConnection>;
  getBalance(address?: string): Promise<Balance>;
  readOracle(): Promise<OracleReading>;
  executeAgentTransaction(payload: AgentTxPayload): Promise<TxReceipt>;
  getTransactionStatus(txHash: string): Promise<TxStatus>;
}

export interface AdapterOptions {
  /** Replay the pre-verified tx instead of touching the network (directive §5.3). */
  demoFallback: boolean;
  /** Called whenever a live call degraded to the fallback (timeout, RPC error, SDK not wired). */
  onFallback?: (info: FallbackInfo) => void;
}

export interface FallbackInfo {
  operation: string;
  reason: string;
  network: NetworkId;
}
