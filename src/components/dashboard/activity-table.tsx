"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NETWORKS, type NetworkId } from "@/config/chains";
import type { TxStatus } from "@/lib/blockchain/types";
import { explorerName, shortHash } from "@/lib/explorer";

export interface ActivityRow {
  id: string;
  timestamp: string;
  action: string;
  network: NetworkId;
  status: TxStatus;
  txHash: string;
  explorerUrl: string;
  simulated: boolean;
}

function StatusBadge({ status }: { status: TxStatus }) {
  if (status === "verified") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-400" /> Verified On-Chain
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 text-amber-300">
      <span className="size-1.5 animate-pulse rounded-full bg-amber-400" /> Pending
    </Badge>
  );
}

export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent On-Chain Activity</CardTitle>
        <CardDescription>Every executed action with its explorer-verifiable transaction hash.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>TxHash</TableHead>
              <TableHead className="text-right">Proof</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No on-chain activity yet — trigger the agent to produce the first proof.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(row.timestamp).toLocaleTimeString([], { hour12: false })}
                  </TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{NETWORKS[row.network].badge}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {shortHash(row.txHash, 10, 8)}
                    {row.simulated && <span className="ml-2 text-muted-foreground">replay</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      href={row.explorerUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-sm text-sky-300 underline-offset-4 hover:underline"
                    >
                      View on {explorerName(row.network)}
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
