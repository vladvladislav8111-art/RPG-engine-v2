# EC-06 verified economic Google projection packets — STAGING ONLY

This branch stacks on PR #29 -> #28 -> #27. Do not merge/deploy until approved cutover. It is NOT the actual privileged Google API projector.

## Production check at time of development

RPG Runtime Bridge reported OK, engine 2.12.1-specialization-domain-2026-10-11, committed save V2-S0721, Day 63 18:21, Selarin Copy Market. Draft economic PRs #27-29 are unmerged. TEMP_RUNTIME CONTROL identifies structured Google Sheets as the current authority. PLAYER_RESOURCES.Money is current Shura money, INVENTORY_CURRENT is current physical custody, and an independently sourced NPC account/escrow ledger is not present. Successful Deno health does not prove the economic PRs are active.

## New staged module

src/economic_google_projection_packets.ts is a deterministic exact-transaction encoder and readback-verifying adapter core. It is injected with a future INTERNAL AuthoritativeGoogleProjectionTransport, not a client-controlled source, and never calls live Google.

- Derives projection ONLY from immutable journal saved atomically in the original KV transaction, not from newer or hypothetical current market snapshots.
- Requires exact journal.beforeRevision and source item/account/escrow values before constructing changes. A diverged source quantity, custody, cash, watermark or duplicated receipt fails.
- Computes SHA-256 digest over original complete immutable journal, binds a durable receipt to the exact target, scope, transaction, after revision and journal digest.
- Performs read-after-write of the durable target receipt; verifies against the primary journal digest and, for the most recent projection, the exact changed materialized values. Older receipt hashes remain valid after subsequent transactions.
- The existing two-target outbox coordinator now passes the original immutable journal into independent receipt verification.
- Requires one conditional target writer to persist the target values, revision watermark and TX receipt in ONE fenced durable operation. A naive independent Sheets read then update is not an atomic compare-and-swap, and Google Docs append is a distinct store.
- Google images represent read-only future projections after migration, NEVER an independently writable second money ledger or GM PREGEN financial truth.

## Verification

tests/economic_google_projection_packets_test.ts uses a real isolated Deno.openKv(":memory:") primary and synthetic conditional Google transports to test: outage after first target was written, ordered retry of only missing target, physical money/lot exact values, forged/tampered receipt or money, chronological TX A -> B with older historical hash preserved, and refusal of stale revision or original quantity mismatch.

Tests do NOT certify actual production Google API writer durability. No new live tables or account balances have been installed.

## Remaining blockers before real economy

1. Confirm source NPC cash and approved one-time migration, one physical item owner, and exclusive writer freeze for existing economic Sheet fields. No invented starting NPC balances.
2. Implement actual exclusive-writer/fenced Google projection transport with persistent exact source-target receipt scheme and crash-safe recovery even after ambiguous network outcomes.
3. Authenticate proof sources server-side; never permit GM/player to submit trusted signatures.
4. Test real Google Sheets and Docs API outage scenarios in nonproduction documents, concurrent last-item/last-copper transactions, then run integrated tests with independent PR #26 and stacked PRs #27-29.
5. Only the user authorizes merging and manual Deno deployment.

No production runtime state, Shura choice, funds, item custody, game time or scene was changed.
