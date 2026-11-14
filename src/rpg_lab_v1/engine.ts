/** Universal isolated multi-world RPG calculator and narrative-state review.
 * Pure bounded proposals. NEVER writes to the legacy Shura runtime.
 */
import {evaluateFormula,validateFormulaRegistry,type LabVariables} from "./formulas.ts";
import {previewDungeonExplore,validateEncounterProfile,validateMonster,type LabEncounterProfile,type LabMonster} from "./danmachi.ts";
export type LabResource={min:number;max:number};
export type LabLootEntry={itemId:string;weight:number;chance:number;min:number;max:number};
export type LabLootTable={rolls:number;entries:LabLootEntry[]};
export type LabRecipe={inputs:Record<string,number>;outputs:Record<string,number>;timeFormula:string;qcRequired?:boolean};
export type LabWorldProcess={dueMinute:number;locationId?:string;kind:string;visibility:"public"|"hidden";sourceRef:string};
export type LabPrice={base:number;currency:string;buyMultiplier?:number;sellMultiplier?:number};
export type LabLocation={name:string;kind:string;parentId?:string;neighbors:Record<string,number>;tags?:string[];description?:string};
export type LabResponsePattern={emotion:string;motive:string;condition?:string};
export type LabNpc={name:string;canonRef:string;traits:string[];goals:string[];knownFacts:string[];speechStyle?:string;responsePatterns?:Record<string,LabResponsePattern[]>};
export type LabPack={
 schema:"RPG_LAB_PACK_V1";projectId:string;worldId:string;
 formulas:Record<string,string>;resources:Record<string,LabResource>;
 lootTables:Record<string,LabLootTable>;prices:Record<string,LabPrice>;recipes?:Record<string,LabRecipe>;
 economy:{taxRate:number};locations:Record<string,LabLocation>;
 npcProfiles:Record<string,LabNpc>;worldProcesses?:Record<string,LabWorldProcess>;
 encounterProfiles?:Record<string,LabEncounterProfile>;bestiary?:Record<string,LabMonster>;
 progression:{xpThresholdFormula?:string;thresholds?:number[]};
};
export type LabJob={id:string;kind:string;args:Record<string,unknown>};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const safeObj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const entries=(x:unknown,max:number):[string,unknown][]=>{
 if(!safeObj(x))throw Error("LAB_OBJECT_EXPECTED");
 const rows=Object.entries(x);
 if(rows.length>max||rows.some(([k])=>!ID.test(k)||["__proto__","prototype","constructor"].includes(k)))throw Error("LAB_INVALID_KEYS");
 return rows;
};
const numeric=(x:unknown,min:number,max:number):number=>{
 if(typeof x!=="number"||!Number.isFinite(x)||x<min||x>max)throw Error("LAB_NUMBER_OUT_OF_BOUNDS");
 return x;
};
const ident=(x:unknown):string=>{
 if(typeof x!=="string"||!ID.test(x))throw Error("LAB_INVALID_ID");return x;
};
const text=(x:unknown,max=600):string=>{
 if(typeof x!=="string"||!x.trim()||x.length>max)throw Error("LAB_INVALID_TEXT");return x;
};
const stringList=(x:unknown,max=32):string[]=>{
 if(!Array.isArray(x)||x.length>max||!x.every(v=>typeof v==="string"&&v.length<=240))throw Error("LAB_INVALID_LIST");
 return x;
};
const params=(x:unknown):LabVariables=>{
 const o=entries(x,80);const out:LabVariables=Object.create(null);
 for(const [k,v] of o)out[k]=numeric(v,-1e12,1e12);return out;
};
const plain=(n:number)=>Math.round(n*1e6)/1e6;
export function validateLabPack(pack:LabPack):LabPack{
 if(!safeObj(pack)||pack.schema!=="RPG_LAB_PACK_V1")throw Error("LAB_PACK_SCHEMA");
 ident(pack.projectId);ident(pack.worldId);validateFormulaRegistry(pack.formulas);
 if(JSON.stringify(pack).length>100000)throw Error("LAB_PACK_TOO_LARGE");
 for(const [,v] of entries(pack.resources,128)){
  if(!safeObj(v))throw Error("LAB_RESOURCE_DEF");
  numeric(v.min,0,1e12);numeric(v.max,v.min as number,1e12);
 }
 for(const [,v] of entries(pack.lootTables,128)){
  if(!safeObj(v)||!Array.isArray(v.entries)||v.entries.length<1||v.entries.length>128)throw Error("LAB_LOOT_DEF");
  numeric(v.rolls,1,100);if(!Number.isInteger(v.rolls))throw Error("LAB_LOOT_ROLLS");
  for(const e of v.entries){
   if(!safeObj(e))throw Error("LAB_LOOT_ENTRY");
   ident(e.itemId);numeric(e.weight,0.000001,1e9);numeric(e.chance,0,1);
   numeric(e.min,0,1e6);numeric(e.max,e.min as number,1e6);
   if(!Number.isInteger(e.min)||!Number.isInteger(e.max))throw Error("LAB_LOOT_QUANTITY");
  }
 }
 if(pack.recipes!==undefined){
  for(const [,v] of entries(pack.recipes,128)){
   if(!safeObj(v))throw Error("LAB_RECIPE_INVALID");
   ident(v.timeFormula);if(!pack.formulas[v.timeFormula as string])throw Error("LAB_RECIPE_TIME_FORMULA_UNKNOWN");
   if(v.qcRequired!==undefined&&typeof v.qcRequired!=="boolean")throw Error("LAB_RECIPE_QC_INVALID");
   for(const [,qty] of entries(v.inputs,32)){numeric(qty,0.001,1e6);}
   for(const [,qty] of entries(v.outputs,32)){numeric(qty,0.001,1e6);}
  }
 }
 for(const [,v] of entries(pack.prices,500)){
  if(!safeObj(v))throw Error("LAB_PRICE_DEF");
  numeric(v.base,0,1e9);ident(v.currency);
  if(v.buyMultiplier!==undefined)numeric(v.buyMultiplier,0,100);
  if(v.sellMultiplier!==undefined)numeric(v.sellMultiplier,0,100);
 }
 if(!safeObj(pack.economy))throw Error("LAB_ECONOMY_DEF");
 numeric(pack.economy.taxRate,0,0.9);
 const places=entries(pack.locations,500);
 for(const [,v] of places){
  if(!safeObj(v))throw Error("LAB_LOCATION_DEF");text(v.name,160);text(v.kind,50);
  if(v.parentId!==undefined)ident(v.parentId);
  if(v.description!==undefined&&typeof v.description!=="string")throw Error("LAB_LOCATION_DESCRIPTION");
  if(v.description!==undefined&&v.description.length>1000)throw Error("LAB_LOCATION_DESCRIPTION");
  if(v.tags!==undefined)stringList(v.tags,20);
  for(const [dest,cost] of entries(v.neighbors,32)) {ident(dest);numeric(cost,0.001,1e6);}
 }
 for(const [id,v] of entries(pack.npcProfiles,128)){
  ident(id);if(!safeObj(v))throw Error("LAB_NPC_DEF");
  text(v.name,150);ident(v.canonRef);stringList(v.traits,30);stringList(v.goals,20);stringList(v.knownFacts,128);
  if(v.speechStyle!==undefined)text(v.speechStyle,600);
  if(v.responsePatterns!==undefined){
   for(const [,responses] of entries(v.responsePatterns,40)){
    if(!Array.isArray(responses)||responses.length>16)throw Error("LAB_NPC_RESPONSE_DEF");
    for(const response of responses){
     if(!safeObj(response))throw Error("LAB_NPC_RESPONSE_DEF");
     text(response.emotion,80);text(response.motive,240);
     if(response.condition!==undefined)text(response.condition,250);
    }
   }
  }
 }
 if(pack.worldProcesses!==undefined){
  for(const [,v] of entries(pack.worldProcesses,256)){
   if(!safeObj(v))throw Error("LAB_PROCESS_DEF");
   numeric(v.dueMinute,0,1e9);text(v.kind,80);ident(v.sourceRef);
   if(v.locationId!==undefined)ident(v.locationId);
   if(v.visibility!=="public"&&v.visibility!=="hidden")throw Error("LAB_PROCESS_VISIBILITY");
  }
 }
 if(pack.encounterProfiles!==undefined){
  for(const [id,profile] of entries(pack.encounterProfiles,100)){
   const p=profile as LabEncounterProfile;
   if(id!=="dungeon_f"+String(p.floor).padStart(2,"0"))throw Error("LAB_DUNGEON_PROFILE_KEY");
   validateEncounterProfile(p);
  }
 }
 if(pack.bestiary!==undefined){
  for(const [,monster] of entries(pack.bestiary,150))validateMonster(monster as LabMonster);
 }
 if(!safeObj(pack.progression))throw Error("LAB_PROGRESSION_DEF");
 if(pack.progression.xpThresholdFormula!==undefined)ident(pack.progression.xpThresholdFormula);
 if(pack.progression.thresholds!==undefined){
  if(!Array.isArray(pack.progression.thresholds)||pack.progression.thresholds.length>200)throw Error("LAB_PROGRESSION_LIMIT");
  pack.progression.thresholds.forEach(v=>numeric(v,1,1e12));
 }
 return pack;
}
function seedHash(s:string):number{
 let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
function seededRng(seed:string):()=>number{
 let x=seedHash(seed)||0x9e3779b9;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
function tableLoot(pack:LabPack,a:Record<string,unknown>){
 const tableId=ident(a.tableId),table=pack.lootTables[tableId];
 if(!table)throw Error("LAB_LOOT_TABLE_NOT_FOUND");
 const eventId=ident(a.eventId),seed=text(a.seed,150);
 if(typeof a.killConfirmed!=="boolean")throw Error("LAB_KILL_EVIDENCE_REQUIRED");
 if(!a.killConfirmed)return {tableId,eventId,killConfirmed:false,rolls:[],total:{},pendingEvidence:true,noItemsGranted:true};
 const rng=seededRng(pack.projectId+"|"+tableId+"|"+eventId+"|"+seed);
 const total=table.entries.reduce((s,e)=>s+e.weight,0);
 const results:Record<string,number>=Object.create(null);
 const rolls:{itemId:string;quantity:number;passedChance:boolean}[]=[];
 for(let i=0;i<table.rolls;i++){
  let n=rng()*total;
  const entry=table.entries.find(e=>(n-=e.weight)<0)??table.entries[table.entries.length-1];
  const passed=rng()<entry.chance;
  const qty=passed?entry.min+Math.floor(rng()*(entry.max-entry.min+1)):0;
  if(qty>0)results[entry.itemId]=(results[entry.itemId]??0)+qty;
  rolls.push({itemId:entry.itemId,quantity:qty,passedChance:passed});
 }
 return {tableId,eventId,killConfirmed:a.killConfirmed,rolls,total:results,
  noItemsGranted:true,sourceVerified:false,needsCommit:true,notAuthoritativeRng:true};
}
function costs(pack:LabPack,a:Record<string,unknown>){
 const current=params(a.current),deltas=params(a.deltas);
 const next:Record<string,number>=Object.create(null),wasted:Record<string,number>=Object.create(null);
 for(const [id,delta] of Object.entries(deltas)){
  const def=pack.resources[id];if(!def)throw Error("LAB_RESOURCE_UNKNOWN:"+id);
  const was=current[id];if(was===undefined||was<def.min||was>def.max)throw Error("LAB_RESOURCE_BAD_CURRENT:"+id);
  if(was+delta<def.min-1e-9)throw Error("LAB_RESOURCE_INSUFFICIENT:"+id);
 }
 for(const [id,was] of Object.entries(current)){
  const def=pack.resources[id];if(!def)throw Error("LAB_RESOURCE_UNKNOWN:"+id);
  if(was<def.min||was>def.max)throw Error("LAB_RESOURCE_BAD_CURRENT:"+id);
  const attempted=was+(deltas[id]??0);
  next[id]=plain(Math.min(def.max,attempted));wasted[id]=plain(Math.max(0,attempted-def.max));
 }
 return {before:current,deltas,next,wasted,noStateMutation:true};
}
function experience(pack:LabPack,a:Record<string,unknown>){
 let xp=numeric(a.xp,0,1e12)+numeric(a.gained,0,1e12);
 let level=numeric(a.level,1,10000);if(!Number.isInteger(level))throw Error("LAB_LEVEL_INTEGER");
 const from=level;let count=0;
 const env=params(a.variables??{});
 while(count<100){
  const threshold=pack.progression.xpThresholdFormula
   ?evaluateFormula(pack.formulas[pack.progression.xpThresholdFormula]??(()=>{throw Error("LAB_XP_FORMULA_UNKNOWN")})(),{...env,level},pack.formulas,[pack.progression.xpThresholdFormula])
   :pack.progression.thresholds?.[level-1];
  if(threshold===undefined)throw Error("LAB_XP_THRESHOLD_MISSING");
  if(threshold<=0)throw Error("LAB_XP_THRESHOLD_INVALID");
  if(xp<threshold)break;
  xp-=threshold;level++;count++;
 }
 return {fromLevel:from,toLevel:level,levelsGained:count,remainingXp:plain(xp),
  nextLevelThreshold:pack.progression.thresholds?.[level-1]??null,noPointsAwarded:true};
}
function price(pack:LabPack,a:Record<string,unknown>){
 const itemId=ident(a.itemId),item=pack.prices[itemId];if(!item)throw Error("LAB_ITEM_NOT_PRICED");
 const quantity=numeric(a.quantity,0.001,1e6),multiplier=numeric(a.localMultiplier??1,0,20);
 const action=a.action;if(action!=="buy"&&action!=="sell")throw Error("LAB_TRADE_ACTION");
 const unit=item.base*multiplier*(action==="buy"?(item.buyMultiplier??1):(item.sellMultiplier??1));
 const subtotal=unit*quantity,tax=action==="buy"?subtotal*pack.economy.taxRate:0;
 return {itemId,quantity,action,currency:item.currency,subtotal:plain(subtotal),tax:plain(tax),
  total:plain(subtotal+tax),fundsTransferred:false,stockTransferred:false};
}
function route(pack:LabPack,a:Record<string,unknown>){
 const from=ident(a.from),to=ident(a.to);
 const visible=stringList(a.discovered??[],500);const known=new Set(visible);
 if(!known.has(from)||!known.has(to))throw Error("LAB_LOCATION_NOT_DISCOVERED");
 if(!pack.locations[from]||!pack.locations[to])throw Error("LAB_LOCATION_UNKNOWN");
 const dist=new Map<string,number>([[from,0]]),prev=new Map<string,string>(),done=new Set<string>();
 while(true){
  const candidates=[...dist.entries()].filter(([id])=>!done.has(id)).sort((x,y)=>x[1]-y[1]);
  if(!candidates.length)break;
  const [id,d]=candidates[0];if(id===to)break;
  done.add(id);
  for(const [neighbor,w] of Object.entries(pack.locations[id].neighbors)){
   if(!known.has(neighbor)||!pack.locations[neighbor])continue;
   if(d+w<(dist.get(neighbor)??Infinity)){dist.set(neighbor,d+w);prev.set(neighbor,id);}
  }
 }
 if(!dist.has(to))return {reachable:false,path:[],cost:null};
 const path=[to];while(path[0]!==from){const parent=prev.get(path[0]);if(!parent)throw Error("LAB_ROUTE_INCONSISTENT");path.unshift(parent);}
 return {reachable:true,path,cost:plain(dist.get(to)!),costUnit:"pack-defined",hiddenLocationsRevealed:false};
}
function npc(pack:LabPack,a:Record<string,unknown>){
 const npcId=ident(a.npcId),profile=pack.npcProfiles[npcId];if(!profile)throw Error("LAB_NPC_UNKNOWN");
 if(!safeObj(a.event)||typeof a.event.kind!=="string")throw Error("LAB_NPC_EVENT_INVALID");
 const kind=ident(a.event.kind),eventRef=ident(a.event.sourceRef);
 const witnessed=a.event.witnessedByNpc===true;
 const knows=stringList(a.knownFactIds??[],128);
 const known=new Set(profile.knownFacts.filter(k=>knows.includes(k)));
 const patterns=(profile.responsePatterns?.[kind]??[]).map(r=>({
  emotionHypothesis:r.emotion,motiveHypothesis:r.motive,condition:r.condition??null,
  establishedEmotion:false,committedAction:false
 }));
 return {npcId,eventRef,canonRef:profile.canonRef,witnessed,personalityAnchors:profile.traits,
  currentGoals:profile.goals,confirmedKnownFacts:[...known],rememberedSourceRefs:stringList(a.memoryRefs??[],128),
  possibleResponses:witnessed?patterns:[],
  noAutomaticCharacterChange:true,noAutomaticKnowledgeTransfer:true,
  requiresGMInterpretation:true,requiresEvidenceBeforeCommit:true};
}
export function evaluateLabJob(pack:LabPack,job:LabJob):unknown{
 const a=job.args;
 if(!safeObj(a))throw Error("LAB_ARGS_INVALID");
 switch(job.kind){
  case "formula":{
   const formulaId=ident(a.formulaId),f=pack.formulas[formulaId];if(!f)throw Error("LAB_FORMULA_NOT_FOUND");
   return {formulaId,value:plain(evaluateFormula(f,params(a.variables??{}),pack.formulas,[formulaId]))};
  }
  case "resources":return costs(pack,a);
  case "loot":return tableLoot(pack,a);
  case "harvest":{
   const formulaId=ident(a.formulaId),f=pack.formulas[formulaId];if(!f)throw Error("LAB_HARVEST_FORMULA_NOT_FOUND");
   const raw=evaluateFormula(f,params(a.variables??{}),pack.formulas,[formulaId]);
   return {itemId:ident(a.itemId),quantity:Math.max(0,Math.floor(raw)),raw:plain(raw),itemsGranted:false};
  }
  case "progression":return experience(pack,a);
  case "stat":{
   const formulaId=ident(a.formulaId),f=pack.formulas[formulaId];if(!f)throw Error("LAB_STAT_FORMULA_NOT_FOUND");
   const current=numeric(a.current,0,1e12);
   const gain=evaluateFormula(f,params(a.variables??{}),pack.formulas,[formulaId]);
   return {current,proposedGain:plain(gain),proposedValue:plain(Math.max(0,current+gain)),committed:false};
  }
  case "craft":{
   const recipeId=ident(a.recipeId),recipe=pack.recipes?.[recipeId];
   if(!recipe)throw Error("LAB_RECIPE_NOT_FOUND");
   const inventory=params(a.inventory),remaining={...inventory};
   for(const [item,qty] of Object.entries(recipe.inputs)){
    if((remaining[item]??0)<qty)throw Error("LAB_CRAFT_MISSING_MATERIAL:"+item);
   }
   for(const [item,qty] of Object.entries(recipe.inputs))remaining[item]-=qty;
   const time=evaluateFormula(pack.formulas[recipe.timeFormula],params(a.variables??{}),pack.formulas,[recipe.timeFormula]);
   if(time<0)throw Error("LAB_CRAFT_BAD_TIME");
   return {recipeId,estimatedMinutes:plain(time),remainingInventory:remaining,proposedOutputs:recipe.outputs,
    qcRequired:recipe.qcRequired??true,materialsConsumed:false,itemsGranted:false,needsCommit:true};
  }
  case "dungeon_watch":return previewDungeonExplore(pack,a);
  case "encounter":{
   const damageId=ident(a.damageFormulaId),f=pack.formulas[damageId];if(!f)throw Error("LAB_DAMAGE_FORMULA_NOT_FOUND");
   const targetHp=numeric(a.targetHp,0,1e12);
   const damage=Math.max(0,Math.floor(evaluateFormula(f,params(a.variables??{}),pack.formulas,[damageId])));
   const lethal=damage>=targetHp&&targetHp>0;
   const loot=a.lootTableId!==undefined?tableLoot(pack,{
    tableId:a.lootTableId,eventId:a.eventId,seed:a.seed,
    killConfirmed:lethal&&a.killConfirmed===true,
   }):null;
   const resourcePreview=a.resourceCurrent!==undefined&&a.resourceDeltas!==undefined
    ?costs(pack,{current:a.resourceCurrent,deltas:a.resourceDeltas}):null;
   return {damage,targetHp,remainingTargetHp:Math.max(0,targetHp-damage),
    lethalCandidate:lethal,killSourceConfirmed:lethal&&a.killConfirmed===true,
    loot,resourcePreview,gameplayCommitted:false};
  }
  case "trade":{
   const quote=price(pack,a) as {itemId:string;quantity:number;action:string;total:number};
   const funds=numeric(a.playerFunds,0,1e12),merchantFunds=numeric(a.merchantFunds,0,1e12);
   const stock=numeric(a.merchantStock,0,1e12),owned=numeric(a.playerStock,0,1e12);
   if(quote.action==="buy"&&(funds<quote.total||stock<quote.quantity))throw Error("LAB_TRADE_INSUFFICIENT_FUNDS_OR_STOCK");
   if(quote.action==="sell"&&(merchantFunds<quote.total||owned<quote.quantity))throw Error("LAB_TRADE_MERCHANT_FUNDS_OR_PLAYER_STOCK");
   const buying=quote.action==="buy",cost=quote.total;
   return {...quote,projectedPlayerFunds:plain(funds+(buying?-cost:cost)),
    projectedMerchantFunds:plain(merchantFunds+(buying?cost:-cost)),
    projectedPlayerStock:plain(owned+(buying?quote.quantity:-quote.quantity)),
    projectedMerchantStock:plain(stock+(buying?-quote.quantity:quote.quantity)),
    stockTransferred:false,fundsTransferred:false};
  }
  case "world_tick":{
   const from=numeric(a.fromMinute,0,1e9),to=numeric(a.toMinute,from,1e9);
   if(to-from>10080)throw Error("LAB_WORLD_TICK_WINDOW_LIMIT");
   const discovered=new Set(stringList(a.discovered??[],500));
   const due=Object.entries(pack.worldProcesses??{}).filter(([,v])=>v.dueMinute>from&&v.dueMinute<=to)
    .map(([id,v])=>({id,kind:v.kind,dueMinute:v.dueMinute,sourceRef:v.sourceRef,
     visibleToPlayer:v.visibility==="public"&&(!v.locationId||discovered.has(v.locationId))}));
   return {fromMinute:from,toMinute:to,dueProcesses:due,
    eventsResolved:false,npcDecisionsMade:false,worldTimeAdvanced:false};
  }
  case "economy":return price(pack,a);
  case "route":return route(pack,a);
  case "npc":return npc(pack,a);
  default:throw Error("LAB_OPERATION_UNKNOWN");
 }
}
export function evaluateLabPack(pack:LabPack,jobs:LabJob[]){
 validateLabPack(pack);
 if(!Array.isArray(jobs)||jobs.length<1||jobs.length>20||JSON.stringify(jobs).length>60000)throw Error("LAB_JOB_BATCH_LIMIT");
 const ids=new Set<string>();
 const results=jobs.map(job=>{
  if(!safeObj(job)||!ID.test(job.id)||ids.has(job.id))throw Error("LAB_JOB_INVALID_ID");
  ids.add(job.id);
  try{return {id:job.id,kind:job.kind,ok:true,value:evaluateLabJob(pack,job)};}
  catch(e){return {id:job.id,kind:job.kind,ok:false,error:e instanceof Error?e.message:"LAB_BAD_JOB"};}
 });
 return {schema:"RPG_LAB_RESULT_V1",projectId:pack.projectId,worldId:pack.worldId,
  sourceAttested:false,committed:false,legacySaveTouched:false,
  results,explanation:"Simulation proposals: separate world-specific authorization and commit are required."};
}
