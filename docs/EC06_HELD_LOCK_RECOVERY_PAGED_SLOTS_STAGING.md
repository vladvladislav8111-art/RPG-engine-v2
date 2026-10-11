# EC-06: indexed Google projection recovery and slot registry (staging)

Draft PR #37 stacks on PR #36 and earlier EC-06 drafts. No production deployment.

Two modules were added:
- src/economic_indexed_held_fence_recovery.ts: inspect a HELD writer lock against the original committed Deno KV journal and independent Google receipt/rows. Accept only exact BEFORE state with no receipt, or exact AFTER state with the matching receipt. Reject partial updates, unknown journals, changed lock identities and mismatched values. A release is permitted only after a separately trusted operational controller confirms all old requests are finished and other writers are excluded. The release and incident audit use one Deno KV atomic compare-and-swap. No automatic unlock, timeout or gameplay transactions.
- src/economic_indexed_slot_registry.ts: immutable registration of already physically allocated Google Sheets page ranges and exact account/item/escrow/receipt row identifiers. Distinct identities cannot occupy one physical cell and one entity cannot be assigned twice. A bounded lookup returns only the touched rows for a transaction rather than scanning a full city or updating a global row counter.

The existing physical-file writer lock stores the original indexed journal ID and hash. The staged Google HTTP adapter supplies these when claiming a lock. This enables meaningful review if the network fails after a successful external write.

Tests: 180 passed, 0 failed, on real isolated ephemeral Deno KV, including 500 synthetic independent slot registrations, lock incident scenarios, invalid receipts, partial writes and concurrent ownership conflicts. These figures are infrastructure tests, NOT verified Selarin trades or NPC funds.

Important limits: the external quiescence controller and real Google page provisioning service are NOT deployed. Matching target data does not by itself prove an old HTTP request can no longer arrive. Google Sheets has no native compare-before CAS; outside editors must be blocked. Full Docs history replay still needs bounded archival checkpoints for high-volume traffic. No current money source migration has occurred.

Production at start: engine 2.12.1, committed save V2-S0721, Day 63 18:21, Selarin Copy Market, Shura money 677c. Neither production nor gameplay has changed.

Next: operator-verified recovery against isolated staging assets, paginated immutable Docs transaction checkpoints, authenticated source funding/ownership migration, integrated review of stacked PRs, owner-controlled deployment.
