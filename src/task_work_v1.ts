/**
 * Work V1: generalized multi-actor, stage-based work and process lower-bound planner.
 *
 * Not an entitlement to accept jobs, skip inspections, infer an ability from user claims,
 * advance world time, or mint goods/cash/XP. Conditional methods require independently
 * checked canonical knowledge, accurate inputs and actual permission to use them.
 */
import type {Capability,TaskKind} from "./proficiency.ts";

export type WorkKind="active"|"verification"|"passive";
export type WorkMethod =
 | {kind:"replacement";methodId:string;sourceRef:string;replacementMinutes:number;coveragePreserved:boolean}
 | {kind:"selective";methodId:string;sourceRef:string;checkedFraction:number;coveragePreserved:boolean};
export type WorkStage={
  id:string;label:string;actorId:string;kind:WorkKind;dependsOn:string[];
  fixedMinutes:number;variableMinutes:number;physicalMinimumMinutes:number;
  taskKind?:TaskKind;difficulty?:number;
  method?:WorkMethod;
  mandatoryFullCoverage?:boolean;
  verifiedInputsRequired?:string[];
};
export type WorkPlanInput={planId:string;stages:WorkStage[]};
export type WorkStageProjection={
 id:string;label:string;actorId:string;kind:WorkKind;baselineMinutes:number;
 proposedWorkMinutes:number;effectiveSpeed:number;durationMinutes:number;
 startsAtMinute:number;finishesAtMinute:number;skillSourceVerified:boolean;
 shortcutConditional:boolean;methodId:string|null;methodSourceRef:string|null;
 inputEvidenceNeedsReview:readonly string[];
 qualityPotential:number|null;requiresIndependentValidation:boolean;
};
export type WorkPlanProjection={
 planId:string;baselineSequentialMinutes:number;projectedLowerBoundMinutes:number;
 shuraActiveMinutes:number;otherActorMinutes:Record<string,number>;
 actorMinutes:Record<string,number>;methodEvidenceRefs:string[];
 stages:WorkStageProjection[];criticalPathIsLowerBound:true;
 claimedMethodsAttested:false;otherActorAvailabilityAttested:false;
 inputWorkloadAttested:false;requiresActualScheduling:true;
 requiresIndependentMethodValidation:boolean;requiresGmCausalResolution:true;
 playerChoiceMade:false;committed:false;
};
const id=(x:unknown):x is string=>typeof x==="string"&&/^[A-Za-z0-9._:-]{3,180}$/.test(x);
function count(x:unknown,max:number,name:string):number{
 if(typeof x!=="number"||!Number.isSafeInteger(x)||x<0||x>max)throw Error("WORK_V1_INVALID_"+name);
 return x;
}
function assertRef(x:unknown,name:string):asserts x is string{
 if(typeof x!=="string"||!/^[A-Za-z0-9._:-]{8,180}$/.test(x))throw Error("WORK_V1_INVALID_"+name);
}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

/**
 * Compute conditional stage durations and an idealized resource-constrained schedule:
 * no actor is booked on two stages simultaneously, and dependencies must finish first.
 * NPC availability, contracts, travel, intervening commitments and clocks remain
 * external sources; the returned makespan is never an approved ETA.
 */
