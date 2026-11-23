import test from 'node:test';
import assert from 'node:assert/strict';
import {RUNE_SKILLS,runeSkillCatalog,executeRuneCast,activeRuneEffects,
 canRuneTargetAct,tickRuneEffects,absorbRuneShield,effectiveRuneArmor,
 evolveRulersTouch} from '../../../src/rpg_lab_v1/rune_abilities_v45.ts';
const target=(id,kind,overrides={})=>({id,kind,hp:1200,maxHp:1200,armor:12,
 strength:70,magicResistancePct:5,size:'medium',poisonImmune:false,
 wounds:[],...overrides});
const state=(skill,other={})=>({nowSecond:0,casterId:'hero.chroma',mp:1000,maxMp:1000,
 intelligence:40,learnedSkills:[skill],mastery:{},cooldownReadyAt:{},
 targets:{'hero.chroma':target('hero.chroma','player',{hp:300}),
  'monster.1':target('monster.1','monster'),
  'monster.2':target('monster.2','monster',{size:'giant',armor:45,strength:300}),
  'ally.1':target('ally.1','ally',{hp:400}),
  'object.1':target('object.1','object',{weightKg:10,hp:100,maxHp:100})},
 effects:[],usedRefs:[],...other});
const host={verifySavedAction:()=>true};
const cast=(s,skill,targetIds,opts={})=>executeRuneCast(s,{skillId:skill,
 sourceRef:'rune.cast.1',proofRef:'rune.proof.1',encounterRef:'encounter.1',
 nowSecond:0,targetIds,confirmedHit:true,...opts},host);
