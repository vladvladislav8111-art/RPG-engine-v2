import {armorAbsorption,weaponSharpness,usesSharpnessRules} from "../src/rpg_lab_v1/chroma_sharpness_v48.ts";
import catalog from "../src/data/monster_adapter_v4.json" with {type:"json"};
const eq=(a:unknown,b:unknown)=>{if(a!==b)throw Error("expected "+b+" got "+a)};
Deno.test("v4.8 sharpness reference and clamp",()=>{
 eq(weaponSharpness("kasaka_fang"),100);eq(weaponSharpness("steel_dagger"),50);
 eq(armorAbsorption(20,100),32);eq(armorAbsorption(20,50),64);
 eq(armorAbsorption(20,200),16);eq(armorAbsorption(20,300),16);
 eq(armorAbsorption(20,1),64);eq(armorAbsorption(20,null),32);
 eq(armorAbsorption(0,100),0);
});
Deno.test("v4.8 all combat catalog entries explicitly classify edge attacks",()=>{
 for(const card of catalog.monsters){
  if(!Object.hasOwn(card,"attackSharpness"))throw Error("missing "+card.id);
  if(card.attackSharpness!==null&&(!Number.isFinite(card.attackSharpness)||card.attackSharpness<=0))throw Error("invalid "+card.id);
 }
});
Deno.test("v4.8 must be explicitly enabled and Chroma-scoped",()=>{
 eq(usesSharpnessRules([]),false);eq(usesSharpnessRules(["chroma_crossover_v4"]),false);
 eq(usesSharpnessRules(["chroma_rules_v48"]),false);
 eq(usesSharpnessRules(["chroma_crossover_v4","chroma_rules_v48"]),true);
});
