# TEST Google forensic reconciliation — bounded read-only Preview audit

This adds a **default read-only** route to the existing Draft PR #62. No additional Google write or game commit is performed.

The earlier REAL Preview TEST-S2→TEST-S3 Google E2E and replay passed, but a future lost ACK could leave permanent KV writer lock held. Never treat a complete Google row as permission to delete that lock or allow replay. A paused Deno worker may resume.

The Preview-only, Bearer-protected `/preview/google-recovery/report`:
- gates on pinned TEST workbook and nine pinned TEST Docs, Deno Preview timeline, `ALLOW_WRITES=false`, `ALLOW_RAW_COMMITS=false`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false` and `ENABLE_KV=true`;
- reads **only** the fixed historical `TEST-NPC-HEAT-V2-REMOTE-E2E-20261012-001` record, TEST CONTROL, money resource, SESSION_LOG V2 SHA-256, pinned TEST Docs marker, Deno KV lock and scoped cache state; verifies CONTROL is stable across read;
- returns a status bounded to complete, incomplete/contradictory, held-lock, unknown owner, unstable snapshot or read error. It never returns bearer, Google file ID, KV lock token, document text, arbitrary error or an unlock instruction.
- `programmaticUnlockAllowed=false`, `automaticRetryAllowed=false`, `olderWorkerConfirmedStopped=false` **unconditionally**, including complete evidence. No `atomic()`, KV set/delete, docsAppend or sheetsBatchUpdate appear in the module.
- Mobile `/preview/google-recovery` page accepts existing Bearer locally on same-origin static page and displays only bounded result.

CI covers lock states + Google states, mismatching owner, missing markers, duplicate journal TXs, changed source snapshot and read failure. All tests synthetic/read-only, not actual Google loss of acknowledgement. **True fault-injected remote Google crash recovery remains unproven**, cannot be called passed.

No new Site/Plugin/backend/Production; do not merge or release without user permission. This stage needs no immediate Deploy; can be used on next owner-approved Preview-only revision with Development writes disabled.
