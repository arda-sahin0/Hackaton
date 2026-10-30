/**
 * "Verify a citation" as a paid service over Cardano x402 (preprod).
 *
 *   GET /verify?doi=10.xxxx/yyyy   402 Payment Required → pay VERIFY_PRICE_LOVELACE (default 1 tADA)
 *                                  → signed OpenAlex proof + verdict (valid | retracted)
 *   GET /health                    free
 *
 * Any agent can call it; the research agent uses it to pre-check its sources.
 * Payments go straight to VERIFY_PAY_TO (no escrow): a lookup is delivered at once.
 * The hosted Cardano Foundation facilitator verifies and broadcasts the payment.
 */
import express from "express";
import { HTTPFacilitatorClient, x402ResourceServer, type RoutesConfig } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import { ExactCardanoScheme } from "@x402/cardano/exact/server";
import { NETWORK, paymentKeyHash } from "../escrow.ts";
import { getCitationProof, hasFixture, parseDoi, ProofError, proofMode } from "./proof.ts";

const env = process.env;
const PORT = Number(env.VERIFY_PORT ?? 4030);
const PRICE_LOVELACE = env.VERIFY_PRICE_LOVELACE?.trim() || "1000000";
const FACILITATOR_URL = env.FACILITATOR_URL?.trim() || "https://x402.preprod.dev.ecosyseng.cf-deployments.org";
const PAY_TO = env.VERIFY_PAY_TO?.trim() ?? "";
if (!PAY_TO.startsWith("addr_test1")) throw new Error("Set VERIFY_PAY_TO in cardano/.env to the preprod address that receives verification fees.");
paymentKeyHash(PAY_TO); // throws for a script address

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ExactCardanoScheme());
// Protocol rejections return normally, so log the verifier's and settler's reasons here.
resourceServer.onAfterVerify(async ({ result }) => {
  if (!result.isValid) console.warn(`[verify-payment] ${result.invalidReason ?? "invalid"}${result.invalidMessage ? `: ${result.invalidMessage}` : ""}`);
});
resourceServer.onVerifyFailure(async ({ error }) => { console.warn(`[verify-payment] ${error.message}`); });
resourceServer.onSettleFailure(async ({ error }) => { console.warn(`[settle] ${error.message}`); });

const routes: RoutesConfig = {
  "GET /verify": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAY_TO,
      price: { amount: PRICE_LOVELACE, asset: "lovelace" },
      maxTimeoutSeconds: 600,
      extra: { assetTransferMethod: "default", areFeesSponsored: false },
    },
    description: "Signed OpenAlex proof that a cited DOI exists and is not retracted (API3 AirnodeHub)",
    mimeType: "application/json",
    settlementFailedResponseBody: (_context: unknown, result: { errorReason?: string; errorMessage?: string }) => {
      console.warn(`[settle] failed: ${result.errorReason ?? "unknown"}${result.errorMessage ? ` — ${result.errorMessage}` : ""}`);
      return { contentType: "application/json", body: { error: result.errorReason ?? "settlement_failed", message: result.errorMessage } };
    },
  },
};

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: NETWORK, price: { lovelace: PRICE_LOVELACE }, payTo: PAY_TO, proofs: proofMode() });
});

// Reject bad input before the payment gate, so nobody pays for an error.
app.get("/verify", (req, res, next) => {
  try {
    const doi = parseDoi(req.query.doi);
    if (proofMode() === "fixture" && !hasFixture(doi)) throw new ProofError(404, `No saved signed response for ${doi} (fixture mode).`);
    res.locals.doi = doi;
    next();
  } catch (error) {
    const status = error instanceof ProofError ? error.status : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(paymentMiddleware(routes, resourceServer));

app.get("/verify", async (_req, res) => {
  const doi = res.locals.doi as string;
  try {
    const result = await getCitationProof(doi);
    console.log(`[verify] ${doi} → ${result.verdict} (${result.source})`);
    res.json(result);
  } catch (error) {
    // A non-2xx answer is not settled, so the caller is not charged for a failed lookup.
    const status = error instanceof ProofError ? error.status : 502;
    console.warn(`[verify] ${doi} failed: ${error instanceof Error ? error.message : String(error)}`);
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Citation verifier on http://localhost:${PORT}/verify?doi=…`);
  console.log(`  price ${Number(PRICE_LOVELACE) / 1e6} tADA → ${PAY_TO}`);
  console.log(`  facilitator ${FACILITATOR_URL}`);
  console.log(`  proofs: ${proofMode()}`);
});
