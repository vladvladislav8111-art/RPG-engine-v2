/** NPC Life V4 inner motives: source-backed opportunities for independent intent.
 * This is a deliberation PROPOSAL, never a fact that a feeling arose, never an act,
 * and never a transfer, contact, consent, or semantic write.
 *
 * GM supplies *observed* current stimuli; an old relationship/memory does not
 * magically become a fresh stimulus. Motives can concern ANY actor, not only Shura.
 */
export type NpcMotiveRow = Record<string, unknown>;
export type NpcStimulusKind =
  | 'NEW_INFORMATION' | 'POSITIVE_SOCIAL_EVENT' | 'OBSERVED_DISTRESS'
  | 'SOCIAL_FRICTION' | 'BOUNDARY_PRESSURE' | 'WORK_DEADLINE'
  | 'FATIGUE_EVIDENCE';
export type NpcStimulus = {
  sourceRef: string;
  kind: NpcStimulusKind;
  witnessedByNpc: boolean;
  /** Required for interpersonal motives; may refer to another NPC. */
  targetActorId?: string;
  /** Only source-confirmed stimuli in the current decision window are eligible. */
  currentDecisionWindow: boolean;
};
export type NpcMotiveKind =
  | 'FOLLOW_OWN_GOAL' | 'HONOR_OBLIGATION' | 'SEEK_UNDERSTANDING'
  | 'EXPRESS_CONNECTION' | 'OFFER_CONCERN' | 'ADDRESS_TENSION'
  | 'DEFEND_BOUNDARIES' | 'RESPOND_TO_EXHAUSTION';
export type NpcMotive = {
  id: string;
  kind: NpcMotiveKind;
  targetActorId: string | null;
  evidenceRefs: string[];
  priority: 'FIXED_DUTY' | 'BOUNDARY_OR_SAFETY' | 'DISCRETIONARY';
  canBeKeptPrivate: true;
  eligibleForIndependentDecision: true;
  needsNpcDecision: true;
  actionCommitted: false;
  emotionEstablished: false;
  /** Motive exists as proposal even when speaking/contact are impossible. */
  possibleExpression: 'IN_PERSON_IF_CHOSEN' | 'CONTACT_IF_CHANNEL_AND_TIME_CONFIRMED' | 'PRIVATE_ONLY';
};
export type NpcInnerMotivesInput = {
  actorId: string;
  current: NpcMotiveRow | null;
  activityRule?: NpcMotiveRow | null;
  relationships?: readonly NpcMotiveRow[];
  stimuli?: readonly NpcStimulus[];
  verifiedCoPresentActorIds?: readonly string[];
  verifiedContactActorIds?: readonly string[];
  discretionaryWindowConfirmed?: boolean;
  consumedStimulusRefs?: readonly string[];
  elapsedSeconds: number;
};
const value = (r: NpcMotiveRow | null | undefined, k: string) => String(r?.[k] ?? '').trim();
const dedupe = (xs: readonly string[]) => [...new Set(xs.filter(Boolean))];
const actorIdFormat = /^(?:npc\.[a-z0-9_.-]+|player\.shura)$/i;
const recognizedStimuli = new Set<NpcStimulusKind>([
  'NEW_INFORMATION', 'POSITIVE_SOCIAL_EVENT', 'OBSERVED_DISTRESS',
  'SOCIAL_FRICTION', 'BOUNDARY_PRESSURE', 'WORK_DEADLINE', 'FATIGUE_EVIDENCE',
]);
const motivation = (kind: NpcStimulusKind): NpcMotiveKind => ({
  NEW_INFORMATION: 'SEEK_UNDERSTANDING',
  POSITIVE_SOCIAL_EVENT: 'EXPRESS_CONNECTION',
  OBSERVED_DISTRESS: 'OFFER_CONCERN',
  SOCIAL_FRICTION: 'ADDRESS_TENSION',
  BOUNDARY_PRESSURE: 'DEFEND_BOUNDARIES',
  WORK_DEADLINE: 'HONOR_OBLIGATION',
  FATIGUE_EVIDENCE: 'RESPOND_TO_EXHAUSTION',
} satisfies Record<NpcStimulusKind, NpcMotiveKind>)[kind];
const socialKinds = new Set<NpcStimulusKind>([
  'POSITIVE_SOCIAL_EVENT', 'OBSERVED_DISTRESS', 'SOCIAL_FRICTION', 'BOUNDARY_PRESSURE',
]);

