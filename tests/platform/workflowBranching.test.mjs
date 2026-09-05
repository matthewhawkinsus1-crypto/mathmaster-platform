import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { activeStageIds, activeStages, summarizeWorkflowProgress, validateWorkflow } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';

/*
 * A step may depend on what the student CHOSE, never on whether they were right.
 *
 * The case this exists for: "is this situation discrete or continuous?" followed
 * by domain and range. If the platform showed a braces-and-set input to everyone,
 * it would announce the answer before the student finished thinking. If it showed
 * the set input only when the student was CORRECT, it would announce it louder.
 * Branching on what they said keeps the question honest — a student who answers
 * continuous gets the inequality path and can still be marked wrong.
 */

const CONTINUITY = [
  { id: 'continuity', kind: 'classification', choices: ['discrete', 'continuous', 'neither'] },
  { id: 'setDomain', kind: 'domainInput', notation: 'set', showWhen: { stage: 'continuity', is: 'discrete' } },
  { id: 'setRange', kind: 'rangeInput', notation: 'set', showWhen: { stage: 'continuity', is: 'discrete' } },
  { id: 'ineqDomain', kind: 'domainInput', notation: 'inequality', showWhen: { stage: 'continuity', is: 'continuous' } },
  { id: 'ineqRange', kind: 'rangeInput', notation: 'inequality', showWhen: { stage: 'continuity', is: 'continuous' } },
];

const normalized = (workflow) => validateWorkflow(workflow, { label: 'Q' }).stages;
const idsFor = (responses) => [...activeStageIds(normalized(CONTINUITY), responses)];

test('before the classification is made, neither branch is on screen', () => {
  // Showing both would leak the shape of the answer just as surely as showing
  // the right one.
  assert.deepEqual(idsFor({}), ['continuity']);
  assert.deepEqual(idsFor({ continuity: '' }), ['continuity']);
});

test('an unanswered step opens nothing, even when a choice is spelled like a blank', () => {
  // For ordinary choices an unanswered controller fails the value comparison on
  // its own. This is the case where that is not enough: an author who offers a
  // choice literally named "null" would, without the explicit guard, show that
  // branch to every student who had not answered yet — revealing a step before
  // they had made the decision that leads to it.
  const workflow = [
    { id: 'c', kind: 'classification', choices: ['null', 'real'] },
    { id: 'leak', kind: 'domainInput', showWhen: { stage: 'c', is: 'null' } },
  ];
  const stages = validateWorkflow(workflow, { label: 'Q' }).stages;
  assert.deepEqual([...activeStageIds(stages, {})], ['c'], 'nothing opens before an answer');
  assert.deepEqual([...activeStageIds(stages, { c: 'null' })], ['c', 'leak'], 'and it opens when actually chosen');
});

test('the branch follows what the student picked', () => {
  assert.deepEqual(idsFor({ continuity: 'discrete' }), ['continuity', 'setDomain', 'setRange']);
  assert.deepEqual(idsFor({ continuity: 'continuous' }), ['continuity', 'ineqDomain', 'ineqRange']);
});

test('a path the author left open ends the question there', () => {
  // "Neither" is answerable and submittable without being forced into a
  // response format that would reveal the intended classification.
  assert.deepEqual(idsFor({ continuity: 'neither' }), ['continuity']);
});

test('choosing wrongly still opens a path, and can still be marked wrong', () => {
  // THE SAFETY PROPERTY. The runtime never consults the answer key to decide
  // what to show; a student who misclassifies gets a full, answerable branch.
  const stages = normalized(CONTINUITY);
  const grading = { continuity: 'discrete', setDomain: '{0,1,2}', ineqDomain: '0 <= x <= 2' };
  const wrongPath = gradeWorkflow({
    stages,
    responses: { continuity: 'continuous', ineqDomain: '0 <= x <= 2', ineqRange: 'anything' },
    grading,
  });
  assert.equal(wrongPath.isComplete, true, 'they could finish');
  assert.equal(wrongPath.isCorrect, false, 'and they were still marked wrong on the classification');
});

test('a branch the student never saw is not an unanswered question', () => {
  const stages = normalized(CONTINUITY);
  const responses = { continuity: 'discrete', setDomain: '{0,1,2}', setRange: '{0,1}' };
  const progress = summarizeWorkflowProgress(stages, responses);
  assert.equal(progress.total, 3, 'only the steps this student was asked');
  assert.equal(progress.answered, 3);
  const graded = gradeWorkflow({ stages, responses, grading: { continuity: 'discrete' } });
  assert.equal(graded.isComplete, true);
});

