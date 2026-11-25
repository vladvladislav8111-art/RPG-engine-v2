import {castV48,levelV48,practiceV48,evolveV48,v48PhysicalShield,v48Hazard,v48PainStore,v48PainRelease,v48Edge,v48Fatigue,v48Strength,v48EndBattle,validateV48Runtime} from "../src/rpg_lab_v1/chroma_runes_v48.ts";
import {v4RuneReceipt} from "../src/rpg_lab_v1/v4_rune_drop.ts";
import {applyConfirmedImpacts,readCombatCondition} from "../src/rpg_lab_v1/chroma_live_combat_status.ts";
import type {JinwooState} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
const eq=(a:unknown,b:unknown)=>{if(a!==b)throw Error("expected "+b+" got "+a)};
const state=(...skills:string[])=>({storyFlags:["chroma_crossover_v4","chroma_rules_v48"],unlockedSkills:skills,appliedRewardRefs:[],hp:1000,mp:500,fatigue:0,systemLevel:20,chromaV4Meta:{learnedSkills:skills.slice(),v48Runtime:{mastery:{}}}} as unknown as JinwooState);
Deno.test("V48 new drop odds are scoped and old drops remain compatible",()=>{
 eq(v4RuneReceipt({monsterId:"minotaur",targetRef:"mob.1",sourceRef:"kill.1"}),null);
 eq(v4RuneReceipt({monsterId:"minotaur",targetRef:"mob.1",sourceRef:"kill.1",rulesV48:true})?.chanceBasisPoints,40);
 eq(v4RuneReceipt({monsterId:"light_quartz",targetRef:"mob.2",sourceRef:"kill.2",rulesV48:true}),null);
});
Deno.test("V48 passive skill, proof practice and one-way evolution",()=>{
 const s=state("minotaur_strength","edge_sharpness");eq(v48Strength(s),5);eq(v48Edge(s,100),110.00000000000001);
 practiceV48(s,"minotaur_strength","mob.1");practiceV48(s,"minotaur_strength","mob.1");eq(s.chromaV4Meta!.v48Runtime!.mastery.minotaur_strength.uses,1);
 s.chromaV4Meta!.v48Runtime!.mastery.minotaur_strength.level=10;
 const n=evolveV48(s,{skillId:"minotaur_strength",sourceRef:"evolve.1",proofRef:"feat.1",verifiedFeat:true});eq(levelV48(n,"minotaur_strength"),0);eq(v48Strength(n),15);validateV48Runtime(n.chromaV4Meta!.v48Runtime!);
});
Deno.test("V48 shield, pain and blood do not duplicate damage",()=>{
 let s=state("physical_shield","pain_storage","blood_burning");
 s=castV48(s,{sourceRef:"shield.1",skillId:"physical_shield",minute:1,maxHp:1000});eq(s.mp,490);
 eq(v48PhysicalShield(s,80,1,"mob.1"),30);eq(v48PhysicalShield(s,80,1,"mob.1"),80);
 s=castV48(s,{sourceRef:"blood.1",skillId:"blood_burning",minute:1,maxHp:1000,hpPercent:20});eq(s.hp,800);eq(v48PainRelease(s,"mob.1"),0);
 v48PainStore(s,200,1000,"mob.1");eq(v48PainRelease(s,"mob.1"),20);eq(v48PainRelease(s,"mob.1"),0);
 v48EndBattle(s);
});
Deno.test("V48 world hazard and fatigue modifiers",()=>{
 const s=state("soft_landing","dragon_blood","body_reserve");eq(v48Hazard(s,100,"fall",1,"fall.1"),90);
 eq(v48Hazard(s,100,"heat",1,"heat.1"),90);v48Fatigue(s,10,110,"mob.1");if(s.fatigue>=10)throw Error("reserve unused");
});
Deno.test("V48 critical series accepts bounded impacts",()=>{
 const t=readCombatCondition({enemyHp:1000,enemyMaxHp:1000,physiology:"ordinary"});
 const a=Array.from({length:10},()=>({weaponId:"steel_dagger",attackLanded:true,penetrated:true,physicalDamage:10,location:"torso"}));
 eq(applyConfirmedImpacts(t,a,11).target.hp,900);
});
