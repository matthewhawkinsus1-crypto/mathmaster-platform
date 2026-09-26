/*
 * ISSUE #359, PART B — 3×3 ELIMINATION ENGINE.
 *
 * Pure state-machine tests for eliminationReduction.js against the Day 1
 * system (solution (3,1,5)), mirroring how systemsWorkspace3x3Engine.test.mjs
 * pins substitutionReduction.js. Covers the richer multiplier/distribution/
 * cancellation/combination-arithmetic interaction added in response to
 * review feedback on PR #360: scaling an equation requires distributing the
 * multiplier across every term, and cancellation is an intentional action
 * before the reduced equation is accepted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReductionSystem, reductionAnswerKey } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import {
  activeEliminationRoundKey,
  applyEliminationMultiplier,
  attemptEliminationBackPlacement,
  checkEliminationCombination,
  checkEliminationMultiplierProducts,
  chooseEliminationPair,
  chooseEliminationVariable,
  eliminationBackSubstitutionDestinations,
  eliminationBackSubstitutionEquation,
  eliminationKnownSolution,
  eliminationPairOptions,
  eliminationPhase,
  eliminationReducedSystem,
  eliminationRoundEliminates,
  eliminationRoundStage,
  emptyEliminationState,
  recordEliminationBackSolve,
  repairEliminationState,
  resetEliminationRound,
  setEliminationCombinationTerm,
  setEliminationMultiplierDraft,
  setEliminationMultiplierProductTerm,
  setEliminationOperation,
  toggleEliminationCancellation,
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

/* -------------------------------------------------- scaling / distribution */

test('scaling is optional: a blank multiplier means no scaling needed, applied immediately with no per-term entry', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'multiplier');
  const appliedA = applyEliminationMultiplier(state, system, 'round1', 'E1');
  assert.equal(appliedA.feedback, null);
  state = appliedA.state;
  assert.equal(state.rounds.round1.multiplierValues.E1, 1);
  assert.equal(state.rounds.round1.multiplierWork.E1, undefined, 'an identity scale never opens a term-entry stage');
});

test('a non-identity scale factor opens a term-by-term distribution stage, checked against the true product, never computed for the student', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationMultiplierDraft(state, 'round1', 'E2', '2').state;
  const applied = applyEliminationMultiplier(state, system, 'round1', 'E2');
  assert.equal(applied.feedback, null);
  state = applied.state;
  assert.ok(state.rounds.round1.multiplierWork.E2.active, 'distribution stage must open for a non-identity multiplier');
  assert.equal(state.rounds.round1.multiplierValues.E2, undefined, 'not applied until the products are checked');

  // -x + y + z = 3, scaled by 2, is -2x + 2y + 2z = 6.
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'x', '-2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'y', '2').state;
  const wrongConstant = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'constant', '5').state;
  const wrongCheck = checkEliminationMultiplierProducts(wrongConstant, system, 'round1', 'E2');
  assert.ok(wrongCheck.feedback, 'an incorrect distributed term must be rejected, not silently accepted');
  assert.equal(wrongCheck.feedback.reason, 'incorrect-products');
  assert.equal(wrongCheck.state.rounds.round1.multiplierValues.E2, undefined);

  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'z', '2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'constant', '6').state;
  const rightCheck = checkEliminationMultiplierProducts(state, system, 'round1', 'E2');
  assert.equal(rightCheck.feedback, null);
  assert.equal(rightCheck.state.rounds.round1.multiplierValues.E2, 2);
  assert.equal(rightCheck.state.rounds.round1.multiplierWork.E2, undefined, 'the work area closes once accepted');
});

test('a bare coefficient (not a full term) is also accepted for the distributed product, matching the 2x2 elimination convention', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = setEliminationMultiplierDraft(state, 'round1', 'E2', '2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'x', '-2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'y', '2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'z', '2z').state; // a full term is also fine
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'constant', '6').state;
  const check = checkEliminationMultiplierProducts(state, system, 'round1', 'E2');
  assert.equal(check.feedback, null);
});

/* ------------------------------------------------------------- operation */

test('the operation cannot be chosen until both equations of the pair are scaled', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state; // only E1 applied
  const attempt = setEliminationOperation(state, 'round1', 'add');
  assert.equal(attempt.state.rounds.round1.operation, null, 'operation must wait for both equations to be scaled');
});

test('an operation that does not eliminate the target variable is recorded but flagged, so the student can try the other one', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationOperation(state, 'round1', 'subtract').state; // y coefficients are -1 and +1: subtract does NOT eliminate y
  assert.equal(state.rounds.round1.operation, 'subtract');
  assert.equal(eliminationRoundEliminates(state, system, 'round1'), false);
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'operation', 'a non-eliminating operation must not advance to cancellation');

  const fixed = setEliminationOperation(state, 'round1', 'add').state;
  assert.equal(eliminationRoundEliminates(fixed, system, 'round1'), true);
  assert.equal(eliminationRoundStage(fixed, system, 'round1'), 'cancellation');
});

