export type RuntimeRecord = Record<string, unknown>;

export type ActorResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";

export type ActorResolution = {
  ref: string;
  status: ActorResolutionStatus;
  actorIds: string[];
  materialization: "ACTIVE" | "DORMANT" | null;
};

function normalizeRef(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
}

function aliasesFor(record: RuntimeRecord): string[] {
  const raw = [
    record["Aliases"],
    record["Alias"],
    record["Known as"],
    record["Alternate names"],
  ]
    .filter((v) => v != null && String(v).trim() !== "")
    .flatMap((v) => String(v).split(/[;,|]/))
    .map((v) => normalizeRef(v))
    .filter(Boolean);
  return [...new Set(raw)];
}

export function resolveActorRefs(
  activeRecords: RuntimeRecord[],
  refs: string[],
  identityRecords: RuntimeRecord[] = [],
): ActorResolution[] {
  const matchesRef = (record: RuntimeRecord, needle: string) => {
    const id = normalizeRef(record["NPC ID"]);
    const display = normalizeRef(record["Display"]);
    return needle !== "" && (needle === id || needle === display || aliasesFor(record).includes(needle));
  };

  return refs.map((ref) => {
    const needle = normalizeRef(ref);
    const activeMatches = activeRecords.filter((record) => matchesRef(record, needle));
    const identityMatches = identityRecords.filter((record) => matchesRef(record, needle));
    const actorIds = [...new Set(
      [...activeMatches, ...identityMatches]
        .map((r) => String(r["NPC ID"] ?? "").trim())
        .filter(Boolean),
    )];
    const status: ActorResolutionStatus =
      actorIds.length === 1 ? "RESOLVED" : actorIds.length > 1 ? "AMBIGUOUS" : "NOT_FOUND";
    const materialization =
      status !== "RESOLVED"
        ? null
        : activeMatches.some((r) => String(r["NPC ID"] ?? "") === actorIds[0])
        ? "ACTIVE"
        : "DORMANT";
    return { ref, status, actorIds, materialization };
  });
}

const LOCATION_HEADERS = [
  "Location",
  "Location/start",
  "District/location",
  "Current/last-known location",
  "Location / anchor",
];

export function filterRecordsByLocation(records: RuntimeRecord[], locationId: string): RuntimeRecord[] {
  if (!locationId) return records;
  return records.filter((record) =>
    LOCATION_HEADERS.some((header) => String(record[header] ?? "").includes(locationId)) ||
    !LOCATION_HEADERS.some((header) => header in record)
  );
}

export function selectNpcCurrentRows(
  records: RuntimeRecord[],
  locationId: string,
  actorIds: string[],
  explicitActorRequest: boolean,
): RuntimeRecord[] {
  if (explicitActorRequest) {
    const wanted = new Set(actorIds);
    return records.filter((record) => wanted.has(String(record["NPC ID"] ?? "")));
  }
  return filterRecordsByLocation(records, locationId);
}

export function recentActorChat(
  records: RuntimeRecord[],
  actorIds: string[],
  limit = 8,
): Record<string, RuntimeRecord[]> {
  const safeLimit = Math.max(0, Math.min(20, Math.floor(limit)));
  const out: Record<string, RuntimeRecord[]> = {};
  for (const actorId of actorIds) {
    if (safeLimit === 0) {
      out[actorId] = [];
      continue;
    }
    out[actorId] = records.filter((record) =>
      String(record["Sender ID"] ?? "") === actorId ||
      String(record["Receiver ID"] ?? "") === actorId
    ).slice(-safeLimit);
  }
  return out;
}


