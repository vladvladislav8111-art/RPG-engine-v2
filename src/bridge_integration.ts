/** Deployment handshake from the running Deno revision, not the App manifest. */
export const BRIDGE_FLOW_VERSION="RPG_BRIDGE_TURN_FLOW_V1_2026-10-12";

export function bridgeFeatureStatus(){
 return {
  schema:BRIDGE_FLOW_VERSION,releaseStage:"READ_ONLY_PHASE_1",
  existingMcpToolIdentity:"UNCHANGED",existingSiteAndAuth:"REUSE_EXISTING",
  available:{
   worldTickPlan:"READ_ONLY_PROPOSALS",
   independentNpcLifePlan:"READ_ONLY_PROPOSALS",
   memoryRoute:"FAST_OR_TARGETED_DEEP",
   activeWorldProcessDocket:true,
   fullTurnDispatcher:false,
   systemNotificationCenter:false,
   precommitFastAudit:false,
   guardedWorkCompetition:false,
  },
  gated:{
   progressionReviewStrict:false,
   notificationAckDurable:false,
   ec06LedgerAndPaidOffers:"BLOCKED_UNTIL_VERIFIED_ATOMIC_SOURCE_WRITER",
   autonomousNpcChoices:"GM_CAUSAL_RESOLUTION_REQUIRED",
   automatedGameplayCommit:"NOT_AUTHORIZED",
  },
  defaultProtocol:[
   "runtime_health","get_turn_context",
   "simulate_world_v3 when required by a causal scene",
   "prepare_turn for high-stakes or complex turns",
   "commit_turn only for authorized semantic gameplay",
   "render_current_hud after successful commit",
   "render_system_event only for committed visible outcomes",
  ],
 };
}
/** Read-only route: advisory about correct caller sequence, never invokes tools. */
export function bridgeTurnIntegrationPlan(input:{
 saveId:string;turnClass:string;memoryDepth:"FAST"|"TARGETED_DEEP";
 missingSources:readonly string[];plannedElapsedSeconds:number;
 keyNpcDue:number;worldProcessDue:number;npcContextReady:boolean;
}){
 const gameTime=input.plannedElapsedSeconds>0;
 const needV3=gameTime&&(input.keyNpcDue>0||input.worldProcessDue>0);
 const blockers=[
  ...(input.memoryDepth==="TARGETED_DEEP"&&input.missingSources.length?["TARGETED_SOURCE_LOOKUPS_REQUIRED"]:[]),
  ...(!input.npcContextReady?["NPC_CONTEXT_GATE_NOT_READY"]:[]),
  ...(gameTime&&input.keyNpcDue>0?["KEY_NPC_CAUSAL_LIFEV4_REVIEW_REQUIRED"]:[]),
  ...(gameTime&&input.worldProcessDue>0?["WORLD_PROCESS_CAUSAL_RESOLUTION_REQUIRED"]:[]),
 ];
 return {
  schema:BRIDGE_FLOW_VERSION,saveId:input.saveId,
  phase:"READ_ONLY_PHASE_1",planOnly:true,gameTimeAdvanced:false,
  sequence:["READ_CONTEXT",...(needV3?["SIMULATE_WORLD_V3"]:[]),
   "VALIDATE_SOURCE_AND_PLAYER_AGENCY",
   ...(needV3||input.turnClass==="COMPLEX"||input.turnClass==="HIGH_STAKES"?["PREPARE_TURN"]:[]),
   "COMMIT_SEMANTIC_IF_AUTHORIZED","RENDER_CURRENT_HUD_AFTER_COMMIT",
   "RENDER_COMMITTED_SYSTEM_EVENTS"],
  blockers,worldV3MaxBatchJobs:12,
  strictProgressionReview:false,notificationAckEnabled:false,ec06FinancialWriterEnabled:false,
  autoCommit:false,notes:"This is advice, not executed actions; the existing write path is unchanged",
 };
}
