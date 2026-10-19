import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import composedWorkflowGrader, {
  failedStageReasons,
  gradeComposedWorkflowCheck,
  gradeComposedWorkflowWork,
} from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { buildWorkflowReviewState, composedReasonsNote } from '../../src/platform/workflow/workflowReviewState.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * A COMPOSED QUESTION SAYS WHY A STEP IS RED (student pass 3, wave 7;
 * STUDENT_PASS3_FEEDBACK_REASONS.md survey row 1).
 *
 * Every stage the grader marks has a `detail`; gradedResult drops it from the
 * part record (what an attempt stores), so the student read only "The red
 * steps above are the specific responses that need revision." The browser's
 * Check now carries the failed stages' reasons beside its parts
 * (`stageReasons`); the review hands each red step its own; the runner shows
 * it under that step. The server's grade is unchanged, and the review — and
 * so every reason — exists only where outcome feedback is shown.
 */

const ARTIFACT = '__mathmasterWorkflowArtifact';
const SETUP = Object.freeze({
  type: 'relationshipModel',
  prompt: 'A tank fills at 10 gallons per minute.',
  workflow: [
    { id: 'roles', kind: 'quantityRoles', quantities: [{ id: 't', label: 'Time' }, { id: 'v', label: 'Volume' }] },
    { id: 'axes', kind: 'axisSetup', requireScale: true, scoreWeight: 3 },
    { id: 'meaning', kind: 'interpretation', prompt: 'What does 10 mean here?' },
  ],
  grading: {
    roles: { independent: 't', dependent: 'v' },
    axes: { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'], xStep: ['1'], yStep: ['10'], requireUnits: true, requireScale: true },
  },
});
const axes = (fields) => ({ ...fields, [ARTIFACT]: 'axes', isComplete: true });
const SETUP_RIGHT = Object.freeze({
  roles: { independent: 't', dependent: 'v' },
  axes: axes({ xLabel: 'Time', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'gallons', xStep: '1', yStep: '10' }),
  meaning: 'Ten gallons are added every minute.',
});
// Roles swapped, and the y-axis in the wrong unit.
const SETUP_WRONG = Object.freeze({
  ...SETUP_RIGHT,
  roles: { independent: 'v', dependent: 't' },
  axes: axes({ xLabel: 'Time', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'liters', xStep: '1', yStep: '10' }),
});

const runnerState = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading });
};

