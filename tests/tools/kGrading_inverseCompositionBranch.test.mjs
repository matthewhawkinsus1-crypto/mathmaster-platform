import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildInverseCompositionLabReview } from '../../src/tools/shared/reviews/inverseCompositionLabReview.js';
import {
  expectedInverseRestriction,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabRoundTrip,
} from '../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';

/*
 * A ONE-BRANCH PARABOLA IS GRADED ON THE BRANCH ITS QUESTION DECLARES.
 *
 * compileAuthoringIntentV5 keeps an authored inverseBranch on the QUESTION and
 * drops it from f. The lab read the branch only from f (f.inverseBranch or a
 * one-sided domain at the vertex), so a V5-compiled one-branch parabola had no
 * inverse at all: no f⁻¹(f(x)) answer and no restriction choice was ever right.
 * f's own branch still wins over the question's.
 *
 * f⁻¹(f(x)) is x only for an x on the kept branch. Off it, f⁻¹ returns the
 * kept input with the same output, the mirror 2h − x.
 *
 * Every expected value below is worked by hand in the comment beside it.
 */

const TOOL_ID = 'inverseCompositionLab';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'One-branch inverse', courseId: 'algebra2', assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions: [{ standard: '2A.2B', prompt: 'Restrict f and undo it.', studentActions: ['findInverse'], ...question }] }],
}).package.sections[0].questions[0];

// f(x) = (x − 2)² − 1, right branch x ≥ 2.
const rightBranch = (x) => compileOne({
  mode: 'restriction',
  f: { type: 'quadratic', a: 1, h: 2, k: -1, inverseBranch: 'right' },
  inverseBranch: 'right',
  x,
});

// f(x) = 2(x + 1)² + 3, left branch x ≤ −1; g(x) = −x + 4.
const leftBranchFull = (x) => compileOne({
  mode: 'full',
  f: { type: 'quadratic', a: 2, h: -1, k: 3 },
  g: { type: 'linear', m: -1, b: 4 },
  inverseBranch: 'left',
  x,
});

test('the premise: V5 keeps the authored branch on the question', () => {
  // (Today it also drops it from f. Should the compiler keep it there too,
  // the precedence test below still covers a branch only the question names.)
  assert.equal(rightBranch(5).inverseBranch, 'right');
});

test('a V5-compiled right-branch parabola: its correct answers are graded right', () => {
  // f(5) = 3² − 1 = 8; on x ≥ 2, f⁻¹(8) = 2 + √(8 + 1) = 5.
  const question = rightBranch(5);
  const result = grade(question, { x: 5, inverseAnswer: '5', restrictionChoice: 'right' });
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  // The other branch is the wrong restriction.
  const wrongSide = grade(question, { x: 5, inverseAnswer: '5', restrictionChoice: 'left' });
  assert.equal(wrongSide.parts.find((part) => part.id === 'restriction').isCorrect, false);
  // "A restriction is required" names no branch: it is not the answer once one is declared.
  const unnamed = grade(question, { x: 5, inverseAnswer: '5', restrictionChoice: 'required' });
  assert.equal(unnamed.parts.find((part) => part.id === 'restriction').isCorrect, false);
});

test('a V5-compiled left-branch parabola in the full lab: every part graded right', () => {
  // x = −4: f(−4) = 2(−3)² + 3 = 21. g(−4) = 8, f(8) = 2·81 + 3 = 165.
  // g(21) = −17. On x ≤ −1, f⁻¹(21) = −1 − √((21 − 3)/2) = −1 − 3 = −4.
  const question = leftBranchFull(-4);
  const result = grade(question, { x: -4, fogAnswer: '165', gofAnswer: '-17', inverseAnswer: '-4', restrictionChoice: 'left' });
  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.parts.map((part) => [part.id, part.isCorrect]), [['fog', true], ['gof', true], ['inverse', true], ['restriction', true]]);
});

test('an x on the declared side of the vertex is still its own f⁻¹(f(x))', () => {
  // x = 2 is the vertex itself: f(2) = −1, f⁻¹(−1) = 2.
  assert.equal(grade(rightBranch(2), { x: 2, inverseAnswer: '2', restrictionChoice: 'right' }).isCorrect, true);
  // x = 3.5: f(3.5) = 1.25, f⁻¹(1.25) = 2 + √2.25 = 3.5.
  assert.equal(grade(rightBranch(3.5), { x: 3.5, inverseAnswer: '3.5', restrictionChoice: 'right' }).isCorrect, true);
});

