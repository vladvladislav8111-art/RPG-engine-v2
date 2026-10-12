# Preview TEST storage pinning and READ-ONLY Google readiness — 2026-10-12

This is a separate Draft stage stacked on PR #61, not a Production release.

The KV probe showed `12/12` contenders rejected but only **one observed JS isolate**. Hence true remote multi-instance safety remains **unproven**. This stage addresses a separate Google E2E blocker: Development `LIVE_*` document IDs can otherwise inherit Production values.

Safety:
- When `DENO_TIMELINE` is Preview/Git Branch and `TEMP_RUNTIME_ID` equals the preexisting isolated TEST workbook, `config.files` resolves all 9 `LIVE_*` document keys to the TEST-only IDs previously introduced for the same Preview fixture in PR #51.
- Independently of timeline, all Google read/write operations in `src/google.ts` fail closed against any non-TEST spreadsheet/Doc ID once `TEMP_RUNTIME_ID` matches the pinned TEST workbook (GM PREGEN is permitted **read-only** as before).
- Ordinary Production runtime with real `TEMP_RUNTIME_ID` keeps existing routing unchanged.
- The authenticated `GET /preview/writer-readiness` works only on Preview with `ALLOW_WRITES=false`, `ALLOW_RAW_COMMITS=false`, `RPG_NPC_HEAT_TEST_WRITER_ENABLED=false`, `ENABLE_KV=true`, and all TEST document destinations pinned. It reads `CONTROL!B2` and tries to read 9 docs using the actual Deno service account. It returns only booleans and TEST-prefixed save ID; no docs content, tokens, Google file IDs or write actions.
- Endpoints remain on existing app and preserve Bearer security. No new Site, Plugin, backend, permission, Deployment promotion, gameplay save or Production changes.

After CI PASS: User can deploy the new branch to Git Branch/Preview ONLY, with Development flags unchanged, then use their Bearer key locally to request `/preview/writer-readiness`. If that passes, a separately reviewed, fixed TEST-only semantic write E2E can be prepared. **Do not set ALLOW_WRITES=true now.**

Full true remote multi-isolate KV proof and ambiguous network response remain separate open release gates.
