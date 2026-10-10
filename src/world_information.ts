import { parseInworldMoment } from "./social_context.ts";

export type RumorRecord = Record<string, unknown>;
export type RumorTransmission = {
  factId: string;
  sourceFactId: string;
  sourceProcessId: string;
  channelId: string;
  senderNpcId: string;
  receiverNpcId: string;
  claim: string;
  relayStart: string;
  relayEnd: string;
  accessEvidence: string;
  tags?: string[];
};

const str = (x: unknown) => String(x ?? "").trim();

export function parseNetworkLatencyHours(input: unknown): { min: number; max: number } {
  const text = str(input).replace(/,/g, ".").replace(/[–—]/g, "-");
  const match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*h\b/i);
  if (!match) throw new Error("rumor network has no machine-readable latency: " + text);
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (min < 0 || max < min || max > 168) throw new Error("unreasonable rumor relay latency");
  return { min, max };
}

/**
 * A rumor only reaches an NPC with a factual source, an existing carrier,
 * travel/meeting/access evidence, and elapsed latency. It is NOT an automatic
 * private fact reveal to Shura or an omniscient broadcast.
 */
export function validateRumorTransmission(input: {
  event: RumorTransmission;
  channels: RumorRecord[];
  npcKnowledge: RumorRecord[];
  npcCurrent: RumorRecord[];
  worldClocks: RumorRecord[];
  currentDay: number;
  currentTime: string;
}): RumorRecord {
  const e = input.event;
  if (e.senderNpcId === e.receiverNpcId ||
      !e.senderNpcId.startsWith("npc.") || !e.receiverNpcId.startsWith("npc.")) {
    throw new Error("rumor carrier must have two distinct NPC participants");
  }
  for (const id of [e.senderNpcId, e.receiverNpcId]) {
    if (!input.npcCurrent.some((r) => str(r["NPC ID"]) === id)) {
      throw new Error("rumor participant not materialized: " + id);
    }
  }
  const source = input.npcKnowledge.find((r) =>
    str(r["NPC ID"]) === e.senderNpcId && str(r["Fact ID"]) === e.sourceFactId &&
    str(r["Active"]).toUpperCase() !== "FALSE");
  if (!source) throw new Error("rumor sender does not know alleged source fact");
  if (input.npcKnowledge.some((r) => str(r["Fact ID"]) === e.factId)) {
    throw new Error("rumor fact ID already exists: " + e.factId);
  }
  const process = input.worldClocks.find((r) =>
    str(r["Process ID"]) === e.sourceProcessId &&
    str(r["State"]).toUpperCase().startsWith("ACTIVE"));
  if (!process) throw new Error("rumor must originate from an existing active world process");
  const channel = input.channels.find((r) =>
    str(r["Channel ID"]) === e.channelId && str(r["Status"]).toUpperCase() === "ACTIVE");
  if (!channel) throw new Error("unknown or inactive rumor carrier channel: " + e.channelId);
  const latency = parseNetworkLatencyHours(channel["Typical latency"]);
  const from = parseInworldMoment(e.relayStart);
  const to = parseInworldMoment(e.relayEnd);
  const now = parseInworldMoment("Day" + input.currentDay + " " + input.currentTime);
  if (from == null || to == null || now == null || to > now || to < from ||
      to - from < latency.min * 60 || to - from > latency.max * 60) {
    throw new Error("rumor relay lacks plausible channel time or is ahead of committed time");
  }
  if (e.accessEvidence.trim().length < 45 ||
      e.claim.trim().length < 18 || e.claim.trim().length > 600) {
    throw new Error("rumor requires bounded audible encounter evidence and specific claim");
  }
  const sourceStatus = str(source["Confidence/status"]);
  const sourceClaim = str(source["Knowledge/belief"]);
  if (!sourceClaim || !sourceStatus) throw new Error("rumor source knowledge lacks meaningful provenance");
  return {
    "NPC ID": e.receiverNpcId,
    "Fact ID": e.factId,
    "Knowledge/belief": e.claim,
    // Transmission never upgrades a heard claim to certified fact.
    "Confidence/status": "HEARD / UNVERIFIED; source=" + sourceStatus,
    "Source": e.senderNpcId + " via " + e.channelId + "; sourceFactId=" + e.sourceFactId + "; process=" + e.sourceProcessId,
    "Learned/updated": e.relayEnd,
    "Version": 1,
    "Active": "TRUE",
    "Tags": [...new Set([...(e.tags ?? []), "RUMOR", "HEARSAY"])].join(";"),
    "Notes": "Causal relay: " + e.accessEvidence + ". Reported material is not GM-certified truth. Sender origin: " + sourceClaim.slice(0, 220),
  };
}
