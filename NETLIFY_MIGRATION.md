# Netlify migration

Target: Netlify Functions on Node.js 24, using the portable V2.8 runtime core.

## Initial deployment settings

- Branch: netlify-migration
- Base directory: leave empty
- Build command: leave empty
- Publish directory: public
- Functions directory: netlify/functions

The repository also contains netlify.toml, which is authoritative after checkout.

## First deployment safety

Set runtime secrets in Netlify before functional testing.
Use Functions scope where Netlify offers scopes.

Initial values:
- ALLOW_WRITES=false
- ENABLE_KV=false
- AWS_LAMBDA_JS_RUNTIME=nodejs24.x

Do not expose Google credentials in repository files or netlify.toml.

Required RPG variables:
- RUNTIME_API_KEY
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
- TEMP_RUNTIME_ID
- GM_PREGEN_ID
- LIVE_CANON_INDEX_ID
- LIVE_PLAYER_INVENTORY_ID
- LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID
- LIVE_NPCS_KNOWLEDGE_SOCIAL_ID
- LIVE_MAPS_LOCATIONS_STATE_ID
- LIVE_WORLD_OPPORTUNITIES_ID
- LIVE_PROJECTS_LONGFORM_ID
- LIVE_SESSION_LOG_ID
- LIVE_TRANSACTION_ARCHIVE_ID

## Validation order

1. GET /
2. authenticated GET /health
3. authenticated GET /diag/context
4. authenticated GET /diag/mcp
5. POST /context for Max with requireNpcContextGate=true
6. POST /context for a dormant NPC
7. POST /prepare-commit only
8. Inspect function duration/compute usage
9. Only after all checks pass, change ALLOW_WRITES=true and redeploy once.

Netlify Functions currently have a 60-second synchronous execution limit and default 1024 MB memory. The RPG fast path should remain far below that after bounded context reads.

The public gateway preserves the same paths expected by the ChatGPT RPG Runtime Bridge.
