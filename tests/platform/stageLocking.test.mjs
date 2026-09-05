import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lockedStageIds } from '../../src/platform/workflow/questionWorkflow.js';
import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';

/*
 * Some steps hand over an earlier step's answer just by being answerable.
 * "Mark the x-intercepts" has to draw the correct curve — you cannot look for a
 * feature on a graph that is not there — and that curve shows both the points
 * the student was asked to plot and the family they were asked to name.
 *
 * Focus mode lets a student walk back to any answered step, so without a lock a
 * wrong plot could be quietly corrected from the picture two steps later and
 * the first two marks would stop meaning anything.
 */

const QUADRATIC = {
  recipe: 'functionCharacteristics',
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  functionFamily: 'Quadratic',
  extreme: { kind: 'maximum' },
};

const workflowFor = (question) => expandRecipe(question, { label: 'Q' }).workflow;
const indexOf = (workflow, id) => workflow.findIndex((stage) => stage.id === id);

test('nothing is locked while the student is still building', () => {
  const workflow = workflowFor(QUADRATIC);
  // Only the plot stage is reachable: no curve has been drawn for them yet.
  assert.deepEqual([...lockedStageIds(workflow, 0)], []);
  assert.deepEqual([...lockedStageIds(workflow, indexOf(workflow, 'model'))], []);
});

test('plot and family close the moment the curve becomes reachable', () => {
  const workflow = workflowFor(QUADRATIC);
  const locked = lockedStageIds(workflow, indexOf(workflow, 'xIntercept'));
  assert.deepEqual([...locked].sort(), ['model', 'plot']);
});

test('they stay closed for the rest of the question', () => {
  const workflow = workflowFor(QUADRATIC);
  const locked = lockedStageIds(workflow, workflow.length - 1);
  assert.ok(locked.has('plot'));
  assert.ok(locked.has('model'));
  // Everything else stays open — a student may still revise what they wrote.
  ['xIntercept', 'yIntercept', 'extremeKind', 'extremePoint', 'domain', 'range'].forEach((id) => {
    assert.ok(!locked.has(id), `${id} should stay editable`);
  });
});

test('every stage that draws the answer graph declares what it gives away', () => {
  // The failure this catches: adding a fifth feature stage and forgetting to
  // say what it reveals, which silently reopens the backdoor.
  const workflow = workflowFor(QUADRATIC);
  workflow
    .filter((stage) => stage.kind === 'graphFeatureSelect')
    .forEach((stage) => {
      assert.ok(
        Array.isArray(stage.reveals) && stage.reveals.length,
        `${stage.id} draws the correct curve but declares no \`reveals\``,
      );
      assert.ok(stage.reveals.includes('plot'), `${stage.id} shows the plotted points`);
      assert.ok(stage.reveals.includes('model'), `${stage.id} shows the function family`);
    });
});

test('a stage can only give away one that came before it', () => {
  // Naming itself, or a later stage, is an authoring slip rather than a lock —
  // and locking a stage the student has not reached would strand them.
  const workflow = [
    { id: 'a', kind: 'classification' },
    { id: 'b', kind: 'graphFeatureSelect', reveals: ['a', 'b', 'c'] },
    { id: 'c', kind: 'pointInput' },
  ];
  assert.deepEqual([...lockedStageIds(workflow, 2)], ['a']);
});

test('an unknown stage id in reveals is ignored rather than throwing', () => {
  const workflow = [
    { id: 'a', kind: 'classification' },
    { id: 'b', kind: 'graphFeatureSelect', reveals: ['a', 'somethingRemoved'] },
  ];
  assert.deepEqual([...lockedStageIds(workflow, 1)], ['a']);
});

test('a workflow with no reveals locks nothing', () => {
  const workflow = workflowFor({ ...QUADRATIC, recipe: { name: 'functionCharacteristics', ask: ['plot', 'model', 'domain'] } });
  assert.deepEqual([...lockedStageIds(workflow, workflow.length - 1)], []);
});

test('the runner renders a locked stage read-only instead of disabling it', () => {
  // Several stage components take no `disabled` prop — the plotting workspace,
  // the one that most needs locking, is one of them — so a disabled flag would
  // have been a lock that did not lock. The live component must not be rendered
  // at all for a locked stage.
  const source = readFileSync('src/platform/workflow/WorkflowRunner.jsx', 'utf8');
  const branch = source.slice(source.indexOf('{locked.has(stage.id) ? ('));
  const stageBodyAt = branch.indexOf('<StageBody');
  const elseAt = branch.indexOf(') : (');
  assert.ok(elseAt > 0, 'the locked branch should have an unlocked alternative');
  assert.ok(
    stageBodyAt > elseAt,
    'StageBody must render only in the UNLOCKED branch — a locked stage that still mounts it is editable',
  );
  assert.match(branch.slice(0, elseAt), /workflow-focus__locked-answer/);
});
