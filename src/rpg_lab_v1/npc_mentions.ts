/** GM-only deterministic lookup by explicitly named DanMachi NPCs.
 * Dialogue text selects registered characters. It does NOT prove an actor is
 * physically present, sees the scene, knows the conversation, or trusts anyone.
 * Actor memory can only come from that actor's own saved session state.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession,LabMemory} from "./session.ts";
const SPECIAL_ALIASES:Record<string,string[]>={
 "loki": [
  "loki",
  "локи"
 ],
 "finn": [
  "финна",
  "финну",
  "финном",
  "финне",
  "finn"
 ],
 "riveria": [
  "риверию",
  "риверии",
  "риверией",
  "риверие",
  "riveria"
 ],
 "gareth": [
  "гарета",
  "гарету",
  "гаретом",
  "гарете"
 ],
 "ais": [
  "айс",
  "айза",
  "айзу",
  "айзом",
  "айзе",
  "ais"
 ],
 "tiona": [
  "тиону",
  "тионой",
  "тионы",
  "тиона",
  "tiona"
 ],
 "tione": [
  "тионе",
  "тионой",
  "тионею",
  "тионы",
  "tione"
 ],
 "bete": [
  "бете",
  "бетом",
  "bete"
 ],
 "lefiya": [
  "лефию",
  "лефии",
  "лефией",
  "lefiya"
 ],
 "raul": [
  "рауля",
  "раулю",
  "раулем"
 ],
 "aki": [
  "аки",
  "анакитти",
  "анакитти отэм",
  "анакитти отем"
 ],
 "hestia": [
  "гестию",
  "гестии",
  "гестией",
  "hestia"
 ],
 "bell": [
  "белла",
  "беллу",
  "беллом",
  "белле",
  "bell"
 ],
 "lili": [
  "лили",
  "лилируку",
  "лилируке",
  "лилирукой",
  "лилируки",
  "лилли",
  "lili",
  "liliruca"
 ],
 "welf": [
  "вельфа",
  "вельфу",
  "вельфом",
  "вельфе",
  "welf"
 ],
 "mikoto": [
  "микото",
  "ямато микото"
 ],
 "haruhime": [
  "харухимэ",
  "харухиме",
  "харухимею",
  "haruhime"
 ],
 "eina": [
  "эйны",
  "эйне",
  "эйну",
  "эйной",
  "эйна",
  "eina"
 ],
 "misha": [
  "мишу",
  "мише",
  "мишей",
  "миши"
 ],
 "ouranos": [
  "ураноса",
  "ураносу",
  "ураносом",
  "ураносе"
 ],
 "fels": [
  "фелса",
  "фелсу",
  "фелсом",
  "фелсе"
 ],
 "ganesha": [
  "ганешу",
  "ганеше",
  "ганешей"
 ],
 "shakti": [
  "шакти",
  "shakti"
 ],
 "hephaestus": [
  "гефеста",
  "гефесту",
  "гефестом",
  "гефесте",
  "hephaestus"
 ],
 "tsubaki": [
  "цубаки",
  "tsubaki"
 ],
 "miach": [
  "миаха",
  "миаху",
  "миахом",
  "миахе"
 ],
 "nahza": [
  "назу",
  "назе",
  "назой",
  "назы"
 ],
 "takemikazuchi": [
  "такемикадзути",
  "такемикадзути"
 ],
 "hermes": [
  "гермеса",
  "гермесу",
  "гермесом",
  "гермесе",
  "hermes"
 ],
 "asfi": [
  "асфи",
  "asfi"
 ],
 "ryuu": [
  "рю",
  "рью",
  "ryuu"
 ],
 "mia": [
  "мию",
  "мие",
  "мией",
  "мия",
  "маму мию"
 ],
 "syr": [
  "сир",
  "сир флова",
  "syr"
 ],
 "anya": [
  "анью",
  "анье",
  "аньей",
  "анья"
 ],
 "chloe": [
  "хлою",
  "хлое",
  "хлоей",
  "хлоя"
 ],
 "freya": [
  "фрейю",
  "фрейе",
  "фрейей",
  "фрейи",
  "freya"
 ],
 "ottar": [
  "оттара",
  "оттару",
  "оттаром",
  "оттаре"
 ],
 "allen": [
  "аллена",
  "аллену",
  "алленом",
  "аллене"
 ],
 "hedin": [
  "хедина",
  "хедину",
  "хедином",
  "хедине"
 ],
 "hogni": [
  "хогни",
  "hogni"
 ],
 "horn": [
  "херн",
  "хорн",
  "хёрн",
  "хёрн"
 ],
 "apollo": [
  "аполлона",
  "аполлону",
  "аполлоном",
  "аполлоне"
 ],
 "cassandra": [
  "кассандру",
  "кассандре",
  "кассандрой",
  "кассандры"
 ],
 "daphne": [
  "дафну",
  "дафне",
  "дафной",
  "дафны"
 ],
 "soma": [
  "сому",
  "соме",
  "сомы",
  "сомой",
  "сома"
 ],
 "zanis": [
  "заниса",
  "занису",
  "занисом",
  "занисе"
 ],
 "ishtar": [
  "иштар",
  "ishtar"
 ],
 "aisha": [
  "айшу",
  "айше",
  "айшей",
  "айши",
  "aisha"
 ],
 "wiene": [
  "вину",
  "вине",
  "виной",
  "вины",
  "вина"
 ],
 "lyd": [
  "лида",
  "лиду",
  "лидом",
  "лиде"
 ],
 "asterius": [
  "астериоса",
  "астериосу",
  "астериосом",
  "астериосе"
 ],
 "dionysus": [
  "диониса",
  "дионису",
  "дионисом",
  "дионисе"
 ],
 "filvis": [
  "филвис",
  "филвису",
  "филвисом"
 ]
};
export const DANMACHI_ALIAS_PROFILE_COUNT=Object.keys(SPECIAL_ALIASES).length;
export type LabMentionHit={
 npcId:string;name:string;match:string;matchKind:"full_name"|"given_name"|"explicit_alias";
 normalizedStart:number;normalizedEnd:number;
};
export type LabMentionAmbiguity={match:string;candidates:string[];normalizedStart:number};
export type LabMentionLookup={
 npcIds:string[];hits:LabMentionHit[];ambiguities:LabMentionAmbiguity[];
};
/** Normalization is intentionally lookup-only, not a mutation of dialogue. */
const norm=(v:string)=>v.normalize("NFD").replace(/\p{M}/gu,"")
 .toLocaleLowerCase("ru-RU").replace(/\s+/gu," ").trim();
