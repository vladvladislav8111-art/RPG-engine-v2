# Fixed TEST-only semantic writer E2E — one release packet

User requested no more per-check PRs. This extends existing Draft PR #62, retaining the full chain #57→#59→#60→#61→#62.

## Proven real test fixture (read via Google Drive before authoring)
- Workbook pinned TEST ID: `1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8`
- CONTROL currently `TEST-S2`, Day67 17:21:00, `scene.test_only`.
- `NPC_CURRENT` has synthetic `npc.test.only`.
- `Money copper=10` on TEST player.
- TEST journal has old `TEST-S1` and `TEST-S2` rows but no new V2 TX.

## Fixed TEST operation (not yet executed on Google)
- Source `ENGINE_FASTPATH`; prepare `TEST-S2`→`TEST-S3`.
- Exactly **1** `Money copper` synthetic delta and **1** NPC scene-presence receipt, `Version=2`, `TEST_ONLY_V2`, SHA-256 checksum bound to exact journal JSON; no general XP or passage of world time.
- Append exactly **1** marker to `LIVE_TRANSACTION_ARCHIVE`, automatically pinned to preexisting TEST Doc.
- Retry *same* `TEST-...` TX and ensure journal receipt count, Doc marker count and copper never double.
- No arbitrary client TX, actor, Sheet range, scene or resource values; POST accepts **no request body**. Existing Bearer auth required; route remains Preview-only.
- `commitTurn` owns the workbook-wide permanent TEST-only Deno KV CAS lock through read/prepare, batch Sheets write, Docs append and verification. If Google response is ambiguous, leave lock in place. No automatic reset or retries under new TX.

## Deployment phases (no unapproved production changes)
**Phase A:** current Development env: `ALLOW_WRITES=false`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false`; use **the same new Preview build** `/preview/writer-setup` to read back TEST workbook and all 9 Docs, zero Google writes. Paste only boolean result.

**Phase B, only after A succeeds and user explicitly approves:** Development context only, `ALLOW_WRITES=true`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=true`, `ALLOW_RAW_COMMITS=false`, `ENABLE_KV=true`; keep the two test workbook IDs pinned, all nine TEST Docs, Preview/Git Branch timeline. Re-Deploy to Preview (never Production); open `/preview/writer-e2e`, click one fixed TEST command and report response. Afterward return Development `ALLOW_WRITES=false`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false`. Never send Bearer in chat.

If a timeout, failure, or 404 occurs, **STOP**; do not retry or delete a KV lock until all running workers are drained and durable Google Sheets/Docs receipts reconciled. Remote multi-instance Deno, real Google lost-ACK injection and keyed NPC source signing remain separate release gates.

## CI
`tests/preview_writer_e2e.test.ts` simulates actual TEST-engine `commitTurn` through intercepted Google API, checks first and second TX replay exactly once. CI deliberately has **no network access**, so this is not proof of remote Google permission nor a real remote write.
