/*
 * ISSUE #341: SUBSTITUTION AS DIMENSIONAL REDUCTION — THE ROUND AS DATA.
 *
 * src/tools/systemsWorkspace/substitutionReduction.js holds a 3×3 round's
 * lineage and every transition as a pure function, so the workflow can be
 * proved here without rendering: the student's decisions are the only thing
 * that moves it, every rejection is neutral, every phase survives a
 * serialise/restore, a stale or tampered draft is repaired to exactly the
 * work that is still true, and nothing about it is specific to three.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/tools/systemsWorkspace/substitutionReduction.js';

const SYSTEM = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'] });
const REDUCED_SOLUTION = { y: 2, z: 3 };

/** Replay a list of transitions, failing on any unexpected rejection. */
const play = (moves, start = R.emptyReductionState()) => moves.reduce((state, move) => {
  const { state: next, feedback } = move(state);
  assert.equal(feedback, null, `unexpected rejection ${JSON.stringify(feedback)}`);
  return next;
}, start);

const isolate = (state) => play([
  (s) => R.chooseReductionSource(s, SYSTEM, 'E1', 'x'),
  (s) => R.recordIsolatedExpression(s, SYSTEM, '-(y) - (z) + (6)'),
  (s) => R.useIsolatedExpressionAsToken(s, SYSTEM),
], state);

const reduceBoth = (state) => play([
  (s) => R.attemptTargetSubstitution(s, SYSTEM, 'E2', 'x'),
  (s) => R.attemptTargetSubstitution(s, SYSTEM, 'E3', 'x'),
  (s) => R.openTargetSimplification(s, 'E2'),
  (s) => R.recordTargetStandardForm(s, SYSTEM, 'E2', '-3 y+ z = -3'),
  (s) => R.recordTargetStandardForm(s, SYSTEM, 'E3', '- y-4 z = -14'),
], state);

const backSolve = (state) => play([
  (s) => R.attemptBackPlacement(s, SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'y', 'y'),
  (s) => R.attemptBackPlacement(s, SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'z', 'z'),
  (s) => R.recordBackSolve(s, 1, '1'),
], state);

const verifyAll = (state) => {
  const solution = R.knownSolution(state, REDUCED_SOLUTION);
  const sides = { E1: '6', E2: '9', E3: '4' };
  return SYSTEM.equations.reduce((current, equation) => {
    let next = current;
    R.verificationVariables(SYSTEM, equation.id).forEach((name) => { next = R.placeVerificationValue(next, SYSTEM, equation.id, name, name).state; });
    next = R.setVerificationAnswer(next, equation.id, 'leftAnswer', sides[equation.id]).state;
    next = R.setVerificationAnswer(next, equation.id, 'rightAnswer', sides[equation.id]).state;
    return R.checkVerification(next, SYSTEM, solution, equation.id).state;
  }, state);
};

const phase = (state, reducedSolution = null) => R.reductionPhase(state, SYSTEM, { reducedSolution });

test('the phase is derived from lineage alone, through the whole solve', () => {
  let state = R.emptyReductionState();
  assert.equal(phase(state), 'choose-source');
  state = R.chooseReductionSource(state, SYSTEM, 'E1', 'x').state;
  assert.equal(phase(state), 'isolate');
  state = R.recordIsolatedExpression(state, SYSTEM, '-(y) - (z) + (6)').state;
  assert.equal(phase(state), 'prepare-token');
  // Step Algebra's bookkeeping parentheses are dropped; nothing else is.
  assert.equal(state.isolation.expression, '-y - z + 6');
  state = R.useIsolatedExpressionAsToken(state, SYSTEM).state;
  assert.equal(phase(state), 'reduce');
  state = reduceBoth(state);
  assert.equal(phase(state), 'subsystem');
  assert.equal(phase(state, REDUCED_SOLUTION), 'back-substitute');
  state = backSolve(state);
  assert.equal(phase(state, REDUCED_SOLUTION), 'verify');
  state = verifyAll(state);
  assert.equal(phase(state, REDUCED_SOLUTION), 'complete');
  const grade = R.gradeReduction(state, SYSTEM, REDUCED_SOLUTION);
  assert.equal(grade.isCorrect, true);
  assert.deepEqual(grade.solution, { x: 1, y: 2, z: 3 });
});

test('the reduced system carries lineage: which original each equation came from, and what the substitution first produced', () => {
  const reduced = R.reducedSystem(reduceBoth(isolate(R.emptyReductionState())), SYSTEM);
  assert.deepEqual(reduced.variables, ['y', 'z']);
  assert.deepEqual(reduced.equations.map((equation) => [equation.id, equation.fromEquationId, equation.text]), [
    ['R1', 'E2', '-3 y + z = -3'],
    ['R2', 'E3', '-y - 4 z = -14'],
  ]);
  assert.match(reduced.equations[0].rawText, /^2 \* \(-y - z \+ 6\)/);
  assert.equal(R.reducedSystemIdentity(reduced), R.reducedSystemIdentity(JSON.parse(JSON.stringify(reduced))));
});

