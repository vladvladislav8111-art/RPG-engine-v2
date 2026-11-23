import {freshChromaPalette} from "../src/rpg_lab_v1/chroma_palette.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {newOrarioPlayerAwakening,xpToNextLevel,shopAvailable} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {stageChromaV4} from "../src/rpg_lab_v1/legacy_lab_adapter.ts";
import type {LiveV46Save} from "../src/rpg_lab_v1/rune_title_actions_v46.ts";
import type {JinwooState} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {newOrarioHeroProfile} from "../src/rpg_lab_v1/orario_player_hero.ts";
import {applyOrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import {validateOrarioPlayerState} from "../src/rpg_lab_v1/orario_player_validation.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import {boundedChildRef} from "../src/rpg_lab_v1/event_child_refs.ts";
import {previewVerifiedLoadout} from "../src/rpg_lab_v1/danmachi_player_equipment.ts";
import {exportLabProjectBackup,restoreProjectBackupToEmptyKv,validateProjectBackup} from "../src/rpg_lab_v1/project_backup.ts";
import {encodeLabPack} from "../src/rpg_lab_v1/storage_codec.ts";
import {encodeLabSession} from "../src/rpg_lab_v1/session_storage.ts";
import {commitLabCampaignEventInKv,handleRpgLabHttp} from "../src/rpg_lab_v1/http.ts";
const projectId="chroma_orario_main_20261120",sessionId="chroma_day0_20261120";
const fixture=():LabSession=>{
 const old=newOrarioPlayerAwakening();old.awaitingActivation=false;
 const staged=stageChromaV4(old as unknown as LiveV46Save) as unknown as JinwooState;
 return {schema:"RPG_LAB_SESSION_V1",projectId,sessionId,gameClock:"D4 13:44",
  player:{resources:{},stats:{},inventory:{},locationId:"orario.gate",
   chromaPalette:freshChromaPalette(),hero:{...newOrarioHeroProfile(),id:"hero.chroma"},jinwoo:staged},
  discovered:["orario.gate"],npcs:{},events:[],worldEvents:[]};
};
test("v47 authoritative action accepts current title choice, rejects override and foreign campaign",()=>{
 const s=fixture();s.player.jinwoo!.chromaV4Meta!.titleIds=["wolf_slayer"];
 const action={kind:"equip_title",playerApproved:true,args:{titleId:"wolf_slayer"}};
 const n=applyOrarioPlayerAction(s,action,"evt.v47.equip","D4 13:44");
 assert.equal(n.chromaV4Meta!.activeTitle,"wolf_slayer");validateOrarioPlayerState(n);
 assert.throws(()=>applyOrarioPlayerAction(s,{...action,args:{titleId:"wolf_slayer",proofRef:"forged"}},"evt.v47.fake",s.gameClock),/OVERRIDE/);
 assert.throws(()=>applyOrarioPlayerAction({...s,sessionId:"foreign"},action,"evt.foreign",s.gameClock),/WRONG_CAMPAIGN/);
 assert.throws(()=>applyOrarioPlayerAction(s,{...action,playerApproved:false},"evt.no",s.gameClock),/NOT_PLAYER_APPROVED/);
});
test("client story flags and backup boolean cannot authorize migration",()=>{
 const s=fixture();s.player.jinwoo=newOrarioPlayerAwakening();s.player.jinwoo.awaitingActivation=false;
 s.player.jinwoo.storyFlags.push("chroma.v4.backup.snapshot_verified");
 assert.throws(()=>applyOrarioPlayerAction(s,{kind:"chroma_v4_migrate",playerApproved:true,args:{confirmedBackup:true}},"evt.migrate",s.gameClock),/BACKUP_RECEIPT_REQUIRED/);
});
test("bounded child refs accept maximum event length and preserve short legacy refs",()=>{
 const p="e".repeat(80);for(const [prefix,suffix] of [["",".wound"],["wound.",""]]){
  const child=boundedChildRef(p,prefix,suffix);assert.ok(child.length<=80);assert.match(child,/^[A-Za-z_][A-Za-z0-9_.:-]*$/);
 }
 assert.notEqual(boundedChildRef(p,"",".wound"),boundedChildRef(p,"wound.",""));
 assert.equal(boundedChildRef("evt.short","",".wound"),"evt.short.wound");
});
test("steel dagger ownership cannot be fabricated by narrative flags",()=>{
 const n=fixture().player.jinwoo!;
 n.storyFlags.push("chroma.dual_daggers.verified","chroma.equipment.kasaka_fang_right");
 assert.throws(()=>previewVerifiedLoadout(n,{weaponId:"steel_dagger"}),/NOT_OWNED/);
 n.inventory.steel_dagger=1;assert.equal(previewVerifiedLoadout(n,{weaponId:"steel_dagger"}).attack,0);
});
test("live XP thresholds retain approved legacy curve for all levels",()=>{
 for(let l=1;l<=10000;l++)assert.equal(xpToNextLevel(l,true),Math.ceil(100*l**1.5));
});
test("project backup retains binary chunks, immutable events and excludes Shura; restore refuses live KV",async()=>{
 const src=await Deno.openKv(":memory:"),dest=await Deno.openKv(":memory:");
 try{
  await src.set(["legacy","Shura"],{gold:123});
  await src.set(["rpg-lab-v1","projects",projectId],{revision:1});
  await src.set(["rpg-lab-v1","sessions",projectId,sessionId],{revision:788});
  await src.set(["rpg-lab-v1","session_chunks",projectId,sessionId,"hash",0],new Uint8Array([0,255,34]));
  await src.set(["rpg-lab-v1","event_refs",projectId,sessionId,"ancient.proof"],{revision:4,event:{kind:"proof"}});
  const b=await exportLabProjectBackup(src,projectId,sessionId);
  assert.equal(b.entries.length,4);assert.equal(b.revision,788);
  await assert.rejects(()=>restoreProjectBackupToEmptyKv(src,b),/EMPTY_KV/);
  assert.equal((await restoreProjectBackupToEmptyKv(dest,b)).verified,true);
  assert.deepEqual((await dest.get(["rpg-lab-v1","session_chunks",projectId,sessionId,"hash",0])).value,new Uint8Array([0,255,34]));
  assert.equal((await dest.get(["legacy","Shura"])).value,null);
  const bad=structuredClone(b);bad.revision++;await assert.rejects(()=>validateProjectBackup(bad),/DIGEST/);
 }finally{src.close();dest.close();}
});
test("real KV CAS commits immutable event, rejects duplicate and stale revision, leaves Shura untouched",async()=>{
 const kv=await Deno.openKv(":memory:");
 try{
  const pack=buildFreshDanmachiLabPack(projectId),s=fixture();
  await kv.set(["legacy","Shura"],{gold:123});
  await kv.set(["rpg-lab-v1","projects",projectId],await encodeLabPack(pack,1));
  await kv.set(["rpg-lab-v1","sessions",projectId,sessionId],await encodeLabSession(s,pack,1));
  const event={sourceRef:"evt.v47.cas",time:s.gameClock,kind:"player_turn",summary:"Выбор титула",knownBy:[],gmConfirmed:true as const,
   playerSystem:{kind:"equip_title",playerApproved:true,args:{titleId:null}}};
  const args={projectId,sessionId,expectedRevision:1,event};
  const failingKv={get:kv.get.bind(kv),atomic:()=>{
   const tx=kv.atomic();tx.commit=async()=>({ok:false});return tx;
  }} as unknown as Deno.Kv;
  await assert.rejects(()=>commitLabCampaignEventInKv(failingKv,args),/REVISION_CONFLICT/);
  assert.equal((await kv.get<{revision:number}>(["rpg-lab-v1","sessions",projectId,sessionId])).value!.revision,1);
  assert.equal((await kv.get(["rpg-lab-v1","event_refs",projectId,sessionId,event.sourceRef])).value,null);
  const url=new URL(`http://local.invalid/rpg-lab/v1/projects/${projectId}/sessions/${sessionId}/events`);
  const request=new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedRevision:1,event})});
  const response=await handleRpgLabHttp(request,url,a=>commitLabCampaignEventInKv(kv,a),async()=>kv);
  assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,args),/REVISION_CONFLICT/);
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{...args,expectedRevision:2}),/ALREADY_APPLIED/);
  assert.deepEqual((await kv.get(["legacy","Shura"])).value,{gold:123});
  assert.ok((await kv.get(["rpg-lab-v1","event_refs",projectId,sessionId,event.sourceRef])).value);
 }finally{kv.close();}
});

