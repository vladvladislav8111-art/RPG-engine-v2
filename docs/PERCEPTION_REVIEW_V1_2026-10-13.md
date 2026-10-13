# RPG V2 — Perception Review V1 (source-gated, read-only)

Adapted from user-supplied SHURA PERCEPTION & HINTS V1, 2026-10-13. This is a GM aid, not an authoritative secret-discovery oracle.

The existing authenticated simulate_world_v3 accepts the existing operation world_review with payload.perceptionV1 inside its <=12-job batch. It returns RPG_V2_PERCEPTION_REVIEW_V1 with sourceAttested:false, committed:false and gameTimeSeconds:0. No new REST endpoint, Site, Plugin, secret, database, save migration or writer.

GM obtains actor information from committed TEMP_RUNTIME: actual Perception, canonical broad competence ID/level (1–13), separate specialization stars (0–10), already selected milestones, known fact IDs and source-confirmed Taren lexemes. Old skill XP rows are history, not current competence. Caller-supplied numbers and descriptions cannot attest themselves.

Scene observations are physically observable only, optionally gated by sense, actual lighting/access, deliberate stance and source-backed capabilities. Inferences require all cited observations to be visible and are explicitly marked hypotheses, not hidden truth. Unseen records are not echoed in results. Hidden GM facts, NPC private thoughts, plans and future developments may never enter this request.

Unknown Taren words remain audible; only exact lexeme ID + form + language confirmed in Shura's knowledge gets a gloss. No invented vocabulary, grammar or full sentence translation. Check each lexeme against the canonical lexicon.

No arbitrary global penalty constants for fatigue or light. Physical impossibility overrides scores. Passive Eye of the Pioneer helps notice genuinely observable evidence but cannot automatically expose loot, a correct answer, NPC intent or guaranteed success. Actual searching consumes time only after a separate authorized semantic resolution/commit.

Retain existing targeted context/memory routing and priority: committed TEMP runtime -> specific canon -> journals -> GM PREGEN as index. Postgres/pgvector and independent vector memory were not added because they would be an unverified second authority and require new infrastructure. Existing Bearer, URL, save, NPC Life V4, EC-06 feature gates and release settings are unchanged.