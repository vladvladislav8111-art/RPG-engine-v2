/**
 * NPC contextual attention ("warmth") 0..5, distinct from affection/trust.
 *
 * Pure derived index from COMMITTED source events. No live reads or writes.
 * Every event passed here must be verified against durable event receipts by
 * the caller; a boolean in a proposal is not independent writer attestation.
 */
export type AttentionEventKind =
  | 'SCENE_PRESENCE'
  | 'ROUTINE_CONTACT'
  | 'SUBSTANTIVE_EXCHANGE'
  | 'MEANINGFUL_RELATIONSHIP_EVENT'
  | 'INDEPENDENT_CHARACTER_EVENT';

export type CommittedNpcAttentionEvent = {
  eventId: string;
  actorId: string;
  txId: string;
  sourceRef: string;
  sceneId: string;
  day: number;
  time: string;
  kind: AttentionEventKind;
  committed: true;
  /** For social contact: another participant; for independent events may be absent. */
  counterpartIds?: string[];
  /** Important social/character developments must have an explicit GM evidence review. */
  meaningfulEvidence?: string;
};

export type NpcAttentionInput = {
  actorId: string;
  importance: string;
  nowDay: number;
  nowTime: string;
  /** Authoritative evidence supplied in a targeted, bounded slice. */
  events: readonly CommittedNpcAttentionEvent[];
  /** True only if this includes enough durable history to evaluate deeper tiers. */
  historyComplete: boolean;
  /** Existing permanent character anchors are never inferred from a counter. */
  durableIdentityAvailable: boolean;
  independentLifeRuleAvailable: boolean;
};

const DAY_SECONDS = 86400;
const WINDOW_SECONDS = DAY_SECONDS;
const norm = (s: unknown) => String(s ?? '').trim();
function moment(day: number, time: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(norm(time));
  if (!Number.isSafeInteger(day) || day < 1 || !m) throw Error('NPC_HEAT_INVALID_WORLD_CLOCK');
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || sec > 59) throw Error('NPC_HEAT_INVALID_WORLD_CLOCK');
  return day * DAY_SECONDS + h * 3600 + min * 60 + sec;
}

const meaningfulKinds = new Set<AttentionEventKind>([
  'MEANINGFUL_RELATIONSHIP_EVENT', 'INDEPENDENT_CHARACTER_EVENT',
]);
const contactKinds = new Set<AttentionEventKind>([
  'SUBSTANTIVE_EXCHANGE', ...meaningfulKinds,
]);
const allowedKinds = new Set<AttentionEventKind>([
  'SCENE_PRESENCE', 'ROUTINE_CONTACT', ...contactKinds,
]);
const minimumEvidence = 24;

