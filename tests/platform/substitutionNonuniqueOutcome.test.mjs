/*
 * TL11: A DEPENDENT OR INCONSISTENT 3×3 CAN BE SOLVED BY SUBSTITUTION.
 *
 * Substitution used to end in a unique solution or in nothing: the workspace
 * refused any system that was not exactly one point, so a dependent or
 * inconsistent 3×3 could only be authored for elimination. The round now ends
 * early, in a statement with no variable, by the same two roads elimination has
 * (substitutionReduction.mjs):
 *
 *   - a substitution cancels every variable (2(3 − y − z) + 2y + 2z = 6). Step
 *     Algebra cannot finish that, so the student simplifies each side that is not
 *     already a number, and the statement THEY wrote is what is interpreted;
 *   - the reduced 2×2 is itself dependent or inconsistent, and the embedded 2×2
 *     workflow earns the statement (the screen reads it; nothing here changes it).
 *
 * These tests drive the round as the screen does: stored -> repair (through JSON,
 * as a draft is) -> transition -> stored. Nothing is computed for the student,
 * nothing is accepted before they have written it, and a unique system never
 * meets any of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import { noVariableStatementType } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

const XYZ = ['x', 'y', 'z'];
// E2 cancels to 6 = 6 once x is replaced; E3 never had an x.
const IDENTITY_ROUND = ['x = 3 - y - z', '2x + 2y + 2z = 6', 'y + z = 3'];
// E2 cancels to 1 = 2.
const CONTRADICTION_ROUND = ['x = 1 - y - z', 'x + y + z = 2', 'x - y = 0'];
// An authored equation with no variable at all: 0 = 5.
const BARE_EQUATION_ROUND = ['x = 1 - y - z', 'x + y + z = 1', '0 = 5'];
// Day 2's dependent system (docs/assignments): isolating y leaves E3 as 15 = 15 and E2 in x and z.
const DAY_TWO_DEPENDENT = ['2x + y - 3z = 5', 'x + 2y - 4z = 7', '6x + 3y - 9z = 15'];
const UNIQUE = ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'];

/** The screen's loop: every render repairs what is stored; every click transforms the repaired state. */
const screen = (equations) => {
  const system = R.buildReductionSystem({ variables: XYZ, equations });
  let stored = R.emptyReductionState();
  const view = () => R.repairReductionState(JSON.parse(JSON.stringify(stored)), system);
  const act = (transition) => {
    const next = transition(view(), system);
    stored = next.state;
    return next;
  };
  return { system, view, act };
};

const choose = (s, equationId, variable, expression) => {
  s.act((state, system) => R.chooseReductionSource(state, system, equationId, variable));
  s.act((state, system) => R.recordIsolatedExpression(state, system, expression));
  s.act((state, system) => R.useIsolatedExpressionAsToken(state, system));
};
const substitute = (s, targetId, variable = 'x') => s.act((state, system) => R.attemptTargetSubstitution(state, system, targetId, variable));
const carry = (s, targetId) => s.act((state, system) => R.carryTargetUnchanged(state, system, targetId));
const type = (s, targetId, entries) => Object.entries(entries).forEach(([side, value]) => s.act((state) => R.setTargetStatementAnswer(state, targetId, side, value)));
const check = (s, targetId) => s.act((state, system) => R.checkTargetStatement(state, system, targetId));
const simplify = (s, targetId, entries) => {
  s.act((state) => R.openTargetSimplification(state, targetId));
  type(s, targetId, entries);
  return check(s, targetId);
};
const outcomeOf = (s) => R.substitutionOutcome(s.view(), s.system);
const phaseOf = (s) => R.reductionPhase(s.view(), s.system);

