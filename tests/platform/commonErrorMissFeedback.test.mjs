// FB04: the lesson's own common error, said on the miss that makes it.
//
// Walkthrough 2026-10-22 (Algebra I DOL #3 review, PR 1): the authored common
// error (range 0 ≤ y ≤ 80; "the battery never drops below 20%") got only
// "Not quite. You have 2 tries left." on the attempt. Its mistake half is now
// said when the student's wrong value is one it names; the half after ";"
// gives the answer and still waits for the closed question's review.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { commonErrorMiss, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';

const REVIEW = compileTeacherImport(fs.readFileSync('teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json', 'utf8'));
const battery = REVIEW.questions.find((question) => question.questionId === 'dol3-review-q01');
const partsFor = (range) => gradeComposedWorkflowWork(battery, { responses: { domain: '0 <= x <= 6', range } }).parts;

test('the range the common error names gets its mistake half, and nothing of the answer', () => {
  assert.match(battery.solutionReview.commonError, /^Writing the range as 0 ≤ y ≤ 80 or 0 ≤ y ≤ 100; /);
  for (const range of ['0 <= y <= 80', '0 ≤ y ≤ 100', '0<=y<=80']) {
    const said = missFeedback({ question: battery, attemptNumber: 1, parts: partsFor(range) });
    assert.deepEqual(said, {
      message: 'A common slip here: writing the range as 0 ≤ y ≤ 80 or 0 ≤ y ≤ 100.',
      source: 'authored-common-error',
    }, range);
    assert.doesNotMatch(said.message, /20 ≤ y ≤ 80|battery/, 'the explanation and the answer wait for the review');
  }
});

test('another wrong range, a near miss, or a right answer hears nothing from it', () => {
  for (const range of ['20 <= y <= 70', '0 <= y <= 8', 'y <= 80', '20 <= y <= 80']) {
    assert.equal(commonErrorMiss({ question: battery, parts: partsFor(range) }), null, range);
  }
});

test('a common error that names an accepted value, has no mistake half, or is still a template is never said', () => {
  const question = (commonError, key = '7/3') => ({ answerFields: [{ id: 'a', answer: key }], solutionReview: { commonError } });
  const wrong = (response) => [{ id: 'a', isCorrect: false, response }];
  // Its mistake half would give the answer away.
  assert.equal(commonErrorMiss({ question: question('Writing 7/3 as 2.33; the fraction is exact.'), parts: wrong('2.33') }), null);
  // The same mistake without the key in it is said.
  assert.match(commonErrorMiss({ question: question('Writing the answer as 2.33; the fraction is exact.'), parts: wrong('2.33') }).message, /^A common slip here: writing the answer as 2\.33\.$/);
  // No ";": nothing separates the mistake from the explanation.
  assert.equal(commonErrorMiss({ question: question('Writing the answer as 2.33, which rounds.'), parts: wrong('2.33') }), null);
  // A family template before its numbers are filled in.
  assert.equal(commonErrorMiss({ question: question('Using {{b}} as 2.33; it is {{c}}.'), parts: wrong('2.33') }), null);
  // A part the grader did not mark, or marked right, is not the mistake.
  assert.equal(commonErrorMiss({ question: question('Writing the answer as 2.33; exact.'), parts: [{ id: 'a', graded: false, isCorrect: false, response: '2.33' }] }), null);
});

test('an authored message keyed to the answer still comes first, and the common error before a diagnosis', () => {
  const parts = partsFor('0 <= y <= 80');
  const keyed = { ...battery, misconceptions: [{ match: ['0 <= y <= 80'], message: 'Check the lowest charge on the graph.' }] };
  assert.equal(missFeedback({ question: keyed, parts }).source, 'authored-misconception');
  const diagnosed = missFeedback({ question: battery, parts, diagnosis: { message: 'A generic check.', source: 'generic' } });
  assert.equal(diagnosed.source, 'authored-common-error');
  // Without a match, the diagnosis is said as before.
  assert.equal(missFeedback({ question: battery, parts: partsFor('20 <= y <= 70'), diagnosis: { message: 'A generic check.', source: 'generic' } }).source, 'generic');
});
