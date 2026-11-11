import {
  assertNoDraftCatalogActivation,
  previewCanonicalClassChoice,
  previewCanonicalClassFeature,
  validateLegacyAbilityCollapse,
  type CandidateClassFeature,
  type CanonicalClassRequirements,
  type LegacyAbilityCandidate,
  type ObservedFeatureContext,
  type PlayerClassChoiceEvidence,
} from "../src/progression_design_gate.ts";

function rejects(f: () => unknown, name: string) {
  let threw = false;
  try { f(); } catch { threw = true; }
  if (!threw) throw new Error("Illicit progression passed " + name);
}
const spec = "spec.body.p03_012";
const root = "competence.body.physical_conditioning";
const secRoot = "competence.crafting.practical_creation";
const classId = "class.example.cargo_keeper";
const req: CanonicalClassRequirements = {
  classId,primaryCompetenceId:root,secondaryCompetenceId:secRoot,
  specializationId:spec,
  requiredEvidenceRefs:["event.training.cargo_01","event.training.variant_01"],
};
const choice: PlayerClassChoiceEvidence = {
  generalLevel:5,classPoints:1,existingOwnedClassIds:[],
  declaredClassId:classId,
  explicitDecisionRef:"player.choice.class_cargo_01",
  demonstratedEvidenceRefs:new Set(req.requiredEvidenceRefs),
  demonstratedSpecializationIds:new Set([spec]),
  knownCompetenceIds:new Set([root,secRoot]),
  actualVisibleOfferIds:new Set([classId]),
  verifiedCurrentPlayerIntentRefs:new Set(["player.choice.class_cargo_01"]),
};
const published=new Set([classId]);
const first=()=>previewCanonicalClassChoice({
  requirement:req, player:choice, publishedCanonicalClassIds:published,
});

Deno.test("P-06 collapses 644 templates into training evidence, not 644 owned powers",()=>{
  const candidates: LegacyAbilityCandidate[]=[];
  for(const [type,num] of [["stable",255],["detect",255],["transfer",134]] as const){
    for(let i=0;i<num;i++) candidates.push({
      abilityId:"ability.p03.body."+(i+1)+"."+type,
      rootId:root,specializationId:spec,pattern:type,
      promotionGate:"BLOCK_CANON_PROMOTION",
    });
  }
  const result=validateLegacyAbilityCollapse(candidates);
  if(result.totalTemplates!==644 || result.independentGrantCount!==0 ||
     result.stable!==255||result.detect!==255||result.transfer!==134)
    throw new Error("Legacy duplicates silently counted as independent abilities");
  rejects(()=>validateLegacyAbilityCollapse(candidates.slice(0,-1)),"missing original");
  rejects(()=>validateLegacyAbilityCollapse([
    ...candidates.slice(0,-1),candidates[0],
  ]),"duplicate original");
});

Deno.test("first class requires explicit real offer, decision, level five and one class point",()=>{
  const p=first();
  if(p.kind!=="FIRST_CLASS"||p.classPointCost!==1||p.mode!=="PREVIEW_ONLY")
    throw new Error("Class choice should be only a preview");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,generalLevel:2},publishedCanonicalClassIds:published,
  }),"level two");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,classPoints:0},publishedCanonicalClassIds:published,
  }),"no point");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,declaredClassId:"class.other"},publishedCanonicalClassIds:published,
  }),"unrequested class");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,actualVisibleOfferIds:new Set()},publishedCanonicalClassIds:published,
  }),"no offer");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,verifiedCurrentPlayerIntentRefs:new Set()},publishedCanonicalClassIds:published,
  }),"invented user permission");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:choice,publishedCanonicalClassIds:new Set(),
  }),"design not published");
});

Deno.test("qualifying real technique, parent roots and proof must exist",()=>{
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,knownCompetenceIds:new Set([root])},
    publishedCanonicalClassIds:published,
  }),"unknown secondary competence");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,demonstratedSpecializationIds:new Set()},
    publishedCanonicalClassIds:published,
  }),"unlearned specialty");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,demonstratedEvidenceRefs:new Set(["event.training.cargo_01"])},
    publishedCanonicalClassIds:published,
  }),"missing field practice");
});

