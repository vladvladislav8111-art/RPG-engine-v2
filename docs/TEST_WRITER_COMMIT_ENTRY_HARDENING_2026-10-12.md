# Isolated TEST writer — fail-closed commit entry hardening

Review-only Draft PR #62 improvement following the real TEST-S4 ACK-drop experiment.

**Actual fixture:** the TEST workbook currently contains `TEST-S4`, one V2 SESSION_LOG receipt, 12 synthetic copper and no new Google Doc marker; its permanent KV orphan lock is intentional. Do not re-run, unlock, or complete its Google Docs by hand.

Before preparing any commit or touching Google, `commitTurn` now checks:
- if the workbook is the pinned TEST fixture, that the Deno execution is Preview/Git Branch and that its independent isolated workbook ID matches;
- every document explicitly requested in `docAppends` resolves to a pinned TEST document, before the Sheets stage (Google transport separately guards all other TEST file requests);
- if this is a real write, an explicit TEST writer flag, no RAW commits, write permission and Deno KV must all be present;
- attempts to turn on the TEST writer for any non-TEST workbook are rejected before reads and writes.

Dry-run requests may continue reading their pinned TEST workbook in Preview with `ALLOW_WRITES=false`. Production with its ordinary workbook follows its existing writer path, with no new Google writes in this patch.

Added regression tests for disabled TEST writer despite accidental `ALLOW_WRITES=true`, unpinned requested Docs, unpinned independent workbook ID, and rejection of TEST writer on ordinary workbooks. These are code-only tests and do not touch Google or KV.

**Important:** this is defense-in-depth, not Google Sheets compare-and-swap or a fence that permits an orphan lock to be deleted. A suspended Deno instance can resume after an operator force-clears its lock; no unsafe auto-recovery added.

This change does not enable NPC Heat tiers or create fake historical memories. No Site, Plugin, backend, main merge or Production deploy.