export function planNpcInnerMotivesV4(input: NpcInnerMotivesInput) {
  if (!actorIdFormat.test(input.actorId) || input.actorId === 'player.shura' ||
      !Number.isSafeInteger(input.elapsedSeconds) || input.elapsedSeconds < 0 ||
      input.elapsedSeconds > 604800) throw Error('NPC_INNER_MOTIVE_INVALID_INPUT');
  const current = input.current;
  const goal = value(current, 'Current goal/activity');
  const identity = value(current, 'Identity anchors');
  const npcCurrentValid = !!(current && goal && identity &&
    value(current, 'NPC ID') !== 'player.shura' &&
    (!value(current, 'NPC ID') || value(current, 'NPC ID') === input.actorId));
  const timeCanPass = input.elapsedSeconds > 0;
  const accepted = new Set(input.consumedStimulusRefs ?? []);
  const colocated = new Set(input.verifiedCoPresentActorIds ?? []);
  const channels = new Set(input.verifiedContactActorIds ?? []);
  const blockers: string[] = [];
  if (!npcCurrentValid) blockers.push('VERIFIED_IDENTITY_AND_GOAL_REQUIRED');
  if (!timeCanPass) blockers.push('ZERO_TIME_ONLY_REVIEW_NO_NEW_NPC_ACTION');
  const motives: NpcMotive[] = [];
  const seen = new Set<string>();
  const expression = (target: string | null): NpcMotive['possibleExpression'] =>
    target && colocated.has(target) ? 'IN_PERSON_IF_CHOSEN' :
    target && channels.has(target) && input.discretionaryWindowConfirmed === true
      ? 'CONTACT_IF_CHANNEL_AND_TIME_CONFIRMED' : 'PRIVATE_ONLY';
  function offer(kind: NpcMotiveKind, target: string | null, refs: string[],
                 priority: NpcMotive['priority']) {
    const evidenceRefs = dedupe(refs);
    if (!npcCurrentValid || !timeCanPass || !evidenceRefs.length) return;
    // Same source may elicit different motive kinds, but no duplicate of either.
    const id = `${input.actorId}|${kind}|${target ?? 'self'}|${evidenceRefs.join(',')}`;
    if (seen.has(id)) return;
    seen.add(id);
    motives.push({id, kind, targetActorId: target, evidenceRefs, priority,
      canBeKeptPrivate:true, eligibleForIndependentDecision:true,
      needsNpcDecision:true, actionCommitted:false, emotionEstablished:false,
      possibleExpression:expression(target)});
  }
  // Standing drives are grounded in existing live identity/obligations, but
  // do NOT prove a new psychological or financial outcome each turn.
  if (goal) offer('FOLLOW_OWN_GOAL', null, [`live:npc-current:${input.actorId}`], 'DISCRETIONARY');
  if ((!value(input.activityRule, 'NPC ID') || value(input.activityRule, 'NPC ID') === input.actorId) &&
      value(input.activityRule, 'State').toUpperCase() === 'ACTIVE' &&
      (value(input.activityRule, 'Primary anchors') || value(input.activityRule, 'Fixed obligations override')))
    offer('HONOR_OBLIGATION', null, [`live:npc-activity-rule:${input.actorId}`], 'FIXED_DUTY');
  if ((input.stimuli?.length ?? 0) > 12) throw Error('NPC_INNER_MOTIVE_BATCH_LIMIT');
  const invalidStimuli: string[] = [];
  const seenStimulusRefs = new Set<string>();
  for (const s of input.stimuli ?? []) {
    const ref = s.sourceRef?.trim() ?? '';
    if (!ref || !recognizedStimuli.has(s.kind) || !s.witnessedByNpc ||
        !s.currentDecisionWindow || accepted.has(ref) || seenStimulusRefs.has(ref)) {
      if (ref && (!s.witnessedByNpc || !s.currentDecisionWindow)) invalidStimuli.push(ref);
      continue;
    }
    seenStimulusRefs.add(ref);
    const target = s.targetActorId ?? null;
    if (target != null && (!actorIdFormat.test(target) || target === input.actorId)) {
      invalidStimuli.push(ref);
      continue;
    }
    if (socialKinds.has(s.kind) && !target) {
      invalidStimuli.push(ref);
      continue;
    }
    // A positive shared event alone may provoke gratitude or friendliness, but
    // it CANNOT establish a relationship. A formal relationship record, when
    // available, is merely extra context; never infer reciprocity from it.
    if (s.kind === 'POSITIVE_SOCIAL_EVENT' && target) {
      const directed = (input.relationships ?? []).find(r =>
        value(r, 'Actor ID') === input.actorId && value(r, 'Toward ID') === target &&
        value(r, 'Status').toUpperCase() === 'ACTIVE');
      // Positive witness event alone suffices for a *candidate* friendly response.
      // If it is sourced, enrich provenance; do not require a preexisting bond.
      offer(motivation(s.kind), target, [ref, ...(directed ? [value(directed, 'Relationship ID')].filter(Boolean) : [])],
        'DISCRETIONARY');
      continue;
    }
    const priority: NpcMotive['priority'] =
      s.kind === 'BOUNDARY_PRESSURE' || s.kind === 'OBSERVED_DISTRESS'
        ? 'BOUNDARY_OR_SAFETY'
        : s.kind === 'WORK_DEADLINE' ? 'FIXED_DUTY' : 'DISCRETIONARY';
    offer(motivation(s.kind), target, [ref], priority);
  }
  const weight = {BOUNDARY_OR_SAFETY:0, FIXED_DUTY:1, DISCRETIONARY:2};
  motives.sort((a,b) => weight[a.priority]-weight[b.priority] || a.id.localeCompare(b.id));
  return {
    schema:'NPC_INNER_MOTIVES_V4_SOURCE_PROPOSALS_V1' as const,
    actorId:input.actorId,
    mode:'READ_ONLY_PROPOSALS' as const,
    committed:false as const,
    sourceRefsPresentButUnattested:true as const,
    sourceAuthorityRequiresGMVerification:true as const,
    spontaneousInitiativeAllowed:true as const,
    npcMayDeclineEveryMotive:true as const,
    noNewEmotionalFacts:true as const,
    noGuaranteedExternalAction:true as const,
    readyForDecision:npcCurrentValid && timeCanPass,
    blockers,
    invalidStimulusRefs:dedupe(invalidStimuli),
    motivations:motives,
    needCommitForActualDecision:true as const,
    constraints:[
      'An intention may exist without public expression; do not invent NPC thoughts as settled canon',
      'Only witnessed source-backed events can awaken event-specific motives; history alone does not become fresh news',
      'Caller-supplied source refs and witness flags are NOT authenticated evidence; independently verify against committed runtime',
      'Competing motives, identity, autonomy, schedule, fatigue and boundaries are resolved by GM and Life V4',
      'A contact needs real means, consent, travel/time and an NPC decision; proposals do not send messages',
      'An NPC may act without waiting for Shura, including toward other NPCs, but Shura choices remain his',
      'No NPC relation or emotion is automatically reciprocated, and no romance/physical consent is granted',
      'No gameplay write occurs here; resolve NPC actions through verified semantic commit',
    ],
  };
}
