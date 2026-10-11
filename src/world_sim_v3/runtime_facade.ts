/**
 * Authenticated, bounded, READ-ONLY live-engine facade over the V3 domain library.
 * Requests are model/GM provided snapshots, NOT source attestation.
 * A successful result never writes nor authorizes writing to RPG runtime.
 */
import {pass,deny,type SimOutcome,type Evidence,type Fact} from './types.ts';
import {proposeWorldTurn} from './orchestrator.ts';
import {evaluateNpcPresence,validateNpcIndependentDecision} from './npc.ts';
import {advanceCraftOrder,approveCraftCompletion,allocateWorkshopCapacity} from './craft.ts';
import {adjudicateAttack} from './combat.ts';
import {estimateRoute} from './travel.ts';
import {relayKnowledge} from './knowledge.ts';
import {planWorldReview,validateWorldResolution} from './world.ts';
import {planCustodyTransfer} from './inventory.ts';
import {proposeMaterializedOfferBoard,generateOffer} from './opportunities.ts';
import {planAchievementAward,planTitleAward,planProgressCycle,planSystemObjectiveReward,planExplicitSupPurchase,applicableTitleEffects} from './progression.ts';
import {ACHIEVEMENTS_V3,TITLES_V3,ACHIEVEMENT_CATALOG_COUNTS} from './achievement_catalog.ts';

