# Netlify production runtime

Production target: Netlify Functions on Node.js 24, using the V2.8 portable/bounded runtime core.

## Deployment

- Production code should track `main` after the migration branch is merged.
- Base directory: empty
- Build command: empty
- Publish directory: `public`
- Functions directory: `netlify/functions`
- `netlify.toml` is authoritative after checkout.

Required secrets/config:

- `RUNTIME_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `TEMP_RUNTIME_ID`
- `GM_PREGEN_ID`
- `LIVE_CANON_INDEX_ID`
- `LIVE_PLAYER_INVENTORY_ID`
- `LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID`
- `LIVE_NPCS_KNOWLEDGE_SOCIAL_ID`
- `LIVE_MAPS_LOCATIONS_STATE_ID`
- `LIVE_WORLD_OPPORTUNITIES_ID`
- `LIVE_PROJECTS_LONGFORM_ID`
- `LIVE_SESSION_LOG_ID`
- `LIVE_TRANSACTION_ARCHIVE_ID`

Production:
- `ALLOW_WRITES=true`
- `ALLOW_RAW_COMMITS=false`
- `ENABLE_KV=false`

Deploy Previews / Branch Deploys:
- `ALLOW_WRITES=false`
- `ALLOW_RAW_COMMITS=false`

The cache is disposable. Correctness comes from Google state, save/turn-token preconditions, SESSION_LOG idempotency, and TX-marked document appends.

## Endpoints

The ChatGPT RPG Runtime Bridge uses authenticated REST endpoints:

- `/health`
- `/context`
- `/prepare-commit`
- `/commit`
- `/rng/int`

`/mcp` remains available for trusted clients but requires the same runtime Bearer key. There is no anonymous/capability-token MCP route in production.

## Commit policy

Ordinary gameplay uses semantic `commit_turn`.

Raw `sheetWrites` commits are a migration/repair escape hatch only and are rejected unless `ALLOW_RAW_COMMITS=true` is deliberately enabled for the maintenance window.

Cross-document recovery is idempotent: if the authoritative Sheets/SESSION_LOG portion committed but a later permanent-canon append failed, replaying the same transaction retries requested document appends by `[TX:<txId>]` marker before completion is reported.

## Validation order after a deploy

1. `runtime_health`
2. compact `get_turn_context`
3. explicit remote KEY NPC context gate
4. dormant NPC rematerialization packet
5. `render_current_hud`
6. semantic `prepare_turn`
7. first real semantic commit as a canary, followed immediately by health/context/HUD verification

Never advance game time for infrastructure-only validation.