export function planWorkV1(input:WorkPlanInput,sourceSkills:ReadonlyMap<string,Capability>=new Map()):WorkPlanProjection{
 if(!input||!id(input.planId)||!Array.isArray(input.stages)||input.stages.length<1||input.stages.length>32){
   throw Error("WORK_V1_INVALID_PLAN");
 }
 const seen=new Set<string>();
 for(const s of input.stages){
   if(!s||!id(s.id)||seen.has(s.id)||!id(s.actorId)||typeof s.label!=="string"||!s.label.trim()||s.label.length>180)
     throw Error("WORK_V1_INVALID_STAGE");
   seen.add(s.id);
 }
 // Use caller's explicit topological order: no silent reorder of sequential narrative.
 const completed=new Map<string,WorkStageProjection>(),actorAvailable=new Map<string,number>(),
   actorMinutes:Record<string,number>=Object.create(null),stages:WorkStageProjection[]=[];
 const methodEvidenceRefs:string[]=[];let needsIndependent=false,baselineSequentialMinutes=0;
 for(const s of input.stages){
   if(!["active","verification","passive"].includes(s.kind))throw Error("WORK_V1_INVALID_KIND");
   if(!Array.isArray(s.dependsOn)||s.dependsOn.length>32||new Set(s.dependsOn).size!==s.dependsOn.length||
     !s.dependsOn.every(x=>id(x)&&completed.has(x)))throw Error("WORK_V1_INVALID_DEPENDENCIES");
   const fixed=count(s.fixedMinutes,10080,"FIXED"),variable=count(s.variableMinutes,10080,"VARIABLE"),
     floor=count(s.physicalMinimumMinutes,10080,"PHYSICAL_FLOOR");
   const baseline=fixed+variable;
   if(!Number.isSafeInteger(baseline)||baseline<1||baseline>10080||floor>baseline)
     throw Error("WORK_V1_INVALID_BASELINE");
   baselineSequentialMinutes+=baseline;
   if(typeof s.mandatoryFullCoverage!=="undefined"&&typeof s.mandatoryFullCoverage!=="boolean")
     throw Error("WORK_V1_INVALID_COVERAGE");
   const sourceNeeds=s.verifiedInputsRequired??[];
   if(!Array.isArray(sourceNeeds)||sourceNeeds.length>16||
     !sourceNeeds.every(x=>id(x))||new Set(sourceNeeds).size!==sourceNeeds.length)
       throw Error("WORK_V1_INVALID_EVIDENCE_NEEDS");
   const passive=s.kind==="passive";
   if(passive&&(s.method!==undefined||s.taskKind!==undefined||floor!==0||s.actorId==="actor.shura"))
     throw Error("WORK_V1_PASSIVE_MUST_BE_NATURAL");
   let work=baseline,shortcut=false,methodId:null|string=null,methodSourceRef:null|string=null;
   const method=s.method;
   if(method!==undefined){
     if(!method||!["replacement","selective"].includes(method.kind))
       throw Error("WORK_V1_INVALID_METHOD");
     assertRef(method.methodId,"METHOD_ID");assertRef(method.sourceRef,"METHOD_SOURCE_REF");
     if(typeof method.coveragePreserved!=="boolean")throw Error("WORK_V1_COVERAGE_PROOF_REQUIRED");
     if(s.mandatoryFullCoverage&&!method.coveragePreserved)throw Error("WORK_V1_MANDATORY_COVERAGE");
     if(method.kind==="replacement"){
       count(method.replacementMinutes,10080,"REPLACEMENT");
       if(method.replacementMinutes<floor)throw Error("WORK_V1_PHYSICAL_LIMIT");
       work=method.replacementMinutes;
     }else if(method.kind==="selective"){
       if(typeof method.checkedFraction!=="number"||!Number.isFinite(method.checkedFraction)||
          method.checkedFraction<0.01||method.checkedFraction>1)throw Error("WORK_V1_INVALID_FRACTION");
       work=fixed+Math.ceil(variable*method.checkedFraction);
       if(work<floor)throw Error("WORK_V1_PHYSICAL_LIMIT");
     }
     if(work>baseline)throw Error("WORK_V1_METHOD_IS_NOT_SHORTCUT");
     if(work<baseline){
       shortcut=true;methodId=method.methodId;methodSourceRef=method.sourceRef;
       methodEvidenceRefs.push(method.sourceRef);needsIndependent=true;
     }
   }
   const shura=s.actorId==="actor.shura";
   let speed=1,qualityPotential:number|null=null,skillVerified=false;
   if(shura&&s.taskKind){
     const capability=sourceSkills.get(s.id);
     if(!capability||capability.taskKind!==s.taskKind||!capability.skillSnapshotVerified||
       !Number.isFinite(capability.efficiencyFactor)||capability.efficiencyFactor<=0)
       throw Error("WORK_V1_LIVE_SKILL_REQUIRED");
     speed=capability.efficiencyFactor;skillVerified=true;
     qualityPotential=Math.round(clamp(55+capability.skillMargin*0.75,0,100));
   }else if(shura&&s.difficulty!==undefined){
     throw Error("WORK_V1_UNTAGGED_DIFFICULTY");
   }
   if(!shura&&s.taskKind)throw Error("WORK_V1_NPC_RATING_NOT_ATTESTED");
   if(shura&&s.taskKind&&(typeof s.difficulty!=='number'||!Number.isSafeInteger(s.difficulty)||s.difficulty<1||s.difficulty>100))
      throw Error("WORK_V1_DIFFICULTY_REQUIRED");
   // Only source-verified Shura skills modify elapsed time; NPCs stay baseline.
   // A hard physical floor is real elapsed activity, not simply a normative workload.
   // Replacement is already optimized actual minutes; never discount a second time.
   const appliedSpeed=shortcut&&method?.kind==="replacement"?1:speed;
   const duration=passive?baseline:Math.max(floor,Math.ceil(work/appliedSpeed));
   const dependencyEnd=Math.max(0,...s.dependsOn.map(d=>completed.get(d)!.finishesAtMinute));
   const starts=passive?dependencyEnd:Math.max(dependencyEnd,actorAvailable.get(s.actorId)??0);
   const finishes=starts+duration;
   if(!passive){
     actorAvailable.set(s.actorId,finishes);
     actorMinutes[s.actorId]=(actorMinutes[s.actorId]??0)+duration;
   }
   const detail:WorkStageProjection={
     id:s.id,label:s.label,actorId:s.actorId,kind:s.kind,baselineMinutes:baseline,
     proposedWorkMinutes:work,effectiveSpeed:appliedSpeed,durationMinutes:duration,
     startsAtMinute:starts,finishesAtMinute:finishes,skillSourceVerified:skillVerified,
     shortcutConditional:shortcut,methodId,methodSourceRef,
     inputEvidenceNeedsReview:sourceNeeds,
     qualityPotential,requiresIndependentValidation:shortcut||sourceNeeds.length>0};
   stages.push(detail);completed.set(s.id,detail);
 }
 const projectedLowerBoundMinutes=Math.max(...stages.map(s=>s.finishesAtMinute));
 const otherActorMinutes:Record<string,number>={};
 for(const [actor,minutes] of Object.entries(actorMinutes))if(actor!=="actor.shura")otherActorMinutes[actor]=minutes;
 return {planId:input.planId,baselineSequentialMinutes,projectedLowerBoundMinutes,
   shuraActiveMinutes:actorMinutes["actor.shura"]??0,otherActorMinutes,
   actorMinutes:{...actorMinutes},methodEvidenceRefs:[...new Set(methodEvidenceRefs)],
   stages,criticalPathIsLowerBound:true,claimedMethodsAttested:false,
   otherActorAvailabilityAttested:false,inputWorkloadAttested:false,
   requiresActualScheduling:true,requiresIndependentMethodValidation:needsIndependent,
   requiresGmCausalResolution:true,playerChoiceMade:false,committed:false};
}

