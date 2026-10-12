# Preview isolated fixture without duplicated environment variables (2026-10-12)

## Owner setup — no additional variables required

The existing Deno project's **Preview** context already has:
- `TEMP_RUNTIME_ID=1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8`;
- `ALLOW_WRITES=false`;
- `LIVE_SESSION_LOG_ID` pointing to a separate test Doc (now optional/redundant for Preview).

No more per-document `*_ID` overrides are needed. Keep `RUNTIME_API_KEY` and the two Google service-account credential variables in existing safe Deno scopes; never copy secrets into GitHub or a conversation. The existing `GM_PREGEN_ID` is used **read-only** for rules/templates.

The exact synthetic `TEMP_RUNTIME_ID` selects an immutable mapping of all **nine test-only Docs** in `src/preview_fixture.ts`. This routing ignores inherited `All` LIVE_* document IDs in Preview. Any attempted Sheets or Docs read/write outside the approved test IDs fails before issuing a Google API request, with the sole explicit exception of **read-only** GM PREGEN.

Production continues to read its original environment-based Docs IDs: there are no production overrides, no change to the Site, Plugin, Bearer auth, or deployment identity.

## Diagnostics and boundaries

Open the **Preview branch URL** `/`: it shows `previewFixture.storageScope=TEST_ONLY` and `fixtureSaveId=TEST-S1` only when reading the isolated fixture. In production no fixture detail is returned.

Open the Preview URL `/preview/readiness`: a read-only probe checks `CONTROL!B2` and all nine pinned test Google Docs via the deployed service account. It succeeds with HTTP 200 and `ok:true` only if TEST-S1 matches, all Docs are accessible, and `ALLOW_WRITES=false`. If any check fails, the response is 503, and it cannot perform writes. In Production this route responds with 404.

**Not a write-E2E signoff:** a passing readiness check proves real Google service account *reads*, but does not prove distributed Deno KV, Google write transactions, fencing, multi-instance races, or exactly-once recovery. The test TEMP holds synthetic data only; full semantic-world simulation may require more fixture rules. The optional KV writer lease remains off until its fencing limitation is addressed. Never flip the Production switches merely to run Preview tests.

## Review/merge gate

Keep PR #51 Draft, do not merge to main or trigger an intentional Production deployment without owner confirmation. GitHub CI must re-run and pass after changes. No live game state is written by the fixture setup or diagnostics.
