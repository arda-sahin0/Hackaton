/**
 * The refund path of the Masumi V2 escrow — what the hirer agent does when the
 * delivered report fails verification. Proven on preprod on 2026-10-30
 * (request f19d7cdd…, authorize de100c97…, withdraw 6125026f…).
 *
 *   requestRefund    buyer,  redeemer 1: ResultSubmitted -> Disputed, FundsLocked -> RefundRequested
 *   authorizeRefund  seller, redeemer 6: -> RefundAuthorized (result hash cleared)
 *   withdrawRefund   buyer,  redeemer 3: RefundAuthorized -> funds back to the buyer, escrow closed
 *
 * Each transaction is evaluated during build(), so a validator failure throws
 * before anything is signed or submitted.
 */
import { Address, Assets, Data, InlineDatum, KeyHash, TransactionHash, type TransactionMetadatum } from "@evolution-sdk/evolution";
import {
  ceilToSlotMs, chainTimeMs, COOLDOWN_MS, paymentScript, REDEEMER, slotStartMs, STATE, stateName, withDatumFields,
  type Blockfrost, type CardanoClient, type Escrow,
} from "./escrow.ts";

/** Masumi adds the same margin on top of every cooldown. */
const MARGIN_MS = 1_000n;
/** Registry NFTs (agent listings) must never be spent as fee inputs. */
const REGISTRY_POLICY_ID = "67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b";

export interface PartyConfig { bf: Blockfrost; client: CardanoClient; address: string; keyHash: string }
export interface ActionResult { txHash: string; newState: string }

