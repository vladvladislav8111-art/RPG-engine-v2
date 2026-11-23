import test from 'node:test';
import assert from 'node:assert/strict';
import {stageChromaV4} from '../../../src/rpg_lab_v1/legacy_lab_adapter.ts';
import {applyVerifiedV46RuneCast,applyVerifiedV46EquipTitle,applyVerifiedV46TitleGrant,
 applyVerifiedV46RuneChallenge,readV46AbilityStatus} from '../../../src/rpg_lab_v1/rune_title_actions_v46.ts';
const base=()=>({systemLevel:8,xp:820,gold:1020,freeStatPoints:0,
 stats:{strength:26,stamina:26,agility:32,perception:26,intelligence:22},
 hp:700,mp:245,fatigue:3,appliedRewardRefs:[],defeatedTargetRefs:[],
 falna:{blessed:true,godId:'npc.loki',divineLevel:1,lastUpdatedRef:'god.first',
 status:{strength:47,endurance:31,dexterity:81,agility:96,magic:0},skills:[]},
 storyFlags:[],inventory:{kasaka_fang:1}});
const hero=()=>stageChromaV4(base());
const battle=()=>({...hero(),activeEncounter:{enemyRef:'mob.ant.001',monsterId:'killer_ant',
 floor:8,enemyHp:660,round:1,startedRef:'battle.ant.001'}});
const host={verifyAction:()=>true,getMaxHp:()=>1000,getMaxMp:()=>350,
 getEffectiveIntelligence:()=>22,
 getEnemyStats:()=>({maxHp:660,armor:13,strength:45,
 magicResistancePct:5,size:'medium',poisonImmune:false}),
 confirmRuneHit:()=>true,verifyTitleClear:()=>true,verifyChallengeClear:()=>true,verifyEvolutionFeat:()=>true};
const learned=(s,skill)=>{
 s.unlockedSkills=[...(s.unlockedSkills??[]),skill];
 s.chromaV4Meta.learnedSkills=[...s.chromaV4Meta.learnedSkills,skill];return s;
};
const cast=(s,skill,override={},h=host)=>applyVerifiedV46RuneCast(s,{
 sourceRef:'cast.confirmed.001',proofRef:'journal.cast.001',skillId:skill,
 target:'enemy',serverSecond:1200,confirmedPlayerChoice:true,...override},h);