/* ----------------------------------------------------------- cancellation */

test('cancellation is intentional and per-equation: the combination stage opens only once BOTH equations are marked', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'cancellation');

  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  assert.equal(state.rounds.round1.combinationWork, null, 'only one of two equations marked; combination must stay closed');
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'cancellation');

  state = toggleEliminationCancellation(state, system, 'round1', 'E2').state;
  assert.ok(state.rounds.round1.combinationWork, 'both equations marked; combination work area opens');
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'combination');

  // Toggling one back off closes it again — the marking is a real, reversible decision.
  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  assert.equal(state.rounds.round1.combinationWork, null);
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'cancellation');
});

test('cancellation cannot be marked before an eliminating operation is chosen', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  // No operation chosen yet.
  const attempt = toggleEliminationCancellation(state, system, 'round1', 'E1');
  assert.deepEqual(attempt.state.rounds.round1.cancelledEquations, {});
});

/* ------------------------------------------------------- combination arithmetic */

test('the full round: identity scaling, add, mark both cancelling terms, and term-by-term combination arithmetic — the Day 1 system', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state; // 2x-y+2z=15, -x+y+z=3
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E2').state;
  assert.equal(eliminationRoundStage(state, system, 'round1'), 'combination');

  // (2x - y + 2z) + (-x + y + z) = x + 3z; 15 + 3 = 18.
  const wrong = setEliminationCombinationTerm(state, 'round1', 'x', '2').state;
  const wrongChecked = checkEliminationCombination(wrong, system, 'round1');
  assert.ok(wrongChecked.feedback);
  assert.equal(wrongChecked.feedback.reason, 'not-equivalent');
  assert.equal(wrongChecked.state.rounds.round1.combinedText, null);

  state = setEliminationCombinationTerm(state, 'round1', 'x', '1').state;
  state = setEliminationCombinationTerm(state, 'round1', 'z', '3').state;
  state = setEliminationCombinationTerm(state, 'round1', 'constant', '18').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.equal(checked.feedback, null, JSON.stringify(checked.feedback));
  assert.equal(checked.state.rounds.round1.combinedText, 'x + 3z = 18');
  assert.equal(eliminationRoundStage(checked.state, system, 'round1'), 'done');
});

test('multiple valid routes: a different pair, a non-identity multiplier, and subtraction also reduce correctly', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  // E1 (2x - y + 2z = 15) and E3 (3x - y + 2z = 18): subtract directly (y coefficients equal) -> -x = -3.
  state = chooseEliminationPair(state, system, 'round1', 'E1E3').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E3').state;
  state = setEliminationOperation(state, 'round1', 'subtract').state;
  assert.equal(eliminationRoundEliminates(state, system, 'round1'), true);
  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E3').state;
  state = setEliminationCombinationTerm(state, 'round1', 'x', '-1').state;
  state = setEliminationCombinationTerm(state, 'round1', 'z', '0').state;
  state = setEliminationCombinationTerm(state, 'round1', 'constant', '-3').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.equal(checked.feedback, null, JSON.stringify(checked.feedback));
  assert.equal(checked.state.rounds.round1.combinedText, '-x = -3');
});

/* ---------------------------------------------------------------- full flow */

