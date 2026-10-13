/** Task-specific competency model; caller provided properties are NOT source attestation. */
export type TaskKind="bow_design"|"bow_fabrication"|"bow_tuning"|"kit_assembly"|"knife_fabrication"|"drawing"|"technical_drafting"|"cooking"|"document_audit"|"trade_negotiation"|"bow_shooting";
export type TaskProfile={parent:string;specialization:string;characteristic:string;support?:readonly {competenceId:string;name:string;cap:number}[];physicalGate:string};
const C="competence.crafting.practical_creation",K="competence.knowledge.research",A="competence.art.visual_expression",E="competence.engineering.design";
export const TASK_PROFILES:Record<TaskKind,TaskProfile>={
 bow_design:{parent:E,specialization:"Техническое черчение",characteristic:"Intelligence",support:[{competenceId:K,name:"Пространственная схематизация",cap:7}],physicalGate:"Drawing alone does not prove a safe bow design."},
 bow_fabrication:{parent:C,specialization:"Лукоделие",characteristic:"Dexterity",support:[{competenceId:C,name:"Сборка и подгонка",cap:4},{competenceId:C,name:"Materials",cap:3}],physicalGate:"Requires authentic materials, limb fabrication, measured safe draw and real tests."},
 bow_tuning:{parent:C,specialization:"Лукоделие",characteristic:"Intelligence",support:[{competenceId:C,name:"Сборка и подгонка",cap:4}],physicalGate:"Partial draw never proves full-draw safety."},
 kit_assembly:{parent:C,specialization:"Сборка и подгонка",characteristic:"Dexterity",physicalGate:"Requires already designed components and actual custody."},
 knife_fabrication:{parent:C,specialization:"Ножеделие",characteristic:"Dexterity",support:[{competenceId:C,name:"Металлообработка",cap:4}],physicalGate:"Blade manufacture requires geometry, steel and heat treatment evidence."},
 drawing:{parent:A,specialization:"Рисование",characteristic:"Dexterity",physicalGate:"Original pictorial composition; not engineering drafting."},
 technical_drafting:{parent:E,specialization:"Техническое черчение",characteristic:"Intelligence",support:[{competenceId:K,name:"Пространственная схематизация",cap:7}],physicalGate:"Requires reproducible dimensions and verification against the object."},
 cooking:{parent:C,specialization:"Cooking",characteristic:"Dexterity",physicalGate:"Ingredients, hygiene and actual food-quality checks remain mandatory."},
 document_audit:{parent:K,specialization:"Records/systematization",characteristic:"Intelligence",physicalGate:"Original records and documented source provenance required."},
 trade_negotiation:{parent:"competence.society.communication",specialization:"Trade",characteristic:"Charisma",physicalGate:"Partner consent and actual budget required."},
 bow_shooting:{parent:"competence.combat.melee",specialization:"Bow",characteristic:"Coordination",physicalGate:"Shooting a bow gives no bow-making skill."}
};
export type SkillRows={competences:unknown[][];specializations:unknown[][];characteristics:unknown[][]};
export type Ratings={levels:ReadonlyMap<string,number>;stars:ReadonlyMap<string,number>;characteristics:ReadonlyMap<string,number>};
function numericColumn(rows:unknown[][],key:string,value:string):Map<string,number>{
 if(!rows?.length||!Array.isArray(rows[0]))throw Error("SKILL_SOURCE_MISSING");
 const h=rows[0].map(String),ki=h.indexOf(key),vi=h.indexOf(value);
 if(ki<0||vi<0)throw Error("SKILL_SOURCE_COLUMNS");
 const out=new Map<string,number>();
 for(const row of rows.slice(1)){const id=String(row[ki]??"").trim();if(!id)continue;
  const n=Number(String(row[vi]??"").replace(",","."));if(out.has(id)||!Number.isSafeInteger(n)||n<0||n>100)throw Error("SKILL_SOURCE_DUPLICATE_OR_INVALID");
  out.set(id,n);}
 return out;
}
export function readAuthoritativeRatings(rows:SkillRows):Ratings{
 const levels=numericColumn(rows.competences,"Competence ID","Level");
 const characteristics=numericColumn(rows.characteristics,"Characteristic","Value");
 const starRaw=numericColumn(rows.specializations,"Specialization","Stars");
 const header=rows.specializations[0].map(String),compIndex=header.indexOf("Competence ID"),nameIndex=header.indexOf("Specialization");
 if(compIndex<0||nameIndex<0)throw Error("SKILL_SPECIALIZATION_COLUMNS");
 const stars=new Map<string,number>();
 for(const row of rows.specializations.slice(1)){
  const name=String(row[nameIndex]??""),id=String(row[compIndex]??"");if(!name)continue;
  const key=id+"::"+name;if(!levels.has(id)||stars.has(key))throw Error("SKILL_ORPHAN_OR_DUPLICATE");
  const val=starRaw.get(name)??0;if(val>10)throw Error("SKILL_STARS_INVALID");stars.set(key,val);
 }
 return {levels,stars,characteristics};
}
export type Capability={taskKind:TaskKind;competenceId:string;specialization:string;competenceLevel:number;specializationStars:number;supportBonus:number;score:number;difficulty:number;skillMargin:number;efficiencyFactor:number;readiness:"INSUFFICIENT"|"DEVELOPING"|"PRACTICED";primarySpecializationPresent:boolean;physicalGate:string;skillSnapshotVerified:true;inputsUnverified:true;committed:false};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export function evaluateCapability(taskKind:TaskKind,ratings:Ratings,difficulty:number):Capability{
 const p=TASK_PROFILES[taskKind];if(!p)throw Error("UNKNOWN_TASK");
 if(!Number.isSafeInteger(difficulty)||difficulty<1||difficulty>100)throw Error("INVALID_DIFFICULTY");
 const level=ratings.levels.get(p.parent)??0,primary=p.parent+"::"+p.specialization;
 const stars=ratings.stars.get(primary)??0,hasPrimary=ratings.stars.has(primary);
 const attribute=ratings.characteristics.get(p.characteristic);if(attribute===undefined)throw Error("CHARACTERISTIC_NOT_VERIFIED");
 const support=(p.support??[]).reduce((sum,x)=>sum+Math.min(x.cap,ratings.stars.get(x.competenceId+"::"+x.name)??0),0);
 const score=clamp((level?5+Math.min(20,(level-1)*3):0)+stars*6+support+clamp(attribute-5,-5,7),0,100);
 const margin=score-difficulty,readiness=margin>=10?"PRACTICED":margin>=-15?"DEVELOPING":"INSUFFICIENT";
 const efficiencyFactor=Number(clamp(0.78+score/240,0.65,1.18).toFixed(3));
 return {taskKind,competenceId:p.parent,specialization:p.specialization,competenceLevel:level,specializationStars:stars,supportBonus:support,score,difficulty,skillMargin:margin,efficiencyFactor,readiness,primarySpecializationPresent:hasPrimary,physicalGate:p.physicalGate,skillSnapshotVerified:true,inputsUnverified:true,committed:false};
}
export function verifySpecializedLearning(e:{competenceId:string;specialization?:string;taskKind?:string;sourceRef?:string;productiveMinutes:number;elapsedSeconds:number}):void{
 const matches=Object.entries(TASK_PROFILES).filter(([,p])=>p.parent===e.competenceId&&p.specialization===e.specialization);
 if(!matches.length||!e.specialization||!["Лукоделие","Ножеделие","Рисование","Техническое черчение"].includes(e.specialization))return;
 if(!matches.some(([k])=>k===e.taskKind))throw Error("SPECIALIZATION_WRONG_WORK_DOMAIN");
 if(!e.sourceRef||!/^[a-zA-Z0-9._:-]{8,180}$/.test(e.sourceRef))throw Error("SPECIALIZATION_SOURCE_REQUIRED");
 if(!Number.isFinite(e.productiveMinutes)||e.productiveMinutes<5||!Number.isFinite(e.elapsedSeconds)||e.elapsedSeconds<e.productiveMinutes*60)throw Error("SPECIALIZATION_ACTUAL_PRACTICE_REQUIRED");
}
