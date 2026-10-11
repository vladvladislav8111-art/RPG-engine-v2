# RPG V2 — A-03 finite reserves and physical supply chains

**STAGED / DESIGN ONLY. NOT A LIVE CANON OR SAVE MIGRATION. DO NOT DEPLOY.**

Dependency: PR #19, feature branch feat/a02-ecology-site-gates. This follow-up is an isolated stacked branch; do not merge it into main or trigger Deno until the owner explicitly chooses a complete compatible release.

Source: Google Drive RPG V2 — DESIGN A-02 — Фэнтезийная экология, залежи, объекты и торговые цепочки, including its A-03 Western Ilyrian section. Current 00_START_HERE — WORKING V2 determines runtime authority. All draft deposits, markets and material streams remain DESIGN_CANDIDATE, never live world facts.

## Scope

- src/finite_supply_gate.ts validates a finite surveyed recoverable stock and protected reserve at an already canonical geography anchor; stable non-conflicting source identity, existing material identity, measured natural mechanism, real owner, legal extraction permit and verified prior-harvest/capacity evidence.
- It accounts for already recorded annual extraction in a verified annual quota. Regenerative stock also requires demonstrated annual replenishment and cannot claim more annual yield than natural recovery. Replenishment is NOT an instant stock refill.
- Supply plans operate only on a scratch batch ledger; each batch has a unique ID, exact mass, one location and one custodian. Operations: EXTRACT, PROCESS, TRANSPORT, TRANSFER_CUSTODY. Consumed batches cannot be consumed again. Closed-system conversion waste is explicitly conserved.
- Processing uses an independently canonical recipe that explicitly permits the actual input and output material identities, in addition to measured mass conservation; a generic permit cannot turn wood into an unrelated metal.
- Transport needs a pre-existing canonical measured route, matching endpoint, and finite cargo capacity. Custody change requires independent title/transfer evidence.
- Result state VALIDATED_DESIGN_ONLY returns proposed source depletion and non-live batch state without writing game tables.
- A separate read-only assertion checks independent, already committed permanent canon, exact finite-stock ledger, physical custody ledger and materialization event. The assertion is not a transaction.

## Explicit exclusions

- No new canonical deposits, mines, farms, roads, buildings, NPCs, jobs, offers, market prices or buyers are manufactured from design candidates.
- No actual extraction, trade, currency, XP, production, clock advance, map discovery, Shura action or inventory delta takes place during design checks.
- Fixture location IDs, source amounts and quantities in tests are synthetic and NOT RPG canon.
- Any chemical reactions, humidity-dependent mass changes, refining with added reagents and other nonclosed transformations require a later explicitly canonized recipe and stronger ledger checks.
- Existing physical_integrity.ts and physical_passport.ts remain authoritative for actual live inventory transactions. This module is not yet connected to semantic commit and does not enforce production safety by itself.

## Later steps

1. Select one genuinely surveyed real regional source and legal owner; document actual recoverable stock, quota, prior extraction and material properties.
2. Verify routes, transport, processing, actor presence, custody and genuine market demand in authoritative records.
3. Integrate the validator with the schema-aware semantic transaction path, with atomic source debits and item custody movement and high-stakes dry-runs.
4. Commit actual world facts first. Only after that may an authorized semantic event create physical stock or offers.
5. Run Deno check and all tests; owner chooses manual Deno deployment. Verify current runtime health, save ID, time, location and resource continuity.

## Check commands

deno check main.ts

deno task test

Production Deno and the gameplay save remain unchanged by staging code.
