import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';

const read = async (relative) => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');

const restrictedQuestion = {
  questionId: 'restricted-line-regression',
  type: 'functionCharacteristics',
  prompt: 'Determine the domain and range from the restricted graph.',
  recipe: { name: 'functionCharacteristics', ask: ['domain', 'range'] },
  graph: { xMin: -6, xMax: 7, yMin: -10, yMax: 9 },
  functionSpec: {
    type: 'linear',
    m: 2,
    b: -1,
    domain: { min: -3, minClosed: true, max: 4, maxClosed: false },
  },
  correctEquation: '2*x - 1',
  correctDomain: '-3 <= x < 4',
  correctRange: '-7 <= y < 7',
};

test('function-characteristics stages preserve the authored structured function spec', () => {
  const expanded = expandRecipe(restrictedQuestion, { label: 'Restricted line' });
  const domain = expanded.workflow.find((stage) => stage.id === 'domain');
  const range = expanded.workflow.find((stage) => stage.id === 'range');

  assert.deepEqual(domain?.graph?.functionSpec, restrictedQuestion.functionSpec);
  assert.deepEqual(range?.graph?.functionSpec, restrictedQuestion.functionSpec);
});

test('read-only workflow figures delegate structured functions to GraphDisplay', async () => {
  const source = await read('src/platform/workflow/WorkflowRunner.jsx');
  const start = source.indexOf('function StageFigure');
  const end = source.indexOf('function ChoiceStage', start);
  const stageFigure = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'StageFigure source should be found');
  assert.match(stageFigure, /staticGraphSpec\(spec\.functionSpec\)/);
  assert.match(stageFigure, /<GraphDisplay/);
});

test('interactive workflow graph stages honor restrictions, endpoint markers, and asymptotes', async () => {
  const feature = await read('src/platform/workflow/GraphFeatureSelectStage.jsx');
  assert.match(feature, /graph\.functionSpec/);
  assert.match(feature, /workflowEndpointMarkers/);
  assert.match(feature, /workflowHorizontalAsymptotes/);
  assert.match(feature, /restrictEvaluatorToDomain/);
});

test('figure-match and choice-preview graphs receive continuation arrows', async () => {
  const figureMatch = await read('src/platform/workflow/FigureMatchStage.jsx');
  const runner = await read('src/platform/workflow/WorkflowRunner.jsx');
  assert.match(figureMatch, /workflowEndpointMarkers/);

  const previewStart = runner.indexOf('function ChoicePreviewGraph');
  const previewEnd = runner.indexOf('function StageFigure', previewStart);
  const preview = runner.slice(previewStart, previewEnd);
  assert.match(preview, /workflowEndpointMarkers/);
});

test('CoordinatePlane renders open, closed, and arrow endpoint marker shapes', async () => {
  const plane = await read('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /point\?\.marker === 'open'/);
  assert.match(plane, /point\?\.marker === 'closed'/);
  assert.match(plane, /point\?\.marker === 'arrow'/);
});
