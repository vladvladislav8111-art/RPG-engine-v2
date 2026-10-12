# NPC Heat writer — TEST-only receipt epoch V2, not production-ready

**Draft, stacked on PR #57.** This introduces test-only engine-derived receipts to semantic `SESSION_LOG` and strong **unkeyed** SHA-256 over `saveTo`, `inworldEnd`, `sceneId`, `txId`, plus the exact `World advances JSON` bytes.

## Activation
Default OFF: `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false`. To run on a genuinely isolated and authorized synthetic preview, the runtime must *also* have `RPG_NPC_HEAT_TEST_WORKBOOK_ID` set to exactly the configured `TEMP_RUNTIME_ID` and both old/new Save IDs **must begin `TEST-`**. Any mismatch throws before a semantic manifest exists. Do not use Shura's `V2-S*` save, production backend or existing Site. No sheet migration required: the legacy `SESSION_LOG` columns `State hash` and `Version` accept the V2 marker, if the isolate has the matching schema.

## Semantics and proven limits
- Semantic writer alone derives receipts from already selected `sceneActorIds`, meaningful `socialMemoryEvents` and supported `relationshipEvents`. Only committed `NPC_CURRENT` actors qualify; no fabricated attention from routine greetings or retcons.
- The caller's `engineNpcAttentionReceipts`, `engineNpcReceiptDigest`, `engineNpcReceiptIntegrity` and `engineNpcReceiptEpoch` keys are reserved and stripped from worldAdvances even if test writer is disabled.
- V2 journal receipts are emitted in the **same session manifest** as the semantic changes (no extra Google writer). The session row has `Version=2` and `State hash=sha256:<hex>`; no change to legacy Version=1 when disabled.
- An unkeyed SHA-256 checksum detects inconsistent JSON content. It is **NOT cryptographic source authentication against an adversary who can edit both fields**, nor cross-instance exactly-once. It cannot establish authenticated Heat levels 2–4 by itself; PR #57 audit stays candidate-only.
- Dry-run yields manifest only; `committed:true` receipt flags are not independently proved until written in durable TX and read back. An idempotent replay must never create another row: handled by legacy `commitTurn` but still requires E2E remote proof.

## Non-negotiable gates before an eventual production activation
1. Remote Deno Deploy **two independent instances** with fenced lease protected against stale holder after TTL expiry.
2. Remote Sheets→Docs ambiguous response/lost-ack recovery and durable replay on isolated **TEST-only** workbook.
3. Fail-closed lock recovery runbook, no unbounded retries and appropriate identity of TX and caller.
4. Prove read-after-write `SESSION_LOG` V2 hash on Google, and separately check schema/history-epoch rotation.
5. After that, a deliberate, reviewed production promotion. Do not auto-enable or merge this Draft without owner confirmation.

No modifications to `commit.ts`, Google API, Site, Plugin, secrets, EC-06, current save or Production routes.
