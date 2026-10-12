import type { SemanticCommitPlan } from "./types.ts";
import type { CommittedNpcAttentionEvent } from "./npc_attention_ladder.ts";

/**
 * Experimental writer path. Do NOT activate against existing V2-S... gameplay
 * or a real TEMP workbook. The current writer has no proven remote 2-instance
 * fenced exclusion; a content hash does not solve that problem.
 */
export function requireIsolatedHeatWriter(input: {
  enabled: boolean;
  workbookId: string;
  isolatedWorkbookId: string;
  expectedSaveId: string;
  saveTo: string;
  source?: string;
}): boolean {
  if (!input.enabled) return false;
  if (!input.isolatedWorkbookId || input.workbookId !== input.isolatedWorkbookId ||
      !input.expectedSaveId.startsWith("TEST-") ||
      !input.saveTo.startsWith("TEST-") ||
      input.expectedSaveId === input.saveTo ||
      (input.source != null && input.source !== "ENGINE_FASTPATH")) {
    throw Error("NPC_HEAT_TEST_WRITER_ISOLATION_GATE");
  }
  return true;
}

/** Never accept the caller's synthetic engine receipts or digest. */
export function scrubCallerHeatProvenance(
  worldAdvances: unknown,
): Record<string, unknown> | null {
  if (!worldAdvances || typeof worldAdvances !== "object" ||
      Array.isArray(worldAdvances)) return null;
  const copy = { ...(worldAdvances as Record<string, unknown>) };
  delete copy.engineNpcAttentionReceipts;
  delete copy.engineNpcReceiptIntegrity;
  delete copy.engineNpcReceiptDigest;
  delete copy.engineNpcReceiptEpoch;
  return copy;
}

const actorIdOk = (id: string) => /^npc\.[a-z0-9_.-]+$/i.test(id);
const kinds = {
  presence: "SCENE_PRESENCE",
  social: "SUBSTANTIVE_EXCHANGE",
  meaningful: "MEANINGFUL_RELATIONSHIP_EVENT",
} as const;
export function deriveEngineHeatReceipts(input: {
  txId: string;
  day: number;
  time: string;
  sceneId: string;
  knownNpcIds: readonly string[];
  semantic: SemanticCommitPlan;
}): CommittedNpcAttentionEvent[] {
  if (!input.txId || !Number.isSafeInteger(input.day) || input.day < 1 ||
      !/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(input.time) ||
      !input.sceneId) throw Error("NPC_HEAT_INVALID_WRITER_CLOCK");
  const known = new Set(input.knownNpcIds.filter(actorIdOk));
  const seen = new Map<string, CommittedNpcAttentionEvent>();
  const record = (
    actorId: string, kind: CommittedNpcAttentionEvent["kind"],
    ref: string, peers: string[] = [], meaning?: string,
  ) => {
    if (!known.has(actorId) || !ref || ref.length > 512) return;
    const eventId = [input.txId, actorId, kind, ref].join("|");
    const result: CommittedNpcAttentionEvent = {
      eventId, actorId, kind, txId: input.txId, sourceRef: ref,
      sceneId: input.sceneId, day: input.day, time: input.time,
      // This only enters a durable receipt if the encompassing semantic
      // manifest is actually committed; dry-run is never source proof.
      committed: true,
      counterpartIds: [...new Set(peers.filter(x =>
        x !== actorId && (x === "player.shura" || actorIdOk(x))))],
      ...(meaning ? { meaningfulEvidence: meaning } : {}),
    };
    const old = seen.get(eventId);
    if (old && JSON.stringify(old) !== JSON.stringify(result))
      throw Error("NPC_HEAT_WITHIN_TX_EVENT_COLLISION");
    seen.set(eventId, result);
    if (seen.size > 48) throw Error("NPC_HEAT_TURN_RECEIPT_LIMIT");
  };
  for (const actor of input.semantic.sceneActorIds ?? []) {
    record(actor, kinds.presence, "scene:" + input.sceneId);
  }
  for (const m of input.semantic.socialMemoryEvents ?? []) {
    if (m.operation === "RETIRE" || m.operation === "TOUCH" ||
        !m.memoryId || !m.originEvent?.trim() || !m.source?.trim() ||
        !m.meaning?.trim() || !m.participants?.length) continue;
    const participants = [...new Set(m.participants)];
    const aware = new Set(m.whoUnderstands?.length ? m.whoUnderstands : participants);
    const meaningful = (m.importance === "IMPORTANT" || m.importance === "ANCHOR") &&
      m.meaning.trim().length >= 24;
    for (const actor of participants) {
      if (aware.has(actor)) record(actor, meaningful ? kinds.meaningful : kinds.social,
        "memory:" + m.memoryId, participants.filter(x => x !== actor),
        meaningful ? m.meaning.trim() : undefined);
    }
  }
  for (const r of input.semantic.relationshipEvents ?? []) {
    if (r.operation === "RETIRE" || !r.relationshipId || !r.evidenceRefs?.length ||
        !r.currentStance?.trim() || r.currentStance.trim().length < 24) continue;
    record(r.actorId, kinds.meaningful, "relation:" + r.relationshipId,
      [r.towardId], r.currentStance.trim());
  }
  return [...seen.values()];
}

/**
 * Content-bound, unkeyed SHA-256. Strong tamper-evident checksum for accidental
 * corruption, NOT a signature, not immutable Google provenance, not a KV lock.
 */
export async function npcHeatStateHashV2(input: {
  saveTo: string;
  inworldEnd: string;
  sceneId: string;
  txId: string;
  worldAdvancesJson: string;
}): Promise<string> {
  const payload = JSON.stringify([
    "NPC_HEAT_SOURCE_V2", input.saveTo, input.inworldEnd, input.sceneId,
    input.txId, input.worldAdvancesJson,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return "sha256:" + [...new Uint8Array(digest)]
    .map(x => x.toString(16).padStart(2, "0")).join("");
}