// Red until the grader marks the inverse part against inverseLabRoundTrip(f, x)
// instead of x (functions/shared/serverGrading/tools/inverseCompositionLab.mjs,
// reported by lane c-inverse). Deliberately not a todo: honouring the
// question's branch without that change accepts x here — a wrong answer — so
// the two must land together.
test('an x on the wrong side of the vertex: f⁻¹(f(x)) is 2h − x, and x itself is wrong', () => {
  // x = −1: f(−1) = (−3)² − 1 = 8, and on x ≥ 2, f⁻¹(8) = 5 = 2·2 − (−1).
  const question = rightBranch(-1);
  assert.equal(grade(question, { x: -1, inverseAnswer: '-1', restrictionChoice: 'right' }).isCorrect, false);
  assert.equal(grade(question, { x: -1, inverseAnswer: '5', restrictionChoice: 'right' }).isCorrect, true);
  // Left branch, x = 1 (right of h = −1): f(1) = 11, f⁻¹(11) = −1 − 2 = −3.
  const left = leftBranchFull(1);
  // g(1) = 3, f(3) = 35; g(11) = −7.
  assert.equal(grade(left, { x: 1, fogAnswer: '35', gofAnswer: '-7', inverseAnswer: '1', restrictionChoice: 'left' }).isCorrect, false);
  assert.equal(grade(left, { x: 1, fogAnswer: '35', gofAnswer: '-7', inverseAnswer: '-3', restrictionChoice: 'left' }).isCorrect, true);
});

test('inverseLabRoundTrip: f⁻¹(f(x)) on the kept branch', () => {
  const right = inverseLabFunctions(rightBranch(5)).f;
  assert.equal(inverseLabRoundTrip(right, 5), 5);
  assert.equal(inverseLabRoundTrip(right, 2), 2);
  // f(−1) = 8 → 5; f(0) = 3 → 2 + 2 = 4.
  assert.equal(inverseLabRoundTrip(right, -1), 5);
  assert.equal(inverseLabRoundTrip(right, 0), 4);
  const left = inverseLabFunctions(leftBranchFull(-4)).f;
  assert.equal(inverseLabRoundTrip(left, -4), -4);
  // f(1) = 11 → −1 − √4 = −3.
  assert.equal(inverseLabRoundTrip(left, 1), -3);
  // A linear f: f(x) = 3x − 2 undoes exactly.
  assert.equal(inverseLabRoundTrip({ type: 'linear', a: 3, h: 0, k: -2 }, 0.1), 0.1);
  // No inverse (an unrestricted parabola), or f(x) undefined (x off f's domain).
  assert.ok(Number.isNaN(inverseLabRoundTrip({ type: 'quadratic', a: 1, h: 2, k: -1 }, 5)));
  assert.ok(Number.isNaN(inverseLabRoundTrip({ type: 'quadratic', a: 1, h: 2, k: -1, domain: { min: 2 } }, -1)));
});

test('a vertex domain written as text keeps the branch the restriction names', () => {
  // f(x) = (x − 2)² with domain { max: '2' }: the lab restricts to x ≤ 2 and
  // its restriction answer is 'left', so f⁻¹ returns inputs from x ≤ 2.
  const f = { type: 'quadratic', a: 1, h: 2, k: 0, domain: { max: '2' } };
  assert.equal(expectedInverseRestriction(f), 'left');
  // f(0) = 4; on x ≤ 2, f⁻¹(4) = 2 − 2 = 0 (the right branch would give 4).
  assert.equal(inverseLabRoundTrip(f, 0), 0);
  // f(1.5) = 0.25; f⁻¹(0.25) = 2 − 0.5 = 1.5.
  assert.equal(inverseLabRoundTrip(f, 1.5), 1.5);
  // x = 4 is outside x ≤ 2: f(4) is undefined.
  assert.ok(Number.isNaN(inverseLabRoundTrip(f, 4)));
  // Graded the same way (with the grader change above): 0 right, 4 wrong.
  const question = { type: TOOL_ID, mode: 'restriction', f, x: 0 };
  assert.equal(grade(question, { x: 0, inverseAnswer: '0', restrictionChoice: 'left' }).isCorrect, true);
  assert.equal(grade(question, { x: 0, inverseAnswer: '4', restrictionChoice: 'left' }).isCorrect, false);
  // The worked solution inverts on the same branch: −√4 = −2, −2 + 2 = 0.
  const review = buildInverseCompositionLabReview(question);
  assert.ok(review, 'a review');
  assert.ok(review.steps.some((step) => step.includes('−√4 = −2') && step.includes('So f⁻¹(4) = 0')));
});

