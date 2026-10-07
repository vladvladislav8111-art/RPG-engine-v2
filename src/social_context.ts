export type RuntimeRecord = Record<string, unknown>;

export type ActorResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";

export type ActorResolution = {
  ref: string;
  status: ActorResolutionStatus;
  actorIds: string[];
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

export function resolveActorRefs(records: RuntimeRecord[], refs: string[]): ActorResolution[] {
  return refs.map((ref) => {
    const needle = normalizeRef(ref);
    const matches = records.filter((record) => {
      const id = normalizeRef(record["NPC ID"]);
      const display = normalizeRef(record["Display"]);
      return needle !== "" && (needle === id || needle === display || aliasesFor(record).includes(needle));
    });
    const actorIds = [...new Set(matches.map((r) => String(r["NPC ID"] ?? "").trim()).filter(Boolean))];
    return {
      ref,
      status: actorIds.length === 1 ? "RESOLVED" : actorIds.length > 1 ? "AMBIGUOUS" : "NOT_FOUND",
      actorIds,
    };
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

  if (isKey) {
    if (!identityAnchorsPresent) blockers.push("key_identity_anchors_missing");
    if (!competenceAnchorsPresent) blockers.push("key_competence_anchors_missing");
    if (!currentGoalPresent) blockers.push("key_current_goal_missing");
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
    blockers,
  };
}
