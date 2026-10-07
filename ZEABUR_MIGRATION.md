# Zeabur stable migration

This branch is the conservative first migration target for the RPG Runtime Bridge.

It intentionally deploys the already verified V2.7.3 engine in an official Deno Docker image instead of changing the runtime and the hosting platform at the same time.

## Zeabur deployment

1. Create a Zeabur Project.
2. Add Service -> GitHub.
3. Select repository `RPG-engine-v2`.
4. Select branch `zeabur-stable-migration`.
5. Zeabur should detect the root Dockerfile automatically.
6. Add the environment variables listed below.
7. Keep `ALLOW_WRITES=false` for the first deployment.
8. Keep `ENABLE_KV=false`; Google Drive/Sheets remain authoritative and cache must be disposable.
9. Deploy.
10. Generate a free `.zeabur.app` domain.
11. Configure health check path `/health`.

## Required variables

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
- ALLOW_WRITES=false
- ENABLE_KV=false

Do not manually set PORT; Zeabur injects it. The Dockerfile declares 8080 only as the image default/exposed port. Runtime code reads the actual PORT environment variable.

## Validation order

Read-only first:
- GET /
- GET /health with runtime auth
- GET /diag/context with runtime auth
- GET /diag/mcp with runtime auth
- POST /context for Max
- POST /context for one dormant NPC
- POST /prepare-commit with dry-run semantics

Only after all checks pass:
- set ALLOW_WRITES=true
- redeploy once
- run one harmless write-capability validation before moving the ChatGPT Runtime Bridge base URL

## Rollback

Do not remove or mutate the Deno Deploy endpoint during the Zeabur test. Switch the ChatGPT Runtime Bridge only after Zeabur passes read-only and write-safe checks.