test('a substitution that cancels every variable is finished by the student, side by side', () => {
  const s = screen(IDENTITY_ROUND);
  choose(s, 'E1', 'x', '3 - y - z');
  assert.equal(R.targetStatementSides(s.view(), s.system, 'E2'), null, 'nothing is substituted yet');
  substitute(s, 'E2');
  const sides = R.targetStatementSides(s.view(), s.system, 'E2');
  assert.ok(sides, 'every variable cancelled: this is the student\'s arithmetic, not Step Algebra\'s');
  assert.equal(sides.right.given, true, 'a side that is already a number is shown, never retyped');
  assert.equal(sides.left.given, false, 'the other side is theirs to simplify');
  carry(s, 'E3');
  assert.equal(R.targetStatementSides(s.view(), s.system, 'E3'), null, 'an equation that keeps its variables is Step Algebra\'s');

  // A system with one solution never reaches this road.
  const ordinary = screen(UNIQUE);
  choose(ordinary, 'E1', 'x', '-y - z + 6');
  substitute(ordinary, 'E2');
  substitute(ordinary, 'E3');
  ['E2', 'E3'].forEach((id) => assert.equal(R.targetStatementSides(ordinary.view(), ordinary.system, id), null, id));
  assert.equal(R.substitutionOutcome(ordinary.view(), ordinary.system), null);
});

test('nothing is accepted until the student\'s own sides are right, and a wrong side records no statement', () => {
  const s = screen(IDENTITY_ROUND);
  choose(s, 'E1', 'x', '3 - y - z');
  substitute(s, 'E2');
  for (const entries of [{}, { left: '7' }, { left: '6 + 1' }, { left: 'y' }]) {
    const attempt = screen(IDENTITY_ROUND);
    choose(attempt, 'E1', 'x', '3 - y - z');
    substitute(attempt, 'E2');
    // The transition's own result, and what the screen reads back through its repair: both say no.
    const checked = simplify(attempt, 'E2', entries);
    assert.equal(checked.state.targets.E2.statement, undefined, `the check itself: ${JSON.stringify(entries)}`);
    const target = attempt.view().targets.E2;
    assert.equal(target.statement, undefined, JSON.stringify(entries));
    assert.equal(R.targetIsReduced(target), false, 'the equation is not reduced');
    assert.equal(R.substitutionOutcome(attempt.view(), attempt.system), null);
    const judged = R.targetStatementResult(attempt.view(), attempt.system, 'E2');
    assert.equal(judged.valid, false);
    assert.equal(judged.sides.left.correct, false, 'the left side is the one to recheck');
    assert.equal(judged.sides.right.correct, true, 'the given right side is not the student\'s to get wrong');
  }
  // Before Check there is no verdict, and editing after one takes it back.
  simplify(s, 'E2', { left: '7' });
  assert.equal(R.targetStatementResult(s.view(), s.system, 'E2').valid, false);
  type(s, 'E2', { left: '6' });
  assert.equal(R.targetStatementResult(s.view(), s.system, 'E2'), null, 'a stale verdict is never shown for an edited side');
  assert.equal(s.view().targets.E2.statement, undefined, 'typing the right value is not checking it');
});

test('right sides record the student\'s own statement, in their own numbers', () => {
  const s = screen(IDENTITY_ROUND);
  choose(s, 'E1', 'x', '3 - y - z');
  substitute(s, 'E2');
  const checked = simplify(s, 'E2', { left: '12/2' });
  assert.deepEqual(checked.state.targets.E2.statement, { text: '6 = 6', type: 'infinite' }, 'the check itself writes the student\'s number, not what they typed');
  const target = s.view().targets.E2;
  assert.deepEqual(target.statement, { text: '6 = 6', type: 'infinite' });
  assert.equal(R.targetIsReduced(target), true);
  assert.equal(target.standardText, null, 'a statement is not a standard form');
});

