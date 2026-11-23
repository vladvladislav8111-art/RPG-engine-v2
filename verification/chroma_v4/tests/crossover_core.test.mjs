import test from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForDefeat, xpToNextLevel, nextSystemLevel, projectFalna, rankUpFalna,
  updateFalnaStatus, confirmTwoWorldKill, confirmKasakaHit, tickBleeding, chooseTitle
} from '../../../src/rpg_lab_v1/crossover_core.ts';
const stats=()=>({strength:26,stamina:26,agility:32,perception:26,intelligence:22});
const ff=(n=0)=>({strength:n,endurance:n,dexterity:n,agility:n,magic:n});
const player=()=>({systemLevel:8,xp:820,gold:1020,stats:stats(),freeStatPoints:0,hp:1200,mp:300,fatigue:20,confirmedDefeats:[],confirmedRewardRefs:[],titleIds:['wolf_slayer'],activeTitle:null,runeStones:{},learnedSkills:[]});
const restore=(p)=>({hp:1000+p.stats.stamina*30,mp:300+p.stats.intelligence*12});
const mob=()=>({id:'orc',systemLevel:16,baseXp:340,systemGold:221,dungeonStoneValis:5450,magicStonePossible:true,allowedToSpawn:true});

test('exp increases without upper cap and greys return exactly 1',()=>{
 assert.equal(xpForDefeat(100,1,21),1);
 assert.equal(xpForDefeat(100,1,20),16);
 assert.equal(xpForDefeat(100,30,10),673);
 assert.ok(xpForDefeat(100,60,10)>10000);
});
test('level costs grow and Lv20 is not locked',()=>{
 assert.equal(xpToNextLevel(1),100);
 assert.ok(xpToNextLevel(20)>xpToNextLevel(8));
 const a=nextSystemLevel(player(),134171,restore);
 assert.ok(a.player.systemLevel>=19 && a.player.systemLevel<=22);
 assert.equal(a.player.freeStatPoints,a.levelsGained*5);
});
test('Falna raises newly earned layer only; older layers stay unchanged',()=>{
 const first={divineLevel:1,current:ff(990),sealedLayers:[]};
 const firstPoints=projectFalna(first,stats()).falna;
 assert.equal(firstPoints.strength,99);
 const second=rankUpFalna(first,'feat.lv1_to_2');
 assert.equal(projectFalna(second,stats()).falna.strength,99);
 const secondEarned=updateFalnaStatus(second,ff(990));
 assert.equal(projectFalna(secondEarned,stats()).falna.strength,297);
 const third=rankUpFalna(secondEarned,'feat.lv2_to_3');
 assert.equal(projectFalna(third,stats()).falna.strength,297);
 const thirdEarned=updateFalnaStatus(third,ff(990));
 assert.equal(projectFalna(thirdEarned,stats()).falna.strength,693);
 const fourth=rankUpFalna(thirdEarned,'feat.lv3_to_4');
 assert.equal(projectFalna(fourth,stats()).falna.strength,693);
 assert.equal(projectFalna(updateFalnaStatus(fourth,ff(990)),stats()).falna.strength,1485);
});
test('Falna no rank without feat and stat >= 500',()=>{
 assert.throws(()=>rankUpFalna({divineLevel:1,current:ff(499),sealedLayers:[]},'feat.a'),/D500/);
 assert.throws(()=>rankUpFalna({divineLevel:1,current:ff(900),sealedLayers:[]},''),/FEAT/);
});
test('Defeat gives XP and gold but does not auto-add extracted magic stone',()=>{
 const p=player();
 const e={sourceRef:'battle.orc.001',targetRef:'monster.orc.001',defeated:true,playerContributionConfirmed:true,monster:mob(),randomRuneRoll:.8,resources:restore};
 const result=confirmTwoWorldKill(p,e);
 assert.equal(result.system.xp,729);
 assert.equal(result.system.gold,221);
 assert.equal(result.danmachi.magicStoneRecoverable,true);
 assert.equal(result.danmachi.potentialStoneValis,5450);
 assert.equal(result.danmachi.exceliaEventRequired,true);
 assert.equal(result.player.confirmedDefeats.length,1);
 assert.equal(p.confirmedDefeats.length,0);
 assert.throws(()=>confirmTwoWorldKill(result.player,e),/DUPLICATE/);
});
test('Rune only from tagged monster and exact confirmed probability',()=>{
 const p=player();
 const m={...mob(),runeId:'barrier',runeChancePercent:.5};
 const event={sourceRef:'battle.002',targetRef:'mob.002',defeated:true,playerContributionConfirmed:true,monster:m,randomRuneRoll:.004,resources:restore};
 assert.equal(confirmTwoWorldKill(p,event).system.runeStone,'barrier');
 assert.equal(confirmTwoWorldKill(p,{...event,randomRuneRoll:.005}).system.runeStone,undefined);
});
test('Kasaka bleeding stacks, bosses are not immune by fiat',()=>{
 let boss={maxHp:10000,hp:10000,armorPenetrated:true,physiology:'large',poisonedLocations:[],bleedingWounds:[],paralyzedLocations:[]};
 const stab={hit:true,weakPoint:'none',physicalDamage:100,penetrated:true,bleedingSeconds:8,paralysisSeconds:3,hitLocation:'left_knee'};
 boss=confirmKasakaHit(boss,stab).target;
 boss=confirmKasakaHit(boss,{...stab,hitLocation:'right_arm'}).target;
 assert.equal(boss.bleedingWounds.length,2);
 assert.deepEqual(boss.paralyzedLocations.map(x=>x.location),['left_knee','right_arm']);
 const hp=boss.hp;boss=tickBleeding(boss,1);
 assert.equal(hp-boss.hp,200);
});
test('Verified brain and stone core injuries can be lethal',()=>{
 const params={hit:true,weakPoint:'brain',physicalDamage:1,penetrated:true,bleedingSeconds:1,paralysisSeconds:0,hitLocation:'head'};
 const ordinary={maxHp:100,hp:100,armorPenetrated:true,physiology:'ordinary',poisonedLocations:[],bleedingWounds:[],paralyzedLocations:[]};
 assert.equal(confirmKasakaHit(ordinary,params).target.hp,0);
 assert.equal(confirmKasakaHit({...ordinary,physiology:'stone_core'},params).target.hp,99);
});
test('Only owned title can be selected, no stacking',()=>{
 const p=chooseTitle(player(),'wolf_slayer');assert.equal(p.activeTitle,'wolf_slayer');
 assert.throws(()=>chooseTitle(p,'unknown'),/NOT_OWNED/);
});

