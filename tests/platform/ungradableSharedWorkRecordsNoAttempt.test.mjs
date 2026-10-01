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
  assert.match(handler.slice(guard, guard + 200), /setFeedback\(UNCHECKABLE_WORK_FEEDBACK\);\s*return;/);
  assert.match(region(source, 'const UNCHECKABLE_WORK_FEEDBACK', 'const EMPTY_ANSWER_STATE'), /blocked: true/);
});

test('a composed question whose work the shared grader declines records no attempt either', async () => {
  const { buildWorkflowAnswerState } = await import('../../src/platform/workflow/workflowAnswerState.js');
  const { readComposedQuestion, activeStages } = await import('../../src/platform/workflow/questionWorkflow.js');
  const question = {
    type: 'relationMapping',
    prompt: 'Study the relation {(-4, 1), (-2, 3), (1, 3), (3, 5)}.',
    pairs: [[-4, 1], [-2, 3], [1, 3], [3, 5]],
    recipe: { ask: ['mapping', 'domain', 'range', 'isFunction'] },
  };
  const composed = readComposedQuestion(question);
  const stages = activeStages(composed.workflow, {});
  const domainStage = stages.find((stage) => /domain/i.test(stage.id));
  assert.ok(domainStage, 'the recipe has a domain stage');
  // Text the server will not run (a range) is declined, and the host is told.
  const state = buildWorkflowAnswerState({ question, stages, responses: { [domainStage.id]: 'sum(1:100000)' } });
  assert.equal(state.sharedGradingWithheld, 'unsafe-expression');

  const source = componentSource('src/QuestionEngine.jsx');
  const submit = region(source, 'const performSubmit', 'const handleSubmit');
  const guard = submit.indexOf('answerState.sharedGradingWithheld');
  assert.ok(guard > 0, 'performSubmit consults the withheld marker');
  assert.ok(guard < submit.indexOf('onGrade('), 'before any attempt is recorded');
  assert.match(submit.slice(guard, guard + 200), /setFeedback\(UNCHECKABLE_WORK_FEEDBACK\);\s*return;/);
});
