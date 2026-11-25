import {criticalProfile,criticalMultiplier,criticalChain,timedMutilationChain} from "../src/rpg_lab_v1/chroma_critical_v48.ts";
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

Deno.test("Mutilation fixed timing ends on miss or death",()=>{
 for(let l=1;l<=10;l++){
  const p=criticalProfile("mutilation",l);
  const profile={strikes:p.strikes,seriesDurationMs:p.seriesDurationMs!};
  eq(profile.seriesDurationMs,300-20*(l-1));
  const full=timedMutilationChain(profile,true,1,1000,()=>true);
  eq(full.elapsedMs,profile.seriesDurationMs);eq(full.landedStrikes,p.strikes);
  const miss=timedMutilationChain(profile,false,1,1000,()=>true);
  eq(miss.landedStrikes,0);eq(miss.attemptedStrikes,1);
  const killed=timedMutilationChain(profile,true,100,1,()=>true);
  eq(killed.landedStrikes,1);eq(killed.attemptedStrikes,1);
  const interrupted=timedMutilationChain(profile,true,1,1000,i=>i!==1);
  eq(interrupted.landedStrikes,1);eq(interrupted.attemptedStrikes,2);
  eq(interrupted.elapsedMs,Math.ceil(profile.seriesDurationMs*2/profile.strikes));
 }
});
