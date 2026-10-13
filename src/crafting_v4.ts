/**
 * Crafting V4: deterministic labor / familiarity / quality projections.
 * All recipes are calibration references, NOT recipes acquired by Shura or a live NPC.
 * Outputs are proposals. No item, payment, resource, star or clock is committed here.
 */
import type {Capability, TaskKind} from "./proficiency.ts";

export type CraftStageKind = "active" | "passive" | "inspection";
export type CraftStageReference = {
  id:string; kind:CraftStageKind; setupMinutes:number; unitMinutes:number;
  taskKind?:TaskKind; physicalRequirement:string;
};
export type CraftRecipeReference = {
  id:string; title:string; referenceOnly:true; prerequisites:string;
  stages:readonly CraftStageReference[];
};

/** Benchmarks describe prepared stock and ordinary tools, not raw material processing. */
export const CRAFT_V4_REFERENCES:readonly CraftRecipeReference[]=[
  {id:"calibration.spoon.dry_blank",title:"Simple wooden spoon from dry prepared blank",
    referenceOnly:true,prerequisites:"Dry suitable blank, sharp woodworking tools, safe bench",
    stages:[
      {id:"setup",kind:"active",setupMinutes:5,unitMinutes:5,taskKind:"wood_carving",physicalRequirement:"Blank, tools and design available"},
      {id:"carve",kind:"active",setupMinutes:0,unitMinutes:25,taskKind:"wood_carving",physicalRequirement:"Physical shaping; geometry limits apply"},
      {id:"finish",kind:"active",setupMinutes:0,unitMinutes:15,taskKind:"wood_carving",physicalRequirement:"Surface and splinters checked"},
      {id:"inspect",kind:"inspection",setupMinutes:0,unitMinutes:10,taskKind:"wood_carving",physicalRequirement:"Independent quality evidence before final delivery"},
    ]},
  {id:"calibration.cord.prepared_yarn_1_1m",title:"1.1 m cord from already prepared yarn",
    referenceOnly:true,prerequisites:"Sufficient prepared fibres/yarn, tension tools, strength requirements stated",
    stages:[
      {id:"setup",kind:"active",setupMinutes:5,unitMinutes:5,taskKind:"cordage",physicalRequirement:"Usable fibres and proper length allowances"},
      {id:"twist",kind:"active",setupMinutes:0,unitMinutes:25,taskKind:"cordage",physicalRequirement:"Twist, weave and tension actually executed"},
      {id:"finish",kind:"active",setupMinutes:0,unitMinutes:10,taskKind:"cordage",physicalRequirement:"Ends secured against untwisting"},
      {id:"inspect",kind:"inspection",setupMinutes:0,unitMinutes:10,taskKind:"cordage",physicalRequirement:"Load testing scaled to actual use; no automatic bowstring safety"},
    ]},
  {id:"calibration.wood_handle.glued",title:"Simple glued wooden handle",
    referenceOnly:true,prerequisites:"Dry wood, fitting parts and adhesive with known cure requirements",
    stages:[
      {id:"shape",kind:"active",setupMinutes:5,unitMinutes:35,taskKind:"wood_carving",physicalRequirement:"Tool and grip dimensions checked"},
      {id:"glue",kind:"active",setupMinutes:0,unitMinutes:5,taskKind:"kit_assembly",physicalRequirement:"Correct adhesive, humidity and clamping"},
      {id:"cure",kind:"passive",setupMinutes:180,unitMinutes:0,physicalRequirement:"Elapsed curing time under suitable conditions, cannot be skill accelerated"},
      {id:"inspect",kind:"inspection",setupMinutes:0,unitMinutes:10,taskKind:"kit_assembly",physicalRequirement:"Inspect bond only after curing"},
    ]},
] as const;

const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
function integer(n:unknown,min:number,max:number,name:string):number{
 if(typeof n!=="number"||!Number.isSafeInteger(n)||n<min||n>max)throw Error("CRAFT_V4_INVALID_"+name);
 return n;
}
function factor(n:unknown,min:number,max:number,name:string):number{
 if(typeof n!=="number"||!Number.isFinite(n)||n<min||n>max)throw Error("CRAFT_V4_INVALID_"+name);
 return n;
}
const validRef=(s:string)=>/^[a-zA-Z0-9._:-]{8,180}$/.test(s);

/** Source refs are claimed by the planner: the GM must independently verify receipts. */
export function countCraftFamiliarity(recipeReceipts:readonly string[]):number{
 if(!Array.isArray(recipeReceipts)||recipeReceipts.length>12||new Set(recipeReceipts).size!==recipeReceipts.length||
   !recipeReceipts.every(r=>typeof r==="string"&&validRef(r)))throw Error("CRAFT_V4_FAMILIARITY_RECEIPTS_INVALID");
 return recipeReceipts.length;
}
export type CraftV4PreviewInput={
  recipeId:string;stageId:string;quantity:number;capability?:Capability;
  availableStaffedMinutes:number;priorStageProgressMinutes:number;
  elapsedNaturalMinutes?:number;
  completedRecipeReceiptRefs?:readonly string[];
  toolFactor?:number;workingConditionFactor?:number;
};
export type CraftV4Preview={
  recipeId:string;stageId:string;kind:CraftStageKind;quantity:number;
  referenceOnly:true;recipePrerequisites:string;physicalRequirement:string;
  normativeMinutes:number;remainingNormativeMinutes:number;
  baseSkillSpeed:number;familiarityFactor:number;toolFactor:number;workingConditionFactor:number;
  effectiveSpeed:number;
  availableStaffedMinutes:number;actualStaffedMinutesUsed:number;
  effectiveWorkMinutes:number;newStageProgressMinutes:number;
  readyForNextStage:boolean;requiresInspection:boolean;
  qualityModifier:number|null;qualityPotentialStars:number|null;errorRisk:"LOW"|"MODERATE"|"HIGH"|null;
  nextStageId:string|null;naturalProcessUnaffected:true;
  familiarityReceiptsClaimed:number;familiaritySourceAttested:false;
  inputsUnverified:true;committed:false;
};
/**
 * Complete only ONE stage, never a whole product. Passive stages use elapsed natural
 * time instead of staffed time and cannot be accelerated by skill, tools or magic unless
 * an independently modelled real physical intervention changes the process.
 */
