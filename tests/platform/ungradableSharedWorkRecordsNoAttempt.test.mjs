/*
 * WORK A SERVER-GRADED MODE CANNOT GRADE SPENDS NO ATTEMPT.
 *
 * When a tool mode has a shared grader but a particular submission cannot be
 * graded (the question cannot be computed, the work is unreadable or
 * oversize), ingestion holds the envelope for teacher review instead of
 * recording it. The browser must not record a fallback verdict for the same
 * work, or the student loses an attempt the gradebook never sees.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { sharedVerdictWithholdsAttempt } from '../../src/platform/grading/registryToolGrading.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { componentSource, region } from './helpers/sourceContract.mjs';

test('an ungradable result on a server-graded mode withholds the attempt; a device-graded mode does not', () => {
  ['malformed-response', 'invalid-question', 'no-answer-key', 'oversize-response', 'empty-response', 'grader-declaration-drift', 'response-tool-mismatch']
    .forEach((reason) => assert.equal(sharedVerdictWithholdsAttempt({ graded: false, reason }), true, reason));
  ['mode-not-server-gradable:freehand', 'shared-grading-unavailable', 'no-tool', 'no-tool-grader:legacyTool']
    .forEach((reason) => assert.equal(sharedVerdictWithholdsAttempt({ graded: false, reason }), false, reason));
  assert.equal(sharedVerdictWithholdsAttempt({ graded: true, isCorrect: false }), false);
  assert.equal(sharedVerdictWithholdsAttempt(null), false);
});

test('a real grader\'s refusal is one the browser withholds', () => {
  const refused = gradeToolWork({ toolId: 'complexPlaneLab', question: { type: 'complexPlaneLab', mode: 'operations' }, work: 'not an object' });
  assert.equal(refused.graded, false);
  assert.equal(sharedVerdictWithholdsAttempt(refused), true);
});

test('QuestionEngine checks the guard before it records a registry tool attempt', () => {
  const source = componentSource('src/QuestionEngine.jsx');
  const handler = region(source, 'const handleMissingToolAction', 'const handleModelingLabGrade');
  const guard = handler.indexOf('sharedVerdictWithholdsAttempt(sharedVerdict)');
  assert.ok(guard > 0, 'the guard is consulted');
  assert.ok(guard < handler.indexOf('onGrade?.('), 'before any attempt is recorded');
  assert.match(handler.slice(guard, guard + 600), /blocked: true[\s\S]*return;/);
});
