# Preview KV 404 recovery — authenticated, zero-write diagnostics

Added after seeing 404 on the correct pinned revision URL. Old version of PR #61 deliberately returns 404 when any safety gate is false, but does not identify which gate failed.

For a **NEW**, owner-approved Preview revision of PR #61, open:
`https://<new-preview-revision-host>/preview/kv-race/setup`

The static page is available ONLY when Deno supplies `DENO_TIMELINE=preview/...` or `git-branch/...`, regardless of writer feature flag or Development variable mismatch. It asks for the existing runtime Bearer key **only locally on that same-origin page**, then sends one GET request to `/preview/kv-race/diagnostics`. The diagnostic response contains **only booleans** and failed rule NAMES:

- `previewTimeline`
- `probeEnabled`
- `kvEnabled`
- `googleWritesDisabled`
- `rawCommitsDisabled`
- `heatTestWriterDisabled`
- `isolatedTempWorkbook`
- `isolatedWriterWorkbook`

No environment variable values, workbook IDs, tokens, service-account details, private file IDs, Google reads, KV writes or gameplay commits are returned/performed.

The original probe `/preview/kv-race` stays fully fail-closed and cannot proceed unless **all** gates pass. Production `/preview/kv-race/setup` and `/diagnostics` both return 404 even with a valid key. This does not relax security or authorize Production promotion.

If `/setup` also returns 404 on a newly built preview revision, verify that it actually runs this branch/build and that Deno assigned a `preview/...` or `git-branch/...` timeline. Don't change `DENO_TIMELINE` manually, don't move to Production, don't disable isolation rules.

IMPORTANT: Build preview revision URLs are immutable. A code change to the branch creates a different build/revision URL; the old URL still serves the old 404 behavior. Always use the new build's Preview URL.
