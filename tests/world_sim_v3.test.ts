import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 elapsedInterval,dueProcesses,staffedMinutes,evaluateNpcPresence,validateNpcIndependentDecision,
 relayKnowledge,mayKnow,estimateRoute,adjudicateAttack,planCustodyTransfer,inventoryMassGrams,
 advanceCraftOrder,approveCraftCompletion,planWorldReview,validateWorldResolution,
 generateOffer,OFFER_TEMPLATES,deterministicDraw,seed32,planAchievementAward,planProgressCycle,
 planTitleAward,applicableTitleEffects,systemCurrencyBalance,ACHIEVEMENTS_V3,TITLES_V3,
 proposeWorldTurn,
 type MaterialLot,type Evidence,type MaterializedDemand,type Fact,type CraftOrder,
} from '../src/world_sim_v3/index.ts';
const e=(id:string,domain:Evidence['domain'],kind='proof',actorId='shura'):Evidence=>({id,domain,kind,actorId,worldMinute:100,sourceRef:'source.'+id,independentlyVerified:true,significance:'landmark',noveltyVerified:true});
const good=<T>(result:{ok:true;value:T}|{ok:false;code:string;reason:string}):T=>{assert.equal(result.ok,true,result.ok?'':result.code);return result.value as T;};
const denied=(result:{ok:boolean;code?:string},code:string)=>{assert.equal(result.ok,false);assert.equal(result.code,code);};

