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

test('WorkflowRunner uses one active workspace while keeping every stage mounted', async () => {
  const source = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  assert.match(source, /shouldUseWorkflowFocusMode\(workflow\)/);
  assert.match(source, /workflow-focus__navigator/);
  assert.match(source, /workflow-focus__summary/);
  assert.match(source, /workflow-focus__summary-link/);
  assert.match(source, /Return to \$\{item\.label\}/);
  assert.match(source, /workflow-focus__workspace/);
  assert.match(source, /workflow\.map\(\(stage, index\) => renderStage\(stage, index, \{ focused: index === safeActiveIndex \}\)\)/);
  assert.match(source, /workflow-focus__stage-shell--active/);
  assert.match(source, /onProgressChangeRef\.current/);
  assert.match(source, /activeStageIndex/);
});

test('focus navigation does not imply that answered means correct', async () => {
  const source = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  assert.match(source, /, answered'/);
  assert.doesNotMatch(source, /, correct'/);
  assert.match(source, /steps answered/);
});
