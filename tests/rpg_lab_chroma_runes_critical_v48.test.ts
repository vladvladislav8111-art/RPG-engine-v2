import {criticalProfile,criticalMultiplier,criticalChain} from "../src/rpg_lab_v1/chroma_critical_v48.ts";
import {runeProfile,runeBloodCost,storeHostilePain,V48_RUNE_LINES} from "../src/rpg_lab_v1/chroma_rune_profiles_v48.ts";
const eq=(a:unknown,b:unknown)=>{if(a!==b)throw Error("expected "+b+" got "+a)};
Deno.test("v4.8 critical profiles and chain boundaries",()=>{
 eq(criticalMultiplier(true),1.5);eq(criticalMultiplier(true,2),2);
 eq(criticalProfile("critical_attack",1).mp,70);eq(criticalProfile("critical_attack",5).multiplier,3);
 eq(criticalProfile("mutilation",10).strikes,10);eq(criticalProfile("mutilation",10).mp,100);
 eq(criticalChain({strikes:10},true,40,90,()=>true).length,3);
 eq(criticalChain({strikes:10},true,40,900,i=>i<2).length,2);
 eq(criticalChain({strikes:10},false,40,900,()=>true).length,0);
});
Deno.test("v4.8 all rune lines have executable profiles at every level",()=>{
 eq(V48_RUNE_LINES.length,16);
 for(const r of V48_RUNE_LINES)for(let l=1;l<=10;l++){runeProfile(r.id,l);runeProfile(r.evolution,l);}
 eq(runeProfile("minotaur_strength",1).strengthPct,5);eq(runeProfile("minotaur_strength",10).strengthPct,15);
 eq(runeBloodCost(1000,1000,10,20).loss,200);eq(runeBloodCost(1000,1000,10,20).bonusPct,40);
 eq(storeHostilePain(95,100,1000,10,false),100);
});