export function createParty(cfg: PartyConfig) {
  const { client, bf } = cfg;
  const me = Address.fromBech32(cfg.address);

  /** Fee and collateral inputs; never a registry NFT or a reference script. */
  async function feeInputs() {
    const utxos = (await client.getWalletUtxos()).filter(
      u => u.scriptRef === undefined && !Assets.getUnits(u.assets).some(unit => unit.startsWith(REGISTRY_POLICY_ID)),
    );
    const ada = utxos.reduce((sum, u) => sum + Assets.lovelaceOf(u.assets), 0n);
    if (ada < 8_000_000n) throw new Error(`${cfg.address} holds ${Number(ada) / 1e6} tADA; it needs ~8 tADA for fee + collateral.`);
    return utxos;
  }

  async function signSubmitAwait(built: { sign(): Promise<{ submit(): Promise<TransactionHash.TransactionHash> }> }, onSubmitted?: (txHash: string) => void) {
    const hash = await (await built.sign()).submit();
    onSubmitted?.(TransactionHash.toHex(hash));
    await client.awaitTx(hash, 5_000, 300_000);
    return TransactionHash.toHex(hash);
  }

  const note = (parts: string[]): TransactionMetadatum.TransactionMetadatum =>
    new Map([["msg", parts.map(p => p.slice(0, 64))]]);

  /**
   * Buyer: SetRefundRequested (ak:350-402). Continuing output: seller cooldown 0,
   * buyer cooldown >= upper + cooldown, state Disputed (a result exists) or
   * RefundRequested (no result). Upper bound's slot start must be before
   * unlock_time; lower bound >= the buyer's cooldown.
   */
  async function requestRefund(e: Escrow, reason: string[] = [], onSubmitted?: (txHash: string) => void): Promise<ActionResult> {
    const d = e.datum;
    if (d.buyer.payment.hash !== cfg.keyHash) throw new Error("This wallet is not the escrow's buyer.");
    if (![STATE.FundsLocked, STATE.ResultSubmitted, STATE.Disputed].includes(d.state as never)) {
      throw new Error(`State ${stateName(d.state)} cannot request a refund.`);
    }
    const now = await chainTimeMs(bf);
    const earliest = ceilToSlotMs(d.buyerCooldownTime);
    const from = now - 60_000n > earliest ? now - 60_000n : earliest;
    const to = [now + 300_000n, d.unlockTime - 120_000n].reduce((a, b) => (a < b ? a : b));
    if (to <= now + 30_000n) throw new Error("Too late: unlock_time is under ~2.5 min away, the seller can collect.");
    if (from >= to) throw new Error("Buyer cooldown still active; retry in a few minutes.");
    const next = d.resultHash === "" ? STATE.RefundRequested : STATE.Disputed;
    const datum = withDatumFields(e.utxo, {
      16: Data.int(0n),
      17: Data.int(slotStartMs(to) + COOLDOWN_MS + MARGIN_MS),
      18: Data.constr(next, []),
    });
    const built = await client.newTx()
      .collectFrom({ inputs: [e.utxo], redeemer: REDEEMER.setRefundRequested })
      .attachScript({ script: paymentScript() })
      .payToAddress({ address: e.utxo.address, assets: e.utxo.assets, autoMinUtxo: true, datum: new InlineDatum.InlineDatum({ data: datum }) })
      .addSigner({ keyHash: KeyHash.fromHex(cfg.keyHash) })
      .attachMetadata({ label: 674n, metadata: note(["Masumi", "RequestRefund", ...reason]) })
      .setValidity({ from, to })
      .build({ changeAddress: me, availableUtxos: await feeInputs() });
    return { txHash: await signSubmitAwait(built, onSubmitted), newState: stateName(next) };
  }

  /**
   * Seller: AuthorizeRefund (ak:702-760). Result hash cleared, seller cooldown
   * >= upper + cooldown, buyer cooldown 0, state RefundAuthorized. No deadline.
   */
  async function authorizeRefund(e: Escrow, onSubmitted?: (txHash: string) => void): Promise<ActionResult> {
    const d = e.datum;
    if (d.seller.payment.hash !== cfg.keyHash) throw new Error("This wallet is not the escrow's seller.");
    if (![STATE.FundsLocked, STATE.ResultSubmitted, STATE.RefundRequested, STATE.Disputed].includes(d.state as never)) {
      throw new Error(`State ${stateName(d.state)} cannot authorize a refund.`);
    }
    const now = await chainTimeMs(bf);
    const earliest = ceilToSlotMs(d.sellerCooldownTime);
    const from = now - 60_000n > earliest ? now - 60_000n : earliest;
    const to = now + 300_000n;
    if (from >= to) throw new Error("Seller cooldown still active; retry in a few minutes.");
    const datum = withDatumFields(e.utxo, {
      11: Data.bytearray(""),
      16: Data.int(slotStartMs(to) + COOLDOWN_MS + MARGIN_MS),
      17: Data.int(0n),
      18: Data.constr(STATE.RefundAuthorized, []),
    });
    const built = await client.newTx()
      .collectFrom({ inputs: [e.utxo], redeemer: REDEEMER.authorizeRefund })
      .attachScript({ script: paymentScript() })
      .payToAddress({ address: e.utxo.address, assets: e.utxo.assets, autoMinUtxo: true, datum: new InlineDatum.InlineDatum({ data: datum }) })
      .addSigner({ keyHash: KeyHash.fromHex(cfg.keyHash) })
      .attachMetadata({ label: 674n, metadata: note(["Masumi", "AuthorizeRefund"]) })
      .setValidity({ from, to })
      .build({ changeAddress: me, availableUtxos: await feeInputs() });
    return { txHash: await signSubmitAwait(built, onSubmitted), newState: "RefundAuthorized" };
  }

  /**
   * Buyer: WithdrawRefund from RefundAuthorized (ak:407-458): no time gate,
   * finite upper bound, no continuing escrow output; the value returns as change.
   */
  async function withdrawRefund(e: Escrow, onSubmitted?: (txHash: string) => void): Promise<ActionResult> {
    const d = e.datum;
    if (d.buyer.payment.hash !== cfg.keyHash) throw new Error("This wallet is not the escrow's buyer.");
    if (d.state !== STATE.RefundAuthorized) throw new Error(`State is ${stateName(d.state)}; the seller must authorize the refund first.`);
    if (d.buyerReturnAddress) throw new Error("buyer_return_address is set; the tagged return output is not implemented.");
    const now = await chainTimeMs(bf);
    const built = await client.newTx()
      .collectFrom({ inputs: [e.utxo], redeemer: REDEEMER.withdrawRefund })
      .attachScript({ script: paymentScript() })
      .addSigner({ keyHash: KeyHash.fromHex(cfg.keyHash) })
      .setValidity({ from: now - 60_000n, to: now + 300_000n })
      .build({ changeAddress: me, availableUtxos: await feeInputs() });
    return { txHash: await signSubmitAwait(built, onSubmitted), newState: "Refunded" };
  }

  return { requestRefund, authorizeRefund, withdrawRefund };
}
