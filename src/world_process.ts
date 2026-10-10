import { parseInworldMoment } from "./social_context.ts";

export type WorldProcessRow = Record<string, unknown>;
export type WorldProcessCadence = "EVENT_TRIGGERED" | "STAFFED_MILESTONE" | "DAILY_REVIEW";
export type WorldProcessDue = {
  processId: string;
  ageMinutes: number | null;
  lastAdvanced: string | null;
  cadence: WorldProcessCadence;
  reason: "REVIEW_OVERDUE" | "MILESTONE_REVIEW_DUE" | "TIMESTAMP_UNKNOWN";
  targetDay?: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/** A clock trigger signals GM resolution; never manufactures a process outcome. */
export function classifyWorldProcess(row: WorldProcessRow): {
  cadence: WorldProcessCadence;
  targetDay?: number;
  targetMinute?: number;
} {
  const id = text(row["Process ID"]);
  const milestone = text(row["Next milestone/window"]);
  if (id === "process.system.achievement_watch_01" ||
      /^process\.system\.achievement_watch[_.]/.test(id)) {
    return { cadence: "EVENT_TRIGGERED" };
  }
  // Long shop commissions only become eligible after actual staffed working
  // days. Deadline is a review trigger, NOT a promise of finished goods.
  if (/\bstaffed\b/i.test(milestone) && /\bworkdays?\b/i.test(milestone)) {
    const days = [...milestone.matchAll(/\bDay\s*(\d+)\b/gi)].map((m) => Number(m[1]));
    if (days.length) {
      return {
        cadence: "STAFFED_MILESTONE",
        targetDay: Math.max(...days),
        // 'late' has no exact canonical appointment: checking at 17:00 on
        // the indicated day is only a GM-review threshold, never completion.
        targetMinute: /\blate\b/i.test(milestone) ? 17 * 60 : 0,
      };
    }
  }
  return { cadence: "DAILY_REVIEW" };
}

export function reviewWorldProcesses(input: {
  worldDay: unknown;
  worldTime: unknown;
  rows: WorldProcessRow[];
  defaultReviewMinutes?: number;
}): {
  activeClocksOverdue: WorldProcessDue[];
  eventTriggeredActive: string[];
  staffedPending: Array<{ processId: string; targetDay: number }>;
} {
  const now = parseInworldMoment(`Day${text(input.worldDay)} ${text(input.worldTime)}`);
  const dailyReviewMinutes = input.defaultReviewMinutes ?? 24 * 60;
  const activeClocksOverdue: WorldProcessDue[] = [];
  const eventTriggeredActive: string[] = [];
  const staffedPending: Array<{ processId: string; targetDay: number }> = [];
  for (const row of input.rows) {
    const state = text(row["State"]).toUpperCase();
    if (!state.startsWith("ACTIVE")) continue;
    const processId = text(row["Process ID"]);
    if (!processId) continue;
    const policy = classifyWorldProcess(row);
    const lastAdvanced = text(row["Last advanced"]);
    const last = parseInworldMoment(lastAdvanced);
    const ageMinutes = now == null || last == null ? null : Math.max(0, now - last);
    if (policy.cadence === "EVENT_TRIGGERED") {
      eventTriggeredActive.push(processId);
      continue;
    }
    if (policy.cadence === "STAFFED_MILESTONE" && policy.targetDay != null) {
      if (now == null || now < policy.targetDay * 1440 + (policy.targetMinute ?? 0)) {
        staffedPending.push({ processId, targetDay: policy.targetDay });
        continue;
      }
      if (ageMinutes != null && ageMinutes < dailyReviewMinutes) continue;
      activeClocksOverdue.push({
        processId,
        ageMinutes,
        lastAdvanced: lastAdvanced || null,
        cadence: policy.cadence,
        reason: ageMinutes == null ? "TIMESTAMP_UNKNOWN" : "MILESTONE_REVIEW_DUE",
        targetDay: policy.targetDay,
      });
      continue;
    }
    if (ageMinutes == null || ageMinutes >= dailyReviewMinutes) {
      activeClocksOverdue.push({
        processId,
        ageMinutes,
        lastAdvanced: lastAdvanced || null,
        cadence: policy.cadence,
        reason: ageMinutes == null ? "TIMESTAMP_UNKNOWN" : "REVIEW_OVERDUE",
      });
    }
  }
  activeClocksOverdue.sort((a, b) => (b.ageMinutes ?? Infinity) - (a.ageMinutes ?? Infinity));
  return { activeClocksOverdue, eventTriggeredActive, staffedPending };
}