/** Calibration-only workload. Not an opportunity, contract, real NPC shift or Shura choice. */
export function sampleCargoReceivingWork():WorkPlanInput{
 return {planId:"calibration.cargo.receive",stages:[
 {id:"unload",label:"Разгрузка",actorId:"npc.porters",kind:"active",dependsOn:[],
  fixedMinutes:0,variableMinutes:30,physicalMinimumMinutes:30,verifiedInputsRequired:["actual.cargo","staff.available"]},
 {id:"manifest",label:"Анализ накладной",actorId:"actor.shura",kind:"verification",dependsOn:["unload"],
  fixedMinutes:0,variableMinutes:30,physicalMinimumMinutes:2,taskKind:"document_audit",difficulty:25,
  method:{kind:"replacement",methodId:"method.manifest.analysis",sourceRef:"canon.shura.method.manifest",replacementMinutes:8,coveragePreserved:true},
  verifiedInputsRequired:["original.document","known.formulas"]},
 {id:"reconcile",label:"Пересчёт и поиск несоответствий",actorId:"actor.shura",kind:"verification",dependsOn:["manifest"],
  fixedMinutes:0,variableMinutes:20,physicalMinimumMinutes:2,taskKind:"document_audit",difficulty:25,
  method:{kind:"replacement",methodId:"method.cargo.comparison",sourceRef:"canon.shura.method.compare",replacementMinutes:4,coveragePreserved:true},
  verifiedInputsRequired:["actual.manifest","supported.system.abilities"]},
 {id:"exceptions",label:"Физическая проверка отмеченных грузов",actorId:"npc.porters",kind:"verification",dependsOn:["reconcile"],
  fixedMinutes:0,variableMinutes:10,physicalMinimumMinutes:10,mandatoryFullCoverage:true,
  verifiedInputsRequired:["flagged.stock","authorized.inspection"]},
 {id:"putaway",label:"Погрузка в место хранения",actorId:"npc.porters",kind:"active",dependsOn:["exceptions"],
  fixedMinutes:0,variableMinutes:30,physicalMinimumMinutes:30,verifiedInputsRequired:["storage.available","staff.available"]},
 ]};
}
