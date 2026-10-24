// FB24: a step that follows a red choice is said to, and a step that started
// again because the choice changed says why.
//
// Walkthrough 2026-10-22 (Algebra I DOL #3 review, PR 2, the popcorn model):
// on the "continuous" attempt only Step 4 (Classify) showed red; the domain and
// range typed under "continuous" sat unmarked, though they are asked again
// once Classify is right, and changing Classify emptied them with no word why.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { branchRestartedBy, buildWorkflowReviewState } from '../../src/platform/workflow/workflowReviewState.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { componentSource } from './helpers/sourceContract.mjs';

const REVIEW = compileTeacherImport(fs.readFileSync('teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json', 'utf8'));
const popcorn = REVIEW.questions.find((question) => question.questionId === 'dol3-review-q02');
const { composed } = resolveComposedWorkflow(popcorn);
const visible = (responses) => composed.workflow.filter((stage) => !stage.showWhen || responses[stage.showWhen.stage] === stage.showWhen.is);

const continuousAttempt = () => {
  const responses = {
    quantities: { independent: 'buckets', dependent: 'cost' },
    equation: 'f(x)=6x',
    continuity: 'continuous',
    domainContinuous: '0 <= x <= 5',
    rangeContinuous: '0 <= y <= 30',
  };
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  responses.table = workflowTableArtifact({
    stage: tableStage,
    cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(6 * x)])),
    isComplete: true,
    sourceModel: responses.equation,
    content: composed.content,
  });
  return responses;
};

test('on the branch the key does not take, domain and range follow the red Classify', () => {
  const responses = continuousAttempt();
  const graded = gradeComposedWorkflowWork(popcorn, { responses });
  const parts = Object.fromEntries(graded.parts.map((part) => [part.id, part]));
  assert.equal(parts.continuity.isCorrect, false);
  // The grader has no key for them on this branch: they are left unmarked.
  assert.equal(parts.domainContinuous.graded, false);
  assert.equal(parts.rangeContinuous.graded, false);

  const state = buildWorkflowReviewState({
    stages: visible(responses),
    responses,
    review: { responseKey: JSON.stringify(responses), parts: graded.parts },
  });
  const byId = Object.fromEntries(state.map((entry) => [entry.id, entry]));
  assert.equal(byId.continuity.status, 'incorrect');
  for (const id of ['domainContinuous', 'rangeContinuous']) {
    assert.equal(byId[id].status, 'reviewed', `${id} keeps its own (unmarked) status`);
    assert.equal(byId[id].followsIncorrect, 'continuity', `${id} names the choice it follows`);
  }
  assert.equal(byId.equation.followsIncorrect, undefined, 'a step on no branch follows nothing');
});

test('a step on a choice that was right, or one graded on its own, follows nothing', () => {
  const stages = [
    { id: 'choice', kind: 'classification' },
    { id: 'after', kind: 'domainInput', showWhen: { stage: 'choice', is: 'a' } },
    { id: 'graded', kind: 'rangeInput', showWhen: { stage: 'choice', is: 'a' } },
  ];
  const responses = { choice: 'a', after: 'x > 0', graded: 'y > 0' };
  const review = (choiceRight) => ({
    responseKey: JSON.stringify(responses),
    parts: [
      { id: 'choice', graded: true, isCorrect: choiceRight },
      { id: 'after', graded: false, isCorrect: false },
      { id: 'graded', graded: true, isCorrect: false },
    ],
  });
  const wrong = buildWorkflowReviewState({ stages, responses, review: review(false) });
  assert.deepEqual(wrong.map((entry) => entry.followsIncorrect), [undefined, 'choice', undefined]);
  assert.equal(wrong[2].status, 'incorrect', 'a step graded wrong stays red on its own');
  const right = buildWorkflowReviewState({ stages, responses, review: review(true) });
  assert.deepEqual(right.map((entry) => entry.followsIncorrect), [undefined, undefined, undefined]);
});

test('a step that replaced an answered one after the choice changed says why', () => {
  const responses = { ...continuousAttempt(), continuity: 'discrete' };
  const stage = (id) => composed.workflow.find((entry) => entry.id === id);
  assert.equal(branchRestartedBy({ stage: stage('domainDiscrete'), authoredStages: composed.workflow, responses }), 'continuity');
  assert.equal(branchRestartedBy({ stage: stage('rangeDiscrete'), authoredStages: composed.workflow, responses }), 'continuity');
  // Once written again it is the student's answer, with nothing to explain.
  assert.equal(branchRestartedBy({ stage: stage('domainDiscrete'), authoredStages: composed.workflow, responses: { ...responses, domainDiscrete: '{0, 1}' } }), '');
  // A first visit to a branch, with nothing typed under the other answer, is not a restart.
  const { domainContinuous: _d, rangeContinuous: _r, ...fresh } = responses;
  assert.equal(branchRestartedBy({ stage: stage('domainDiscrete'), authoredStages: composed.workflow, responses: fresh }), '');
  // A step on no branch never restarts.
  assert.equal(branchRestartedBy({ stage: stage('equation'), authoredStages: composed.workflow, responses: {} }), '');
});

test('the steps screen says both things where the student looks', () => {
  const runner = componentSource('src/platform/workflow/WorkflowRunner.jsx');
  // The banner under "N steps need attention" names the steps that follow.
  assert.match(runner, /followersByStageId\.get\(entry\.id\)/);
  assert.match(runner, /your answer to Step \{entry\.index \+ 1\}, so/);
  // The step itself, on screen and to a screen reader.
  assert.match(runner, /Follows Step \{activeFollowsIndex \+ 1\}, which needs revision/);
  assert.match(runner, /', follows a step that needs revision'/);
  // The restarted step's note.
  assert.match(runner, /branchRestartedBy\(\{ stage, authoredStages: authoredWorkflow, responses \}\)/);
  assert.match(runner, /so this step starts again, written the way that answer needs\./);
});
