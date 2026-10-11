# EC-06 — new Deno Deploy KV Attach and safe HELD-lock recovery

**STATUS: PREPARATION ONLY; NO production DB/Google writes or deployment.**
This is a code-only staging change on PR #43 stacked on PRs #42 → #41 → #39 → #38 → #37.

## What the user's new Deno Deploy screen means

The Databases tab of app `rpg-engine-v2` currently displays a `+ Attach` action for **Deno KV** and a separate `+ Attach` for SQL. It does not by itself prove:
- this is the deployment handling the current MCP production URL;
- which Deno KV database (if any) the current runtime actually uses;
- whether an earlier Classic/new Deploy instance or local KV already contains financial state;
- that old Google requests have stopped.

Deno Deploy documentation: the newer platform provisions a Deno KV database instance once, **assigns** it to an app, and isolates logical databases by production/Git branch/preview timeline. Within Deno Deploy, `Deno.openKv()` opens the attached database for the active timeline. An app generally cannot simultaneously assign a Postgres and Deno KV instance. No SQL is needed for this EC-06 design.

Official docs:
- https://docs.deno.com/deploy/reference/databases/
- https://docs.deno.com/deploy/reference/deno_kv/

## Before pressing Attach

1. First use `Manage Instances` to inspect existing provisioned databases **without altering them**. Determine whether there is already an intended Deno KV instance and which app/timeline is assigned.
2. Verify the app's actual deployed origin/URL and Git revision match the MCP runtime health endpoint currently used for real Shura saves. Name alone is not enough.
3. Verify backup/rollback and deployment timeline. A different assigned database is **not** a migration of existing ledgers. Never point a KV writer at an empty database while pretending NPC funds, transaction journals or old HELD locks exist.
4. Confirm current source: `src/cache.ts` calls `Deno.openKv()` only when `ENABLE_KV` is enabled; otherwise it falls back to per-process memory. Existing `/health` reads Google Sheets and **does not verify persistent KV**. `main.ts` has no current EC-06 production writer.
5. If provisioning is necessary, start by associating the intended managed Deno KV to a **nonproduction Git branch/timeline** and verify environment isolation and simple read/write/restart using an isolated synthetic namespace. Do not use live NPC balances or CURRENT Google files as the canary. Verify no existing production KV is accidentally replaced or disconnected.
6. Do not enable EC-06 trading/escrows solely because the DB now says **Connected**.

## The new bounded read-only incident dossier

`inspectHeldDocCompactionReadOnly` requires one exact prior HELD Google Docs lock, one explicit segment-numbered primary KV manifest, 16 primary TX/journal/ACK receipts and an independently retrieved real Google Doc body+revision. It classifies:
- `PREPARED_DOC_STILL_OLD`: locked; Google archive still contains 16 events;
- `DOC_WRITTEN_KV_ACK_PENDING`: Google checkpoint seems written but primary KV segment manifest still PREPARED;
- `KV_APPLIED_LOCK_HELD`: KV segment APPLIED and Docs checkpoint match, but lock remains HELD;
- `QUARANTINE_UNKNOWN_OR_DIVERGENT`: source, identity, history or proofs cannot be reconciled.

**Every single result has** `lockReleaseAuthorized=false`, `quiescenceProven=false`, `externalWritersExcluded=false`. No new Google HTTP call is triggered unless a read-only provider is explicitly connected. The module neither opens the database nor creates recovery endpoints.

The old `reviewHeldIndexedGoogleLock` remains the separate read-only reviewer for **single TX projection** locks; compaction-specific HELD locks have no `pendingIndexedTxId`. Do not handle the latter through the transaction unlock routine or invent a recovery token.

## What is still missing for a release

A real trusted operations procedure must independently attest that the previous Google writer process and its in-flight requests were killed/drained, prevent all external Google editing/automations, confirm the exact physical file and primary database owner, recheck the immutable Google receipt/Doc revision against KV, and then perform a separate authorized KV CAS audit + transition. A KV database **cannot alone prove an external HTTP request no longer exists**. Thus this PR intentionally does not offer any self-issued unlock path, automatic expiry, retry timer, or TTL.

The allowed initial production rollout is **diagnostics only** after confirming database identity, not EC-06 live financial commits, item ownership migration, projection queue scheduler or checkpoint compaction.

## Verification

Synthetic tests with ephemeral local Deno KV cover PREPARED old Doc, successful Google write/lost response with KV still PREPARED, KV APPLIED but lock still HELD, and forged source journal quarantine. CI counts for this PR are recorded in the PR description.
