"use client";

import { BotIcon, DatabaseIcon, WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentRunStatus } from "@/hooks/use-agent-stream";
import type { Balance, OracleReading } from "@/lib/blockchain/types";

const AGENT_STATUS: Record<AgentRunStatus, { label: string; tone: string }> = {
  idle: { label: "Standby", tone: "text-zinc-300" },
  running: { label: "Executing", tone: "text-sky-300" },
  done: { label: "Completed", tone: "text-emerald-300" },
  error: { label: "Faulted", tone: "text-red-300" },
};

function SimBadge({ simulated }: { simulated: boolean | undefined }) {
  if (simulated === undefined) return null;
  return <Badge variant={simulated ? "secondary" : "outline"}>{simulated ? "simulated" : "live"}</Badge>;
}

export function MetricCards({
  balance,
  oracle,
  agentStatus,
  lastStep,
}: {
  balance: Balance | null;
  oracle: OracleReading | null;
  agentStatus: AgentRunStatus;
  lastStep: string | null;
}) {
  const status = AGENT_STATUS[agentStatus];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <WalletIcon className="size-3.5" /> Wallet Balance
          </CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">
            {balance ? `${balance.amount} ${balance.symbol}` : "—"}
          </CardTitle>
          <CardAction>
            <SimBadge simulated={balance?.simulated} />
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {balance ? `as of ${new Date(balance.fetchedAt).toLocaleTimeString()}` : "connect a wallet or pick a network"}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <DatabaseIcon className="size-3.5" /> Oracle / Data Feed
          </CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">
            {oracle ? `${oracle.value}${oracle.unit ? ` ${oracle.unit}` : ""}` : "—"}
          </CardTitle>
          <CardAction>
            <SimBadge simulated={oracle?.simulated} />
          </CardAction>
        </CardHeader>
        <CardContent className="truncate text-xs text-muted-foreground">
          {oracle ? `${oracle.label} · ${oracle.source}` : "no reading yet"}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <BotIcon className="size-3.5" /> Agent Status
          </CardDescription>
          <CardTitle className={`text-2xl ${status.tone}`}>{status.label}</CardTitle>
          <CardAction>
            {agentStatus === "running" && <span className="mt-1 inline-block size-2 animate-pulse rounded-full bg-sky-400" />}
          </CardAction>
        </CardHeader>
        <CardContent className="truncate text-xs text-muted-foreground">{lastStep ?? "no run yet"}</CardContent>
      </Card>
    </div>
  );
}