test('a contradiction settles the system at once; an identity waits until the other equation is accounted for', () => {
  const contradiction = screen(CONTRADICTION_ROUND);
  choose(contradiction, 'E1', 'x', '1 - y - z');
  substitute(contradiction, 'E2');
  assert.equal(outcomeOf(contradiction), null, 'a substituted equation is not an outcome until the student has simplified it');
  const recorded = simplify(contradiction, 'E2', { left: '1' });
  assert.deepEqual(recorded.state.targets.E2.statement, { text: '1 = 2', type: 'none' }, 'the check itself says what kind of statement it is');
  assert.deepEqual(R.substitutionOutcome(recorded.state, contradiction.system), { type: 'none', statement: '1 = 2' });
  assert.deepEqual(outcomeOf(contradiction), { type: 'none', statement: '1 = 2' });
  assert.equal(contradiction.view().targets.E3, undefined, 'the other equation was never touched, and need not be');
  assert.equal(phaseOf(contradiction), 'outcome');

  const identity = screen(IDENTITY_ROUND);
  choose(identity, 'E1', 'x', '3 - y - z');
  substitute(identity, 'E2');
  simplify(identity, 'E2', { left: '6' });
  assert.equal(outcomeOf(identity), null, 'one identity cannot say the third equation agrees with it');
  assert.equal(phaseOf(identity), 'reduce');
  carry(identity, 'E3');
  assert.deepEqual(outcomeOf(identity), { type: 'infinite', statement: '6 = 6' });
  assert.equal(phaseOf(identity), 'outcome');

  // An identity first does not hide a contradiction in the other equation.
  const both = screen(BARE_EQUATION_ROUND);
  assert.equal(R.reductionAnswerKey(both.system).type, 'none');
  choose(both, 'E1', 'x', '1 - y - z');
  substitute(both, 'E2');
  simplify(both, 'E2', { left: '1' });
  assert.equal(outcomeOf(both), null);
  carry(both, 'E3');
  simplify(both, 'E3', {});
  assert.deepEqual(outcomeOf(both), { type: 'none', statement: '0 = 5' }, 'the authored 0 = 5 is accounted for like any statement, with both sides given');
});

test('finishing one statement leaves the other unfinished equation open for the student, never a closed screen', () => {
  const s = screen(['x = 1 - y - z', 'x + y + z = 1', 'x + y + z = 2']);
  choose(s, 'E1', 'x', '1 - y - z');
  substitute(s, 'E2');
  substitute(s, 'E3');
  s.act((state) => R.openTargetSimplification(state, 'E2'));
  assert.equal(s.view().activeTargetId, 'E2');
  type(s, 'E2', { left: '1' });
  check(s, 'E2');
  assert.equal(s.view().activeTargetId, 'E3', 'the open slot goes to the equation still to do');
  assert.equal(outcomeOf(s), null, 'an identity alone, with the other equation still unsimplified');
  type(s, 'E3', { left: '1' });
  check(s, 'E3');
  assert.deepEqual(outcomeOf(s), { type: 'none', statement: '1 = 2' });
  assert.equal(s.view().activeTargetId, null);
});

test('the statement the student wrote is the one the grader reads as the system\'s own', () => {
  // The outcome carries the student's statement; the shared grader judges it by
  // noVariableStatementType against the authored system's key. They must agree
  // for every road the data layer opens, or a right answer would be marked wrong.
  const rounds = [
    [IDENTITY_ROUND, (s) => { choose(s, 'E1', 'x', '3 - y - z'); substitute(s, 'E2'); simplify(s, 'E2', { left: '6' }); carry(s, 'E3'); }],
    [CONTRADICTION_ROUND, (s) => { choose(s, 'E1', 'x', '1 - y - z'); substitute(s, 'E2'); simplify(s, 'E2', { left: '1' }); }],
    [DAY_TWO_DEPENDENT, (s) => {
      choose(s, 'E1', 'y', '5 - 2x + 3z');
      substitute(s, 'E2', 'y');
      substitute(s, 'E3', 'y');
      s.act((state) => R.openTargetSimplification(state, 'E2'));
      s.act((state, system) => R.recordTargetStandardForm(state, system, 'E2', '-3 x + 2 z = -3'));
      simplify(s, 'E3', { left: '15' });
    }],
  ];
  for (const [equations, play] of rounds) {
    const s = screen(equations);
    play(s);
    const outcome = outcomeOf(s);
    assert.ok(outcome, equations.join(' | '));
    assert.equal(noVariableStatementType(outcome.statement, XYZ), outcome.type);
    assert.equal(outcome.type, R.reductionAnswerKey(s.system).type, 'and it is the system\'s own classification');
  }
});

