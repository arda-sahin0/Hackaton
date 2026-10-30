/**
 * EVM (Sepolia) adapter with API3 dAPI oracle reads — structured for viem / wagmi / RainbowKit
 * (Scaffold-ETH 2 stack).
 *
 * ── KICKOFF INJECTION RECIPE (≈15 min) ────────────────────────────────────────────────────
 *   npm install viem wagmi @rainbow-me/rainbowkit @tanstack/react-query @api3/contracts
 *   .env.local: EVM_RPC_URL=<sepolia rpc>  AGENT_PRIVATE_KEY=<0x… test key, gitignored>
 *               NEXT_PUBLIC_API3_PROXY_ADDRESS=<Api3ReaderProxyV1 for ETH/USD on your chain>
 *
 *   connectWallet():   RainbowKit <ConnectButton/> in src/components/wallet (client side), or
 *                      privateKeyToAccount(process.env.AGENT_PRIVATE_KEY) for autonomous signing.
 *   getBalance():      publicClient.getBalance({ address }) -> formatEther
 *   readOracle():      publicClient.readContract({ address: proxy, abi: Api3ReaderProxyV1 abi,
 *                        functionName: "read" }) -> [value (int224, 18 decimals), timestamp]
 *   executeAgentTransaction():
 *                      walletClient.sendTransaction({ to: payload.to, value: parseEther(amount) })
 *                      or writeContract(...) on your deployed contract -> txHash
 *   getTransactionStatus(): publicClient.getTransactionReceipt({ hash }) -> status === "success"
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

export class Api3EvmAdapter implements BlockchainAdapter {
  readonly network: NetworkId = "evm-sepolia";
  private readonly cfg = getNetwork("evm-sepolia");
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
        // INJECT: RainbowKit / wagmi useAccount, or privateKeyToAccount for the agent signer
        throw new NotWiredError("EVM wallet connect (RainbowKit / viem)");
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
        // INJECT: publicClient.getBalance
        throw new NotWiredError("EVM balance read");
      },
      () => ({
        amount: jitter(0.5).toFixed(6),
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
        // INJECT: readContract(Api3ReaderProxyV1.read) — value has 18 decimals
        throw new NotWiredError("API3 dAPI read");
      },
      () => ({
        label: this.cfg.oracle.label,
        value: jitter(3200, 0.005).toFixed(2),
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
        // INJECT: walletClient.sendTransaction / writeContract (see header)
        throw new NotWiredError("EVM transaction send");
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
        // INJECT: publicClient.getTransactionReceipt
        throw new NotWiredError("EVM tx receipt");
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
