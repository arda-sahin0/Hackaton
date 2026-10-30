"use client";

import { ActivityIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { NETWORKS, NETWORK_IDS, PROJECT_TITLE, isNetworkId, type NetworkId } from "@/config/chains";
import type { WalletConnection } from "@/lib/blockchain/types";

const NETWORK_ITEMS = NETWORK_IDS.map((id) => ({ value: id, label: NETWORKS[id].label }));

export function TopNav({
  network,
  onNetworkChange,
  demoFallback,
  onDemoFallbackChange,
  wallet,
  onWalletConnected,
  onWalletDisconnected,
  locked,
}: {
  network: NetworkId;
  onNetworkChange: (network: NetworkId) => void;
  demoFallback: boolean;
  onDemoFallbackChange: (value: boolean) => void;
  wallet: WalletConnection | null;
  onWalletConnected: (wallet: WalletConnection) => void;
  onWalletDisconnected: () => void;
  /** true while a run is streaming — network/mode changes are disabled. */
  locked: boolean;
}) {
  const cfg = NETWORKS[network];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-5 text-emerald-400" />
          <h1 className="text-base font-semibold tracking-tight">{PROJECT_TITLE}</h1>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {cfg.badge}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Select
            items={NETWORK_ITEMS}
            value={network}
            onValueChange={(value) => {
              if (isNetworkId(value)) onNetworkChange(value);
            }}
            disabled={locked}
          >
            <SelectTrigger aria-label="Active network" className="min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NETWORK_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlertIcon className={`size-4 ${demoFallback ? "text-amber-400" : "text-muted-foreground"}`} />
            <span className="hidden sm:inline">Demo Fallback</span>
            <Switch checked={demoFallback} onCheckedChange={(checked) => onDemoFallbackChange(checked)} disabled={locked} aria-label="Demo fallback mode" />
          </label>
          <ConnectWalletButton
            network={network}
            demoFallback={demoFallback}
            wallet={wallet}
            onConnected={onWalletConnected}
            onDisconnected={onWalletDisconnected}
          />
        </div>
      </div>
    </header>
  );
}
