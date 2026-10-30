/**
 * Cardano Preprod adapter — structured for MeshJS (or Lucid).
 *
 * ── KICKOFF INJECTION RECIPE (≈15 min) ────────────────────────────────────────────────────
 *   npm install @meshsdk/core @meshsdk/react
 *   .env.local: BLOCKFROST_PROJECT_ID=<preprod project id>
 *
 *   connectWallet():   const wallet = await BrowserWallet.enable("eternl");   // or nami / lace
 *                      const address = (await wallet.getUsedAddresses())[0];
 *   getBalance():      wired: Blockfrost /addresses/{address} (or CARDANO_WATCH_ADDRESS)
 *   executeAgentTransaction():
 *                      const tx = new Transaction({ initiator: wallet })
 *                        .sendLovelace(payload.to, String(Math.round(Number(payload.amount) * 1e6)));
 *                      const unsigned = await tx.build();
 *                      const signed = await wallet.signTx(unsigned);
 *                      const txHash = await wallet.submitTx(signed);
 *   getTransactionStatus(): wired: Blockfrost `GET /txs/{hash}` (200 => verified).
 *   Server-side signing alternative: MeshWallet with a mnemonic from a gitignored env var.
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

export class CardanoAdapter implements BlockchainAdapter {
  readonly network: NetworkId = "cardano-preprod";
  private readonly cfg = getNetwork("cardano-preprod");
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

  /** Blockfrost GET (server-side; needs BLOCKFROST_PROJECT_ID). 404 comes back as `body: null`. */
  private async blockfrost<T>(path: string): Promise<{ status: number; body: T | null }> {
    const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim();
    if (!projectId) throw new NotWiredError("Blockfrost (BLOCKFROST_PROJECT_ID)");
    const base = this.cfg.rpc.url ?? "https://cardano-preprod.blockfrost.io/api/v0";
    const res = await fetch(`${base}${path}`, { headers: { project_id: projectId }, cache: "no-store" });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) throw new Error(`Blockfrost ${path} returned ${res.status}`);
    return { status: res.status, body: (await res.json()) as T };
  }

  connectWallet(): Promise<WalletConnection> {
    return withDemoFallback(
      async () => {
        // INJECT: BrowserWallet.enable(...) + getUsedAddresses()
        throw new NotWiredError("Cardano wallet connect (MeshJS)");
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

  getBalance(address?: string): Promise<Balance> {
    return withDemoFallback<Balance>(
      async () => {
        const watch = address?.trim() || process.env.CARDANO_WATCH_ADDRESS?.trim();
        if (!watch?.startsWith("addr_test1")) throw new NotWiredError("Cardano balance (no preprod address)");
        const { body } = await this.blockfrost<{ amount: Array<{ unit: string; quantity: string }> }>(`/addresses/${watch}`);
        const lovelace = body?.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0";
        return {
          amount: (Number(lovelace) / 1e6).toFixed(6),
          symbol: this.cfg.currency.symbol,
          network: this.network,
          simulated: false,
          fetchedAt: new Date().toISOString(),
        };
      },
      () => ({
        amount: jitter(1250).toFixed(6),
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
        // INJECT: any verifiable reference feed (e.g. an on-chain oracle datum or API3 on EVM)
        throw new NotWiredError("Cardano oracle read");
      },
      () => ({
        label: this.cfg.oracle.label,
        value: jitter(0.42, 0.01).toFixed(4),
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
        // INJECT: Transaction.sendLovelace -> build -> signTx -> submitTx (see header)
        throw new NotWiredError("Cardano transaction submit");
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
        const { status } = await this.blockfrost<{ hash: string }>(`/txs/${txHash}`);
        return status === 404 ? ("pending" as const) : ("verified" as const);
      },
      () => {
        // First poll: pending; second: verified — gives the UI its Pending -> Verified transition.
        if (this.verifiedHashes.has(txHash)) return "verified" as const;
        this.verifiedHashes.add(txHash);
        return "pending" as const;
      },
      { ...this.fallback("getTransactionStatus"), delayMs: 900 },
    );
  }
}
