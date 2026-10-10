import { parseCanonicalSpecializations, validateSpecializationAcquisition } from "../src/specialization_catalog.ts";
Deno.test("canonical paths are gated before first learning", () => {
 const columns=["Canonical asset ID","Competence ID","Runtime name","Observer required","Catalog state"];
 const records=[columns,
  ["spec.body.hand","competence.body.physical_conditioning","Ловкость рук","YES","UNLOCKABLE_CANON"],
  ["spec.body.draft","competence.body.physical_conditioning","Неактивный","NO","DESIGN_CANDIDATE"]];
 const c=parseCanonicalSpecializations(records);
 if(c.length!==2)throw new Error("registry decode changed");
 const proposal={catalogId:"spec.body.hand",playerIntent:"Шура тренирует ловкость рук",
  trainingEvidence:"Observed real practice and corrected the mistake over several trials",
  evidenceRef:"session.day64.real_test",observerNpcId:"npc.witness"};
 const learning=[{competenceId:"competence.body.physical_conditioning",specialization:"Ловкость рук",
   productiveMinutes:20,reason:"Observed method correction and repeated measured improvement"}];
 const valid={catalog:c,proposal,learningEvents:learning,elapsedSeconds:1200,
   presentObserverNpcIds:["npc.witness"],existingSpecializations:[]};
 validateSpecializationAcquisition(valid);
 let denied=false;try{validateSpecializationAcquisition({...valid,elapsedSeconds:0});}catch{denied=true;}
 if(!denied)throw new Error("A zero-time unlock passed");
});
