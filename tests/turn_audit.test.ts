const test = Deno.test;
import assert from 'node:assert/strict';
import {auditPreparedTurn} from '../src/turn_fast_integrity_audit.ts';
import {validateTurnCoverage} from '../src/turn_progression_coverage.ts';
const base=()=>({
 txId:'tx.example',oldDay:67,oldTime:'17:21:00',newDay:67,newTime:'17:31:00',elapsedSeconds:600,
 sessionStart:'Day67 17:21:00',sessionEnd:'Day67 17:31:00',
 resources:[['Resource','Current'],['HP','56'],['Stamina','37'],['SUP','0']],
 pendingChoices:[['Choice ID','Status','Options JSON'],['choice.old','AWAITING_CHOICE','[]']],
 inventoryChanged:false,
});
test('legacy unsolved choice must not block unrelated turn',()=>{
 const audit=auditPreparedTurn(base());
 assert.equal(audit.ok,true);
 assert(audit.warnings.some(s=>s.includes('choice.old')));
});
test('invalid newly touched choice must block',()=>{
 assert.throws(()=>auditPreparedTurn({...base(),modifiedChoiceIds:['choice.old']}),/INVALID_TOUCHED_MILESTONE_OPTIONS/);
});
test('modified choice with 2 canonical options may pass shape audit',()=>{
 const d=base(); d.pendingChoices=[['Choice ID','Status','Options JSON'],['choice.old','AWAITING_CHOICE','[{"id":"a"},{"id":"b"}]']];
 assert.equal(auditPreparedTurn({...d,modifiedChoiceIds:['choice.old']}).ok,true);
});
test('duplicate historical choices yield warning, changed duplicates reject',()=>{
 const d=base(); d.pendingChoices[1][2]='[{"id":"a"},{"id":"b"}]'; d.pendingChoices.push(['choice.old','AWAITING_CHOICE','[{"id":"a"},{"id":"b"}]']);
 assert(auditPreparedTurn(d).warnings.some(s=>s.includes('DUPLICATE_LEGACY_CHOICE')));
 assert.throws(()=>auditPreparedTurn({...d,modifiedChoiceIds:['choice.old']}),/DUPLICATE_TOUCHED_MILESTONE_CHOICE/);
});
test('clock mismatch fails',()=>{
 assert.throws(()=>auditPreparedTurn({...base(),elapsedSeconds:601}),/WORLD_CLOCK_ADVANCE_MISMATCH/);
});
test('missing required NPC/world process fails',()=>{
 assert.throws(()=>auditPreparedTurn({...base(),requiredNpcIds:['npc.key']}),/UNRESOLVED_KEY_NPC/);
 assert.throws(()=>auditPreparedTurn({...base(),requiredProcessIds:['process.work']}),/UNRESOLVED_WORLD_PROCESS/);
});
test('resources must be real finite values and nonnegative',()=>{
 assert.throws(()=>auditPreparedTurn({...base(),resources:[['Resource','Current'],['HP','']]}),/NONFINITE_CORE_RESOURCE/);
 assert.throws(()=>auditPreparedTurn({...base(),resources:[['Resource','Current'],['Mana','-1']]}),/NEGATIVE_PLAYER_RESOURCE/);
});
test('items have one custody and unique instances',()=>{
 const d=base();const inv=[['Item ID','Qty','Custodian','Location/container'],['item.a',1,'player.shura','bag'],['item.a',1,'player.shura','bag']];
 assert.throws(()=>auditPreparedTurn({...d,inventoryChanged:true,inventory:inv}),/DUPLICATE_ITEM_INSTANCE/);
});
test('meta turn yields no XP requirement',()=>{
 const result=validateTurnCoverage({elapsedSeconds:0,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true});
 assert.equal(result.status,'META_NO_TIME');
});
test('no automatic XP and strict gate',()=>{
 assert.throws(()=>validateTurnCoverage({elapsedSeconds:600,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true}),/MISSING_REVIEW/);
 const ok=validateTurnCoverage({elapsedSeconds:600,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true,review:{outcome:'SOURCE_BASED_ZERO',reason:'Repetition does not qualify for XP'}});
 assert.equal(ok.status,'EXPLICIT_ZERO');
 assert.throws(()=>validateTurnCoverage({elapsedSeconds:600,generalEvents:[{}],learningEvents:[],adaptationEvents:[],strict:true,review:{outcome:'SOURCE_BASED_ZERO',reason:'Pretend no experience has been earned'}}),/ZERO_CONTRADICTS_AWARD_EVENTS/);
});
test('award requires source references',()=>{
 assert.throws(()=>validateTurnCoverage({elapsedSeconds:600,generalEvents:[{}],learningEvents:[],adaptationEvents:[],strict:true,review:{outcome:'AWARD',reason:'Meaningful first discovery witnessed here'}}),/AWARD_SOURCE_REFERENCE_MISSING/);
 assert.equal(validateTurnCoverage({elapsedSeconds:600,generalEvents:[{}],learningEvents:[],adaptationEvents:[],strict:true,review:{outcome:'AWARD',reason:'Meaningful first discovery witnessed here',sourceRefs:['event.verified']}}).status,'EXPLICIT_AWARD');
});

test('resolved milestone hot row is intentionally removed and must NOT be required after commit',()=>{
 const d=base();d.pendingChoices=[['Choice ID','Status','Options JSON'],['choice.other','PENDING_GENERATION','[]']];
 const result=auditPreparedTurn({...d,resolvedChoiceIds:['choice.old']});
 assert.equal(result.ok,true);
 assert(result.checks.includes('resolved_milestone_hot_row_removed'));
});
test('resolution still pending is a broken writer state, not a valid choice',()=>{
 assert.throws(()=>auditPreparedTurn({...base(),resolvedChoiceIds:['choice.old']}),/RESOLVED_MILESTONE_STILL_PENDING/);
 assert.throws(()=>auditPreparedTurn({...base(),modifiedChoiceIds:['choice.old'],resolvedChoiceIds:['choice.old']}),/CHOICE_PUBLISHED_AND_RESOLVED_SAME_TURN/);
 assert.throws(()=>auditPreparedTurn({...base(),resolvedChoiceIds:['choice.old','choice.old']}),/DUPLICATE_CHOICE_EVENT_IDS/);
});
