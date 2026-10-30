/**
 * Demo-safety wrapper (directive §5.3). Every adapter call goes through `withDemoFallback`:
 *   - demoFallback ON  -> never touch the network; wait `delayMs` (feels real) and return the
 *                         simulated value.
 *   - demoFallback OFF -> run the live call with a timeout; on timeout / RPC error / SDK not yet
 *                         injected, degrade to the simulated value instead of throwing.
 * The UI therefore never crashes mid-pitch; the terminal just logs the degradation.
 */

export const DEFAULT_FALLBACK_DELAY_MS = 2000;
export const DEFAULT_LIVE_TIMEOUT_MS = 8000;

/** Thrown by adapter live paths that still await their sponsor SDK (pre-kickoff). */
export class NotWiredError extends Error {
  constructor(what: string) {
    super(`${what} is not wired yet — inject the sponsor SDK (see the adapter file header)`);
    this.name = "NotWiredError";
  }
}

export interface WithFallbackOptions {
  demoFallback: boolean;
  operation: string;
  timeoutMs?: number;
  delayMs?: number;
  onFallback?: (reason: string) => void;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function withDemoFallback<T>(
  live: () => Promise<T>,
  simulated: () => T | Promise<T>,
  opts: WithFallbackOptions,
): Promise<T> {
  const delayMs = opts.delayMs ?? DEFAULT_FALLBACK_DELAY_MS;
  if (opts.demoFallback) {
    opts.onFallback?.("demo fallback enabled");
    await sleep(delayMs);
    return simulated();
  }
  try {
    return await withTimeout(live(), opts.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS, opts.operation);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    opts.onFallback?.(reason);
    await sleep(delayMs);
    return simulated();
  }
}

/** Small deterministic-looking jitter so simulated metrics move between runs. */
export function jitter(base: number, spreadPct = 0.004): number {
  const r = (Math.random() * 2 - 1) * spreadPct;
  return base * (1 + r);
}
