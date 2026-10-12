# Remote KV CAS read-only probe — isolated existing Deno Preview only

**Stacked on Draft PR #60; no new project, Site, Plugin, or backend.** This adds three guarded endpoints to existing `src/http.ts` and a static browser test UI. The test uses Deno KV only; **zero Google Sheets/Docs writes**.

## Critical Development environment gate (must check before Deploy)

Deno `Production` and `Development` are different runtime env contexts. Set/verify these values **in Development only** after confirming the correct target:

| Name | Development requirement |
|---|---|
| `TEMP_RUNTIME_ID` | `1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8` (pre-existing isolated test spreadsheet) |
| `RPG_NPC_HEAT_TEST_WORKBOOK_ID` | Exact same isolated spreadsheet ID |
| `ENABLE_KV` | `true` |
| `ALLOW_WRITES` | `false` |
| `ALLOW_RAW_COMMITS` | `false` |
| `RPG_NPC_HEAT_TEST_WRITER_ENABLED` | `false` |
| `RPG_PREVIEW_KV_RACE_ENABLED` | `true` |
| `RUNTIME_API_KEY`, Google service account settings | Preserve the existing configured Development secrets; NEVER paste them into chat |

**DO NOT change Production env vars, merge to main, or promote the build to Production.** If Deno Deploy offers only a Production target, STOP: do not click. Preview probe additionally verifies `DENO_TIMELINE` starts `preview/` or `git-branch/` and two workbook IDs equal the pinned synthetic ID. Any mismatch returns 404; no KV opens.

## Steps after explicit owner-approved Preview-only deployment
1. In the existing Deno app, deploy the branch `feat/npc-heat-preview-kv-probe-20261012` to **Git Branch / Preview timeline** only. Do not use the Production deployment action.
2. Open `https://<branch-preview-host>/preview/kv-race` (no credentials on GET).
3. On that page enter the existing Bearer key **locally in the page only** and press run. It sends one holder and twelve competing authenticated same-origin HTTP calls. Do not send the key to ChatGPT.
4. Report only the output `ok`, `contendersRejected`, `totalContenders`, `distinctDenoInstancesObserved`, `remoteCrossInstanceEvidence`. No key should appear in the output.
5. `ok=true`, `contendersRejected=12` shows remote CAS contention during a held lock. `distinctDenoInstancesObserved > 1` is the additional required evidence of two separate JS isolates. If 1, do **not** claim multi-instance tested.

The probe does not exercise the semantic writer, Sheets/Docs or crash recovery and cannot alone authorize NPC Heat tiers, EC-06 or Production rollout.
