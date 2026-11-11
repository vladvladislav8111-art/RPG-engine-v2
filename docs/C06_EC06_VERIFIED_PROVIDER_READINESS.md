# RPG V2 — C-06 / EC-06: verified urban homes, employers and finite stock

**DESIGN ONLY. No production data migration. No game turn. Owner manually deploys Deno.**

## Primary source and provenance

The authority for current Shura tenancy, paid/unpaid opportunities, actual item quantities, world clocks, NPC actions and cash is the committed RPG Runtime Bridge state / TEMP RUNTIME V2-S0721. Long-term place identity belongs to LIVE_CANON_INDEX. GM WORLD PREGEN is a derived index and never a second current truth.

The sources were checked against the actual Google Drive records (not invented city demographics):

- 8 old physically present eastern residence site IDs from SERVICES_CURRENT. These locations' existence (not present vacancy, dwelling unit size or a new map road) has been recovered in LIVE_CANON_INDEX. Shura's existing Rennar upper gallery tenancy and 65c pledged deposit remain ONLY in committed current state.
- 6 current canonical Selarin BUSINESS records and 3 actually visited specialized shop sources tied to existing NPC_CURRENT identities.
- 33 previous Selarin player opportunity rows from 18 distinct employer/payee descriptions. Exactly 8 such groups match a currently indexed persistent NPC ID; the rest are transient or unnamed descriptive sources. None is auto reopened or offered.
- 13 physical item records outside Shura custody, linked by ID ONLY; among these are personal Vesha gifts, a bought used bow held by Herna and a Shura-owned diagram on temporary loan to Herna. These are not all shop stock. Quantity and custody remain solely in current INVENTORY_CURRENT.

Existing GM WORLD PREGEN staging indexes, all in PREGEN_MANIFEST / DESIGN_CANDIDATE / NEVER_IN_LIVE_PLAY:
- DESIGN_C06_RESIDENCE_EVIDENCE: 8
- DESIGN_C06_PROVIDER_SOURCE_LINKS: 9
- DESIGN_EC06_EMPLOYER_CASES: 18
- DESIGN_EC06_CUSTODY_ITEM_POINTERS: 13

**Total: 48 source-indexed observations, not newly created entities.** No new NPC, landlord, employer balance, store stock, housing vacancy, family, wage, price or permanent route length.

## Pure checks in this branch

src/selarin_economic_admission.ts is read-only; it neither writes nor calculates gameplay amounts for the runtime.

1. verifyExistingLeaseConflicts: only previously verified lease IDs, signed current proof, canonical property AND distinct room/bed-unit identities with nonoverlapping time intervals. A building doesn't automatically imply a bed, and a historical Day40 offer cannot be treated as a present free unit. No rent, pledge, keys or times are charged by the check.
2. previewFiniteLaborOffers: proven current employer funds and committed ledger revision, actual distinct task demand and approved staffed work slots, wage reservation across *all* concurrent offers under the same finite employer budget. A previously completed or currently existing paid job cannot be replayed via a reusable job template or an index. No offers posted, employee chosen or cash paid here.
3. previewFiniteMarketStock: one physically indexed current item batch, one custodian, one location, lawful seller authority and sale rights (PRIVATE/BAILMENT/CONSIGNMENT_REVIEW must not become shelf stock), plus shared finite sales allocation across many offers. Does not compute seller inventory from old quotes or take Shura's player decisions.

### Implementation limits

- These functions are not yet connected to the semantic runtime prepare/commit route. It would be misleading to claim they enforce live transactions until schema-aware integration and dry-run tests.
- All numeric examples in tests are synthetic and NOT canonical Selarin population, price, wage, stock or economic capacity.
- Long-term NPC public facts and current private knowledge must not be conflated.
- An additional permanent address identity does not establish a measured footpath. Existing Selarin canonical MAP_EDGES and market scale must be respected before routing a real scene.

### Next gates

For actual economic transactions: integrate source proof and unchanged ledger revision with semantic prepare->validate->commit, atomically reserve/pay/refund and transfer individual custody once. Use real physical stock, employer funds, known residents and source-backed shifts. Test rolling back partial failures and stale snapshot conflicts. Reuse pending WORLD_CLOCKS rather than spawning duplicate clock rows for a business.

Owner must review and manually trigger Deno production deployment. NO PR merge, secret access, automatic deployment or save mutation from this staging work.
