/** Living World V2: one evidence-bounded causal review for the RPG Lab GM.
 *
 * All output is PROPOSED, not a committed event, a guaranteed reaction,
 * a background worker, a psychic connection or player-visible knowledge.
 * Each proposal has actual source references or is explicitly marked as
 * contingent on first-hand observation/meeting.
 */
import type {LabPack,LabNpc} from "./engine.ts";
import type {LabSession,LabNpcState,LabMemory} from "./session.ts";
import {dueLabWorldProjects} from "./living_world.ts";
import {proposeIndependentWorldAgenda} from "./autonomy.ts";
import type {LabWorldEvidence} from "./world_evidence.ts";

const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const good=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&
 !["constructor","prototype","__proto__"].includes(s);
const words=(s:string)=>new Set((s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)??[]));
const strength=(x:"routine"|"notable"|"transformative")=>
 x==="transformative"?3:x==="notable"?2:1;
const interest=(profile:LabNpc,evidence:LabWorldEvidence)=>{
 const persona=[...profile.traits,...profile.goals,profile.name,profile.speechStyle??""]
   .join(" ").toLowerCase();
 const subject=(evidence.statement+" "+evidence.scope).toLowerCase();
 const common=words(persona);
 const overlap=[...words(subject)].some(x=>common.has(x));
 const tech=/thread|fiber|metal|steel|armor|weapon|gun|rifle|craft|equip|material|нить|брон|оруж|металл|кузн|материал/i.test(subject);
 const technical=/smith|forge|weapon|craft|engineering|research|equipment|кузн|ков|мастер|исслед|оруж|снаряж/i.test(persona);
 const danger=/danger|attack|pierc|kill|penetrat|threat|пробив|опас|убий|угроз|атак/i.test(subject);
 const protect=/guard|security|protect|risk|tactic|стратег|защит|безопас|угроз/i.test(persona);
 const reasons=[
  ...(overlap?["keyword_overlap_with_canonical_interests"]:[]),
  ...(tech&&technical?["known_craft_or_research_interest"]:[]),
  ...(danger&&protect?["known_security_or_protection_interest"]:[]),
 ];
 return {related:reasons.length>0,reasons,score:Math.min(5,
  strength(evidence.significance)+(reasons.length?2:0))};
};
const sourceKnown=(state:LabNpcState|undefined,ref:string)=>
 !!state?.memories.some(m=>m.sourceRef===ref||m.relayedSourceRef===ref);
const isDirect=(state:LabNpcState|undefined,ref:string)=>
 !!state?.memories.some(m=>m.sourceRef===ref&&
  ["seen","heard","experienced"].includes(m.channel??""));