test('fire skill works on persisted target HP, spends actual MP, saves mastery and proof',()=>{
 const s=learned(battle(),'fire_projectile');
 const r=cast(s,'fire_projectile');
 assert.ok(r.receipt.damage['mob.ant.001']>0);
 assert.equal(r.next.activeEncounter.enemyHp,660-r.receipt.damage['mob.ant.001']);
 assert.equal(r.next.mp,233);
 assert.ok(r.next.chromaV4Meta.runeRuntime.mastery.fire_projectile);
 assert.ok(r.next.appliedRewardRefs.includes('cast.confirmed.001'));
 assert.equal(s.activeEncounter.enemyHp,660);
 assert.equal(s.mp,245);
});
test('unsaved action proof is refused with no mutation',()=>{
 const s=learned(battle(),'fire_projectile');
 const before=structuredClone(s);
 assert.throws(()=>cast(s,'fire_projectile',{}, {...host,verifyAction:()=>false}),/NOT_JOURNAL_VERIFIED/);
 assert.deepEqual(s,before);
});
test('failure, replay, cooldown all prevent repeated benefits',()=>{
 const s=learned(battle(),'fire_projectile');
 const r=cast(s,'fire_projectile');
 assert.throws(()=>cast(r.next,'fire_projectile'),/DUPLICATE/);
 assert.throws(()=>cast(r.next,'fire_projectile',{sourceRef:'cast.confirmed.002',
   proofRef:'journal.cast.002',serverSecond:1201}),/COOLDOWN/);
});
test('miss burns MP but not enemy HP or mastery',()=>{
 const s=learned(battle(),'fire_projectile');
 const r=cast(s,'fire_projectile',{}, {...host,confirmRuneHit:()=>false});
 assert.equal(r.next.mp,233);
 assert.equal(r.next.activeEncounter.enemyHp,660);
 assert.equal(r.receipt.effective,false);
 assert.equal(r.next.chromaV4Meta.runeRuntime.mastery.fire_projectile,undefined);
});
test('cannot spoof enemy damage, unsupported targets or skill ownership',()=>{
 const s=battle();
 assert.throws(()=>cast(s,'fire_projectile'),/NOT_LEARNED/);
 learned(s,'fire_projectile');
 assert.throws(()=>cast(s,'fire_projectile',{target:'ally'}),/NOT_SUPPORTED/);
 assert.throws(()=>cast(s,'fire_projectile',{target:'enemy',enemyHp:1,
  damage:9999999}),/UNTRUSTED_CAST_FIELDS/); // fail-closed caller surface check enforced below
});
test('healing self outside combat derives HP and MP only from save',()=>{
 const s=learned(hero(),'minor_healing');
 const r=cast(s,'minor_healing',{target:'self'});
 assert.ok(r.next.hp>700);
 assert.equal(r.next.mp,225);
 assert.equal(r.next.activeEncounter,undefined);
});
test('rune cast can defeat enemy but does NOT award XP until victory commit',()=>{
 const s=learned(battle(),'focused_light');
 s.activeEncounter.enemyHp=50;
 const r=cast(s,'focused_light',{preparedSeconds:1});
 assert.equal(r.enemyDefeated,true);
 assert.equal(r.defeatTargetRef,'mob.ant.001');
 assert.equal(r.next.activeEncounter.enemyHp,0);
 assert.equal(r.next.xp,s.xp);
 assert.equal(r.next.gold,s.gold);
 assert.ok(!r.next.defeatedTargetRefs.includes('mob.ant.001'));
});
test('title equip changes only confirmed active title, source-protected',()=>{
 const s=hero();
 const r=applyVerifiedV46TitleGrant(s,{titleId:'unbroken',sourceRef:'title.grant.01',
  proofRef:'quest.unbroken.01'},host);
 assert.ok(r.chromaV4Meta.titleIds.includes('unbroken'));
 const e=applyVerifiedV46EquipTitle(r,{titleId:'unbroken',sourceRef:'title.equip.01',
  proofRef:'choice.title.01',confirmedPlayerChoice:true},host);
 assert.equal(e.chromaV4Meta.activeTitle,'unbroken');
 assert.equal(readV46AbilityStatus(e).activeTitle,'unbroken');
 assert.throws(()=>applyVerifiedV46EquipTitle(e,{titleId:'unbroken',sourceRef:'title.equip.01',
  proofRef:'choice.title.01',confirmedPlayerChoice:true},host),/DUPLICATE/);
 assert.equal(r.chromaV4Meta.activeTitle,null);
});
test('unearned title and unchecked title proofs cannot equip/grant',()=>{
 const s=hero();
 assert.throws(()=>applyVerifiedV46EquipTitle(s,{titleId:'giant_feller',sourceRef:'title.equip.01',
  proofRef:'choice.title.01',confirmedPlayerChoice:true},host),/NOT_EQUIPPABLE/);
 assert.throws(()=>applyVerifiedV46TitleGrant(s,{titleId:'unbroken',sourceRef:'title.grant.01',
  proofRef:'quest.fake'}, {...host,verifyTitleClear:()=>false}),/NOT_VERIFIED/);
});
test('challenge rune is inventory-only and cannot be claimed twice',()=>{
 const s=hero();
 const a=applyVerifiedV46RuneChallenge(s,{challengeId:'papilio_rescue_trial',
  sourceRef:'challenge.win.1',proofRef:'quest.medical.cleared'},host);
 assert.equal(a.chromaV4Meta.runeStones.minor_healing,1);
 assert.equal(a.chromaV4Meta.learnedSkills.length,0);
 assert.throws(()=>applyVerifiedV46RuneChallenge(a,{challengeId:'papilio_rescue_trial',
  sourceRef:'challenge.win.2',proofRef:'quest.medical.cleared'},host),/NOT_EARNED/);
 assert.equal(s.chromaV4Meta.runeStones.minor_healing,undefined);
});
test('telekinesis cannot act on invented objects until world object ledger exists',()=>{
 const s=learned(battle(),'rulers_touch');
 assert.throws(()=>cast(s,'rulers_touch',{target:'enemy',channelSeconds:2}),/WORLD_OBJECT_LEDGER/);
});
test('battle rune effects do not carry into a different monster',()=>{
 const s=learned(battle(),'paralyzing_toxin');
 const a=cast(s,'paralyzing_toxin',{hitLocation:'right_arm'});
 assert.ok(a.next.chromaV4Meta.runeRuntime.effects.some(x=>x.targetId==='mob.ant.001'));
 const b=structuredClone(a.next);
 b.activeEncounter={enemyRef:'mob.ant.002',monsterId:'killer_ant',
  floor:8,enemyHp:660,round:1,startedRef:'battle.ant.002'};
 const r=cast(b,'paralyzing_toxin',{sourceRef:'cast.confirmed.999',
  proofRef:'journal.cast.999',serverSecond:1208});
 assert.ok(r.next.chromaV4Meta.runeRuntime.effects.every(x=>x.targetId!=='mob.ant.001'));
});
const {applyV46UnbrokenDefense}=await import('../../../src/rpg_lab_v1/rune_title_actions_v46.ts');
test('Unbroken prevents 35% physical damage once at critical HP in same battle',()=>{
 const s=learned(battle(),'fire_projectile');s.chromaV4Meta.titleIds.push('unbroken');
 s.chromaV4Meta.activeTitle='unbroken';s.hp=150;
 const a=applyV46UnbrokenDefense(s,{sourceRef:'combat.exchange.111',incomingPhysicalDamage:100,maxHp:1000});
 assert.equal(a.damage,65);assert.equal(a.prevented,35);
 const b=applyV46UnbrokenDefense(a.next,{sourceRef:'combat.exchange.112',incomingPhysicalDamage:100,maxHp:1000});
 assert.equal(b.damage,100);assert.equal(b.prevented,0);
 assert.equal(s.chromaV4Meta.titleBattleLedger,undefined);
});
test('Unbroken is not granted if title not equipped or HP above threshold',()=>{
 const s=battle();s.chromaV4Meta.titleIds.push('unbroken');s.hp=150;
 const a=applyV46UnbrokenDefense(s,{sourceRef:'combat.exchange.111',incomingPhysicalDamage:100,maxHp:1000});
 assert.equal(a.damage,100);
 s.chromaV4Meta.activeTitle='unbroken';s.hp=250;
 const b=applyV46UnbrokenDefense(s,{sourceRef:'combat.exchange.111',incomingPhysicalDamage:100,maxHp:1000});
 assert.equal(b.damage,100);
});
const {advanceVerifiedV46RuneTime}=await import('../../../src/rpg_lab_v1/rune_title_actions_v46.ts');
test('burning advances from server clock and eventually expires',()=>{
 const s=learned(battle(),'flame_breath');
 const a=cast(s,'flame_breath');
 const first=a.next.activeEncounter.enemyHp;
 const b=advanceVerifiedV46RuneTime(a.next,{serverSecond:1202},host);
 assert.ok(b.next.activeEncounter.enemyHp<first);
 assert.ok(b.next.chromaV4Meta.runeRuntime.effects.some(x=>x.type==='burning'));
 const c=advanceVerifiedV46RuneTime(b.next,{serverSecond:1210},host);
 assert.equal(c.next.chromaV4Meta.runeRuntime.effects.some(x=>x.type==='burning'),false);
 const d=advanceVerifiedV46RuneTime(c.next,{serverSecond:1220},host);
 assert.equal(d.next.activeEncounter.enemyHp,c.next.activeEncounter.enemyHp);
});
test('DOT kill indicates verified victory without granting any XP by itself',()=>{
 const s=learned(battle(),'flame_breath');
 const casted=cast(s,'flame_breath').next;
 casted.activeEncounter.enemyHp=1;
 const tick=advanceVerifiedV46RuneTime(casted,{serverSecond:1202},host);
 assert.equal(tick.enemyDefeated,true);
 assert.equal(tick.next.activeEncounter.enemyHp,0);
 assert.equal(tick.next.xp,s.xp);
});
test('time cannot move backwards or mutate original save',()=>{
 const s=learned(battle(),'flame_breath');
 const r=cast(s,'flame_breath');
 const prior=structuredClone(r.next);
 assert.throws(()=>advanceVerifiedV46RuneTime(r.next,{serverSecond:1199},host),/CLOCK_BACKWARDS/);
 assert.deepEqual(r.next,prior);
});
test('already dead battle enemy cannot be milked for a rune or victory',()=>{
 const s=learned(battle(),'minor_healing');s.activeEncounter.enemyHp=0;
 assert.throws(()=>cast(s,'minor_healing',{target:'self'}),/ALREADY_DEFEATED/);
});
test('one confirmed spell proof cannot be used to authorize a second spell',()=>{
 const s=learned(battle(),'fire_projectile');
 const a=cast(s,'fire_projectile').next;
 assert.deepEqual(a.chromaV4Meta.runeRuntime.usedProofRefs,['journal.cast.001']);
 assert.throws(()=>cast(a,'fire_projectile',{
  sourceRef:'cast.confirmed.002',proofRef:'journal.cast.001',serverSecond:1203}),
  /PROOF_ALREADY_CONSUMED/);
});

