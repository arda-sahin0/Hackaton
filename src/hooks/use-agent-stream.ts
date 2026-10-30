"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentRunInput, AgentRunResult } from "@/lib/agent/types";

export type AgentRunStatus = "idle" | "running" | "done" | "error";

type RunSummary = Omit<AgentRunResult, "events">;

export interface UseAgentStreamOptions {
  onEvent?: (event: AgentEvent) => void;
  onResult?: (result: RunSummary) => void;
}

/** Opens the SSE run stream and exposes the live event list + run status to the dashboard. */
export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<AgentRunStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEvents([]);
    setStatus("idle");
    setRunId(null);
  }, []);

  const start = useCallback(async (input: AgentRunInput) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setEvents([]);
    setStatus("running");

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Agent run failed to start (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleFrame = (frame: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;
        const payload = JSON.parse(dataLines.join("\n")) as unknown;
        if (eventName === "start") {
          setRunId((payload as { runId: string }).runId);
        } else if (eventName === "result") {
          optionsRef.current.onResult?.(payload as RunSummary);
        } else {
          const event = payload as AgentEvent;
          setEvents((prev) => [...prev, event]);
          optionsRef.current.onEvent?.(event);
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (frame.trim().length > 0) handleFrame(frame);
          idx = buffer.indexOf("\n\n");
        }
      }
      setStatus("done");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setStatus("error");
      setEvents((prev) => [
        ...prev,
        {
          id: `client-${Date.now()}`,
          seq: prev.length + 1,
          ts: new Date().toISOString(),
          level: "ERROR",
          message: (error as Error).message,
        },
      ]);
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { events, status, runId, start, reset };
}
