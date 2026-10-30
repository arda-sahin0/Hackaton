/**
 * LLM orchestration layer. One tiny surface (`complete`) so the workflow never depends on a
 * vendor API shape. Resolution:
 *   demoFallback ON (nav toggle / NEXT_PUBLIC_DEMO_FALLBACK) -> deterministic mock, NO network at all
 *   AGENT_LLM_MODE=mock             -> deterministic mock
 *   AGENT_LLM_MODE=live             -> Anthropic SDK (needs ANTHROPIC_API_KEY)
 *   unset / auto                    -> live when ANTHROPIC_API_KEY is set, else mock
 * Live calls run with a short timeout (ANTHROPIC_TIMEOUT_MS, default 10 s) and NO retries, so a
 * dead conference Wi-Fi costs at most one timeout per step; every live failure (timeout, auth,
 * rate limit, refusal) degrades to the mock and the terminal shows which engine answered.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest } from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_TIMEOUT_MS = 10_000;
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

function resolveMode(): "live" | "mock" {
  const mode = (process.env.AGENT_LLM_MODE ?? "auto").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "live") return "live";
  return process.env.ANTHROPIC_API_KEY ? "live" : "mock";
}

function mockAnswer(req: LlmRequest): string {
  if (req.task === "decide") {
    return JSON.stringify({
      proceed: true,
      action: "bounded-payment",
      amount: "",
      to: "",
      rationale:
        "Balance covers the action and the oracle value is within tolerance; executing one bounded payment.",
    });
  }
  return [
    "1. Confirm wallet funds and the active network.",
    "2. Read the oracle / data feed and sanity-check it.",
    "3. Decide a bounded amount within policy.",
    "4. Sign, broadcast, then confirm the hash on the explorer.",
  ].join(" ");
}

export interface LlmClientOptions {
  /** When true the engine never touches the network (directive §5.3). */
  demoFallback?: boolean;
}

export function createMockLlmClient(model = "deterministic"): LlmClient {
  return {
    mode: "mock",
    model,
    async complete(req) {
      return mockAnswer(req);
    },
  };
}

export function createLlmClient(options: LlmClientOptions = {}): LlmClient {
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  if (options.demoFallback) return createMockLlmClient("deterministic · demo fallback");
  if (resolveMode() === "mock") return createMockLlmClient();

  const timeoutRaw = Number(process.env.ANTHROPIC_TIMEOUT_MS);
  const timeout = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS;
  // TS SDK timeout is in milliseconds; maxRetries 0 keeps a dead network to ONE timeout per step.
  const client = new Anthropic({ timeout, maxRetries: 0 });
  const effort = (process.env.ANTHROPIC_EFFORT as Effort | undefined) ?? "low";
  const mock = createMockLlmClient(`${model} unreachable → deterministic`);

  return {
    mode: "live",
    model,
    async complete(req) {
      try {
        const response = await client.beta.messages.create({
          model,
          max_tokens: req.maxTokens ?? 1024,
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
          output_config: { effort },
          // Server-side refusal fallback: a declined request is re-run on a fallback model
          // inside the same call, so the demo never stalls on a policy decline.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        if (response.stop_reason === "refusal") return mock.complete(req);
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return text.length > 0 ? text : mock.complete(req);
      } catch (error) {
        // Most specific first; every branch degrades to the mock (demo safety).
        if (error instanceof Anthropic.AuthenticationError) {
          console.warn("[llm] invalid ANTHROPIC_API_KEY — using mock reasoning");
        } else if (error instanceof Anthropic.RateLimitError) {
          console.warn("[llm] rate limited — using mock reasoning");
        } else if (error instanceof Anthropic.APIConnectionTimeoutError) {
          console.warn(`[llm] request timed out after ${timeout}ms — using mock reasoning`);
        } else if (error instanceof Anthropic.APIConnectionError) {
          console.warn("[llm] connection error — using mock reasoning");
        } else if (error instanceof Anthropic.APIError) {
          console.warn(`[llm] API error ${error.status}: ${error.message} — using mock reasoning`);
        } else {
          console.warn("[llm] unexpected error — using mock reasoning", error);
        }
        return mock.complete(req);
      }
    },
  };
}
