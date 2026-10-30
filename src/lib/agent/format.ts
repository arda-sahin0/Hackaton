import type { AgentEvent, AgentLogLevel } from "./types";

/** `[LEVEL] message` — the canonical terminal line. Isomorphic (no node imports). */
export function formatEvent(event: Pick<AgentEvent, "level" | "message">): string {
  return `[${event.level}] ${event.message}`;
}

export const LEVEL_ORDER: AgentLogLevel[] = [
  "AGENT",
  "TOOL",
  "ORACLE",
  "SIGNING",
  "CHAIN",
  "VERIFIED",
  "ERROR",
  "DONE",
];