test('a round that ended in a statement has no 2×2 to solve; one that did not still does', () => {
  const identity = screen(IDENTITY_ROUND);
  choose(identity, 'E1', 'x', '3 - y - z');
  substitute(identity, 'E2');
  simplify(identity, 'E2', { left: '6' });
  carry(identity, 'E3');
  assert.equal(R.allTargetsReduced(identity.view(), identity.system), true);
  assert.equal(R.reducedSystem(identity.view(), identity.system), null, 'a statement is not a row of a smaller system');

  // Dependent only in the reduced 2×2: no statement yet, so the embedded 2×2 owns the rest.
  const reducedOnly = screen(['x = 2', 'y + z = 3', '2y + 2z = 6']);
  choose(reducedOnly, 'E1', 'x', '2');
  carry(reducedOnly, 'E2');
  carry(reducedOnly, 'E3');
  assert.deepEqual(R.reducedSystem(reducedOnly.view(), reducedOnly.system).equations.map((row) => row.text), ['y + z = 3', '2y + 2z = 6']);
  assert.equal(outcomeOf(reducedOnly), null);
  assert.equal(phaseOf(reducedOnly), 'subsystem');
});

test('a student can leave after ANY step of a statement and come back to exactly the same work', () => {
  const s = screen(IDENTITY_ROUND);
  const checkpoints = [];
  const mark = () => checkpoints.push(s.view());
  choose(s, 'E1', 'x', '3 - y - z');
  substitute(s, 'E2');
  mark();
  s.act((state) => R.openTargetSimplification(state, 'E2'));
  mark();
  type(s, 'E2', { left: '7' });
  mark();
  check(s, 'E2');
  mark();
  type(s, 'E2', { left: '6' });
  mark();
  check(s, 'E2');
  mark();
  carry(s, 'E3');
  mark();
  checkpoints.forEach((state, index) => {
    const restored = R.repairReductionState(JSON.parse(JSON.stringify(state)), s.system);
    assert.deepEqual(restored, state, `checkpoint ${index} did not survive a round trip`);
    assert.equal(R.reductionPhase(restored, s.system), R.reductionPhase(state, s.system), `checkpoint ${index} phase`);
    assert.deepEqual(R.substitutionOutcome(restored, s.system), R.substitutionOutcome(state, s.system), `checkpoint ${index} outcome`);
  });
  assert.equal(R.substitutionOutcome(checkpoints.at(-1), s.system).type, 'infinite');
});

