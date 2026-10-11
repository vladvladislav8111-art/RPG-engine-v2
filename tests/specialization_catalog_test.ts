import { parseCanonicalSpecializations, runtimeDomainForCompetence, validateSpecializationAcquisition } from "../src/specialization_catalog.ts";
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

Deno.test("witness, live ownership and draft status block illicit discovery", () => {
 const header=["Canonical asset ID","Competence ID","Runtime name","Observer required","Catalog state"];
 const catalog=parseCanonicalSpecializations([header,
 ["spec.body.sleight_of_hand","competence.body.physical_conditioning","Ловкость рук","YES","UNLOCKABLE_CANON"],
 ["spec.body.coordination","competence.body.physical_conditioning","Coordination","NO","EXISTING_MAPPED"],
 ["spec.body.fake","competence.body.physical_conditioning","Fake","NO","DESIGN_CANDIDATE"]]);
 const proposal={catalogId:"spec.body.sleight_of_hand",playerIntent:"Шура учится фокусу с монетой",
 trainingEvidence:"The observed coin concealment was corrected using actual viewer feedback",
 evidenceRef:"training.day64.verified",observerNpcId:"npc.witness"};
 const learning=[{competenceId:"competence.body.physical_conditioning",specialization:"Ловкость рук",
 productiveMinutes:15,reason:"A real observer corrected hand motion through repeatable attempts"}];
 const input={catalog,proposal,learningEvents:learning,elapsedSeconds:900,
 presentObserverNpcIds:["npc.witness"],existingSpecializations:[]};
 const rejects=(fn:()=>unknown)=>{let denied=false;try{fn();}catch{denied=true;}if(!denied)throw new Error("Unsafe unlock was accepted");};
 validateSpecializationAcquisition(input);
 rejects(()=>validateSpecializationAcquisition({...input,presentObserverNpcIds:[]}));
 rejects(()=>validateSpecializationAcquisition({...input,existingSpecializations:[{
 competenceId:"competence.body.physical_conditioning",runtimeName:"Ловкость рук"}]}));
 rejects(()=>validateSpecializationAcquisition({...input,learningEvents:[]}));
 rejects(()=>validateSpecializationAcquisition({...input,proposal:{...proposal,catalogId:"spec.body.coordination"}}));
 rejects(()=>validateSpecializationAcquisition({...input,proposal:{...proposal,catalogId:"spec.body.fake"}}));
 rejects(()=>validateSpecializationAcquisition({...input,proposal:{...proposal,trainingEvidence:"a guess"}}));
});

Deno.test("all seven live competence roots map to their canonical specialization domains", () => {
  const expected: Record<string,string> = {
    "competence.body.physical_conditioning":"body",
    "competence.combat.melee":"combat",
    "competence.crafting.practical_creation":"crafting",
    "competence.survival.general":"survival",
    "competence.knowledge.research":"knowledge",
    "competence.society.communication":"society",
    "competence.magic.perception":"magic",
  };
  for (const [root, domain] of Object.entries(expected)) {
    if(runtimeDomainForCompetence(root)!==domain)throw new Error("Wrong domain for "+root);
  }
  let denied=false;
  try { runtimeDomainForCompetence("competence.magic.some_future_unregistered_root"); }
  catch { denied=true; }
  if(!denied)throw new Error("Unknown competence silently routed");
});
