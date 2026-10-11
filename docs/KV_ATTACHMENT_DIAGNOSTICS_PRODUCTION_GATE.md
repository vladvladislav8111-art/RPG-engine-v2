# RPG V2 — verifying newly attached Deno KV, without touching game economy

**Scope:** single runtime diagnostics PR from `main`, independent of unfinished EC-06 staging PRs #36–#43. Do not automatically deploy or merge this PR.

The user-visible Deno Deploy database instance `rpg-v2-kv` was shown as **Deno KV / Connected**. This confirms registration/assignment in the shown organization; it is **NOT** evidence yet that the existing deployed RPG runtime endpoint uses that exact app/timeline/database. Existing `/health` probes the Google Sheets save, not Deno KV.

Official Deno Deploy new platform:
- https://docs.deno.com/deploy/reference/databases/
- https://docs.deno.com/deploy/reference/deno_kv/
- `Deno.openKv()` automatically selects the managed logical database assigned to the currently executing app/timeline. Separate logical databases exist for production and each Git branch, so a branch canary never proves production has a canary.

## New diagnostics (nothing is installed by opening this PR)

`GET /diag/kv` — guarded by the **existing** `RUNTIME_API_KEY` Bearer auth and never writes:
- `kvReadSucceeded`: `Deno.openKv()` and reading ONE fixed diagnostic key succeeded.
- `deployDetected`, `appSlug`, `revisionId`: safe nonsecret host markers to correlate the HTTP origin/timeline. Do not infer a database's GUID from these.
- `canary.present` and `canary.marker`: empty if the one-time test has never been run in this timeline.
- `persistentAcrossRevisionsVerified` is **always false** in the endpoint by design: verifying this requires comparing the SAME marker between two *separate deployed revisions* of the SAME timeline. Do not claim one-process readback proves persistence.
- Errors are sanitized as `kv_disabled` or `kv_unavailable`, with **NO in-process memory fallback**.

`POST /diag/kv/canary` — disabled unless the operator has **independently** set `RPG_KV_DIAG_ALLOW_WRITE=true` in the runtime's environment; also uses existing Bearer auth and requires `ENABLE_KV=true`:
- Creates exactly **one** Deno KV record at `[\"rpg-v2\",\"diag\",\"attachment-persistence-canary\",\"v1\"]` using a `versionstamp:null` atomic CAS.
- The record has only schema tag and randomly created UUID marker. No game IDs, save time, economics, inventory, NPC funds, credentials, external Sheets or Docs.
- Repeated calls only read and return the original marker; no time-based TTL or repeated value overwrite. An unexpected occupied key HALTS without overwrite.
- No cleanup endpoint is added, preventing accidental deletion of the persistence evidence. This tiny technical record is deliberately permanent.
- Neither GET nor POST opens the EC-06 ledger, rebuilds financial journals, releases HELD writer locks or moves Shura's money.

## Suggested deliberate validation when ready

1. Read-only: verify in Deno console that the app assignment points to the production app and examine the production timeline's active revision and hostname. Do not confuse a branch or preview timeline with production.
2. After reviewing and explicitly authorizing merge/deployment of this small diagnostics-only PR, call authenticated `GET /diag/kv` against the **actual deployed app origin**, via server-side authentication. Never paste the runtime Bearer secret into chat, URLs or screenshots.
3. If `kv_disabled`, inspect deployed `ENABLE_KV`. If `kv_unavailable`, inspect the app's database assignment and function logs. Do not silently fall back to memory.
4. If successful and a one-time persistent check is warranted, explicitly enable `RPG_KV_DIAG_ALLOW_WRITE=true`; call authenticated POST once. Record the **marker only**. Disable the flag again.
5. Call GET again after deploying a **new revision on the SAME production timeline**. The marker must match. Do not switch to a branch/preview timeline; Deno isolates those databases.
6. Only then treat *KV persistence for that app/timeline* as demonstrated. It still does NOT prove source-funded NPC finance migration, old writer shutdown, Google editor exclusion or safe automatic lock recovery.

## What this does not do

- No automatic database attachment or provisioning.
- No actual use of the attached production DB until a reviewed build is deployed and an authorized caller performs the diagnostic.
- No auto migration of stale `src/cache.ts` process-memory state into Deno KV. A newly attached KV may be empty.
- No EC-06 drafts merged, no new separate service, no Google Docs/Sheets writes, no `commitTurn` and no game-clock advancement.

## Tests and CI

`tests/kv_attachment_probe_test.ts` uses `Deno.openKv(\":memory:\")` only, covering first write, stable versionstamp, identical repeated read, CAS race, no extra keys, malformed-key refusal and the existing HTTP authentication + disabled-by-default writer. GitHub Actions on the PR must pass before any deploy is considered.
