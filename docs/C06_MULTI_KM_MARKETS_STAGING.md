# C-06 / EC-06 / SIM-06: Selarin large-market scale boundary

**STAGED VALIDATION ONLY — MANUAL DEPLOY BY OWNER, NOT A GAME TURN**

## Authoritative geography

The Selarin Copy Market, Central Market and South Market are three distinct extensive trading districts. They span multiple streets/blocks, indoor and outdoor businesses, storage, work and delivery spaces. The canonical Selarin city-scale clarification is in LIVE_CANON_INDEX; it does not set a newly invented exact kilometre span.

Existing MAP_EDGES distances connect actual *nodes*, NOT opposite ends of whole market districts. In particular the existing 0.06 km link to Vesha's bookstall and other 0.08–0.17 km nearfield market entries do not establish that the complete market is that small. Preserve established between-district routes and Shura's already traveled route history. A market's large physical extent means no direct teleport between arbitrary stalls.

## Verified data additions

New design-only tabs in existing GM WORLD PREGEN:
- DESIGN_C06_MARKET_SCALE: 3 macro district proposals/scale review entries
- DESIGN_C06_MARKET_SECTORS: 48 significant function sectors, 16 in each of three markets (NOT just 48 stalls and NOT yet surveyed locations)
- DESIGN_EC06_MARKET_ROUTES: 12 examined transport/foot-path proposals, of which 2 are explicitly marked for missing intermediate map verification rather than invented routes
- DESIGN_C06_MARKET_PHASES: 18 daypart load/review entries across markets (not guaranteed vendor openings)
- DESIGN_SIM06_MARKET_PROCESS_GATES: 10 causal process gates, not active WORLD_CLOCKS

All 91 rows have status DESIGN_CANDIDATE and PREGEN_MANIFEST load policy NEVER_IN_LIVE_PLAY. They are not independent prices, stocks, jobs, actors, dungeon finds or new map nodes. Source permanent canon and current runtime remain sole authorities.

## Pure source

src/market_scale_gate.ts:
- inspectMarketScale rejects nonexistent market/nearfield anchors or duplicate macro IDs; reports absent market span as UNKNOWN. Even a separately surveyed geometry can only pass a design preflight: never live-canonized by reading a design row.
- inspectMarketRoute validates every contiguous individually sourced MAP_EDGES leg and restrictions for walking/carts. Travel time, Stamina and survival are explicitly left to the existing RPG semantic engine. Missing intermediary streets and fictitious shortcuts fail.
- selectMarketDesignScope produces at most 8 requested *design ID* references for the current canonical district. It does not materialize a single merchant or expose GM secrets to Shura. Use only in GM authoring or later as a controlled indexed lookup.

## Real simulation and expansion

When later prepared and truly verified, hundreds of providers can belong to the big commercial quarters without requiring a separate per-second AI process for each. Use actual finite goods in one custody ledger, genuinely staffed businesses and actual shifts. Work backlog, weather, supplier delay, spoilage, fire, road closure, actor agency, income limits, price competition and contracts may alter the market independently of Shura. Run only next-due active events or local scene queries, with lazy retrieval of the selected part of the district.

Before a real new street becomes canonical: obtain a surveyed entry, actual attached MAP_EDGES path, physical street length and feasible mode, legal ownership/access, logistic/water/fire limits, and reconcile with prior route facts. Never convert a centre-to-centre 0.5 km route into a new market diameter. Do not infer market-wide store count or population from 48 functional design units.

No game commit, Deno deploy, world clock, Shura action/resources, new permanent vendor, inventory, job or salary from this change.