const {applyVerifiedV46RulerEvolution}=await import('../../../src/rpg_lab_v1/rune_title_actions_v46.ts');
test('Ruler Touch evolves only with mastery level six and confirmed feat',()=>{
 const s=learned(hero(),'rulers_touch');
 const e={sourceRef:'evolve.ruler.1',proofRef:'journal.evolve.1',confirmedPlayerChoice:true};
 assert.throws(()=>applyVerifiedV46RulerEvolution(s,e,host),/NOT_EARNED/);
 s.chromaV4Meta.runeRuntime={nowSecond:0,encounterRef:null,
  mastery:{rulers_touch:{level:6,xp:0,uses:18,effectiveEncounterRefs:[]}},
  cooldownReadyAt:{},effects:[],usedRefs:[],usedProofRefs:[]};
 assert.throws(()=>applyVerifiedV46RulerEvolution(s,e,{...host,verifyEvolutionFeat:()=>false}),/FEAT_REQUIRED/);
 const r=applyVerifiedV46RulerEvolution(s,e,host);
 assert.ok(r.unlockedSkills.includes('rulers_authority'));
 assert.ok(!r.unlockedSkills.includes('rulers_touch'));
 assert.ok(r.chromaV4Meta.learnedSkills.includes('rulers_authority'));
 assert.equal(r.chromaV4Meta.runeRuntime.mastery.rulers_authority.level,6);
 assert.throws(()=>applyVerifiedV46RulerEvolution(r,{...e,sourceRef:'evolve.ruler.2'},host),/NOT_EARNED|NOT_JOURNAL/);
});