export const WORLD_V3_OPERATIONS=[
 'turn','npc_presence','npc_decision','craft_advance','craft_qc','workshop_capacity',
 'combat','travel','knowledge_relay','world_review','world_resolution',
 'inventory_transfer','generate_offer','offer_board','achievement','title',
 'progress_cycle','objective_reward','sup_purchase','title_effects',
] as const;
export type WorldV3Operation=typeof WORLD_V3_OPERATIONS[number];
export type WorldV3Job={id:string;operation:WorldV3Operation;payload:Record<string,unknown>};
export type WorldV3BatchRequest={expectedSaveId:string;jobs:WorldV3Job[]};
export type WorldV3BatchResult={schema:'RPG_WORLD_V3_CALCULATIONS_V1';expectedSaveId:string;sourceAttested:false;committed:false;requiresSemanticCommit:true;catalogStatus:'DESIGN_CANDIDATE';catalog:{achievements:number;titles:number};results:{id:string;operation:WorldV3Operation;result:SimOutcome<unknown>}[]};
const cleanId=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=180&&/^[a-zA-Z0-9._:-]+$/.test(x);
const rec=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const array=(x:unknown):x is unknown[]=>Array.isArray(x);
const strArray=(x:unknown):x is string[]=>Array.isArray(x)&&x.length<=128&&x.every(y=>cleanId(y));
function checkValue(x:unknown,depth=0):void {
 if(depth>12)throw Error('WORLD_V3_PAYLOAD_DEPTH');
 if(x===null||typeof x==='boolean')return;
 if(typeof x==='string') {if(x.length>4096)throw Error('WORLD_V3_STRING_TOO_LARGE');return;}
 if(typeof x==='number'){if(!Number.isFinite(x))throw Error('WORLD_V3_NOT_FINITE');return;}
 if(array(x)) {if(x.length>128)throw Error('WORLD_V3_ARRAY_TOO_LARGE');for(const y of x)checkValue(y,depth+1);return;}
 if(rec(x)){const keys=Object.keys(x);if(keys.length>90)throw Error('WORLD_V3_OBJECT_TOO_LARGE');for(const key of keys){if(key==='__proto__'||key==='constructor'||key==='prototype'||key.length>180)throw Error('WORLD_V3_UNSAFE_KEY');checkValue(x[key],depth+1);}return;}
 throw Error('WORLD_V3_UNSAFE_VALUE');
}
function setOf(v:unknown,label:string):Set<string>{if(!strArray(v))throw Error(label+' requires bounded IDs');return new Set(v);}
function as<T>(v:Record<string,unknown>):T{return v as T;}
function execute(job:WorldV3Job):SimOutcome<unknown>{
 const p=job.payload;
 switch(job.operation){
 case 'turn': return proposeWorldTurn({...as<Parameters<typeof proposeWorldTurn>[0]>(p),evidence:as<Evidence[]>(p.evidence as Record<string,unknown>)});
 case 'npc_presence':return evaluateNpcPresence(as<Parameters<typeof evaluateNpcPresence>[0]>(p));
 case 'npc_decision':return validateNpcIndependentDecision(p.decision as Parameters<typeof validateNpcIndependentDecision>[0],setOf(p.knownOpportunityIds,'knownOpportunityIds'));
 case 'craft_advance':return advanceCraftOrder({...as<Parameters<typeof advanceCraftOrder>[0]>(p),holidays:setOfNumbers(p.holidays)});
 case 'craft_qc':return approveCraftCompletion(p.order as Parameters<typeof approveCraftCompletion>[0],p.quality as Parameters<typeof approveCraftCompletion>[1]);
 case 'workshop_capacity':return allocateWorkshopCapacity(as<Parameters<typeof allocateWorkshopCapacity>[0]>(p.slots as Record<string,unknown>),p.staffMinutes as number);
 case 'combat':return adjudicateAttack(as<Parameters<typeof adjudicateAttack>[0]>(p));
 case 'travel':return estimateRoute(as<Parameters<typeof estimateRoute>[0]>(p));
 case 'knowledge_relay':{
   if(!array(p.provenance)||p.provenance.length>128||!p.provenance.every(row=>array(row)&&row.length===2&&cleanId(row[0])&&rec(row[1])))throw Error('WORLD_V3_PROVENANCE');
   return relayKnowledge({facts:p.facts as Fact[],message:as<Parameters<typeof relayKnowledge>[0]['message']>(p.message as Record<string,unknown>),provenance:new Map(p.provenance as [string,Evidence][])});
 }
 case 'world_review':return planWorldReview({...as<Parameters<typeof planWorldReview>[0]>(p),evidenceIds:setOf(p.evidenceIds,'evidenceIds')});
 case 'world_resolution':return validateWorldResolution({...as<Parameters<typeof validateWorldResolution>[0]>(p),requiredKnowledgeRefs:setOf(p.requiredKnowledgeRefs,'requiredKnowledgeRefs')});
 case 'inventory_transfer':return planCustodyTransfer(p.lots as Parameters<typeof planCustodyTransfer>[0],p.req as Parameters<typeof planCustodyTransfer>[1]);
 case 'generate_offer':return generateOffer(as<Parameters<typeof generateOffer>[0]>(p));
 case 'offer_board':return proposeMaterializedOfferBoard(as<Parameters<typeof proposeMaterializedOfferBoard>[0]>(p));
 case 'achievement':{
   const def=ACHIEVEMENTS_V3.find(d=>d.id===p.definitionId);
   if(!def)return deny('UNKNOWN_DRAFT_ACHIEVEMENT','No such catalog entry');
   // Live canon activation cannot be claimed in a request body.
   return planAchievementAward({definition:def,subjectId:p.subjectId as string,subjectType:p.subjectType as 'SYSTEM_USER'|'NPC',evidence:p.evidence as Evidence[],alreadyEarned:setOf(p.alreadyEarnedIds,'alreadyEarnedIds'),existingAwardOrigins:setOf(p.existingAwardOrigins,'existingAwardOrigins'),canonActivatedIds:new Set(),gmAuthorizationRef:p.gmAuthorizationRef as string});
 }
 case 'title':{
   const def=TITLES_V3.find(d=>d.id===p.definitionId);
   if(!def)return deny('UNKNOWN_DRAFT_TITLE','No such candidate title');
   return planTitleAward({definition:def,subjectId:p.subjectId as string,earnedAchievementIds:setOf(p.earnedAchievementIds,'earnedAchievementIds'),evidence:p.evidence as Evidence[],alreadyHeld:setOf(p.alreadyHeld,'alreadyHeld'),activatedTitleIds:new Set(),gmAuthorizationRef:p.gmAuthorizationRef as string});
 }
 case 'progress_cycle':return planProgressCycle({...as<Parameters<typeof planProgressCycle>[0]>(p),consumedEvidenceIds:setOf(p.consumedEvidenceIds,'consumedEvidenceIds'),existingCycleIds:setOf(p.existingCycleIds,'existingCycleIds')});
 case 'objective_reward':return planSystemObjectiveReward({...as<Parameters<typeof planSystemObjectiveReward>[0]>(p),canonActiveIds:new Set(),alreadyRewardedIds:setOf(p.alreadyRewardedIds,'alreadyRewardedIds')});
 case 'sup_purchase':return planExplicitSupPurchase(as<Parameters<typeof planExplicitSupPurchase>[0]>(p));
 case 'title_effects':return pass(applicableTitleEffects({titles:TITLES_V3,ownedTitleIds:setOf(p.ownedTitleIds,'ownedTitleIds'),activatedTitleIds:new Set(),trigger:p.trigger as string}));
 }
 return deny('UNSUPPORTED_OPERATION','No executable calculation found');
}
function setOfNumbers(v:unknown):Set<number>{if(!array(v)||v.length>128||!v.every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))throw Error('WORLD_V3_INVALID_HOLIDAYS');return new Set(v as number[]);}
/** This function is independently testable without Deno, Google or a save writer. */
export function dispatchWorldV3Batch(request:WorldV3BatchRequest,actualSaveId:string):WorldV3BatchResult{
 if(!rec(request)||!cleanId(request.expectedSaveId)||!cleanId(actualSaveId)||request.expectedSaveId!==actualSaveId)throw Error('WORLD_V3_STALE_SAVE');
 if(!array(request.jobs)||request.jobs.length<1||request.jobs.length>12)throw Error('WORLD_V3_BATCH_BOUNDS');
 if(JSON.stringify(request).length>64000)throw Error('WORLD_V3_REQUEST_TOO_LARGE');
 const names=new Set<string>();const results:WorldV3BatchResult['results']=[];
 for(const job of request.jobs){
  if(!rec(job)||!cleanId(job.id)||names.has(job.id)||!WORLD_V3_OPERATIONS.includes(job.operation as WorldV3Operation)||!rec(job.payload))throw Error('WORLD_V3_INVALID_JOB');
  names.add(job.id);checkValue(job.payload);
  let result:SimOutcome<unknown>;
  try {result=execute(job);}catch(err){result=deny('INVALID_SIMULATION_INPUT',err instanceof Error?err.message:'Rejected malformed calculation');}
  results.push({id:job.id,operation:job.operation,result});
 }
 return {schema:'RPG_WORLD_V3_CALCULATIONS_V1',expectedSaveId:actualSaveId,sourceAttested:false,committed:false,requiresSemanticCommit:true,catalogStatus:'DESIGN_CANDIDATE',catalog:{achievements:ACHIEVEMENT_CATALOG_COUNTS.achievements,titles:ACHIEVEMENT_CATALOG_COUNTS.titles},results};
}
