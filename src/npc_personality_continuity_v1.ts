/**
 * NPC Life V4 add-on: causal continuity review, never automatic personality rewrites.
 * Separate momentary state, directional relationship adaptation and deep trait revision.
 */
export type ChangeEvidence = {
  id: string;
  sourceRef: string;
  inWorldDay: number;
  personallyExperiencedOrKnown: boolean;
  significance: 'routine' | 'meaningful' | 'landmark';
};
export type NpcContinuityRequest = {
  actorId: string;
  baselineCanonRef: string;
  previousPattern: string;
  proposedPattern: string;
  scope: 'MOMENTARY_STATE' | 'DIRECTED_RELATIONSHIP' | 'STABLE_PERSONALITY';
  towardActorId?: string;
  causalExplanation: string;
  evidence: ChangeEvidence[];
  observedBehaviorRef: string;
};
export type NpcContinuityResult = {
  ok: true;
  schema: 'NPC_PERSONALITY_CONTINUITY_V1_PROPOSAL';
  actorId: string;
  scope: NpcContinuityRequest['scope'];
  eligibleForHumanReview: boolean;
  blockers: string[];
  evidenceRefs: string[];
  committed: false;
  sourceAttested: false;
  canonRewriteAuthorized: false;
  directedOnly: boolean;
  needsSemanticCommit: true;
};
export type NpcContinuityError = {ok:false;code:string;reason:string};
const id = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9_.:-]{3,180}$/.test(x);
const refuse=(code:string,reason:string):NpcContinuityError=>({ok:false,code,reason});
export function reviewNpcPersonalityContinuityV1(x:NpcContinuityRequest):NpcContinuityResult|NpcContinuityError {
  if (!x || !id(x.actorId) || !id(x.baselineCanonRef) || !id(x.observedBehaviorRef) ||
      !['MOMENTARY_STATE','DIRECTED_RELATIONSHIP','STABLE_PERSONALITY'].includes(x.scope) ||
      (x.scope === 'DIRECTED_RELATIONSHIP' && (!id(x.towardActorId) || x.towardActorId === x.actorId)) ||
      (x.towardActorId !== undefined && (!id(x.towardActorId) || x.towardActorId === x.actorId)))
    return refuse('NPC_CONTINUITY_BAD_ACTORS','Canonical anchor, observed source and valid directional actor required');
  if (typeof x.previousPattern !== 'string' || x.previousPattern.trim().length < 8 ||
      typeof x.proposedPattern !== 'string' || x.proposedPattern.trim().length < 8 ||
      x.previousPattern.trim() === x.proposedPattern.trim() ||
      typeof x.causalExplanation !== 'string' || x.causalExplanation.trim().length < 24 ||
      x.causalExplanation.length > 2000)
    return refuse('NPC_CONTINUITY_NO_CAUSAL_MECHANISM','Actual different pattern and substantial causal explanation required');
  if (!Array.isArray(x.evidence) || x.evidence.length < 1 || x.evidence.length > 12 ||
      x.evidence.some(e => !e || !id(e.id) || !id(e.sourceRef) ||
        !Number.isSafeInteger(e.inWorldDay) || e.inWorldDay < 0 ||
        typeof e.personallyExperiencedOrKnown !== 'boolean' ||
        !['routine','meaningful','landmark'].includes(e.significance)) ||
      new Set(x.evidence.map(e=>e.id)).size!==x.evidence.length ||
      new Set(x.evidence.map(e=>e.sourceRef)).size!==x.evidence.length)
    return refuse('NPC_CONTINUITY_BAD_EVIDENCE','Distinct, bounded, personally available event sources required');
  const known = x.evidence.filter(e => e.personallyExperiencedOrKnown && e.significance !== 'routine');
  const distinctDays = new Set(known.map(e => e.inWorldDay)).size;
  const landmark = known.some(e => e.significance === 'landmark');
  const blockers:string[]=[];
  if (known.length === 0) blockers.push('NO_MEANINGFUL_PERSONALLY_KNOWN_EVIDENCE');
  if (x.scope === 'STABLE_PERSONALITY' && !(landmark || (known.length >= 2 && distinctDays >= 2)))
    blockers.push('DEEP_CHANGE_REQUIRES_REPEAT_PATTERN_OR_LANDMARK');
  if (x.scope === 'DIRECTED_RELATIONSHIP' && known.length === 0)
    blockers.push('RELATIONSHIP_CANNOT_CHANGE_FROM_ROUTINE_CONTACT_ALONE');
  return {
    ok:true,schema:'NPC_PERSONALITY_CONTINUITY_V1_PROPOSAL',actorId:x.actorId,
    scope:x.scope,eligibleForHumanReview:blockers.length===0,blockers,
    evidenceRefs:known.map(e=>e.sourceRef),committed:false,sourceAttested:false,
    canonRewriteAuthorized:false,directedOnly:x.scope==='DIRECTED_RELATIONSHIP',
    needsSemanticCommit:true,
  };
}
