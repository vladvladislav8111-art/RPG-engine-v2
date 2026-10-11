/** Advisory selective context routing. Normal narrative turns retain full scene NPC load.
 * Only explicitly MICRO/inspection reads can bypass incidental market-bystander context.
 */
export function shouldLoadSceneActors(input: {
 turnClass: string; tags: readonly string[]; explicitActorIds?: readonly string[];
 actorRefs?: readonly string[]; requireNpcContextGate?: boolean;
}) {
 const tags = input.tags.map(x => x.toUpperCase());
 const safeMicro = new Set([
  'HUD','STATUS','RESOURCE','RESOURCES','INVENTORY','STORAGE',
  'SYSTEM','SYSTEM_INBOX','NOTIFICATIONS','MAP','CLOCK','WORLD',
  'META','DIAGNOSTIC','READ_ONLY','COMPETENCES','XP','PROGRESSION',
 ]);
 const explicit = Boolean(input.explicitActorIds?.length || input.actorRefs?.length || input.requireNpcContextGate);
 const omit = input.turnClass === 'MICRO' && !explicit && tags.every(t => safeMicro.has(t));
 return {loadSceneActors: !omit, reason: omit ? 'MICRO_INSPECTION_ONLY' : 'NARRATIVE_OR_ACTOR_CONTEXT',
  preserveAuthoritativeScenePointer: true, playerVisibleChange: false};
}

export function sourceReadBudgetNotice(input: {
 turnClass: string; tags: readonly string[];
 sceneActorsConsidered: number; sceneActorsLoaded: number;
 actorIndexApproxCells?: number; actorExactApproxCells?: number;
 targetedDocQueries?: number; localWorldTables?: number;
}) {
 const approximateCells=(input.actorIndexApproxCells??0)+(input.actorExactApproxCells??0);
 const warnings: string[] = [];
 if(input.sceneActorsConsidered>0 && input.sceneActorsLoaded===0)
  warnings.push('Incidental scene actors were omitted for explicit MICRO inspection only. The scene pointer is unchanged.');
 if(approximateCells>4000)
  warnings.push('Actor context exceeds the soft read budget; limit participants before next detailed NPC exchange, not their durable knowledge.');
 if((input.targetedDocQueries??0)>6)
  warnings.push('Too many document queries. Prefer exact evidence refs and narrow ranges.');
 return {schema:'GM_CONTEXT_BUDGET_V1',readOnly:true,extraSourceReads:0,
  approximateActorCells:approximateCells,sceneActorsConsidered:input.sceneActorsConsidered,
  sceneActorsLoaded:input.sceneActorsLoaded, warnings,
  rules:['Never cache stale NPC mutable state across commits',
   'Do not create a second memory store or erase original social memory',
   'Keep full bounded actor facts accessible for substantive NPC decisions',
   'Never skip direct scene actors during normal, complex or high-stakes turns']};
}
