# RPG V2 P-06 — Progression contract preflight

Status: **STAGING ONLY; NO GAMEPLAY ACTIVATION; NO DENO DEPLOY.**

## Authoritative sources

- Committed TEMP RUNTIME through RPG Runtime Bridge is sole owner of Shura's General Level, XP, Class Points, specialization progress and selected classes.
- Existing permanent progression canon: 14_PROGRESSION_V2_COMPACT / 03_CHARACTER_PROGRESSION_SYSTEM_TITLES (original class section 26).
- Design candidate indexes in GM WORLD PREGEN: DESIGN_P06_REDUCTION (3 grouped duplicate families), DESIGN_P06_MECHANIC_REVIEW (56), DESIGN_P06_CLASS_FEATURE_REVIEW (58), DESIGN_P06_CLASS_GATE_MATRIX (29). All registered in PREGEN_MANIFEST with NEVER_IN_LIVE_PLAY.
- Detailed mechanical descriptions are still owned by P03/P04/P05. Do not copy them into a second live progression ledger.

## Verified source audit

644 P03 ability templates = 255 stable + 255 detect + 134 transfer. P04 flags all as BLOCK_CANON_PROMOTION. They are learning or ordinary competence/technique outcomes, not separately purchasable powers.

P04 adds 56 unique textual trigger/effect concepts; P05 supplies 58 features across 29 candidate classes. P04/P05 share parent specialization for 32 class-feature rows: this is a collision *review flag*, not proof of literal duplication. Classes must demonstrate independent new operations beyond known abilities; otherwise effects are merged, not sold twice.

## Implemented code contracts (pure only)

- validateLegacyAbilityCollapse: checks source cohort frequencies, unique IDs, and all 644 blocked. Returns 0 independent grants.
- previewCanonicalClassChoice: first ordinary class General Level >= 5, >=1 unspent Class Point, actual class canon & current offer, linked competencies, genuinely demonstrated specialization and prerequisites, verified explicit current player choice. Compatible second class requires General Level >= 10. Does not perform a payment or mutate class ownership.
- previewCanonicalClassFeature: requires an actual canonical purchased class feature, demonstrable trigger, positive elapsed time, current action profile, observed evidence, proven separation from overlapping P04 effect and player activation for an active effect. Passives do not demand a click; no XP or resource accounting duplicated.
- assertNoDraftCatalogActivation: draft tables are not direct ability-grant authorities.

**Never compute live XP, Stamina or Mana here.** These pure functions return preflight findings; actual effects require canonical ability design, valid semantic transaction and engine commit. No invented buffs, multipliers, hidden knowledge, teachers, resources or ability rewards.

## Next release gates

1. Manual mechanical differentiation of shared-feature collisions (32 feature rows), with a testable distinct trigger/effect or a merge.
2. Validate canonical classes and real milestone interactions with 2 active, 2 passive, 1 hybrid options at qualifying competence levels, and preserve class/Path distinction.
3. Map only actually canonized approved features from permanent canon into compiled lookup, never from DESlGN_* directly.
4. Integrate the read-only gate into semantic prepare/commit, verifying atomic class-point consumption, no double reward and a zero-elapsed rejection where relevant.
5. Run Deno type check and all CI tests in branch; test runtime health after user-controlled Deno deployment **only if** release is approved.

## Runtime non-effects

No current state schema, save, class, General XP, specialization stars, resources, NPCs, maps, time or current availability is changed by this PR. No deployment, merged branch, setup secret or triggers are modified.