const word=(v:string)=>/[\p{L}\p{N}_]/u.test(v);
type Candidate={npcId:string;name:string;alias:string;kind:LabMentionHit["matchKind"];strength:number};
type Span=Candidate&{start:number;end:number};
function candidates(pack:LabPack):Candidate[]{
 const out:Candidate[]=[];
 const seen=new Set<string>();
 const push=(npcId:string,name:string,alias:string,kind:Candidate["kind"],strength:number)=>{
  const key=norm(alias);
  if(key.length<2||key.length>90||!/^[\p{L}\p{N} .'-]+$/u.test(key))return;
  const dup=npcId+"|"+key;
  if(seen.has(dup)){
   const existing=out.find(x=>x.npcId===npcId&&x.alias===key);
   if(existing&&strength>existing.strength){existing.kind=kind;existing.strength=strength;}
   return;
  }
  seen.add(dup);out.push({npcId,name,alias:key,kind,strength});
 };
 for(const [npcId,p] of Object.entries(pack.npcProfiles)){
  push(npcId,p.name,p.name,"full_name",4);
  // A given name is safe when identifiable. Never infer relations or
  // split shared surnames such as Hiryute or Gulliver.
  const first=p.name.split(/\s+/u)[0];
  if(first&&first.length>=3)push(npcId,p.name,first,"given_name",2);
  const characterId=npcId.startsWith("npc.")?npcId.slice(4):"";
  for(const alias of SPECIAL_ALIASES[characterId]??[])
   push(npcId,p.name,alias,"explicit_alias",1);
 }
 return out;
}
/** There is no fuzzy substring match: `Мия` never becomes `Миах`. */
export function findLabNpcMentions(pack:LabPack,dialogue:string,max=8){
 if(typeof dialogue!=="string"||dialogue.length>6000||
  !Number.isInteger(max)||max<1||max>16)
  throw Error("LAB_NPC_DIALOGUE_LOOKUP_INVALID");
 const text=norm(dialogue);
 const spans:Span[]=[];
 for(const alias of candidates(pack)){
  let at=0;
  while((at=text.indexOf(alias.alias,at))!==-1){
   const end=at+alias.alias.length;
   if((at===0||!word(text[at-1]))&&(end===text.length||!word(text[end])))
    spans.push({...alias,start:at,end});
   at=end;
  }
 }
 // Longest explicit full names win over a part embedded in a full name.
 spans.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||
  b.strength-a.strength||a.npcId.localeCompare(b.npcId));
 const hits:LabMentionHit[]=[];
 const ambiguities:LabMentionAmbiguity[]=[];
 let occupiedUntil=0;
 for(let i=0;i<spans.length;){
  const base=spans[i];
  if(base.start<occupiedUntil){i++;continue;}
  const same=spans.filter(s=>s.start===base.start&&s.end===base.end);
  const strongest=Math.max(...same.map(x=>x.strength));
  const dominant=same.filter(s=>s.strength===strongest);
  const distinct=[...new Set(dominant.map(s=>s.npcId))];
  if(distinct.length>1)
   ambiguities.push({match:base.alias,candidates:distinct,normalizedStart:base.start});
  else hits.push({npcId:dominant[0].npcId,name:dominant[0].name,
   match:base.alias,matchKind:dominant[0].kind,
   normalizedStart:base.start,normalizedEnd:base.end});
  occupiedUntil=base.end;
  while(i<spans.length&&spans[i].start<occupiedUntil)i++;
  if(hits.length>=max)break;
 }
 const ids=[...new Set(hits.map(x=>x.npcId))].slice(0,max);
 return {npcIds:ids,hits:hits.filter(h=>ids.includes(h.npcId)),
  ambiguities,gmOnly:true as const,
  mentionDoesNotEstablishPresence:true as const,
  mentionDoesNotEstablishKnowledge:true as const};
}
const STOP=new Set(["когда","почему","который","которой","сказала","сказал",
 "всегда","говорит","помнит","видела","видел","только","очень",
 "просто","вновь","после","перед","вчера","сегодня"]);
const topicWords=(dialogue:string)=>{
 const matches=norm(dialogue).match(/[\p{L}\p{N}]{4,}/gu)??[];
 return [...new Set(matches.filter(x=>!STOP.has(x)))].slice(0,32);
};
/** Personal, bounded recollections sorted by actual dialogue topic,
 * salience, and recency. Never query another NPC's memory as a fallback. */
export function recallLabNpcPersonalMemories(session:LabSession,npcId:string,
 dialogue:string,max=8):LabMemory[]{
 if(typeof dialogue!=="string"||dialogue.length>6000||
   !Number.isInteger(max)||max<1||max>24)
  throw Error("LAB_NPC_RECALL_REQUEST_INVALID");
 const own=session.npcs[npcId]?.memories??[];
 const terms=topicWords(dialogue);
 const salience=(m:LabMemory)=>m.salience==="life_defining"?4:
  m.salience==="important"?3:m.salience==="ordinary"?2:1;
 return own.map((m,i)=>{
  const content=norm(m.perceivedFact??m.summary);
  const matches=terms.filter(t=>content.includes(t)).length;
  const exact=terms.length>=2&&matches>=2?2:0;
  return {m,i,relevance:matches*5+exact,importance:salience(m)};
 }).sort((a,b)=>b.relevance-a.relevance||
  b.importance-a.importance||b.i-a.i).slice(0,max)
 .map(({m})=>structuredClone(m));
}
/** Compact GM-private bundle for names *actually present in user dialogue*.
 * Unresolved mentions are returned for review, never guessed.
 */
export function readLabMentionedNpcCores(pack:LabPack,session:LabSession,
 dialogue:string,maxActors=8,maxMemories=8){
 const mentions=findLabNpcMentions(pack,dialogue,maxActors);
 const actors=mentions.npcIds.map(npcId=>{
  const profile=pack.npcProfiles[npcId];
  const state=session.npcs[npcId];
  return {npcId,name:profile.name,
   canonRef:profile.canonRef,entryArc:profile.entryArc??"start",
   faction:profile.faction??null,traits:profile.traits,
   goals:profile.goals,voice:profile.voice??null,
   habitualLogic:profile.habitualLogic??null,
   deepCore:profile.deepCore??null,
   responsePatterns:profile.responsePatterns??{},
   currentGoal:state?.currentGoal??null,
   currentMood:state?.mood??null,
   personalMemories:recallLabNpcPersonalMemories(session,npcId,dialogue,maxMemories),
   relationshipState:state?.relationships??{},
   socialDynamics:state?.socialDynamics??{},
   acquiredAdaptations:state?.adaptations??{},
   priorDecisions:Object.values(state?.decisions??{}).slice(-8),
   lastKnownLocation:state?.locationId??null,
   // Do not confuse narrative mention with actual contact.
   confirmedInCurrentScene:false,observedDialogue:false,
   memoryOnlyFromOwnState:true,privateNotPlayerKnown:true};
 });
 const out={schema:"LAB_NPC_MENTION_CONTEXT_V1" as const,
  gmOnly:true as const,notPlayerVisible:true as const,
  readOnly:true as const,committed:false as const,
  dialogueOnlyReference:true as const,
  unresolvedAmbiguities:mentions.ambiguities,
  matchedMentions:mentions.hits,
  actors};
 if(JSON.stringify(out).length>60000)
  throw Error("LAB_NPC_MENTION_CONTEXT_TOO_LARGE");
 return out;
}
