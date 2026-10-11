# EC-06 — bounded checkpoint in ONE existing Google Doc (draft PR #42)

## Purpose and invariant

Eliminate unlimited full-Google-Doc transaction-history replay WITHOUT creating another Google document, staging server, production endpoint, schedule, or independent finance ledger.

The primary Deno KV **per-transaction immutable TX receipt, immutable journal, projection outbox and delivery/demand receipt** are the original economic audit history. A Google Doc is a verified **materialized read projection**, not a permanently append-only *second* ledger after this change.

This is a deliberate contract shift: the old Google Doc paragraphs may be replaced **only when their original transactions remain provably committed, double-receipted and permanently queryable in primary KV**. A production canon/schema migration and explicit operator acceptance of the new archive semantics are needed before any live cutover.

## Data shape and cost bounds

- One physical Google Doc per approved indexed staging scope. No new Docs file.
- `MAX_EC06_DOC_TAIL=16`: at most 16 uncheckpointed deltas. The 17th projected transaction must halt (read-only preflight **before Sheets**, and again under the Docs writer lock).
- At most **128 materialized row identities per Doc scope**; additional rows require an intentional scope partition, not silent unlimited copying.
- Max 240,000 code units of raw text at parse time (current staging upper guard).
- A checkpoint stores current materialized row values, `segmentNumber`, cumulative `compactedTransactions`, `segmentHash` and `rowsHash`.
- Hash-chain step `segmentHash = SHA256(JSON({schema, scopeId, physicalDocId, segmentNumber, previousHash, source:[{txId,journalHash}], rowsHash}))`.
- One exact `EC06_DOC_SEGMENT_MANIFEST_V1` record in the **same primary KV** stores that segment's 16 immutable TX/journal references, previous hash, rows hash and `PREPARED|APPLIED` state. Its contents are source-derived evidence, NOT independent money/stock.
- When the window is full, a manual operator-controlled compactor can replace the same Doc body with one checkpoint paragraph. The next 16 verified operations then accumulate in that same Doc. Number of historic TXs no longer determines the materialized Google document's size; the number of currently tracked distinct rows still does.

## Safety gates for manual compaction

The isolated-only `compactOneIndexedDocWindowStaging` requires `scope.fixture.*`, rejects every protected configured CURRENT Google asset and performs all of the following.

1. Read the existing Doc from Google and demand exactly 16 well-formed causal BEFORE/AFTER deltas and a valid genesis or existing checkpoint.
2. For every one of the 16 operations, reread its **actual primary KV** TX/journal/outbox. Verify exact source `journalHash`, transaction identity, final `PROJECTED_INDEXED` proof, absent queue pointer and independently durable matching Google **Sheets** receipt. Doc receipts are validated from the actual Google text, not invented from caller inputs. A prior checkpoint must have matching `APPLIED` KV manifest/rows hash.
3. Reject known errors **before acquiring a never-expiring Google lock**. Then CAS-acquire the physical Doc's existing exclusive writer lock, reread its actual revision/text, and revalidate all source proofs.
4. Persist a unique `PREPARED` KV segment manifest.
5. Use one native Google Docs `documents.batchUpdate` call with `requiredRevisionId` and two atomic subrequests: delete old Doc body except its required terminal newline; insert the new checkpoint in **the same Doc**.
6. Independently reread the changed Google Doc and verify exact new checkpoint and empty delta tail. CAS-mark the existing manifest `APPLIED` in primary KV.
7. Release the Google writer lock only after a further independently authenticated Doc readback and KV `APPLIED` cross-check. Never delete TX/journal/outbox/bank/lot history in KV.

## Crash cases

| Failure boundary | Durable state | Action |
| --- | --- | --- |
| Invalid prior receipt, pending outbox, missing or forged journal | Source rejected before locking | No Google mutation |
| Physical Google Doc changed between preflight and fenced read | Google exclusive writer `HELD` | Incident review; no release from a guess |
| Crash after manifest PREPARED but before Google write | PENDING manifest, Google HELD | Independent quiescence/receipt-based operator review |
| Google write succeeded but HTTP response lost | Google may contain checkpoint, KV manifest PREPARED, lock HELD | No automatic retry, lock theft or ACK |
| Google readback wrong | Manifest PREPARED, lock HELD | Quarantine and compare actual Doc revision and source |
| KV APPLIED ACK lost/conflicted after Google write | Ambiguous document/primary cross-state, lock HELD | No force unlock |
| Completed verified transition | KV manifest APPLIED, Doc compacted and lock RELEASED | Future append can resume |

**There is currently NO separately operated quiescence/drain proof provider for compaction-incidents.** `releaseReviewedIndexedGoogleLock` in the older PR is for transaction-bound HELD locks and does not magically authorize release of a compaction-bound lock. Production enablement MUST provide an independently authenticated mechanism to prove the old writer is terminated and late Google requests impossible; this code must not be promoted until then.

## Important scope limits

- The native Google Docs API does **not** expose arbitrary pagination of a single document's historical body. A read field mask reduces returned fields, not the number of historical paragraphs. The bounded checkpoint prevents history-based growth **after** a verified rewrite.
- Existing staging Docs with >16 uncheckpointed deltas, unrelated paragraphs or multiple tabs will HALT for explicit migration/review; they will not be silently compacted. Neither CURRENT transaction archive nor existing local test Docs were edited in this PR.
- Older already-compacted Doc receipts are no longer physically in its current tail: their permanent evidence is the original primary KV TX/journal/ACK plus chained segment manifests. Because all segment operations must have been independently ACKed and pruned from the queue *before* compaction, normal queue reconciliation never needs them again. A historic forensics interface over KV archives is separate work.
- This module is not imported by `main.ts` and does not schedule anything. No new Google files, services, credentials, timer, game turn or production KV rows were created.
- This is not yet a citywide scale solution: physical slot provisioning, real source-funded NPC account/lot migration, one authenticated financial writer, canonical adoption of the new mirror contract, independent HELD lock incident service, and a real isolated Google fault-injection validation of compaction all remain necessary.
- The test harness uses emulated Google API responses and ephemeral Deno KV only. GitHub CI green proves these test scenarios, not actual deployment or Google-side atomicity beyond documented API semantics.

## Verification
GitHub Actions for current PR HEAD must prove compilation and the entire Deno test suite. Regression tests cover:
- 16→checkpoint→16→checkpoint chained row replay.
- Broken source BEFORE, wrong receipt journalHash, unbounded 17th transaction, >128 rows and unknown content refusal.
- Exact source-funded synthetic primary KV archive with 16 `PROJECTED_INDEXED` TX, real source SHA, actual test receipt adapter.
- Single guarded replacement operation, Google re-read, KV PREPARED→APPLIED and lock release.
- Network loss **after Google successful write** leaves KV PREPARED and HELD writer lock without retry.
- Missing Sheet receipt rejected before locking.
- Full-window projection blocked before first Sheet mutation.
