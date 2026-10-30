"use client";

/**
 * Modular Connect Wallet control. Pre-kickoff it calls the active adapter's `connectWallet()`
 * (demo fallback returns a placeholder address). At kickoff swap the body for the sponsor
 * widget — MeshJS `<CardanoWallet/>`, RainbowKit `<ConnectButton/>`, or a BSV key loader —
 * without touching the rest of the dashboard.
 */
import { useState } from "react";
import { Loader2Icon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { NetworkId } from "@/config/chains";
import { getAdapter } from "@/lib/blockchain";
import type { WalletConnection } from "@/lib/blockchain/types";
import { shortHash } from "@/lib/explorer";

export function ConnectWalletButton({
  network,
  demoFallback,
  wallet,
  onConnected,
  onDisconnected,
}: {
  network: NetworkId;
  demoFallback: boolean;
  wallet: WalletConnection | null;
  onConnected: (wallet: WalletConnection) => void;
  onDisconnected: () => void;
}) {
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    try {
      const connection = await getAdapter(network, {
        demoFallback,
        onFallback: ({ reason }) => {
          if (reason !== "demo fallback enabled") toast.warning(`Wallet fallback: ${reason}`);
        },
      }).connectWallet();
      onConnected(connection);
      toast.success(`Wallet connected${connection.simulated ? " (demo)" : ""}`, {
        description: shortHash(connection.address, 12, 8),
      });
    } finally {
      setConnecting(false);
    }
  };

  if (wallet) {
    return (
      <Button variant="outline" onClick={onDisconnected} className="font-mono">
        <WalletIcon data-icon="inline-start" />
        {shortHash(wallet.address, 8, 6)}
        {wallet.simulated && <span className="ml-1 text-xs text-muted-foreground">demo</span>}
      </Button>
    );
  }

  return (
    <Button onClick={connect} disabled={connecting}>
      {connecting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <WalletIcon data-icon="inline-start" />}
      Connect Wallet
    </Button>
  );
}
