import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import {
  STEP_ACTIONS,
  relationStatePatch,
  relationStepGrade,
  relationStepWork,
  stepActionCountsAttempt,
  verifyStepAlgebraStep,
} from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import {
  relationWorkspaceWork,
  stepAlgebraWorkGrader,
} from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import {
  parseRelationSource,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

/*
 * A RADICAL EQUATION IS GRADED EXACTLY, ON THE SERVER, FROM THE ASSIGNED ITEM.
 *
 * Every graded attempt here is graded twice — as the workspace grades it in the
 * browser (gradeToolCheck) and as the server grades the serialized response
 * (gradeServerResponse) — and the two must agree part for part. The item is
 * the authoritative question; the response is only work.
 */

const radical = (equation, extra = {}) => ({
  questionId: 'q-radical',
  type: 'stepAlgebra',
  prompt: `Solve ${equation}.`,
  equation,
  solveFor: extra.solveFor || 'x',
  relationWorkspace: true,
  ...extra,
});
const SQRT_PLUS = radical('sqrt(x+4)+2 = x');           // CW#1: candidates 0 and 5, only 5 holds
const SQRT_FRACTION = radical('sqrt(5x-1) = 2x-1');     // CW#2: candidates 1/4 and 2, only 2 holds
const CUBE = radical('cbrt(2x-1) = 3');                 // x = 14
const REPEATED = radical('sqrt(4x-4) = x');             // x = 2 twice
const TWO_GENUINE = radical('sqrt(5x-6) = x');          // x = 2 and x = 3
const ALL_FAIL = radical('sqrt(-7x+23) = x-5');         // candidates 1 and 2, neither holds
const STRUCTURAL = radical('sqrt(x+1) = -3');           // an isolated even root equal to a negative

const solvedState = (question, values) => ({
  ...parseRelationSource(question.equation, question.solveFor),
  branches: values.map((value) => ({ expressions: [question.solveFor, String(value)], relations: ['='] })),
  connective: values.length > 1 ? 'OR' : null,
});
const noSolutionState = (question) => ({ ...parseRelationSource(question.equation, question.solveFor), branches: [], connective: null, special: 'noSolution' });

/** A finished radical solve's work: the solved relation, a check per candidate, the final set. */
const attempt = (question, { reached, checks = {}, set = null, state = null, awaiting = false }) => relationWorkspaceWork({
  relationState: state || solvedState(question, reached),
  awaitingSymbolDecision: awaiting,
  candidateChecks: checks,
  solutionSet: set,
});
const check = (choice, left, right) => ({ choice, left, right });

const parity = (question, work, label) => {
  const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
  assert.ok(browser.toolResponse, `${label}: the browser built a tool response`);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.surfaceId, 'stepAlgebra', label);
  assert.equal(server.graded, browser.graded, `${label}: graded (${server.reason})`);
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: isCorrect`);
  assert.equal(server.isComplete, browser.isComplete, `${label}: isComplete`);
  assert.equal(server.score, browser.score, `${label}: score`);
  assert.deepEqual(server.parts, browser.parts, `${label}: parts`);
  assert.deepEqual(attemptInputsFromGrading(server), attemptInputsFromGrading(browser), `${label}: attempt inputs`);
  return { browser, server };
};
const part = (result, id) => result.browser.parts.find((entry) => entry.id === id);
const verdict = (result) => `${result.browser.isComplete ? 'complete' : 'incomplete'}/${result.browser.isCorrect ? 'correct' : 'wrong'}`;

// ---------------------------------------------------------------------------
// Routing: explicit, never sniffed
// ---------------------------------------------------------------------------

test('a flagged radical equation opens the relation workspace; an unflagged one is left exactly where it was', () => {
  assert.equal(resolveStepAlgebraMode(SQRT_PLUS), 'relation');
  assert.equal(resolveGradingSurfaceId(SQRT_PLUS), 'stepAlgebra');
  // A stored radical question that never carried the flag keeps its engine and its grader: the
  // route is not decided by reading the equation, so nothing already assigned moves.
  const { relationWorkspace, ...stored } = SQRT_PLUS;
  assert.equal(relationWorkspace, true);
  assert.equal(resolveStepAlgebraMode(stored), 'equation');
  // The Sign & Solution Analyzer's radicalSolve questions are another surface altogether.
  const legacy = {
    questionId: 'q-legacy', type: 'signSolutionAnalyzer', mode: 'radicalSolve',
    radicalEquation: { radicand: { m: 1, b: 4 }, outside: 2, rhs: { m: 1, b: 0 } },
  };
  assert.equal(resolveGradingSurfaceId(legacy), 'signSolutionAnalyzer');
  assert.ok(GRADING_MANIFEST.signSolutionAnalyzer, 'the analyzer keeps its own grading declaration');
});

// ---------------------------------------------------------------------------
// The lesson's two worked examples, end to end
// ---------------------------------------------------------------------------

test('sqrt(x+4)+2 = x: x = 5 is the solution and x = 0, which only the squared equation allows, is rejected', () => {
  const honest = parity(SQRT_PLUS, attempt(SQRT_PLUS, {
    reached: [0, 5],
    checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') },
    set: { none: false, values: ['5'] },
  }), 'honest');
  assert.equal(verdict(honest), 'complete/correct');
  assert.deepEqual(honest.browser.parts.map((entry) => entry.id), ['relation-work', 'candidate-verification', 'solution-set']);
  assert.ok(honest.browser.parts.every((entry) => entry.isCorrect && entry.isComplete));
  assert.equal(honest.browser.score, 1);

  // Keeping x = 0 because it solves the squared equation.
  const kept = parity(SQRT_PLUS, attempt(SQRT_PLUS, {
    reached: [0, 5],
    checks: { 0: check('valid', '4', '0'), 5: check('valid', '5', '5') },
    set: { none: false, values: ['0', '5'] },
  }), 'kept the extraneous candidate');
  assert.equal(verdict(kept), 'complete/wrong');
  assert.equal(part(kept, 'relation-work').isCorrect, true, 'the algebra was right');
  assert.equal(part(kept, 'candidate-verification').isCorrect, false, 'the decision on x = 0 was not');
  assert.equal(part(kept, 'solution-set').isCorrect, false);

  // Right decisions, but the final set still lists the rejected value.
  const listed = parity(SQRT_PLUS, attempt(SQRT_PLUS, {
    reached: [0, 5],
    checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') },
    set: { none: false, values: ['0', '5'] },
  }), 'rejected it but listed it');
  assert.equal(part(listed, 'candidate-verification').isCorrect, true);
  assert.equal(part(listed, 'solution-set').isCorrect, false);
  assert.equal(verdict(listed), 'complete/wrong');
});

test('sqrt(5x-1) = 2x-1: x = 2 is the solution; the fraction x = 1/4 is rejected — written however it is written', () => {
  const forms = [
    { reached: ['1/4', 2], checks: { '1/4': check('extraneous', '1/2', '-1/2'), 2: check('valid', '3', '3') }, set: { none: false, values: ['2'] }, label: 'fractions' },
    // 0.25 for 1/4, 0.5 and \frac for its sides, 4/2 and 2.0 for 2: the same numbers.
    { reached: ['0.25', 2], checks: { '0.25': check('extraneous', '0.5', '-\\frac{1}{2}'), 2: check('valid', '3.0', '6/2') }, set: { none: false, values: ['4/2'] }, label: 'decimals' },
    // MathInput types LaTeX into a side value and the solution set; the relation itself is stored as plain algebra.
    { reached: ['1/4', 2], checks: { '1/4': check('extraneous', '\\frac{2}{4}', '-0.5'), 2: check('valid', '3', '\\frac{6}{2}') }, set: { none: false, values: ['2.0', '\\frac{4}{2}'] }, label: 'latex' },
  ];
  for (const form of forms) {
    const result = parity(SQRT_FRACTION, attempt(SQRT_FRACTION, form), form.label);
    assert.equal(verdict(result), 'complete/correct', form.label);
  }
  // A check made for 1/4 is the check for 0.25: it is keyed by the number, not the spelling.
  const mixed = parity(SQRT_FRACTION, attempt(SQRT_FRACTION, {
    reached: ['0.25', 2],
    checks: { '1/4': check('extraneous', '1/2', '-1/2'), 2: check('valid', '3', '3') },
    set: { none: false, values: ['2'] },
  }), 'keyed by value');
  assert.equal(verdict(mixed), 'complete/correct');
  // A value only a float would call equal is not the same number.
  const rounded = parity(SQRT_FRACTION, attempt(SQRT_FRACTION, {
    reached: ['1/4', 2],
    checks: { '1/4': check('extraneous', '0.5', '-0.4999'), 2: check('valid', '3', '3') },
    set: { none: false, values: ['2'] },
  }), 'rounded side value');
  assert.equal(part(rounded, 'candidate-verification').isCorrect, false);
});

// ---------------------------------------------------------------------------
// The other shapes the lesson meets
// ---------------------------------------------------------------------------

test('a cube root: the one candidate is checked too, and it is always genuine', () => {
  const result = parity(CUBE, attempt(CUBE, {
    reached: [14], checks: { 14: check('valid', '3', '3') }, set: { none: false, values: ['14'] },
  }), 'cube');
  assert.equal(verdict(result), 'complete/correct');
  // The check is still owed: a cube root is not skipped.
  const unchecked = parity(CUBE, attempt(CUBE, { reached: [14], set: { none: false, values: ['14'] } }), 'cube unchecked');
  assert.equal(verdict(unchecked), 'incomplete/wrong');
  // 3 cubed is 27, not 9: a wrong equation's candidate.
  const wrong = parity(CUBE, attempt(CUBE, { reached: [5], checks: { 5: check('valid', '3', '3') }, set: { none: false, values: ['5'] } }), 'cube wrong');
  assert.equal(part(wrong, 'relation-work').isCorrect, false);
  assert.equal(wrong.browser.isCorrect, false);
});

test('a repeated root is one candidate and one solution, entered once (or listed twice)', () => {
  const once = parity(REPEATED, attempt(REPEATED, {
    reached: [2], checks: { 2: check('valid', '2', '2') }, set: { none: false, values: ['2'] },
  }), 'repeated once');
  assert.equal(verdict(once), 'complete/correct');
  // x = 2 OR x = 2 is the same single candidate.
  const doubled = parity(REPEATED, attempt(REPEATED, {
    reached: [2, 2], checks: { 2: check('valid', '2', '2') }, set: { none: false, values: ['2', '2'] },
  }), 'repeated listed twice');
  assert.equal(verdict(doubled), 'complete/correct');
  // ...but a repeated root is not two solutions of something else.
  const invented = parity(REPEATED, attempt(REPEATED, {
    reached: [2], checks: { 2: check('valid', '2', '2') }, set: { none: false, values: ['2', '-2'] },
  }), 'extra value');
  assert.equal(part(invented, 'solution-set').isCorrect, false);
});

test('two genuine solutions, in any order', () => {
  for (const values of [['2', '3'], ['3', '2'], ['3', '2', '3']]) {
    const result = parity(TWO_GENUINE, attempt(TWO_GENUINE, {
      reached: [3, 2],
      checks: { 2: check('valid', '2', '2'), 3: check('valid', '3', '3') },
      set: { none: false, values },
    }), `set ${values}`);
    assert.equal(verdict(result), 'complete/correct', `set ${values}`);
  }
  // Calling one of them extraneous is wrong, whichever way the set is written.
  const lost = parity(TWO_GENUINE, attempt(TWO_GENUINE, {
    reached: [2, 3],
    checks: { 2: check('valid', '2', '2'), 3: check('extraneous', '3', '3') },
    set: { none: false, values: ['2'] },
  }), 'dropped a genuine one');
  assert.equal(verdict(lost), 'complete/wrong');
  const partial = parity(TWO_GENUINE, attempt(TWO_GENUINE, {
    reached: [2, 3], checks: { 2: check('valid', '2', '2'), 3: check('valid', '3', '3') }, set: { none: false, values: ['2'] },
  }), 'one of two');
  assert.equal(part(partial, 'solution-set').isCorrect, false);
});

test('no real solution: every candidate failed — and that is not the same as never having a candidate', () => {
  // Candidates 1 and 2 both fail in the original equation.
  const checked = parity(ALL_FAIL, attempt(ALL_FAIL, {
    reached: [1, 2],
    checks: { 1: check('extraneous', '4', '-4'), 2: check('extraneous', '3', '-3') },
    set: { none: true },
  }), 'all candidates fail');
  assert.equal(verdict(checked), 'complete/correct');
  assert.deepEqual(checked.browser.parts.map((entry) => entry.id), ['relation-work', 'candidate-verification', 'solution-set'], 'candidates that all fail owe a check each and a final set');
  assert.equal(part(checked, 'candidate-verification').response, '1:extraneous, 2:extraneous');
  assert.equal(part(checked, 'solution-set').response, 'no real solution');

  // "No real solution" with the checks skipped is not a finished answer.
  const skipped = parity(ALL_FAIL, attempt(ALL_FAIL, { reached: [1, 2], set: { none: true } }), 'checks skipped');
  assert.equal(verdict(skipped), 'incomplete/wrong');
  assert.equal(part(skipped, 'candidate-verification').isComplete, false);
  // Only one of the two checked.
  const half = parity(ALL_FAIL, attempt(ALL_FAIL, {
    reached: [1, 2], checks: { 1: check('extraneous', '4', '-4') }, set: { none: true },
  }), 'one check missing');
  assert.equal(verdict(half), 'incomplete/wrong');

  // The shortcut "no real solution" with NO candidate is only for an isolated even root equal to a
  // negative number. Here it is a false claim of having decided by structure.
  const falseShortcut = parity(ALL_FAIL, attempt(ALL_FAIL, { state: noSolutionState(ALL_FAIL) }), 'shortcut on the wrong equation');
  assert.equal(verdict(falseShortcut), 'complete/wrong');

  // ...and on the structural one it is right, with no candidates and no checks owed.
  const structural = parity(STRUCTURAL, attempt(STRUCTURAL, { state: noSolutionState(STRUCTURAL) }), 'structural shortcut');
  assert.equal(verdict(structural), 'complete/correct');
  assert.deepEqual(structural.browser.parts.map((entry) => entry.id), ['relation-work'], 'no candidate, so no check and no set are owed');
  assert.equal(part(structural, 'relation-work').response, 'No solution');
  // The same equation done the long way: its candidate 8 is checked and rejected.
  const longWay = parity(STRUCTURAL, attempt(STRUCTURAL, {
    reached: [8], checks: { 8: check('extraneous', '3', '-3') }, set: { none: true },
  }), 'structural, the long way');
  assert.equal(verdict(longWay), 'complete/correct');
  assert.deepEqual(longWay.browser.parts.map((entry) => entry.id), ['relation-work', 'candidate-verification', 'solution-set']);
});

// ---------------------------------------------------------------------------
// What must never earn a "correct"
// ---------------------------------------------------------------------------

test('a false "no real solution" claim, on an equation that has a solution', () => {
  const claimed = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') }, set: { none: true } }), 'none, though x = 5 holds');
  assert.equal(verdict(claimed), 'complete/wrong');
  assert.equal(part(claimed, 'solution-set').isCorrect, false);
  const shortcut = parity(SQRT_PLUS, attempt(SQRT_PLUS, { state: noSolutionState(SQRT_PLUS) }), 'special no-solution state');
  assert.equal(verdict(shortcut), 'complete/wrong');
  const everything = parity(SQRT_PLUS, attempt(SQRT_PLUS, { state: { ...noSolutionState(SQRT_PLUS), special: 'allReals' } }), 'all reals');
  assert.equal(everything.browser.isCorrect, false);
});

test('missing candidate checks, or a missing final solution set, are unfinished work — never a wrong answer or a right one', () => {
  const noChecks = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], set: { none: false, values: ['5'] } }), 'no checks');
  assert.equal(verdict(noChecks), 'incomplete/wrong');
  const oneCheck = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 5: check('valid', '5', '5') }, set: { none: false, values: ['5'] } }), 'one check');
  assert.equal(verdict(oneCheck), 'incomplete/wrong');
  const noSet = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') } }), 'no solution set');
  assert.equal(verdict(noSet), 'incomplete/wrong');
  assert.equal(part(noSet, 'solution-set').isComplete, false);
  const emptySet = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') }, set: { none: false, values: [] } }), 'empty set is not "none"');
  assert.equal(verdict(emptySet), 'incomplete/wrong');
  // A choice with no side values substituted is not a check of the original equation.
  const bareChoices = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: 'extraneous', 5: 'valid' }, set: { none: false, values: ['5'] } }), 'choices only');
  assert.equal(verdict(bareChoices), 'incomplete/wrong');
  // An unreadable value is not a value.
  const garbage = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: check('extraneous', 'four', '0'), 5: check('valid', '5', '5') }, set: { none: false, values: ['5'] } }), 'unreadable side value');
  assert.equal(verdict(garbage), 'incomplete/wrong');
  // An open relation-symbol decision keeps the answer open.
  const awaiting = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks: { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') }, set: { none: false, values: ['5'] }, awaiting: true }), 'awaiting a symbol');
  assert.equal(awaiting.browser.isComplete, false);
});

test('wrong side values, a wrong decision, or an invented set are each their own miss', () => {
  const base = { reached: [0, 5], set: { none: false, values: ['5'] } };
  const wrongSide = parity(SQRT_PLUS, attempt(SQRT_PLUS, { ...base, checks: { 0: check('extraneous', '2', '0'), 5: check('valid', '5', '5') } }), 'left at x = 0 is 4');
  assert.equal(part(wrongSide, 'candidate-verification').isCorrect, false);
  const swapped = parity(SQRT_PLUS, attempt(SQRT_PLUS, { ...base, checks: { 0: check('extraneous', '0', '4'), 5: check('valid', '5', '5') } }), 'sides swapped');
  assert.equal(part(swapped, 'candidate-verification').isCorrect, false);
  const radicalForm = parity(SQRT_PLUS, attempt(SQRT_PLUS, { ...base, checks: { 0: check('extraneous', 'sqrt(4)+2', '0'), 5: check('valid', 'sqrt(9)+2', '5') } }), 'sqrt(4)+2 is 4');
  assert.equal(verdict(radicalForm), 'complete/correct', 'a value written with its root is still the value');
  const fromSquared = parity(SQRT_PLUS, attempt(SQRT_PLUS, { ...base, checks: { 0: check('valid', '4', '0'), 5: check('valid', '5', '5') } }), 'sides differ but called valid');
  assert.equal(part(fromSquared, 'candidate-verification').isCorrect, false);
});

test('fabricated work: a relation the algebra cannot have produced, or checks for candidates that are not there', () => {
  const invented = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [5], checks: { 5: check('valid', '5', '5') }, set: { none: false, values: ['5'] } }), 'the correct answer without the candidate x = 0');
  assert.equal(part(invented, 'relation-work').isCorrect, false, 'a relation that dropped a candidate no step removed');
  assert.equal(invented.browser.isCorrect, false);
  const wrongCandidates = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [3, 5], checks: { 3: check('extraneous', '3', '3'), 5: check('valid', '5', '5') }, set: { none: false, values: ['5'] } }), 'an invented candidate');
  assert.equal(wrongCandidates.browser.isCorrect, false);
  const symbolic = parity(SQRT_PLUS, attempt(SQRT_PLUS, { state: { ...solvedState(SQRT_PLUS, ['sqrt(2)']) } }), 'an irrational candidate');
  assert.equal(symbolic.browser.isCorrect, false);
  // Checks keyed to values that are not candidates are never read.
  const stray = parity(SQRT_PLUS, attempt(SQRT_PLUS, {
    reached: [0, 5],
    checks: { 99: check('valid', '1', '1'), '-3': check('extraneous', '0', '0'), 0: check('extraneous', '4', '0') },
    set: { none: false, values: ['5'] },
  }), 'stray checks');
  assert.equal(verdict(stray), 'incomplete/wrong', 'x = 5 still has no check');
  // A response that claims its own verdict is not read for one.
  const claimed = gradeToolCheck(stepAlgebraWorkGrader, SQRT_PLUS, { ...attempt(SQRT_PLUS, { reached: [0, 5] }), isCorrect: true, score: 1, graded: true });
  assert.equal(claimed.isCorrect, false);
  // Work that is not a relation at all is not gradable, and never crashes.
  for (const junk of [null, 'x = 5', 5, { relation: 'x = 5' }, { relation: { branches: 'x' } }]) {
    assert.doesNotThrow(() => parity(SQRT_PLUS, junk, JSON.stringify(junk)), JSON.stringify(junk));
  }
});

test('changing an earlier step invalidates the checks that depended on it', () => {
  const checks = { 0: check('extraneous', '4', '0'), 5: check('valid', '5', '5') };
  const done = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 5], checks, set: { none: false, values: ['5'] } }), 'before');
  assert.equal(verdict(done), 'complete/correct');
  // The student goes back and the algebra now ends in x = 0 OR x = 6. The old check for 5 is not a
  // check of 6, and 6 has none: the answer is open again, never carried over.
  const changed = parity(SQRT_PLUS, attempt(SQRT_PLUS, { reached: [0, 6], checks, set: { none: false, values: ['5'] } }), 'after the earlier step changed');
  assert.equal(verdict(changed), 'incomplete/wrong');
  assert.equal(part(changed, 'candidate-verification').isComplete, false);
  // Back to a relation with no candidates yet: nothing is owed or credited.
  const reset = parity(SQRT_PLUS, attempt(SQRT_PLUS, { state: parseRelationSource(SQRT_PLUS.equation, 'x'), checks, set: { none: false, values: ['5'] } }), 'reset to the original');
  assert.equal(reset.browser.isComplete, false);
  assert.equal(reset.browser.isCorrect, false);
});

// ---------------------------------------------------------------------------
// Replay: each move is validated from the assigned item
// ---------------------------------------------------------------------------

const AT = Date.parse('2026-11-12T15:20:00Z');
const session = (question) => ({ question, record: emptyQuestionRecord(), state: parseRelationSource(question.equation, question.solveFor) });
const stepWorkOf = (before, after, kind, label, transition) => JSON.parse(JSON.stringify(normalizeStepWork(relationStepWork({ kind, label, before, after, transition }))));
const replay = (current, after, { kind = 'relation-step', label = 'step', transition }) => {
  const stepWork = stepWorkOf(current.state, after, kind, label, transition);
  const outcome = verifyStepAlgebraStep({ question: current.question, record: current.record, stepWork });
  if (outcome.eligible && outcome.verified) {
    current.record = recordQuestionStep({
      record: current.record,
      stepGrade: outcome.stepGrade,
      countsAttempt: outcome.countsAttempt,
      statePatch: outcome.statePatch,
      maximumAttempts: 3,
      occurredAt: AT,
    }).record;
    current.state = after;
  }
  return outcome;
};
const fromState = (state, expressions, extra = {}) => ({ ...state, branches: [{ expressions, relations: ['='] }], ...extra });
const orState = (state, pairs) => ({ ...state, branches: pairs.map((expressions) => ({ expressions, relations: ['='] })), connective: 'OR' });

test('replay: the whole lesson path is verified step by step and earns step credit, field for field', () => {
  const run = session(SQRT_PLUS);
  const steps = [
    [fromState(run.state, ['sqrt(x+4)', 'x-2']), { label: 'Subtract 2', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '2', branchIndices: [0] } }],
    [fromState(run.state, ['x+4', 'x^2-4*x+4']), { kind: 'radical-raise', label: 'Raise both sides to the power 2', transition: { kind: 'radicalRaise', branchIndex: 0, power: 2 } }],
    [fromState(run.state, ['0', 'x^2-5*x']), { label: 'Subtract x + 4', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: 'x+4', branchIndices: [0] } }],
    [fromState(run.state, ['0', 'x*(x-5)']), { kind: 'factor', label: 'Factor', transition: { kind: 'factor', branchIndex: 0 } }],
    [orState(run.state, [['x', '0'], ['x-5', '0']]), { kind: 'zero-product', label: 'Zero-product property', transition: { kind: 'zeroProduct', branchIndex: 0 } }],
  ];
  for (const [after, options] of steps) {
    const before = run.state;
    const outcome = replay(run, after, options);
    assert.equal(outcome.eligible, true, `${options.label}: ${outcome.reason}`);
    assert.equal(outcome.verified, true, `${options.label}: ${outcome.reason}`);
    assert.equal(outcome.stepGrade.accepted, true);
    assert.equal(outcome.stepGrade.earned, 1);
    // The server derives the very stepGrade the workspace's own builder reports for this step.
    assert.deepEqual(
      outcome.stepGrade,
      relationStepGrade({ kind: options.kind || 'relation-step', label: options.label, before, after, question: SQRT_PLUS }),
      `${options.label}: stepGrade`,
    );
    assert.deepEqual(outcome.statePatch, relationStatePatch(after), `${options.label}: saved state`);
    assert.equal(outcome.countsAttempt, stepActionCountsAttempt(STEP_ACTIONS.RELATION_STEP));
  }
  assert.equal(run.record.stepGrades.length, 5);
  assert.ok(run.record.stepGrades.every((step) => step.accepted !== false));
});

test('replay: wrong operations, forged lines and broken continuity earn nothing', () => {
  const run = session(SQRT_PLUS);
  const isolated = fromState(run.state, ['sqrt(x+4)', 'x-2']);
  const ok = replay(run, isolated, { label: 'Subtract 2', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '2', branchIndices: [0] } });
  assert.equal(ok.verified, true);

  const unverified = (outcome, reason) => {
    assert.equal(outcome.eligible, true, outcome.reason);
    assert.equal(outcome.verified, false, 'must not be credited');
    assert.equal(outcome.reason, reason);
    assert.equal(outcome.stepGrade.earned, 0);
    assert.equal(outcome.stepGrade.possible, 0);
  };
  // The right line but the wrong power for this root.
  unverified(replay(run, fromState(run.state, ['x+4', 'x^2-4*x+4']), { kind: 'radical-raise', transition: { kind: 'radicalRaise', branchIndex: 0, power: 3 } }), 'step-transition-invalid');
  // A power the student wrote wrong: (x - 2)^2 is not x^2 + 4.
  unverified(replay(run, fromState(run.state, ['x+4', 'x^2+4']), { kind: 'radical-raise', transition: { kind: 'radicalRaise', branchIndex: 0, power: 2 } }), 'step-transition-invalid');
  // Fabricated: the quadratic's roots, with no factoring.
  unverified(replay(run, orState(run.state, [['x', '0'], ['x-5', '0']]), { kind: 'zero-product', transition: { kind: 'zeroProduct', branchIndex: 0 } }), 'step-transition-invalid');
  // Fabricated: a solved relation that skips the algebra altogether.
  unverified(replay(run, fromState(run.state, ['x', '5']), { transition: { kind: 'equivalentRewrite' } }), 'step-transition-invalid');
  // A "no real solution" claim the equation does not justify.
  const noSolution = { ...run.state, branches: [], special: 'noSolution' };
  unverified(replay(run, noSolution, { kind: 'solution-claim', transition: { kind: 'solutionClaim', claim: 'noSolution' } }), 'step-transition-invalid');
  // A step from a state this student never reached.
  const elsewhere = session(SQRT_PLUS);
  elsewhere.state = fromState(elsewhere.state, ['x+4', 'x^2-4*x+4']);
  const jumped = replay(elsewhere, fromState(elsewhere.state, ['0', 'x^2-5*x']), { label: 'Subtract x + 4', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: 'x+4', branchIndices: [0] } });
  unverified(jumped, 'step-not-continuous');
  // An unknown step kind.
  unverified(replay(run, fromState(run.state, ['x+4', 'x^2-4*x+4']), { kind: 'radical-raise-all', transition: { kind: 'radicalRaise', branchIndex: 0, power: 2 } }), 'step-kind-unknown');
  // The record kept only the honest step.
  assert.equal(run.record.stepGrades.filter((step) => step.accepted !== false).length, 1);
});

test('replay: a student can undo back to an earlier state and continue from it', () => {
  const run = session(SQRT_PLUS);
  const isolated = fromState(run.state, ['sqrt(x+4)', 'x-2']);
  const first = replay(run, isolated, { label: 'Subtract 2', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '2', branchIndices: [0] } });
  assert.equal(first.verified, true);
  const raised = fromState(run.state, ['x+4', 'x^2-4*x+4']);
  assert.equal(replay(run, raised, { kind: 'radical-raise', transition: { kind: 'radicalRaise', branchIndex: 0, power: 2 } }).verified, true);
  // Undo returns to the isolated state; the next move is made from there.
  run.state = isolated;
  const again = replay(run, raised, { kind: 'radical-raise', transition: { kind: 'radicalRaise', branchIndex: 0, power: 2 } });
  assert.equal(again.verified, true, again.reason);
});

test('the transitions the workspace validates are the ones the server validates', () => {
  const before = fromState(parseRelationSource(SQRT_PLUS.equation, 'x'), ['sqrt(x+4)', 'x-2']);
  const after = fromState(before, ['x+4', 'x^2-4*x+4']);
  for (const power of [2, 3, 4, 5, 1, 6]) {
    const context = { kind: 'radicalRaise', branchIndex: 0, power };
    const workspace = validateRelationTransition(before, after, context).valid;
    const server = verifyStepAlgebraStep({
      question: SQRT_PLUS,
      record: (() => { const record = emptyQuestionRecord(); record.algebraState = { relationState: before }; return record; })(),
      stepWork: stepWorkOf(before, after, 'radical-raise', 'raise', context),
    });
    assert.equal(server.verified === true, workspace, `power ${power}`);
  }
});