test("v4 store is gated by System Lv20, legacy store stays compatible",()=>{
 const n=fixture().player.jinwoo!;n.systemLevel=19;assert.equal(shopAvailable(n),false);
 n.systemLevel=20;assert.equal(shopAvailable(n),true);
 n.storyFlags=n.storyFlags.filter(x=>x!=="chroma_crossover_v4");n.systemLevel=1;assert.equal(shopAvailable(n),true);
});
test("archived achievement is resolved by campaign KV, with prior revision and time",async()=>{
 const kv=await Deno.openKv(":memory:");
 try{
  const pack=buildFreshDanmachiLabPack(projectId),s=fixture();
  s.player.jinwoo!.storyFlags.push("title.v46.wolf_slayer.earned");
  await kv.set(["rpg-lab-v1","projects",projectId],await encodeLabPack(pack,1));
  await kv.set(["rpg-lab-v1","sessions",projectId,sessionId],await encodeLabSession(s,pack,10));
  const proof={sourceRef:"evt.old.achievement",time:"D1 10:00",kind:"title_grant_proof.wolf_slayer",summary:"Подтверждено ранее",knownBy:[],gmConfirmed:true as const};
  await kv.set(["rpg-lab-v1","event_refs",projectId,sessionId,proof.sourceRef],{revision:2,event:proof});
  const event={sourceRef:"evt.new.title",time:s.gameClock,kind:"player_turn",summary:"Получение заработанного титула",knownBy:[],gmConfirmed:true as const,
   playerSystem:{kind:"title_grant",playerApproved:true,args:{titleId:"wolf_slayer",proofRef:proof.sourceRef}}};
  assert.equal((await commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:10,event})).revision,11);
  const next={...event,sourceRef:"evt.title.future",playerSystem:{...event.playerSystem,args:{...event.playerSystem.args,proofRef:"evt.future"}}};
  await kv.set(["rpg-lab-v1","event_refs",projectId,sessionId,"evt.future"],{revision:12,event:{...proof,sourceRef:"evt.future"}});
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:11,event:next}),/HISTORIC_PROOF_NOT_FOUND/);
 }finally{kv.close();}
});
test("System instance aliases use v4 catalog and preserve existing encounter identity",async()=>{
 const {monsterForPlayer}=await import("../src/rpg_lab_v1/danmachi_player_balance.ts");
 const n=fixture().player.jinwoo!;
 assert.throws(()=>monsterForPlayer(n,"system.kasaka",{floor:1,monsterRef:"mob.kasaka"}),/INSTANCE_PROOF/);
 n.dungeonKeys["instant.first"]={id:"instant.first",issuedRef:"key.earned",state:"entered"};
 const mob=monsterForPlayer(n,"system.kasaka",{floor:1,monsterRef:"mob.kasaka"});
 assert.equal(mob.id,"system.kasaka");assert.ok(mob.hp>0);assert.equal(mob.floorMin,1);
 const {startConfirmedOrarioBattle}=await import("../src/rpg_lab_v1/orario_player_combat.ts");
 const battle=startConfirmedOrarioBattle(n,{sourceRef:"evt.kasaka.start",monsterId:"system.kasaka",monsterRef:"mob.kasaka",floor:1,playerCommitted:true,confirmedHostile:true});
 assert.equal(battle.activeEncounter!.enemyHp,mob.hp);
});
test("authoritative rune healing charges MP and rejects insufficient MP and opaque clock",()=>{
 const s=fixture(),n=s.player.jinwoo!;
 n.chromaV4Meta!.learnedSkills=["minor_healing"];n.unlockedSkills=["minor_healing"];
 n.hp=200;n.mp=0;
 const a={kind:"rune_cast",playerApproved:true,args:{skillId:"minor_healing",target:"self"}};
 assert.throws(()=>applyOrarioPlayerAction(s,a,"evt.heal.fail",s.gameClock),/MP/);
 n.mp=100;
 const healed=applyOrarioPlayerAction(s,a,"evt.heal.ok",s.gameClock);
 assert.ok(healed.hp>n.hp);assert.ok(healed.mp<n.mp);
 assert.throws(()=>applyOrarioPlayerAction(s,a,"evt.heal.clock","sometime"),/CLOCK/);
 assert.equal(n.hp,200);assert.equal(n.mp,100);
});
test("new catalog material search uses species proof, rolls once and never credits Valis or XP",async()=>{
 const {recordConfirmedMonsterDrop}=await import("../src/rpg_lab_v1/orario_player_loot.ts");
 const n=fixture().player.jinwoo!,ref="mob.new.papilio";
 n.defeatedTargetRefs.push(ref);n.defeatEvidence={[ref]:{monsterId:"blue_papilio",floor:25,sourceRef:"evt.kill.papilio"}};
 n.appliedRewardRefs.push("evt.kill.papilio");
 const action={sourceRef:"evt.material.search",monsterId:"blue_papilio",monsterRef:ref,confirmedDefeat:true as const,confirmedSearch:true as const};
 const r=recordConfirmedMonsterDrop(n,action);
 assert.equal(r.next.valis,n.valis);assert.equal(r.next.xp,n.xp);assert.equal(r.next.gold,n.gold);
 assert.equal(Object.keys(r.next.magicStones).length,0);
 assert.throws(()=>recordConfirmedMonsterDrop(r.next,{...action,sourceRef:"evt.material.twice"}),/NOT_EARNED|ALREADY/);
 assert.throws(()=>recordConfirmedMonsterDrop(n,{...action,monsterId:"goblin"}),/PROOF/);
});
test("bundled backup attestation binds full state, pack and exact revision",async()=>{
 const {migrationStateHash,receiptForVerifiedSnapshot}=await import("../src/rpg_lab_v1/verified_chroma_backup.ts");
 const s=fixture(),pack=buildFreshDanmachiLabPack(projectId);
 const cert={projectId,sessionId,revision:1,packRevision:1,sha256:"a".repeat(64),
  sessionSha256:await migrationStateHash(s),packSha256:await migrationStateHash(pack)};
 assert.equal((await receiptForVerifiedSnapshot(s,pack,1,1,cert)).restoreVerified,true);
 await assert.rejects(()=>receiptForVerifiedSnapshot(s,pack,2,1,cert),/SNAPSHOT_CHANGED/);
 const changed=structuredClone(s);changed.player.jinwoo!.xp++;
 await assert.rejects(()=>receiptForVerifiedSnapshot(changed,pack,1,1,cert),/SNAPSHOT_CHANGED/);
 await assert.rejects(()=>receiptForVerifiedSnapshot(s,pack,1,1),/SNAPSHOT_CHANGED/);
});
test("migration atomically stores rollback head and rollback cannot erase later gameplay",async()=>{
 const {CHROMA_BALANCE_FLAG}=await import("../src/rpg_lab_v1/shadow_monarch_rules.ts");
 const {decodeLabSessionFromKv}=await import("../src/rpg_lab_v1/session_kv.ts");
 const kv=await Deno.openKv(":memory:");
 try{
  const pack=buildFreshDanmachiLabPack(projectId),s=fixture();
  s.player.jinwoo=newOrarioPlayerAwakening();s.player.jinwoo.awaitingActivation=false;
  s.player.jinwoo.storyFlags.push(CHROMA_BALANCE_FLAG);s.player.jinwoo.hp=100;s.player.jinwoo.mp=10;
  s.gmPostCadence={count:99,lastPostRef:"gm.post.99",recentPostRefs:["gm.post.99"]};
  const key=["rpg-lab-v1","sessions",projectId,sessionId];
  await kv.set(["rpg-lab-v1","projects",projectId],await encodeLabPack(pack,1));
  await kv.set(key,await encodeLabSession(s,pack,1));
  await kv.set(["rpg-lab-v1","migration_backups",projectId,sessionId],{
   schema:"CHROMA_BACKUP_VERIFIED_V1",projectId,sessionId,revision:1,sha256:"a".repeat(64),fullSnapshot:true,restoreVerified:true});
  const e={sourceRef:"evt.metadata.migration",time:s.gameClock,kind:"schema_migration",summary:"Миграция схемы",knownBy:[],gmConfirmed:true as const,
   playerSystem:{kind:"chroma_v4_migrate",playerApproved:true,args:{confirmedBackup:true}}};
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:1,event:{...e,effects:{resources:{money:999}}}}),/METADATA_ONLY/);
  assert.equal((await commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:1,event:e})).revision,2);
  assert.ok((await kv.get(["rpg-lab-v1","migration_restore_points",projectId,sessionId])).value);
  const rollback={...e,sourceRef:"evt.metadata.rollback",kind:"schema_rollback",playerSystem:{kind:"chroma_v4_rollback",playerApproved:true,args:{}}};
  const advanced=await kv.get<Record<string,unknown>>(key);await kv.set(key,{...advanced.value!,revision:3});
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:3,event:rollback}),/NOT_AT_MIGRATION_REVISION/);
  await kv.set(key,advanced.value!);
  assert.equal((await commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:2,event:rollback})).revision,3);
  const result=await decodeLabSessionFromKv(kv,projectId,sessionId,(await kv.get(key)).value as any,pack);
  assert.deepEqual(result.player,s.player);assert.deepEqual(result.gmPostCadence,s.gmPostCadence);
  assert.deepEqual(result.npcs,s.npcs);assert.equal(result.gameClock,s.gameClock);
  assert.ok((await kv.get(["rpg-lab-v1","event_refs",projectId,sessionId,e.sourceRef])).value);
  await assert.rejects(()=>commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:3,event:{...rollback,sourceRef:"evt.metadata.again"}}),/NOT_AT_MIGRATION_REVISION/);
 }finally{kv.close();}
});
