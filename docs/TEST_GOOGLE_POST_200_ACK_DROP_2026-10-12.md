# Simulated lost Sheets ACK after a REAL isolated Google 200 (Draft only)

The goal is an actual TEST-only partial durable write and orphan lock, not
a claimed reproduction of an HTTP/TCP network failure. Commit writer awaits
the successful Sheets API response, then deliberately raises the fixed
`TEST_POST_SHEETS_SUCCESS_ACK_INTENTIONALLY_LOST` error before Docs append
or verification; recovery cache becomes `RECOVERY_REQUIRED` and KV's no-TTL
workbook lock persists. No caller-supplied payload, TX, save or URL.

## Irreversible TEST scope
Only isolated workbook `1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8`,
Preview timeline, nine isolated Docs, and one hardcoded semantic TX are
eligible. Initial authoritative TEST workbook must still have save TEST-S3,
clock 17:21:00, copper 11, old V2 receipt and one old Doc marker. New fixed
TX `TEST-NPC-HEAT-V2-ACK-DROP-20261012-001` advances to TEST-S4, adds one
synthetic copper and one V2 NPC scene-presence receipt, with ZERO time spent.
The Doc append for this NEW TX is deliberately skipped.

Default-OFF `RPG_PREVIEW_GOOGLE_ACK_DROP_ENABLED=false`. To use the runner,
a separately authorized operator must confirm Developer/Preview-only
`ALLOW_WRITES=true`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=true`,
`RPG_PREVIEW_GOOGLE_ACK_DROP_ENABLED=true`, `ENABLE_KV=true`,
`ALLOW_RAW_COMMITS=false`, exact two isolated TEST spreadsheet IDs, pinned
TEST Docs, and **no HMAC key** (V2 fixture). Test UI is
`/preview/ack-drop`; only authenticated POST `/preview/ack-drop/run`
performs the one fixed commit. Never run it in Production and never send
Bearer secrets to ChatGPT.

EXPECTED post-fault durable state: CONTROL TEST-S4, copper 12,
SESSION_LOG has 1 new V2 TX with intact SHA, new Doc TX marker count 0,
scoped KV `semantic-writer-lock` retained for this TX, scoped TX state
`RECOVERY_REQUIRED`. The runner verifies this with read-only sources
and reports `EXPECTED_PARTIAL_DURABLE_TEST_STATE_REQUIRES_OPERATOR_REVIEW`.
It never clears a KV lock, appends a Doc marker, or retries a TX.

After ANY outcome, STOP. No click-again. Return Development write flags
to false, stop/remove the writable Preview revision and use only a separate
read-only forensic report before any manual recovery decision. This fixture
will intentionally be left partly committed and blocked.

**RELEASE LIMIT:** even a successful injection proves post-200 writer failure
handling, not an actual Google transport ACK loss or a safe resume of an
old paused worker. Production release requires operator-reviewed reconciliation
of permanently retained locks and a defensible stale-writer safety strategy.

No new Site, Plugin or backend. No main merge or production deploy.
