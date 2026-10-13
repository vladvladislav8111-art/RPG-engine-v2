import {strict as assert} from "node:assert";
import {evaluateCapability,readAuthoritativeRatings,verifySpecializedLearning} from "../src/proficiency.ts";
import {validateCompetenceDiscovery} from "../src/competence_catalog.ts";
import {dispatchWorldV3Batch} from "../src/world_sim_v3/runtime_facade.ts";
const rows={competences:[["Competence ID","Level"],["competence.crafting.practical_creation",3],["competence.knowledge.research",3],["competence.combat.melee",2]],specializations:[["Competence ID","Specialization","Stars"],["competence.crafting.practical_creation","Сборка и подгонка",9],["competence.crafting.practical_creation","Materials",4],["competence.combat.melee","Bow",4],["competence.knowledge.research","Пространственная схематизация",5]],characteristics:[["Characteristic","Value"],["Dexterity",7],["Intelligence",8],["Coordination",7],["Charisma",5]]};
Deno.test("assembly is distinct from bowyer, artist, drafting and knife-making",()=>{
 const r=readAuthoritativeRatings(rows);
 const kit=evaluateCapability("kit_assembly",r,25),bow=evaluateCapability("bow_fabrication",r,25);
 assert.equal(kit.specializationStars,9);assert.equal(bow.specializationStars,0);
 assert.ok(bow.supportBonus<=7);assert.ok(kit.score>bow.score);
 assert.equal(evaluateCapability("drawing",r,25).competenceLevel,0);
 assert.equal(evaluateCapability("technical_drafting",r,25).competenceLevel,0);
 assert.equal(evaluateCapability("bow_shooting",r,25).specializationStars,4);
 assert.equal(evaluateCapability("knife_fabrication",r,25).specializationStars,0);
});
Deno.test("real domain mastery helps its craft, does not auto-produce the item",()=>{
 const r=readAuthoritativeRatings(rows),stars=new Map(r.stars);
 stars.set("competence.crafting.practical_creation::Лукоделие",5);
 const bow=evaluateCapability("bow_fabrication",{...r,stars},20),knife=evaluateCapability("knife_fabrication",{...r,stars},20);
 assert.ok(bow.score>knife.score);assert.ok(bow.efficiencyFactor<=1.18);assert.equal(bow.committed,false);
});
Deno.test("live rows reject duplicates, orphan ratings and invalid difficulty",()=>{
 assert.throws(()=>readAuthoritativeRatings({...rows,competences:[...rows.competences,rows.competences[1]]}));
 assert.throws(()=>readAuthoritativeRatings({...rows,specializations:[...rows.specializations,["competence.unknown","Skill",2]]}));
 assert.throws(()=>evaluateCapability("drawing",readAuthoritativeRatings(rows),1000));
});
Deno.test("new roots and specialised skills demand real current practice",()=>{
 const e={competenceId:"competence.crafting.practical_creation",specialization:"Лукоделие",taskKind:"bow_fabrication",sourceRef:"session.day70.bow1",productiveMinutes:20,elapsedSeconds:1200};
 verifySpecializedLearning(e);
 assert.throws(()=>verifySpecializedLearning({...e,taskKind:"kit_assembly"}));
 assert.throws(()=>verifySpecializedLearning({...e,elapsedSeconds:0}));
 const p={competenceId:"competence.art.visual_expression",playerIntent:"Шура рисует картину",practiceEvidence:"Actual original painting made and independently revised with visual feedback",sourceRef:"session.day70.art1"};
 const learning=[{competenceId:p.competenceId,sourceRef:p.sourceRef,productiveMinutes:15}];
 assert.equal(validateCompetenceDiscovery({proposal:p,learningEvents:learning,elapsedSeconds:900,ownedIds:new Set()}).pillar,"Art");
 assert.throws(()=>validateCompetenceDiscovery({proposal:p,learningEvents:learning,elapsedSeconds:0,ownedIds:new Set()}));
 assert.throws(()=>validateCompetenceDiscovery({proposal:p,learningEvents:learning,elapsedSeconds:900,ownedIds:new Set([p.competenceId])}));
});
Deno.test("caller fabricated stars cannot be accepted without live source",()=>{
 const b=dispatchWorldV3Batch({expectedSaveId:"V2-S0001",jobs:[{id:"skill",operation:"capability_check",payload:{taskKind:"bow_fabrication",difficulty:20,stars:10}}]},"V2-S0001");
 assert.equal(b.results[0].result.ok,false);assert.equal(b.committed,false);
});
