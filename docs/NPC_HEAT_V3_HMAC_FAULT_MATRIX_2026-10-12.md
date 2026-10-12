# Isolated HMAC V3 provenance and simulated Google fault matrix

This is a DEFAULT-OFF experimental continuation of Draft PR #62. No new Site/Plugin/backend/Preview deployment, no migration and no production writes.

## Keyed V3 receipt provenance
- New server-only optional `RPG_NPC_HEAT_TEST_HMAC_KEY` and `RPG_NPC_HEAT_TEST_HMAC_KEY_ID` choose HMAC-SHA256 **only** for the existing strictly isolated TEST writer. Both remain unset in current Production and Preview; V1/V2 semantics are unchanged.
- The HMAC covers exact JSON plus saveTo, turnId, txId, inworldStart, inworldEnd, sceneId, source and key ID, domain-separated as `NPC_HEAT_ORIGIN_V3_HMAC_SHA256`. Reader validates HMAC before evaluating receipts, while older V2 SHA-256 receipts remain V2 and are not retroactively signed. Never reuse Bearer or Google secrets for this signing key.
- This attests only possession of the server signing key and exact record bytes. It does **not** authenticate whether a historical NPC interaction really happened, whether the whole history has been loaded, or which Deno instance wrote the data. No earned Heat 2-4, KEY promotion, or memory pruning is enabled.

## Fault matrix
- Tests simulate post-persist Sheets lost ACK, Docs conflict and post-write verification timeout; each holds TEST no-TTL KV lock and rejects a second writer.
- Operator recovery preflight remains strictly review-only, even when all evidence matches. An orphan is never force-unlocked or auto-expired by code.
- **Not a substitute** for two real Deno Deploy instances on shared KV, paused-worker shutdown proof, or a fault-injected real Google transport round trip.
- No user action or Deploy needed for this code-only stage. Preserve Production and Shura save.
