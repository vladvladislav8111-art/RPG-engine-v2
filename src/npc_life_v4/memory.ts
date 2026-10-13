/** NPC Life V4.1: bounded, deterministic retrieval from COMMITTED memory rows.
 * Read-only: no generated biography, new feeling, chat, goal or writer side effect.
 * A participant is not necessarily an observer who understood the event.
 */
import type { SemanticSocialMemoryEvent } from "../types.ts";

export type MemoryRow = Record<string, unknown>;
const value = (r: MemoryRow, k: string) => String(r[k] ?? "").trim();
const ids = (raw: unknown): string[] => String(raw ?? "")
  .split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
const unique = (xs: readonly string[]) => [...new Set(xs)];
const STOP = new Set([
  "шура", "веша", "него", "него", "него", "него", "свой", "свои", "этот", "того",
  "него", "себя", "были", "было", "быть", "после", "перед", "очень", "только",
  "вчера", "сегодня", "завтра", "когда", "время", "shura", "vesha", "their",
  "where", "while", "which", "after", "before", "about", "with", "from",
  "they", "were", "been", "have", "that", "this", "theirs", "there",
  "bookstall", "selarin", "current", "existing", "person",
]);
const words = (s: unknown): Set<string> => new Set(
  String(s ?? "").normalize("NFKC").toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е").match(/[\p{L}\p{N}_]{4,}/gu)
    ?.filter((w) => !STOP.has(w)) ?? [],
);
const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
};
const importanceWeight = (importance: string): number => ({
  ANCHOR: 100, IMPORTANT: 55, ROUTINE: 15,
} as Record<string, number>)[importance] ?? 0;

/** Fail closed when the NPC's awareness is not explicitly recorded. */
export function npcKnowsMemory(row: MemoryRow, actorId: string): boolean {
  return value(row, "Status").toUpperCase() === "ACTIVE" &&
    Boolean(value(row, "Memory ID") && value(row, "Origin event") && value(row, "Meaning")) &&
    ids(row["Participants"]).includes(actorId) &&
    ids(row["Who understands"]).includes(actorId);
}

export type NpcMemoryRecallInput = {
  actorId: string;
  memories: readonly MemoryRow[];
  currentGoal?: string;
  openThreads?: readonly MemoryRow[];
  recentChat?: readonly MemoryRow[];
  contextTags?: readonly string[];
  limit?: number;
};

