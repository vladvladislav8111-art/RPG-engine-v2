# Last writer safety audit: scoped TX KV + ambiguous-error lock retention

The Preview Google read readiness test is **confirmed**, but is **not** a remote writer commit test. The user has authorized testing only the synthetic Preview save `TEST-S1`, never the actual `V2-S0795` save.

## Fail-closed fixes in PR #51

- KV `tx` memo keys now include `TEMP_RUNTIME_ID`: `["tx", workbookId, txId]`. A collision between isolated Preview and Production no longer shares the same memo cache entry if the two timelines use the same managed KV.
- Production writer lease now passes `releaseOnError:false` to the underlying KV lease helper. If a Google Sheets batch is accepted but its response is lost, the writer cannot silently unlock the workbook while the outcome is ambiguous.
- The KV writer lock has **no TTL**. A crashed or ambiguous operation leaves the workbook locked and requires an operator-controlled reconcile-and-recover procedure after ALL old workers are stopped.
- Unit tests using actual local `Deno.openKv(":memory:")` assert two distinct workbooks can lock concurrently with the same TX name, and that a failed uncertain writer keeps the lock against a new writer.

## Not yet proven remotely

An authenticated **Deno Preview commit** after `ALLOW_WRITES` is explicitly enabled for Preview only; semantic `SESSION_LOG` receipt exactly once; Google Doc `[TX:...]` idempotency; post-crash recovery on a new instance; and remote multi-instance KV contention. These must not be treated as passed merely because local CI and Deno read checks pass.

Do **not** bypass the write flag or publish an unauthenticated POST endpoint to force a green result. Do not expose the runtime Bearer key or Production Google file IDs. Keep PR Draft until a suitably authenticated Preview-only runner is available. Nothing here authorizes merging into `main` or a Production deploy.
