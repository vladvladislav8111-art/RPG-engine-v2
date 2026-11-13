# NPC Living World v0.2: pragmatics + causal personality continuity

Status: **READ_ONLY_PROPOSALS**, additive to NPC Life V4 / World Simulation V3.

## Purpose
ChatGPT plays the psychological, comedic and narrative interpretation. Deno bounds *claims* and protects provenance, knowledge and change causality. No deterministic function can prove someone understood a joke from words alone. No neural language understanding is delegated to Deno.

## Integration: no new MCP tools
Use existing `simulate_world_v3` with `operation:"npc_decision"`, and optional nested `payload.lifeV4`:

- `kind:"pragmatics_review"`, `input:{actorId,speakerId,utteranceRef,perceivedByNpc,languageComprehension,contextSourceRefs,candidateReadings}`.
- `kind:"continuity_review"`, `input:{actorId,baselineCanonRef,previousPattern,proposedPattern,scope,towardActorId?,causalExplanation,evidence,observedBehaviorRef}`.

Read the exported types in `src/npc_pragmatics_v1.ts` and `src/npc_personality_continuity_v1.ts`. Old `lifeV4` kinds and legacy decision jobs remain intact.

## Semantic/psychological limits
- Interpretations and evidence refs are GM proposals. SourceAttested=false and Committed=false; the actual NPC must independently hear, know and act.
- Perceiving playful tone is not understanding unknown foreign words or alien cultural references.
- No forced flirtation, comprehension, jokes or predetermined lines.
- Stable trait change requires significant personally available experiences across independent days, or independently supported landmark experience. Never infer reciprocity from a directed relation.
- `eligibleForHumanReview` is NOT a canonical trait rewrite. Existing permanent canon promotion and semantic writer are required.
- No gametime, money, inventory, status, XP, NPC activity or Shura save writes.

## Acceptance
Ten unit tests cover teasing, foreign-language gates, cultural knowledge, unheard speech, duplicate evidence, routine events, two-day stability, landmark exception and actor ignorance. Gate production on full Deno CI and a single reviewed merge, preserving Deno URL, plugin identity, KV and existing save. After deployment use only runtime_health/get_turn_context and a zero-time read-only proposal. Do not call commit_turn for infrastructure tests.

## ChatGPT Projects behavior reminder
Use the canonical character's *whole* personality, not slogans. In context, distinguish literal meaning, playful tone, sarcasm, irony, double meanings, referenced culture, own agenda and group banter. Allow a character to understand and not respond. Emotional state can change quickly; relationships may change through real encounters; enduring personality changes need causal continuity. The actor's past and knowledge remain specific to that actor. Offscreen processes must not be disclosed without an in-world information path.
