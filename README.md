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


## V2.7.2 selected-NPC context gate

Explicit selected actors now carry a retrieval-completeness gate. A substantive NPC reply must not be rendered unless `actorContext.contextGate.readyForSubstantiveReply` is true.

The gate distinguishes an empty loaded surface from a surface that was never loaded. It requires `NPC_CURRENT`, `NPC_KNOWLEDGE`, `SOCIAL_MEMORY_CURRENT`, `OPEN_THREADS_CURRENT`, and a bounded `SYSTEM_CHAT_LOG` read. KEY NPCs additionally require identity anchors, competence anchors, and a current goal/activity. Missing or ambiguous actor references block the gate instead of being guessed around.

This is a context-integrity mechanism only. It does not decide what the NPC believes, wants, or morally chooses; the GM still resolves those causally from the loaded state and canon.


## V2.7.3 context integrity package

- Stable recurring NPC names/aliases resolve through GM PREGEN `NPC_IDENTITY_INDEX` even when the actor is dormant; dormant resolution never silently creates a replacement person.
- Selected KEY NPC packets load `NPC_ACTIVITY_RULES` and actor-linked active `WORLD_CLOCKS`; snapshot freshness exposes ordinary eligibility and a stricter forced off-screen-advance threshold.
- Substantive dialogue is blocked when the KEY snapshot has crossed its forced freshness threshold.
- Semantic System chat validates sender/receiver/direction shape before append.
- Thread closure with `promoteTarget != NONE` requires same-transaction destination evidence through `promoteRef`.
- GM PREGEN `HUMAN_THREAT_PROFILES` contains causal environment profiles for human predation without alignment probabilities, socioeconomic moral stereotypes, or atrocity quotas.

Mutable live truth still has exactly one owner. Stable identity indexes and social memory are routing/context material, not duplicate live state.


## V2.7.4 social/world context completion

- `NPC_RELATIONSHIPS_CURRENT` is part of the selected-NPC context gate; relationship state is directed and multidimensional.
- `relationshipEvents` is the semantic write path and rejects `player.shura` as relationship Actor, preserving player agency.
- Dormant selected NPCs resolve through `NPC_IDENTITY_INDEX`; `ARCHIVE_REGISTRY` then loads only their canonical archived episodic knowledge into an explicit rematerialization packet. Archive evidence never becomes present activity/location by itself.
- `FACTION_PROCESS_SEEDS` is available to relevant WORLD/FACTION/POLITICS/AREA_PREP context while remaining dormant until causal activation creates or links a live `WORLD_CLOCK`.
- Rematerialization failures are surfaced explicitly instead of being guessed around.

Current truth remains singular: relationships in `NPC_RELATIONSHIPS_CURRENT`, episodic history in the canonical NPC archive, stable identity in GM PREGEN, and active faction processes in `WORLD_CLOCKS`.


## V2.8 migration-prep architecture

V2.8 prepares the gateway for an official Node.js serverless runtime while retaining the same authoritative Google-backed state model.

### Fresh bounded actor reads

Explicit selected-NPC context no longer needs to load full 2,000-row knowledge or 5,000-row chat tables. The fast path performs a fresh narrow-column index scan, resolves exact row numbers, then batch-loads only matching full rows. This index is computed per request and is not persisted, so it cannot become a second truth or silently go stale.

Dormant NPC archive reads use the same pattern: scan only the NPC-ID column, then fetch exact archived rows for the resolved stable actor.

### Portable runtime boundary

- environment access works through either Deno or Node process environments;
- Deno KV becomes an optional cache adapter rather than a compile-time dependency;
- the HTTP router is platform-neutral and lives in `src/http.ts`;
- Deno keeps a tiny `main.ts` adapter;
- the Vercel adapter uses one gateway Function and preserves the public paths `/health`, `/context`, `/prepare-commit`, `/commit`, `/rng/int`, and `/mcp`.

The cache remains non-authoritative. SESSION_LOG/save preconditions and Google state remain the correctness layer across cold starts or instance replacement.
