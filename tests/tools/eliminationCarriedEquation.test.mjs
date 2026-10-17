import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildReductionSystem, reductionAnswerKey } from '../../functions/shared/toolMath/systemsWorkspace/substitutionReduction.mjs';
import { linearEquationForm, validateAlgebraicSystemAuthoring } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import {
  applyEliminationMultiplier,
  carryEliminationEquation,
  checkEliminationCombination,
  chooseEliminationPair,
  chooseEliminationVariable,
  eliminationBackSubstitutionDestinations,
  eliminationCarryOptions,
  eliminationOutcome,
  eliminationPhase,
  eliminationReducedSystem,
  eliminationRoundStage,
  eliminationSeparatedReduction,
  emptyEliminationState,
  repairEliminationState,
  setEliminationCombinationTerm,
  setEliminationOperation,
  toggleEliminationCancellation,
} from '../../functions/shared/toolMath/systemsWorkspace/eliminationReduction.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * PR-23 (Codex on #391): A 3×3 WHERE AN EQUATION HAS NO TERM IN THE VARIABLE
 * THE STUDENT ELIMINATES.
 *
 * Elimination refused every pair holding such an equation ("variable-absent")
 * and offered nothing else, so on x + z = 1, x + y = 3, y − z = 1 a student who
 * eliminated any variable could finish one round and never a second. The
 * equation already has the variable eliminated: it is now brought down as it
 * is, as one round's reduced equation. A variable written in NO equation is
 * refused at authoring (it is no unknown of the system) and, for a question
 * stored before that, when the student picks it.
 *
 * The shared grader never reads the rounds (only the values, the
 * verification sides, or the final statement), so no grade moves.
 */

const XYZ = ['x', 'y', 'z'];
const system = (equations) => buildReductionSystem({ variables: XYZ, equations });
const chooseX = (sys) => chooseEliminationVariable(emptyEliminationState(), sys, 'x').state;
const satisfies = (text, variables, values) => {
  const form = linearEquationForm(text, variables);
  const left = variables.reduce((sum, name) => sum + (form.coefficients[name] || 0) * values[name], 0);
  return Math.abs(left - form.constant) < 1e-9;
};
// Play a round on a pair that needs no scaling: as written, the operation, both
// cancellations, and the student's own combined terms.
const playPair = (state, sys, roundKey, pairId, operation, terms) => {
  let next = chooseEliminationPair(state, sys, roundKey, pairId);
  assert.equal(next.feedback, null, `pair ${pairId}`);
  next = next.state;
  for (const id of next.rounds[roundKey].pair) next = applyEliminationMultiplier(next, sys, roundKey, id).state;
  next = setEliminationOperation(next, roundKey, operation).state;
  for (const id of next.rounds[roundKey].pair) next = toggleEliminationCancellation(next, sys, roundKey, id).state;
  for (const [key, value] of Object.entries(terms)) next = setEliminationCombinationTerm(next, roundKey, key, value).state;
  const checked = checkEliminationCombination(next, sys, roundKey);
  assert.equal(checked.feedback, null, `combination of ${pairId}`);
  return checked.state;
};

test('x in two equations: the pair with x is combined and the equation without x is brought down', () => {
  // x + y + z = 6, x − y = 1, y + z = 5  →  (1, 0, 5)
  const sys = system(['x + y + z = 6', 'x - y = 1', 'y + z = 5']);
  const key = reductionAnswerKey(sys);
  assert.deepEqual(key.solution, { x: 1, y: 0, z: 5 });
  let state = chooseX(sys);
  assert.deepEqual(eliminationCarryOptions(state, sys).map((option) => option.id), ['E3']);

  // Pairing E3 is still refused, and the refusal now has somewhere to point.
  assert.equal(chooseEliminationPair(state, sys, 'round1', 'E1E3').feedback.reason, 'variable-absent');
  // An equation that has x cannot be brought down as it is.
  assert.equal(carryEliminationEquation(state, sys, 'round1', 'E1').feedback.reason, 'carry-has-variable');

  state = playPair(state, sys, 'round1', 'E1E2', 'subtract', { y: '2', z: '1', constant: '5' });
  assert.equal(eliminationPhase(state, sys), 'round2-pair');
  const carried = carryEliminationEquation(state, sys, 'round2', 'E3');
  assert.equal(carried.feedback, null);
  state = carried.state;
  assert.equal(state.rounds.round2.carried, true);
  assert.equal(eliminationRoundStage(state, sys, 'round2'), 'done');
  assert.equal(eliminationPhase(state, sys), 'subsystem', 'the reduced 2×2 opens: the student is not stranded');

  const reduced = eliminationReducedSystem(state, sys);
  assert.deepEqual(reduced.equations.map((equation) => [equation.text, equation.fromPair]), [['2y + z = 5', ['E1', 'E2']], ['y + z = 5', ['E3']]]);
  // The reduced system holds at the true solution, and determines it.
  for (const equation of reduced.equations) assert.ok(satisfies(equation.text, ['y', 'z'], key.solution), equation.text);
  assert.deepEqual(eliminationBackSubstitutionDestinations(state, sys).map((equation) => equation.id), ['E1', 'E2']);
  // A resumed draft reopens on the same work.
  assert.deepEqual(repairEliminationState(JSON.parse(JSON.stringify(state)), sys), state);
});

