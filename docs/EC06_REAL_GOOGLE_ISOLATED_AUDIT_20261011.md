# EC-06 isolated **real Google API** one-shot and Deno read-only probe — PR #40

## Status (2026-10-11)
ISOLATED ONLY. This branch is stacked on PR #39 → #38 → #37 and must **NOT** be merged into production without the missing operational gates. The current game engine, Shura's choices and wallet, NPC/merchant money and items, all CURRENT Google assets and Deno production KV remain untouched.

Two **new copies** of older synthetic test assets were physically created through an authenticated Google Drive connector and reinitialized under a distinct test scope:
- TEST Sheets: https://docs.google.com/spreadsheets/d/1SKcf0KDACaL9RJu2ZfGy61NVZwYpiRdZ9t1K6L9S2Ks/edit
- TEST Docs: https://docs.google.com/document/d/13yQS3aLzOtHSLSnUoM2Cn_fmS1b0z4L-J-NYpzLwNhk/edit
- Scope: `scope.fixture.isolated_one_shot_20261011`
- Synthetic IDs: `tx.fixture.smoke_reserve_001`, `tx.fixture.smoke_pay_002`; only imaginary 70c employer/worker holdings.

**Actual Google connector API writes performed, not merely mocks:**
1. Reinitialized the copied Sheet and Docs with 70 copper employer, 0 worker, empty test wage escrow and two empty receipt slots (physical ownership of copied files verified).
2. A single Sheets batchUpdate atomically wrote reserved employer 40 available / 30 held, reserved escrow, and the exact reserve receipt. An independently revision-guarded Google Docs batchUpdate appended the reserve delta and receipt.
3. After real Google server readback, a second Sheets batchUpdate atomically wrote employer 40 available / 0 held, worker 30 available and paid escrow, and the exact payment receipt. A second revision-guarded Google Docs append materialized the payment delta.
4. Subsequent **fresh** authenticated Google Sheets/Docs readbacks found **two distinct matching receipt identities and journal hashes, one GENESIS, two ordered immutable DOC DELTAs, causal BEFORE/AFTER row agreement, and conserved 70c → 70c**. Paid escrow state `PAID`. No live game writes. The journal digests were computed against *synthetic intended journal objects*, not verified against a running Deno KV primary ledger. Therefore this does not by itself establish true cross-system atomicity.

## Isolated Deno read-only audit service prepared, NOT YET DEPLOYED

`src/ec06_isolated_google_audit_probe.ts` provides a tiny bounded three-GET audit of exactly these two synthetic TX receipts and three bank/escrow rows, and checks the two real Google stores against their ordered archive source with conservation.

`scripts/ec06_isolated_google_audit_server.ts` exposes only **authenticated GET /health and GET /audit**, with immutable physical target IDs fixed in code. There is no POST, commit, mutating Google HTTP method, game clock or Deno KV initialization. It must be deployed to a **separate isolated Deno service** with separate secrets, not the existing RPG server or plugin. It must never re-use the production RPG service account credentials or accessible runtime service secrets.

Environment secrets for a *separate* test Deno instance:
- `EC06_SANDBOX_READONLY=true` is an explicit arm flag.
- `EC06_PROBE_API_KEY`: new independent strong random bearer secret (minimum 24 characters), **not** the existing RPG runtime API key.
- `EC06_GOOGLE_ACCESS_TOKEN`: **short-lived scoped OAuth token** with **read-only Sheets/Docs** grants to these copied files only; revoke/rotate after the run. This is deliberately NOT a long-lived Google private key.
- `PORT=8001` (optional; adapt to hosting port).

Deploy entrypoint `scripts/ec06_isolated_google_audit_server.ts`. Connect only to the copied Sheet and Doc IDs baked into that source; the code rejects all other Google endpoints. Call `GET /health` then `GET /audit` with `Authorization: Bearer <isolated-key>`. Never paste secrets into this document or GitHub PR.

If OAuth/permission access is unavailable, fail closed: do NOT make a token with broader production authority. OAuth access tokens are expiring and this is a one-shot audit; the service is not a continuously running production worker.

## Coverage boundaries

- GitHub Actions checks unit-level mock HTTP of this Deno audit, including forged receipts, divergent row and causal order rejection. CI passing is not proof of a deployed Deno instance.
- The actual Google API writes were performed by **Google Drive connector tools** and independently read back; the copied files have real Google revision IDs. This is not a claim that any staging Deno service issued those writes, or that the runtime's real primary Deno KV journal was reconciled.
- No independently operated quiescence/drain controller exists. The HELD writer fence is **never** automatically unlocked and must not be circumvented by this probe.
- Google Sheets lacks external compare-and-set; Docs append guards are per document; real atomicity of a sale spanning both stores remains NOT proven.
- Unbounded Google Docs history reconstruction is still a performance and operations blocker. Production also lacks a verified one-time migration from CURRENT NPC funding/physical stock, the full queue worker scheduler and exclusive writer cutover.
- This is a diagnostic step toward separately deploying a true, source-funded Deno KV + Google integration test, not the deployment itself.
