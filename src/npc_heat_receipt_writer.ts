import type { SemanticCommitPlan } from "./types.ts";
import type { CommittedNpcAttentionEvent } from "./npc_attention_ladder.ts";

/**
 * Experimental writer path, hard-gated to TEST saves and one explicit isolated
 * workbook. Never activate on a live V2-S... save or production writer.
 * This does not implement remote multi-instance fenced writer exclusion.
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
  if (!input.isolatedWorkbookId ||
      input.workbookId !== input.isolatedWorkbookId ||
      !/^TEST-[A-Za-z0-9._-]+$/.test(input.expectedSaveId) ||
      !/^TEST-[A-Za-z0-9._-]+$/.test(input.saveTo) ||
      input.expectedSaveId === input.saveTo ||
      (input.source != null && input.source !== "ENGINE_FASTPATH"))
    throw Error("NPC_HEAT_TEST_WRITER_ISOLATION_GATE");
  return true;
}

/** Strip reserved engine fields from caller-controlled world-advance payload. */
export function scrubCallerHeatProvenance(
  worldAdvances: unknown,
): Record<string, unknown> | null {
  if (!worldAdvances || typeof worldAdvances !== "object" ||
      Array.isArray(worldAdvances)) return null;
  const out = { ...(worldAdvances as Record<string, unknown>) };
  for (const key of [
    "engineNpcAttentionReceipts", "engineNpcReceiptIntegrity",
    "engineNpcReceiptDigest", "engineNpcReceiptEpoch",
  ]) delete out[key];
  return out;
}

const validActor = (id: string) => /^npc\.[a-z0-9_.-]+$/i.test(id);
const validTime = (s: string) => /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s);
export function deriveEngineHeatReceipts(input: {
  txId: string;
  day: number;
  time: string;
  sceneId: string;
  knownNpcIds: readonly string[];
  semantic: SemanticCommitPlan;
}): CommittedNpcAttentionEvent[] {
  if (!input.txId || input.txId.length > 160 ||
      !Number.isSafeInteger(input.day) || input.day < 1 ||
      !validTime(input.time) || !input.sceneId || input.sceneId.length > 256)
    throw Error("NPC_HEAT_INVALID_WRITER_CLOCK");
  const known = new Set(input.knownNpcIds.filter(validActor));
  const events = new Map<string, CommittedNpcAttentionEvent>();
  const record = (
    actorId: string, kind: CommittedNpcAttentionEvent["kind"],
    sourceRef: string, peers: string[] = [], evidence?: string,
  ) => {
    if (!known.has(actorId) || !sourceRef || sourceRef.length > 512) return;
    const eventId = [input.txId, actorId, kind, sourceRef].join("|");
    const event: CommittedNpcAttentionEvent = {
      eventId, actorId, kind, txId: input.txId, sourceRef,
      sceneId: input.sceneId, day: input.day, time: input.time,
      // Proposed for the same atomic semantic manifest. A dry-run receipt
      // must never be treated as independently committed by the reader.
      committed: true,
      counterpartIds: [...new Set(peers.filter(x =>
        x !== actorId && (x === "player.shura" || validActor(x))))].sort(),
      ...(evidence ? { meaningfulEvidence: evidence } : {}),
    };
    const old = events.get(eventId);
    if (old && JSON.stringify(old) !== JSON.stringify(event))
      throw Error("NPC_HEAT_WITHIN_TX_EVENT_COLLISION");
    events.set(eventId, event);
    if (events.size > 48) throw Error("NPC_HEAT_TURN_RECEIPT_LIMIT");
  };
  for (const id of input.semantic.sceneActorIds ?? [])
    record(id, "SCENE_PRESENCE", "scene:" + input.sceneId);
  for (const m of input.semantic.socialMemoryEvents ?? []) {
    if (m.operation === "RETIRE" || m.operation === "TOUCH" ||
        !m.memoryId || !m.originEvent?.trim() || !m.source?.trim() ||
        !m.meaning?.trim() || !m.participants?.length) continue;
    const participants = [...new Set(m.participants)];
    const aware = new Set(m.whoUnderstands?.length ? m.whoUnderstands : participants);
    const meaning = m.meaning.trim();
    const significant = (m.importance === "IMPORTANT" || m.importance === "ANCHOR") &&
      meaning.length >= 24;
    for (const id of participants) if (aware.has(id))
      record(id, significant ? "MEANINGFUL_RELATIONSHIP_EVENT" :
        "SUBSTANTIVE_EXCHANGE", "memory:" + m.memoryId,
        participants.filter(peer => peer !== id), significant ? meaning : undefined);
  }
  for (const r of input.semantic.relationshipEvents ?? []) {
    if (r.operation === "RETIRE" || !r.relationshipId ||
        !r.evidenceRefs?.length || !r.currentStance?.trim() ||
        r.currentStance.trim().length < 24) continue;
    record(r.actorId, "MEANINGFUL_RELATIONSHIP_EVENT",
      "relation:" + r.relationshipId, [r.towardId], r.currentStance.trim());
  }
  return [...events.values()];
}

/**
 * Content-bound unkeyed SHA-256: corruption detection, NOT trusted origin,
 * cannot exclude concurrent writers or guarantee exactly-once on its own.
 */
export async function npcHeatStateHashV2(input: {
  saveTo: string; inworldEnd: string; sceneId: string;
  txId: string; worldAdvancesJson: string;
}): Promise<string> {
  const body = JSON.stringify([
    "NPC_HEAT_SOURCE_V2", input.saveTo, input.inworldEnd,
    input.sceneId, input.txId, input.worldAdvancesJson,
  ]);
  const sum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return "sha256:" + [...new Uint8Array(sum)].map(v =>
    v.toString(16).padStart(2, "0")).join("");
}
