/*
 * A SLIP IN ONE STEP OF A COMPOSED QUESTION, NAMED ON THE MISS THAT MAKES IT
 * (walkthrough 2026-10-22, F-GENERIC-FEEDBACK).
 *
 * Two composed items of the Algebra I DOL #3 Review said only "Not quite" when
 * a student made exactly the mistake the item's own common error names: the
 * popcorn model's "Leaving 0 out of the domain or connecting the points"
 * (PR 2) and the draining tank's "Mixing up the zero and the y-intercept"
 * (PR 8). Neither names a value, so FB04 cannot match it, and a composed
 * question's steps are not answer fields, so a keyed slip naming a step was
 * never read.
 *
 * An authored `misconceptions` entry whose `field` names a step is now read in
 * that step only, by the step's own grader with the slip as its key (slipMade,
 * attemptFeedbackPlan.js). This holds that:
 *   - each slip is named when it is typed in its step, in any spelling the step
 *     accepts: any order, an ellipsis, the braces MathLive writes;
 *   - the step's right answer is never named, nor another wrong answer;
 *   - a slip is read in its own step only, and only in a step marked wrong;
 *   - no sentence said on a miss states an answer;
 *   - the Honors review, built from this one, says the same.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

const compiled = (file) => compileTeacherImport(readFileSync(new URL(`../../teacher-import-jsons/algebra1-dol3/${file}`, import.meta.url), 'utf8'));
const REVIEWS = Object.entries({
  regular: compiled('Algebra1_DOL3_Review.json'),
  honors: compiled('Algebra1_DOL3_Review_Honors.json'),
});
const item = (review, id) => {
  const question = review.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the review compiles ${id}`);
  return question;
};

/** The keyed sentence a student reads under "Not quite" for this work, or null. */
const said = (question, responses) => {
  const { parts } = gradeComposedWorkflowWork(question, { responses });
  const feedback = missFeedback({ question, attemptNumber: 1, parts });
  return feedback?.source === 'authored-misconception' ? feedback.message : null;
};
const isRight = (question, responses) => gradeComposedWorkflowWork(question, { responses }).isCorrect === true;

// The tank holds 48 gallons and drains 4 a minute: empty at 12 minutes.
const TANK = Object.freeze({
  xInterceptExists: 'Yes',
  xIntercept: '(12, 0)',
  xInterceptValue: '(12, 0)',
  zeros: '{12}',
  yInterceptExists: 'Yes',
  yIntercept: '(0, 48)',
  yInterceptValue: '(0, 48)',
});

// The popcorn model, worked as a student builds it: $6 a bucket, $30 to spend,
// so 0 to 5 whole buckets.
const popcornKey = (question) => {
  const cost = (x) => 6 * x;
  const { composed } = resolveComposedWorkflow(question);
  const responses = {
    quantities: { independent: 'buckets', dependent: 'cost' },
    equation: 'f(x)=6x',
    continuity: 'discrete',
    domainDiscrete: '{0, 1, 2, 3, 4, 5}',
    rangeDiscrete: '{0, 6, 12, 18, 24, 30}',
  };
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  responses.table = workflowTableArtifact({
    stage: tableStage,
    cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(cost(x))])),
    isComplete: true,
    sourceModel: responses.equation,
    content: composed.content,
  });
  const [[graphStageId, resolution]] = [...resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses })];
  const model = graphWorkspaceModelFor(resolution.question, {});
  responses[graphStageId] = {
    __mathmasterWorkflowArtifact: 'graph',
    isComplete: true,
    analysis: {},
    construction: { placements: Object.fromEntries(model.tasks.map((task) => [task.id, [Number(task.x), cost(Number(task.x))]])), pointsLocked: true },
  };
  return responses;
};

test('the draining tank: a zero typed as the starting amount is told it mixes up the zero and the y-intercept, however it is written', () => {
  for (const [name, review] of REVIEWS) {
    const tank = item(review, 'dol3-review-q08');
    assert.equal(isRight(tank, TANK), true, `${name}: the worked key is right`);
    for (const zeros of ['48', '{48}', '\\{48\\}', '\\left\\{48\\right\\}']) {
      assert.match(said(tank, { ...TANK, zeros }) || '', /^That mixes up the zero and the y-intercept\./, `${name}: ${zeros}`);
    }
    // The right zero in any spelling, and other wrong zeros, hear nothing from it.
    for (const zeros of ['12', '{12}', '\\{12\\}']) {
      assert.equal(isRight(tank, { ...TANK, zeros }), true, `${name}: ${zeros} is right`);
      assert.equal(said(tank, { ...TANK, zeros }), null, `${name}: ${zeros}`);
    }
    for (const zeros of ['{0}', '{12, 48}', '{24}']) assert.equal(said(tank, { ...TANK, zeros }), null, `${name}: ${zeros}`);
  }
});

