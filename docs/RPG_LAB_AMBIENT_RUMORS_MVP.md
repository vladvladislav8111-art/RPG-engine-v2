# RPG Lab first-release ambient rumor ledger
`ambientRumorChanges` are confirmed, location-specific event writes stored in `LabSession.ambientRumors`.
Each entry is an unverified claim, not player knowledge or proof. New origins require public evidence; local
retellings require a public interaction; travel to a new area needs an already informed registered NPC
carrying a source trace and taking a witnessed public action on an adjacent route.
No automatic spread, no NPC memory creation, no citywide omniscience. Session cap: 128; turn cap: 8.
The future design for original-NPC promotion lives in `RPG_LAB_NPC_POPULATION_PROMOTION_RUMORS.md`.
Runtime NPC registration has not yet been implemented. Legacy sessions without this field remain valid.
