# Preview read-only remote KV + dry-run preflight (2026-10-12)

Verified by the owner-provided screenshot of the deployed `/preview/readiness` response:
- `ok: true`, `saveId: TEST-S1`, `writesEnabled: false`, `docTargetsPinned: true`;
- `readable: true` for **all nine** synthetic Docs, checked by the actual Deno Preview runtime's service-account path.

The owner also provided root `/` JSON confirming `previewFixture.storageScope=TEST_ONLY` and `fixtureSaveVerified=true`. This proves deployed remote Google **read access and routing**, not engine writer E2E.

The next Preview revision augments `GET /preview/readiness` with:
- `kvReadable`: calls `requireWriterKv()` then a single **read-only Deno KV get** under the synthetic workbook prefix. This cannot fall back to a memory cache and does not write any KV data. This proves only access to the shared KV interface, not cross-instance CAS or transaction fencing.
- `prepareDryRunPassed`: runs engine `prepareCommit` with a fixed `TEST-S1` raw dry-run and a live `CONTROL!B5` precondition. It cannot write to Sheets/Docs and does not bypass `ALLOW_WRITES=false`.

The route is **Preview fixture only**, requires exact synthetic `TEMP_RUNTIME_ID`, and returns 404 in Production. It cannot execute `commitTurn`. Keep `ALLOW_WRITES=false` until fenced true E2E is developed and explicitly approved. Current writer lease TTL is **not** a Google Sheets fencing token; no production release claims.

Tests: GitHub Actions Deno CI must pass after adding diagnostics. No production data, site, bridge or secrets modified.
