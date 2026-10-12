# Controlled TEST-S4 partial transaction: execution and forensic gates

**State at authoring (independent read-only Google Drive query):**
`TEST-S3`, 17:21:00, Money copper 11, one previous V2 journal TX.
This is a *single-use* fixture. It must NEVER be run on the Shura game workbook.

## Phase 0 — code-only review (current state)
CI and source review only. No Deno Preview deployment, no Google mutation.
`RPG_PREVIEW_GOOGLE_ACK_DROP_ENABLED` defaults to false, and the
existing Development `ALLOW_WRITES=false` and
`RPG_NPC_HEAT_TEST_WRITER_ENABLED=false` must remain false.
No HMAC V3 key is allowed for this specifically V2 fixed fixture.

## Phase 1 — only after separate operator consent
Verify actual Dev/Preview flags, two pinned TEST workbook IDs, all nine
TEST Docs and the exact immutable new build before enabling any TEST writer.
The owner may then enable in **Development only**:
`ALLOW_WRITES=true`,
`RPG_NPC_HEAT_TEST_WRITER_ENABLED=true`,
`RPG_PREVIEW_GOOGLE_ACK_DROP_ENABLED=true`,
`ALLOW_RAW_COMMITS=false`, `ENABLE_KV=true`.
Deploy the existing backend's TEST-only Preview revision. Never Promote
Production. Static /preview/ack-drop page requires bearer locally to run
one no-body POST /preview/ack-drop/run.

The source implements one exact, noncaller-controllable
`TEST-NPC-HEAT-V2-ACK-DROP-20261012-001`, `TEST-S3→TEST-S4`, 0
seconds elapsed, 1 copper and 1 NPC scene-presence receipt. It awaits an
actual Google Sheets successful HTTP response, then intentionally throws
`TEST_POST_SHEETS_SUCCESS_ACK_INTENTIONALLY_LOST` before appending Docs.
Expected state is **PARTIAL**: Sheets save TEST-S4, copper 12, one new
journal row and SHA-256, **zero new Docs markers**, cache
`RECOVERY_REQUIRED`, permanent KV lock still held. No caller TX/body.

**On any error, do NOT click again, rotate TX, force-remove the lock, or
manually append Docs.** A timeout may leave genuinely unknown Google state.

## Phase 2 — disable TEST writer then independent READ-ONLY forensics
After the test, disable DEVELOPMENT flags
`ALLOW_WRITES=false`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false`,
`RPG_PREVIEW_GOOGLE_ACK_DROP_ENABLED=false`; retire old writable
Preview revision or re-deploy safe revision (not Production).
Then use existing `/preview/google-recovery` mobile page second
read-only button `Сверить прерванную запись TEST-S4`, which calls
Bearer-protected `GET /preview/google-recovery/ack-drop`.
It compares TEST-S4, money, V2 receipt hash, Docs marker, control-stability,
KV owner/versionstamp, and scoped TX cache **without writes**.
Even if expected state matches, it ALWAYS reports no automatic replay,
no programmatic lock release and no proof a paused worker stopped.

## Remaining release limitations
This test verifies *real Google Sheets persisted* followed by a
deliberate writer-level lost confirmation. It is NOT a real network
disconnect or independent Google ACK uncertainty. A long-lived
orphan TEST lock is a purposeful outcome; never automate its recovery.
There is no demonstrated external fencing against an already-paused
writer after an operator clears the lock. Continue to keep Production
writer/EC-06 and NPC Heat 2–4 disabled pending separate sign-off.

No new Site, Plugin, App, backend, GitHub main merge or live save write.
