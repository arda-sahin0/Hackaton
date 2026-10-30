/**
 * Cardano preprod transactions this team broadcast and verified (cardano/README.md). The demo
 * fallback replays them when a live step cannot run (directive §5.3); every one is real.
 */
export const CARDANO_PROOFS = {
  /** Paid GET /verify over Cardano x402, 1 tADA — valid DOI 10.1038/nature14539. */
  verifyValid: "48eaf21bb25e9831206537ff78939e84400015168e9c93e2a8227cbfe029a1b5",
  /** Paid GET /verify over Cardano x402, 1 tADA — retracted DOI 10.1038/nature00870. */
  verifyRetracted: "af8f5f3c0057f5cb8cd17bfd93e43e68b70681ddc98368c5d860c4948aa5d919",
  /** Masumi escrow: the hirer's ADA locked for a job. */
  escrowLock: "b69d62f758bc7808e6abd6a54c4455dd20a3d917c955b6568111b780d4dce0ef",
  /** Hirer requests a refund (escrow → Disputed). */
  refundRequest: "f19d7cddbbcb713284f369f1f9d62d2c65d42ee670409856ff8162cf009f69a0",
  /** Seller authorizes the refund. */
  refundAuthorize: "de100c97c324eb28a7309b92a4197488f19b8aed87e3068c187709f004dc5860",
  /** Hirer withdraws the refund (escrow closed). */
  refundWithdraw: "6125026f5dc002f8923aca88875ecf0b88b9fa5a20ec8fcb76ed93fed319281e",
} as const;
