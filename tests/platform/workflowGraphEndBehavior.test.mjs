import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';
import {
  restrictEvaluatorToDomain,
  workflowEndpointMarkers,
  workflowHorizontalAsymptotes,
} from '../../src/platform/workflow/workflowGraphVisuals.js';

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

test('the screenshot acceptance case clips y=2x-1 and marks the exact restricted endpoints', () => {
  const evaluate = (x) => 2 * x - 1;
  const domain = { min: -3, minClosed: true, max: 4, maxClosed: false };
  const viewWindow = { xMin: -6, xMax: 7, yMin: -10, yMax: 9 };

  const restricted = restrictEvaluatorToDomain(evaluate, domain);
  assert.equal(restricted(-3), -7, 'closed left endpoint belongs to the drawn segment');
  assert.equal(restricted(0), -1);
  assert.equal(restricted(4), Number.NaN, 'open right endpoint is not part of the drawn segment');
  assert.equal(restricted(-3.01), Number.NaN, 'the line must not continue left of its domain');
  assert.equal(restricted(4.01), Number.NaN, 'the line must not continue right of its domain');

  assert.deepEqual(
    workflowEndpointMarkers({ evaluate, domain, viewWindow }).map(({ x, y, marker }) => ({ x, y, marker })),
    [
      { x: -3, y: -7, marker: 'closed' },
      { x: 4, y: 7, marker: 'open' },
    ],
  );
});

test('unrestricted curves receive continuation arrows and exponentials receive their asymptote', () => {
  const arrows = workflowEndpointMarkers({
    evaluate: (x) => 2 * x + 1,
    viewWindow: { xMin: -4, xMax: 4, yMin: -10, yMax: 10 },
  });
  assert.equal(arrows.filter((item) => item.marker === 'arrow').length, 2);
  assert.deepEqual(
    workflowHorizontalAsymptotes({ type: 'exponential', a: 5, base: 3, k: -4 }),
    [-4],
  );
});

test('read-only workflow figures delegate structured functions to GraphDisplay without conditional hooks', async () => {
  const source = await read('src/platform/workflow/WorkflowRunner.jsx');
  const start = source.indexOf('function StageFigure');
  const end = source.indexOf('function ChoiceStage', start);
  const stageFigure = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'StageFigure source should be found');
  assert.match(stageFigure, /staticGraphSpec\(spec\.functionSpec\)/);
  assert.match(stageFigure, /<GraphDisplay/);
  assert.ok(
    stageFigure.indexOf('const functions = useMemo') < stageFigure.indexOf('if (structuredFunction)'),
    'StageFigure must call its hooks before a structured-function early return',
  );
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
