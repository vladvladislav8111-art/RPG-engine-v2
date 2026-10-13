/** Pure, bounded, read-only GM perception review; caller snapshots are NOT source-attested. */
export type Sense="vision"|"hearing"|"touch"|"smell"|"other";
export type Stance="TRANSIT"|"CAUTIOUS"|"STEALTH"|"SURVEY"|"TRACK"|"SPECIALIST_INSPECTION";
export type ActorCompetence={id:string;level:number};
export type ActorSpecialization={competenceId:string;name:string;stars:number};
export type KnownLexeme={id:string;language:string;form:string;meaning:string};
export type ActorPerception={perception:number;competences:readonly ActorCompetence[];
 specializations:readonly ActorSpecialization[];milestones:readonly string[];
 knownFactIds:readonly string[];lexemes:readonly KnownLexeme[]};
export type PerceptionConditions={light:"bright"|"dim"|"dark";cannotSee?:boolean;cannotHear?:boolean;cannotSmell?:boolean;seesInDarkness?:boolean};
export type EvidenceGate={minPerception?:number;competence?:{id:string;minLevel:number};
 specialization?:{competenceId:string;name:string;minStars:number};milestoneId?:string;
 knownFactIds?:readonly string[];requiredStances?:readonly Stance[];requiresBrightLight?:boolean};
export type SceneObservation={id:string;sense:Sense;description:string;gate?:EvidenceGate};
export type SupportedInference={id:string;text:string;evidenceIds:readonly string[];gate?:EvidenceGate};
export type SpokenToken={form:string;lexemeId?:string};
export type SpokenUtterance={id:string;language:string;tokens:readonly SpokenToken[];gate?:EvidenceGate};
export type PerceptionReviewRequest={actor:ActorPerception;conditions:PerceptionConditions;stance:Stance;
 observations:readonly SceneObservation[];inferences?:readonly SupportedInference[];utterances?:readonly SpokenUtterance[]};
