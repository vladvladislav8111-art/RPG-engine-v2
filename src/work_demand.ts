import { parseInworldMoment } from "./social_context.ts";

export type DemandRecord = Record<string, unknown>;
export type MaterializeWorkDemand = {
  offerId: string;
  templateId: string;
  employerId: string;
  sourceProcessId: string;
  materializedDemand: string;
  taskScope: string;
  payC: number;
  durationMinutes: number;
  slots: number;
  locationId: string;
  availableDay: number;
  availableTime: string;
  expiresDay: number;
  expiresTime: string;
  accessCondition: string;
};

const str = (x: unknown) => String(x ?? "").trim();
const num = (x: unknown) => Number(str(x).replace(",", "."));
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/**
 * One real employer / source process / concrete packet of work constitutes
 * one funded demand, not an unlimited number of job board cards.
 *
 * Only semantic-generated records have this exact source marker. Earlier
 * historical opportunities have different provenance and are not mistaken
 * for active new demand.
 */
function sameLiveDemand(
  event: MaterializeWorkDemand,
  offer: DemandRecord,
  now: number,
): boolean {
  if (str(offer["Employer"]) !== event.employerId) return false;
  const provenance = str(offer["Source/opportunity"]);
  const parsed = /^template=[^;]+;\s*process=([^;]+);\s*specific demand=([\s\S]+)$/i.exec(provenance);
  if (!parsed || str(parsed[1]) !== event.sourceProcessId) return false;

  const normal = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (normal(parsed[2]) !== normal(event.materializedDemand)) return false;

  const state = str(offer["State"]).toUpperCase();
  const lifecycle = str(offer["Lifecycle State"]).toUpperCase();
  if (["CLOSED", "COMPLETED", "RESOLVED", "EXPIRED", "FILLED", "CANCELLED"].some(
    (terminal) => lifecycle.startsWith(terminal) || state.startsWith(terminal)
  )) return false;

  // Expired offers cannot occupy a slot forever if lifecycle update has
  // not yet run. Do not mutate their historical rows in this validator.
  const expiresDay = Number(str(offer["Expires Day"]));
  const expiresTime = str(offer["Expires Time"]);
  if (Number.isSafeInteger(expiresDay) && timeRegex.test(expiresTime)) {
    const expiration = parseInworldMoment("Day" + expiresDay + " " + expiresTime);
    if (expiration !== null && expiration <= now) return false;
  }
  return true;
}


function moment(day: number, time: string): number {
  const stamp = parseInworldMoment("Day" + day + " " + time);
  if (stamp == null) throw new Error("invalid materialized demand moment: Day" + day + " " + time);
  return stamp;
}

