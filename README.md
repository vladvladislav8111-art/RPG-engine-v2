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


## V2.6 inventory/storage normalization

V2.6 separates current item instances from reusable physical templates:

- `INVENTORY_CURRENT` stores live instance state only: item ID, quantity, unit, custody/location, condition, tags, timestamps and `Template ID`. Mass/volume columns are per-unit instance overrides only.
- `GM PREGEN / COMMON_OBJECT_TEMPLATES` is the reusable physical archive/catalog for stable unit mass, occupied volume, capacity, durability and other physical baselines.
- `inventoryEvents` is the normal semantic write path. The engine applies quantity deltas/sets, updates custody/state, validates the template, reuses the first blank inventory row for new instances, and clears the entire CURRENT row automatically when quantity reaches zero.
- Generic semantic row upsert/update/delete is not allowed for `INVENTORY_CURRENT`; raw sheet writes remain migration/repair only.
- Inventory context resolves per-unit and row-total mass/volume from template + optional instance override. Unknown physical values stay unknown rather than being guessed.
- Nested tracked contents contribute mass but do not double-count top-level System Storage occupied volume.


<!-- production-deploy-trigger: v2.6-inventory-storage-2026-10-07 -->


## V2.7 context routing

V2.7 hardens recurring-NPC context without turning history into a second live state:

- explicit `actorIds` bypass Shura-location filtering for `NPC_CURRENT`, so remote contacts retain current identity/activity instead of becoming `current: null`;
- `actorRefs` resolves exact active NPC display names or stable IDs to canonical NPC IDs and reports unresolved/ambiguous references rather than guessing;
- targeted actor loads include bounded recent `SYSTEM_CHAT_LOG` messages together with current NPC knowledge;
- local NPC discovery still uses current-location filtering when no explicit actor is requested;
- recent chat remains append-only history and is loaded only for explicitly selected actors, not as ordinary broad turn context.

This is the first V2.7 slice. Durable social-memory and open-thread materialization remain separate from ephemeral dialogue and will be added as dedicated current-state surfaces rather than overloading NPC knowledge.


## V2.7.1 social memory and conversational threads

The social context pipeline now separates retention by future causal value rather than by how dramatic a line sounded:

- **EPHEMERAL** — greeting, throwaway comment, one-off joke or flavor that has no expected future effect. Keep only in scene context; do not persist merely because it happened.
- **THREAD** — unfinished question, promised answer, temporary coordination point or short-lived topic that must survive a few turns. Store in `OPEN_THREADS_CURRENT`; remove when resolved or expired.
- **SOCIAL_MEMORY** — recurring inside joke/nickname, meaningful gift, promise, conflict, rescue/betrayal, embarrassing shared event, recurring phrase or other relationship reference likely to affect later reactions. Store in `SOCIAL_MEMORY_CURRENT`.
- **STATE** — mutable objective current truth such as location, job/activity, relationship state, knowledge, custody, money or an active commitment. Store only in its owning CURRENT table.
- **CANON** — durable reusable world truth. Store in permanent canon/pregen, not as a duplicate live value.

`socialMemoryEvents`, `threadEvents`, and `chatEvents` are semantic write paths. `SYSTEM_CHAT_LOG` remains append-only history but selected actors receive only a bounded recent slice. A substantive selected-NPC context packet should therefore contain current identity/activity, knowledge, social memory, open threads, and recent chat before the GM writes the reply.