test('the token reaches both targets in either order, and each target only once', () => {
  const tokenReady = isolate(R.emptyReductionState());
  const e3First = play([
    (s) => R.attemptTargetSubstitution(s, SYSTEM, 'E3', 'x'),
    (s) => R.attemptTargetSubstitution(s, SYSTEM, 'E2', 'x'),
  ], tokenReady);
  assert.deepEqual(Object.keys(e3First.targets).sort(), ['E2', 'E3']);
  assert.equal(R.reducedEquationId(e3First, SYSTEM, 'E2'), 'R1', 'R numbering follows the authored order, not the order of work');
  const again = R.attemptTargetSubstitution(e3First, SYSTEM, 'E2', 'x');
  assert.equal(again.feedback.reason, 'already-substituted');
  assert.equal(again.state, e3First);
});

test('every wrong move is rejected neutrally and changes nothing', () => {
  const tokenReady = isolate(R.emptyReductionState());
  const cases = [
    [R.attemptTargetSubstitution(tokenReady, SYSTEM, 'E1', 'x'), 'source-equation'],
    [R.attemptTargetSubstitution(tokenReady, SYSTEM, 'E2', 'y'), 'wrong-variable'],
    [R.carryTargetUnchanged(tokenReady, SYSTEM, 'E2'), 'contains-variable'],
  ];
  cases.forEach(([{ state, feedback }, reason]) => {
    assert.equal(feedback.reason, reason);
    assert.equal(state, tokenReady);
    // Feedback names the structural problem, never the answer.
    assert.equal(Object.prototype.hasOwnProperty.call(feedback, 'expected'), false);
  });
  const sparse = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: ['x + y = 3', 'y + z = 5', 'x + z = 4'] });
  const absent = R.chooseReductionSource(R.emptyReductionState(), sparse, 'E1', 'z');
  assert.equal(absent.feedback.reason, 'variable-absent');
  assert.equal(absent.state.source, null);
});

test('a target without the isolated variable is carried over — checked, not assumed', () => {
  const sparse = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: ['x + y + z = 6', '2y - z = 1', 'x - z = -2'] });
  let state = play([
    (s) => R.chooseReductionSource(s, sparse, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, sparse, '6 - y - z'),
    (s) => R.useIsolatedExpressionAsToken(s, sparse),
    (s) => R.carryTargetUnchanged(s, sparse, 'E2'),
  ]);
  // Already standard form in y and z, so it is a reduced equation at once.
  assert.deepEqual(state.targets.E2, { mode: 'carried', rawText: '2y - z = 1', standardText: '2y - z = 1' });
  state = R.attemptTargetSubstitution(state, sparse, 'E3', 'x').state;
  assert.equal(R.allTargetsReduced(state, sparse), false);
  state = R.recordTargetStandardForm(state, sparse, 'E3', '-y - 2z = -8').state;
  assert.deepEqual(R.reducedSystem(state, sparse).equations.map((equation) => equation.mode), ['carried', 'substituted']);
});

test('a standard form is recorded only if it is the same equation, in the remaining variables, finished', () => {
  const substituted = play([(s) => R.attemptTargetSubstitution(s, SYSTEM, 'E2', 'x')], isolate(R.emptyReductionState()));
  assert.equal(R.recordTargetStandardForm(substituted, SYSTEM, 'E2', '-3y + z = 3').feedback.reason, 'not-equivalent');
  assert.equal(R.recordTargetStandardForm(substituted, SYSTEM, 'E2', '12 - 3y + z = 9').feedback.reason, 'not-equivalent', 'not finished');
  assert.equal(R.recordTargetStandardForm(substituted, SYSTEM, 'E2', '3y - z = 3').feedback, null, 'multiplying through by -1 is legitimate');
});

test('the token is committed once it is in a reduced equation', () => {
  const tokenReady = isolate(R.emptyReductionState());
  assert.equal(R.changeSubstitutionToken(tokenReady).feedback, null);
  const used = R.attemptTargetSubstitution(tokenReady, SYSTEM, 'E2', 'x').state;
  assert.equal(R.changeSubstitutionToken(used).feedback.reason, 'token-in-use');
});

test('the optional token rewrite is accepted only when equivalent', () => {
  let state = R.recordIsolatedExpression(R.chooseReductionSource(R.emptyReductionState(), SYSTEM, 'E1', 'x').state, SYSTEM, '6 - y - z').state;
  state = R.startTokenSimplification(state).state;
  state = R.setTokenSimplificationDraft(state, '6 - y + z').state;
  state = R.checkTokenSimplification(state, SYSTEM).state;
  assert.equal(state.isolation.simplificationValid, false);
  assert.equal(R.substitutionToken(state), null);
  state = R.setTokenSimplificationDraft(state, '-(y + z) + 6').state;
  state = R.checkTokenSimplification(state, SYSTEM).state;
  assert.equal(R.substitutionToken(state), '-(y + z) + 6');
});

