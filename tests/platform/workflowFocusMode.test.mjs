import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WORKFLOW_FOCUS_MIN_STAGES,
  shouldUseWorkflowFocusMode,
  buildWorkflowSummaryItems,
} from '../../src/platform/workflow/workflowFocusMode.js';

test('focus mode is automatic for long workflows and leaves short questions alone', () => {
  assert.equal(WORKFLOW_FOCUS_MIN_STAGES, 4);
  assert.equal(shouldUseWorkflowFocusMode([{},{},{}]), false);
  assert.equal(shouldUseWorkflowFocusMode([{},{},{},{}]), true);
  assert.equal(shouldUseWorkflowFocusMode(Array.from({ length: 7 }, () => ({}))), true);
});

test('model-so-far summarizes quantities, equations, tables and classification without an answer key', () => {
  const stages = [
    {
      id: 'quantities', kind: 'quantityRoles', label: 'Identify quantities',
      quantities: [
        { id: 'time', label: 'Time elapsed' },
        { id: 'water', label: 'Water in pool' },
      ],
    },
    { id: 'equation', kind: 'equationInput', label: 'Write equation' },
    { id: 'table', kind: 'tableInput', label: 'Complete table' },
    { id: 'classify', kind: 'classification', label: 'Classify', choices: ['discrete', 'continuous'] },
  ];
  const responses = {
    quantities: { independent: 'time', dependent: 'water' },
    equation: 'f(x)=18x',
    table: {
      __mathmasterWorkflowArtifact: 'table',
      isComplete: true,
      points: [[0, 0], [3, 54], [6, 108]],
    },
    classify: 'continuous',
  };
  const items = buildWorkflowSummaryItems(stages, responses);
  assert.deepEqual(items.map((item) => item.label), [
    'Identify quantities', 'Write equation', 'Complete table', 'Classify',
  ]);
  assert.match(items[0].text, /Input: Time elapsed/);
  assert.match(items[0].text, /Output: Water in pool/);
  assert.equal(items[1].kind, 'math');
  assert.equal(items[1].stageId, 'equation');
  assert.match(items[2].text, /\(3, 54\)/);
  assert.equal(items[3].text, 'continuous');
});

test('model-so-far keeps graph labels after the axis stage', () => {
  const items = buildWorkflowSummaryItems(
    [{ id: 'axes', kind: 'axisSetup', label: 'Label the graph' }],
    {
      axes: {
        __mathmasterWorkflowArtifact: 'axes',
        isComplete: true,
        xLabel: 'Time',
        xUnit: 'minutes',
        yLabel: 'Water',
        yUnit: 'gallons',
        xStep: '1',
        yStep: '12',
      },
    },
  );
  assert.equal(items.length, 1);
  assert.match(items[0].text, /x: Time/);
  assert.match(items[0].text, /y: Water/);
  assert.match(items[0].text, /y by 12/);
});

test('WorkflowRunner keeps one active workspace and does not run hidden delegated tools', async () => {
  const source = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  // The AUTHORED workflow, not the visible one. Stages can be hidden by a
  // `showWhen` branch, and deciding focus mode from the visible list would flip
  // the entire layout mid-question when a student's classification took the
  // count under the threshold.
  assert.match(source, /shouldUseWorkflowFocusMode\(authoredWorkflow\)/);
  assert.doesNotMatch(
    source,
    /shouldUseWorkflowFocusMode\(workflow\)/,
    'focus mode must not be decided from the branch-filtered list',
  );
  assert.match(source, /workflow-focus__navigator/);
  assert.match(source, /workflow-focus__summary/);
  assert.match(source, /workflow-focus__summary-link/);
  assert.match(source, /Return to \$\{item\.label\}/);
  assert.match(source, /workflow-focus__workspace/);
  assert.match(source, /workflow\.map\(\(stage, index\) => renderStage\(stage, index, \{ focused: index === safeActiveIndex \}\)\)/);
  assert.match(source, /workflow-focus__stage-shell--active/);
  assert.match(source, /focusMode && !focused && DELEGATES\[stage\.kind\]/,
    'a future graph/tool step may have a hidden shell, but its live delegated component must not mount');
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /onProgressChangeRef\.current/);
  assert.match(source, /activeStageIndex/);
});

test('focus navigation reserves green checks for submitted correct work', async () => {
  const source = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../src/platform/workflow/WorkflowFocusMode.css', import.meta.url), 'utf8');

  assert.match(source, /buildWorkflowReviewState/);
  assert.match(source, /reviewStatus === 'correct'/);
  assert.match(source, /reviewStatus === 'incorrect'/);
  assert.match(source, /reviewStatus === 'changed'/);
  assert.match(source, /answered, not checked/);
  assert.doesNotMatch(source, /answered \? <span className="workflow-focus__step-check"/);
  assert.match(source, /incorrectReviewStages\.length/);
  assert.match(source, /Red steps are the responses to revise/);
  assert.match(source, /firstIncorrectWorkflowIndex/);
  assert.match(css, /workflow-focus__step--correct/);
  assert.match(css, /workflow-focus__step--incorrect/);
  assert.match(css, /workflow-focus__workspace--incorrect/);
  assert.match(source, /steps answered/);
});

test('QuestionEngine freezes the submitted workflow verdicts instead of grading live edits visually', async () => {
  const source = await readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(source, /workflowSubmissionReview/);
  assert.match(source, /setWorkflowSubmissionReview\(\{/);
  assert.match(source, /parts: \(answerState\.parts \|\| \[\]\)\.map/);
  assert.match(source, /submissionReview=\{showOutcomeFeedback \? workflowSubmissionReview : null\}/);
  assert.match(source, /red steps above are the specific responses that need revision/i);
});


test('persisted draft no-op updates preserve object identity instead of forcing render loops', async () => {
  const source = await readFile(new URL('../../src/useLocalDraftState.js', import.meta.url), 'utf8');
  assert.match(source, /if \(Object\.is\(resolved, current\)\) return current;/);
  assert.ok(
    source.indexOf('Object.is(resolved, current)') < source.indexOf('const saved = cloneValue(resolved)'),
    'identity must be checked before cloning, otherwise an unchanged object becomes a render-triggering new reference',
  );
});
