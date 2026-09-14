import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  resolveWorkflowTaskPrompt,
  selectPersistentWorkflowGraph,
} from '../../src/platform/workflow/workflowPresentation.js';
import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';

test('workflow presentation publishes the active stage prompt for CURRENT QUESTION', () => {
  const workflow = [
    { id: 'first', kind: 'classification', prompt: 'Does this graph have an x-intercept?' },
    { id: 'second', kind: 'pointInput', prompt: 'Write the x-intercept as an ordered pair.' },
  ];

  assert.equal(
    resolveWorkflowTaskPrompt({ workflow, activeStageIndex: 0 }),
    'Does this graph have an x-intercept?',
  );
  assert.equal(
    resolveWorkflowTaskPrompt({ workflow, activeStageIndex: 1 }),
    'Write the x-intercept as an ordered pair.',
  );
});

test('function-characteristics focus mode keeps the exact authored graph as persistent evidence', () => {
  const authoredGraph = {
    xMin: -2,
    xMax: 7,
    yMin: -10,
    yMax: 10,
    functions: [{ type: 'line', m: 2, b: -6 }],
  };
  const workflow = [
    { id: 'xInterceptExists', kind: 'classification', graph: { functionSpec: { type: 'linear', m: 2, b: -6 } } },
    { id: 'xInterceptValue', kind: 'pointInput' },
    { id: 'zeros', kind: 'valueSet' },
    { id: 'behavior', kind: 'classification', graph: { functionSpec: { type: 'linear', m: 2, b: -6 } } },
  ];

  const selected = selectPersistentWorkflowGraph({
    content: { graph: authoredGraph },
    workflow,
    checkedGraph: null,
  });

  assert.equal(selected, authoredGraph, 'do not reconstruct or replace the authored graph');
});

test('recipe feature graphs can enrich the viewport without drawing answer points', () => {
  const question = {
    type: 'functionCharacteristics',
    recipe: {
      name: 'functionCharacteristics',
      ask: ['xInterceptExists', 'xIntercept', 'yInterceptExists', 'yIntercept', 'extremePoint'],
    },
    functionSpec: { type: 'quadratic', a: 1, h: 1, k: -4 },
    graph: { functions: [{ type: 'quadratic', a: 1, h: 1, k: -4 }] },
    xIntercepts: [[-1, 0], [3, 0]],
    yIntercept: [0, -3],
    extreme: { kind: 'minimum', point: [1, -4] },
  };
  const expanded = expandRecipe(question);
  const selected = selectPersistentWorkflowGraph({
    content: question,
    workflow: expanded.workflow,
    checkedGraph: null,
  });

  assert.ok(Array.isArray(selected.readabilityPoints));
  assert.deepEqual(selected.readabilityPoints, [[-1, 0], [3, 0], [0, -3], [1, -4]]);
  assert.deepEqual(selected.points, [],
    'readability landmarks guide framing only; they are not rendered as answer dots');
});

test('a checked student graph outranks authored reference evidence once the student has created one', () => {
  const authoredGraph = { functions: [{ type: 'line', m: 2, b: -6 }] };
  const checkedGraph = { points: [{ x: 1, y: 2 }], ariaLabel: 'Your checked graph' };

  assert.equal(selectPersistentWorkflowGraph({
    content: { graph: authoredGraph },
    workflow: [{ id: 'graph', kind: 'functionGraph' }, { id: 'domain', kind: 'domainInput' }],
    checkedGraph,
  }), checkedGraph);
});

test('text-only workflows never invent graph evidence', () => {
  const selected = selectPersistentWorkflowGraph({
    content: { prompt: 'Classify, then state the domain.' },
    workflow: [
      { id: 'continuity', kind: 'classification' },
      { id: 'domainDiscrete', kind: 'domainInput' },
    ],
    checkedGraph: null,
  });

  assert.equal(selected, null);
});

test('PR #163 invariant remains protected: continuity/domain functionModeling does not acquire graph', () => {
  const expanded = expandRecipe({
    type: 'relationshipModel',
    continuity: 'discrete',
    correctDomain: '{0, 1, 2}',
    recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  });

  assert.ok(expanded);
  assert.equal(expanded.workflow.some((stage) => stage.id === 'graph' || stage.kind === 'graphConstruction'), false);
});

test('static and interactive graph-analysis surfaces share the assessment-safe viewport contract', async () => {
  const display = await readFile(new URL('../../src/GraphDisplay.jsx', import.meta.url), 'utf8');
  const featureStage = await readFile(new URL('../../src/platform/workflow/GraphFeatureSelectStage.jsx', import.meta.url), 'utf8');

  assert.match(display, /const displayGraph = fitStaticGraphViewport\(graph\)/);
  assert.match(display, /xMinorTicks[\s\S]*yMinorTicks/,
    'static evidence keeps countable minor landmarks when major labels are sparse');
  assert.match(featureStage, /fitStaticGraphViewport\(rawGraph\)/,
    'feature selection uses the same fitted mathematical window');
});

test('WorkflowRunner and QuestionEngine wire the active instruction and one persistent graph into the student shell', async () => {
  const runner = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

  assert.match(runner, /currentStagePrompt/);
  assert.match(runner, /selectPersistentWorkflowGraph/);
  assert.match(runner, /showPersistentGraphReference/);
  assert.match(runner, /sourceGraph=\{stage\.graph \|\| content\?\.graph \|\| null\}/);
  assert.match(runner, /showFigure=\{showFigure\}/);
  assert.match(engine, /currentStagePrompt:\s*currentWorkflowGuidance\?\.currentStagePrompt/);
  assert.match(engine, /workflowGuidanceState\?\.questionKey\s*===\s*workflowGuidanceQuestionKey/);
});