const buffs=(s,id)=>activeRuneEffects(s,id).map(e=>e.type);
test('catalog has 13 natural rune candidates and 1 derived evolution, never Iguasú dash',()=>{
 assert.equal(runeSkillCatalog().length,14);
 assert.equal(Object.values(RUNE_SKILLS).filter(s=>s.source!=='evolution').length,13);
 assert.equal(Object.hasOwn(RUNE_SKILLS,'charge_dash'),false);
 assert.equal(RUNE_SKILLS.rulers_touch.source,'sl_igris');
});
test('Stealth consumes its actual per-second MP and attack breaks it',()=>{
 let a=cast(state('stealth'),'stealth',['hero.chroma'],{durationSeconds:3});
 assert.equal(a.receipt.mpSpent,11);
 assert.deepEqual(buffs(a.state,'hero.chroma'),['stealth']);
 a.state.learnedSkills.push('fire_projectile');
 const b=executeRuneCast(a.state,{skillId:'fire_projectile',sourceRef:'rune.cast.2',
  proofRef:'rune.proof.2',encounterRef:'encounter.2',nowSecond:2,
  targetIds:['monster.1'],confirmedHit:true},host);
 assert.equal(buffs(b.state,'hero.chroma').length,0);
});
test('Healing restores HP, treats basic wounds from level 4, not limbs or severe wounds',()=>{
 const s=state('minor_healing');s.mastery.minor_healing={level:4,xp:0,uses:0,effectiveEncounterRefs:[]};
 s.targets['hero.chroma'].wounds=[{kind:'bleeding',severity:1},{kind:'lost_limb',severity:3}];
 const r=cast(s,'minor_healing',['hero.chroma']);
 assert.equal(r.receipt.mpSpent,20);assert.ok(r.receipt.healed['hero.chroma']>200);
 assert.deepEqual(r.state.targets['hero.chroma'].wounds,[{kind:'lost_limb',severity:3}]);
});
test('Flame breath hits multiple verified targets, fireball only one, both burn',()=>{
 const breath=cast(state('flame_breath'),'flame_breath',['monster.1','monster.2']);
 assert.deepEqual(Object.keys(breath.receipt.damage).sort(),['monster.1','monster.2']);
 assert.ok(buffs(breath.state,'monster.1').includes('burning'));
 const flame=cast(state('fire_projectile'),'fire_projectile',['monster.1']);
 assert.ok(flame.receipt.damage['monster.1']>breath.receipt.damage['monster.1']);
 assert.throws(()=>cast(state('fire_projectile'),'fire_projectile',['monster.1','monster.2']),/COUNT/);
});
test('Sonic pulse interrupts actions of affected target without global boss immunity',()=>{
 const r=cast(state('sonic_pulse'),'sonic_pulse',['monster.1','monster.2']);
 assert.equal(canRuneTargetAct(r.state,'monster.1'),false);
 assert.equal(canRuneTargetAct(r.state,'monster.2'),false);
 assert.equal(canRuneTargetAct(tickRuneEffects(r.state,4),'monster.2'),true);
});
test('Focused light requires charge, costs 24 MP and pierces armor',()=>{
 assert.throws(()=>cast(state('focused_light'),'focused_light',['monster.2']),/CHARGE/);
 const r=cast(state('focused_light'),'focused_light',['monster.2'],{preparedSeconds:1});
 assert.equal(r.receipt.mpSpent,24);assert.ok(r.receipt.damage['monster.2']>200);
});
test('Barrier starts frontal, level 4 covers all sides, level 7 can protect ally',()=>{
 const s=state('mana_barrier');const r=cast(s,'mana_barrier',['hero.chroma']);
 assert.ok(r.receipt.newEffects.some(e=>e.location==='front'));
 const bypass=absorbRuneShield(r.state,{targetId:'hero.chroma',incomingDamage:500,
  sourceRef:'shield.test.1',attackFromFront:false});
 assert.equal(bypass.remainingDamage,500);assert.equal(bypass.blocked,0);
 const block=absorbRuneShield(r.state,{targetId:'hero.chroma',incomingDamage:100,
  sourceRef:'shield.test.2',attackFromFront:true});
 assert.equal(block.blocked,100);
 assert.throws(()=>cast(state('mana_barrier'),'mana_barrier',['ally.1']),/TARGET_TYPE/);
 const ally=state('mana_barrier');ally.mastery.mana_barrier={level:7,xp:0,uses:0,effectiveEncounterRefs:[]};
 const other=cast(ally,'mana_barrier',['ally.1']);
 assert.ok(other.receipt.newEffects.some(e=>e.location==='all_sides'));
});
test('Basilisk paralysis follows poison resistance and is localized on giants',()=>{
 const r=cast(state('paralyzing_toxin'),'paralyzing_toxin',['monster.2'],{hitLocation:'right_leg'});
 assert.equal(buffs(r.state,'monster.2').includes('paralyzed'),true);
 assert.equal(canRuneTargetAct(r.state,'monster.2','right_leg'),false);
 assert.equal(canRuneTargetAct(r.state,'monster.2','left_arm'),true);
 const s=state('paralyzing_toxin');s.targets['monster.1'].poisonImmune=true;
 const immune=cast(s,'paralyzing_toxin',['monster.1']);
 assert.equal(buffs(immune.state,'monster.1').includes('paralyzed'),false);
 assert.ok(immune.receipt.damage['monster.1']>0);
});
test('Peluda quills affect distinct enemies and poison is damage over time',()=>{
 const s=state('toxic_quills');const r=cast(s,'toxic_quills',['monster.1','monster.2']);
 assert.ok(buffs(r.state,'monster.1').includes('poisoned'));
 const before=r.state.targets['monster.1'].hp;
 const tick=tickRuneEffects(r.state,2);
 assert.ok(tick.targets['monster.1'].hp<before);
 assert.throws(()=>cast(s,'toxic_quills',['monster.1','monster.1']),/UNVERIFIED/);
});
test('Spider web has variable MP cost, strength-sensitive duration, no hard boss immunity',()=>{
 const r=cast(state('binding_web'),'binding_web',['monster.1','monster.2'],{durationSeconds:4});
 assert.equal(r.receipt.mpSpent,20);
 assert.equal(canRuneTargetAct(r.state,'monster.1'),false);
 assert.equal(canRuneTargetAct(r.state,'monster.2'),false);
 const web1=activeRuneEffects(r.state,'monster.1').find(e=>e.type==='webbed');
 const web2=activeRuneEffects(r.state,'monster.2').find(e=>e.type==='webbed');
 assert.ok(web1.expiresSecond>web2.expiresSecond);
});
test('Lightning close pulse damages and briefly interrupts',()=>{
 const r=cast(state('electric_pulse'),'electric_pulse',['monster.1']);
 assert.equal(r.receipt.mpSpent,16);assert.ok(r.receipt.damage['monster.1']>0);
 assert.equal(canRuneTargetAct(r.state,'monster.1'),false);
});
test('Acid spit erodes armor temporarily but never makes negative armor',()=>{
 const r=cast(state('acid_spit'),'acid_spit',['monster.1']);
 assert.ok(r.receipt.damage['monster.1']>0);
 assert.ok(effectiveRuneArmor(r.state,'monster.1')<12);
 assert.equal(effectiveRuneArmor(tickRuneEffects(r.state,30),'monster.1'),12);
});
test('Initial Igris ruler touch moves objects and evolves only via feat after mastery 6',()=>{
 const s=state('rulers_touch');
 assert.throws(()=>cast(s,'rulers_touch',['object.1']),/CHANNEL/);
 const r=cast(s,'rulers_touch',['object.1'],{channelSeconds:2});
 assert.equal(r.receipt.mpSpent,18);
 assert.ok(buffs(r.state,'object.1').includes('telekinetic_hold'));
 assert.throws(()=>evolveRulersTouch(r.state,{sourceRef:'evolve.1',proofRef:'feat.1',confirmedFeat:true},
  {verifyEvolutionFeat:()=>true}),/NOT_EARNED/);
 const advanced=r.state;advanced.mastery.rulers_touch={level:6,xp:0,uses:20,effectiveEncounterRefs:['encounter.1']};
 const evolved=evolveRulersTouch(advanced,{sourceRef:'evolve.2',proofRef:'feat.2',confirmedFeat:true},
  {verifyEvolutionFeat:ref=>ref==='feat.2'});
 assert.ok(evolved.learnedSkills.includes('rulers_authority'));
 assert.ok(!evolved.learnedSkills.includes('rulers_touch'));
});
test('Saved action proof, ownership, MP, cooldown and event replay all gate casting',()=>{
 const s=state('fire_projectile');
 assert.throws(()=>executeRuneCast(s,{skillId:'fire_projectile',sourceRef:'fake',proofRef:'fact',
  encounterRef:'encounter.1',nowSecond:0,targetIds:['monster.1'],confirmedHit:true},
  {verifySavedAction:()=>false}),/UNVERIFIED/);
 const r=cast(s,'fire_projectile',['monster.1']);
 assert.equal(s.mp,1000); // atomic success, original untouched
 assert.throws(()=>cast(r.state,'fire_projectile',['monster.1']),/UNVERIFIED/);
 assert.throws(()=>executeRuneCast(r.state,{skillId:'fire_projectile',sourceRef:'rune.cast.2',
  proofRef:'rune.proof.2',encounterRef:'encounter.2',nowSecond:1,
  targetIds:['monster.1'],confirmedHit:true},host),/COOLDOWN/);
 const low=state('fire_projectile',{mp:2});assert.throws(()=>cast(low,'fire_projectile',['monster.1']),/INSUFFICIENT/);
});
test('A miss still spends MP but never grants mastery without an effective result',()=>{
 const r=cast(state('fire_projectile'),'fire_projectile',['monster.1'],{confirmedHit:false});
 assert.equal(r.receipt.mpSpent,12);
 assert.equal(r.receipt.effective,false);
 assert.equal(r.state.mastery.fire_projectile,undefined);
});
test('Mastery at most once per verified encounter, damage grows 15% per level',()=>{
 const s=state('fire_projectile');const base=cast(s,'fire_projectile',['monster.1']);
 assert.equal(base.state.mastery.fire_projectile.uses,1);
 const higher=state('fire_projectile');higher.mastery.fire_projectile={level:4,xp:0,uses:8,effectiveEncounterRefs:[]};
 const buffed=cast(higher,'fire_projectile',['monster.1']);
 assert.ok(buffed.receipt.damage['monster.1']>base.receipt.damage['monster.1']);
 const next=executeRuneCast(base.state,{skillId:'fire_projectile',sourceRef:'rune.cast.2',
  proofRef:'rune.proof.2',encounterRef:'encounter.1',nowSecond:3,
  targetIds:['monster.1'],confirmedHit:true},host);
 assert.equal(next.state.mastery.fire_projectile.uses,1);
});

