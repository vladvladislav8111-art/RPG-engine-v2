/** Task-specific competency model; caller provided properties are NOT source attestation. */
export type TaskKind="bow_design"|"bow_fabrication"|"bow_tuning"|"kit_assembly"|"knife_fabrication"|"wood_carving"|"cordage"|"drawing"|"technical_drafting"|"cooking"|"document_audit"|"trade_negotiation"|"bow_shooting"|"heavy_lifting"|"sustained_carry"|"balance_control"|"fine_manipulation"|"terrain_observation"|"tight_space_movement"|"social_interpretation"|"focus_under_pressure"|"magical_presence_detection"|"survival_judgment";
export type TaskProfile={parent:string;specialization:string;characteristic:string;secondaryCharacteristic?:string;support?:readonly {competenceId:string;name:string;cap:number}[];physicalGate:string};
const C="competence.crafting.practical_creation",K="competence.knowledge.research",A="competence.art.visual_expression",E="competence.engineering.design";
export const TASK_PROFILES:Record<TaskKind,TaskProfile>={
 bow_design:{parent:C,specialization:"Лукоделие",characteristic:"Intelligence",secondaryCharacteristic:"Coordination",support:[{competenceId:E,name:"Техническое черчение",cap:5},{competenceId:K,name:"Пространственная схематизация",cap:3}],physicalGate:"Bow geometry, load path and component constraints must be verified; schematic alone is not a safe bow."},
 bow_fabrication:{parent:C,specialization:"Лукоделие",characteristic:"Dexterity",secondaryCharacteristic:"Strength",support:[{competenceId:C,name:"Сборка и подгонка",cap:4},{competenceId:C,name:"Materials",cap:3}],physicalGate:"Requires authentic materials, limb fabrication, measured safe draw and real tests."},
 bow_tuning:{parent:C,specialization:"Лукоделие",characteristic:"Intelligence",secondaryCharacteristic:"Perception",support:[{competenceId:C,name:"Сборка и подгонка",cap:4}],physicalGate:"Partial draw never proves full-draw safety."},
 kit_assembly:{parent:C,specialization:"Сборка и подгонка",characteristic:"Dexterity",secondaryCharacteristic:"Coordination",physicalGate:"Requires already designed components and actual custody."},
 knife_fabrication:{parent:C,specialization:"Ножеделие",characteristic:"Dexterity",secondaryCharacteristic:"Strength",support:[{competenceId:C,name:"Металлообработка",cap:4}],physicalGate:"Blade manufacture requires geometry, steel and heat treatment evidence."},
 wood_carving:{parent:C,specialization:"Резьба по дереву",characteristic:"Dexterity",secondaryCharacteristic:"Coordination",support:[{competenceId:C,name:"Materials",cap:3}],physicalGate:"Prepared wood, sharp tools and grain direction must be real; does not create a learned recipe."},
 cordage:{parent:C,specialization:"Изготовление шнуров",characteristic:"Dexterity",secondaryCharacteristic:"Coordination",support:[{competenceId:C,name:"Лукоделие",cap:3}],physicalGate:"Prepared fibre and tensile requirements must be verified; cord does not automatically qualify as bowstring."},
 drawing:{parent:A,specialization:"Рисование",characteristic:"Dexterity",secondaryCharacteristic:"Perception",physicalGate:"Original pictorial composition; not engineering drafting."},
 technical_drafting:{parent:E,specialization:"Техническое черчение",characteristic:"Intelligence",secondaryCharacteristic:"Coordination",support:[{competenceId:K,name:"Пространственная схематизация",cap:7}],physicalGate:"Requires reproducible dimensions and verification against the object."},
 cooking:{parent:C,specialization:"Cooking",characteristic:"Dexterity",secondaryCharacteristic:"Wisdom",physicalGate:"Ingredients, hygiene and actual food-quality checks remain mandatory."},
 document_audit:{parent:K,specialization:"Records/systematization",characteristic:"Intelligence",secondaryCharacteristic:"Wisdom",physicalGate:"Original records and documented source provenance required."},
 trade_negotiation:{parent:"competence.society.communication",specialization:"Trade",characteristic:"Charisma",secondaryCharacteristic:"Wisdom",physicalGate:"Partner consent and actual budget required."},
 bow_shooting:{parent:"competence.combat.melee",specialization:"Bow",characteristic:"Coordination",secondaryCharacteristic:"Perception",physicalGate:"Shooting a bow gives no bow-making skill."},
 heavy_lifting:{parent:"competence.body.physical_conditioning",specialization:"Endurance use",characteristic:"Strength",secondaryCharacteristic:"Endurance",physicalGate:"Real load mass, grip, posture, fatigue and bodily limits; score cannot suspend physics."},
 sustained_carry:{parent:"competence.body.physical_conditioning",specialization:"Endurance use",characteristic:"Endurance",secondaryCharacteristic:"Strength",physicalGate:"Verified carried mass, duration, terrain and available Stamina; no duplicate exertion billing."},
 balance_control:{parent:"competence.body.physical_conditioning",specialization:"Coordination",characteristic:"Coordination",secondaryCharacteristic:"Flexibility",physicalGate:"Actual footing, movement range and friction; falling remains possible."},
 fine_manipulation:{parent:"competence.body.physical_conditioning",specialization:"Coordination",characteristic:"Dexterity",secondaryCharacteristic:"Coordination",physicalGate:"Actual tools, visibility, fingertip access and materials required."},
 terrain_observation:{parent:"competence.survival.general",specialization:"Tracking",characteristic:"Perception",secondaryCharacteristic:"Wisdom",physicalGate:"Only observable traces in actual light, range and attention; no secret loot or omniscience."},
 tight_space_movement:{parent:"competence.body.physical_conditioning",specialization:"Coordination",characteristic:"Flexibility",secondaryCharacteristic:"Coordination",physicalGate:"Actual dimensions, body size, articulation and injury constraints; no impossible passage."},
 social_interpretation:{parent:"competence.society.communication",specialization:"Social reading",characteristic:"Wisdom",secondaryCharacteristic:"Perception",physicalGate:"Visible conduct and known language only; cannot read minds, prove lies or remove consent."},
 focus_under_pressure:{parent:"competence.knowledge.research",specialization:"Concentration",characteristic:"Will",secondaryCharacteristic:"Intelligence",physicalGate:"Concentration under distraction, pain or stress; no stamina creation, injury negation or forced compliance."},
 magical_presence_detection:{parent:"competence.magic.perception",specialization:"Magical presence",characteristic:"Perception",secondaryCharacteristic:"Will",physicalGate:"Only detectable magical signals with verified local conditions and thresholds; no automatic school/source identification."},
 survival_judgment:{parent:"competence.survival.general",specialization:"Environmental judgment",characteristic:"Wisdom",secondaryCharacteristic:"Intelligence",physicalGate:"Only known observations can support a risk estimate; never a free safe route."},
};
export type SkillRows={competences:unknown[][];specializations:unknown[][];characteristics:unknown[][];milestones?:unknown[][]};
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
 if(!rows.specializations?.length||!Array.isArray(rows.specializations[0]))throw Error("SKILL_SPECIALIZATIONS_MISSING");
 const header=rows.specializations[0].map(String),compIndex=header.indexOf("Competence ID"),nameIndex=header.indexOf("Specialization"),starIndex=header.indexOf("Stars");
 if(compIndex<0||nameIndex<0||starIndex<0)throw Error("SKILL_SPECIALIZATION_COLUMNS");
 const stars=new Map<string,number>();
 for(const row of rows.specializations.slice(1)){
  const name=String(row[nameIndex]??""),id=String(row[compIndex]??"");if(!name)continue;
  const key=id+"::"+name;if(!levels.has(id)||stars.has(key))throw Error("SKILL_ORPHAN_OR_DUPLICATE");
  const val=Number(String(row[starIndex]??"").replace(",","."));if(!Number.isSafeInteger(val)||val<0||val>10)throw Error("SKILL_STARS_INVALID");stars.set(key,val);
 }
 return {levels,stars,characteristics};
}
export type Capability={taskKind:TaskKind;competenceId:string;specialization:string;competenceLevel:number;specializationStars:number;supportBonus:number;score:number;difficulty:number;skillMargin:number;efficiencyFactor:number;readiness:"INSUFFICIENT"|"DEVELOPING"|"PRACTICED";primarySpecializationPresent:boolean;primaryCharacteristic:string;secondaryCharacteristic:string|null;secondaryCharacteristicBonus:number;secondaryCharacteristicPresent:boolean;physicalGate:string;skillSnapshotVerified:true;inputsUnverified:true;committed:false};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export function evaluateCapability(taskKind:TaskKind,ratings:Ratings,difficulty:number):Capability{
 const p=TASK_PROFILES[taskKind];if(!p)throw Error("UNKNOWN_TASK");
 if(!Number.isSafeInteger(difficulty)||difficulty<1||difficulty>100)throw Error("INVALID_DIFFICULTY");
 const level=ratings.levels.get(p.parent)??0,primary=p.parent+"::"+p.specialization;
 const stars=ratings.stars.get(primary)??0,hasPrimary=ratings.stars.has(primary);
 const attribute=ratings.characteristics.get(p.characteristic);if(attribute===undefined)throw Error("CHARACTERISTIC_NOT_VERIFIED");
 const secondaryName=p.secondaryCharacteristic ?? null;
 if(secondaryName===p.characteristic)throw Error("SKILL_SECONDARY_DUPLICATES_PRIMARY");
 const secondary=secondaryName?ratings.characteristics.get(secondaryName):undefined;
 // A missing optional secondary is not guessed or treated as a hidden +5 stat.
 const secondaryBonus=secondary===undefined?0:clamp((secondary-5)*0.5,-2,3);
 const support=(p.support??[]).reduce((sum,x)=>sum+Math.min(x.cap,ratings.stars.get(x.competenceId+"::"+x.name)??0),0);
 const score=clamp((level?5+Math.min(20,(level-1)*3):0)+stars*6+support+clamp(attribute-5,-5,7)+secondaryBonus,0,100);
 const margin=score-difficulty,readiness=margin>=10?"PRACTICED":margin>=-15?"DEVELOPING":"INSUFFICIENT";
 const starSpeeds=[0.65,0.75,0.85,0.95,1.10,1.30,1.55,1.85,2.20,2.60,3.20];
 const generalFactor=level>0?1+Math.min(12,level-1)*0.03:0.90;
 const attributeFactor=clamp(1+(attribute-5)*0.03,0.75,1.30);
 const efficiencyFactor=Number(clamp(starSpeeds[stars]*generalFactor*attributeFactor*(1+0.01*support)*(1+0.01*secondaryBonus),0.3,4.5).toFixed(3));
 return {taskKind,competenceId:p.parent,specialization:p.specialization,competenceLevel:level,specializationStars:stars,supportBonus:support,score,difficulty,skillMargin:margin,efficiencyFactor,readiness,primarySpecializationPresent:hasPrimary,primaryCharacteristic:p.characteristic,secondaryCharacteristic:secondaryName,secondaryCharacteristicBonus:secondaryBonus,secondaryCharacteristicPresent:secondaryName===null||secondary!==undefined,physicalGate:p.physicalGate,skillSnapshotVerified:true,inputsUnverified:true,committed:false};
}
export function verifySpecializedLearning(e:{competenceId:string;specialization?:string;taskKind?:string;sourceRef?:string;productiveMinutes:number;elapsedSeconds:number}):void{
 const matches=Object.entries(TASK_PROFILES).filter(([,p])=>p.parent===e.competenceId&&p.specialization===e.specialization);
 if(!matches.length||!e.specialization||!["Лукоделие","Ножеделие","Рисование","Техническое черчение"].includes(e.specialization))return;
 if(!matches.some(([k])=>k===e.taskKind))throw Error("SPECIALIZATION_WRONG_WORK_DOMAIN");
 if(!e.sourceRef||!/^[a-zA-Z0-9._:-]{8,180}$/.test(e.sourceRef))throw Error("SPECIALIZATION_SOURCE_REQUIRED");
 if(!Number.isFinite(e.productiveMinutes)||e.productiveMinutes<5||!Number.isFinite(e.elapsedSeconds)||e.elapsedSeconds<e.productiveMinutes*60)throw Error("SPECIALIZATION_ACTUAL_PRACTICE_REQUIRED");
}