Deno.test("secondary class not offered before General Level 10 and not already owned",()=>{
  const second=previewCanonicalClassChoice({
    requirement:req,
    player:{...choice,generalLevel:10,existingOwnedClassIds:["class.old.smith"]},
    publishedCanonicalClassIds:published,
  });
  if(second.kind!=="SECONDARY_CLASS")throw new Error("Secondary class incorrectly classified");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,generalLevel:9,existingOwnedClassIds:["class.old.smith"]},
    publishedCanonicalClassIds:published,
  }),"premature multiclass");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,generalLevel:10,existingOwnedClassIds:[classId]},
    publishedCanonicalClassIds:published,
  }),"duplicate class ownership");
  rejects(()=>previewCanonicalClassChoice({
    requirement:req,player:{...choice,generalLevel:15,existingOwnedClassIds:["class.old.one","class.old.two"]},
    publishedCanonicalClassIds:published,
  }),"unproven third-class scheme");
});

const feature: CandidateClassFeature={
  featureId:"feature.canon.cargo_balance",
  classId,
  specializationId:spec,
  type:"ACTIVE_CONTEXT",
  underlyingActionProfileId:"action.cargo_balance",
  requiredEvidenceRefs:["observation.cargo_mass","permit.cargo_rope"],
  overlapWithP04MechanicId:"mechanic.p04.body.012",
  distinctMechanicProofRef:"audit.p06.cargo_distinction",
};
const context:ObservedFeatureContext={
  chosenOwnedClassIds:new Set([classId]),
  unlockedPurchasedFeatureIds:new Set([feature.featureId]),
  demonstratedSpecializationIds:new Set([spec]),
  registeredActionProfileIds:new Set(["action.cargo_balance"]),
  observedEvidenceRefs:new Set(feature.requiredEvidenceRefs),
  approvedDistinctProofRefs:new Set([feature.distinctMechanicProofRef!]),
  elapsedSeconds:60,
  actualCurrentActionProfileId:"action.cargo_balance",
  actorExplicitActiveFeatureId:feature.featureId,
  playerMayObserveTrigger:true,
};
function featurePreview(f: CandidateClassFeature=feature,c:ObservedFeatureContext=context){
  return previewCanonicalClassFeature({
    feature:f,ctx:c,publishedCanonicalFeatureIds:new Set([feature.featureId]),
  });
}
Deno.test("paid canonical class feature only works on verified real in-world action",()=>{
  const p=featurePreview();
  if(p.resourceAccounting!=="SEMANTIC_ENGINE_ONLY"||p.xpAward!==0||
     p.mode!=="PREVIEW_ONLY")throw new Error("Preflight would duplicate resource/XP accounting");
  rejects(()=>featurePreview(feature,{...context,elapsedSeconds:0}),"zero elapsed action");
  rejects(()=>featurePreview(feature,{...context,playerMayObserveTrigger:false}),"GM-hidden knowledge");
  rejects(()=>featurePreview(feature,{...context,unlockedPurchasedFeatureIds:new Set()}),"unpaid feature");
  rejects(()=>featurePreview(feature,{...context,actorExplicitActiveFeatureId:undefined}),"GM auto activated player active ability");
  rejects(()=>featurePreview(feature,{...context,actualCurrentActionProfileId:"action.unverified"}),"wrong action profile");
  rejects(()=>featurePreview(feature,{...context,observedEvidenceRefs:new Set()}),"false material permissions");
  rejects(()=>featurePreview(feature,{...context,approvedDistinctProofRefs:new Set()}),"P04 overlap grants duplicate power");
  rejects(()=>featurePreview({...feature,featureId:"feature.draft.p05.cargo"}),"P05 draft used in live play");
});

Deno.test("legitimately passive effects don't require a deliberate extra click",()=>{
  const passive={...feature,type:"CONDITIONAL_PASSIVE" as const};
  featurePreview(passive,{...context,actorExplicitActiveFeatureId:undefined});
});

Deno.test("P06 original catalog status never grants an owned ability",()=>{
  rejects(()=>assertNoDraftCatalogActivation({
    sourceStatus:"DESIGN_CANDIDATE",
    publishedCanonId:"feature.canon.cargo_balance",
    actualCanonicalRegistryIds:new Set(["feature.canon.cargo_balance"]),
  }),"draft promoted on sight");
  rejects(()=>assertNoDraftCatalogActivation({
    sourceStatus:"CANON_APPROVED",
    publishedCanonId:"feature.draft.cargo",
    actualCanonicalRegistryIds:new Set(["feature.draft.cargo"]),
  }),"draft ID called canon");
  rejects(()=>assertNoDraftCatalogActivation({
    sourceStatus:"CANON_APPROVED",
    publishedCanonId:"feature.canon.cargo_balance",
    actualCanonicalRegistryIds:new Set(),
  }),"unpublished catalog");
  assertNoDraftCatalogActivation({
    sourceStatus:"CANON_APPROVED",
    publishedCanonId:"feature.canon.cargo_balance",
    actualCanonicalRegistryIds:new Set(["feature.canon.cargo_balance"]),
  });
});
