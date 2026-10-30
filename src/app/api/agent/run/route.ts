import { DEMO_FALLBACK_DEFAULT, isNetworkId } from "@/config/chains";
import { AgentEventBus } from "@/lib/agent/events";
import { runAgentWorkflow } from "@/lib/agent/orchestrator";
import type { AgentRunInput } from "@/lib/agent/types";

/**
 * POST /api/agent/run — starts one agent run and streams its events as Server-Sent Events.
 * Body: { network, objective?, demoFallback?, walletAddress? }
 * Stream: `data: <AgentEvent JSON>` per event, then `event: result` + `data: <AgentRunResult>`.
 */
/** Accepts true/false booleans and the strings "true"/"false"; anything else -> undefined. */
function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const body: Record<string, unknown> =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!isNetworkId(body.network)) {
    return Response.json({ error: "Unknown or missing `network`." }, { status: 400 });
  }
  const input: AgentRunInput = {
    network: body.network,
    objective: typeof body.objective === "string" ? body.objective.slice(0, 500) : undefined,
    demoFallback: parseBool(body.demoFallback) ?? DEMO_FALLBACK_DEFAULT,
    walletAddress: typeof body.walletAddress === "string" ? body.walletAddress.slice(0, 256) : undefined,
    workflow: body.workflow === "generic" || body.workflow === "citation-escrow" ? body.workflow : undefined,
    cheat: body.cheat === "retracted" || body.cheat === "tamper" ? body.cheat : "none",
    minSources: Number.isInteger(body.minSources) && (body.minSources as number) > 0 ? Math.min(body.minSources as number, 10) : undefined,
  };

  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bus = new AgentEventBus(runId);
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const unsubscribe = bus.on((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
      });

      send(`event: start\ndata: ${JSON.stringify({ runId, input })}\n\n`);
      runAgentWorkflow(input, bus, runId, { signal: request.signal })
        .then((result) => {
          const { events: _events, ...summary } = result;
          void _events;
          send(`event: result\ndata: ${JSON.stringify(summary)}\n\n`);
        })
        .finally(() => {
          unsubscribe();
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
