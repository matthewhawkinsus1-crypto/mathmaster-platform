// A MULTI-STEP QUESTION NAMES ITS STEPS AND DOES NOT MOVE ITS FINISH LINE.
//
// Walkthrough 2026-10-22 (Algebra I DOL #3 Review PR 2 and PR 8, Algebra II
// Honors DOL #2 CW 1 and PR 1): Function Characteristics steps read
// "1. Classify, 2. Classify, 3. Classify", and the count read "1 of 2" until a
// yes/no step revealed its follow-ups, then "… of 7". The step after a hidden
// follow-up stays hidden (it would give the answer's shape away); only the
// count looks ahead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { activeStageIds, projectedStageCount, readComposedQuestion } from '../../functions/shared/toolMath/workflow/questionWorkflow.mjs';

const characteristics = (ask) => readComposedQuestion({
  type: 'functionCharacteristics', recipe: { name: 'functionCharacteristics', ask }, graph: {}, functionSpec: { type: 'linear', m: -4, b: 48 },
}).workflow;

test('the count is the most steps the question can still show, from the first screen', () => {
  const workflow = characteristics(['xInterceptExists', 'xInterceptValue', 'yInterceptExists', 'yInterceptValue', 'domain']);
  assert.equal(activeStageIds(workflow, {}).size, 3, 'the follow-ups are still hidden');
  assert.equal(projectedStageCount(workflow, {}), 5);
  assert.equal(projectedStageCount(workflow, { xInterceptExists: 'No' }), 4, 'a "No" closes its follow-up, and the count says so');
  assert.equal(projectedStageCount(workflow, { xInterceptExists: 'Yes', yInterceptExists: 'Yes' }), 5);
  assert.equal(projectedStageCount([], {}), 0);
});

test('every Function Characteristics step has its own short name', () => {
  const workflow = characteristics(['xInterceptExists', 'xIntercept', 'xInterceptValue', 'zeros', 'yInterceptExists', 'yIntercept', 'yInterceptValue', 'domain', 'range']);
  const names = workflow.map((stage) => stage.stepLabel);
  assert.ok(names.every(Boolean), `unnamed: ${workflow.filter((stage) => !stage.stepLabel).map((stage) => stage.id)}`);
  assert.equal(new Set(names).size, names.length, `repeated: ${names}`);
});

test('the runner shows the step name everywhere and counts ahead', async () => {
  const runner = await readFile('src/platform/workflow/WorkflowRunner.jsx', 'utf8');
  assert.match(runner, /const stepName = \(stage\) => stage\?\.stepLabel \|\| getStage\(stage\?\.kind\)\?\.label/);
  assert.doesNotMatch(runner, /\{definition\?\.label \|\| stage\.kind\}/, 'no heading or tab falls back to the kind alone');
  assert.match(runner, /const stepsToShow = Math\.max\(workflow\.length, projectedStageCount\(authoredWorkflow, responses\)\);/);
  assert.match(runner, /\{safeActiveIndex \+ 1\} of \{stepsToShow\}/);
  // The tab strip keeps the current tab in view, moving only itself.
  assert.match(runner, /ref=\{navigatorRef\}/);
  assert.doesNotMatch(runner.slice(runner.indexOf('const navigatorRef'), runner.indexOf('}, [activeStageIndex, workflow.length]);')), /scrollIntoView/);
});
