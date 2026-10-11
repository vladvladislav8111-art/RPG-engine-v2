# EC-06 — real Google staging exercise and physical custody source audit

**VERIFIED TEST FILES ONLY; NOT A PRODUCTION KV ECONOMY.**

## Independent Google test assets, 2026-10-11

- [Synthetic EC06 Sheet](https://docs.google.com/spreadsheets/d/140f4FBzM6BWUiuEoJskzcWwfJ0s1U_bHyiwyBORvxR8/edit): EC06_STAGE!A1 holds one complete JSON projection image.
- [Synthetic EC06 archive Doc](https://docs.google.com/document/d/1mE6FPqNew45yEw67suDbNzEc6FNB8fkSDT-zLIYalEQ/edit): append-only EC06_DOC_IMAGE_V1 image snapshots.
- These were created independently using the Google Drive connector. The connection did not support writing files directly into the intended RPG V2 folder at creation, so the files were created without a parent parameter.
- Neither file ID equals configured TEMP_RUNTIME nor LIVE_TRANSACTION_ARCHIVE. They contain ONLY fabricated fixture accounts, a fabricated shipment and receipts. No real copper/item/canon truth.

## Actual staged test sequence (Google connector, real Google APIs)

1. Initialize both assets at revision.fixture.genesis_0 with fixture wholesaler 180 copper, fixture bookbinder 100 copper and one 3-unit paper lot. Independent readback matched both images.
2. Stage physical sale TX tx.fixture.google_real_001, revision.fixture.test_transaction_1: 20 copper transferred from bookbinder to wholesaler, 1 physical unit split to one new distinct bookbinder-held item ID. Update ONLY the Sheets projection. Readback: Sheet at TX 1, Doc still at genesis, 280 total copper and 3 total paper units.
3. Attempt a Google Docs update with requiredRevisionId EC06-invalid-stale-revision; the real Docs API returned 400 invalid revision, and no invalid-stale-test marker appeared.
4. Re-read the archive's actual current Docs revision, append exactly one new EC06_DOC_IMAGE_V1 image for TX 1 using requiredRevisionId. This is a recovery of the missing Doc target, NOT a replay of the Sheets money or physical item transfer.
5. Re-read both assets. Their projection payloads (ignoring target-specific receipt keys) matched exactly at TX 1. The Doc contains genesis plus ONE TX 1 image, the Sheet retains ONE committed image; both have target-specific TX receipt and a SHA-256 journal-bound digest. Final synthetic holdings: wholesaler 200, bookbinder 80, 2 original paper units plus 1 split unit, total 280 copper/3 units.

The specific digest in staged receipts is the SHA-256 digest of a matching separately constructed synthetic EC06_JOURNAL_V1 manifest. This demonstration verified real Google writes/readbacks and Docs native revision guard. It **did not execute the new Deno REST implementation against Google**, has no real primary KV economic receipt and did not establish cross-service atomicity or prove the absence of competing Sheet editors. Do not represent it as production wallet safety.

## Actual committed TEMP_RUNTIME migration snapshot (READ-ONLY)

Two independent Google Drive source reads agreed and current RPG Runtime Bridge returned save V2-S0721 at Day63 18:21. The CURRENT tables contain:

- PLAYER_RESOURCES: exactly ONE existing Money row, player.shura = 677 copper. No sourced NPC wallet/bank balances are present in that table; this is NOT proof that NPC wealth is zero.
- INVENTORY_CURRENT: 92 distinct tracked Item IDs, all unique; 79 have exact Custodian label "Shura", 13 have non-"Shura" labels. These include the Vesha pool NPC source, a named artisan source, one transient custodian and at least one display description indicating an item **owned by Shura but temporarily held by Herna**.
- Real source headers include Item ID, Qty, Location/container, Custodian, Version, Template ID. Custodian is a PHYSICAL HOLDER field; its display string must not silently be treated as a legal owner ID or as an economic bank account.
- No changes were made to current Money, inventory, WORLD_CLOCKS, opportunities, NPCs or the time.

The NEW read-only src/economic_custody_source_audit.ts has explicit independently verified aliases for physical holders AND independently verified ownership/rights for each physical item. A bailment remains owned by its actual lawful owner despite custody by an artisan. Unknown alias/owner/right, duplicate ID or phantom item blocks migration. It does NOT automatically resolve all 92 source items or generate accounts, sales or money.

## Remaining non-negotiable blockers

1. Independently prove real NPC business cash funding, actor/owner identity and legal retail/wholesale rights. 67 named existing Selarin NPCs do not mean 67 approved bank balances, and market volume may be high without creating cash.
2. Approve one authoritative primary economic store and one-time migration cutover from current Google Sheets. Do not keep simultaneously writable economic copies.
3. Provision and audit a truly exclusive projection writer/fencing scheme that controls all writers; native Sheets values.update does not have a CAS precondition even if the readback is correct.
4. Run the actual new Deno service account HTTP staging transport with user-authorized testing deployment and real isolated target IDs, and test ambiguous failures/concurrent writes.
5. Replace large whole-image projection with indexed bounded delta/idempotent outbox workers for the heavy independent NPC-to-NPC trading flow; never simulate the whole city each second.
6. Integrate sequential stacked draft PRs #27-32 and other reviewed city modules; require full CI + manual owner release and actual runtime health/save regression check.

**No live economic migration or production deployment was performed.**