export type PerceptionReviewResult={
 schema:"RPG_V2_PERCEPTION_REVIEW_V1";sourceAttested:false;committed:false;gameTimeSeconds:0;
 observations:Array<{id:string;text:string}>;
 interpretations:Array<{id:string;text:string;evidenceIds:string[];kind:"INFERENCE_NOT_TRUTH"}>;
 speech:Array<{id:string;language:string;heard:string;understoodWords:Array<{form:string;meaning:string}>;completeTranslation:false}>;
 withheldCount:number;notes:readonly string[];
};
const STANCES:readonly Stance[]=["TRANSIT","CAUTIOUS","STEALTH","SURVEY","TRACK","SPECIALIST_INSPECTION"];
const SENSES:readonly Sense[]=["vision","hearing","touch","smell","other"];
const rec=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const str=(x:unknown,max=512):x is string=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
const id=(x:unknown):x is string=>str(x,180)&&/^[a-zA-Z0-9._:-]+$/.test(x);
const integer=(x:unknown,min:number,max:number):x is number=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=min&&x<=max;
function valid(ok:unknown):asserts ok{if(!ok)throw Error("PERCEPTION_INVALID_INPUT");}
function uniq<T>(rows:readonly T[],fn:(r:T)=>string):void{valid(new Set(rows.map(fn)).size===rows.length);}
function rejectSecrets(node:unknown,depth=0):void{
 valid(depth<=12);
 if(Array.isArray(node)){valid(node.length<=128);for(const v of node)rejectSecrets(v,depth+1);}
 else if(rec(node))for(const [k,v] of Object.entries(node)){
  valid(!/^(hidden|truth|secret|gmOnly|future|privateThoughts|revealedTruth)$/i.test(k));
  rejectSecrets(v,depth+1);
 }
}
function validateGate(g:EvidenceGate|undefined):void{
 if(!g)return;
 valid(rec(g));
 if(g.minPerception!==undefined)valid(integer(g.minPerception,0,100));
 if(g.competence!==undefined)valid(rec(g.competence)&&id(g.competence.id)&&integer(g.competence.minLevel,1,13));
 if(g.specialization!==undefined)valid(rec(g.specialization)&&id(g.specialization.competenceId)&&str(g.specialization.name,120)&&integer(g.specialization.minStars,1,10));
 if(g.milestoneId!==undefined)valid(id(g.milestoneId));
 if(g.knownFactIds!==undefined)valid(Array.isArray(g.knownFactIds)&&g.knownFactIds.length<=32&&g.knownFactIds.every(id));
 if(g.requiredStances!==undefined)valid(Array.isArray(g.requiredStances)&&g.requiredStances.length<=6&&g.requiredStances.every(x=>STANCES.includes(x)));
 if(g.requiresBrightLight!==undefined)valid(typeof g.requiresBrightLight==="boolean");
}
function allows(a:ActorPerception,c:PerceptionConditions,stance:Stance,g?:EvidenceGate):boolean{
 if(!g)return true;
 if(g.minPerception!==undefined&&a.perception<g.minPerception)return false;
 if(g.requiredStances&&!g.requiredStances.includes(stance))return false;
 if(g.requiresBrightLight&&c.light!=="bright")return false;
 if(g.competence&&!a.competences.some(x=>x.id===g.competence!.id&&x.level>=g.competence!.minLevel))return false;
 if(g.specialization&&!a.specializations.some(x=>x.competenceId===g.specialization!.competenceId&&x.name===g.specialization!.name&&x.stars>=g.specialization!.minStars))return false;
 if(g.milestoneId&&!a.milestones.includes(g.milestoneId))return false;
 if(g.knownFactIds&&!g.knownFactIds.every(x=>a.knownFactIds.includes(x)))return false;
 return true;
}
function canSense(c:PerceptionConditions,s:Sense):boolean{
 if(s==="vision")return !c.cannotSee&&(c.light!=="dark"||c.seesInDarkness===true);
 if(s==="hearing")return !c.cannotHear;
 if(s==="smell")return !c.cannotSmell;
 return true;
}
function validate(req:PerceptionReviewRequest):void{
 rejectSecrets(req);valid(rec(req)&&rec(req.actor)&&rec(req.conditions));
 const a=req.actor,c=req.conditions;
 valid(STANCES.includes(req.stance)&&["bright","dim","dark"].includes(c.light));
 valid(integer(a.perception,0,100));
 for(const f of ["cannotSee","cannotHear","cannotSmell","seesInDarkness"] as const)
  if(c[f]!==undefined)valid(typeof c[f]==="boolean");
 valid(Array.isArray(a.competences)&&a.competences.length<=40&&a.competences.every(x=>rec(x)&&id(x.id)&&integer(x.level,1,13)));
 uniq(a.competences,x=>x.id);
 valid(Array.isArray(a.specializations)&&a.specializations.length<=100&&a.specializations.every(x=>rec(x)&&id(x.competenceId)&&str(x.name,120)&&integer(x.stars,0,10)));
 uniq(a.specializations,x=>x.competenceId+"::"+x.name);
 valid(Array.isArray(a.milestones)&&a.milestones.length<=40&&a.milestones.every(id));
 valid(Array.isArray(a.knownFactIds)&&a.knownFactIds.length<=128&&a.knownFactIds.every(id));
 uniq(a.milestones,x=>x);uniq(a.knownFactIds,x=>x);
 valid(Array.isArray(a.lexemes)&&a.lexemes.length<=128&&a.lexemes.every(x=>rec(x)&&id(x.id)&&id(x.language)&&str(x.form,100)&&str(x.meaning,200)));
 uniq(a.lexemes,x=>x.id);
 valid(Array.isArray(req.observations)&&req.observations.length<=64&&req.observations.every(x=>rec(x)&&id(x.id)&&SENSES.includes(x.sense as Sense)&&str(x.description,600)));
 uniq(req.observations,x=>x.id);for(const x of req.observations)validateGate(x.gate);
 valid(req.inferences===undefined||(Array.isArray(req.inferences)&&req.inferences.length<=64));
 for(const x of req.inferences??[]){
  valid(rec(x)&&id(x.id)&&str(x.text,600)&&Array.isArray(x.evidenceIds)&&x.evidenceIds.length>0&&x.evidenceIds.length<=16&&x.evidenceIds.every(id));
  validateGate(x.gate as EvidenceGate|undefined);
 }
 uniq(req.inferences??[],x=>x.id);
 valid(req.utterances===undefined||(Array.isArray(req.utterances)&&req.utterances.length<=32));
 for(const x of req.utterances??[]){
  valid(rec(x)&&id(x.id)&&id(x.language)&&Array.isArray(x.tokens)&&x.tokens.length>0&&x.tokens.length<=64&&x.tokens.every(t=>rec(t)&&str(t.form,100)&&(t.lexemeId===undefined||id(t.lexemeId))));
  validateGate(x.gate as EvidenceGate|undefined);
 }
 uniq(req.utterances??[],x=>x.id);
}
/** Never promotes claims to canonical GM truth, time, XP or live runtime. */
export function reviewPerception(req:PerceptionReviewRequest):PerceptionReviewResult{
 validate(req);
 const observations:PerceptionReviewResult["observations"]=[];
 const interpretations:PerceptionReviewResult["interpretations"]=[];
 const speech:PerceptionReviewResult["speech"]=[];
 let withheldCount=0;
 for(const o of req.observations){
  if(!canSense(req.conditions,o.sense)||!allows(req.actor,req.conditions,req.stance,o.gate)){withheldCount++;continue;}
  observations.push({id:o.id,text:o.description});
 }
 const visible=new Set(observations.map(x=>x.id));
 for(const q of req.inferences??[]){
  if(!q.evidenceIds.every(x=>visible.has(x))||!allows(req.actor,req.conditions,req.stance,q.gate)){withheldCount++;continue;}
  interpretations.push({id:q.id,text:q.text,evidenceIds:[...q.evidenceIds],kind:"INFERENCE_NOT_TRUTH"});
 }
 for(const u of req.utterances??[]){
  if(!canSense(req.conditions,"hearing")||!allows(req.actor,req.conditions,req.stance,u.gate)){withheldCount++;continue;}
  const understoodWords:Array<{form:string;meaning:string}>=[];
  for(const t of u.tokens){
   const lex=req.actor.lexemes.find(x=>x.id===t.lexemeId&&x.language===u.language&&x.form===t.form);
   if(lex)understoodWords.push({form:lex.form,meaning:lex.meaning});
  }
  speech.push({id:u.id,language:u.language,heard:u.tokens.map(x=>x.form).join(" "),understoodWords,completeTranslation:false});
 }
 return {schema:"RPG_V2_PERCEPTION_REVIEW_V1",sourceAttested:false,committed:false,gameTimeSeconds:0,
  observations,interpretations,speech,withheldCount,
  notes:[
   "GM advisory only: actor state, observations, lexemes and evidence require current committed source checks.",
   "Interpretations are evidence-linked hypotheses, never automatically revealed hidden GM truth.",
   "Unknown language remains audible; no invented grammar or full translation.",
   "Actual deliberate search time and consequences require a separate authorized semantic turn.",
  ]};
}
