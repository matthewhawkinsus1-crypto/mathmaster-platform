// FB23: "NOT IN LOWEST TERMS" IS SAID WHILE A FRACTION ITEM IS STILL OPEN
// (the owner, 2026-10-23).
//
// A right-value fraction that is not in lowest terms got only "Focus on:
// Fraction answer" while the item was open, because every generic check was
// silent until it closed (QA M1: each relates the answer to the key by one
// move, so naming it hands the answer over). Saying the FORM is wrong names no
// move toward a different value: the value is already right. So that one
// check speaks while open, as the right-line-wrong-form and simplest-form
// messages already do; the sign, reciprocal and swapped-pair checks stay
// silent until the item closes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeFractionResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { genericMissCheck, GENERIC_MISS_MESSAGES } from '../../src/platform/supports/feedback/genericMissChecks.js';
import { diagnoseMiss } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';

const LOWEST_TERMS = { type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4' };
const missOn = (question, response) => {
  const result = gradeFractionResponse(question, response);
  return { graded: true, isCorrect: result.isCorrect, parts: result.parts.map((part) => ({ ...part, graded: true })) };
};

test('while the item is open, a right value not in lowest terms is named; nothing else a check sees is', () => {
  const open = genericMissCheck({ student: '6/8', expected: '3/4' });
  assert.deepEqual(open, { check: 'not-simplified', message: GENERIC_MISS_MESSAGES['not-simplified'] });
  assert.deepEqual(genericMissCheck({ student: '\\frac{6}{8}', expected: '3/4', open: true })?.check, 'not-simplified');
  // A key typed as a mixed number is not read as the fraction its digits
  // close up into (3 2/5 is not 32/5): 64/10 is not "right" against it.
  assert.equal(genericMissCheck({ student: '64/10', expected: '3 2/5' }), null);
  assert.equal(genericMissCheck({ student: '64/10', expected: '3 2/5', open: false }), null);
  // The checks that name a move stay silent until the item closes (QA M1).
  for (const [student, expected] of [['-3/4', '3/4'], ['4/3', '3/4'], ['(5, 2)', '(2, 5)'], ['7', '-7']]) {
    assert.equal(genericMissCheck({ student, expected }), null, `${student} for ${expected}, open`);
    assert.ok(genericMissCheck({ student, expected, open: false }), `${student} for ${expected}, closed`);
  }
});

test('a lowest-terms fraction question says why 6/8 is not yet right, with attempts left', () => {
  const grading = missOn(LOWEST_TERMS, '6/8');
  assert.equal(grading.isCorrect, false, 'the grader refuses 6/8 where lowest terms are asked');
  const diagnosis = diagnoseMiss({ question: LOWEST_TERMS, grading, attemptsLeft: true });
  assert.deepEqual([diagnosis?.source, diagnosis?.code, diagnosis?.message], ['generic', 'not-simplified', GENERIC_MISS_MESSAGES['not-simplified']]);
  // It is what the box shows under "Not quite", in place of an authored line.
  const shown = missFeedback({ question: { ...LOWEST_TERMS, attemptFeedback: ['Look again at your work.'] }, attemptNumber: 1, diagnosis, parts: grading.parts });
  assert.equal(shown.message, GENERIC_MISS_MESSAGES['not-simplified']);
  // A wrong value on the same item is still an ordinary miss while open.
  assert.equal(diagnoseMiss({ question: LOWEST_TERMS, grading: missOn(LOWEST_TERMS, '-3/4'), attemptsLeft: true }), null);
  assert.equal(diagnoseMiss({ question: LOWEST_TERMS, grading: missOn(LOWEST_TERMS, '5/8'), attemptsLeft: true }), null);
  // The message names the form, never a number from the item.
  assert.doesNotMatch(GENERIC_MISS_MESSAGES['not-simplified'], /\d/);
});
