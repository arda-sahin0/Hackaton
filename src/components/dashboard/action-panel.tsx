"use client";

import { Loader2Icon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGENT_MAX_AMOUNT, NETWORKS, type NetworkId } from "@/config/chains";
import type { AgentRunStatus } from "@/hooks/use-agent-stream";
import type { SellerMode } from "@/lib/agent/types";

const SELLER_ITEMS: Array<{ value: SellerMode; label: string }> = [
  { value: "none", label: "Honest research agent" },
  { value: "retracted", label: "Cheating twin · cites a retracted paper" },
  { value: "tamper", label: "Cheating twin · forges a signed proof" },
];
const isSellerMode = (v: unknown): v is SellerMode => v === "none" || v === "retracted" || v === "tamper";

export function ActionPanel({
  network,
  objective,
  onObjectiveChange,
  demoFallback,
  status,
  onTrigger,
  onReset,
  seller,
  onSellerChange,
  minSources,
  onMinSourcesChange,
}: {
  network: NetworkId;
  objective: string;
  onObjectiveChange: (value: string) => void;
  demoFallback: boolean;
  status: AgentRunStatus;
  onTrigger: () => void;
  onReset: () => void;
  seller: SellerMode;
  onSellerChange: (value: SellerMode) => void;
  minSources: number;
  onMinSourcesChange: (value: number) => void;
}) {
  const running = status === "running";
  const cfg = NETWORKS[network];
  const citation = network === "cardano-preprod";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{citation ? "Hire a Research Agent" : "Autonomous Agent Action"}</CardTitle>
        <CardDescription>
          {citation
            ? "Hirer brief → research agent writes & proves every DOI (API3 Airnode-signed OpenAlex) → hirer re-checks → paid on Masumi or refunded → verified on Cardanoscan."
            : `The happy path: analyze → read wallet → query oracle → decide → sign → broadcast → verify on ${cfg.explorer.name}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="objective">
          {citation ? "Research brief" : "Objective (optional)"}
        </label>
        <textarea
          id="objective"
          value={objective}
          onChange={(e) => onObjectiveChange(e.target.value)}
          disabled={running}
          rows={2}
          placeholder={citation ? "Write a short literature summary on deep learning for engineers." : "Pay for one verified data reading and prove it on-chain."}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        />
        {citation && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Seller (demo identity)</label>
              <Select
                items={SELLER_ITEMS}
                value={seller}
                onValueChange={(value) => {
                  if (isSellerMode(value)) onSellerChange(value);
                }}
                disabled={running}
              >
                <SelectTrigger aria-label="Seller identity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELLER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="min-sources">Min. sources</label>
              <input
                id="min-sources"
                type="number"
                min={1}
                max={10}
                value={minSources}
                disabled={running}
                onChange={(e) => onMinSourcesChange(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
              />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Policy cap: <span className="font-mono text-foreground">{AGENT_MAX_AMOUNT} {cfg.currency.symbol}</span> per action ·
          mode: <span className={`font-mono ${demoFallback ? "text-amber-300" : "text-emerald-300"}`}>{demoFallback ? "demo fallback" : "live testnet"}</span>
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={onTrigger} disabled={running} size="lg">
          {running ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PlayIcon data-icon="inline-start" />}
          {running ? "Agents running…" : citation ? "Hire & Verify" : "Trigger Autonomous Agent Action"}
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={running || status === "idle"}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
}
