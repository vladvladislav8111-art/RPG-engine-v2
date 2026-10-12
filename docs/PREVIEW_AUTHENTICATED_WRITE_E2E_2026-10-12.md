# Authenticated isolated Preview write E2E — fixed transaction runner

`GET /preview/e2e` on **the same existing Deno Preview URL** serves a small same-origin page. It accepts the existing `RUNTIME_API_KEY` locally in the browser and uses the key only in the `Authorization: Bearer` header for a same-origin `POST /preview/e2e/run`. The key is not displayed to ChatGPT, not logged, not stored by the page, and never sent to GitHub. There are no external scripts or requests.

The write action accepts **no caller-supplied transaction input**. It only runs `TEST-PREVIEW-REAL-WRITER-20261012-001` on the exact isolated `TEMP_RUNTIME_ID=1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8`, with `TEST-S1 -> TEST-S2` and one test doc `LIVE_TRANSACTION_ARCHIVE`. All other Google targets are denied by the fixture storage guard.

Before any changes the route requires:
- `config.previewFixture=true` (production returns 404);
- valid **existing** runtime Bearer authorization (otherwise 401);
- `ALLOW_WRITES=true` in Preview **only**, and `ALLOW_RAW_COMMITS=false`;
- actual Deno KV `requireWriterKv()`, tested by independent atomic CAS contender denial.
- `RPG_KV_WRITER_LEASE_ENABLED=false`: route wraps the one test commit in its own CAS lease instead of nested locking.

Then it calls actual engine `prepareCommit` semantic dry-run, `commitTurn`, repeats `commitTurn` with the exact same TX, and verifies one `SESSION_LOG` receipt and one `[TX]` Google Docs marker. Results contain no private game state. Repeated execution should return an idempotent replay, not double-write.

This route is not a general API for accepting arbitrary writes. Do not promote PR to Production; it remains feature-gated by exact synthetic workbook ID. **Before owner activates Preview writes, CI/typecheck must pass and the deployment must be the tested branch.** After the test, owner should return `ALLOW_WRITES=false` for Preview; no duplicated environment variable is needed.

Limits: the KV contention probe exercises real shared Deno KV CAS on one Preview invocation, not independently scheduled processes in two Deno instances. The existing local CI tests exercise a simulated Docs failure/recovery, but a deployed fault-injection run remains a separate release gate.
