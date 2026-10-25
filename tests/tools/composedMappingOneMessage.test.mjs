import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { buildWorkflowReviewState, stageShowsReason } from '../../src/platform/workflow/workflowReviewState.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * A COMPOSED MAPPING STEP SHOWS ONE MESSAGE, NOT TWO (FB06).
 *
 * The mapping step is the relation tool: its own Check says "The arrows do not
 * match the relation…" under the diagram, and after the question's Submit the
 * step is red and carries the grader's reason ("The arrows do not match the
 * relation — check which value each one is joined to."). They agree, so a
 * student read the same thing twice. After Submit the reason is the step's
 * message and the tool's own verdict and coaching step aside; they come back
 * when the student changes the work and checks again.
 *
 * The decision is stageShowsReason (workflowReviewState.js), asked of the
 * review the runner draws every step from, so it is true exactly when the
 * reason paragraph is on screen. The tool half is a source contract (nothing
 * here renders React).
 */

const RELATION = Object.freeze({
  type: 'relationMapping',
  prompt: 'Represent this relation.',
  pairs: [[1, 2], [2, 4], [3, 6]],
  recipe: { name: 'relationRepresentations', ask: ['mapping'] },
});
const RIGHT = [[1, 2], [2, 4], [3, 6]];
const WRONG = [[1, 2], [2, 6], [3, 4]];

const reviewOf = (responses, checked = responses) => {
  const { workflow, grading } = readComposedQuestion(RELATION);
  const state = buildWorkflowAnswerState({ question: RELATION, stages: activeStages(workflow, checked), responses: checked, grading });
  const review = { responseKey: state.responseKey, parts: state.parts, stageReasons: state.stageReasons, isCorrect: state.isCorrect };
  return buildWorkflowReviewState({ stages: workflow, responses, review: review })[0];
};

test('after Submit a wrong mapping shows the grader\'s reason, and that is when the tool\'s own coaching steps aside', () => {
  const red = reviewOf({ mapping: WRONG });
  assert.equal(red.status, 'incorrect');
  assert.equal(red.reason, 'The arrows do not match the relation — check which value each one is joined to.');
  assert.equal(stageShowsReason(red), true);
});

test('a right mapping, a mapping changed since Submit, and a step not yet submitted keep the tool\'s own words', () => {
  assert.equal(stageShowsReason(reviewOf({ mapping: RIGHT })), false, 'right: no reason');
  // Submitted wrong, then the arrows were redrawn: the old reason is not about this work.
  const changed = reviewOf({ mapping: RIGHT }, { mapping: WRONG });
  assert.equal(changed.status, 'changed');
  assert.equal(stageShowsReason(changed), false);
  // Not submitted at all (a draft, or no review on an exit ticket): nothing to replace the tool's words.
  const { workflow } = readComposedQuestion(RELATION);
  const draft = buildWorkflowReviewState({ stages: workflow, responses: { mapping: WRONG }, review: null })[0];
  assert.equal(draft.status, 'draft');
  assert.equal(stageShowsReason(draft), false);
  assert.equal(stageShowsReason(undefined), false);
  // Red with no sentence to show (a kind whose reason is empty) leaves the tool's words in place.
  assert.equal(stageShowsReason({ status: 'incorrect' }), false);
  assert.equal(stageShowsReason({ status: 'incorrect', reason: '' }), false);
});

test('the runner hands the same answer to the step\'s tool, which hides its verdict and coaching while the reason shows', () => {
  const runner = executableSource(readFileSync(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8'));
  const stage = region(runner, 'const renderStage = ', '\n  const promptAndScenario', 'renderStage');
  // One flag decides both the reason paragraph and the tool's silence.
  assert.match(stage, /const reasonShown = stageShowsReason\(reviewByStageId\.get\(stage\.id\)\);/);
  assert.match(stage, /\{reasonShown \? \(\s*<p className="workflow-stage__reason"/);
  assert.match(region(stage, '<StageBody', '</>', 'the StageBody element'), /coachingReplaced=\{reasonShown\}/);
  // StageBody passes it to the delegate; the mapping delegate passes it to the tool.
  assert.match(region(runner, 'function StageBody(', 'switch (stage.kind)', 'StageBody'), /delegate\(\{[^}]*coachingReplaced[^}]*\}\)/);
  assert.match(region(runner, 'mappingDiagram: ({', 'coordinatePlot: ({', 'the mapping delegate'), /<RelationMapping[\s\S]*coachingReplaced=\{coachingReplaced\}/);
  // The tool shows its pill (verdict and coaching) only while the flag is off.
  const tool = executableSource(readFileSync(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8'));
  assert.match(tool, /\{feedback && !coachingReplaced \? \(\s*<div[^>]*>\s*<ResultPill ok=\{feedback\.isCorrect\} message=\{message\(\)\}>/);
  assert.match(tool, /export default function RelationMapping\([^)]*coachingReplaced = false[^)]*\)/);
});
