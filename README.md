# RPG V2 — Deno Runtime Gateway

Deterministic service layer for the persistent RPG V2 campaign.

## V2.2 fast path

Current structured Google Sheets state is authoritative for ordinary play. Large Google Docs are static canon, frozen legacy history through V2-S0275, or archive/checkpoint material.

Normal turn:

```
get_turn_context -> GM causal resolution -> semantic commit_turn -> render
```

`prepare_turn` is optional and intended for HIGH_STAKES/debug/migration dry-runs.

The engine handles tag-routed compact context, optimistic turn tokens, elapsed-time rollover, General/competence XP math, specialization progress, pending milestones, resource/condition mutations, structured current-state upserts, durable SESSION_LOG idempotency, final verification and deterministic RNG.

The GM still owns causal interpretation, NPC intent/personality, world-truth generation, player agency and narrative rendering.

## Pregenerated canon

GM PREGEN contains compiled rules plus materialized region/district/service packs and Taren compiler data: `RULES_COMPILED`, `TAREN_LANGUAGE_META`, `TAREN_PHONOLOGY`, `TAREN_ORTHOGRAPHY`, `TAREN_GRAMMAR`, `TAREN_DERIVATION`, `TAREN_LEXICON`, `TAREN_DOMAIN_LEXICON`, `DISTRICT_PACKS`, `SERVICE_DIRECTORY`.

World Taren is separate from Shura learned state in `PLAYER_LANGUAGE`, `PLAYER_LEXICON` and `PLAYER_GRAMMAR`.

All private and diagnostic endpoints require the runtime API key. `ALLOW_WRITES=true` enables authoritative commits.


## V2.5 architecture hardening

V2.5 keeps the same authoritative storage model but tightens the hot path:

- `CHARACTERISTIC_ADAPTATION` is a first-class semantic runtime domain. Adaptation events apply canonical bands, secondary scaling, daily caps, geometric thresholds, overflow, natural characteristic increases, and derived HP/Stamina/Mana maxima without raw-cell gameplay writes.
- Structured semantic row updates/upserts validate field names against actual table headers. Unknown convenience fields fail with a table-specific error before manifest generation.
- Semantic row deletion is supported for hot-state lifecycle cleanup.
- `ACTIVE_CONTEXT` scene/location pointers are synchronized automatically on committed scene/location changes; stale derived settlement/region/tag hints are cleared rather than carried across locations.
- Physical/training turn context includes canonical `ACTION_STAMINA_PROFILES` so callers use registered action IDs instead of guessed aliases.
- General-level increases refresh derived HP/Stamina maxima while preserving current values unless another rule changes them.
- `*_CURRENT` tables are intended to remain hot/current only; closed lifecycle history belongs in SESSION_LOG/archive.

Raw `sheetWrites` remain a migration/repair escape hatch. Structural grid changes (for example, adding columns) must be performed before value writes; semantic gameplay should not depend on raw grid addressing.


## V2.6 inventory/state compaction

- `INVENTORY_CURRENT` is hot state, not item history. One stable instance/stack ID owns one row; quantity/custody/condition changes overwrite that row.
- Zero quantity deletes the current row. Historical acquisition/consumption/transfer remains reconstructible from `SESSION_LOG` / `LIVE_TRANSACTION_ARCHIVE`.
- Stable physical properties are looked up through GM PREGEN `COMMON_OBJECT_TEMPLATES`. Current inventory stores a `Template ID`; mass/volume cells are per-unit instance overrides only and are normally blank.
- Ordinary inventory changes use semantic `inventoryEvents`; generic row writes to `INVENTORY_CURRENT` are intentionally disallowed.
- The engine resolves quantity deltas/sets, row reuse/deletion, custody/location/condition replacement, per-item mass/volume and current known inventory totals.
- Unknown template mass/volume remains unknown rather than fabricated; the engine reports incomplete totals explicitly.
- `WORLD_CLOCKS`, `PROJECTS_CURRENT`, `OPPORTUNITIES_CURRENT` and `SERVICES_CURRENT` follow the same hot-state lifecycle: closed/completed entries are archived and rows become reusable.
