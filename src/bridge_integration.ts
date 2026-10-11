import {config} from "./config.ts";

export const BRIDGE_FLOW_VERSION="RPG_BRIDGE_TURN_FLOW_V1_2026-10-12";

/** Staged deployment feature handshake; never claims to have written game state. */
export function bridgeFeatureStatus(){
  return {
    schema:BRIDGE_FLOW_VERSION,
    releaseStage:"SOURCE_GATED_PHASE_2",
    mode:"STAGED_SOURCE_GATED",
    existingMcpToolIdentity:"UNCHANGED",
    existingSiteAndAuth:"REUSE_EXISTING",
    available:{
      activeWorldProcessDocket:true,
      fullTurnDispatcher:false,
      guardedWorkCompetition:false,
      gmTurnBrief:true,
      worldTickPlan:"READ_ONLY_PROPOSALS",
      independentNpcLifePlan:"READ_ONLY_PROPOSALS",
      memoryRoute:"FAST_OR_TARGETED_DEEP",
      systemNotificationCenter:"SOURCE_DERIVED_READ_ONLY",
      precommitFastAudit:true,
      milestoneOptionProof:true,
      sourceFundedWorkCompetition:"READ_ONLY_PROPOSALS",
    },
    gated:{
      progressionReviewStrict:config.turnProgressionReviewStrict,
      notificationAckDurable:config.systemNotificationAckEnabled,
      ec06LedgerAndPaidOffers:"BLOCKED_UNTIL_VERIFIED_ATOMIC_SOURCE_WRITER",
      autonomousNpcChoices:"GM_CAUSAL_RESOLUTION_REQUIRED",
      autonomousNPCChoices:"GM_CAUSAL_RESOLUTION_REQUIRED",
      automatedGameplayCommit:"NOT_AUTHORIZED",
    },
    defaultProtocol:[
      "runtime_health",
      "get_turn_context",
      "simulate_world_v3 only for required source-backed calculations",
      "prepare_turn for high stakes or validation",
      "commit_turn semantic only after causal proof and player permissions",
      "render_current_hud after successful committed gameplay",
      "render_system_event only for committed visible outcomes",
    ],
  };
}

/** Client-tool hints derive from already-loaded context. They are not actions. */
export function bridgeTurnIntegrationPlan(input:{
  saveId:string; turnClass:string;
  memoryDepth:"FAST"|"TARGETED_DEEP";missingSources:readonly string[];
  plannedElapsedSeconds:number;keyNpcDue:number;worldProcessDue:number;
  npcContextReady:boolean;
}) {
  const advanced=input.plannedElapsedSeconds>0;
  const needCausalSimulation=advanced&&(input.keyNpcDue>0||input.worldProcessDue>0);
  const blockers=[
    ...(input.memoryDepth==="TARGETED_DEEP"&&input.missingSources.length
      ? ["TARGETED_SOURCE_LOOKUPS_REQUIRED"] : []),
    ...(!input.npcContextReady?["NPC_CONTEXT_GATE_NOT_READY"]:[]),
    ...(advanced&&input.keyNpcDue>0?["KEY_NPC_LIFEV4_REVIEW_REQUIRED"]:[]),
    ...(advanced&&input.worldProcessDue>0?["WORLD_PROCESS_CAUSAL_RESOLUTION_REQUIRED"]:[]),
  ];
  return {
    schema:BRIDGE_FLOW_VERSION,saveId:input.saveId,
    phase:"SOURCE_GATED_PHASE_2",
    planOnly:true,gameTimeAdvanced:false,
    sequence:[
      "READ_CONTEXT",...(needCausalSimulation?["SIMULATE_WORLD_V3"]:[]),
      "VALIDATE_SOURCE_AND_PLAYER_AGENCY",
      ...(needCausalSimulation||input.turnClass==="COMPLEX"||input.turnClass==="HIGH_STAKES"
        ?["PREPARE_TURN"]:[]),
      "COMMIT_SEMANTIC_IF_AUTHORIZED","RENDER_CURRENT_HUD_AFTER_COMMIT",
      "RENDER_COMMITTED_SYSTEM_EVENTS",
    ],
    order:[
      "READ_CONTEXT",...(needCausalSimulation?["SIMULATE_WORLD_V3"]:[]),
      "SOURCE_VALIDATE","PROPOSE_SEMANTIC",
      ...(needCausalSimulation||input.turnClass==="COMPLEX"||input.turnClass==="HIGH_STAKES"
        ?["PREPARE_TURN"]:[]),
      "COMMIT_TURN","RENDER_CURRENT_HUD","RENDER_COMMITTED_EVENTS",
    ],
    blockers,
    suggestedV3JobsCap:12,
    strictProgressionReview:config.turnProgressionReviewStrict,
    acknowledgmentWriterReady:config.systemNotificationAckEnabled,
    transactionRequired:advanced,
    autoCommit:false,
    warning:"Only a successful semantic commit can advance the clock or authorize a System event",
  };
}