export function previewCraftV4(input:CraftV4PreviewInput):CraftV4Preview{
 const recipe=CRAFT_V4_REFERENCES.find(r=>r.id===input.recipeId);
 if(!recipe)throw Error("CRAFT_V4_RECIPE_NOT_IN_REFERENCE_CATALOG");
 const index=recipe.stages.findIndex(s=>s.id===input.stageId);
 if(index<0)throw Error("CRAFT_V4_UNKNOWN_STAGE");
 const stage=recipe.stages[index],quantity=integer(input.quantity,1,20,"QUANTITY");
 const available=integer(input.availableStaffedMinutes,0,10080,"STAFF_TIME");
 const normative=stage.setupMinutes+stage.unitMinutes*quantity;
 const prior=integer(input.priorStageProgressMinutes,0,normative,"PRIOR_PROGRESS");
 const receipts=input.completedRecipeReceiptRefs??[];
 const familiarity=countCraftFamiliarity(receipts),fam=Number((1+Math.min(familiarity,10)*0.02).toFixed(3));
 const tool=factor(input.toolFactor??1,0.60,1.50,"TOOL_FACTOR");
 const condition=factor(input.workingConditionFactor??1,0.55,1.15,"CONDITION_FACTOR");
 const remaining=normative-prior;
 let base=1,speed=1,actual=0,work=0;
 let qualityModifier:number|null=null,qualityPotentialStars:number|null=null,errorRisk:CraftV4Preview["errorRisk"]=null;
 if(stage.kind==="passive"){
   const natural=integer(input.elapsedNaturalMinutes??0,0,10080,"NATURAL_ELAPSED");
   work=Math.min(remaining,natural); // no dependency on available staffed time
 } else {
   const skill=input.capability;
   if(!skill||skill.taskKind!==stage.taskKind||!skill.skillSnapshotVerified)throw Error("CRAFT_V4_TASK_SKILL_REQUIRED");
   base=skill.efficiencyFactor;
   speed=Number(clamp(base*fam*tool*condition,0.3,4.5).toFixed(3));
   work=Math.min(remaining,Math.floor(available*speed));
   actual=work===0?0:Math.min(available,Math.ceil(work/speed));
   // Rating of prospective *execution*, not material power, safety or an item award.
   const qi=clamp(58+0.8*skill.skillMargin+1.6*familiarity+15*(tool-1)+10*(condition-1),0,100);
   qualityModifier=Math.round(qi-50);
   qualityPotentialStars=qi>=90?5:qi>=70?4:qi>=50?3:qi>=30?2:1;
   errorRisk=skill.skillMargin>=10&&condition>=0.85?"LOW":skill.skillMargin>=-15?"MODERATE":"HIGH";
 }
 const completed=prior+work>=normative;
 return {recipeId:recipe.id,stageId:stage.id,kind:stage.kind,quantity,referenceOnly:true,
   recipePrerequisites:recipe.prerequisites,physicalRequirement:stage.physicalRequirement,
   normativeMinutes:normative,remainingNormativeMinutes:remaining,
   baseSkillSpeed:base,familiarityFactor:stage.kind==="passive"?1:fam,
   toolFactor:stage.kind==="passive"?1:tool,workingConditionFactor:stage.kind==="passive"?1:condition,
   effectiveSpeed:speed,availableStaffedMinutes:available,actualStaffedMinutesUsed:actual,
   effectiveWorkMinutes:work,newStageProgressMinutes:prior+work,readyForNextStage:completed,
   requiresInspection:completed&&index===recipe.stages.length-1,
   qualityModifier,qualityPotentialStars,errorRisk,
   nextStageId:completed?recipe.stages[index+1]?.id??null:stage.id,
   naturalProcessUnaffected:true,familiarityReceiptsClaimed:familiarity,
   familiaritySourceAttested:false,inputsUnverified:true,committed:false};
}
/** End-to-end baseline, no fabricated work hours or auto-advanced processes. */
export function summarizeCraftReference(recipeId:string,quantity=1){
 const recipe=CRAFT_V4_REFERENCES.find(r=>r.id===recipeId);
 if(!recipe)throw Error("CRAFT_V4_RECIPE_NOT_IN_REFERENCE_CATALOG");
 integer(quantity,1,20,"QUANTITY");
 const stages=recipe.stages.map(s=>({id:s.id,kind:s.kind,
   normativeMinutes:s.setupMinutes+s.unitMinutes*quantity,taskKind:s.taskKind??null}));
 return {recipeId,title:recipe.title,referenceOnly:true,quantity,stages,
   activeNormativeMinutes:stages.filter(s=>s.kind!=="passive").reduce((n,s)=>n+s.normativeMinutes,0),
   mandatoryPassiveMinutes:stages.filter(s=>s.kind==="passive").reduce((n,s)=>n+s.normativeMinutes,0),
   committed:false};
}
