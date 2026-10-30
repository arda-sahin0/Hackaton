"use client";

import { Loader2Icon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_MAX_AMOUNT, NETWORKS, type NetworkId } from "@/config/chains";
import type { AgentRunStatus } from "@/hooks/use-agent-stream";

export function ActionPanel({
  network,
  objective,
  onObjectiveChange,
  demoFallback,
  status,
  onTrigger,
  onReset,
}: {
  network: NetworkId;
  objective: string;
  onObjectiveChange: (value: string) => void;
  demoFallback: boolean;
  status: AgentRunStatus;
  onTrigger: () => void;
  onReset: () => void;
}) {
  const running = status === "running";
  const cfg = NETWORKS[network];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Autonomous Agent Action</CardTitle>
        <CardDescription>
          The happy path: analyze → read wallet → query oracle → decide → sign → broadcast → verify on {cfg.explorer.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="objective">
          Objective (optional)
        </label>
        <textarea
          id="objective"
          value={objective}
          onChange={(e) => onObjectiveChange(e.target.value)}
          disabled={running}
          rows={2}
          placeholder="Pay for one verified data reading and prove it on-chain."
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        />
        <p className="text-xs text-muted-foreground">
          Policy cap: <span className="font-mono text-foreground">{AGENT_MAX_AMOUNT} {cfg.currency.symbol}</span> per action ·
          mode: <span className={`font-mono ${demoFallback ? "text-amber-300" : "text-emerald-300"}`}>{demoFallback ? "demo fallback" : "live testnet"}</span>
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={onTrigger} disabled={running} size="lg">
          {running ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PlayIcon data-icon="inline-start" />}
          {running ? "Agent running…" : "Trigger Autonomous Agent Action"}
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={running || status === "idle"}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
}
