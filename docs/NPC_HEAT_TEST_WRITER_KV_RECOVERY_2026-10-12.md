# TEST-only writer KV exclusion and recovery preflight — 2026-10-12

Draft stage stacked on PR #59 → #57. **Not authorized for Production, EC-06, NPC Heat ranking or real save.**

## Core boundary
- `commitTurn` detects `RPG_NPC_HEAT_TEST_WRITER_ENABLED`; on **non-dry** synthetic semantic writes it rejects any non-TEST save, missing exact configured `RPG_NPC_HEAT_TEST_WORKBOOK_ID`, absent `ENABLE_KV=true`, missing Deno KV, raw mode, or disabled writes.
- It acquires a workbook-wide Deno KV atomic CAS lock *before* calling `prepareCommit`. The protected region contains source reads, semantic manifest generation, Sheets write, Docs append and post-write verification.
- Lock has **NO TTL**, so a paused process cannot resume after expiry and overwrite Google Sheets following a newer writer. No Google fencing token exists.
- A successful verified commit conditionally deletes its own lock. Any thrown error leaves the lock held (`releaseOnError:false`), including ambiguous response and failed preconditions, requiring operator reconcile.
- The existing `commit.ts` writer path remains unchanged if the test flag is OFF (including all live gameplay); it is not safe to claim production is protected by this test-only lock.
- Dry-run is not a Google mutation; it does not take the lock or resolve an existing orphan.
- `planHeatLockRecovery` is a **pure review-only** helper. It has no KV `delete` or release method and **never authorizes automated unlock**, even if all synthetic evidence flags are true.

## Operators after synthetic error
1. Stop/drain every instance that could still possess the old lock (actual Deno project/timeline evidence).
2. Independently inspect authoritative `SESSION_LOG` for exact TX + source save, committed `CONTROL` and every required Google Docs `[TX:...]` marker.
3. Investigate 0/multiple/conflicting receipts and incomplete Docs append, and fix only in a separate authorized recovery plan.
4. Only after verified drain and reconciliation may an operator *consider* manual lock clearing with a new exclusive session, never from normal application requests.
5. Do not use TTL, retries, force deleting the lock, or rotate to a new TX to bypass it.

## Required external release proof
CI does local Deno KV CAS (same machine) and deterministic synthetic errors. It **cannot** prove remote two independent Deno Deploy isolates using the same managed KV or a real ambiguous Google response. An isolated TEST workbook and remote, authenticated Preview-only E2E remain required. Do not merge the PR chain into main or enable flags until the user reviews the release gates.

Preserve Site, Plugin, URL, Bearer, main, pinned Production and Shura `V2-S0795`.
