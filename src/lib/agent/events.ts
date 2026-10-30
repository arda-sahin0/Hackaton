import { EventEmitter } from "node:events";
import type { AgentEvent, AgentLogLevel } from "./types";

type Listener = (event: AgentEvent) => void;

/**
 * Server-side event bus for one agent run. The SSE route subscribes with `on()` and forwards
 * every event to the browser terminal; the orchestrator calls `emit()` from each step.
 */
export class AgentEventBus {
  private readonly emitter = new EventEmitter();
  private seq = 0;
  readonly events: AgentEvent[] = [];

  constructor(private readonly runId: string) {}

  emit(level: AgentLogLevel, message: string, data?: Record<string, unknown>): AgentEvent {
    this.seq += 1;
    const event: AgentEvent = {
      id: `${this.runId}-${this.seq}`,
      seq: this.seq,
      ts: new Date().toISOString(),
      level,
      message,
      data,
    };
    this.events.push(event);
    this.emitter.emit("event", event);
    return event;
  }

  on(listener: Listener): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