/** Pregen work categories never constitute an actual merchant offer. */
export function validateWorkDemand(
  event: MaterializeWorkDemand,
  templateRows: DemandRecord[],
  liveClocks: DemandRecord[],
  liveNpcRows: DemandRecord[],
  existingOffers: DemandRecord[],
  currentDay: number,
  currentTime: string,
): DemandRecord {
  const offerId = str(event.offerId);
  if (!/^offer\.[a-z0-9_.-]+$/i.test(offerId)) throw new Error("work demand offerId requires stable offer.* id");
  if (existingOffers.some((r) => str(r["Offer ID"]) === offerId)) {
    throw new Error("work demand offer already exists: " + offerId);
  }
  const template = templateRows.find((r) => str(r["Template ID"]) === event.templateId);
  if (!template) throw new Error("unknown canonical work template: " + event.templateId);
  if (!str(event.employerId).startsWith("npc.") ||
      !liveNpcRows.some((r) => str(r["NPC ID"]) === event.employerId)) {
    throw new Error("work demand requires a materialized, existing employer NPC: " + event.employerId);
  }
  const employer = liveNpcRows.find((r) => str(r["NPC ID"]) === event.employerId)!;
  if (!str(employer["Current/last-known location"]).startsWith("loc.ilyrian.selarin")) {
    throw new Error("Selarin employer must actually be present in Selarin");
  }
  const process = liveClocks.find((r) => str(r["Process ID"]) === event.sourceProcessId &&
    str(r["State"]).toUpperCase().startsWith("ACTIVE"));
  if (!process) throw new Error("work demand needs an ACTIVE real source process: " + event.sourceProcessId);
  if (event.materializedDemand.trim().length < 55 ||
      event.taskScope.trim().length < 30) {
    throw new Error("work demand needs specific source demand and bounded work scope");
  }
  const low = num(template["Pay min c"]);
  const high = num(template["Pay max c"]);
  const minMinutes = num(template["Duration min min"]);
  const maxMinutes = num(template["Duration max min"]);
  if (![low, high, minMinutes, maxMinutes].every(Number.isFinite) ||
      !Number.isInteger(event.payC) || event.payC < low || event.payC > high) {
    throw new Error("work demand price outside canonical template band: " + event.templateId);
  }
  if (!Number.isFinite(event.durationMinutes) || event.durationMinutes < minMinutes ||
      event.durationMinutes > maxMinutes) {
    throw new Error("work demand duration outside canonical template: " + event.templateId);
  }
  if (!Number.isInteger(event.slots) || event.slots < 1 || event.slots > 12) {
    throw new Error("work demand must have finite positive slot count (max 12)");
  }
  if (!timeRegex.test(event.availableTime) || !timeRegex.test(event.expiresTime) ||
      !Number.isInteger(event.availableDay) || !Number.isInteger(event.expiresDay)) {
    throw new Error("work demand requires explicit valid available/expiry moments");
  }
  const now = moment(currentDay, currentTime);
  if (existingOffers.some((r) => sameLiveDemand(event, r, now))) {
    throw new Error("work demand already has a live offer for this employer, source process and physical work packet");
  }
  const openAt = moment(event.availableDay, event.availableTime);
  const closesAt = moment(event.expiresDay, event.expiresTime);
  if (openAt > closesAt || closesAt <= now || closesAt > now + 7 * 1440) {
    throw new Error("work demand window must be current/future, finite, and at most 7 days away");
  }
  if (!str(event.locationId).startsWith("loc.ilyrian.selarin")) {
    throw new Error("Selarin work template cannot materialize outside Selarin");
  }
  if (event.accessCondition.trim().length < 20) {
    throw new Error("work demand must preserve concrete trust/skill access gate");
  }
  const isAvailable = openAt <= now;
  const expiryStamp = "Day" + event.expiresDay + " " + event.expiresTime;
  return {
    "Offer ID": offerId,
    "Employer": event.employerId,
    "Location/start": event.locationId,
    "Task": event.taskScope.trim(),
    "Pay": event.payC + "c / " + str(template["Pay unit"]),
    "Pay condition": "Due only on employer verification of bounded work; no automatic wage. " + event.accessCondition.trim(),
    "Expected time": event.durationMinutes + "m actual work, subject to source availability",
    "Risk": str(template["Hazard"]),
    "Why available to Shura": "Public/employer-led finite demand; Shura has NOT accepted it. Eligibility needs real inquiry and gates: " + event.accessCondition.trim(),
    "State": isAvailable ? "OPEN / NO CONTRACT SIGNED" : "SCHEDULED / NO CONTRACT SIGNED",
    "Expiry/departure": expiryStamp,
    "Source/opportunity": "template=" + event.templateId + "; process=" + event.sourceProcessId + "; specific demand=" + event.materializedDemand.trim(),
    "Version": 1,
    "Last updated": "Day" + currentDay + " " + currentTime,
    "Available Day": event.availableDay,
    "Available Time": event.availableTime,
    "Expires Day": event.expiresDay,
    "Expires Time": event.expiresTime,
    "Slots Total": event.slots,
    "Slots Remaining": event.slots,
    "Lifecycle Policy": "HARD_DEADLINE",
    "Lifecycle State": isAvailable ? "AVAILABLE" : "SCHEDULED",
    "Last Lifecycle Check": "Day" + currentDay + " " + currentTime,
  };
}
