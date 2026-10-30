# Smart Procurement — baştan sona yapılacaklar (TUM Blockchain & AI Hackathon 2026)

Kim için: ekip (Efe Duygun — Cardano, Arda Şahin ve Efe Yörük — API3/EVM). Sıra bağımlılığa göre;
her adımın "bitti" kriteri yanında. Süre: Cuma akşamı → Cumartesi 15:00.

## Ürün tanımı (dondurulmuş kapsam)

Bir alıcı ajan (Procurement Officer) tek bir ihaleyi uçtan uca yürütür:

1. **RFQ yayını** — şartname hash'i Cardano preprod'a tx metadata olarak yazılır.
2. **Teklif toplama** — 3 tedarikçi ajanı HTTP ile teklif verir (fiyat, termin, uyum); teklif hash'leri tek bir metadata tx'i ile mühürlenir.
3. **Referans fiyat** — API3 Airnode imzalı fiyat verisi alınır, Base Sepolia'daki TenderRegistry sözleşmesinde imza doğrulanıp kaydedilir.
4. **Değerlendirme + award** — LLM puanlar (bütçe/referans fiyat kuralı dahil); puan tablosu hash'i ve kazanan metadata tx'i ile zincire yazılır.
5. **Escrow** — kazananın x402 teklifi ödenerek ücret Masumi V2 escrow'a kilitlenir.
6. **Teslimat + kabul** — tedarikçi sonuç hash'ini zincire koyar (MIP-004); alıcı kabul ederse ödeme açılır, etmezse iade talebi → onay → çekim.

Demo: "dürüst tedarikçi" (ödeme) ve "hileli tedarikçi" (iade) olmak üzere iki senaryo, tek butonla.

**Bitti kriterleri (Definition of Done)**
- Dashboard `/` doğrudan command center'a açılır; 4 panel (nav+cüzdan, metrikler+tetikleyici, terminal, tx tablosu).
- Her adım gerçek bir TxHash üretir; tabloda Cardanoscan / Basescan linki ve Pending → Verified geçişi.
- `NEXT_PUBLIC_DEMO_FALLBACK=true` ile ağ olmadan aynı akış gerçek, önceden kanıtlanmış hash'lerle oynar.
- `npm run typecheck && npm run lint && npm run build` temiz; Vercel'de fallback modda yayında.
- README: çalıştırma, mimari, kanıtlı tx tablosu, Prior Work bölümü. Video ≤ 2,5 dk, Devfolio gönderildi.

## Faz 0 — Kapsam ve kurulum (Cuma akşamı, 45 dk, herkes)

- [ ] 0.1 Bu dokümanı birlikte okuyup kapsamı dondur; yeni özellik önerileri "stretch" listesine gider.
- [ ] 0.2 Masumi standında Cardano track rubriğini, API3 standında beklentiyi (dAPI mi, imzalı Airnode verisi mi) teyit et; cevapları buraya yaz.
- [ ] 0.3 Cüzdanlar: preprod'da 1 alıcı + 3 tedarikçi cüzdanı üret, faucet'ten fonla (her biri ≥ 100 tADA; Masumi kilidi fiyat + teminat ister). Base Sepolia: 1 deployer + 1 ajan anahtarı, faucet ETH; aUSD faucet 1 kez (hesap başına 10, ömür boyu).
- [ ] 0.4 Secrets sadece gitignored `.env` dosyalarında: root `.env.local`, `cardano/.env`, `api3evm/.env`. Her `.env.example` güncel tutulur. Commit öncesi `git status --short | grep -i env`.
- [ ] 0.5 Herkes `git pull --rebase` ile başlar; küçük ve sık commit; `main` tek dal.

## Faz 1 — Cardano çekirdeği (Efe D., Cuma gece)

