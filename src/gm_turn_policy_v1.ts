/** Mandatory GM protocol prompts + server-only timing breakdown (never model-side latency). */
export type PhaseMark={phase:string;elapsedMs:number};
const SAFE_PHASES=new Set(["routing_sheets","bulk_source_fanout","npc_bounded_context","context_compose",
 "v3_source_batch","v3_pure_calculations","v3_source_enrichment","v3_response"]);
export function summarizeBridgeTiming(phases:PhaseMark[],totalMs:number){
 if(!Number.isFinite(totalMs)||totalMs<0||phases.length>16)throw Error("PERFORMANCE_BOUNDS");
 const sanitized=phases.map(x=>{
  if(!SAFE_PHASES.has(x.phase)||!Number.isFinite(x.elapsedMs)||x.elapsedMs<0)
   throw Error("PERFORMANCE_PHASE_INVALID");
  return {phase:x.phase,elapsedMs:Math.round(x.elapsedMs)};
 });
 sanitized.sort((a,b)=>b.elapsedMs-a.elapsedMs);
 return {scope:"DENO_SERVER_ONLY" as const,measuredTotalMs:Math.round(totalMs),
  slowestPhases:sanitized.slice(0,8),unmeasured:[
   "ChatGPT model reasoning and response generation","Connector routing/UI rendering",
   "Client network latency outside the Deno request"],notGameplayTime:true as const};
}
export function mandatoryGmPacket(tags:readonly string[],elapsedSeconds:number){
 if(!Number.isSafeInteger(elapsedSeconds)||elapsedSeconds<0||elapsedSeconds>604800)
  throw Error("GM_CLOCK_BOUNDS");
 const upper=tags.map(x=>x.toUpperCase());
 const isWork=upper.some(t=>/WORK|JOB|MARKET|TRADE|EMPLOY|DOCUMENT|LEDGER|ACCOUNT/.test(t));
 const hasNpc=upper.some(t=>/NPC|SOCIAL|RUMOR|RELATION|VESH|CHAT/.test(t));
 const base=["VERIFY_CURRENT_COMMITTED_SAVE","RECONCILE_PLAYER_AGENCY",
  "SOURCE_CHECK_NPC_WORLD_PROCESSES","RECONCILE_TIME_AND_SURVIVAL",
  "VALIDATE_OWNERSHIP_CUSTODY_AND_FINANCE","PREPARE_SEMANTIC",
  "COMMIT_BEFORE_NARRATION","RENDER_VERIFIED_HUD"];
 const work=isWork?["LIVE_OFFER_DISCOVERY_NOT_INVENTION",
  "SOURCE_BACKED_EMPLOYER_AND_INDEPENDENT_BUDGET",
  "AUTHORITATIVE_SKILL_TASK_PLAN",
  "APPLY_EXISTING_METHOD_AND_CALCULATOR",
  "SEPARATE_PLAYER_WORK_AND_EMPLOYER_QC",
  "REVIEW_DIRECT_REPUTATION_AND_ACTUAL_GOSSIP",
  "REQUIRE_ACCEPTANCE_RECEIPTS_BEFORE_WAGES"]:[];
 const npc=hasNpc?["RESOLVE_CAUSAL_LIFEV4_DECISION","CHECK_ACTUAL_CONTACT_AND_KNOWLEDGE","APPLY_RELAY_LATENCY"]:[];
 const actions=[...base,...work,...npc];
 return {schema:"GM_TURN_ENFORCEMENT_PLAN_V1" as const,sourceOnly:true as const,
  commitPermitted:false as const,elapsedSeconds,requiredChecks:actions,
  requiredOperations:isWork?["offer_board","capability_check","task_plan","gm_turn_audit"]:
    hasNpc?["npc_decision","knowledge_relay","gm_turn_audit"]:["turn","gm_turn_audit"],
  bundleMaxJobs:12,packSourceReads:true as const,
  noAutoWorldWrites:true as const,zeroTimeMetaAllowed:true as const};
}
