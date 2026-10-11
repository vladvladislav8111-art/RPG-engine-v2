# EC-06: Indexed NPC wholesale transactions with row-level Deno KV CAS

STATUS: DRAFT / STAGING. This branch is stacked on PR #33 (and #32 -> #27). Do not merge/deploy or migrate Shura's or NPC money.

## Motivation
Previous src/economic_kv_atomic.ts uses ONE whole economic scope snapshot and one KV versionstamp: safe but every unrelated merchant in the same district conflicts. Even the six-event PR #33 queue cannot eliminate that collision. A live big-city market needs independent physical accounts and lots while preserving true causality and single-owner accounting.

## Implemented

New src/economic_indexed_wholesale_kv.ts is an ALTERNATIVE indexed primary KV schema, NOT another concurrent/current ledger. It requires an EXISTING preapproved migration seal referencing an original save and independently confirmed source proof. No starting funds, NPC wealth, goods, world processes, trades, jobs or Shura choices are generated.

A sourced wholesale sale requires a verified due, previously accepted order, buyer/seller consent, independent evidence of actual delivery, physical handoff, actual seller legal title as well as custody, and existing positive spendable buyer funds. It atomically CAS-checks only affected buyer/seller accounts and original physical lot, original global account/item home pointers, optionally unique destination item and home pointer, an immutable migration seal, globally unique transaction invoice and globally unique delivery receipt. Cash debit, credit, legal owner/custodian transfer, split, globally unique receipt, immutable exact account/lot journal and pending projection outbox are written together. Full-lot transfer retains original physical ID, partial transfer creates one new ID and subtracts the original amount in that same CAS.

Separate non-overlapping transactions do not write a global city revision: traders operating with distinct accounts/lots can settle concurrently. Shared last-item or last-copper contention correctly rejects one transaction. Identical invoice retry returns the same receipt without charging; using one delivery receipt under a new invoice refuses. Wrong custody, private/bailment goods, missing account, forged source authority and cross-scope ownership refuse. Do not infer merchant cash from past wages or sale prices.

Deno KV documented atomic limits: 100 checks, 1000 mutations and 800 KiB total operation; use bounded small windows. This module supports only a straightforward completed NPC wholesale sale, NOT indexed wage escrow, delayed credit, cross-primary-scope clearing, taxes, issuance, manufacturing or background NPC order creation.

## Critical integration limitation

These indexed accounts and physical lots have NOT been migrated from CURRENT Google Sheets. Historical records remain history, not a new financial source. The older EC06 single-snapshot KV planner and current Sheets economic writers MUST NOT run concurrently with an indexed authoritative primary. The older projection module expects a globally ordered scope revision; this new implementation has immutable per-row journals and a PENDING_INDEXED_PROJECTION marker. A NEW indexed delta projector with idempotent source readback and per-row ordering is required before any production settlement. Google Sheets values.update does not provide native CAS and manual editors can bypass a cooperative lock. No automatic acknowledgement by old projector.

## Tests and next gates

Synthetic isolated Deno.openKv(":memory:") regressions exercise partial split and conserved cash, two simultaneous buyers of one last item, two orders against one buyer's last cash, many unrelated merchants in the same scope, replay/duplicate physical receipt, forged private property, cross-scope ownership and missing migrator seal. This is not a real Selarin trade census or a Deno Deploy load guarantee.

Future: verify independently sourced real NPC liquidity, lawful item owners, one-time and single-writer migration from existing CURRENT, indexed escrow and trusted actor/source-proofs, real indexed Google delta projections, fault-injection and actual deployment concurrency/load tests. Then integrate all stacked drafts with other live city PRs. Only user authorizes manual Deno deployment.

Production Runtime Bridge remains engine 2.12.1 at V2-S0721 Day63 18:21, 677 copper observed for Shura. No live economy or game time changed.
