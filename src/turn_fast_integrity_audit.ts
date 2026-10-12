/** Precommit audit with zero additional Google/API calls.
 * Historical malformed milestone options are a diagnostic, not a silent
 * reason to block unrelated turns. Newly touched choices fail closed.
 */
type Rows = unknown[][];
type AuditInput = {
  txId: string;
  oldDay: number; oldTime: string; newDay: number; newTime: string;
  elapsedSeconds: number; sessionStart: string; sessionEnd: string;
  resources: Rows; pendingChoices: Rows;
  /** IDs of choices whose options/status changed in THIS semantic turn. */
  modifiedChoiceIds?: readonly string[];
  /** Selected choices are deliberately DELETED from PENDING_CHOICES hot state. */
  resolvedChoiceIds?: readonly string[];
  inventory?: Rows; inventoryChanged: boolean;
  requiredProcessIds?: readonly string[]; resolvedProcessIds?: readonly string[];
  requiredNpcIds?: readonly string[]; resolvedNpcIds?: readonly string[];
};
const str = (x: unknown) => String(x ?? "").trim();
const CORE_RESOURCES = new Set(["HP", "Stamina", "Mana", "General XP", "Satiety", "Hydration", "Money copper", "SUP"]);
function asStamp(x: string): number | null {
  const m = x.match(/^Day\s*(\d+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
  if (!m) return null;
  const day = Number(m[1]), h = Number(m[2]), min = Number(m[3]), sec = Number(m[4] ?? 0);
  if (day < 1 || h > 23 || min > 59 || sec > 59) return null;
  return day * 86400 + h * 3600 + min * 60 + sec;
}
function records(rows: Rows): Record<string, unknown>[] {
  if (!rows?.[0]) return [];
  return rows.slice(1).filter(row => row.some(x => str(x) !== "")).map(row =>
    Object.fromEntries(rows[0].map((k, i) => [str(k), row[i] ?? ""])));
}
function numeric(x: unknown): number | null {
  const t = str(x); if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function auditPreparedTurn(input: AuditInput) {
  function fail(reason: string): never { throw Error("TURN_INTEGRITY_AUDIT:" + reason); }
  if (!input.txId.trim()) fail("TX_ID_MISSING");
  if (!Number.isSafeInteger(input.elapsedSeconds) || input.elapsedSeconds < 0)
    fail("INVALID_DURATION");
  const before = asStamp("Day" + input.oldDay + " " + input.oldTime);
  const after = asStamp("Day" + input.newDay + " " + input.newTime);
  if (before === null || after === null || after - before !== input.elapsedSeconds)
    fail("WORLD_CLOCK_ADVANCE_MISMATCH");
  const sessionBefore = asStamp(input.sessionStart), sessionAfter = asStamp(input.sessionEnd);
  if (sessionBefore !== null && sessionBefore !== before) fail("SESSION_START_MISMATCH");
  if (sessionAfter !== null && sessionAfter !== after) fail("SESSION_END_MISMATCH");
  const warnings: string[] = [];
  if (input.sessionStart && sessionBefore === null) warnings.push("SESSION_START_FORMAT_UNRECOGNIZED");
  if (input.sessionEnd && sessionAfter === null) warnings.push("SESSION_END_FORMAT_UNRECOGNIZED");

  const usedResources = new Set<string>();
  for (const row of records(input.resources)) {
    const key = str(row["Resource"]); if (!key) continue;
    if (usedResources.has(key)) fail("DUPLICATED_PLAYER_RESOURCE:" + key);
    usedResources.add(key);
    const value = numeric(row["Current"]);
    if (value === null) {
      if (CORE_RESOURCES.has(key)) fail("NONFINITE_CORE_RESOURCE:" + key);
      warnings.push("UNKNOWN_NONCORE_RESOURCE:" + key);
    } else if (CORE_RESOURCES.has(key) && value < 0) fail("NEGATIVE_PLAYER_RESOURCE:" + key);
  }
  const modified = new Set(input.modifiedChoiceIds ?? []);
  const resolved = new Set(input.resolvedChoiceIds ?? []);
  if (modified.size !== (input.modifiedChoiceIds ?? []).length ||
      resolved.size !== (input.resolvedChoiceIds ?? []).length)
    fail("DUPLICATE_CHOICE_EVENT_IDS");
  for (const id of modified) if (!id || resolved.has(id))
    fail("CHOICE_PUBLISHED_AND_RESOLVED_SAME_TURN:" + id);
  for (const id of resolved) if (!id) fail("EMPTY_RESOLVED_CHOICE_ID");
  const encountered = new Set<string>();
  for (const row of records(input.pendingChoices)) {
    const id = str(row["Choice ID"]); if (!id) continue;
    if (encountered.has(id)) {
      if (modified.has(id)) fail("DUPLICATE_TOUCHED_MILESTONE_CHOICE:" + id);
      warnings.push("DUPLICATE_LEGACY_CHOICE:" + id);
      continue;
    }
    encountered.add(id);
    if (str(row["Status"]).toUpperCase() === "AWAITING_CHOICE") {
      let parsed: unknown = null;
      try { parsed = JSON.parse(str(row["Options JSON"])); } catch { /* report below */ }
      const valid = Array.isArray(parsed) && parsed.length >= 2 && parsed.length <= 4;
      if (!valid) {
        if (modified.has(id)) fail("INVALID_TOUCHED_MILESTONE_OPTIONS:" + id);
        warnings.push("LEGACY_CHOICE_OPTIONS_REQUIRE_REPAIR:" + id);
      }
    }
  }
  for (const id of modified) if (!encountered.has(id)) fail("TOUCHED_MILESTONE_CHOICE_NOT_FOUND:" + id);
  // The semantic writer persists the selection in MILESTONES/SESSION_LOG and
  // intentionally clears the hot pending row. Reject only a choice still pending.
  for (const id of resolved) if (encountered.has(id)) fail("RESOLVED_MILESTONE_STILL_PENDING:" + id);

  let inventoryChecked = false;
  if (input.inventoryChanged) {
    if (!input.inventory?.[0]) fail("INVENTORY_SOURCE_MISSING");
    const owned = new Set<string>();
    for (const row of records(input.inventory ?? [])) {
      const id = str(row["Item ID"]); if (!id) continue;
      if (owned.has(id)) fail("DUPLICATE_ITEM_INSTANCE:" + id);
      owned.add(id);
      const qty = numeric(row["Qty"]);
      if (qty === null || qty < 0) fail("INVALID_ITEM_QUANTITY:" + id);
      if (qty > 0 && (!str(row["Custodian"]) || !str(row["Location/container"])))
        fail("ITEM_CUSTODY_UNSPECIFIED:" + id);
    }
    inventoryChecked = true;
  }
  const resolvedProcesses = new Set(input.resolvedProcessIds ?? []);
  for (const id of input.requiredProcessIds ?? [])
    if (!resolvedProcesses.has(id)) fail("UNRESOLVED_WORLD_PROCESS:" + id);
  const resolvedNpcs = new Set(input.resolvedNpcIds ?? []);
  for (const id of input.requiredNpcIds ?? [])
    if (!resolvedNpcs.has(id)) fail("UNRESOLVED_KEY_NPC:" + id);
  return {
    schema: "PRECOMMIT_FAST_INTEGRITY_AUDIT_V2",
    ok: true, reusedLoadedRows: true, extraSourceRequests: 0, txId: input.txId,
    warnings, legacyDiagnosticsOnly: warnings.filter(x => x.includes("LEGACY")),
    checks: ["time_corresponds_to_elapsed", "session_clock_consistent", "resource_uniqueness",
      "resource_nonnegative", "touched_milestone_options_valid", "resolved_milestone_hot_row_removed", "world_process_coverage",
      "key_npc_coverage", ...(inventoryChecked ? ["item_instance_unique_custody"] : [])],
    itemRowsChecked: inventoryChecked,
    limitations: ["Preexisting milestone option issues are signaled and require separate repair",
      "Not a proof of the EC-06 NPC ledger or Google/KV exclusive writer",
      "NPC decisions, skill novelty and physical custody still need source validation"],
  };
}
