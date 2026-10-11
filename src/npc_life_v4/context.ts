/** Pure bounded presentation advisory generated ONLY from already loaded actor data. */
export type V4BehaviorInput={actorId:string;importance:unknown;currentGoal:unknown;identityAnchors:unknown;competenceAnchors:unknown;currentLocation:unknown;lastUpdated:unknown;linkedClocks:number;knownFacts:number;socialMemories:number;openThreads:number;relationshipRows:number;activityRulePresent:boolean;activeProjectCount?:number};
export function summarizeNpcLifeContext(input:V4BehaviorInput){
 const tier=String(input.importance??'').trim().toUpperCase()==='KEY'?'KEY':'RECURRING';
 const actionable=String(input.currentGoal??'').trim().length>0;
 const gaps:string[]=[];
 if(!actionable)gaps.push('current_goal_unset');
 if(!String(input.identityAnchors??'').trim())gaps.push('identity_anchors_unset');
 if(!String(input.competenceAnchors??'').trim())gaps.push('competence_anchors_unset');
 if(tier==='KEY'&&!input.activityRulePresent)gaps.push('key_npc_activity_rule_absent');
 if(tier==='KEY'&&(input.activeProjectCount??0)===0&&input.linkedClocks===0)gaps.push('personal_project_or_decision_trigger_not_materialized');
 return {schema:'NPC_LIFE_V4_BEHAVIORAL_AUDIT',actorId:input.actorId,trackedTier:tier,personalGoalIsRecorded:actionable,independentActivityRulePresent:input.activityRulePresent,linkedWorldClocks:input.linkedClocks,knownFactCount:input.knownFacts,meaningfulMemoryCount:input.socialMemories,openThreadCount:input.openThreads,directedBondCount:input.relationshipRows,currentLocation:input.currentLocation??null,lastNpcStateUpdate:input.lastUpdated??null,reviewGaps:gaps,offscreenOutcomesUnknown:true,neverInferNewEvents:true,notPlayerVisible:true};
}