const extra=await import('../../../src/rpg_lab_v1/crossover_core.ts');
test('Dual wield applies two independent verified strikes, not a half-damage offhand',()=>{
 const target={maxHp:500,hp:500,armorPenetrated:true,physiology:'large',poisonedLocations:[],bleedingWounds:[],paralyzedLocations:[]};
 const right={hand:'right',weaponId:'kasaka_fang',confirmedHit:true,penetrated:true,directDamage:100,weakPoint:'none',hitLocation:'right_arm',bleedSeconds:10,paralysisSeconds:3,appliesKasakaPoison:true};
 const left={...right,hand:'left',weaponId:'steel_dagger',directDamage:45,appliesKasakaPoison:false};
 const out=extra.resolveConfirmedDualWield(target,right,left);
 assert.equal(out.target.hp,355);
 assert.equal(out.target.bleedingWounds.length,1);
 assert.deepEqual(out.damagedBy,['right','left']);
});
test('Kasaka consumed venom grants physical reduction after armor and body toughness',()=>{
 const base={rawDamage:200,effectiveEndurance:36,armorSoak:20,kasakaConsumedVenomMitigation:false};
 assert.equal(extra.previewIncomingPhysicalDamage(base),168);
 assert.equal(extra.previewIncomingPhysicalDamage({...base,kasakaConsumedVenomMitigation:true}),134);
});
test('Quicksilver modifies physical speed; reaction remains independently controlled',()=>{
 const p=extra.projectBurstMotion({speedBase:40,perceptionBase:30,quicksilverMultiplier:1.8,reactionsMultiplier:1.26});
 assert.equal(p.physicalSpeed,72);
 assert.ok(p.perceivedReaction>37 && p.perceivedReaction<38);
});
const quest=await import('../../../src/rpg_lab_v1/quests_and_timeline.ts');
test('Hive quest requires 6-12 hours; unique kills grant 10/20/30 milestones once',()=>{
 let q=quest.startHiveQuest('hive.1',9,100,360);
 assert.throws(()=>quest.startHiveQuest('bad',9,100,59),/DURATION/);
 let granted=0,alarms=0;
 for(let i=0;i<30;i++){
  const result=quest.applyHiveAction(q,{kind:'ant_defeated',monsterRef:`ant.${i}`,alarmConfirmed:true,floor:9,minute:101+i});
  q=result.quest;granted+=result.attributePointsGranted;alarms+=+result.reinforcementAlarm;
 }
 assert.equal(granted,3);assert.equal(alarms,30);
 assert.equal(quest.applyHiveAction(q,{kind:'ant_defeated',monsterRef:'ant.1',alarmConfirmed:true,floor:9,minute:180}).attributePointsGranted,0);
 const nest=quest.applyHiveAction(q,{kind:'nest_destroyed',proofRef:'nest.proof.1',floor:9,minute:190});
 assert.equal(nest.quest.status,'active');
 const done=quest.applyHiveAction(nest.quest,{kind:'queen_defeated',queenRef:'queen.1',proofRef:'queen.proof.1',floor:9,minute:191});
 assert.equal(done.quest.status,'completed');
});
test('Hive abandonment or timeout fails; ordinary action does not create enemies',()=>{
 const q=quest.startHiveQuest('hive.2',9,0,360);
 assert.equal(quest.applyHiveAction(q,{kind:'leave_floor',floor:10,minute:10}).quest.status,'failed');
 assert.equal(quest.applyHiveAction(q,{kind:'time_tick',floor:9,minute:361}).quest.status,'failed');
 assert.equal(quest.applyHiveAction(q,{kind:'time_tick',floor:9,minute:10}).quest.signalCount,0);
});
test('Hestia can prepare knife before ceremony, but delivery needs a separate trigger',()=>{
 const p={id:'hestia.knife',phase:'not_started',prerequisites:['hestia.asked_hephaestus','hephaestus.accepted'],preparedAtMinute:null,deliveredAtMinute:null,logs:[]};
 const facts=['hestia.asked_hephaestus','hephaestus.accepted'];
 const prepared=quest.preparePlot(p,150,facts);
 assert.equal(prepared.phase,'prepared');
 assert.equal(prepared.preparedAtMinute,150);
 assert.equal(quest.deliverPlot(prepared,180,facts).phase,'prepared');
 assert.equal(quest.deliverPlot(prepared,180,[...facts,'scene.delivery_allowed.hestia.knife']).phase,'delivered');
 assert.equal(p.phase,'not_started');
});
test('Skill level raises relevant effect by 10-20% per rank',()=>{
 assert.ok(Math.abs(quest.skillScale(1.8,2,15)-2.07)<1e-10);
 assert.equal(quest.skillScale(1.8,1,15),1.8);
 assert.throws(()=>quest.skillScale(1.8,2,25),/INVALID/);
});

