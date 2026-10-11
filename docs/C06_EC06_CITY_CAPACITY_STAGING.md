# C-06 / EC-06: City-capacity and due-process preflight

STAGING ONLY — NO LIVE MATERIALIZATION OR DEPLOY

## Current sources and verified staging results

Authoritative live context: RPG Runtime Bridge, committed save V2-S0721 (Day 63, 18:21), Selarin Copy Market. Authoritative durable city facts remain LIVE_CANON_INDEX and other owning canon; GM WORLD PREGEN contains derived lookups.

Following tables were written in the existing GM WORLD PREGEN and verified:
- DESIGN_C06_ROLE_ECONOMY: 52 professional links to existing Selarin NPC identities. Where an institution or responsible business is independently documented, that stable ID is included. Otherwise employment is marked unverified.
- DESIGN_C06_INSTITUTION_GATES: 11 existing canonical Selarin institution IDs and actual source-backed known staff references. Named staff are never the total payroll.
- DESIGN_C06_HOUSEHOLD_LIMITS: 16 canonical districts with explicit absence of reliable household/water/food/beds/census numbers. Workplace anchor is NOT evidence of residence.
- DESIGN_EC06_CAUSAL_FLOWS: 20 potential production, custody, service, public safety and clerical economic processes linked only to existing district/faction/business/NPC/board/infrastructure IDs. These are NOT actual product flows, prices, purchases, jobs or NPC actions.

All four PREGEN_MANIFEST rows are DESIGN_CANDIDATE / NEVER_IN_LIVE_PLAY, not new authoritative current-state tables. Source and conservation details are appended to the existing S-01 design doc and registered in 00_START_HERE. Do not infer Selarin has only 67 inhabitants; that number is already indexed distinct named NPC identities, not population census.

## Engineering constraints

src/city_capacity_gate.ts introduces PURE preflight only, with no changes to main.ts or semantic commit code.

1. validateCandidateCityCensus requires unique known resident IDs, unique canonical dwelling units and lawful occupancy, physical beds, verified demand standards, real geographically accessible finite source capacities and protected reserves. Reconciles all households together; two claims cannot spend the same water, food or sanitation budget.
2. previewDueCityProcess uses an already committed active world process, credible actor/case/source, actually observed input, existing approved action ID and a genuine time-advancing player turn with a due world deadline. PREVIEW_ONLY can never mutate world clocks or create paid offers.
3. No new per-person survival constants: water/food/sanitation standards must come from independent approved world canon and be attached as verified evidence. Numerical fixtures are synthetic, not game rules.
4. Physical custody/stock deltas and true docket processing stay in the current semantic engine domain. No NPC gets omniscience, employment or unlimited goods from its staff record or service-hours baseline.

## Release gates

- Resolve actual surveyed housing, distinct households, owners/residents and finite supply delivery before city-population bounds or the requested scale of 250–400 recurring named NPCs.
- Demonstrate actual employer budget, shifts, finite work demand and NPC agency before any new offer materializes.
- Supply real canonical food and water sources and custody before using them as household/production quota; E-06 design drafts never become live stock automatically.
- Integrate into semantic transactions only after a separate atomicity/schema migration review; preserve one current data owner and verify closed clocks never replay.
- CI green on newest PR head, then only user-controlled manual Deno deployment. Never merge this draft in the course of gameplay planning.

No production edits, player choices, time advance, classes, goods, NPCs, relations, contracts or payment from this branch.