test('the popcorn model: connecting the points, and leaving out buying none, are each named in their own step', () => {
  for (const [name, review] of REVIEWS) {
    const popcorn = item(review, 'dol3-review-q02');
    const key = popcornKey(popcorn);
    assert.equal(isRight(popcorn, key), true, `${name}: the worked key is right`);
    assert.equal(said(popcorn, key), null, `${name}: a right model hears no slip`);

    assert.match(said(popcorn, { ...key, continuity: 'continuous' }) || '', /part of a bucket/, `${name}: "continuous"`);
    for (const domain of ['{1, 2, 3, 4, 5}', '\\{5,4,3,2,1\\}', '\\{1,2,\\ldots,5\\}', '\\left\\{1,2,3,4,5\\right\\}']) {
      assert.match(said(popcorn, { ...key, domainDiscrete: domain }) || '', /not to buy any popcorn\. Is that number of buckets in your domain\?/, `${name}: ${domain}`);
    }
    for (const range of ['\\{6,12,18,24,30\\}', '{30, 24, 18, 12, 6}']) {
      assert.match(said(popcorn, { ...key, rangeDiscrete: range }) || '', /What would that cost, and is it in your range\?/, `${name}: ${range}`);
    }
    // The right sets in another spelling, and other wrong sets, are not these slips.
    for (const domain of ['\\{0,1,2,3,4,5\\}', '{0, 1, 2, ..., 5}']) assert.equal(said(popcorn, { ...key, domainDiscrete: domain }), null, `${name}: ${domain}`);
    for (const domain of ['{0, 1, 2, 3, 4}', '{1, 2, 3, 4, 5, 6}']) assert.equal(said(popcorn, { ...key, domainDiscrete: domain }), null, `${name}: ${domain}`);
  }
});

test('a slip is read in its own step only, and only where that step was marked wrong', () => {
  const [, review] = REVIEWS[0];
  const popcorn = item(review, 'dol3-review-q02');
  const key = popcornKey(popcorn);
  // The domain's slip typed in the range step is a wrong range, not the domain's slip.
  assert.equal(isRight(popcorn, { ...key, rangeDiscrete: '{1, 2, 3, 4, 5}' }), false);
  assert.equal(said(popcorn, { ...key, rangeDiscrete: '{1, 2, 3, 4, 5}' }), null);
  // A step the grader marked right is never a slip, whatever an entry says.
  const rightAsSlip = {
    ...popcorn,
    misconceptions: [{ field: 'domainDiscrete', match: ['{0, 1, 2, 3, 4, 5}'], message: 'Never said.' }],
  };
  assert.equal(said(rightAsSlip, { ...key, equation: 'f(x)=x+6' }), null, 'another step is wrong; this one is right');
  // An entry naming a step the question does not have is never read.
  const nowhere = { ...popcorn, misconceptions: [{ field: 'nowhere', match: ['{1, 2, 3, 4, 5}'], message: 'Never said.' }] };
  assert.equal(said(nowhere, { ...key, domainDiscrete: '{1, 2, 3, 4, 5}' }), null);
});

test('no sentence said on these misses states an answer', () => {
  for (const [name, review] of REVIEWS) {
    for (const id of ['dol3-review-q02', 'dol3-review-q08']) {
      const question = item(review, id);
      const { composed } = resolveComposedWorkflow(question);
      const keys = Object.values(composed.grading || {}).filter((rule) => typeof rule === 'string');
      assert.ok(keys.length, `${name} ${id}: its steps' keys are read`);
      assert.ok((question.misconceptions || []).length, `${name} ${id}: names its slips`);
      for (const { message } of question.misconceptions) {
        keys.forEach((rule) => assert.ok(!message.includes(rule), `${name} ${id}: "${message}" states ${rule}`));
        // No number at all, but the 0 of "y = 0" that defines a zero.
        assert.deepEqual((message.match(/\d+/g) || []).filter((digits) => digits !== '0'), [], `${name} ${id}: "${message}"`);
      }
    }
  }
});