const tone= (profile:LabNpc,state:LabNpcState|undefined,focusKind?:string)=>{
 const cues:string[]=[];
 const base=[...profile.traits,profile.speechStyle??""].join(" ").toLowerCase();
 if(/teas|jok|irreveren|sarcas|playful|поддраз|язв|шут|пошл/i.test(base))
  cues.push("teasing_or_irreverent_if_motivated");
 if(/harsh|aggress|proud|blunt|hostile|rude|груб|агресс|горд|резк/i.test(base))
  cues.push("direct_confrontation_allowed");
 if(/cautio|calculat|pragmat|strateg|skeptic|осторож|расч|прагмат|стратег/i.test(base))
  cues.push("measured_skepticism_without_denial_of_proof");
 if(/lust|flirt|sensual|desire|любвеобил|флирт|похот/i.test(base))
  cues.push("flirt_or_innuendo_if_situation_supports_it");
 if(state?.mood?.label) cues.push("present_mood:"+state.mood.label);
 for(const p of profile.responsePatterns?.[focusKind??""]??[])
  cues.push("canon_pattern:"+p.emotion+"|"+p.motive);
 if(cues.length===0)cues.push("follow_canon_traits_without_assuming_politeness");
 return cues.slice(0,8);
};
export type LabCycleRequest={
 npcIds:string[];fromMinute:number;toMinute:number;
 focusEventRef?:string;maxPerActor?:number;
};
export function previewLabLivingWorldCycle(pack:LabPack,
 session:LabSession,req:LabCycleRequest){
 if(!req||!Array.isArray(req.npcIds)||req.npcIds.length>16||
  !req.npcIds.every(x=>good(x)&&Boolean(pack.npcProfiles[x]))||
  new Set(req.npcIds).size!==req.npcIds.length||
  !Number.isSafeInteger(req.fromMinute)||!Number.isSafeInteger(req.toMinute)||
  req.fromMinute<0||req.toMinute<req.fromMinute||
  req.toMinute-req.fromMinute>10080||
  (req.focusEventRef!==undefined&&!good(req.focusEventRef))||
  (req.maxPerActor!==undefined&&(!Number.isInteger(req.maxPerActor)||
    req.maxPerActor<1||req.maxPerActor>8)))
  throw Error("LAB_LIVING_CYCLE_REQUEST_INVALID");
 const max=req.maxPerActor??3;
 const focus=req.focusEventRef?
  session.events.find(x=>x.sourceRef===req.focusEventRef):undefined;
 const profiles=pack.npcProfiles;
 const selected=new Set(req.npcIds);
 const evidence=Object.values(session.worldEvidence??{})
  .filter(x=>!req.focusEventRef||x.sourceRef===req.focusEventRef);
 const significance=req.npcIds.map(npcId=>{
  const profile=profiles[npcId],state=session.npcs[npcId];
  const known=evidence.filter(x=>sourceKnown(state,x.sourceRef))
   .map(fact=>{
    const relevant=interest(profile,fact);
    return {factId:fact.factId,sourceRef:fact.sourceRef,
     exactScope:fact.scope,claimLevel:fact.level,claimKind:fact.kind,
     significance:fact.significance,observedPersonally:
      fact.observedBy.includes(npcId)&&isDirect(state,fact.sourceRef),
     sourceBearingKnowledge:true,
     personallyRelevant:relevant.related,
     plausibleInterestReasons:relevant.reasons,priority:relevant.score,
     cannotExtrapolate:true,attentionNotAdmiration:true};
   }).sort((a,b)=>b.priority-a.priority||a.factId.localeCompare(b.factId))
   .slice(0,max);
  const firstSights=Object.entries(session.player.visibleFeatures??{})
   .filter(([featureId,v])=>v.visibility==="obvious"&&
     (state?.perceptions?.[featureId]?.notices??0)===0)
   .slice(0,max).map(([featureId,v])=>({
     featureId,description:v.description,significance:v.significance,
     possibleFirstSightOnly:true,actualWitnessNotYetEstablished:true,
     noAutomaticReaction:true}));
  return {npcId,canonRef:profile.canonRef,knowledge:known,
   firstSights,focusPersonallyRecorded:focus?.knownBy.includes(npcId)??false};
 });
 const agenda=proposeIndependentWorldAgenda(pack,req.fromMinute,
  req.toMinute,req.npcIds,session.sessionId);
 const duties=dueLabWorldProjects(session.worldProjects,req.toMinute);
 const ownerLoad=new Map<string,number>();
 for(const p of Object.values(session.worldProjects??{})){
  if(["accepted","active","blocked"].includes(p.status))
   ownerLoad.set(p.ownerNpcId,(ownerLoad.get(p.ownerNpcId)??0)+1);
 }
 const work=duties.filter(p=>selected.has(p.ownerNpcId)).map(p=>{
  const owner=session.npcs[p.ownerNpcId],load=ownerLoad.get(p.ownerNpcId)??0;
  const overdue=req.toMinute>=p.dueMinute;
  const physicallyBlocked=p.status==="blocked";
  return {projectId:p.projectId,ownerNpcId:p.ownerNpcId,
   sourceRefs:[p.originRef,session.worldProjects?.[p.projectId]?.latestEvidenceRef]
    .filter((x):x is string=>Boolean(x)),
   stage:p.stage,status:p.status,reviewDue:overdue,ownerOpenWorkload:load,
   ownerMood:owner?.mood?.label??null,
   shortageNotSolved:physicallyBlocked,
   blocker:p.blockerReason,
   availableReviewChoices:physicallyBlocked?
    ["seek_external_equipment","revise_method","request_help","reasoned_refusal",
     "schedule_new_review"]:
    load>1?["prioritize_queue","continue_if_resources_verified",
     "defer_with_reason","seek_help","reasoned_refusal"]:
     ["begin_or_continue_when_resources_verified","request_independent_test",
      "schedule_new_review","reasoned_refusal"],
   automaticSuccess:false,autoProgress:false,requiresSourceBoundCommit:true,
   nextReviewMustBeAfterLastReview:true};
 });
 const decisions=req.npcIds.map(npcId=>{
  const profile=profiles[npcId],state=session.npcs[npcId];
  const focusKnown=Boolean(req.focusEventRef&&sourceKnown(state,req.focusEventRef));
  const important=significance.find(s=>s.npcId===npcId)?.knowledge??[];
  const recent=(state?.memories??[]).filter(x=>
   ["important","life_defining"].includes(x.salience??"")).slice(-max);
  const prior=Object.values(state?.decisions??{}).slice(-max);
  const options:string[]=[];
  if(important.length||focusKnown){
   options.push("investigate_specific_unknowns","question_source_or_method",
    "recognize_verified_limit_without_exaggerating");
   if(important.some(x=>x.personallyRelevant))
    options.push("pursue_personal_or_institutional_interest");
  }
  if(prior.some(x=>["refuse","avoid","challenge"].includes(x.stance)))
   options.push("maintain_prior_refusal_or_grudge");
  if((state?.mood?.intensity??0)>=3)
   options.push("react_from_current_mood_without_automatic_reset");
  if((state?.currentGoal??profile.goals[0])!==undefined)
   options.push("pursue_personal_goal");
  return {npcId,canonRef:profile.canonRef,
   profileAnchors:profile.traits.slice(0,12),
   ownGoal:state?.currentGoal??profile.goals[0]??null,
   emotionalState:state?.mood??null,
   toneCandidates:tone(profile,state,focus?.kind),
   personallyKnownFocusedEvent:focusKnown,significantProofRefs:
    important.map(x=>x.factId),
   relevantMemoryRefs:recent.map(x=>x.sourceRef),
   persistentStances:prior.map(x=>({subjectId:x.subjectId,stance:x.stance,
    reason:x.reason,sourceRef:x.sourceRef})),
   options:options.slice(0,9),
   noForcedAgreement:true,noForcedHostility:true,
   alternativesNotExecuted:true,requiresGMChoice:true};
 });
 const contacts=[];
 const rumors=[];
 const pairs=req.npcIds.slice().sort();
 for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
  const a=pairs[i],b=pairs[j],na=session.npcs[a],nb=session.npcs[b];
  if(!na?.locationId||na.locationId!==nb?.locationId||
   !na.locationSourceRef||!nb.locationSourceRef)continue;
  const la=na.socialDynamics?.[b],lb=nb.socialDynamics?.[a];
  const tense=Math.max(la?.tension??0,lb?.tension??0);
  const affinity=Math.max(la?.affinity??0,lb?.affinity??0);
  const sharedPast=Boolean(la||lb||session.worldEvents?.some(e=>
   (e.npcId===a&&e.targetNpcId===b)||
   (e.npcId===b&&e.targetNpcId===a)));
  const candidate=tense>=5?"open_conflict_or_deliberate_avoidance":
   affinity>=3?"cooperate_flirt_or_share_time_if_canon_fits":
   sharedPast?"continue_old_relationship_or_rivalry":
   "new_contact_requires_individual_motive";
  if(contacts.length<20)contacts.push({
   pair:[a,b],locationId:na.locationId,
   confirmedPresenceRefs:[na.locationSourceRef,nb.locationSourceRef],
   distinctRelationshipViews:{[a]:la??null,[b]:lb??null},
   candidate,reason:tense>=5?"high_directed_tension":
    affinity>=3?"established_affinity":sharedPast?
     "prior_contact":"same_verified_location_only",
   sameLocationNotProofOfConversation:true,
   playerPresenceNotRequired:true,requiresGMConfirmation:true});
 }
 for(const sourceId of pairs){
  const speaker=session.npcs[sourceId];if(!speaker?.locationId)continue;
  const candidates=speaker.memories.filter(m=>
   ["important","life_defining"].includes(m.salience??"")&&
    m.privacy!=="private"&&m.sourceRef!==req.focusEventRef)
    .slice(-max);
  for(const listenerId of pairs){
   if(listenerId===sourceId)continue;
   const listener=session.npcs[listenerId];
   if(!listener||listener.locationId!==speaker.locationId||!listener.locationSourceRef)
    continue;
   for(const m of candidates){
    if(sourceKnown(listener,m.sourceRef))continue;
    const confidence=m.channel==="report"||m.channel==="rumor"?
     "hearsay_of_hearsay":"reported_from_witness";
    if(rumors.length>=20)break;
    rumors.push({speakerNpcId:sourceId,listenerNpcId,
     sourceMemoryRef:m.sourceRef,
     originRef:m.relayedSourceRef??m.sourceRef,
     commonLocationId:speaker.locationId,
     contactNeedsConfirmation:true,
     directKnowledgeOfOrigin:false,
     epistemicStatus:confidence,
     defaultChannel:"report",
     mustUseNpcInteractionAndRelayObservation:true,
     noAutomaticInformationTransfer:true,
     requiresGMCommit:true});
   }
  }
 }
 return {schema:"RPG_LAB_LIVING_WORLD_CYCLE_V2",projectId:session.projectId,
  sessionId:session.sessionId,fromMinute:req.fromMinute,toMinute:req.toMinute,
  focusEventRef:req.focusEventRef??null,
  significance,decisions,work,contacts,rumors,
  independentIntents:agenda.intents.filter(x=>selected.has(x.npcId)),
  unresolvedWork:duties.map(x=>x.projectId),
  runOnlyOnGameTimeAdvance:req.toMinute>req.fromMinute,
  requiresGMResolution:work.length>0||agenda.intents.length>0||
   contacts.length>0||rumors.length>0,
  committed:false,readOnly:true,gmOnly:true,notPlayerVisible:true,
  generatedFacts:false,automaticRelationshipsChanged:false,
  noOffscreenWorkerRunning:true,
  note:"All six systems offer source-bounded possibilities. Neither intentions nor rumors nor research results are automatically facts."};
}
