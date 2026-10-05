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
