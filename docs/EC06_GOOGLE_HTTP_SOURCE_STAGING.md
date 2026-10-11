# EC-06 — Google source probe and isolated Google HTTP staging

**DRAFT / STAGING.** Stacked PR #31 atop #30, #29, #28 and #27. No production runtime commit, inventory change, new NPC funds or game-time advancement.

## Starting source and deployment status
Runtime Bridge health is OK, engine 2.12.1-specialization-domain-2026-10-11, committed V2-S0721 Day63 18:21 Selarin Copy Market. The latest economic feature PRs remain unmerged and do not run in production. TEMP_RUNTIME CONTROL labels structured Google Sheets as authoritative current. PLAYER_RESOURCES Money for Shura is 677c. INVENTORY_CURRENT is sole current physical custody table. There is no confirmed unified NPC funds/escrow owner, so UNKNOWN cash is not 0 or spendable.

## Authenticated read-only source probe

src/economic_google_source_probe.ts adds probeConfiguredEconomicCurrentReadOnly based on the EXISTING service-account-authenticated Sheets batchGet for the configured TEMP_RUNTIME_ID. It reads CONTROL save, PLAYER_RESOURCES money and INVENTORY_CURRENT physical instances twice and refuses a changing save, out-of-band edit even with same save, duplicate Item ID, invalid source money, invalid custody/version or missing player cash. Emits OBSERVED_NOT_MIGRATED, SHA-256 fingerprint and real observed rows, but no account/actor authorization, new cash or goods. Never writes Drive or KV. Its source references are observations, not independent legal proof, signed work or sale rights.

## Actual isolated HTTP staging transport

src/economic_google_http_staging.ts uses existing server-side service-account OAuth for real Google Sheets and Docs requests. It refuses the production TEMP_RUNTIME and LIVE_TRANSACTION_ARCHIVE IDs and requires separate, explicitly provisioned staging Sheet and Doc.

- Staging spreadsheet: existing EC06_STAGE!A1 JSON projection image; one-cell Sheets values.update writes image including revision/data/receipt; explicit readback required.
- Staging document: existing EC06_DOC_IMAGE_V1 JSON line, uses Docs documents.batchUpdate with requiredRevisionId, appends the next image and reads back.
- Both validate scope, source revision, expected image, and require a privileged ExclusiveProjectionWriterFence to be asserted before and after each write.
- No live routes import this module and there is no default writer permit.

**Blocking nuance:** Sheets values.update does not support a native compare-and-swap predicate. A separate read before write is NOT sufficient to protect a production financial ledger from concurrent editors. The exclusive-fence interface is not implemented by this PR. Docs writeControl applies per document only and cannot make Sheets+Docs jointly ACID. Isolated whole-image staging will also need a different indexed delta projector for truly large Selarin trading volumes.

Tests exercise the double-read source, unchanged-save external edits, duplicate money/items, Sheets and Docs HTTP request shapes, staged-only target ID guard, stale revisions, missing exclusive writer and an injected Docs outage. Google test transport is synthetic. No actual test Sheet/Doc has been provisioned or written.

## Next steps before enabling NPC↔NPC settlements

Authorize/provision isolated staging resources. Implement an actual KV-backed exclusive writer fence and durable ambiguous-write recovery for Google projection targets. Verify on those files that crashes cannot duplicate projection or payment. Separately establish real NPC source funds and custody, approve the one-time writer cutover, then integrate stacked PRs and run regression+load tests. Only the user authorizes a manual Deno deployment.