test('the browser Check carries each red stage\'s reason; the server\'s grade is byte-for-byte what it was', () => {
  const browser = gradeComposedWorkflowCheck(SETUP, composedWorkflowWork(SETUP_WRONG));
  assert.deepEqual(browser.stageReasons, {
    roles: 'Check the independent and dependent quantity.',
    axes: 'Check the y-axis unit.',
  });
  // The server never asks: no reasons in what ingestion reads or records.
  const server = gradeServerResponse({ question: SETUP, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal('stageReasons' in server, false);
  assert.equal('stageReasons' in composedWorkflowGrader.grade(SETUP, browser.toolResponse), false);
  assert.equal('stageReasons' in gradeComposedWorkflowWork(SETUP, composedWorkflowWork(SETUP_WRONG)), false);
  // Same parts either way, and no part carries a reason.
  assert.deepEqual(server.parts, browser.parts);
  browser.parts.forEach((part) => assert.equal('detail' in part || 'reason' in part, false, part.id));
  // Right work: nothing to say.
  assert.deepEqual(gradeComposedWorkflowCheck(SETUP, composedWorkflowWork(SETUP_RIGHT)).stageReasons, {});
});

test('the runner\'s answer state carries the reasons beside its parts, never in them', () => {
  const state = runnerState(SETUP, SETUP_WRONG);
  assert.equal(state.stageReasons.axes, 'Check the y-axis unit.');
  assert.equal(state.stageReasons.roles, 'Check the independent and dependent quantity.');
  state.parts.forEach((part) => assert.equal('reason' in part, false, `${part.id}: the recorded part is unchanged`));
});

test('a generic line, an ungraded stage or a right one gives no reason', () => {
  assert.deepEqual(failedStageReasons([
    { id: 'a', graded: true, isCorrect: false, detail: 'Not correct yet.' },
    { id: 'b', graded: true, isCorrect: false, detail: 'Not answered.' },
    { id: 'c', graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' },
    { id: 'd', graded: true, isCorrect: true, detail: 'Every value matches.' },
    { id: 'e', graded: true, isCorrect: false, detail: '2 of 3 values do not match.' },
    { id: 'f', graded: true, isCorrect: false },
  ]), { e: '2 of 3 values do not match.' });
});

test('the review gives a red step its reason, and nothing to a changed, right or unchecked step', () => {
  const { workflow } = readComposedQuestion(SETUP);
  const state = runnerState(SETUP, SETUP_WRONG);
  const review = { responseKey: state.responseKey, parts: state.parts, stageReasons: state.stageReasons, isCorrect: false };
  const byId = (entries) => Object.fromEntries(entries.map((entry) => [entry.id, entry]));
  const checked = byId(buildWorkflowReviewState({ stages: workflow, responses: SETUP_WRONG, review }));
  assert.equal(checked.axes.status, 'incorrect');
  assert.equal(checked.axes.reason, 'Check the y-axis unit.');
  assert.equal(checked.roles.reason, 'Check the independent and dependent quantity.');
  assert.equal('reason' in checked.meaning, false);
  // Edited after the check: the old reason is not about this response.
  const edited = byId(buildWorkflowReviewState({ stages: workflow, responses: { ...SETUP_WRONG, axes: axes({ ...SETUP_WRONG.axes, yUnit: 'gallons' }) }, review }));
  assert.equal(edited.axes.status, 'changed');
  assert.equal('reason' in edited.axes, false);
  // A right step never shows a reason, whatever the review holds.
  const right = runnerState(SETUP, SETUP_RIGHT);
  const stray = byId(buildWorkflowReviewState({ stages: workflow, responses: SETUP_RIGHT, review: { responseKey: right.responseKey, parts: right.parts, stageReasons: { roles: 'stray' }, isCorrect: true } }));
  assert.equal(stray.roles.status, 'correct');
  assert.equal('reason' in stray.roles, false);
  // No review (an exit ticket, quiz or test before release): no reason anywhere.
  buildWorkflowReviewState({ stages: workflow, responses: SETUP_WRONG, review: null }).forEach((entry) => assert.equal('reason' in entry, false, entry.id));
});

test('the outcome box\'s line says the steps say why only when they do', () => {
  const parts = [{ id: 'a', isCorrect: false }, { id: 'b', isCorrect: false }, { id: 'c', isCorrect: true }, { id: 'd', isCorrect: false, graded: false }];
  assert.equal(composedReasonsNote({ parts, stageReasons: { a: 'x', b: 'y' } }), ' Each one says what to check.');
  assert.equal(composedReasonsNote({ parts, stageReasons: { a: 'x' } }), ' Where it can, each one says what to check.');
  assert.equal(composedReasonsNote({ parts, stageReasons: {} }), '');
  assert.equal(composedReasonsNote(null), '');
});

test('the runner shows the reason under a red step, from the review only', () => {
  const runner = executableSource(readFileSync(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8'));
  const stage = region(runner, 'const renderStage = ', '\n  const promptAndScenario', 'renderStage');
  assert.match(stage, /const stageReason = reviewByStageId\.get\(stage\.id\)\?\.reason \|\| '';/);
  assert.match(stage, /\{reviewStatus === 'incorrect' && stageReason \? \(\s*<p className="workflow-stage__reason" data-stage-reason=\{stage\.id\}[^>]*>\s*\{stageReason\}\s*<\/p>/);
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  // The review reaches the runner only where outcome feedback is shown…
  assert.match(engine, /submissionReview=\{showOutcomeFeedback \? workflowSubmissionReview : null\}/);
  // …and carries the reasons from the answer state.
  assert.match(region(engine, 'setWorkflowSubmissionReview({', '});', 'the review'), /stageReasons: answerState\.stageReasons \|\| null,/);
  assert.match(engine, /import \{ composedReasonsNote \} from '\.\/platform\/workflow\/workflowReviewState\.js';/);
  assert.match(engine, /MathMaster moved you to the first one\.\{composedReasonsNote\(workflowSubmissionReview\)\}/);
});