- [ ] 1.1 `cardano/src/tender/ledger.ts`: `publishRecord(kind, tenderId, payload)` → metadata'lı tx (sabit label, küçük JSON: kind, tenderId, sha256), `makeClient` ile imza, txHash döner. CLI: `npm run tender-record -- rfq <spec.json>`. Bitti: Cardanoscan'de metadata görünür.
- [ ] 1.2 Tedarikçi ajanı `cardano/src/supplier/server.ts` (veya CF `x402-cardano-demo/masumi` ajanının yeniden patch'i): `GET /bid?rfq=<id>` imzalı teklif; `POST /x402/start_job/ada` Masumi escrow offer; iş alınınca sonuç üretip hash'ini zincire yazar (ResultSubmitted). Env: `SUPPLIER_NAME`, `SUPPLIER_MNEMONIC`, `SUPPLIER_PRICE_LOVELACE`, `SUPPLIER_CHEAT=none|no-delivery|bad-delivery`. Üç instance, üç port. Bitti: 3 ajan ayakta, teklif + offer dönüyor.
- [ ] 1.3 Alıcı ajan `cardano/src/buyer/tender.ts` + `cli/tender.ts`: RFQ yayınla → teklifleri topla → mühürle → referans fiyat (Faz 2 köprüsü; yoksa "skipped") → değerlendir → award yayınla → `runHirerJob` ile kilit → teslimat izle → kabul/iade. Her olay `emit(TAG, msg, txHash)` ile stdout + `.local/tender-events.jsonl`. Kullanım: `npm run tender -- --spec "..." --budget <lovelace> --suppliers url1,url2,url3`.
- [ ] 1.4 Değerlendirici `cardano/src/hirer/verdict.ts`: `llmBidScoring` ve `llmAcceptance` (Anthropic SDK, `claude-opus-5-5`, ANTHROPIC_API_KEY); anahtar yoksa deterministik kural seti (en düşük uyumlu fiyat; teslimat hash'i şartname ile eşleşiyor mu). Referans fiyat kuralı: bütçeyi/referansı %X aşan teklif elenir.
- [ ] 1.5 Kabul verdict'i gerçek bir kontrol yapsın: teslimat JSON'unun şartnamedeki zorunlu alanları taşıması + hash eşleşmesi. Hileli tedarikçide bunlar bozuk → iade yolu.
- [ ] 1.6 Tam akışı iki kez çalıştır (dürüst, hileli). Hash'leri `src/config/cardano-proofs.ts` (tag `citation-escrow-final`'dan geri al) ve `cardano/README.md` tablosuna yaz. Bitti: 2 senaryo × tüm adımlar gerçek hash.
- [ ] 1.7 Dayanıklılık: Blockfrost 429/timeout'ta 1 kez bekleyip tekrar; x402 settle için `payOnceWithRetry`; tedarikçi cevap vermezse teklifi atla; LLM timeout → deterministik kural.

## Faz 2 — API3 / Base Sepolia (Arda + Efe Y., Cuma gece)

- [ ] 2.1 Oracle rolünü sabitle: Nodary Airnode v2 imzalı fiyat (ör. ADA/USD veya seçilen feed), `api3evm/src/fetch-response.ts` ile x402 (aUSD) ödenerek alınır; yanıt `.cache/`'e yazılır, tight loop yok.
- [ ] 2.2 `api3evm/contracts/TenderRegistry.sol` (`NodaryPriceConsumer` türevi): `recordReferencePrice(tenderId, timestamp, data, signature)` imza doğrular, `ReferencePriceRecorded(tenderId, price, ts)` yayar; `recordAward(tenderId, winner, bidsHash, scoresHash, cardanoLockTx)` → `Awarded` event. Forge testleri fixture ile (mevcut `NodaryPriceConsumer.t.sol` kalıbı). Bitti: `forge test` yeşil.
- [ ] 2.3 `script/DeployTenderRegistry.s.sol` ile Base Sepolia'ya deploy; adres `TENDER_REGISTRY_ADDRESS` olarak `cardano/.env` ve root `.env.local`'a; Basescan'de doğrulanmış kaynak (verify) varsa artı puan.
- [ ] 2.4 TS köprüsü `cardano/src/evm/tender-registry.ts` (viem 2.57.3): `recordReferencePrice` ve `recordAward` çağırır, txHash + `https://sepolia.basescan.org/tx/` linki döner; env yoksa `{skipped}`. Alıcı ajanın 3. ve 4. adımına bağlanır.
- [ ] 2.5 Fallback: imzalı yanıt fixture'ı (gerçek Airnode imzası) + önceden kanıtlanmış Base Sepolia tx hash'i `src/config/chains.ts` EVM girişine (chainId 84532, explorer Basescan).
- [ ] 2.6 Dashboard adapter `src/lib/blockchain/api3-evm.ts`: `readOracle()` canlı (Airnode yanıtı veya `Api3ReaderProxyV1.read`), `getTransactionStatus()` viem receipt. Metrik kartında "Reference price (API3)".

## Faz 3 — Dashboard (Efe D. + boşta olan, Cumartesi sabah)

- [ ] 3.1 `src/lib/agent/workflows/smart-procurement.ts`: adımlar rfq → bids → oracle → evaluate → award → escrow → delivery → settle → verify. `runCardano` kalıbını tag'den geri al: `node --env-file-if-exists=.env src/cli/tender.ts` spawn, `[TAG] msg` satırlarını SSE'ye akıt, her txHash için tabloya satır (`chain: cardano|evm`). Orchestrator `workflow==="smart-procurement"` seçer.
- [ ] 3.2 `action-panel.tsx`: şartname textarea, bütçe, tedarikçi sayısı (3), "Hileli tedarikçi ekle" anahtarı, "Run tender" butonu. `command-center.tsx` state'i `start()`'a geçirir; `api/agent/run/route.ts` parse eder.
- [ ] 3.3 Metrik kartları: escrow bakiyesi (Blockfrost canlı), API3 referans fiyatı, ihale sayacı (awarded/refunded). Terminal seviyelerine `BID` ve `EVAL` eklenir (`types.ts`, `format.ts`, `agent-terminal.tsx`).
- [ ] 3.4 `activity-table.tsx`: iki explorer (Cardanoscan, Basescan), Pending → Verified geçişi adaptörlerin `getTransactionStatus` polling'i ile (Cardano: Blockfrost `/txs/{hash}` 404 → pending).
- [ ] 3.5 Üst bar: proje adı, rozetler "Cardano Preprod" + "API3 Oracle Active", MeshJS `CardanoWallet` ile Connect Wallet (Eternl/Lace, sadece adres ve bakiye gösterir).
- [ ] 3.6 Demo fallback: `NEXT_PUBLIC_DEMO_FALLBACK=true` ile aynı adım dizisi, gerçek hash'ler, 2 sn gecikme; Wi-Fi kapalı test. Canlı modda RPC hatası da fallback'e düşer, UI çökmez (toast).
- [ ] 3.7 `typecheck`, `lint`, `build` temiz; Vercel'e env'lerle deploy. Not: canlı ihale yerel laptopta çalışan `cardano/` süreçlerine bağlı; Vercel sadece fallback modu gösterir. Standda yerel sunucu + Vercel yedek.

## Faz 4 — Masumi / Sokosumi (stretch, Cardano ekosistem puanı)

- [ ] 4.1 Sokosumi Vendor/Coworker'ı "Smart Procurement Supplier" olarak yeniden adlandır; TUM Workspace onayını organizatörden iste (rol: member, kendimiz onaylayamıyoruz).
- [ ] 4.2 Onay gelirse ilk Task'ı aç, Task ID'yi RFQ kaydına yaz; Masumi registry'de ajan görünümü ekran görüntüsü README'ye.

## Faz 5 — Sertleştirme ve prova (Cumartesi 10:00–12:30)

- [ ] 5.1 Üç tam canlı tur (2 dürüst, 1 hileli); süreleri ölç. Masumi kilit → teslim → iade zinciri 5 tx (~3–5 dk); demoda dürüst yol canlı, iade yolu önceden kaydedilmiş gerçek hash'lerle oynanır ya da jüri gelmeden arka planda başlatılır.
- [ ] 5.2 Hata senaryoları: Blockfrost limit, tedarikçi kapalı, LLM anahtarsız, cüzdanda yetersiz bakiye → hepsi okunur hata + fallback, çökme yok.
- [ ] 5.3 Repo hijyeni: README (çalıştırma, mimari şeması, kanıt tablosu, Prior Work), `.env.example` tam, `contracts/NOTICE.md` ve AirnodeHub lisans dosyaları yerinde, `.env` sızıntısı yok (`git log -p | grep -i mnemonic` boş).
- [ ] 5.4 Stand kurulumu: laptop + ekran, dashboard tam ekran, terminal paneli açık, explorer sekmeleri hazır; telefon hotspot yedek.

## Faz 6 — Teslim (Cumartesi 12:30–14:30)

- [ ] 6.1 Video ≤ 2,5 dk: problem (20 sn) → canlı akış (90 sn) → explorer kanıtı (30 sn) → mimari (10 sn).
- [ ] 6.2 Devfolio: açıklama, sponsor track'ler (Cardano, API3), repo linki, Vercel linki, tx tablosu.
- [ ] 6.3 Pitch metni 3 dk; soru-cevap: "neden Cardano/eUTXO", "neden API3 imzalı veri", "iade nasıl zorlanıyor".
- [ ] 6.4 14:30–15:00 tampon; son dakika kod yok.

## Zaman planı

| Zaman | İş |
| --- | --- |
| Cuma 19:00–20:00 | Faz 0 |
| Cuma 20:00–02:00 | Faz 1.1–1.5 (Efe D.) ‖ Faz 2.1–2.4 (Arda, Efe Y.) |
| Cumartesi 08:00–10:00 | Faz 1.6–1.7, 2.5–2.6, 3.1–3.4 |
| Cumartesi 10:00–12:30 | Faz 3.5–3.7, Faz 5 |
| Cumartesi 12:30–14:30 | Faz 6 |

## Açık engeller (fikirden bağımsız)

- Alıcı/tedarikçi mnemonic'leri ve EVM anahtarları henüz diskte değil (Faz 0.3).
- LLM anahtarı yok; yoksa deterministik kurallar çalışır, pitch'te "AI evaluator" iddiası zayıflar.
- Sokosumi Workspace onayı organizatörde.
