/**
 * BSV Testnet adapter — structured for high-frequency micropayments (pay-per-call / M2M).
 *
 * ── KICKOFF INJECTION RECIPE (≈15 min) ────────────────────────────────────────────────────
 *   npm install @bsv/sdk
 *   .env.local: BSV_PRIVATE_KEY_WIF=<testnet WIF, gitignored>  WHATSONCHAIN_API_KEY=<optional>
 *
 *   connectWallet():   const key = PrivateKey.fromWif(process.env.BSV_PRIVATE_KEY_WIF);
 *                      const address = key.toAddress("testnet").toString();
 *   getBalance():      GET https://api.whatsonchain.com/v1/bsv/test/address/{addr}/balance
 *   executeAgentTransaction():
 *                      build a Transaction with a P2PKH output to payload.to for
 *                      Math.round(Number(payload.amount) * 1e8) satoshis, sign with the key,
 *                      POST https://api.whatsonchain.com/v1/bsv/test/tx/raw  -> txid
 *   getTransactionStatus(): GET .../tx/hash/{txid} (confirmations >= 0 => seen; >=1 => verified)
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * Until injected, every live path throws NotWiredError and the demo fallback answers.
 */
import { getNetwork, type NetworkId } from "@/config/chains";
import { explorerTxUrl } from "@/lib/explorer";
import { NotWiredError, jitter, withDemoFallback } from "./fallback";
import type {
  AdapterOptions,
  AgentTxPayload,
  Balance,
  BlockchainAdapter,
  OracleReading,
  TxReceipt,
  TxStatus,
  WalletConnection,
} from "./types";

export class BsvAdapter implements BlockchainAdapter {
  readonly network: NetworkId = "bsv-testnet";
  private readonly cfg = getNetwork("bsv-testnet");
  private verifiedHashes = new Set<string>();

  constructor(private readonly opts: AdapterOptions) {}

  private fallback(operation: string) {
    return {
      demoFallback: this.opts.demoFallback,
      operation,
      onFallback: (reason: string) =>
        this.opts.onFallback?.({ operation, reason, network: this.network }),
    };
  }

  connectWallet(): Promise<WalletConnection> {
    return withDemoFallback(
      async () => {
        // INJECT: PrivateKey.fromWif(...).toAddress("testnet")
        throw new NotWiredError("BSV wallet (key-based)");
      },
      () => ({
        address: this.cfg.sampleRecipient,
        network: this.network,
        provider: "demo",
        simulated: true,
      }),
      { ...this.fallback("connectWallet"), delayMs: 600 },
    );
  }

  getBalance(): Promise<Balance> {
    return withDemoFallback(
      async () => {
        // INJECT: WhatsOnChain /address/{addr}/balance
        throw new NotWiredError("BSV balance read");
      },
      () => ({
        amount: jitter(0.25).toFixed(8),
        symbol: this.cfg.currency.symbol,
        network: this.network,
        simulated: true,
        fetchedAt: new Date().toISOString(),
      }),
      { ...this.fallback("getBalance"), delayMs: 500 },
    );
  }

  readOracle(): Promise<OracleReading> {
    return withDemoFallback(
      async () => {
        // INJECT: the paid data feed the agent is buying per call
        throw new NotWiredError("BSV data feed read");
      },
      () => ({
        label: this.cfg.oracle.label,
        value: jitter(35.0, 0.01).toFixed(2),
        unit: "USD",
        source: this.cfg.oracle.source,
        simulated: true,
        fetchedAt: new Date().toISOString(),
      }),
      { ...this.fallback("readOracle"), delayMs: 700 },
    );
  }

  executeAgentTransaction(payload: AgentTxPayload): Promise<TxReceipt> {
    return withDemoFallback(
      async () => {
        // INJECT: build + sign P2PKH tx, POST /tx/raw (see header)
        throw new NotWiredError("BSV transaction broadcast");
      },
      () => {
        const txHash = this.cfg.sampleTxHash;
        return {
          txHash,
          network: this.network,
          explorerUrl: explorerTxUrl(this.network, txHash),
          status: "pending" as const,
          simulated: true,
          submittedAt: new Date().toISOString(),
          amount: payload.amount,
          to: payload.to,
        };
      },
      this.fallback("executeAgentTransaction"),
    );
  }

  getTransactionStatus(txHash: string): Promise<TxStatus> {
    return withDemoFallback(
      async () => {
        // INJECT: WhatsOnChain /tx/hash/{txid}
        throw new NotWiredError("BSV tx status");
      },
      () => {
        if (this.verifiedHashes.has(txHash)) return "verified" as const;
        this.verifiedHashes.add(txHash);
        return "pending" as const;
      },
      { ...this.fallback("getTransactionStatus"), delayMs: 900 },
    );
  }
}
