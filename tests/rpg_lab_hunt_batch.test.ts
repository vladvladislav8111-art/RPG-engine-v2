import test from "node:test";
import assert from "node:assert/strict";
import {freshChromaPalette} from "../src/rpg_lab_v1/chroma_palette.ts";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {newOrarioPlayerAwakening,effectiveJinwooMaxHp,effectiveJinwooMaxMp,type JinwooState} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {stageChromaV4} from "../src/rpg_lab_v1/legacy_lab_adapter.ts";
import type {LiveV46Save} from "../src/rpg_lab_v1/rune_title_actions_v46.ts";
import {newOrarioHeroProfile} from "../src/rpg_lab_v1/orario_player_hero.ts";
import {applyOrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import {runChromaHuntBatch} from "../src/rpg_lab_v1/hunt_batch.ts";
import {validateOrarioPlayerState} from "../src/rpg_lab_v1/orario_player_validation.ts";
import {commitLabCampaignEventInKv} from "../src/rpg_lab_v1/http.ts";
import {encodeLabPack} from "../src/rpg_lab_v1/storage_codec.ts";
import {encodeLabSession} from "../src/rpg_lab_v1/session_storage.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
const projectId="chroma_orario_main_20261120",sessionId="chroma_day0_20261120";
const fixture=():LabSession=>{
 const old=newOrarioPlayerAwakening();old.awaitingActivation=false;
 old.systemLevel=10;old.stats={strength:28,stamina:28,agility:45,perception:40,intelligence:24};
 old.storyFlags.push("chroma_falna_v2","chroma.dual_daggers.verified","chroma.equipment.kasaka_fang_right");
 old.inventory={steel_dagger:1,dagger_hardened:1};
 old.unlockedSkills=["quicksilver","dagger_mastery","combat_evasion"];
 old.hp=effectiveJinwooMaxHp(old);old.mp=effectiveJinwooMaxMp(old);
 const n=stageChromaV4(old as unknown as LiveV46Save) as unknown as JinwooState;
 n.hp=effectiveJinwooMaxHp(n);n.mp=effectiveJinwooMaxMp(n);
 return {schema:"RPG_LAB_SESSION_V1",projectId,sessionId,gameClock:"D4 18:18",
  player:{resources:{},stats:{},inventory:{},locationId:"orario.dungeon.upper",
   chromaPalette:freshChromaPalette(),hero:{...newOrarioHeroProfile(),id:"hero.chroma"},jinwoo:n},
  discovered:["orario.dungeon.upper"],npcs:{},events:[],worldEvents:[]};
};
const options={floor:9,durationMinutes:60,weaponId:"dagger_hardened",baitWeaponId:"steel_dagger",
 collectStones:true,includeOtherMonsters:true};
test("hunt preview is deterministic, finite, uses real child rewards and leaves input untouched",()=>{
 const s=fixture(),before=structuredClone(s),ref="test.hunt.chain";
 const a=runChromaHuntBatch(s,ref,options,applyOrarioPlayerAction);
 const b=runChromaHuntBatch(s,ref,options,applyOrarioPlayerAction);
 assert.deepEqual(s,before);assert.deepEqual(a,b);
 validateOrarioPlayerState(a.next);
 const r=a.receipt,encounters=r.blocks.flatMap(b=>b.encounters);
 assert.ok(r.totals.kills>0);assert.ok(r.totals.kills<=48);
 assert.equal(r.totals.kills,encounters.filter(x=>x.outcome==="victory").length);
 assert.equal(r.totals.stones,Object.keys(a.next.magicStones).length);
 assert.equal(r.totals.gold,a.next.gold-s.player.jinwoo!.gold);
 assert.equal(r.totals.exchanges,encounters.reduce((n,x)=>n+x.exchangeCount,0));
 for(const e of encounters.filter(e=>e.outcome==="victory")){
  assert.ok(e.defeatRef&&a.next.appliedRewardRefs.includes(e.defeatRef));
  assert.equal(a.next.defeatEvidence![e.targetRef].sourceRef,e.defeatRef);
  assert.ok(e.stoneRef&&a.next.appliedRewardRefs.includes(e.stoneRef));
 }
 assert.equal(new Set(a.next.defeatedTargetRefs).size,a.next.defeatedTargetRefs.length);
 assert.equal(new Set(a.next.appliedRewardRefs).size,a.next.appliedRewardRefs.length);
 assert.ok(r.blocks.length<=6);
 const committed=applyOrarioPlayerAction(s,{kind:"hunt_batch",playerApproved:true,args:options},ref,r.endClock);
 assert.deepEqual(committed,a.next);
 assert.throws(()=>applyOrarioPlayerAction(s,{kind:"hunt_batch",playerApproved:true,args:options},ref,"D4 23:59"),/HUNT_END_CLOCK_MISMATCH/);
 assert.throws(()=>runChromaHuntBatch({...s,gameClock:r.endClock,player:{...s.player,jinwoo:a.next}},ref,options,applyOrarioPlayerAction),/NOT_READY/);
});
test("hunt rejects forged rewards, incompatible floors, unowned gear and false approval",()=>{
 const s=fixture();
 assert.throws(()=>runChromaHuntBatch(s,"test.forged",{...options,xp:999999},applyOrarioPlayerAction),/HUNT_OPTION_UNKNOWN/);
 assert.throws(()=>runChromaHuntBatch(s,"test.floor",{...options,floor:20},applyOrarioPlayerAction),/HUNT_ANT_FLOOR_INVALID/);
 assert.throws(()=>runChromaHuntBatch(s,"test.weapon",{...options,weaponId:"kasaka_fang"},applyOrarioPlayerAction),/NOT_OWNED/);
 assert.throws(()=>applyOrarioPlayerAction(s,{kind:"hunt_batch",playerApproved:false,args:options},"test.no","D4 19:18"),/NOT_PLAYER_APPROVED/);
 s.player.jinwoo!.hp=1;
 assert.throws(()=>runChromaHuntBatch(s,"test.low",options,applyOrarioPlayerAction),/HUNT_STOP_BEFORE_START:hp/);
});
test("real KV batch commit is atomic and retains immutable receipt",async()=>{
 const kv=await Deno.openKv(":memory:");
 try{
  const s=fixture(),pack=buildFreshDanmachiLabPack(projectId),ref="test.hunt.cas";
  const q={...options,durationMinutes:10};
  await kv.set(["legacy","Shura"],{gold:123});
  await kv.set(["rpg-lab-v1","projects",projectId],await encodeLabPack(pack,1));
  await kv.set(["rpg-lab-v1","sessions",projectId,sessionId],await encodeLabSession(s,pack,1));
  const preview=runChromaHuntBatch(s,ref,q,applyOrarioPlayerAction).receipt;
  const event={sourceRef:ref,time:preview.endClock,kind:"player_turn",summary:"Охота пакетом",
    knownBy:[],gmConfirmed:true as const,playerSystem:{kind:"hunt_batch",playerApproved:true,args:q}};
  const args={projectId,sessionId,expectedRevision:1,event};
  const failing={get:kv.get.bind(kv),atomic:()=>{const tx=kv.atomic();tx.commit=async()=>({ok:false});return tx;}} as unknown as Deno.Kv;
  await assert.rejects(()=>commitLabCampaignEventInKv(failing,args),/REVISION_CONFLICT/);
  assert.equal((await kv.get(["rpg-lab-v1","event_refs",projectId,sessionId,ref])).value,null);
  const committed=await commitLabCampaignEventInKv(kv,args);
  assert.equal(committed.revision,2);assert.deepEqual(committed.huntReceipt,preview);
  const stored=await kv.get<{huntReceipt:unknown}>(["rpg-lab-v1","event_refs",projectId,sessionId,ref]);
  assert.deepEqual(stored.value!.huntReceipt,preview);
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{...args,expectedRevision:2}),/ALREADY_APPLIED/);
  assert.deepEqual((await kv.get(["legacy","Shura"])).value,{gold:123});
 }finally{kv.close();}
});