test('precedence: f\'s own branch, then the question\'s', () => {
  const quadratic = { type: 'quadratic', a: 1, h: 2, k: -1 };
  const restrictionOf = (question) => expectedInverseRestriction(inverseLabFunctions(question).f);
  // f's own inverseBranch wins over the question's.
  assert.equal(restrictionOf({ f: { ...quadratic, inverseBranch: 'left' }, inverseBranch: 'right' }), 'left');
  // So does a one-sided domain ending at the vertex (x ≤ 2 keeps the left branch).
  assert.equal(restrictionOf({ f: { ...quadratic, domain: { max: 2 } }, inverseBranch: 'right' }), 'left');
  assert.equal(restrictionOf({ f: { ...quadratic, domain: { min: 2 } }, inverseBranch: 'left' }), 'right');
  // f names none: the question's.
  assert.equal(restrictionOf({ f: quadratic, inverseBranch: 'left' }), 'left');
  // Neither, or a value that is not a branch: still no inverse until one is chosen.
  assert.equal(restrictionOf({ f: quadratic }), 'required');
  assert.equal(restrictionOf({ f: quadratic, inverseBranch: 'up' }), 'required');
  assert.equal(hasFunctionalInverse(inverseLabFunctions({ f: quadratic, inverseBranch: 'up' }).f), false);
  // The graded verdict follows the same precedence: f says left, the question right.
  const question = { type: TOOL_ID, mode: 'restriction', f: { ...quadratic, inverseBranch: 'left' }, inverseBranch: 'right', x: 0 };
  // On x ≤ 2: f(0) = 3, f⁻¹(3) = 2 − 2 = 0.
  assert.equal(grade(question, { x: 0, inverseAnswer: '0', restrictionChoice: 'left' }).isCorrect, true);
  assert.equal(grade(question, { x: 0, inverseAnswer: '0', restrictionChoice: 'right' }).isCorrect, false);
});

test('a function invertible on its whole domain is graded exactly as before', () => {
  const families = [
    { type: 'linear', a: -2, h: 0, k: 3 },
    { type: 'exponential', a: 2, h: 1, k: -3, base: 3 },
    { type: 'logarithmic', a: 3, h: -1, k: 2, base: 10 },
    { type: 'squareRoot', a: -2, h: 1, k: 4 },
  ];
  // Hand-worked x and f⁻¹(f(x)) = x for each: x = 1, 2, 9, 5.
  const xs = [1, 2, 9, 5];
  families.forEach((f, index) => {
    const x = xs[index];
    const plain = { type: TOOL_ID, mode: 'restriction', f, x };
    const branched = { ...plain, inverseBranch: 'left' };
    // The question's branch leaves a non-parabola untouched.
    assert.equal(inverseLabFunctions(branched).f, f);
    for (const work of [
      { x, inverseAnswer: String(x), restrictionChoice: 'none' },
      { x, inverseAnswer: String(x + 1), restrictionChoice: 'none' },
      { x, inverseAnswer: String(x), restrictionChoice: 'left' },
    ]) {
      assert.deepEqual(grade(branched, work), grade(plain, work), `${f.type}: ${JSON.stringify(work)}`);
    }
    assert.equal(grade(branched, { x, inverseAnswer: String(x), restrictionChoice: 'none' }).isCorrect, true, f.type);
  });
});

test('the lab sees one f per question, so its memoised values keep their inputs', () => {
  const question = rightBranch(5);
  assert.equal(inverseLabFunctions(question).f, inverseLabFunctions(question).f);
  assert.equal(inverseLabFunctions(question).f.inverseBranch, 'right');
  // The question's own f is not changed.
  const plain = { f: { type: 'quadratic', a: 1, h: 2, k: -1 }, inverseBranch: 'right' };
  inverseLabFunctions(plain);
  assert.equal(plain.f.inverseBranch, undefined);
  // An f edited in place (an authoring preview) is read afresh, not from the
  // copy merged before the edit.
  plain.f.a = 3;
  plain.f.domain = { min: 2 };
  assert.equal(inverseLabFunctions(plain).f.a, 3);
  assert.equal(inverseLabFunctions(plain).f, plain.f, 'f now names its own branch');
  delete plain.f.domain;
  assert.equal(inverseLabFunctions(plain).f.a, 3);
  assert.equal(inverseLabFunctions(plain).f.inverseBranch, 'right');
});

test('a branch declared on the question satisfies the authoring check, so a V5 one-branch parabola is not flagged', async () => {
  const { validateToolQuestion } = await import('../../src/tools/toolSchemas.js');
  const warns = (question) => (validateToolQuestion(question).warnings || []).some((w) => /inverseBranch/.test(w));
  const f = { type: 'quadratic', a: 1, h: 2, k: 0 };
  assert.equal(warns({ type: TOOL_ID, mode: 'inverse', f, x: 3, inverseBranch: 'right' }), false, 'question-level branch');
  assert.equal(warns({ type: TOOL_ID, mode: 'inverse', f: { ...f, inverseBranch: 'right' }, x: 3 }), false, 'function-level branch');
  assert.equal(warns({ type: TOOL_ID, mode: 'inverse', f, x: 3 }), true, 'no branch anywhere still warns');
});