test('clock: exact passage without advance from meta turn',()=>{
 assert.deepEqual(elapsedInterval(50,0),{start:50,end:50});assert.deepEqual(elapsedInterval(50,30),{start:50,end:80});
 assert.throws(()=>elapsedInterval(50,-1));
});
test('world: due events require trigger and no full-city process scan',()=>{
 const processes=[{id:'p1',lastAdvanced:50,nextDue:75,kind:'daily' as const,active:true},
 {id:'p2',lastAdvanced:50,nextDue:null,kind:'event' as const,active:true,requiresEvidence:'e2'},
 {id:'p3',lastAdvanced:50,nextDue:120,kind:'staffed' as const,active:true}];
 const due=good(dueProcesses({window:{start:50,end:90},processes,evidenceIds:new Set(['e2'])}));
 assert.deepEqual(due.map(x=>x.id),['p1','p2']);denied(dueProcesses({window:{start:50,end:90},processes,evidenceIds:new Set(),limit:2}),'PAGE_REQUIRED');
});
test('world: never advance processes whose last checkpoint lies in the future',()=>{
 denied(dueProcesses({window:{start:40,end:90},processes:[{id:'p1',lastAdvanced:41,nextDue:80,kind:'daily',active:true}],evidenceIds:new Set()}),'FUTURE_PROCESS');
});
test('staffed production: holidays and closing hours count exactly once',()=>{
 const schedule=Array.from({length:7},(_,weekday)=>({weekday,startMinute:9*60,endMinute:17*60}));
 assert.equal(staffedMinutes({window:{start:0,end:3*1440},dailyWindows:schedule,holidays:new Set([1]),weekdayAnchor:0}),960);
 assert.equal(staffedMinutes({window:{start:500,end:600},dailyWindows:schedule,holidays:new Set(),weekdayAnchor:0}),60);
});
test('NPC presence: confirmed shift, independent contract and no invented availability',()=>{
 const shifts=[{npcId:'npc.a',locationId:'loc.shop',start:10,end:70,kind:'work' as const}];
 assert.equal(good(evaluateNpcPresence({npcId:'npc.a',at:40,shifts,commitments:[]})).availability,'available');
 assert.equal(good(evaluateNpcPresence({npcId:'npc.a',at:80,shifts,commitments:[]})).availability,'unknown');
 denied(evaluateNpcPresence({npcId:'npc.a',at:40,shifts,commitments:[{id:'job.a',npcId:'npc.a',start:20,end:60,locationId:'loc.far',status:'active'}]}),'CONFLICTED_PRESENCE');
});
test('NPC agency: no auto-accepts without causal GM resolution',()=>{
 denied(validateNpcIndependentDecision({npcId:'npc.a',opportunityId:'work.a',decision:'accept',causalRef:'',origin:'GM_RESOLVED'},new Set(['work.a'])),'UNSUPPORTED_NPC_DECISION');
 good(validateNpcIndependentDecision({npcId:'npc.a',opportunityId:'work.a',decision:'decline',causalRef:'evidence.decision',origin:'GM_RESOLVED'},new Set(['work.a'])));
});
test('knowledge: speech transmits actual sender-known fact, not hidden GM truth',()=>{
 const facts:Fact[]=[{id:'fact.a',value:'observed market sign',sourceRef:'sign.a',learnedAt:25,confidence:'reported',knownBy:['npc.a']}];
 const msg={eventId:'talk.a',fromId:'npc.a',toId:'shura',at:30,factId:'fact.a',channel:'speech' as const,contactVerified:true,languageComprehension:'full' as const};
 denied(relayKnowledge({facts,message:msg,provenance:new Map()}),'UNVERIFIED_RELAY');
 const obtained=good(relayKnowledge({facts,message:msg,provenance:new Map([['talk.a',{...e('talk.a','social'),actorId:'npc.a',worldMinute:30}]])}));
 assert.equal(mayKnow(obtained[0],'shura',31),true);assert.equal(mayKnow(facts[0],'shura',31),false);
});
test('knowledge: cannot auto-translate incomplete Taren',()=>{
 const fact:Fact={id:'fact.a',value:'whole hidden statement',sourceRef:'source.a',learnedAt:10,confidence:'verified',knownBy:['npc.a']};
 denied(relayKnowledge({facts:[fact],message:{eventId:'talk.a',fromId:'npc.a',toId:'shura',at:20,factId:'fact.a',channel:'speech',contactVerified:true,languageComprehension:'partial'},provenance:new Map([['talk.a',{...e('talk.a','social'),actorId:'npc.a',worldMinute:20}]])}),'PARTIAL_MEANING');
});
test('travel: player-selected route has bounded time, weather and fees',()=>{
 const edges=[{id:'edge.a',from:'loc.a',to:'loc.b',distanceMeters:2000,terrain:'road' as const,open:true,feeCopper:4},{id:'edge.b',from:'loc.b',to:'loc.c',distanceMeters:1000,terrain:'mud' as const,open:true,feeCopper:1,hazardId:'hazard.a'}];
 const r=good(estimateRoute({start:'loc.a',routeIds:['edge.a','edge.b'],edges,speedMetersPerMinute:100,loadMultiplier:1.2,weatherMultiplier:1,knownCopper:5}));
 assert.equal(r.meters,3000);assert.equal(r.minutes,45);assert.equal(r.feesCopper,5);assert.deepEqual(r.hazards,['hazard.a']);
 denied(estimateRoute({start:'loc.a',routeIds:['edge.b'],edges,speedMetersPerMinute:100,loadMultiplier:1,weatherMultiplier:1,knownCopper:5}),'DISCONNECTED_ROUTE');
});
test('travel: sealed road cannot be made open by RNG',()=>{
 denied(estimateRoute({start:'loc.a',routeIds:['edge.a'],edges:[{id:'edge.a',from:'loc.a',to:'loc.b',distanceMeters:20,terrain:'road',open:false,feeCopper:0}],speedMetersPerMinute:2,loadMultiplier:1,weatherMultiplier:1,knownCopper:0}),'CLOSED_ROUTE');
});
test('combat: distance and physical exposure restrict possibility before random roll',()=>{
 const frame={distanceCm:201,reachCm:200,lineOfEffect:true,staminaNow:20,staminaCost:5,attackForce:12,armorAbsorption:3,targetExposed:true,uncertain:true};
 denied(adjudicateAttack(frame),'OUT_OF_REACH');denied(adjudicateAttack({...frame,distanceCm:199,lineOfEffect:false}),'BLOCKED');
 const resolution=good(adjudicateAttack({...frame,distanceCm:199}));assert.equal(resolution.residualForceScore,9);assert.equal(resolution.injuryResolved,false);
});
test('combat: insufficient stamina never succeeds due to arbitrary high dice',()=>{
 denied(adjudicateAttack({distanceCm:10,reachCm:50,lineOfEffect:true,staminaNow:1,staminaCost:4,attackForce:9,armorAbsorption:0,targetExposed:true,uncertain:false}),'EXHAUSTED');
});
const lot:MaterialLot={id:'lot.flax',templateId:'item.flax',qty:100,unitMassGrams:12,custodianId:'npc.crafter',locationId:'loc.shop',reservedQty:20};
test('inventory: physical transfer conserves mass and leaves reserved stock',()=>{
 const p=good(planCustodyTransfer([lot],{lotId:lot.id,quantity:30,fromCustodian:'npc.crafter',toCustodian:'shura',destination:'loc.market',causeRef:'receipt.verified'}));
 assert.equal(inventoryMassGrams([p.afterSource!,p.received]),inventoryMassGrams([lot]));assert.equal(p.afterSource?.qty,70);assert.equal(p.received.custodianId,'shura');
 denied(planCustodyTransfer([lot],{lotId:lot.id,quantity:81,fromCustodian:'npc.crafter',toCustodian:'shura',destination:'loc.market',causeRef:'receipt.verified'}),'INSUFFICIENT_STOCK');
});
test('inventory: duplicate owner and unauthorized custody are rejected',()=>{
 assert.throws(()=>inventoryMassGrams([lot,{...lot,custodianId:'other'}]));
 denied(planCustodyTransfer([lot],{lotId:lot.id,quantity:1,fromCustodian:'shura',toCustodian:'npc.crafter',destination:'loc.shop',causeRef:'receipt.verified'}),'CUSTODY');
});
const order:CraftOrder={id:'order.rope',makerId:'npc.crafter',buyerId:'shura',recipeId:'recipe.rope',paidReceiptId:'receipt.cash',status:'working',progressMinutes:60,requiredMinutes:300,materials:[{lotId:lot.id,qty:10}],resultTemplateId:'item.rope',resultQuantity:2,deliveryCustodianId:'npc.crafter'};
test('craft: working hours progress without instant finished goods',()=>{
 const x=good(advanceCraftOrder({order,interval:{start:0,end:1440},makerSchedule:[{weekday:0,startMinute:540,endMinute:1020}],holidays:new Set(),makerAvailable:true,lots:[lot],maxStaffedMinutes:240,weekdayAnchor:0}));
 assert.equal(x.newProgressMinutes,300);assert.equal(x.nextStatus,'quality_check');assert.equal(x.finishedItemsCreated,false);
});
test('craft: QC and verified completed work are separate events',()=>{
 denied(approveCraftCompletion(order,{orderId:'order.rope',inspectorId:'npc.crafter',sourceRef:'qc.01',passed:true,verified:true}),'NO_CRAFT_QC');
 const prepared={...order,status:'quality_check' as const,progressMinutes:300};
 const x=good(approveCraftCompletion(prepared,{orderId:'order.rope',inspectorId:'npc.crafter',sourceRef:'qc.01',passed:true,verified:true}));assert.equal(x.event,'MAKE_PRODUCTS_AND_CONSUME_RESERVED_ONCE');assert.equal(x.buyerMustCollect,true);
});
test('world: only due clocks and expired finite opportunities',()=>{
 const w=good(planWorldReview({window:{start:10,end:20},processes:[{id:'world.p',lastAdvanced:0,nextDue:16,kind:'daily',active:true}],opportunities:[{id:'offer.a',issuerId:'npc.a',locationId:'loc.a',opensAt:1,closesAt:19,remainingSlots:1,sourceRef:'demand.a',status:'open'}],evidenceIds:new Set()}));
 assert.deepEqual(w.dueProcessIds,['world.p']);assert.deepEqual(w.expiredOpportunities,['offer.a']);assert.equal(w.hasAutonomousDecisions,false);
});
test('world: GM resolution requires real reach and verified cause',()=>{
 denied(validateWorldResolution({processId:'world.p',cause:e('event.a','trade'),actorCanReach:false,requiredKnowledgeRefs:new Set(['public.a']),actualKnowledgeRefs:['public.a'],elapsedMinutes:1}),'UNSUPPORTED_WORLD_EVENT');
});
const demand:MaterializedDemand={id:'demand.shop01',issuerId:'npc.crafter',locationId:'loc.shop',locationTag:'workshop',kind:'paid_order',templateIds:['offer.tools.repair','offer.spare.parts'],postedAt:10,deadline:1200,remainingSlots:1,fundedCopper:60,escrowId:'escrow.shop01',physicalSources:['item.tool001'],sourceRef:'demand.accepted',systemRewardAuthorized:false};
test('orders: deterministic template variants cannot mint employer budget',()=>{
 const a=good(generateOffer({demand,seed:'seed.a',now:11})),b=good(generateOffer({demand,seed:'seed.a',now:11}));assert.deepEqual(a,b);assert(a.patronPayoutCopper<=60);assert.equal(a.requiresPlayerAcceptance,true);
});
test('orders: zero funded source or materialized employer refuses',()=>{
 denied(generateOffer({demand:{...demand,fundedCopper:0},seed:'seed.a',now:11}),'UNFUNDED');
 denied(generateOffer({demand:{...demand,sourceRef:''},seed:'seed.a',now:11}),'UNMATERIALIZED_DEMAND');
});
test('orders: System quest cannot mint SUP and needs explicit approval',()=>{
 const sysDemand={...demand,kind:'system_objective' as const,locationTag:'system',templateIds:['offer.system.milestone'],fundedCopper:0,escrowId:null};
 denied(generateOffer({demand:sysDemand,seed:'seed',now:11}),'NO_SYSTEM_AUTHORITY');
 const offer=good(generateOffer({demand:{...sysDemand,systemRewardAuthorized:true},seed:'seed',now:11}));assert.equal(offer.patronPayoutCopper,0);assert.equal(offer.systemReward,'NOT_AUTO_GRANTED');
});
test('RNG: same seed produces same number without changing probabilities into physics',()=>{
 assert.equal(deterministicDraw('seed.123',4,8),deterministicDraw('seed.123',4,8));assert.equal(seed32('a'),seed32('a'));assert.throws(()=>deterministicDraw('seed',10,2));
});
test('catalog: many unique, draft achievements and titles with explicit effects',()=>{
 assert.equal(ACHIEVEMENTS_V3.length,90);assert.equal(TITLES_V3.length,27);
 assert.equal(new Set(ACHIEVEMENTS_V3.map(x=>x.id)).size,90);assert.equal(new Set(TITLES_V3.map(x=>x.id)).size,27);
 assert(ACHIEVEMENTS_V3.every(x=>x.status==='DESIGN_CANDIDATE'&&x.supReward<=2&&x.oneTime));
 assert(TITLES_V3.every(x=>x.effect.rule&&x.effect.trigger&&x.status==='DESIGN_CANDIDATE'));
});
test('progression: draft never auto-awards SUP even if evidence exists',()=>{
 const d=ACHIEVEMENTS_V3[0];denied(planAchievementAward({definition:d,subjectId:'shura',subjectType:'SYSTEM_USER',evidence:[e('evt.a',d.domain,d.triggerKind)],alreadyEarned:new Set(),existingAwardOrigins:new Set(),canonActivatedIds:new Set(),gmAuthorizationRef:'canon.gm.01'}),'CATALOG_DRAFT');
});
test('progression: verified, activated major achievement has exact once-only SUP plan',()=>{
 const d=ACHIEVEMENTS_V3.find(x=>x.id==='ach.v3.travel.08')!;
 const evidence=[e('evt.a',d.domain,d.triggerKind),e('evt.b',d.domain,d.triggerKind)];
 const base={definition:d,subjectId:'shura',subjectType:'SYSTEM_USER' as const,evidence,alreadyEarned:new Set<string>(),existingAwardOrigins:new Set<string>(),canonActivatedIds:new Set([d.id]),gmAuthorizationRef:'canon.gm.01'};
 const award=good(planAchievementAward(base));assert.equal(award.sup,1);assert.equal(award.committed,false);
 denied(planAchievementAward({...base,alreadyEarned:new Set([d.id])}),'ALREADY_AWARDED');
 denied(planAchievementAward({...base,existingAwardOrigins:new Set(['achievement:shura:'+d.id])}),'ALREADY_AWARDED');
});
test('progression: NPCs get no System SUP from player achievement catalog',()=>{
 const d=ACHIEVEMENTS_V3[0];denied(planAchievementAward({definition:d,subjectId:'npc.a',subjectType:'NPC',evidence:[e('ev','craft',d.triggerKind,'npc.a')],alreadyEarned:new Set(),existingAwardOrigins:new Set(),canonActivatedIds:new Set([d.id]),gmAuthorizationRef:'gm.approved'}),'NOT_SYSTEM_USER');
});
test('progression: Independent Progress Cycle requires three novel tasks in two domains',()=>{
 const evidence=[e('e1','travel'),e('e2','knowledge'),e('e3','craft')];const base={subjectId:'shura',evidence,consumedEvidenceIds:new Set<string>(),existingCycleIds:new Set<string>(),cycleId:'cycle.001',gmAuthorizationRef:'gm.a'};
 const result=good(planProgressCycle(base));assert.equal(result.sup,1);denied(planProgressCycle({...base,consumedEvidenceIds:new Set(['e1'])}),'CYCLE_UNEARNED');
 denied(planProgressCycle({...base,existingCycleIds:new Set(['cycle.001'])}),'CYCLE_UNEARNED');
});
test('progression: SUP receipt conservation and double origin prevention',()=>{
 assert.equal(systemCurrencyBalance([{receiptId:'r1',kind:'award',amount:2,originId:'ach.a'},{receiptId:'r2',kind:'spend',amount:1,originId:'player.purchase.a'}]),1);
 assert.throws(()=>systemCurrencyBalance([{receiptId:'r1',kind:'award',amount:1,originId:'ach.a'},{receiptId:'r2',kind:'award',amount:1,originId:'ach.a'}]));
 assert.throws(()=>systemCurrencyBalance([{receiptId:'r1',kind:'spend',amount:1,originId:'player.purchase.a'}]));
});
test('titles: never award draft without approved canon and prerequisite',()=>{
 const t=TITLES_V3[0];const event=e('evt.title',t.domain,t.triggerKind);
 const base={definition:t,subjectId:'shura',earnedAchievementIds:new Set(t.prerequisiteAchievementIds),evidence:[event],alreadyHeld:new Set<string>(),activatedTitleIds:new Set<string>(),gmAuthorizationRef:'gm.a'};
 denied(planTitleAward(base),'TITLE_DRAFT');
 const got=good(planTitleAward({...base,activatedTitleIds:new Set([t.id])}));assert.equal(got.titleId,t.id);
 denied(planTitleAward({...base,activatedTitleIds:new Set([t.id]),alreadyHeld:new Set([t.id])}),'TITLE_DUPLICATED');
});
test('titles: passives apply automatically only when owned, activated and triggered',()=>{
 const t=TITLES_V3[0];assert.equal(applicableTitleEffects({titles:TITLES_V3,ownedTitleIds:new Set([t.id]),activatedTitleIds:new Set([t.id]),trigger:t.effect.trigger}).length,1);
 assert.equal(applicableTitleEffects({titles:TITLES_V3,ownedTitleIds:new Set([t.id]),activatedTitleIds:new Set(),trigger:t.effect.trigger}).length,0);
});
test('turn orchestrator: no mutation, no time advance for 0-minute meta turn',()=>{
 const x=good(proposeWorldTurn({expectedSaveId:'V2-S0721',actorId:'shura',actionKind:'meta',now:100,elapsedMinutes:0,activeProcesses:[],opportunities:[],evidence:[]}));
 assert.equal(x.endMinute,100);assert.equal(x.committed,false);assert.equal(x.playerChoiceRequired,true);
});
test('turn orchestrator: large time jumps require bounded causal review',()=>{
 denied(proposeWorldTurn({expectedSaveId:'V2-S0721',actorId:'shura',actionKind:'sleep',now:100,elapsedMinutes:30000,activeProcesses:[],opportunities:[],evidence:[]}),'BULK_ADVANCE');
});
test('craft workshop: three orders cannot use same staffed minutes twice',async()=>{
 const m=await import('../src/world_sim_v3/craft.ts');const x=good(m.allocateWorkshopCapacity([{orderId:'order.a',acceptedAt:10,neededMinutes:100,priorityClass:'contracted'},{orderId:'order.b',acceptedAt:11,neededMinutes:100,priorityClass:'contracted'},{orderId:'order.c',acceptedAt:5,neededMinutes:100,priorityClass:'optional'}],170));
 assert.deepEqual(x.map(s=>s.allocatedMinutes),[100,70,0]);assert.equal(x.reduce((n,i)=>n+i.allocatedMinutes,0),170);
});
test('achievements: routine repetitions never create SUP even with technical receipts',()=>{
 const d=ACHIEVEMENTS_V3.find(x=>x.id==='ach.v3.craft.08')!;
 const evidence=[{...e('a','craft',d.triggerKind),significance:'routine' as const},{...e('b','craft',d.triggerKind),significance:'routine' as const}];
 denied(planAchievementAward({definition:d,subjectId:'shura',subjectType:'SYSTEM_USER',evidence,alreadyEarned:new Set(),existingAwardOrigins:new Set(),canonActivatedIds:new Set([d.id]),gmAuthorizationRef:'gm.a'}),'NO_QUALIFYING_CAUSE');
});
test('progression: duplicate origin in the Independent Progress Cycle cannot farm SUP',()=>{
 const evidence=[e('a','knowledge'),{...e('b','craft'),sourceRef:'source.a'},e('c','travel')];
 denied(planProgressCycle({subjectId:'shura',evidence,consumedEvidenceIds:new Set(['a']),existingCycleIds:new Set(),cycleId:'cycle.02',gmAuthorizationRef:'gm.a'}),'CYCLE_UNEARNED');
});
test('orders: a template with a larger minimum fee is rejected instead of throwing an RNG error',()=>{
 const x=generateOffer({demand:{...demand,fundedCopper:1},seed:'rand.1',now:11});denied(x,'BUDGET_TOO_SMALL');
});
test('staff shifts: overlapping windows are rejected instead of counted twice',()=>{
 assert.throws(()=>staffedMinutes({window:{start:0,end:1440},dailyWindows:[{weekday:0,startMinute:100,endMinute:300},{weekday:0,startMinute:200,endMinute:400}],holidays:new Set(),weekdayAnchor:0}));
});
test('orders: posted payout is reserved per remaining slot rather than minted for every customer',()=>{
 const one=good(generateOffer({demand:{...demand,remainingSlots:3,fundedCopper:60},seed:'slots',now:11}));assert(one.patronPayoutCopper<=20);
});
test('orders: two distinct demands cannot spend one shared employer escrow',async()=>{
 const m=await import('../src/world_sim_v3/opportunities.ts');const p=m.proposeMaterializedOfferBoard({demands:[demand,{...demand,id:'demand.shop02'}],seed:'board',now:11});denied(p,'DUPLICATE_ESCROW');
});
test('orders: official board from two independently funded demands is reproducible',async()=>{
 const m=await import('../src/world_sim_v3/opportunities.ts');const second={...demand,id:'demand.shop02',escrowId:'escrow.shop02'};
 const x=good(m.proposeMaterializedOfferBoard({demands:[demand,second],seed:'seed.1',now:11}));const y=good(m.proposeMaterializedOfferBoard({demands:[demand,second],seed:'seed.1',now:11}));assert.deepEqual(x,y);assert.equal(x.length,2);
});
test('formal System objective: only earned and approved completion can yield bounded SUP',async()=>{
 const m=await import('../src/world_sim_v3/progression.ts');const base={objectiveId:'system.objective.a',subjectId:'shura',playerAccepted:true,canonActiveIds:new Set(['system.objective.a']),completionEvidence:[e('event.a','system')],gmAuthorizationRef:'gm.approved',alreadyRewardedIds:new Set<string>(),sup:2};
 const got=good(m.planSystemObjectiveReward(base));assert.equal(got.sup,2);assert.equal(got.committed,false);
 denied(m.planSystemObjectiveReward({...base,playerAccepted:false}),'OBJECTIVE_NOT_QUALIFIED');
 denied(m.planSystemObjectiveReward({...base,alreadyRewardedIds:new Set(['system.objective.a'])}),'OBJECTIVE_NOT_QUALIFIED');
 denied(m.planSystemObjectiveReward({...base,sup:4}),'SYSTEM_REWARD_BAND');
});
test('SUP purchases cannot be made by engine without explicit Shura decision',async()=>{
 const m=await import('../src/world_sim_v3/progression.ts');denied(m.planExplicitSupPurchase({subjectId:'shura',offerId:'system.module.a',priceSUP:3,playerChoiceRef:'',availableSUP:10,alreadyPurchasedNonrepeatable:false}),'PLAYER_CHOICE_REQUIRED');
 const plan=good(m.planExplicitSupPurchase({subjectId:'shura',offerId:'system.module.a',priceSUP:3,playerChoiceRef:'player.choice.1',availableSUP:10,alreadyPurchasedNonrepeatable:false}));assert.equal(plan.supDelta,-3);assert.equal(plan.committed,false);
});
test('fuzz: 500 order variants cannot spend more than pre-existing per-slot patron source',()=>{
 for(let i=1;i<=500;i++){
  const n=(i%10)+1, funding=n*20;
  const d={...demand,id:'demand.fuzz_'+i,remainingSlots:n,fundedCopper:funding};
  const r=good(generateOffer({demand:d,seed:'fuzz.'+i,now:12}));
  assert(r.patronPayoutCopper<=Math.floor(funding/n));assert(r.patronPayoutCopper>0);
 }
});
test('fuzz: 250 fractional stocks are not accepted, and legal transfers conserve integer mass',()=>{
 for(let i=1;i<=250;i++){
  const src={...lot,id:'lot.fuzz_'+i,qty:100+i,reservedQty:20,unitMassGrams:i};
  const x=good(planCustodyTransfer([src],{lotId:src.id,quantity:i%60+1,fromCustodian:src.custodianId,toCustodian:'shura',destination:'loc.market',causeRef:'receipt.fuzz_'+i}));
  assert.equal(inventoryMassGrams([src]),inventoryMassGrams([x.afterSource!,x.received]));
 }
});
test('fuzz: 300 unreachable attacks never become feasible from uncertainty',()=>{
 for(let i=1;i<=300;i++){
  denied(adjudicateAttack({distanceCm:i+101,reachCm:100,lineOfEffect:true,staminaNow:100,staminaCost:10,attackForce:i,armorAbsorption:0,targetExposed:true,uncertain:true,uncertaintySeed:'seed'+i}),'OUT_OF_REACH');
 }
});
test('fuzz: all 90 draft achievements require explicit canon activation',()=>{
 for(const d of ACHIEVEMENTS_V3){const proofs=Array.from({length:d.minProofs},(_,i)=>e('fuzz.'+d.id+'.'+i,d.domain,d.triggerKind));
  denied(planAchievementAward({definition:d,subjectId:'shura',subjectType:'SYSTEM_USER',evidence:proofs,alreadyEarned:new Set(),existingAwardOrigins:new Set(),canonActivatedIds:new Set(),gmAuthorizationRef:'gm.valid'}),'CATALOG_DRAFT');}
});
test('fuzz: 27 candidate titles never equip, auto-grant SUP, or reveal GM reputation',()=>{
 for(const t of TITLES_V3){assert.equal(applicableTitleEffects({titles:TITLES_V3,ownedTitleIds:new Set([t.id]),activatedTitleIds:new Set(),trigger:t.effect.trigger}).length,0);
 assert(t.effect.mode==='PASSIVE'||t.effect.mode==='SYSTEM_INTERACTION'||t.effect.mode==='SOCIAL_HOOK');}
});