/** A compact spotlight, NOT a new truth store or an independent NPC decision. */
export function recallNpcMemories(input: NpcMemoryRecallInput) {
  if (!/^npc\.[a-z0-9_.-]+$/i.test(input.actorId)) {
    throw Error("NPC_MEMORY_INVALID_ACTOR");
  }
  const limit = input.limit ?? 12;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) {
    throw Error("NPC_MEMORY_INVALID_LIMIT");
  }
  const goal = words(input.currentGoal);
  const threadText = (input.openThreads ?? [])
    .filter((r) => ids(r["Participants"]).includes(input.actorId) &&
      !["CLOSED", "RESOLVED", "EXPIRED"].includes(value(r, "Status").toUpperCase()))
    .map((r) => [value(r, "Topic"), value(r, "Summary")].join(" "));
  const threads = words(threadText.join(" "));
  // Recent chat is supporting context only; UNREAD or undelivered messages
  // are never treated as learned NPC information.
  const chat = words((input.recentChat ?? []).filter((r) => {
    const received = value(r, "Receiver ID") === input.actorId;
    const sent = value(r, "Sender ID") === input.actorId;
    const delivered = ["", "DELIVERED", "READ"].includes(value(r, "Delivery").toUpperCase());
    const read = ["", "READ"].includes(value(r, "Read status").toUpperCase());
    return sent || (received && delivered && read);
  }).map((r) => value(r, "Text")).join(" "));
  const context = words((input.contextTags ?? []).join(" "));
  const known = input.memories.filter((r) => npcKnowsMemory(r, input.actorId));
  const seen = new Set<string>();
  const ranked = known.flatMap((r) => {
    const memoryId = value(r, "Memory ID");
    if (seen.has(memoryId)) return [];
    seen.add(memoryId);
    const importance = value(r, "Importance").toUpperCase();
    const topic = words([value(r, "Tags"), value(r, "Meaning"),
      value(r, "Origin event"), value(r, "Notes")].join(" "));
    const goalHits = overlap(goal, topic);
    const threadHits = overlap(threads, topic);
    const chatHits = overlap(chat, topic);
    const tagHits = overlap(context, topic);
    const boundary = /(?:^|[;,| ])(?:consent|boundaries|privacy|promise|commitment|safety|secret)(?:$|[;,| ])/i
      .test(value(r, "Tags"));
    const reasons: string[] = [];
    if (goalHits) reasons.push("current_goal");
    if (threadHits) reasons.push("open_thread");
    if (chatHits) reasons.push("known_recent_chat");
    if (tagHits) reasons.push("scene_topic");
    if (boundary) reasons.push("boundary_or_promise");
    const score = importanceWeight(importance) +
      Math.min(36, threadHits * 12) + Math.min(28, goalHits * 7) +
      Math.min(14, chatHits * 7) + Math.min(20, tagHits * 10) +
      (boundary ? 12 : 0);
    return [{ memoryId, importance, score, reasons,
      meaning: value(r, "Meaning"), originEvent: value(r, "Origin event"),
      source: value(r, "Source") || null, emotionalTone: value(r, "Emotional tone") || null,
      lastUsed: value(r, "Last used") || null,
      whoUnderstands: ids(r["Who understands"]) }];
  }).sort((a, b) => b.score - a.score || a.memoryId.localeCompare(b.memoryId));
  return {
    schema: "NPC_MEMORY_RECALL_V41",
    actorId: input.actorId,
    privateToGM: true as const,
    mode: "READ_ONLY_SOURCE_SELECTION" as const,
    committed: false as const,
    noNewFactsOrEmotions: true as const,
    selectionIsNotNpcDecision: true as const,
    totalRowsConsidered: input.memories.length,
    knownMemoryCount: ranked.length,
    notKnownOrIncompleteCount: input.memories.length - known.length,
    selectedCount: Math.min(limit, ranked.length),
    deferredKnownCount: Math.max(0, ranked.length - limit),
    needsTargetedReview: ranked.length > limit,
    selected: ranked.slice(0, limit),
    rules: [
      "Only ACTIVE memories with explicit NPC awareness are recallable",
      "Subjective memory meaning must not be elevated to objective world truth",
      "Selection is a GM reading priority, not an NPC's chosen utterance",
      "Missing historical evidence cannot be reconstructed by generating a new memory",
    ],
  };
}

/** Validate explicit causal ownership of a NEW persistent social memory.
 * The semantic writer still owns all actual committed writes.
 */
export function validateNewNpcSocialMemory(event: SemanticSocialMemoryEvent): void {
  if ((event.operation ?? "UPSERT") !== "UPSERT") return;
  const participants = unique(event.participants ?? []);
  const aware = unique(event.whoUnderstands ?? []);
  if (!event.memoryId.trim() || !event.originEvent?.trim() || !event.meaning?.trim()) {
    throw Error("NPC_MEMORY_ORIGIN_AND_MEANING_REQUIRED");
  }
  if (!participants.length || participants.length !== (event.participants?.length ?? 0)) {
    throw Error("NPC_MEMORY_PARTICIPANTS_REQUIRED_AND_UNIQUE");
  }
  if (!aware.length || aware.length !== (event.whoUnderstands?.length ?? 0) ||
      aware.some((id) => !participants.includes(id))) {
    throw Error("NPC_MEMORY_EXPLICIT_KNOWERS_REQUIRED");
  }
}
