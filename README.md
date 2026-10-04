# RPG V2 — Deno Runtime Gateway Prototype

A lightweight non-narrative runtime service for the RPG V2 campaign.

It is designed to remove slow orchestration from ordinary turns while keeping **Google Sheets / Google Docs as authoritative state**.

## Endpoints

- `GET /health` — checks direct access to current TEMP runtime.
- `POST /context` — aggregates current save/time/location/resources/conditions, targeted NPC lines, GM PREGEN lookups and permanent-Doc queries.
- `POST /prepare-commit` — validates `save_id` and exact preconditions, returning a commit manifest without changing Google state.
- `POST /commit` — optional direct authoritative Google write. **Disabled by default** through `ALLOW_WRITES=false`.
- `POST /rng/int` — deterministic seeded integer resolution.

The service never decides Shura's intentions or advances the world by itself.

## Required Google APIs

Enable these in the Google Cloud project used by the service account:

- Google Sheets API
- Google Docs API
- Google Drive API

Create a Google service account, create a key, and share the RPG V2 Sheets/Docs (or the parent folder where appropriate) with the service-account email as **Editor**.

Do not commit the JSON key and do not paste the private key into ChatGPT.

## Deno Deploy setup

Use the current Deno Deploy at `console.deno.com`.

Connect this repository to the Deno app. The entrypoint is:

```
main.ts
```

Add these environment variables / secrets:

```
RUNTIME_API_KEY
ALLOW_WRITES=false
ENABLE_KV=true

GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

TEMP_RUNTIME_ID
GM_PREGEN_ID
LIVE_CANON_INDEX_ID
LIVE_PLAYER_INVENTORY_ID
LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID
LIVE_NPCS_KNOWLEDGE_SOCIAL_ID
LIVE_MAPS_LOCATIONS_STATE_ID
LIVE_WORLD_OPPORTUNITIES_ID
LIVE_PROJECTS_LONGFORM_ID
LIVE_SESSION_LOG_ID
LIVE_TRANSACTION_ARCHIVE_ID
```

The RPG file IDs are already listed in `.env.example`.

Keep `ALLOW_WRITES=false` for the first tests.

## Test order

1. Deploy with writes disabled.
2. Call `GET /health`.
3. Confirm it sees the current canonical save.
4. Call `POST /context` for a MICRO turn.
5. Run `POST /prepare-commit` with `dryRun:true`.
6. Only after repeated clean tests consider `ALLOW_WRITES=true`.

All private endpoints require:

```
Authorization: Bearer <RUNTIME_API_KEY>
```

## Example MICRO context

```json
{
  "turnId":"bench.micro.001",
  "turnClass":"MICRO",
  "tags":["SOCIAL","TRAVEL"],
  "actorIds":[],
  "lookups":[],
  "docQueries":[]
}
```

## Safety model

Google Sheets/Docs remain the canonical game state. Deno KV/cache is disposable.

For direct commits the gateway uses exact SET writes, save preconditions and transaction IDs. Google does not provide one atomic transaction spanning Sheets and Docs, so Doc appends are idempotent using `[TX:<txId>]` markers and the new `save_id` is verified before success is returned.

The intended normal turn path is:

```
1 context call → GM resolution → 1 commit call → render
```
