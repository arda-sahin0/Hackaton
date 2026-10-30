"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ActionPanel } from "@/components/dashboard/action-panel";
import { ActivityTable, type ActivityRow } from "@/components/dashboard/activity-table";
import { MetricCards } from "@/components/dashboard/metric-cards";
import { TopNav } from "@/components/dashboard/top-nav";
import { AgentTerminal } from "@/components/terminal/agent-terminal";
import { DEFAULT_NETWORK, DEMO_FALLBACK_DEFAULT, NETWORKS, type NetworkId } from "@/config/chains";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { formatEvent } from "@/lib/agent/format";
import type { AgentEvent, SellerMode } from "@/lib/agent/types";
import type { Balance, OracleReading, TxReceipt, TxStatus, WalletConnection } from "@/lib/blockchain/types";

interface StateResponse {
  balance: Balance;
  oracle: OracleReading;
  degraded: string[];
}

export function CommandCenter() {
  const [network, setNetwork] = useState<NetworkId>(DEFAULT_NETWORK);
  const [demoFallback, setDemoFallback] = useState<boolean>(DEMO_FALLBACK_DEFAULT);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [objective, setObjective] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [oracle, setOracle] = useState<OracleReading | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [lastStep, setLastStep] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerMode>("none");
  const [minSources, setMinSources] = useState(1);

  const onEvent = useCallback((event: AgentEvent) => {
    setLastStep(formatEvent(event));
    const data = event.data ?? {};
    if (data.balance) setBalance(data.balance as Balance);
    if (data.oracle) setOracle(data.oracle as OracleReading);
    if (event.level === "CHAIN" && data.receipt) {
      const receipt = data.receipt as TxReceipt;
      const decision = (data.decision ?? {}) as { action?: string };
      setRows((prev) => [
        {
          id: receipt.txHash + receipt.submittedAt,
          timestamp: receipt.submittedAt,
          action: decision.action ?? (receipt.amount ? `Agent payment · ${receipt.amount}` : "Agent payment"),
          network: receipt.network,
          status: receipt.status,
          txHash: receipt.txHash,
          explorerUrl: receipt.explorerUrl,
          simulated: receipt.simulated,
        },
        ...prev,
      ]);
    }
    if ((event.level === "VERIFIED" || event.level === "ERROR") && typeof data.txHash === "string") {
      const status = (data.status as TxStatus | undefined) ?? (event.level === "VERIFIED" ? "verified" : "failed");
      setRows((prev) => prev.map((row) => (row.txHash === data.txHash ? { ...row, status } : row)));
      if (status === "verified") {
        toast.success("Verified on-chain", { description: event.message });
      }
    }
    if (event.level === "ERROR") toast.error(event.message);
  }, []);

  const { events, status, start, reset } = useAgentStream({ onEvent });

  // Initial metric data for the active network / mode. State is set only inside the async
  // callbacks (never synchronously in the effect body); `cancelled` guards unmount + StrictMode.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/state?network=${network}&demo=${demoFallback}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`state ${res.status}`);
        return (await res.json()) as StateResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setBalance(json.balance);
        setOracle(json.oracle);
        for (const line of json.degraded) toast.warning(`Fallback: ${line}`);
      })
      .catch((error: Error) => {
        if (!cancelled) toast.error(`Could not load network state: ${error.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [network, demoFallback]);

  const handleNetworkChange = (next: NetworkId) => {
    setNetwork(next);
    setWallet(null);
    setBalance(null);
    setOracle(null);
    toast.info(`Switched to ${NETWORKS[next].label}`);
  };

  const trigger = () => {
    void start({
      network,
      objective,
      demoFallback,
      walletAddress: wallet?.address,
      workflow: network === "cardano-preprod" ? "citation-escrow" : "generic",
      cheat: seller,
      minSources,
    });
  };

  const handleReset = () => {
    reset();
    setLastStep(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        network={network}
        onNetworkChange={handleNetworkChange}
        demoFallback={demoFallback}
        onDemoFallbackChange={setDemoFallback}
        wallet={wallet}
        onWalletConnected={setWallet}
        onWalletDisconnected={() => setWallet(null)}
        locked={status === "running"}
      />
      <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <MetricCards balance={balance} oracle={oracle} agentStatus={status} lastStep={lastStep} />
            <ActionPanel
              network={network}
              objective={objective}
              onObjectiveChange={setObjective}
              demoFallback={demoFallback}
              status={status}
              onTrigger={trigger}
              onReset={handleReset}
              seller={seller}
              onSellerChange={setSeller}
              minSources={minSources}
              onMinSourcesChange={setMinSources}
            />
          </div>
          <AgentTerminal events={events} status={status} onClear={handleReset} />
        </div>
        <ActivityTable rows={rows} />
      </main>
    </div>
  );
}
