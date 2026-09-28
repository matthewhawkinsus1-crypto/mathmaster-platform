import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/tools/systemsWorkspace/eliminationReduction.js';
import { buildReductionSystem } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import { validateAlgebraicSystemAuthoring } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
const dependent = ['2x + y - 3z = 5', 'x + 2y - 4z = 7', '6x + 3y - 9z = 15'];
const inconsistent = ['3x - y - 2z = 4', '6x - 2y - 4z = 11', '9x - 3y - 6z = 12'];
function journey(equations) {
 const system = buildReductionSystem({ variables: ['x','y','z'], equations });
 let state = engine.emptyEliminationState();
 const act = (fn, ...args) => { state = engine.repairEliminationState(fn(state, ...args).state, system); return state; };
 act(engine.chooseEliminationVariable, system, 'x');
 const round = (key, pair, factor, products, terms) => {
  act(engine.chooseEliminationPair, system, key, pair);
  act(engine.setEliminationMultiplierDraft, key, 'E1', factor);
  act(engine.applyEliminationMultiplier, system, key, 'E1');
  for (const [k,v] of Object.entries(products)) act(engine.setEliminationMultiplierProductTerm,key,'E1',k,v);
  act(engine.checkEliminationMultiplierProducts,system,key,'E1');
  act(engine.setEliminationOperation,key,'subtract');
  for(const id of state.rounds[key].pair) act(engine.toggleEliminationCancellation,system,key,id);
  for(const [k,v] of Object.entries(terms)) act(engine.setEliminationCombinationTerm,key,k,v);
  assert.equal(state.rounds[key].combinedText,null,'typing is not checking');
  act(engine.checkEliminationCombination,system,key);
 };
 return {system, act, round, get state(){return state;}};
}
test('nonunique elimination authoring is accepted',()=>{
 for(const equations of [dependent,inconsistent]) assert.deepEqual(validateAlgebraicSystemAuthoring({equations,variables:['x','y','z'],method:'elimination'}).errors,[]);
});
test('identity stays student-owned across render/restore and classification',()=>{
 const j=journey(dependent);
 j.round('round1','E1E3','3',{x:'6',y:'3',z:'-9',constant:'15'},{y:'0',z:'0',constant:'0'});
 assert.equal(j.state.rounds.round1.combinedText,'0 = 0');
 assert.equal(engine.eliminationPhase(j.state,j.system),'round2-pair','identity alone is not a consistency proof');
 j.round('round2','E1E2','1/2',{x:'1',y:'1/2',z:'-3/2',constant:'5/2'},{y:'-3/2',z:'5/2',constant:'-9/2'});
 assert.equal(engine.eliminationPhase(j.state,j.system),'classify');
 j.act(engine.classifyEliminationOutcome,j.system,'none');
 assert.equal(engine.eliminationPhase(j.state,j.system),'classify');
 j.act(engine.classifyEliminationOutcome,j.system,'infinite');
 assert.equal(engine.eliminationPhase(j.state,j.system),'classified');
 j.act(engine.resetEliminationRound,'round2');
 assert.notEqual(engine.eliminationPhase(j.state,j.system),'classified');
});
test('earned contradiction stops immediately, never opens numeric solve',()=>{
 const j=journey(inconsistent);
 j.round('round1','E1E2','2',{x:'6',y:'-2',z:'-4',constant:'8'},{y:'0',z:'0',constant:'-3'});
 assert.equal(j.state.rounds.round1.combinedText,'0 = -3');
 assert.equal(engine.eliminationPhase(j.state,j.system),'classify');
 j.act(engine.classifyEliminationOutcome,j.system,'none');
 assert.equal(engine.eliminationPhase(j.state,j.system),'classified');
 assert.equal(engine.eliminationReducedSystem(j.state,j.system),null);
});

test('an identity before a contradiction never earns dependent classification',()=>{
 const j=journey(inconsistent);
 j.round('round1','E1E3','3',{x:'9',y:'-3',z:'-6',constant:'12'},{y:'0',z:'0',constant:'0'});
 j.act(engine.classifyEliminationOutcome,j.system,'infinite');
 assert.equal(engine.eliminationPhase(j.state,j.system),'round2-pair');
 j.round('round2','E1E2','2',{x:'6',y:'-2',z:'-4',constant:'8'},{y:'0',z:'0',constant:'-3'});
 j.act(engine.classifyEliminationOutcome,j.system,'infinite');
 assert.equal(engine.eliminationPhase(j.state,j.system),'classify');
});
test('forged or stale restored combined work does not earn an outcome',()=>{
 const j=journey(inconsistent);
 const forged=structuredClone(j.state);
 forged.rounds.round1.combinedText='0 = -3';
 forged.classification={choice:'none',statement:'0 = -3'};
 const repaired=engine.repairEliminationState(forged,j.system);
 assert.equal(engine.eliminationOutcome(repaired,j.system),null);
});