test('back-substitution: the student picks the destination and every placement; the platform never calculates', () => {
  const ready = reduceBoth(isolate(R.emptyReductionState()));
  const destinations = R.backSubstitutionDestinations(ready, SYSTEM).map((entry) => [entry.id, entry.text]);
  assert.deepEqual(destinations[0], [R.RELATION_DESTINATION_ID, 'x = -y - z + 6']);
  assert.deepEqual(destinations.slice(1).map(([id]) => id), ['E1', 'E2', 'E3']);

  assert.equal(R.attemptBackPlacement(ready, SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'z', 'y').feedback.reason, 'wrong-variable');
  let state = R.attemptBackPlacement(ready, SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'y', 'y').state;
  assert.equal(R.backSubstitutionEquation(state, SYSTEM, REDUCED_SOLUTION), null, 'z has not been placed yet');
  state = R.attemptBackPlacement(state, SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'z', 'z').state;
  // The values are placed, not evaluated: Step Algebra gets x = -(2) - (3) + 6.
  assert.equal(R.backSubstitutionEquation(state, SYSTEM, REDUCED_SOLUTION), 'x = -(2) - (3) + 6');

  // Switching destination starts its placements fresh.
  const switched = R.attemptBackPlacement(state, SYSTEM, REDUCED_SOLUTION, 'E2', 'y', 'y').state;
  assert.deepEqual(switched.back, { destinationId: 'E2', placed: { y: true }, solved: null });

  const sparse = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: ['x + y + z = 6', '2y - z = 1', 'x - z = -2'] });
  const sparseReady = play([
    (s) => R.chooseReductionSource(s, sparse, 'E1', 'x'),
    (s) => R.recordIsolatedExpression(s, sparse, '6 - y - z'),
    (s) => R.useIsolatedExpressionAsToken(s, sparse),
    (s) => R.carryTargetUnchanged(s, sparse, 'E2'),
    (s) => R.attemptTargetSubstitution(s, sparse, 'E3', 'x'),
    (s) => R.recordTargetStandardForm(s, sparse, 'E3', '-y - 2z = -8'),
  ]);
  assert.equal(R.attemptBackPlacement(sparseReady, sparse, { y: 2, z: 3 }, 'E2', 'y', 'y').feedback.reason, 'destination-lacks-unknown');
});

test('verification covers all three ORIGINAL equations, and a wrong side value does not pass', () => {
  const solved = backSolve(reduceBoth(isolate(R.emptyReductionState())));
  const solution = R.knownSolution(solved, REDUCED_SOLUTION);
  assert.deepEqual(solution, { y: 2, z: 3, x: 1 });
  assert.equal(R.placeVerificationValue(solved, SYSTEM, 'E1', 'y', 'x').feedback.reason, 'wrong-variable');
  let state = solved;
  ['x', 'y'].forEach((name) => { state = R.placeVerificationValue(state, SYSTEM, 'E2', name, name).state; });
  assert.equal(R.verificationReady(state, SYSTEM, 'E2'), false);
  state = R.placeVerificationValue(state, SYSTEM, 'E2', 'z', 'z').state;
  state = R.setVerificationAnswer(state, 'E2', 'leftAnswer', '9').state;
  state = R.setVerificationAnswer(state, 'E2', 'rightAnswer', '8').state;
  state = R.checkVerification(state, SYSTEM, solution, 'E2').state;
  assert.equal(state.verification.E2.valid, false);
  assert.equal(R.gradeReduction(state, SYSTEM, REDUCED_SOLUTION).isCorrect, false, 'unverified work is not complete');
  assert.equal(R.gradeReduction(verifyAll(solved), SYSTEM, REDUCED_SOLUTION).isCorrect, true);
  assert.equal(R.gradeReduction(verifyAll(solved), SYSTEM, { y: 2, z: 4 }).valuesCorrect, false);
  assert.equal(R.gradeReduction(backSolve(reduceBoth(isolate(R.emptyReductionState()))), SYSTEM, REDUCED_SOLUTION, { requireVerification: false }).isCorrect, true);
});