export function participantIds(value: unknown): string[] {
  return String(value ?? "")
    .split(/[;,|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function filterByParticipants(
  records: RuntimeRecord[],
  actorIds: string[],
): RuntimeRecord[] {
  const wanted = new Set(actorIds);
  if (!wanted.size) return [];
  return records.filter((record) =>
    participantIds(record["Participants"]).some((id) => wanted.has(id))
  );
}


export type NpcContextGateActorResult = {
  actorId: string;
  ready: boolean;
  currentLoaded: boolean;
  knowledgeLoaded: boolean;
  socialMemoryLoaded: boolean;
  openThreadsLoaded: boolean;
  recentChatLoaded: boolean;
  identityAnchorsPresent: boolean;
  competenceAnchorsPresent: boolean;
  currentGoalPresent: boolean;
  activityRuleLoaded: boolean;
  activityRulePresent: boolean;
  eligibleForOffscreenAdvance: boolean;
  requiresOffscreenAdvance: boolean;
  blockers: string[];
};

export function evaluateNpcContextGate(input: {
  actorId: string;
  current: RuntimeRecord | null;
  knowledgeLoaded: boolean;
  socialMemoryLoaded: boolean;
  openThreadsLoaded: boolean;
  recentChatLoaded: boolean;
  recentChatLimit: number;
  activityRuleLoaded?: boolean;
  activityRule?: RuntimeRecord | null;
  eligibleForOffscreenAdvance?: boolean;
  requiresOffscreenAdvance?: boolean;
}): NpcContextGateActorResult {
  const blockers: string[] = [];
  const currentLoaded = input.current != null;
  const importance = String(input.current?.["Importance"] ?? "").trim().toUpperCase();
  const isKey = importance === "KEY";
  const identityAnchorsPresent = String(input.current?.["Identity anchors"] ?? "").trim() !== "";
  const competenceAnchorsPresent = String(input.current?.["Competence anchors"] ?? "").trim() !== "";
  const currentGoalPresent = String(input.current?.["Current goal/activity"] ?? "").trim() !== "";

  if (!currentLoaded) blockers.push("npc_current_missing");
  if (!input.knowledgeLoaded) blockers.push("npc_knowledge_surface_not_loaded");
  if (!input.socialMemoryLoaded) blockers.push("social_memory_surface_not_loaded");
  if (!input.openThreadsLoaded) blockers.push("open_threads_surface_not_loaded");
  if (input.recentChatLimit <= 0 || !input.recentChatLoaded) blockers.push("recent_chat_surface_not_loaded");

  const activityRuleLoaded = input.activityRuleLoaded === true;
  const activityRulePresent = input.activityRule != null;
  const eligibleForOffscreenAdvance = input.eligibleForOffscreenAdvance === true;
  const requiresOffscreenAdvance = input.requiresOffscreenAdvance === true;

  if (isKey) {
    if (!identityAnchorsPresent) blockers.push("key_identity_anchors_missing");
    if (!competenceAnchorsPresent) blockers.push("key_competence_anchors_missing");
    if (!currentGoalPresent) blockers.push("key_current_goal_missing");
    if (!activityRuleLoaded) blockers.push("key_activity_rules_surface_not_loaded");
    else if (!activityRulePresent) blockers.push("key_activity_rule_missing");
    if (requiresOffscreenAdvance) blockers.push("key_offscreen_advance_required");
  }

  return {
    actorId: input.actorId,
    ready: blockers.length === 0,
    currentLoaded,
    knowledgeLoaded: input.knowledgeLoaded,
    socialMemoryLoaded: input.socialMemoryLoaded,
    openThreadsLoaded: input.openThreadsLoaded,
    recentChatLoaded: input.recentChatLoaded && input.recentChatLimit > 0,
    identityAnchorsPresent,
    competenceAnchorsPresent,
    currentGoalPresent,
    activityRuleLoaded,
    activityRulePresent,
    eligibleForOffscreenAdvance,
    requiresOffscreenAdvance,
    blockers,
  };
}


export function recordsContainingActorId(records: RuntimeRecord[], actorId: string): RuntimeRecord[] {
  if (!actorId) return [];
  return records.filter((record) =>
    Object.values(record).some((value) => String(value ?? "").includes(actorId))
  );
}

export function parseInworldMoment(value: unknown): number | null {
  const text = String(value ?? "");
  const match = text.match(/Day\s*(\d+)[^0-9]+(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  if (![day, hour, minute, second].every(Number.isFinite)) return null;
  return day * 24 * 60 + hour * 60 + minute + second / 60;
}

export function activityElapsedThresholds(rule: RuntimeRecord | null): {
  minimumMinutes: number | null;
  forcedMinutes: number | null;
} {
  if (!rule) return { minimumMinutes: null, forcedMinutes: null };
  const text = String(rule["Minimum elapsed"] ?? "");
  const minimumMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:in-world\s*)?minutes?/i);
  const forcedMatch = text.match(/>=\s*(\d+(?:[.,]\d+)?)\s*m\b/i);
  const parse = (raw?: string) => raw ? Number(raw.replace(",", ".")) : null;
  return {
    minimumMinutes: parse(minimumMatch?.[1]),
    forcedMinutes: parse(forcedMatch?.[1]),
  };
}

export function actorSnapshotFreshness(input: {
  worldDay: unknown;
  worldTime: unknown;
  current: RuntimeRecord | null;
  activityRule: RuntimeRecord | null;
}): {
  ageMinutes: number | null;
  minimumMinutes: number | null;
  forcedMinutes: number | null;
  eligibleForOffscreenAdvance: boolean;
  requiresOffscreenAdvance: boolean;
} {
  const now = parseInworldMoment(`Day${String(input.worldDay ?? "")} ${String(input.worldTime ?? "")}`);
  const currentStamp = parseInworldMoment(input.current?.["Last updated"]);
  const ruleStamp = parseInworldMoment(input.activityRule?.["Last activity tick"]);
  const latest = [currentStamp, ruleStamp].filter((v): v is number => v != null).sort((a,b) => b-a)[0] ?? null;
  const { minimumMinutes, forcedMinutes } = activityElapsedThresholds(input.activityRule);
  const ageMinutes = now == null || latest == null ? null : Math.max(0, now - latest);
  return {
    ageMinutes,
    minimumMinutes,
    forcedMinutes,
    eligibleForOffscreenAdvance:
      ageMinutes != null && minimumMinutes != null && ageMinutes >= minimumMinutes,
    requiresOffscreenAdvance:
      ageMinutes != null && forcedMinutes != null && ageMinutes >= forcedMinutes,
  };
}

export function validateChatEventShape(event: {
  messageId: string;
  channelId: string;
  senderId: string;
  receiverId: string;
  direction: "IN" | "OUT";
  text: string;
}): void {
  if (!event.messageId.trim()) throw new Error("chat messageId is required");
  if (!event.channelId.trim()) throw new Error(`chat channelId required: ${event.messageId}`);
  if (!event.senderId.trim() || !event.receiverId.trim()) {
    throw new Error(`chat sender/receiver required: ${event.messageId}`);
  }
  if (event.senderId === event.receiverId) {
    throw new Error(`chat sender and receiver cannot match: ${event.messageId}`);
  }
  if (!event.text.trim()) throw new Error(`chat text cannot be empty: ${event.messageId}`);
  if (event.direction === "OUT" && event.senderId !== "player.shura") {
    throw new Error(`OUT chat must be sent by player.shura: ${event.messageId}`);
  }
  if (event.direction === "IN" && event.receiverId !== "player.shura") {
    throw new Error(`IN chat must be received by player.shura: ${event.messageId}`);
  }
}
