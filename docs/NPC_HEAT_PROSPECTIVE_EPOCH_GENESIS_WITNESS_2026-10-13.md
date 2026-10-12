# NPC Life V4 — independent offline TEST epoch genesis witness

A signed TEST V3 receipt protects *one exact committed row*. A signed
predecessor chain protects the order *within a supplied contiguous segment*.
Neither proves where that chain began. This stage introduces a pure,
non-mutating **prospective operator genesis witness** bound to:

- an explicit, isolated TEST workbook;
- previous committed TEST save and first NEW TEST save, TX, turn and clock;
- explicit future TEST epoch ID and TEST row signing key ID;
- independently recorded digests of CONTROL and canonical NPC memory baseline;
- a separate operator HMAC secret, distinct from the row signing secret;
- an externally pinned SHA-256 of the **signed witness** (not a digest
  fetched from the same Google sheet under audit).

The verifier checks the pinned witness, operator HMAC, TEST-only scope,
first row identity, and the existing chained V3 row HMAC audit. Tests
cover altered memories, changed pins or keys, wrong workbook, modified
first turn, missing middle TX, and attempts to use the real V2 save.

**Critical trust boundary:** this software cannot certify that the
operator secret and pin were genuinely provisioned independently of the
recorded sheet. Both are supplied inputs to a pure test function. It cannot
prove old historical V1/V2 facts, complete index/canon continuity, or
the real existence of NPC interactions. Thus every result explicitly
reports `externallyAuthenticatedOrigin=false`, no historical Heat,
no KEY, no XP/SUP and no writer mutation. There is intentionally no
runtime or Preview route and **no new ENV**. Existing TEST-S4 stays
partially committed and KV-locked.

Needed before real adoption: source-backed independent witness
provisioning, trustworthy baseline snapshot proof, exhaustive committed
TX index, key-rotation policy, actor memory corroboration, and explicit
human-reviewed semantic promotion. No Production activation from this.
