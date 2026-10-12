# Remote shared KV contention probe — isolated Preview only

Added a small authenticated test page at `/preview/kv-race`. It runs only when the exact synthetic fixture is configured and **Google ALLOW_WRITES=false**. It uses the existing runtime Bearer auth, entered locally in browser. No key values are logged or sent to ChatGPT; all requests are same-origin.

A holder HTTP request acquires an actual deployed Deno KV CAS lock and holds it for 10 seconds; the client polls an authenticated read-only status route until the lock is observed, then sends **12 independent concurrent HTTP requests** attempting the same CAS key. The test returns how many contenders were rejected and how many **distinct Deno JS-instance IDs** were observed. The lock is released on successful completion; no Google Sheets/Docs writes are performed, and KV keys are scoped to unique synthetic UUID-prefixed workbook names.

**Interpretation:** `ok=true` and `contendersRejected=12` proves remote deployed KV CAS arbitration across concurrent HTTP requests. `differentDenoInstancesObserved=true` is evidence that more than one JS isolate participated; if false, do not claim a multi-instance test. The engine cannot force Deno Deploy to allocate two independent server instances from user space.

**Release gate:** this probe does not inject an actual network failure during a Google Sheets/Docs writer commit. Recovery on remote Deno after failure still requires a distinct controlled test. The feature flag for Production remains disabled. The test is not invoked automatically and does not change any current game data.
