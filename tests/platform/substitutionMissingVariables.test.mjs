/*
 * TL11 / C2-136: 3×3 SUBSTITUTION WITH EQUATIONS THAT MISS A VARIABLE.
 *
 * The elimination workspace was fixed for a reduced 2×2 whose rows each hold one
 * different variable (y = 4 and z = 3): there is nothing to substitute or
 * eliminate between them, so the 2×2 workflow cannot run (eliminationSeparatedReduction).
 * The substitution workspace was never checked against the same rows and left a
 * student stranded at them: isolate x in x + y = 5, carry y = 4 and z = 3 over, and
 * the embedded 2×2 offers no move that goes anywhere.
 *
 * substitutionSeparatedReduction reads those rows the way its elimination twin
 * does: when each already reads `variable = value` they ARE the 2×2's solution,
 * nothing is computed for the student, and the work goes to back-substitution;
 * otherwise (2y = 8) the screen says so and points the student back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/tools/systemsWorkspace/substitutionReduction.js';

const XYZ = ['x', 'y', 'z'];
const system = (equations) => R.buildReductionSystem({ variables: XYZ, equations });
const play = (moves, start = R.emptyReductionState()) => moves.reduce((state, move) => {
  const { state: next, feedback } = move(state);
  assert.equal(feedback, null, `unexpected rejection ${JSON.stringify(feedback)}`);
  return next;
}, start);
/** Isolate x in E1 (x + y = 5 -> x = -y + 5), then bring the other two down as they are. */
const carriedRound = (equations) => {
  const sys = system(equations);
  return [sys, play([
    (s) => R.chooseReductionSource(s, sys, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, sys, '-y + 5'),
    (s) => R.useIsolatedExpressionAsToken(s, sys),
    (s) => R.carryTargetUnchanged(s, sys, 'E2'),
    (s) => R.carryTargetUnchanged(s, sys, 'E3'),
  ])];
};

test('rows that each hold one different variable are the 2×2\'s solution, and the round runs to a graded finish', () => {
  const [sys, reduced] = carriedRound(['x + y = 5', 'y = 4', 'z = 3']);
  assert.deepEqual(R.reducedSystem(reduced, sys).equations.map((row) => row.text), ['y = 4', 'z = 3']);
  const separated = R.substitutionSeparatedReduction(reduced, sys);
  assert.deepEqual(separated, { solution: { y: 4, z: 3 } }, 'read from the student\'s own rows, nothing computed');
  // Without a solution the round waits at the 2×2; with the rows' own values it moves on.
  assert.equal(R.reductionPhase(reduced, sys), 'subsystem');
  assert.equal(R.reductionPhase(reduced, sys, { reducedSolution: separated.solution }), 'back-substitute');

  // Back-substitution asks only for the values the relationship mentions: z never appears in x = -y + 5.
  let state = R.attemptBackPlacement(reduced, sys, separated.solution, R.RELATION_DESTINATION_ID, 'y', 'y').state;
  assert.equal(R.backSubstitutionEquation(state, sys, separated.solution), 'x = -(4) + 5');
  state = R.recordBackSolve(state, 1, '1').state;
  const solution = R.knownSolution(state, separated.solution);
  assert.deepEqual(solution, { y: 4, z: 3, x: 1 });
  const answers = { E1: '5', E2: '4', E3: '3' };
  sys.equations.forEach((equation) => {
    R.verificationVariables(sys, equation.id).forEach((name) => { state = R.placeVerificationValue(state, sys, equation.id, name, name).state; });
    state = R.setVerificationAnswer(state, equation.id, 'leftAnswer', answers[equation.id]).state;
    state = R.checkVerification(state, sys, solution, equation.id).state;
  });
  assert.equal(R.reductionPhase(state, sys, { reducedSolution: separated.solution }), 'complete');
  assert.equal(R.gradeReduction(state, sys, separated.solution).isCorrect, true);
});

test('rows that are separated but not yet values (2y = 8) say so, so the student can go back', () => {
  const [sys, reduced] = carriedRound(['x + y = 5', '2y = 8', 'z = 3']);
  assert.deepEqual(R.reducedSystem(reduced, sys).equations.map((row) => row.text), ['2y = 8', 'z = 3']);
  assert.deepEqual(R.substitutionSeparatedReduction(reduced, sys), { solution: null });
  assert.equal(R.reductionPhase(reduced, sys), 'subsystem');
});

test('rows that the 2×2 workflow can work on are not separated', () => {
  // A row with two variables.
  const [mixedSystem, mixed] = carriedRound(['x + y = 5', 'y + z = 7', 'z = 3']);
  assert.ok(R.reducedSystem(mixed, mixedSystem));
  assert.equal(R.substitutionSeparatedReduction(mixed, mixedSystem), null);
  // Both rows about the same variable.
  const [sameSystem, same] = carriedRound(['x + y = 5', 'y = 4', 'y = 4']);
  assert.equal(R.substitutionSeparatedReduction(same, sameSystem), null);
  // An ordinary round: two rows in two variables.
  const ordinary = system(['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4']);
  const reduced = play([
    (s) => R.chooseReductionSource(s, ordinary, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, ordinary, '-(y) - (z) + (6)'),
    (s) => R.useIsolatedExpressionAsToken(s, ordinary),
    (s) => R.attemptTargetSubstitution(s, ordinary, 'E2', 'x'),
    (s) => R.attemptTargetSubstitution(s, ordinary, 'E3', 'x'),
    (s) => R.openTargetSimplification(s, 'E2'),
    (s) => R.recordTargetStandardForm(s, ordinary, 'E2', '-3 y+ z = -3'),
    (s) => R.recordTargetStandardForm(s, ordinary, 'E3', '- y-4 z = -14'),
  ]);
  assert.ok(R.reducedSystem(reduced, ordinary));
  assert.equal(R.substitutionSeparatedReduction(reduced, ordinary), null);
  // Nothing yet reduced, or one row reduced, has no pair of rows to read.
  const halfSystem = system(['x + y = 5', 'y = 4', 'z = 3']);
  const half = play([
    (s) => R.chooseReductionSource(s, halfSystem, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, halfSystem, '-y + 5'),
    (s) => R.useIsolatedExpressionAsToken(s, halfSystem),
    (s) => R.carryTargetUnchanged(s, halfSystem, 'E2'),
  ]);
  assert.equal(R.substitutionSeparatedReduction(half, halfSystem), null);
  assert.equal(R.substitutionSeparatedReduction(R.emptyReductionState(), halfSystem), null);
  // A round that ended in a statement has no rows either.
  const statementSystem = system(['x = 3 - y - z', '2x + 2y + 2z = 6', 'y + z = 3']);
  let statement = play([
    (s) => R.chooseReductionSource(s, statementSystem, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, statementSystem, '3 - y - z'),
    (s) => R.useIsolatedExpressionAsToken(s, statementSystem),
    (s) => R.attemptTargetSubstitution(s, statementSystem, 'E2', 'x'),
    (s) => R.carryTargetUnchanged(s, statementSystem, 'E3'),
    (s) => R.setTargetStatementAnswer(s, 'E2', 'left', '6'),
  ]);
  statement = R.checkTargetStatement(statement, statementSystem, 'E2').state;
  assert.ok(R.substitutionOutcome(statement, statementSystem), 'the round ended in a statement');
  assert.equal(R.substitutionSeparatedReduction(statement, statementSystem), null);
});
