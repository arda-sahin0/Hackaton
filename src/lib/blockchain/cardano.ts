/**
 * Cardano Preprod adapter — Blockfrost-backed reads (balance, tx status) and the free OpenAlex
 * citation check as the "data feed". Signing happens server-side in the standalone `cardano/`
 * package (Evolution SDK + x402), which the citation-escrow workflow drives as a child process;
 * this adapter never holds a key. Every call still runs through the demo fallback (§5.3).
 *
 *   BLOCKFROST_PROJECT_ID     preprod project id (server-side)
 *   CARDANO_WATCH_ADDRESS     address shown in the balance card (default: the Masumi escrow)
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

const DEMO_DOI = "10.1038/nature14539";

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
        // Browser wallets (Eternl) are not wired in the dashboard; the agents sign server-side.
        throw new NotWiredError("Cardano browser wallet connect");
      },
      () => ({
        address: this.cfg.contracts.masumiEscrow ?? this.cfg.sampleRecipient,
        network: this.network,
        provider: "demo",
        simulated: true,
      }),
      { ...this.fallback("connectWallet"), delayMs: 600 },
    );
  }

  getBalance(address?: string): Promise<Balance> {
    const watch = address?.trim() || process.env.CARDANO_WATCH_ADDRESS?.trim() || this.cfg.contracts.masumiEscrow;
    return withDemoFallback<Balance>(
      async () => {
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
    return withDemoFallback<OracleReading>(
      async () => {
        const res = await fetch(`https://api.openalex.org/works/doi:${DEMO_DOI}?select=doi,is_retracted,title`, { cache: "no-store" });
        if (!res.ok) throw new Error(`OpenAlex returned ${res.status}`);
        const work = (await res.json()) as { is_retracted: boolean; title: string };
        return {
          label: `OpenAlex · ${DEMO_DOI} · "${work.title}"`,
          value: work.is_retracted ? "retracted" : "not retracted",
          source: this.cfg.oracle.source,
          simulated: false,
          fetchedAt: new Date().toISOString(),
        };
      },
      () => ({
        label: this.cfg.oracle.label,
        value: "not retracted",
        source: `${this.cfg.oracle.source} · replay`,
        simulated: true,
        fetchedAt: new Date().toISOString(),
      }),
      { ...this.fallback("readOracle"), delayMs: 700 },
    );
  }

  executeAgentTransaction(payload: AgentTxPayload): Promise<TxReceipt> {
    return withDemoFallback(
      async () => {
        // The generic happy path has no server-side signer in the dashboard; the citation-escrow
        // workflow produces its receipts through the cardano/ package instead.
        throw new NotWiredError("Cardano transaction submit from the dashboard");
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
