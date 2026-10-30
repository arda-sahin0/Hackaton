"use client";

import { useEffect, useRef } from "react";
import { TerminalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentRunStatus } from "@/hooks/use-agent-stream";
import type { AgentEvent, AgentLogLevel } from "@/lib/agent/types";

const LEVEL_CLASS: Record<AgentLogLevel, string> = {
  AGENT: "text-sky-400",
  TOOL: "text-violet-400",
  ORACLE: "text-amber-400",
  SIGNING: "text-fuchsia-400",
  CHAIN: "text-emerald-400",
  VERIFIED: "text-emerald-300 font-semibold",
  ERROR: "text-red-400 font-semibold",
  DONE: "text-zinc-300",
};

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  idle: "Idle",
  running: "Streaming",
  done: "Completed",
  error: "Error",
};

function timeOf(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AgentTerminal({
  events,
  status,
  onClear,
}: {
  events: AgentEvent[];
  status: AgentRunStatus;
  onClear?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [events.length]);

  return (
    <Card className="flex h-full min-h-[420px] flex-col">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-muted-foreground" />
          Live AI Agent Terminal
        </CardTitle>
        <CardDescription>Reasoning, oracle queries and signing events, streamed as they happen.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant={status === "running" ? "default" : "outline"} className="font-mono">
            {status === "running" && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />}
            {STATUS_LABEL[status]}
          </Badge>
          <Button size="xs" variant="ghost" onClick={onClear} disabled={status === "running" || events.length === 0}>
            Clear
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full max-h-[520px] overflow-y-auto bg-black/40 px-4 py-3 font-mono text-[13px] leading-6">
          {events.length === 0 ? (
            <p className="text-muted-foreground">
              <span className="text-emerald-400">$</span> waiting for a run — press{" "}
              <span className="text-foreground">Trigger Autonomous Agent Action</span>
              <span className="ml-1 inline-block w-2 animate-pulse bg-muted-foreground/70">&nbsp;</span>
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex gap-3 whitespace-pre-wrap break-all">
                <span className="shrink-0 text-muted-foreground/60">{timeOf(event.ts)}</span>
                <span className={`shrink-0 ${LEVEL_CLASS[event.level]}`}>[{event.level}]</span>
                <span className="text-zinc-200">{event.message}</span>
              </div>
            ))
          )}
          {status === "running" && (
            <div className="text-emerald-400">
              <span className="inline-block w-2 animate-pulse bg-emerald-400">&nbsp;</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </CardContent>
    </Card>
  );
}