test('x in one equation: both other equations are brought down, each once, and the one with x gives x back', () => {
  const sys = system(['x + y + z = 6', 'y + z = 5', 'z = 3']);
  let state = chooseX(sys);
  assert.deepEqual(eliminationCarryOptions(state, sys).map((option) => option.id), ['E2', 'E3']);
  state = carryEliminationEquation(state, sys, 'round1', 'E2').state;
  assert.equal(carryEliminationEquation(state, sys, 'round2', 'E2').feedback.reason, 'carry-repeated');
  state = carryEliminationEquation(state, sys, 'round2', 'E3').state;
  assert.equal(eliminationPhase(state, sys), 'subsystem');
  assert.deepEqual(eliminationReducedSystem(state, sys).equations.map((equation) => equation.text), ['y + z = 5', 'z = 3']);
  assert.deepEqual(eliminationBackSubstitutionDestinations(state, sys).map((equation) => equation.id), ['E1']);
  assert.deepEqual(repairEliminationState(JSON.parse(JSON.stringify(state)), sys), state);

  // A stored "brought down" round that is not one (tampered, or the question
  // was edited so the equation now has x) is dropped on repair.
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.rounds.round1 = { ...tampered.rounds.round1, pair: ['E1'], combinedText: 'y + z = 6' };
  const repaired = repairEliminationState(tampered, sys);
  assert.equal(repaired.rounds.round1.pair, null);
  assert.equal(repaired.rounds.round2.carried, true);
});

test('a brought-down equation is a settled row: a pair that cancels to 0 = 0 plus it is a dependent system', () => {
  const sys = system(['x + y + z = 2', 'x + y + z = 2', 'y - z = 1']);
  assert.equal(reductionAnswerKey(sys).type, 'infinite');
  let state = playPair(chooseX(sys), sys, 'round1', 'E1E2', 'subtract', { y: '0', z: '0', constant: '0' });
  // One identity alone says nothing about the third equation.
  assert.equal(eliminationOutcome(state, sys), null);
  state = carryEliminationEquation(state, sys, 'round2', 'E3').state;
  assert.equal(eliminationOutcome(state, sys)?.type, 'infinite');
});

test('rows that each hold one different variable: y = 2, z = 3 is the 2×2 solved; 2y = 4, z = 3 has no 2×2 to run', () => {
  // Integrator review: {y = 2, z = 3} offered Substitution and Elimination,
  // and neither could do anything with it.
  const bringBothDown = (equations) => {
    const sys = system(equations);
    let state = chooseX(sys);
    state = carryEliminationEquation(state, sys, 'round1', 'E2').state;
    state = carryEliminationEquation(state, sys, 'round2', 'E3').state;
    return { sys, state };
  };
  const unit = bringBothDown(['x + y + z = 6', 'y = 2', 'z = 3']);
  assert.deepEqual(eliminationSeparatedReduction(unit.state, unit.sys), { solution: { y: 2, z: 3 } });
  // With that as the 2×2's solution the work goes on to back-substitution.
  assert.equal(eliminationPhase(unit.state, unit.sys, { reducedSolution: { y: 2, z: 3 } }), 'back-substitute');
  const scaled = bringBothDown(['x + y + z = 6', '2y = 4', 'z = 3']);
  assert.deepEqual(eliminationSeparatedReduction(scaled.state, scaled.sys), { solution: null }, 'nothing computed for the student');
  // Any row with two variables is an ordinary 2×2.
  const ordinary = bringBothDown(['x + y + z = 6', 'y + z = 5', 'z = 3']);
  assert.equal(eliminationSeparatedReduction(ordinary.state, ordinary.sys), null);
  // So is the same variable twice: y = 2 and y = 2 leave z free, which is the
  // 2×2's own dependent outcome to find.
  const same = bringBothDown(['x + y + z = 6', 'y = 2', 'y = 2']);
  assert.equal(eliminationSeparatedReduction(same.state, same.sys), null);
  // One round only: no reduced system yet.
  assert.equal(eliminationSeparatedReduction(chooseX(unit.sys), unit.sys), null);
});

