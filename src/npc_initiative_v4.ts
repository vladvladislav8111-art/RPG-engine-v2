/** NPC Life V4: evaluate possible self-initiated acts from verified present facts.
 * Advisory only. A possibility is NOT an emotional truth, encounter, message,
 * consent, promise, job or writer authorization. GM/V3 must decide and commit.
 */
import {planNpcInnerMotivesV4, type NpcStimulus} from "./npc_inner_motives_v4.ts";

export type NpcRow = Record<string, unknown>;
export type NpcInitiativeInput = {
  actorId: string;
  current: NpcRow | null;
  activityRule?: NpcRow | null;
  relationshipToShura?: NpcRow | null;
  socialMemories?: readonly NpcRow[];
  knowledge?: readonly NpcRow[];
  openThreads?: readonly NpcRow[];
  elapsedSeconds: number;
  /** Set true ONLY on directly observed co-presence, not matching district IDs. */
  verifiedCoPresenceWithShura: boolean;
  /** Consent and working transport channel from live runtime, not guessed access. */
  verifiedLiveCommunicationChannel?: boolean;
  /** Proof the NPC can make a discretionary choice without abandoning a fixed duty. */
  discretionaryWindowConfirmed?: boolean;
  /** A real newly perceived event, including an independent personal/work event. */
  observedEventSourceRefs?: readonly string[];
  /** Source IDs already used for NPC-originated actions during this scene. */
  alreadyInitiatedSourceRefs?: readonly string[];
  /** Only newly observed, independently verified stimuli of this decision window. */
  observedStimuli?: readonly NpcStimulus[];
  /** Co-present characters OTHER than Shura, with actual physical verification. */
  verifiedCoPresentActorIds?: readonly string[];
  /** Independently verified contact channels to other actors. */
  verifiedContactActorIds?: readonly string[];
};
export type NpcInitiativeCandidate = {
  type: 'SPEAK_FIRST' | 'EXPRESS_PERSONAL_STANCE' | 'SET_BOUNDARY' |
    'OUTREACH' | 'PRIORITIZE_OWN_DUTY' | 'ACT_ON_OWN_GOAL';
  possible: true;
  sourceRefs: string[];
  needsNpcDecision: true;
  needsIndependentTimeAndCausality: boolean;
  nextCheck: string;
};
const field = (row: NpcRow | null | undefined, key: string) => String(row?.[key] ?? '').trim();
const fields = (row: NpcRow | null | undefined, keys: readonly string[]) =>
  keys.map(key => field(row, key)).filter(Boolean);
const grounded = (xs: readonly string[]) => [...new Set(xs.filter(Boolean))].slice(0, 16);

