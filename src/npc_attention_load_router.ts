/**
 * Pre-read routing from a source-verified NPC attention projection.
 * No NPC relationship/state writes, and no stale cache is authoritative.
 */
export type AttentionReadDepth = 'SKIP'|'SHELL'|'BASIC'|'SOCIAL'|'HISTORY'|'FULL';
export type AttentionSnapshot = {
  actorId: string;
  /** Source-verified, computed by npc_attention_ladder.ts. */
  activeTier: number;
  importance: string;
  sourceSaveId: string;
};
export function planAttentionReadBudget(input: {
  saveId: string;
  sceneActorIds: readonly string[];
  explicitlyRequestedActorIds?: readonly string[];
  activelyEngagedActorIds?: readonly string[];
  /** Threats, witnesses, staff and other actors needed for actual physical causality. */
  causallyRelevantActorIds?: readonly string[];
  dueKeyLifeReviewIds?: readonly string[];
  snapshots: readonly AttentionSnapshot[];
  maxIncidentalActors?: number;
}) {
  const unique = (list: readonly string[]) => [...new Set(list.filter(Boolean))];
  const scene = new Set(unique(input.sceneActorIds));
  const direct = new Set(unique(input.explicitlyRequestedActorIds ?? []));
  const active = new Set(unique(input.activelyEngagedActorIds ?? []));
  const dueKey = new Set(unique(input.dueKeyLifeReviewIds ?? []));
  const causal = new Set(unique(input.causallyRelevantActorIds ?? []));
  const critical = new Set([...direct, ...active, ...dueKey, ...causal]);
  const registered = new Map(input.snapshots.map(x=>[x.actorId,x]));
  const incidentalBudget = Math.max(0,Math.min(24,Math.floor(input.maxIncidentalActors??8)));
  let incidentalUsed = 0;
  const items:Array<{actorId:string;readDepth:AttentionReadDepth;reason:string;forced:boolean}> = [];
  const deferred:string[]=[];
  const seen = new Set<string>();
  for (const actorId of [...critical, ...scene]) {
    if (!actorId || seen.has(actorId)) continue;
    seen.add(actorId);
    const snapshot = registered.get(actorId);
    const attested = snapshot?.sourceSaveId === input.saveId;
    const verifiedKey = attested && snapshot?.importance.toUpperCase()==='KEY';
    const forced = critical.has(actorId) || verifiedKey;
    let depth:AttentionReadDepth = 'SKIP', reason='COLD_IRRELEVANT';
    if (forced) { depth='FULL';reason='DIRECT_ENGAGEMENT_OR_KEY_REVIEW'; }
    else if (scene.has(actorId)) {
      if (!attested) { depth='SHELL';reason='MISSING_FRESH_ATTENTION_INDEX'; }
      else {
        const tier=Math.max(0,Math.min(5,Math.floor(snapshot?.activeTier??0)));
        depth=tier>=4?'HISTORY':tier===3?'SOCIAL':tier===2?'BASIC':'SHELL';
        reason='SOURCE_MATCHED_SCENE_ATTENTION_TIER';
      }
    }
    if (!forced && depth!=='SKIP' && incidentalUsed>=incidentalBudget) {
      deferred.push(actorId);
      continue;
    }
    if (!forced && depth!=='SKIP') incidentalUsed++;
    items.push({actorId,readDepth:depth,reason,forced});
  }
  return {schema:'NPC_HEAT_CONTEXT_LOAD_V1' as const,saveId:input.saveId,
    committed:false as const,sourceProjectionRequired:true,
    reads:items,incidentalActorsLoaded:incidentalUsed,
    deferredIncidentalActorIds:deferred,
    criticalActorsNeverDropped:true,
    limitations:[
      'Never substitute shallow context for a substantive NPC reply or significant decision',
      'Cold actors remain physically present and dangerous when the scene requires them',
      'Every actual actor response must pass the complete NPC context gate',
      'Stale attention index cannot assert social warmth or knowledge',
      'Not a new source of NPC state; the current committed runtime remains authoritative',
    ]};
}
