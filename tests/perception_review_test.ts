import {reviewPerception,type PerceptionReviewRequest} from "../src/perception_review.ts";
import {dispatchWorldV3Batch} from "../src/world_sim_v3/runtime_facade.ts";
const base=():PerceptionReviewRequest=>({
 actor:{perception:7,competences:[{id:"competence.survival.general",level:2}],
  specializations:[{competenceId:"competence.survival.general",name:"Tracking",stars:3}],
  milestones:["milestone.survival.eye"],knownFactIds:["fact.saren.road"],
  lexemes:[{id:"lex.taren.hello",language:"taren",form:"tal",meaning:"привет"}]},
 conditions:{light:"bright"},stance:"CAUTIOUS",
 observations:[
  {id:"door",sense:"vision",description:"Деревянная дверь"},
  {id:"tracks",sense:"vision",description:"Следы у окна",gate:{
   minPerception:7,competence:{id:"competence.survival.general",minLevel:2},
   specialization:{competenceId:"competence.survival.general",name:"Tracking",minStars:3},
   milestoneId:"milestone.survival.eye",requiredStances:["CAUTIOUS","TRACK"]}},
  {id:"secret",sense:"vision",description:"Еле заметный шов",gate:{minPerception:10}}
 ],
 inferences:[
  {id:"hypothesis",text:"Возможно, здесь проходили люди",evidenceIds:["tracks"]},
  {id:"unsafe",text:"Возможно, тайная дверь",evidenceIds:["secret"]}],
 utterances:[{id:"say",language:"taren",tokens:[{form:"tal",lexemeId:"lex.taren.hello"},{form:"other"}]}],
});
Deno.test("perception: observed facts vs supported hypothesis; no invisible IDs",()=>{
 const r=reviewPerception(base());
 if(r.observations.length!==2||r.interpretations.length!==1||r.withheldCount!==2||
   r.sourceAttested||r.committed||r.gameTimeSeconds!==0||r.interpretations[0].kind!=="INFERENCE_NOT_TRUTH"||
   JSON.stringify(r).includes("secret")||JSON.stringify(r).includes("unsafe"))throw Error("Information leakage");
});
Deno.test("perception: dark blocks vision, not speech; darkvision requires real capability",()=>{
 const x=base();x.conditions={light:"dark"};
 if(reviewPerception(x).observations.length||reviewPerception(x).speech.length!==1)throw Error("Darkness");
 x.conditions={light:"dark",seesInDarkness:true};
 if(reviewPerception(x).observations.length!==2)throw Error("Darkvision");
 x.conditions={light:"bright",cannotHear:true};
 if(reviewPerception(x).speech.length)throw Error("Deafness");
});
Deno.test("perception: unknown Taren remains audible; no automatic sentence translation",()=>{
 const x=base();let s=reviewPerception(x).speech[0];
 if(s.heard!=="tal other"||s.understoodWords.length!==1||s.completeTranslation)throw Error("Taren");
 (x.actor as unknown as {lexemes:unknown[]}).lexemes=[];
 s=reviewPerception(x).speech[0];
 if(s.understoodWords.length!==0||!s.heard)throw Error("Unknown language vanished");
});
Deno.test("perception: specialization stars and deliberate stance are independent gates",()=>{
 const x=base();
 (x.actor as unknown as {specializations:unknown[]}).specializations=[{competenceId:"competence.survival.general",name:"Tracking",stars:2}];
 if(reviewPerception(x).observations.some(y=>y.id==="tracks"))throw Error("Stars");
 (x.actor as unknown as {specializations:unknown[]}).specializations=[{competenceId:"competence.survival.general",name:"Tracking",stars:3}];
 x.stance="TRANSIT";
 if(reviewPerception(x).observations.some(y=>y.id==="tracks"))throw Error("Stance");
});
Deno.test("perception: reject explicit GM secret fields, duplicated IDs, invalid level",()=>{
 for(const mutate of [
  (x:PerceptionReviewRequest)=>{(x.observations[0] as unknown as Record<string,unknown>).hidden={truth:"SECRET"};},
  (x:PerceptionReviewRequest)=>{(x.observations as unknown as unknown[]).push(x.observations[0]);},
  (x:PerceptionReviewRequest)=>{(x.actor.competences[0] as {level:number}).level=14;},
 ]){const x=base();mutate(x);let rejected=false;try{reviewPerception(x);}catch{rejected=true;}if(!rejected)throw Error("Unsafe input accepted");}
});
Deno.test("perception: V3 remains source-unattested, proposal-only, and save-bound",()=>{
 const jobs=[{id:"perception",operation:"world_review" as const,payload:{perceptionV1:base() as unknown as Record<string,unknown>}}];
 const r=dispatchWorldV3Batch({expectedSaveId:"TEST-SAVE-1",jobs},"TEST-SAVE-1");
 if(r.sourceAttested||r.committed||!r.requiresSemanticCommit||!r.results[0].result.ok)throw Error("V3 isolation");
 let rejected=false;
 try{dispatchWorldV3Batch({expectedSaveId:"TEST-SAVE-1",jobs},"OTHER-SAVE-1");}catch{rejected=true;}
 if(!rejected)throw Error("Stale save accepted");
});