test('a variable written in no equation: refused when chosen; a warning at authoring for the algebraic workspace', () => {
  const equations = ['x = 1', 'y = 2', 'x + y = 3'];
  const sys = system(equations);
  const refused = chooseEliminationVariable(emptyEliminationState(), sys, 'z');
  assert.equal(refused.feedback.reason, 'variable-nowhere');
  assert.equal(refused.state.variable, null);
  assert.equal(repairEliminationState({ ...emptyEliminationState(), variable: 'z' }, sys).variable, null);
  // Written as 0z it is still nowhere.
  assert.equal(chooseEliminationVariable(emptyEliminationState(), system(['x + 0z = 1', 'y = 2', 'x + y = 3']), 'z').feedback.reason, 'variable-nowhere');

  // A WARNING, not an error: such a system works by elimination today (the
  // integrator's x + y = 3, 2x + 2y = 6, x − y = 1 reaches 0 = 0), and an error
  // blocked reusing saved assignments.
  for (const method of ['elimination', 'substitution', 'studentChoice']) {
    const { warnings } = validateAlgebraicSystemAuthoring({ equations, variables: XYZ, method });
    assert.equal(warnings.length, 1, method);
    assert.match(warnings[0], /z has a zero coefficient in all three equations/);
  }
  const works = ['x + y = 3', '2x + 2y = 6', 'x - y = 1'];
  assert.deepEqual(validateAlgebraicSystemAuthoring({ equations: works, variables: XYZ, method: 'elimination' }).errors, []);
  const base = { type: 'systemsWorkspace', prompt: 'Solve.', variables: XYZ };
  const elimination = validateToolQuestion({ ...base, equations: works, mode: 'algebraic', method: 'elimination' });
  assert.equal(elimination.isValid, true);
  assert.ok(elimination.warnings.some((warning) => /z has a zero coefficient/.test(warning)));
  assert.match(validateAlgebraicSystemAuthoring({ equations: ['x + 0z = 1', 'y = 2', 'x + y = 3'], variables: XYZ, method: 'elimination' }).warnings[0] || '', /z has a zero coefficient/, '0z is read by its coefficient');
  // An authored mode 'spatial' that renders this workspace (solveSystem) is
  // validated as the algebraic system it is.
  const routedAlgebraic = validateToolQuestion({ ...base, equations: works, mode: 'spatial', studentActions: ['solveSystem'], method: 'elimination' });
  assert.ok(routedAlgebraic.warnings.some((warning) => /z has a zero coefficient/.test(warning)), JSON.stringify(routedAlgebraic));
  // Three planes may leave out a variable (vertical planes) — including a
  // three-plane model authored with no mode, which resolves to spatial: no
  // error and nothing reported.
  for (const spatialQuestion of [{ ...base, equations, mode: 'spatial', spatialModel: { kind: 'threePlanes' } }, { ...base, equations, studentActions: ['connectRepresentations'], spatialModel: { kind: 'threePlanes' } }]) {
    const result = validateToolQuestion(spatialQuestion);
    assert.deepEqual(result.errors, [], JSON.stringify(spatialQuestion.mode));
    assert.ok(!result.warnings.some((warning) => /zero coefficient/.test(warning)), JSON.stringify(spatialQuestion.mode));
  }
  // Missing from SOME equations is fine: elimination brings those down.
  const cyclic = validateAlgebraicSystemAuthoring({ equations: ['2x + 2z = 2', '5x + 3y = 4', '3y - 4z = 4'], variables: XYZ, method: 'elimination' });
  assert.deepEqual([cyclic.errors, cyclic.warnings], [[], []]);
});

test('the elimination screen offers bringing an equation down and draws the round it makes', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const mode = executableSource(read('src/tools/systemsWorkspace/EliminationReductionMode.jsx'));
  const choice = region(mode, 'function EliminationPairChoice(', '\nfunction ', 'pair choice');
  assert.match(choice, /const carryOptions = useMemo\(\(\) => eliminationCarryOptions\(elimination, system\), \[elimination, system\]\);/);
  assert.match(choice, /carryOptions\.map\(\(option\) => \([\s\S]*?onClick=\{\(\) => apply\(carryEliminationEquation\(elimination, system, roundKey, option\.id\)\)\}/);
  const board = region(mode, 'function EliminationRoundBoard(', 'const [idA, idB] = round.pair;', 'round board');
  assert.match(board, /if \(round\.carried\) return <EliminationCarriedRound /);
  // The separated 2×2: its rows are the solution, or the student is pointed back.
  assert.match(mode, /const reducedSolution = separated \? separated\.solution : \(subsystemState\?\.solution \|\| null\);/);
  assert.match(mode, /\{reduced && !separated \? \(\s*<div className="mathmaster-reduction-subsystem"/, 'no 2×2 workflow is offered on separated rows');
  const feedback = region(mode, 'const feedbackText = ', '\n};', 'feedback text');
  for (const reason of ['variable:variable-nowhere', 'pair:carry-repeated', 'pair:carry-has-variable']) {
    assert.match(feedback, new RegExp(`case '${reason}':\\s*return `), reason);
  }
});
