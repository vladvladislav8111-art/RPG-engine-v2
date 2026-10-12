/**
 * Opt-in bridge from test-only V2 content-bound checksums to legacy
 * envelope checks. The caller's Google bytes are immutable; projected
 * normalization is held in memory only. NEVER upgrades social Heat.
 */
import { auditNpcHeatJournal, type JournalAuditRequest } from "./npc_heat_journal_audit.ts";
import { npcHeatStateHashV2 } from "./npc_heat_receipt_writer.ts";
import { hash32 } from "./rng.ts";

function val(x: unknown) { return String(x ?? "").trim(); }
function failClosed(input: JournalAuditRequest, reason: string) {
  // Preserve the existing conservative packet shape on hard failure.
  const base = auditNpcHeatJournal({ ...input, stableAfterRead: false });
  return { ...base, status: reason, testV2DigestMatches: 0,
    testV2DigestRequired: true, testV2CryptographicallyAuthenticated: false as const };
}
export async function auditNpcHeatJournalIncludingTestV2(input: JournalAuditRequest) {
  if (!input.stableAfterRead)
    return { ...auditNpcHeatJournal(input), testV2DigestMatches: 0,
      testV2DigestRequired: true, testV2CryptographicallyAuthenticated: false as const };
  const cols = input.header.map(val);
  // Fail over to exact existing checks for ordinary/invalid header schemas.
  if (cols.length < 16 || cols[9] !== "World advances JSON" ||
      cols[13] !== "State hash" || cols[15] !== "Version") {
    return { ...auditNpcHeatJournal(input), testV2DigestMatches: 0,
      testV2DigestRequired: true, testV2CryptographicallyAuthenticated: false as const };
  }
  let matched = 0;
  const normalized: unknown[][] = [];
  for (const incoming of input.rows) {
    const row = [...incoming];
    if (val(row[15]) !== "2") {
      normalized.push(row);
      continue;
    }
    const save = val(row[0]), txId = val(row[2]),
      end = val(row[4]), scene = val(row[5]);
    const exactJson = String(row[9] ?? "");
    const stored = val(row[13]).toLowerCase();
    if (!/^TEST-[a-z0-9._-]+$/i.test(save) ||
        val(row[14]) !== "ENGINE_FASTPATH" ||
        !/^sha256:[a-f0-9]{64}$/.test(stored) ||
        exactJson.length > 262144 || !txId || !end || !scene) {
      return failClosed(input, "TEST_V2_SOURCE_SCOPE_OR_SCHEMA_INVALID");
    }
    let world: unknown;
    try { world = JSON.parse(exactJson); } catch {
      return failClosed(input, "TEST_V2_WORLD_JSON_INVALID");
    }
    if (!world || typeof world !== "object" || Array.isArray(world) ||
        (world as Record<string, unknown>).engineNpcReceiptEpoch !== "TEST_ONLY_V2")
      return failClosed(input, "TEST_V2_RECEIPT_EPOCH_MISMATCH");
    const digest = await npcHeatStateHashV2({
      saveTo: save, inworldEnd: end, sceneId: scene,
      txId, worldAdvancesJson: exactJson,
    });
    if (digest !== stored) return failClosed(input, "TEST_V2_STATE_DIGEST_MISMATCH");
    matched++;
    // Reuse all existing per-TX, actor/scene/clock/window/collision validation
    // without editing source rows or writing an alternate authoritatve record.
    row[13] = hash32([save, end, scene, txId].join("|")).toString(16);
    row[15] = 1;
    normalized.push(row);
  }
  const audited = auditNpcHeatJournal({ ...input, rows: normalized });
  return { ...audited, testV2DigestMatches: matched, testV2DigestRequired: true,
    // SHA-256 is unkeyed; the checksum cannot prove actual writer identity.
    testV2CryptographicallyAuthenticated: false as const };
}
