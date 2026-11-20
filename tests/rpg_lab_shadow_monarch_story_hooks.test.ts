import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {previewJinwooNarrativeHooks,JINWOO_STORY_HOOKS} from
 "../src/rpg_lab_v1/shadow_monarch_story_hooks.ts";

test("Day zero Bell rescue and shop produce only GM review prompts, not events or memories",()=>{
 const s=newJinwooPreparation();const prior=JSON.stringify(s);
 const x=previewJinwooNarrativeHooks(s,["first_minotaur","shop","guild"]);
 const ids=x.hooks.map(y=>y.id);
 for(const id of ["bell.aiz.rescue","shop.currency","guild.status"])
  assert.ok(ids.includes(id));
 assert.equal(x.readOnly,true);assert.equal(x.gmOnly,true);
 assert.equal(x.noAutomaticEvents,true);assert.equal(x.noNpcKnowledgeGrant,true);
 assert.equal(JSON.stringify(s),prior);
 assert.ok(x.hooks.every(h=>h.playerVisibleOnTrigger===false));
});
test("Class and extraction story hooks cannot show before unlocked ability",()=>{
 const s=newJinwooPreparation();
 assert.equal(previewJinwooNarrativeHooks(s,["magic_stone"]).hooks.length,0);
 const phase={...s,phase:"shadow_class" as const};
 assert.equal(previewJinwooNarrativeHooks(phase,["magic_stone"]).hooks.length,0);
 const enabled={...phase,unlockedSkills:["shadow_extraction"]};
 const x=previewJinwooNarrativeHooks(enabled,["magic_stone","sentient_monster"]);
 const ids=x.hooks.map(h=>h.id);
 assert.ok(ids.includes("shadow.magic_stone"));
 assert.ok(ids.includes("xenos.first_contact"));
 assert.ok(x.hooks.find(h=>h.id==="xenos.first_contact")
  ?.continuityGuard.includes("не знают событий будущих"));
});
test("True Monarch with canonical vanished System is not offered old shop/daily quests",()=>{
 const s=newJinwooPreparation({phase:"true_monarch"});
 const result=previewJinwooNarrativeHooks(s,["daily","shop","full_power","job_change"]);
 const ids=result.hooks.map(h=>h.id);
 assert.ok(ids.includes("monarch.succession"));
 assert.equal(ids.includes("shop.currency"),false);
 assert.equal(ids.includes("daily.deadline"),false);
 assert.equal(ids.includes("class.trial"),false);
 const au={...s,postAscensionInterface:"crossover_persists" as const};
 const auIds=previewJinwooNarrativeHooks(au,["shop","daily"]).hooks.map(h=>h.id);
 assert.ok(auIds.includes("shop.currency"));
 assert.ok(auIds.includes("daily.deadline"));
});
test("Hook triggers are bounded, do not fabricate origin or named shadows",()=>{
 assert.ok(JINWOO_STORY_HOOKS.length>=15);
 const n=newJinwooPreparation();
 assert.deepEqual(previewJinwooNarrativeHooks(n,[]).hooks,[]);
 assert.throws(()=>previewJinwooNarrativeHooks(n,[";hack"]),/TRIGGER_INVALID/);
 const x=previewJinwooNarrativeHooks(n,["shadow_naming"]);
 assert.equal(x.hooks.length,0);
});