test('the full elimination round reduces the Day 1 system to a correct, independent 2×2, then solves through to the ordered triple', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  assert.equal(eliminationPhase(state, system, {}), 'round1-pair');

  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  assert.equal(activeEliminationRoundKey(state), 'round1');
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationOperation(state, 'round1', 'add').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E2').state;
  state = setEliminationCombinationTerm(state, 'round1', 'x', '1').state;
  state = setEliminationCombinationTerm(state, 'round1', 'z', '3').state;
  state = setEliminationCombinationTerm(state, 'round1', 'constant', '18').state;
  state = checkEliminationCombination(state, system, 'round1').state;
  assert.equal(eliminationPhase(state, system, {}), 'round2-pair');

  state = chooseEliminationPair(state, system, 'round2', 'E2E3').state;
  // E2 (-x + y + z = 3) + E3 (3x - y + 2z = 18) = 2x + 3z = 21.
  state = applyEliminationMultiplier(state, system, 'round2', 'E2').state;
  state = applyEliminationMultiplier(state, system, 'round2', 'E3').state;
  state = setEliminationOperation(state, 'round2', 'add').state;
  state = toggleEliminationCancellation(state, system, 'round2', 'E2').state;
  state = toggleEliminationCancellation(state, system, 'round2', 'E3').state;
  state = setEliminationCombinationTerm(state, 'round2', 'x', '2').state;
  state = setEliminationCombinationTerm(state, 'round2', 'z', '3').state;
  state = setEliminationCombinationTerm(state, 'round2', 'constant', '21').state;
  state = checkEliminationCombination(state, system, 'round2').state;
  assert.equal(activeEliminationRoundKey(state), null);
  assert.equal(eliminationPhase(state, system, {}), 'subsystem');

  const reduced = eliminationReducedSystem(state, system);
  assert.deepEqual(reduced.variables, ['x', 'z']);
  assert.equal(reduced.equations[0].text, 'x + 3z = 18');
  assert.equal(reduced.equations[1].text, '2x + 3z = 21');

  const reducedSolution = { x: 3, z: 5 };
  assert.equal(eliminationPhase(state, system, { reducedSolution }), 'back-substitute');

  const destinations = eliminationBackSubstitutionDestinations(state, system);
  assert.ok(destinations.length >= 1);
  const destination = destinations[0];
  state = attemptEliminationBackPlacement(state, system, reducedSolution, destination.id, 'x', 'x').state;
  state = attemptEliminationBackPlacement(state, system, reducedSolution, destination.id, 'z', 'z').state;
  const backEquation = eliminationBackSubstitutionEquation(state, system, reducedSolution);
  assert.ok(backEquation, 'a fully-placed back-substitution destination must be ready to solve');

  state = recordEliminationBackSolve(state, 1, '1').state;
  assert.equal(eliminationPhase(state, system, { reducedSolution }), 'verify');

  const solution = eliminationKnownSolution(state, reducedSolution);
  assert.deepEqual(solution, { x: 3, z: 5, y: 1 });
});

/* --------------------------------------------------------------- repair */

test('repairEliminationState replays a persisted draft through the full stage sequence, including distribution and cancellation', () => {
  const system = buildSystem();
  let state = chooseEliminationVariable(emptyEliminationState(), system, 'y').state;
  state = chooseEliminationPair(state, system, 'round1', 'E1E2').state;
  // Scale BOTH equations by 2 (not mathematically necessary here, but a
  // valid student choice) and add: still eliminates y.
  // 2*(2x-y+2z=15) = 4x-2y+4z=30; 2*(-x+y+z=3) = -2x+2y+2z=6; sum: 2x+6z=36.
  state = setEliminationMultiplierDraft(state, 'round1', 'E1', '2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E1').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'x', '4').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'y', '-2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'z', '4').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'constant', '30').state;
  state = checkEliminationMultiplierProducts(state, system, 'round1', 'E1').state;
  assert.equal(state.rounds.round1.multiplierValues.E1, 2);

  state = setEliminationMultiplierDraft(state, 'round1', 'E2', '2').state;
  state = applyEliminationMultiplier(state, system, 'round1', 'E2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'x', '-2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'y', '2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'z', '2').state;
  state = setEliminationMultiplierProductTerm(state, 'round1', 'E2', 'constant', '6').state;
  state = checkEliminationMultiplierProducts(state, system, 'round1', 'E2').state;
  assert.equal(state.rounds.round1.multiplierValues.E2, 2);

  state = setEliminationOperation(state, 'round1', 'add').state;
  assert.equal(eliminationRoundEliminates(state, system, 'round1'), true);
  state = toggleEliminationCancellation(state, system, 'round1', 'E1').state;
  state = toggleEliminationCancellation(state, system, 'round1', 'E2').state;
  state = setEliminationCombinationTerm(state, 'round1', 'x', '2').state;
  state = setEliminationCombinationTerm(state, 'round1', 'z', '6').state;
  state = setEliminationCombinationTerm(state, 'round1', 'constant', '36').state;
  const checked = checkEliminationCombination(state, system, 'round1');
  assert.equal(checked.feedback, null, JSON.stringify(checked.feedback));
  state = checked.state;
  assert.equal(state.rounds.round1.combinedText, '2x + 6z = 36');

  const repaired = repairEliminationState(state, system);
  assert.equal(repaired.rounds.round1.combinedText, '2x + 6z = 36');
  assert.equal(repaired.rounds.round1.multiplierValues.E1, 2);
  assert.equal(repaired.rounds.round1.multiplierValues.E2, 2);
});

test('repairEliminationState drops an unauthored eliminated variable entirely', () => {
  const system = buildSystem();
  const repaired = repairEliminationState({ version: 2, variable: 'q', rounds: {} }, system);
  assert.deepEqual(repaired, emptyEliminationState());
});

test('repairEliminationState rejects a draft from an older state-shape version rather than misreading it', () => {
  const system = buildSystem();
  const repaired = repairEliminationState({ version: 1, variable: 'y', rounds: {} }, system);
  assert.deepEqual(repaired, emptyEliminationState());
});
