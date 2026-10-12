const test = Deno.test;import assert from 'node:assert/strict';
import {shouldLoadSceneActors,sourceReadBudgetNotice} from '../src/context_hotpath_budget.ts';
test('no broad NPC scans for pure status and world MICRO inspections',()=>{
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:['STATUS','WORLD']}).loadSceneActors,false);
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:[]}).loadSceneActors,false);
});
test('intentional NPC, world action, and dialogue always load actors',()=>{
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:['NPC']}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:'NORMAL',tags:['WORLD']}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:['SOCIAL']}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:['STATUS'],actorRefs:['Веша']}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:'MICRO',tags:['STATUS'],requireNpcContextGate:true}).loadSceneActors,true);
});
test('source budget says what it skipped but never destroys original data',()=>{
 const r=sourceReadBudgetNotice({turnClass:'MICRO',tags:[],sceneActorsConsidered:4,sceneActorsLoaded:0,
 actorIndexApproxCells:0,actorExactApproxCells:0});
 assert.equal(r.extraSourceReads,0);assert.equal(r.warnings.length,1);
 assert(r.rules.some(x=>x.includes('full bounded actor facts')));
});
test('source budget warns when user conversation fans out to entire crowd',()=>{
 const r=sourceReadBudgetNotice({turnClass:'NORMAL',tags:['NPC'],sceneActorsConsidered:12,sceneActorsLoaded:12,
 actorIndexApproxCells:2500,actorExactApproxCells:4500,targetedDocQueries:8});
 assert.equal(r.warnings.length,2);
});