test('Rune stone must be studied before providing a learned ability',()=>{
 const c={...mob(),runeId:'healing',runeChancePercent:100};
 const event={sourceRef:'kill.rune',targetRef:'mob.rune',defeated:true,playerContributionConfirmed:true,monster:c,randomRuneRoll:0.8,resources:restore};
 const p=confirmTwoWorldKill(player(),event).player;
 assert.equal(p.runeStones.healing,1);
 assert.ok(!p.learnedSkills.includes('healing'));
 const learned=extra.studyRuneStone(p,'healing');
 assert.equal(learned.runeStones.healing,undefined);
 assert.ok(learned.learnedSkills.includes('healing'));
 assert.equal(p.runeStones.healing,1);
 assert.throws(()=>extra.studyRuneStone(learned,'healing'),/NOT_OWNED/);
});
test('Title skill is temporary, only currently selected title is active',()=>{
 const p=player();p.titleIds=['wolf_slayer','silent_path'];
 const wolf=extra.getActiveTitleEffect(extra.chooseTitle(p,'wolf_slayer'));
 assert.equal(wolf.combatStatMultiplier,1.4);
 assert.equal(wolf.bonusAgainst,'beast');
 const quiet=extra.getActiveTitleEffect(extra.chooseTitle(p,'silent_path'));
 assert.equal(quiet.temporaryTitleSkill,'silent_steps');
 assert.equal(quiet.combatStatMultiplier,1);
 assert.equal(p.activeTitle,null);
});

test('Hive time does not run backwards after an action',()=>{
 let q=quest.startHiveQuest('hive.timeline',9,100,360);
 q=quest.applyHiveAction(q,{kind:'time_tick',floor:9,minute:110}).quest;
 assert.throws(()=>quest.applyHiveAction(q,{kind:'time_tick',floor:9,minute:109}),/TIME_BACKWARD/);
});
test('Prepared item may not be delivered earlier than preparation',()=>{
 const p={id:'hestia.knife',phase:'not_started',prerequisites:[],preparedAtMinute:null,deliveredAtMinute:null,logs:[]};
 const prepared=quest.preparePlot(p,100,[]);
 assert.throws(()=>quest.deliverPlot(prepared,99,['scene.delivery_allowed.hestia.knife']),/TIME_BEFORE_PREPARATION/);
 assert.equal(quest.deliverPlot(prepared,120,['scene.delivery_allowed.hestia.knife']).phase,'delivered');
});
