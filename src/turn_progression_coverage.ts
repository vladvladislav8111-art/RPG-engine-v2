/**
 * Every gameplay turn must consciously review progression, without inventing XP.
 * Optional fail-closed deployment gate avoids breaking the existing Bridge until updated.
 */
export type ProgressionReview={
 outcome:"AWARD"|"SOURCE_BASED_ZERO";reason:string;sourceRefs?:string[];
};
export function validateTurnCoverage(input:{
 elapsedSeconds:number;turnClass?:string;review?:ProgressionReview;
 generalEvents:readonly unknown[];learningEvents:readonly unknown[];
 adaptationEvents:readonly unknown[];strict:boolean;
}) {
 const eventCount=input.generalEvents.length+input.learningEvents.length+
   input.adaptationEvents.length;
 const gameTime=input.elapsedSeconds>0;
 const fail=(message:string)=>{throw Error("TURN_PROGRESSION_REVIEW:"+message)};
 let status:"EXPLICIT_AWARD"|"EXPLICIT_ZERO"|"INCOMPLETE"|"META_NO_TIME"="META_NO_TIME";
 if(input.review){
   if(input.review.reason.trim().length<20)fail("EVIDENCE_EXPLANATION_TOO_SHORT");
   if(input.review.outcome==="AWARD"){
     if(eventCount===0)fail("AWARD_WITHOUT_PROGRESSION_EVENT");
     if(!(input.review.sourceRefs?.length))fail("AWARD_SOURCE_REFERENCE_MISSING");
     status="EXPLICIT_AWARD";
   }else{
     if(eventCount>0)fail("ZERO_CONTRADICTS_AWARD_EVENTS");
     status="EXPLICIT_ZERO";
   }
 }else if(gameTime||eventCount>0){
   status="INCOMPLETE";
   if(input.strict)fail("MISSING_REVIEW_FOR_GAMEPLAY_TURN");
 }
 return {
   schema:"TURN_PROGRESSION_COVERAGE_V1",
   status,eventsChecked:eventCount,
   reviewed:status==="EXPLICIT_AWARD"||status==="EXPLICIT_ZERO"||status==="META_NO_TIME",
   extraReads:0,noAutomaticXp:true,
   required:gameTime||eventCount>0,
   instruction:status==="INCOMPLETE"
     ?"Master must record a source-backed XP/competence assessment or explain zero before strict release."
     :"Validated progression assessment; actual XP remains computed by the existing engine.",
 };
}