/** A single person can have earned a complete dossier while being cold in active RAM. */
export function planNpcContextHeat(input: NpcAttentionInput) {
  if (!input.actorId || !Number.isSafeInteger(input.nowDay) || input.nowDay < 1)
    throw Error('NPC_HEAT_INVALID_ACTOR');
  const now = moment(input.nowDay, input.nowTime);
  const isKey = input.importance.toUpperCase() === 'KEY';
  const byId = new Map<string, CommittedNpcAttentionEvent>();
  const warnings: string[] = [];
  let rejected = 0;

  for (const event of input.events) {
    if (event.actorId !== input.actorId) continue;
    if (!event.eventId || !event.txId || !event.sourceRef || !event.sceneId ||
        event.committed !== true || !allowedKinds.has(event.kind)) {
      rejected++;
      continue;
    }
    let timestamp: number;
    try { timestamp = moment(event.day, event.time); } catch { rejected++; continue; }
    if (timestamp > now) { rejected++; continue; }
    if (meaningfulKinds.has(event.kind) &&
        norm(event.meaningfulEvidence).length < minimumEvidence) {
      // A warm glance or a sale is not proof of character/relationship development.
      rejected++;
      continue;
    }
    const prior = byId.get(event.eventId);
    if (prior) {
      const canonical = (e: CommittedNpcAttentionEvent) => JSON.stringify({
        actorId:e.actorId, txId:e.txId, sourceRef:e.sourceRef, sceneId:e.sceneId,
        day:e.day, time:e.time, kind:e.kind,
        counterpartIds:[...(e.counterpartIds??[])].sort(),
        meaningfulEvidence:norm(e.meaningfulEvidence),
      });
      if (canonical(prior) !== canonical(event))
        throw Error('NPC_HEAT_DUPLICATE_EVENT_COLLISION');
      continue; // Idempotent replay of one durable event does not heat twice.
    }
    byId.set(event.eventId, event);
  }
  if (rejected) warnings.push('Rejected malformed, future, uncommitted, or unsupported events.');
  if (!input.historyComplete)
    warnings.push('Incomplete source history: do not assume this is the actor’s full earned depth.');

  const events = [...byId.values()];
  const seenScenes = new Set<string>();
  const scenesByDay = new Map<number, Map<string, {weight:number;meaningful:boolean}>>();
  const meaningfulDays = new Set<number>();
  const meaningfulSocialDays = new Set<number>();
  let lastRelevant: number | null = null;
  let everSeen = false;
  for (const event of events) {
    const at = moment(event.day, event.time);
    const sceneKey = `${event.day}|${event.sceneId}`;
    if (!seenScenes.has(sceneKey)) { everSeen = true; seenScenes.add(sceneKey); }
    if (lastRelevant === null || at > lastRelevant) lastRelevant = at;
    if (!contactKinds.has(event.kind)) continue;
    const daily = scenesByDay.get(event.day) ?? new Map();
    const weight = meaningfulKinds.has(event.kind) ? 2 : 1;
    const old = daily.get(event.sceneId);
    daily.set(event.sceneId, {
      weight: Math.max(old?.weight ?? 0, weight),
      meaningful: Boolean(old?.meaningful || meaningfulKinds.has(event.kind)),
    });
    scenesByDay.set(event.day, daily);
  }

  // Presence only grants entry to tier 1. Routine purchases/greetings cannot farm depth.
  let points = everSeen ? 1 : 0;
  let contactSceneCount = 0;
  for (const [day, scenes] of scenesByDay) {
    const weights = [...scenes.values()].map(x => x.weight).sort((a,b) => b-a);
    points += Math.min(2, weights.reduce((sum,x) => sum+x, 0));
    contactSceneCount += scenes.size;
    if ([...scenes.values()].some(x => x.meaningful)) meaningfulDays.add(day);
  }
  for (const event of events) {
    if (event.kind === 'MEANINGFUL_RELATIONSHIP_EVENT' &&
        event.counterpartIds?.includes('player.shura')) meaningfulSocialDays.add(event.day);
  }
  const distinctMeaningfulDays = meaningfulDays.size;
  const distinctMeaningfulSocialDays = meaningfulSocialDays.size;
  let earnedTier: 0|1|2|3|4|5 = 0;
  if (points >= 1) earnedTier = 1;
  if (points >= 3 && contactSceneCount >= 2) earnedTier = 2;
  if (points >= 6 && distinctMeaningfulDays >= 2) earnedTier = 3;
  if (points >= 10 && distinctMeaningfulDays >= 4) earnedTier = 4;
  // Source completeness prevents a truncated slice from masquerading as a complete history.
  const promotionReviewEligible = !isKey && input.historyComplete && earnedTier >= 4 &&
    distinctMeaningfulSocialDays >= 6 && input.durableIdentityAvailable &&
    input.independentLifeRuleAvailable;
  if (isKey) earnedTier = 5; // Only the committed NPC_CURRENT importance grants KEY.

  const secondsSinceLastRelevant = lastRelevant === null ? null : now - lastRelevant;
  // Attention is an active cache priority, not an erasure of the persistent actor dossier.
  const profileTier = input.historyComplete || isKey ? earnedTier : Math.min(earnedTier, 1);
  const activeTier = isKey ? 5 : secondsSinceLastRelevant !== null &&
    secondsSinceLastRelevant < WINDOW_SECONDS ? profileTier : 0;
  if (!isKey && earnedTier > profileTier)
    warnings.push('Deep history is incomplete. Load precise event evidence before allowing tier 2–4 hydration.');
  if (isKey && !input.independentLifeRuleAvailable)
    warnings.push('KEY NPC requires source-backed activity rule review; do not demote automatically.');

  const detailActions = [
    {tier:0,load:'NONE',instruction:'No detailed NPC materialization for absent, irrelevant actors'},
    {tier:1,load:'SCENE_DAY_CACHE',instruction:'Keep lightweight identity/scene pointers for 24 in-world hours'},
    {tier:2,load:'BASIC_IDENTITY',instruction:'Retrieve canonical identity, role, independent goals and capabilities; do not invent a past'},
    {tier:3,load:'DIRECTED_RELATIONSHIPS',instruction:'Load only sourced NPC↔NPC and NPC↔Shura relations, consent, memories and boundaries'},
    {tier:4,load:'SOURCE_BACKED_HISTORY',instruction:'Expand to full verified character history from existing records; unknowns remain unknown'},
    {tier:5,load:'KEY_LIFEV4',instruction:'Committed KEY state and regular autonomous life rules; permanent priority'},
  ] as const;

  const desired = detailActions[activeTier];
  return {
    schema:'NPC_CONTEXT_HEAT_LADDER_V1' as const,
    actorId:input.actorId,
    sourceMode:'VERIFIED_COMMITTED_EVIDENCE_REQUIRED' as const,
    committed:false as const,
    earnedTier, profileTier, activeTier,
    cacheLoad:desired.load,
    cacheExpiresInSeconds:isKey?null:
      secondsSinceLastRelevant===null?0:Math.max(0, WINDOW_SECONDS-secondsSinceLastRelevant),
    distinctMeaningfulDays, distinctMeaningfulSocialDays, contactSceneCount,
    uniqueEventCount:events.length, ignoredEventCount:rejected,
    promotionReviewEligible,
    promotionBlockedReasons:isKey?[]:[
      ...(input.historyComplete?[]:['HISTORY_INCOMPLETE']),
      ...(earnedTier>=4?[]:['DOSSIER_DEPTH_BELOW_4']),
      ...(distinctMeaningfulSocialDays>=6?[]:['FEWER_THAN_6_DISTINCT_MEANINGFUL_SOCIAL_DAYS']),
      ...(input.durableIdentityAvailable?[]:['DURABLE_IDENTITY_NOT_ATTESTED']),
      ...(!input.independentLifeRuleAvailable?['KEY_LIFEV4_ACTIVITY_RULE_REVIEW_REQUIRED']:[]),
    ],
    // A review is still needed even if all prerequisites hold: NEVER write KEY from score.
    playerChoiceRequired:false, keyPromotionAutomatic:false,
    sourceEvidenceRequiredBeforeWriter:true, noNpcMemoriesDeleted:true,
    warmthMeans:'context_attention_not_affection' as const,
    tierInstructions:detailActions,
    warnings,
  };
}