export function planNpcInitiativeV4(i: NpcInitiativeInput) {
  if (!i.actorId || !Number.isSafeInteger(i.elapsedSeconds) || i.elapsedSeconds < 0)
    throw Error('NPC_INITIATIVE_INVALID_INPUT');
  const current = i.current;
  const tier = field(current, 'Importance').toUpperCase();
  const activeRule = field(i.activityRule, 'State').toUpperCase() === 'ACTIVE';
  const role = field(current, 'Role');
  const goal = field(current, 'Current goal/activity');
  const identity = field(current, 'Identity anchors');
  const candidateRelation = i.relationshipToShura;
  const relation = candidateRelation &&
    field(candidateRelation, "Actor ID") === i.actorId &&
    field(candidateRelation, "Toward ID") === "player.shura" &&
    field(candidateRelation, "Status").toUpperCase() === "ACTIVE"
    ? candidateRelation : null;
  const relationshipEvidence = field(relation, 'Evidence refs')
    .split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const memories = (i.socialMemories ?? []).filter(m =>
    field(m, 'Status').toUpperCase() === 'ACTIVE' &&
    field(m, 'Participants').split(';').includes(i.actorId) &&
    field(m, 'Participants').split(';').includes('player.shura'));
  const memoryEvidence = memories.map(m => field(m, 'Origin event') || field(m, 'Source'));
  const relationshipEvidenceRefs = grounded([...relationshipEvidence, ...memoryEvidence]);
  const standingFeeling = fields(relation, ['Warmth', 'Current stance', 'Tension', 'Fear']);
  const eventRefs = grounded(i.observedEventSourceRefs ?? []);
  const dutyRefs = grounded(fields(i.activityRule, ['Primary anchors', 'Fixed obligations override'])
    .map(x => 'live:activity-rule:' + i.actorId));
  const ownSource = goal ? ['live:npc-current:' + i.actorId] : [];
  const noRepeat = new Set(i.alreadyInitiatedSourceRefs ?? []);
  const unspent = (refs: readonly string[]) => refs.filter(ref => !noRepeat.has(ref));
  const blockers: string[] = [];
  if (!current) blockers.push('LIVE_NPC_NOT_MATERIALIZED');
  if (current && field(current, 'NPC ID') && field(current, 'NPC ID') !== i.actorId)
    blockers.push('NPC_IDENTITY_MISMATCH');
  if (i.activityRule && field(i.activityRule, 'NPC ID') && field(i.activityRule, 'NPC ID') !== i.actorId)
    blockers.push('NPC_ACTIVITY_RULE_MISMATCH');
  if (!goal) blockers.push('INDEPENDENT_GOAL_NOT_LOADED');
  if (!identity) blockers.push('PERSONALITY_ANCHORS_NOT_LOADED');
  if (tier === 'KEY' && !activeRule) blockers.push('KEY_ACTIVITY_RULE_MISSING');
  if (i.elapsedSeconds === 0) blockers.push('NO_GAME_TIME_PASSED_META_REVIEW_ONLY');
  const ready = blockers.length === 0;
  const list: NpcInitiativeCandidate[] = [];
  const offer = (type: NpcInitiativeCandidate['type'], refs: string[], nextCheck: string,
                 costsIndependentTime = true) => {
    const sourceRefs = unspent(grounded(refs));
    if (!sourceRefs.length || !ready) return;
    list.push({type, possible: true, sourceRefs, needsNpcDecision:true,
      needsIndependentTimeAndCausality: costsIndependentTime, nextCheck});
  };
  // A person can voice an internal preference spontaneously during a REAL meeting.
  // No prompt from Shura is necessary; the exact emotion/dialogue is resolved by GM.
  if (i.verifiedCoPresenceWithShura) {
    offer('SPEAK_FIRST', grounded([...eventRefs, ...ownSource, ...relationshipEvidenceRefs]),
      'Resolve independent desire to speak, current conversational opening, language and duties');
    if (standingFeeling.length && relationshipEvidenceRefs.length)
      offer('EXPRESS_PERSONAL_STANCE', relationshipEvidenceRefs,
        'Verify actual present feeling/intention; not an automatic love confession or touch');
    if (fields(relation, ['Tension', 'Fear']).length ||
      field(i.activityRule, 'Fixed obligations override'))
      offer('SET_BOUNDARY', grounded([...relationshipEvidenceRefs, ...dutyRefs]),
        'NPC may assert privacy, ask to stop, decline contact or return to work');
  }
  // Even absent Shura, NPC can independently act on their own established priorities.
  offer('ACT_ON_OWN_GOAL', ownSource, 'Check schedule, logistics, budget and V3 LifeV4 causal result');
  if (activeRule)
    offer('PRIORITIZE_OWN_DUTY', grounded([...ownSource, ...dutyRefs]),
      'Source actual obligations; work/rest may displace any optional social idea');
  // A message can be NPC-initiated, but only through a real, currently usable link.
  // No implicit address knowledge, telepathy, messenger or guaranteed delivery.
  if (!i.verifiedCoPresenceWithShura && i.verifiedLiveCommunicationChannel &&
      i.discretionaryWindowConfirmed && relationshipEvidenceRefs.length)
    offer('OUTREACH', grounded([...relationshipEvidenceRefs, ...eventRefs]),
      'Check channel provenance, duty availability, language, voluntary intent and receipt');
  const sourceBoundOpenThreads = (i.openThreads ?? []).filter(t => {
    const state = field(t, 'Status').toUpperCase();
    return state === 'ACTIVE' || state === 'OPEN' || state.startsWith('PENDING');
  });
  const innerMotives = planNpcInnerMotivesV4({
    actorId:i.actorId, current:i.current, activityRule:i.activityRule,
    relationships: relation ? [relation] : [],
    stimuli:i.observedStimuli ?? [],
    verifiedCoPresentActorIds:[
      ...(i.verifiedCoPresenceWithShura ? ['player.shura'] : []),
      ...(i.verifiedCoPresentActorIds ?? []),
    ],
    verifiedContactActorIds:[
      ...(i.verifiedLiveCommunicationChannel ? ['player.shura'] : []),
      ...(i.verifiedContactActorIds ?? []),
    ],
    discretionaryWindowConfirmed:i.discretionaryWindowConfirmed,
    consumedStimulusRefs:i.alreadyInitiatedSourceRefs,
    elapsedSeconds:i.elapsedSeconds,
  });
  return {
    schema:'NPC_INITIATIVE_V4_PROPOSALS_V1' as const, actorId:i.actorId, tier,
    innerMotives,
    readyForGMResolution:ready, elapsedSeconds:i.elapsedSeconds, committed:false as const,
    privacy:'GM_ONLY' as const, spontaneousSpeechDoesNotNeedPlayerPrompt:true as const,
    socialContactGuaranteed:false as const, romanceOrPhysicalConsentInferred:false as const,
    factualEmotionsCommitted:false as const,
    knownRole:role || null, knownGoal:goal || null,
    citedPersonalHistoryCount:relationshipEvidenceRefs.length,
    outstandingThreadCount:sourceBoundOpenThreads.length,
    candidates:list, blockers,
    constraints:[
      'Real in-person speech can be spontaneous; no user utterance needed to trigger GM review',
      'Feelings may arise from the NPC’s life, but must be causally resolved, not invented as prior facts',
      'No unsolicited physical affection or new romantic status follows from warmth',
      'Offscreen messages require an actual authorized working channel and time',
      'Shop obligations, consent, privacy, true knowledge and physical travel remain binding',
      'One candidate is a possible GM/V3 branch, not a committed NPC action',
      'Never use a fabricated Taren phrase or translate unknown player vocabulary',
    ],
  };
}
