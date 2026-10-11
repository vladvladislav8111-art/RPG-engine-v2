import {isId,minute,reject,unique,type LifeReviewInput,type LifeResult,type LifeReviewItem,type LifeReviewResult,type PersonalObligation} from './types.ts';
function overlap(a:{from:number;to:number},b:{from:number;to:number}){return Math.max(a.from,b.from)<Math.min(a.to,b.to);}
function occupancy(obligations:readonly PersonalObligation[],at:number){return obligations.filter(x=>x.state==='active'&&x.from<=at&&x.to>at);}
export function reviewNpcLife(input:LifeReviewInput):LifeResult{
 const {window,actors,evidence,options}=input;
 if(!window||!minute(window.start)||!minute(window.end)||window.end<window.start)return reject('INVALID_WINDOW','Time must be forward and source-based');
 if(window.end-window.start>60*1440)return reject('COARSE_WINDOW_REQUIRED','Review windows above 60 days must be paged');
 const max=input.maxActors??12;
 if(!Number.isSafeInteger(max)||max<1||max>24)return reject('INVALID_LIMIT','Max 24 bounded actor reviews');
 if(actors.length>max||options.length>96||evidence.length>128)return reject('PAGE_REQUIRED','Review a bounded active NPC segment');
 if(!unique(actors.map(a=>a.actorId))||!unique(options.map(o=>o.optionId))||!unique(evidence.map(e=>e.id)))return reject('DUPLICATE_IDENTIFIER','Duplicate actors/options/evidence refused');
 if(actors.some(a=>!isId(a.actorId)||!isId(a.stableIdentityRef)||!a.currentGoalSource||a.lastLifeTick!==null&&(!minute(a.lastLifeTick)||a.lastLifeTick>window.start)))return reject('UNVERIFIED_ACTOR','Need actor identity, current goal source, and non-future activity tick');
 const allObligations=actors.flatMap(a=>a.obligations);
 const allProjects=actors.flatMap(a=>a.projects);
 if(!unique(allObligations.map(x=>x.id))||!unique(allProjects.map(x=>x.id)))return reject('DUPLICATE_PROCESS','Duplicate obligation or personal project');
 for(const actor of actors){
  if(actor.obligations.length>32||actor.projects.length>24||actor.relationships.length>32)return reject('UNBOUNDED_ACTOR','Personal causal context too large');
  for(const o of actor.obligations){if(o.actorId!==actor.actorId||!minute(o.from)||!minute(o.to)||o.from>=o.to||!o.sourceRef||!isId(o.locationId))return reject('INVALID_OBLIGATION','Finite owned obligation and source required');}
  const active=actor.obligations.filter(x=>x.state==='active');
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){if(overlap(active[i],active[j])&&active[i].locationId!==active[j].locationId)return reject('IMPOSSIBLE_LOCATION','Actor in two simultaneous locations');}
  for(const p of actor.projects)if(p.actorId!==actor.actorId||!p.causeRef||!p.ownerSourceRef||!p.nextDecisionTrigger||p.nextReviewAt!==null&&!minute(p.nextReviewAt))return reject('UNSOURCED_PROJECT','Materialize personal project with cause and trigger');
  for(const rel of actor.relationships)if(rel.fromId!==actor.actorId||rel.towardId===actor.actorId||!rel.sourceRef)return reject('INVALID_RELATIONSHIP','Direct relationship must have provenance');
 }
 for(const e of evidence)if(!isId(e.id)||!minute(e.at)||e.at>window.end||!e.sourceRef||!actors.some(a=>a.actorId===e.actorId))return reject('INVALID_EVIDENCE','Evidence must be bounded, actor-specific and not future');
 for(const o of options)if(!isId(o.optionId)||!isId(o.actorId)||!isId(o.goalRef)||!minute(o.earliestAt)||!minute(o.latestAt)||o.earliestAt>o.latestAt||!o.sourceRef||o.requiredEvidenceIds.length>16||o.blockedByObligationIds.length>16||!actors.some(a=>a.actorId===o.actorId))return reject('INVALID_OPTION','Only sourced, bounded NPC choices allowed');
 const verifiedByActor=new Map(actors.map(a=>[a.actorId,new Set(evidence.filter(e=>e.confirmed&&e.at>=window.start&&e.actorId===a.actorId).map(e=>e.id))]));
 const reviews:LifeReviewItem[]=[];
 for(const a of actors){
  const projects=a.projects.filter(p=>p.state==='active'&&p.nextReviewAt!==null&&p.nextReviewAt<=window.end&&p.nextReviewAt>=window.start);
  const activeObligations=a.obligations.filter(o=>o.state==='active'&&overlap(o,{from:window.start,to:window.end}));
  const possible=options.filter(o=>o.actorId===a.actorId&&o.earliestAt<=window.end&&o.latestAt>=window.start&&o.requiredEvidenceIds.every(id=>verifiedByActor.get(a.actorId)?.has(id))&&o.blockedByObligationIds.every(id=>!activeObligations.some(x=>x.id===id))&&occupancy(a.obligations,Math.max(window.start,o.earliestAt)).every(x=>x.kind!=='sleep'&&x.kind!=='travel'));
  const state=possible.length>0||projects.length>0?'DUE_FOR_GM_RESOLUTION':a.projects.some(p=>p.state==='active')?'AWAIT_TRIGGER':'NO_ACTIVE_PERSONAL_PROCESS';
  const dates=a.projects.filter(p=>p.state==='active'&&p.nextReviewAt!==null&&p.nextReviewAt>window.end).map(p=>p.nextReviewAt as number);
  reviews.push({actorId:a.actorId,state,triggeredProjectIds:projects.map(p=>p.id),possibleOptionIds:possible.map(o=>o.optionId),occupiedObligationIds:activeObligations.map(x=>x.id),lastLifeTick:a.lastLifeTick,nextDueAt:dates.length?Math.min(...dates):null,currentGoal:a.currentGoal,sourceConfirmed:!!a.currentGoalSource,committed:false,choicesMade:0});
 }
 return {ok:true,code:'NPC_LIFE_V4_PROPOSAL',sourceAttested:false,committed:false,reviews,deferredActorIds:[]};
}
