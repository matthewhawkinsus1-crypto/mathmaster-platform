/*
 * ISSUE #359, PART B — 3×3 ELIMINATION ENGINE.
 *
 * Pure state-machine tests for eliminationReduction.js against the Day 1
 * system (solution (3,1,5)), mirroring how systemsWorkspace3x3Engine.test.mjs
 * pins substitutionReduction.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReductionSystem, reductionAnswerKey } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import {
  activeEliminationRoundKey,
  attemptEliminationBackPlacement,
  checkEliminationCombination,
  chooseEliminationPair,
  chooseEliminationVariable,
  eliminationBackSubstitutionDestinations,
  eliminationBackSubstitutionEquation,
  eliminationKnownSolution,
  eliminationPairOptions,
  eliminationPhase,
  eliminationReducedSystem,
  emptyEliminationState,
  recordEliminationBackSolve,
  repairEliminationState,
  resetEliminationRound,
  setEliminationCombinedDraft,
  setEliminationMultiplierDraft,
  setEliminationOperation,
} from '../../src/tools/systemsWorkspace/eliminationReduction.js';

const XYZ = ['x', 'y', 'z'];
const DAY1_SYSTEM = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'];
const buildSystem = () => buildReductionSystem({ variables: XYZ, equations: DAY1_SYSTEM });

test('the Day 1 system has the intended unique solution (3,1,5)', () => {
  const system = buildSystem();
  const key = reductionAnswerKey(system);
  assert.equal(key.type, 'unique');
  assert.deepEqual(key.solution, { x: 3, y: 1, z: 5 });
});

test('eliminationPairOptions offers exactly the three unordered pairs, with no ranking', () => {
  const system = buildSystem();
  const options = eliminationPairOptions(system);
  assert.equal(options.length, 3);
  assert.deepEqual(options.map((option) => option.equationIds), [['E1', 'E2'], ['E1', 'E3'], ['E2', 'E3']]);
});

test('choosing a variable resets the round state; choosing an unauthored variable is a no-op', () => {
  const system = buildSystem();
  const chosen = chooseEliminationVariable(emptyEliminationState(), system, 'y');
  assert.equal(chosen.state.variable, 'y');
  const rejected = chooseEliminationVariable(chosen.state, system, 'q');
  assert.equal(rejected.state.variable, 'y', 'an unauthored variable must not overwrite the existing choice');
});

test('the second round cannot reuse the first round\'s exact pair', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  const repeated = chooseEliminationPair(state, system, 'round2', 'E1E2');
  assert.ok(repeated.feedback, 'reusing the exact same pair must be rejected');
  assert.equal(repeated.feedback.reason, 'pair-repeated');
  const different = chooseEliminationPair(state, system, 'round2', 'E1E3');
  assert.equal(different.feedback, null);
});

test('a pair whose equations do not contain the target variable is rejected (nothing to eliminate)', () => {
  // 5y = 10 never contains z, so it cannot participate in a z-elimination pair.
  const system = buildReductionSystem({ variables: XYZ, equations: ['x + y + z = 6', '5y = 10', '2x - y + 3z = 9'] });
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'z').state;
  const rejected = chooseEliminationPair(state, system, 'round1', 'E1E2');
  assert.ok(rejected.feedback);
  assert.equal(rejected.feedback.reason, 'variable-absent');
});

test('resetEliminationRound clears exactly one round\'s work and lets the student choose a different pair', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationMultiplierDraft(state, 'round1', 'E1', '2').state;
  state = resetEliminationRound(state, 'round1').state;
  assert.equal(state.rounds.round1.pair, null);
  assert.deepEqual(state.rounds.round1.multiplierDrafts, {});
});

test('a genuinely correct elimination round accepts multiple valid multiplier/operation routes for the same variable', () => {
  const system = buildSystem();
  // Route A: eliminate y from E1 (2x - y + 2z = 15) and E2 (-x + y + z = 3) by
  // adding directly (multipliers left blank = 1), since the y coefficients
  // are already opposite (-1 and +1).
  let stateA = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  stateA = chooseEliminationPair(stateA, system, 'round1', 'E1E2').state;
  stateA = setEliminationOperation(stateA, 'round1', 'add').state;
  stateA = setEliminationCombinedDraft(stateA, 'round1', 'x + 3z = 18').state;
  const checkedA = checkEliminationCombination(stateA, system, 'round1');
  assert.equal(checkedA.feedback, null, JSON.stringify(checkedA.feedback));
  assert.equal(checkedA.state.rounds.round1.combinedText, 'x + 3z = 18');

  // Route B: eliminate y from E1 and E3 (3x - y + 2z = 18) by subtracting
  // directly (again multipliers left blank), a different, equally valid pair.
  let stateB = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  stateB = chooseEliminationPair(stateB, system, 'round1', 'E1E3').state;
  stateB = setEliminationOperation(stateB, 'round1', 'subtract').state;
  // E1 - E3 = (2x - y + 2z) - (3x - y + 2z) = -x = 15 - 18 = -3
  stateB = setEliminationCombinedDraft(stateB, 'round1', '-x = -3').state;
  const checkedB = checkEliminationCombination(stateB, system, 'round1');
  assert.equal(checkedB.feedback, null, JSON.stringify(checkedB.feedback));
});

test('scaling is optional: a blank multiplier means no scaling needed, never a forced multiply-by-1 step', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  // Neither multiplier draft is ever set.
  assert.deepEqual(state.rounds.round1.multiplierDrafts, {});
  state = setEliminationCombinedDraft(state, 'round1', 'x + 3z = 18').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.equal(checked.feedback, null);
});

test('a combination that does not actually cancel the target variable is rejected, not silently accepted', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationOperation(state, 'round1', 'subtract').state; // should have been add
  state = setEliminationCombinedDraft(state, 'round1', 'x + 3z = 18').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.ok(checked.feedback, 'a wrong operation choice must not eliminate y and must be rejected');
  assert.equal(checked.state.rounds.round1.combinedText, null);
});

test('an algebraically equivalent but differently-scaled combination is still accepted (multiple valid routes)', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationMultiplierDraft(state, 'round1', 'E1', '2').state;
  state = setEliminationMultiplierDraft(state, 'round1', 'E2', '2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  // 2*(2x - y + 2z) + 2*(-x + y + z) = 2x + 6z = 36, equivalent to x + 3z = 18.
  state = setEliminationCombinedDraft(state, 'round1', '2x + 6z = 36').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.equal(checked.feedback, null, JSON.stringify(checked.feedback));
});

test('the full elimination round reduces the Day 1 system to a correct, independent 2×2, then solves through to the ordered triple', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  assert.equal(eliminationPhase(state, system, {}), 'round1-pair');

  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  assert.equal(activeEliminationRoundKey(state), 'round1');
  state = setEliminationOperation(state, 'round1', 'add').state;
  state = setEliminationCombinedDraft(state, 'round1', 'x + 3z = 18').state;
  state = checkEliminationCombination(state, system, 'round1').state;
  assert.equal(eliminationPhase(state, system, {}), 'round2-pair');

  state = chooseEliminationPair(state, system, 'round2', 'E2E3').state;
  // E2 (-x + y + z = 3) + E3 (3x - y + 2z = 18) = 2x + 3z = 21.
  state = setEliminationOperation(state, 'round2', 'add').state;
  state = setEliminationCombinedDraft(state, 'round2', '2x + 3z = 21').state;
  state = checkEliminationCombination(state, system, 'round2').state;
  assert.equal(activeEliminationRoundKey(state), null);
  assert.equal(eliminationPhase(state, system, {}), 'subsystem');

  const reduced = eliminationReducedSystem(state, system);
  assert.deepEqual(reduced.variables, ['x', 'z']);
  assert.equal(reduced.equations[0].text, 'x + 3z = 18');
  assert.equal(reduced.equations[1].text, '2x + 3z = 21');

  // Solving R1/R2 by hand: (2x+3z) - (x+3z) = 21-18 -> x = 3, then z = 5.
  const reducedSolution = { x: 3, z: 5 };
  assert.equal(eliminationPhase(state, system, { reducedSolution }), 'back-substitute');

  const destinations = eliminationBackSubstitutionDestinations(state, system);
  assert.ok(destinations.length >= 1);
  const destination = destinations[0];
  const placeX = attemptEliminationBackPlacement(state, system, reducedSolution, destination.id, 'x', 'x');
  state = placeX.state;
  const placeZ = attemptEliminationBackPlacement(state, system, reducedSolution, destination.id, 'z', 'z');
  state = placeZ.state;
  const backEquation = eliminationBackSubstitutionEquation(state, system, reducedSolution);
  assert.ok(backEquation, 'a fully-placed back-substitution destination must be ready to solve');

  // Solve the back equation for y by hand and record it, matching whichever
  // original equation was chosen as the destination.
  const yValueFromDestination = () => {
    if (destination.id === 'E1') return 1; // 2(3) - y + 2(5) = 15 -> y = 1
    if (destination.id === 'E2') return 1; // -(3) + y + 5 = 3 -> y = 1
    return 1; // 3(3) - y + 2(5) = 18 -> y = 1
  };
  state = recordEliminationBackSolve(state, yValueFromDestination(), '1').state;
  assert.equal(eliminationPhase(state, system, { reducedSolution }), 'verify');

  const solution = eliminationKnownSolution(state, reducedSolution);
  assert.deepEqual(solution, { x: 3, z: 5, y: 1 });
});

test('repairEliminationState replays a persisted draft against the current system and drops anything no longer true', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  state = setEliminationCombinedDraft(state, 'round1', 'x + 3z = 18').state;
  state = checkEliminationCombination(state, system, 'round1').state;

  const repaired = repairEliminationState(state, system);
  assert.equal(repaired.variable, 'y');
  assert.equal(repaired.rounds.round1.combinedText, 'x + 3z = 18');

  // A draft claiming a combinedText that no longer matches the stored
  // multipliers/operation must not be trusted blindly.
  const tampered = { ...state, rounds: { ...state.rounds, round1: { ...state.rounds.round1, combinedText: 'x + 99z = 1' } } };
  const repairedTampered = repairEliminationState(tampered, system);
  assert.notEqual(repairedTampered.rounds.round1.combinedText, 'x + 99z = 1');
});

test('repairEliminationState drops an unauthored eliminated variable entirely', () => {
  const system = buildSystem();
  const repaired = repairEliminationState({ version: 1, variable: 'q', rounds: {} }, system);
  assert.deepEqual(repaired, emptyEliminationState());
});
