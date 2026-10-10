import { parseInworldMoment } from "./social_context.ts";

export type WorldEventRecord = Record<string, unknown>;
export type MaterializeMajorWorldEvent = {
  processId: string;
  templateId: string;
  sourceProcessId: string;
  locationId: string;
  participatingNpcIds: string[];
  causalTrigger: string;
  concreteEffects: string;
  nextReview: string;
  startDay: number;
  startTime: string;
  durationHours: number;
};

/**
 * The template is only a menu of physically possible event families.
 * No event exists until a real source process, actual causal trigger,
 * participant(s) and finite consequences have been validated.
 */
export function validateMajorWorldEvent(input: {
  event: MaterializeMajorWorldEvent;
  templates: WorldEventRecord[];
  clocks: WorldEventRecord[];
  npcs: WorldEventRecord[];
  worldDay: number;
  worldTime: string;
}): WorldEventRecord {
  const e = input.event;
  if (!/^process\.event\.[a-z0-9_.-]+$/i.test(e.processId)) {
    throw new Error("major event needs stable process.event.* process ID");
  }
  if (input.clocks.some((r) => r["Process ID"] === e.processId)) {
    throw new Error("duplicate live major event process");
  }
  const tpl = input.templates.find((r) =>
    r["Event ID"] === e.templateId && String(r["Status"]).toUpperCase() === "ACTIVE");
  if (!tpl) throw new Error("unknown or inactive major event template");
  const source = input.clocks.find((r) =>
    r["Process ID"] === e.sourceProcessId &&
    String(r["State"]).toUpperCase().startsWith("ACTIVE"));
  if (!source) throw new Error("major event lacks active source world process");
  const prefix = String(tpl["Required process prefix"] ?? "").trim();
  if (prefix && !e.sourceProcessId.startsWith(prefix)) {
    throw new Error("major event template source-process requirement not met");
  }
  const present = new Set(input.npcs.map((r) => String(r["NPC ID"] ?? "")));
  if (!e.participatingNpcIds.length ||
      e.participatingNpcIds.some((id) => !present.has(id))) {
    throw new Error("major world event requires already materialized participating actors");
  }
  for (const actorId of e.participatingNpcIds) {
    const current = input.npcs.find((r) => r["NPC ID"] === actorId);
    if (!String(current?.["Current/last-known location"] ?? "").startsWith("loc.ilyrian.selarin")) {
      throw new Error("participating event actor must already be in Selarin; no uncommitted teleportation");
    }
  }
  if (!e.locationId.startsWith("loc.ilyrian.selarin")) {
    throw new Error("Selarin major event must have a real Selarin location");
  }
  if (e.causalTrigger.trim().length < 65 ||
      e.concreteEffects.trim().length < 45 ||
      e.nextReview.trim().length < 22) {
    throw new Error("major world event lacks concrete trigger, physical effect or next check");
  }
  const min = Number(tpl["Duration min h"]);
  const max = Number(tpl["Duration max h"]);
  if (!Number.isFinite(e.durationHours) || e.durationHours < min ||
      e.durationHours > max) {
    throw new Error("major event duration outside known template bounds");
  }
  const now = parseInworldMoment("Day" + input.worldDay + " " + input.worldTime);
  const start = parseInworldMoment("Day" + e.startDay + " " + e.startTime);
  if (now == null || start == null || start > now || now - start > 24*60) {
    throw new Error("event activation requires a recent real in-world start");
  }
  return {
    "Process ID": e.processId,
    "Name": tpl["Name"],
    "State": "ACTIVE",
    "Location": e.locationId,
    "Current activity": e.causalTrigger.trim() + " | Observable effects: " +
      e.concreteEffects.trim() + " | Actors: " + e.participatingNpcIds.join(";"),
    "Next milestone/window": e.nextReview.trim() +
      " | Event duration bounded to " + e.durationHours + "h; complete only after actual evidence.",
    "Visibility": String(tpl["Public visibility"] ?? "") +
      " | Hidden evidence remains hidden. Template guard: " + String(tpl["Guard"] ?? ""),
    "Last advanced": "Day" + input.worldDay + " " + input.worldTime,
  };
}