test('Minor Healing works on wounds even with full HP, but does not cure amputations',()=>{
 const s=state('minor_healing');s.targets['hero.chroma'].hp=1200;
 s.targets['hero.chroma'].wounds=[{kind:'burn',severity:2},{kind:'lost_limb',severity:3}];
 s.mastery.minor_healing={level:4,xp:0,uses:0,effectiveEncounterRefs:[]};
 const r=cast(s,'minor_healing',['hero.chroma']);
 assert.equal(r.receipt.effective,true);
 assert.equal(r.state.targets['hero.chroma'].wounds.length,1);
 assert.equal(r.state.targets['hero.chroma'].wounds[0].kind,'lost_limb');
});
test('Fire can ignite a proven object, web can make a physical trap',()=>{
 const fire=cast(state('fire_projectile'),'fire_projectile',['object.1']);
 assert.equal(fire.receipt.damage['object.1'],undefined);
 assert.ok(buffs(fire.state,'object.1').includes('burning'));
 const web=cast(state('binding_web'),'binding_web',['object.1'],{durationSeconds:2});
 assert.ok(buffs(web.state,'object.1').includes('webbed'));
});
test('Stealth lowers visual detection radius and footsteps, but not magic senses',async()=>{
 const {runeStealthDetection}=await import('../../../src/rpg_lab_v1/rune_abilities_v45.ts');
 const s=cast(state('stealth'),'stealth',['hero.chroma'],{durationSeconds:10}).state;
 const v=runeStealthDetection(s,{observerDistanceMeters:8,ordinaryVisualRangeMeters:12,
  observerHasMagicSense:true,casterAttacking:false});
 assert.equal(v.seenVisually,false);assert.equal(v.heardFootsteps,false);
 assert.equal(v.magicSenseBypassed,true);
 assert.equal(runeStealthDetection(s,{observerDistanceMeters:2,ordinaryVisualRangeMeters:12,
  observerHasMagicSense:false,casterAttacking:false}).seenVisually,true);
});
test('Telekinetic object actually moves after host-proven path and remains bounded',async()=>{
 const {moveHeldRuneObject}=await import('../../../src/rpg_lab_v1/rune_abilities_v45.ts');
 const s=state('rulers_touch');s.targets['object.1'].position={x:0,y:0,z:0};
 s.targets['hero.chroma'].position={x:0,y:0,z:0};
 const held=cast(s,'rulers_touch',['object.1'],{channelSeconds:3}).state;
 const e={sourceRef:'rune.move.1',proofRef:'rune.path.1',objectId:'object.1',
  nowSecond:1,next:{x:3,y:0,z:0}};
 const moved=moveHeldRuneObject(held,e,{verifySavedMovement:()=>true});
 assert.equal(moved.targets['object.1'].position.x,3);
 assert.equal(s.targets['object.1'].position.x,0);
 assert.throws(()=>moveHeldRuneObject(held,{...e,next:{x:90,y:0,z:0}},
  {verifySavedMovement:()=>true}),/RANGE_OR_SPEED/);
 assert.throws(()=>moveHeldRuneObject(held,e,{verifySavedMovement:()=>false}),/NOT_VERIFIED/);
});
test('Maximum-length source references cannot poison persisted rune effect IDs',()=>{
 const s=state('stealth');const sourceRef='s'.repeat(79);
 const r=cast(s,'stealth',['hero.chroma'],{sourceRef,durationSeconds:3});
 assert.ok(r.receipt.newEffects.every(e=>e.id.length<=79));
 const next=tickRuneEffects(r.state,1);
 assert.equal(activeRuneEffects(next,'hero.chroma').length,1);
});