test('a student can leave after ANY phase and come back to exactly the same work', () => {
  const checkpoints = [
    R.chooseReductionSource(R.emptyReductionState(), SYSTEM, 'E1', 'x').state,
    isolate(R.emptyReductionState()),
    R.attemptTargetSubstitution(isolate(R.emptyReductionState()), SYSTEM, 'E2', 'x').state,
    play([(s) => R.attemptTargetSubstitution(s, SYSTEM, 'E2', 'x'), (s) => R.openTargetSimplification(s, 'E2')], isolate(R.emptyReductionState())),
    reduceBoth(isolate(R.emptyReductionState())),
    R.attemptBackPlacement(reduceBoth(isolate(R.emptyReductionState())), SYSTEM, REDUCED_SOLUTION, R.RELATION_DESTINATION_ID, 'y', 'y').state,
    backSolve(reduceBoth(isolate(R.emptyReductionState()))),
    R.placeVerificationValue(backSolve(reduceBoth(isolate(R.emptyReductionState()))), SYSTEM, 'E3', 'x', 'x').state,
    verifyAll(backSolve(reduceBoth(isolate(R.emptyReductionState())))),
  ];
  checkpoints.forEach((state, index) => {
    const restored = R.repairReductionState(JSON.parse(JSON.stringify(state)), SYSTEM);
    assert.deepEqual(restored, state, `checkpoint ${index} did not survive a round trip`);
    assert.equal(phase(restored, REDUCED_SOLUTION), phase(state, REDUCED_SOLUTION));
  });
});

test('draft repair is deterministic, idempotent, and keeps only work that is still true', () => {
  const complete = verifyAll(backSolve(reduceBoth(isolate(R.emptyReductionState()))));
  const once = R.repairReductionState(JSON.parse(JSON.stringify(complete)), SYSTEM);
  assert.deepEqual(R.repairReductionState(once, SYSTEM), once);

  // A substitution that no longer matches the token is dropped — and with it
  // everything built on the reduced system.
  const tampered = JSON.parse(JSON.stringify(complete));
  tampered.targets.E2.rawText = '2 * (6 - y + z) - y + 3 * z = 9';
  const repaired = R.repairReductionState(tampered, SYSTEM);
  assert.equal(repaired.targets.E2, undefined);
  assert.equal(repaired.targets.E3.standardText, '-y - 4 z = -14');
  assert.deepEqual(repaired.back, { destinationId: null, placed: {}, solved: null });
  assert.deepEqual(repaired.verification, {});

  // A standard form that is not equivalent is cleared, the substitution kept.
  const wrongForm = JSON.parse(JSON.stringify(complete));
  wrongForm.targets.E3.standardText = '-y - 4z = 14';
  assert.equal(R.repairReductionState(wrongForm, SYSTEM).targets.E3.standardText, null);

  // A draft saved against a different question, an unknown version, or junk.
  const edited = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: ['y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'] });
  assert.equal(R.repairReductionState(JSON.parse(JSON.stringify(complete)), edited).source, null, 'x is no longer in E1');
  assert.deepEqual(R.repairReductionState({ ...complete, version: 99 }, SYSTEM), R.emptyReductionState());
  [null, undefined, 'x', 42, [], { version: 1, source: { equationId: 'E9', variable: 'x' } }].forEach((junk) => {
    assert.deepEqual(R.repairReductionState(junk, SYSTEM), R.emptyReductionState());
  });

  // A token saved with Step Algebra's LaTeX spacing (#334) is repaired too.
  const latex = JSON.parse(JSON.stringify(isolate(R.emptyReductionState())));
  latex.isolation.tokenExpression = '-y-z+(6~)';
  assert.equal(R.repairReductionState(latex, SYSTEM).isolation.tokenExpression, '-y-z+(6 )');
});

test('nothing about the round is specific to three: a 4×4 reduces to a 3×3 with the same functions', () => {
  const four = R.buildReductionSystem({
    variables: ['w', 'x', 'y', 'z'],
    equations: ['w + x + y + z = 10', 'w - x + 2y = 5', '2w + x - z = 0', 'x + y - z = 1'],
  });
  let state = play([
    (s) => R.chooseReductionSource(s, four, 'E1', 'w'),
    (s) => R.recordIsolatedExpression(s, four, '10 - x - y - z'),
    (s) => R.useIsolatedExpressionAsToken(s, four),
    (s) => R.attemptTargetSubstitution(s, four, 'E2', 'w'),
    (s) => R.attemptTargetSubstitution(s, four, 'E3', 'w'),
    (s) => R.carryTargetUnchanged(s, four, 'E4'),
  ]);
  assert.equal(R.reductionTargets(state, four).length, 3);
  state = play([
    (s) => R.recordTargetStandardForm(s, four, 'E2', '-2x + y - z = -5'),
    (s) => R.recordTargetStandardForm(s, four, 'E3', '-x - 2y - 3z = -20'),
  ], state);
  const reduced = R.reducedSystem(state, four);
  assert.deepEqual(reduced.variables, ['x', 'y', 'z']);
  assert.deepEqual(reduced.equations.map((equation) => equation.id), ['R1', 'R2', 'R3']);
  assert.equal(reduced.equations[2].mode, 'carried');
});
