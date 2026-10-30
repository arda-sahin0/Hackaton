import { DEMO_FALLBACK_DEFAULT, isNetworkId } from "@/config/chains";
import { getAdapter } from "@/lib/blockchain";

/**
 * GET /api/state?network=<id>&demo=<true|false> — the metric cards' initial data
 * (wallet balance + oracle reading) through the same adapter the agent uses.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get("network");
  if (!isNetworkId(network)) {
    return Response.json({ error: "Unknown or missing `network`." }, { status: 400 });
  }
  const demoParam = url.searchParams.get("demo");
  const demoFallback = demoParam === null ? DEMO_FALLBACK_DEFAULT : demoParam !== "false";
  const degraded: string[] = [];
  const adapter = getAdapter(network, {
    demoFallback,
    onFallback: ({ operation, reason }) => {
      if (reason !== "demo fallback enabled") degraded.push(`${operation}: ${reason}`);
    },
  });
  const [balance, oracle] = await Promise.all([adapter.getBalance(), adapter.readOracle()]);
  return Response.json({ network, demoFallback, balance, oracle, degraded });
}