test('a draft is read back as a claim: a statement is kept only as far as the sides the student typed still support', () => {
  const s = screen(IDENTITY_ROUND);
  choose(s, 'E1', 'x', '3 - y - z');
  substitute(s, 'E2');
  simplify(s, 'E2', { left: '6' });
  carry(s, 'E3');
  const complete = JSON.parse(JSON.stringify(s.view()));
  const repair = (mutate) => {
    const draft = JSON.parse(JSON.stringify(complete));
    mutate(draft);
    return R.repairReductionState(draft, s.system);
  };
  assert.deepEqual(R.repairReductionState(JSON.parse(JSON.stringify(complete)), s.system), complete);

  // What it says, and what kind of statement it is, are re-derived — never trusted.
  assert.deepEqual(repair((draft) => { draft.targets.E2.statement.type = 'none'; }).targets.E2.statement, { text: '6 = 6', type: 'infinite' });
  assert.deepEqual(repair((draft) => { draft.targets.E2.statement.text = '7 = 7'; }).targets.E2.statement, { text: '6 = 6', type: 'infinite' });
  // A statement the typed sides do not support, or one never checked, is dropped.
  const wrongTyped = repair((draft) => { draft.targets.E2.statementWork.left = '7'; });
  assert.equal(wrongTyped.targets.E2.statement, undefined);
  assert.equal(wrongTyped.targets.E2.statementWork.checked, true, 'what they typed and checked is still theirs');
  assert.equal(R.substitutionOutcome(wrongTyped, s.system), null);
  assert.equal(repair((draft) => { draft.targets.E2.statementWork.checked = false; }).targets.E2.statement, undefined);
  assert.equal(repair((draft) => { delete draft.targets.E2.statementWork; }).targets.E2.statement, undefined);
  // A statement claimed for an equation that kept its variables is dropped.
  const onOrdinary = repair((draft) => { draft.targets.E3.statement = { text: '3 = 3', type: 'infinite' }; draft.targets.E3.statementWork = { left: '3', right: '', checked: true }; });
  assert.equal(onOrdinary.targets.E3.statement, undefined);
  assert.equal(onOrdinary.targets.E3.statementWork, undefined);
  // A round that ended in a statement has no back-substitution or verification, whatever a draft claims.
  const stray = repair((draft) => {
    draft.back = { destinationId: 'relation', placed: { y: true }, solved: { value: 1, text: '1' } };
    draft.verification = { E1: { placed: { x: true }, leftAnswer: '3', rightAnswer: '', checked: true, valid: true } };
  });
  assert.deepEqual(stray.back, { destinationId: null, placed: {}, solved: null });
  assert.deepEqual(stray.verification, {});
  // The question edited under the draft: E2 no longer cancels, so the whole substitution goes.
  const edited = R.buildReductionSystem({ variables: XYZ, equations: ['x = 3 - y - z', '2x + 3y + 2z = 6', 'y + z = 3'] });
  assert.equal(R.repairReductionState(JSON.parse(JSON.stringify(complete)), edited).targets.E2, undefined);
});

test('a recorded statement is final until Undo; typing and checking after it change nothing', () => {
  const s = screen(IDENTITY_ROUND);
  choose(s, 'E1', 'x', '3 - y - z');
  substitute(s, 'E2');
  simplify(s, 'E2', { left: '6' });
  const done = s.view();
  assert.equal(R.setTargetStatementAnswer(done, 'E2', 'left', '99').state, done);
  assert.equal(R.checkTargetStatement(done, s.system, 'E2').state, done);
  // And only a student's own variable-free equation takes an entry at all.
  const ordinary = screen(UNIQUE);
  choose(ordinary, 'E1', 'x', '-y - z + 6');
  substitute(ordinary, 'E2');
  const state = ordinary.view();
  assert.equal(R.checkTargetStatement(state, ordinary.system, 'E2').state, state, 'a substitution that keeps variables has no statement to check');
});

test('rounds with one solution are exactly what they were: no statement fields, no outcome, the same phases', () => {
  const s = screen(UNIQUE);
  choose(s, 'E1', 'x', '-y - z + 6');
  substitute(s, 'E2');
  substitute(s, 'E3');
  s.act((state) => R.openTargetSimplification(state, 'E2'));
  s.act((state, system) => R.recordTargetStandardForm(state, system, 'E2', '-3 y+ z = -3'));
  s.act((state, system) => R.recordTargetStandardForm(state, system, 'E3', '- y-4 z = -14'));
  const state = s.view();
  Object.values(state.targets).forEach((target) => assert.deepEqual(Object.keys(target).sort(), ['mode', 'rawText', 'standardText']));
  assert.equal(R.substitutionOutcome(state, s.system), null);
  assert.equal(R.reductionPhase(state, s.system), 'subsystem');
  assert.equal(R.reductionPhase(state, s.system, { reducedSolution: { y: 2, z: 3 } }), 'back-substitute');
  assert.ok(R.reducedSystem(state, s.system));
});