test('an answer left behind by switching branches is ignored', () => {
  // Old data from an abandoned path must not be graded — it answers a question
  // this student is no longer being asked.
  const stages = normalized(CONTINUITY);
  const graded = gradeWorkflow({
    stages,
    responses: {
      continuity: 'continuous',
      setDomain: 'STALE_RUBBISH',
      ineqDomain: '0 <= x <= 2',
      ineqRange: '0 <= y <= 4',
    },
    grading: {
      continuity: 'continuous',
      setDomain: '{0,1,2}',
      ineqDomain: '0 <= x <= 2',
      ineqRange: '0 <= y <= 4',
    },
  });
  assert.equal(graded.isCorrect, true, 'the stale set answer must not count against them');
  assert.ok(!graded.questionDetails.includes('STALE_RUBBISH'), 'and must not be reported');
});

test('a branch under a hidden branch stays hidden', () => {
  const chained = [
    { id: 'a', kind: 'classification', choices: ['yes', 'no'] },
    { id: 'b', kind: 'classification', choices: ['x', 'y'], showWhen: { stage: 'a', is: 'yes' } },
    { id: 'c', kind: 'domainInput', showWhen: { stage: 'b', is: 'x' } },
  ];
  const stages = normalized(chained);
  // `b` was never shown, so even a stale answer on it cannot unlock `c`.
  assert.deepEqual([...activeStageIds(stages, { a: 'no', b: 'x' })], ['a']);
  assert.deepEqual([...activeStageIds(stages, { a: 'yes', b: 'x' })], ['a', 'b', 'c']);
});

test('several values can open the same branch', () => {
  const workflow = [
    { id: 'k', kind: 'classification', choices: ['max', 'min', 'neither'] },
    { id: 'where', kind: 'graphFeatureSelect', showWhen: { stage: 'k', is: ['max', 'min'] } },
  ];
  const stages = normalized(workflow);
  assert.deepEqual([...activeStageIds(stages, { k: 'max' })], ['k', 'where']);
  assert.deepEqual([...activeStageIds(stages, { k: 'min' })], ['k', 'where']);
  assert.deepEqual([...activeStageIds(stages, { k: 'neither' })], ['k']);
});

/* ---------- everything that can be authored wrong is refused ---------- */

const errorsFor = (workflow) => validateWorkflow(workflow, { label: 'Q' }).errors;

test('a branch on a step that does not exist is refused', () => {
  const errors = errorsFor([
    { id: 'c', kind: 'classification', choices: ['a'] },
    { id: 'd', kind: 'domainInput', showWhen: { stage: 'nope', is: 'a' } },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not a stage in this question/);
});

test('a branch on a LATER step is refused', () => {
  // It would hide the stage behind an answer the student cannot reach without
  // first passing the stage — an unfinishable question.
  const errors = errorsFor([
    { id: 'd', kind: 'domainInput', showWhen: { stage: 'c', is: 'a' } },
    { id: 'c', kind: 'classification', choices: ['a'] },
  ]);
  assert.match(errors[0], /comes later in the workflow/);
});

test('a branch on something that is not a choice is refused', () => {
  const errors = errorsFor([
    { id: 'e', kind: 'equationInput' },
    { id: 'd', kind: 'domainInput', showWhen: { stage: 'e', is: 'x' } },
  ]);
  assert.match(errors[0], /can only follow a step where the student picks/);
});

test('a branch waiting on a value the step never offers is refused', () => {
  // It would be a step nobody is ever asked, silently worth nothing.
  const errors = errorsFor([
    { id: 'c', kind: 'classification', choices: ['discrete', 'continuous'] },
    { id: 'd', kind: 'domainInput', showWhen: { stage: 'c', is: 'sometimes' } },
  ]);
  assert.match(errors[0], /only offers: discrete, continuous/);
});

test('a branch with no value is refused', () => {
  const errors = errorsFor([
    { id: 'c', kind: 'classification', choices: ['a'] },
    { id: 'd', kind: 'domainInput', showWhen: { stage: 'c' } },
  ]);
  assert.match(errors[0], /no value in `is`/);
});

test('questions without branching are completely unaffected', () => {
  // Backward compatibility: every existing V5 question has no `showWhen`, and
  // must behave exactly as it did.
  const plain = normalized([
    { id: 'plot', kind: 'coordinatePlot' },
    { id: 'domain', kind: 'domainInput' },
  ]);
  assert.deepEqual(activeStages(plain, {}).map((s) => s.id), ['plot', 'domain']);
  assert.equal(summarizeWorkflowProgress(plain, {}).total, 2);
});

test('the runtime never consults the answer key to decide what to show', () => {
  // Structural guarantee, asserted at the source: activeStageIds takes the
  // workflow and the student's responses. If `grading` ever reaches it, a
  // branch could open only for a correct answer, which would announce the
  // answer to everyone who saw it.
  const source = readFileSync('src/platform/workflow/questionWorkflow.js', 'utf8');
  const start = source.indexOf('export const activeStageIds');
  const body = source.slice(start, source.indexOf('\nexport const activeStages'));
  assert.ok(start > 0, 'activeStageIds must exist');
  assert.ok(!/grading|answerKey|expected|correct/.test(body), 'the branch decision must not read grading state');
});
