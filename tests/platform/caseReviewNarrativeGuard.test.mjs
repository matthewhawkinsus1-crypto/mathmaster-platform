// The narrative guard: the case review may state recorded facts, and may never
// state a compliance verdict, a cause, a motive, a diagnosis or a
// counterfactual — the conclusions the brief forbids.

import test from 'node:test';
import assert from 'node:assert/strict';

import { FORBIDDEN_CONCLUSIONS, narrativeViolations, renderNarrativeTemplate } from '../../src/platform/caseReview/narrativeGuard.js';

const FORBIDDEN = [
  'The IEP was implemented for this assignment.',
  'The IEP was not implemented.',
  'The teacher complied with the plan.',
  'The teacher failed to comply with the accommodation.',
  'The teacher did not provide this accommodation.',
  'The read-aloud support caused the higher score.',
  'Her score dropped because of the reduced time.',
  'The student chose not to try on the DOL.',
  'The student did not work.',
  'The student refused to attempt the practice.',
  'The disability caused the result.',
  'The student would have passed with the calculator.',
  'Without the support the student would fail.',
  'The student lacks motivation.',
  'The student shows low effort.',
  'This accommodation was not provided.',
  'The student never opened the assignment.',
];

const ALLOWED = [
  'The student was assigned 8 MathMaster activities during the selected period and completed 6.',
  'The student completed 73% of Classwork items correctly and 42% of DOL items correctly.',
  'The student used all available attempts on 11 questions.',
  'Seven initially incorrect questions were corrected on a later attempt.',
  "The student's individualized deadline for Lesson 4 was September 24.",
  'The platform records calculator use on three assignments.',
  'Historical active time is not available for two assignments because that telemetry was not recorded.',
  'MathMaster does not contain a historical record establishing whether a verbal check for understanding occurred.',
  'No MathMaster record shows the student opening Lesson 2.',
];

test('every forbidden conclusion from the brief is caught', () => {
  FORBIDDEN.forEach((sentence) => {
    assert.ok(narrativeViolations(sentence).length > 0, `should refuse: ${sentence}`);
  });
});

test('the brief\'s own example facts pass', () => {
  ALLOWED.forEach((sentence) => {
    assert.deepEqual(narrativeViolations(sentence), [], `should allow: ${sentence}`);
  });
});

test('a template is checked before teacher text is interpolated, so a title cannot trip or bypass the guard', () => {
  // A teacher-written title that happens to contain a forbidden word is data,
  // not a conclusion: the fact around it is still safe.
  const safe = renderNarrativeTemplate("The student's individualized deadline for {title} was {date}.", {
    title: 'Corrections for failed items — IEP week', date: 'September 24',
  });
  assert.equal(safe, "The student's individualized deadline for Corrections for failed items — IEP week was September 24.");
  // A template that itself concludes is refused before anything is rendered.
  assert.throws(() => renderNarrativeTemplate('The support caused a score of {score}%.', { score: 80 }), /forbidden/i);
  // A missing placeholder value is refused rather than printed as "undefined".
  assert.throws(() => renderNarrativeTemplate('Completed {count} of {total}.', { count: 3 }), /total/);
});

test('each forbidden family names what it guards against', () => {
  assert.ok(FORBIDDEN_CONCLUSIONS.length >= 6);
  FORBIDDEN_CONCLUSIONS.forEach((rule) => {
    assert.ok(rule.id && rule.reason && rule.pattern instanceof RegExp);
  });
});
