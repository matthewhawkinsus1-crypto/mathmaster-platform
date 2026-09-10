import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { repairQuestionForCurrentRuntime } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const tankQuestionWithLegacySyntheticGraph = () => ({
  questionId: '8b5454b5-0ea5-46d5-b3d9-851454c118a6',
  type: 'relationshipModel',
  prompt: 'A tank fills steadily for 10 minutes, going from 0 gallons to 60 gallons.',
  studentActions: ['classifyContinuity', 'stateDomain', 'stateRange'],
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain', 'range'] },
  continuity: 'continuous',
  correctDomain: '0 <= x <= 10',
  correctRange: '0 <= y <= 60',
  workflow: [
    {
      id: 'continuity',
      kind: 'classification',
      prompt: 'Should this relationship be represented as discrete points or as a continuous graph?',
      choices: ['discrete', 'continuous'],
      // Historical platform-generated fallback. The source assignment never
      // authored a graph for this question, so this identity graph must not be
      // allowed to become student evidence merely because stale runtime state
      // still contains it.
      graph: {
        xMin: -5,
        xMax: 5,
        yMin: -6,
        yMax: 6,
        functionSpec: { type: 'linear', m: 1, b: 0 },
      },
    },
    {
      id: 'domainDiscrete',
      kind: 'domainInput',
      notation: 'set',
      showWhen: { stage: 'continuity', is: 'discrete' },
    },
    {
      id: 'domainContinuous',
      kind: 'domainInput',
      notation: 'inequality',
      showWhen: { stage: 'continuity', is: 'continuous' },
    },
    {
      id: 'rangeDiscrete',
      kind: 'rangeInput',
      notation: 'set',
      showWhen: { stage: 'continuity', is: 'discrete' },
    },
    {
      id: 'rangeContinuous',
      kind: 'rangeInput',
      notation: 'inequality',
      showWhen: { stage: 'continuity', is: 'continuous' },
    },
  ],
  grading: {
    continuity: 'continuous',
    domainContinuous: '0 <= x <= 10',
    rangeContinuous: '0 <= y <= 60',
  },
});

test('graphless functionModeling removes a known stale identity graph from a classification stage at runtime', () => {
  const source = tankQuestionWithLegacySyntheticGraph();
  const repaired = repairQuestionForCurrentRuntime(source, { source: 'regression' });

  assert.equal(repaired.changed, true, 'the student runtime should receive a repaired question immediately');
  assert.equal(repaired.question.workflow[0].graph, undefined,
    'a continuity/domain/range task must not display a synthetic y=x graph it never asked for');
  assert.equal(repaired.safeToPersist, false,
    'unstamped legacy state is repaired in memory but is not automatically rewritten as authored data');
});

test('explicitly authored identity graph is preserved even when it resembles the historical fallback', () => {
  const source = tankQuestionWithLegacySyntheticGraph();
  source.workflowProvenance = { source: 'authored' };

  const repaired = repairQuestionForCurrentRuntime(source, { source: 'regression' });

  assert.equal(repaired.changed, false);
  assert.deepEqual(repaired.question.workflow[0].graph, source.workflow[0].graph);
});

test('graph feature marking renders fixed authored points before student marks and translates drag indexes', async () => {
  const source = await readFile(
    new URL('../../src/platform/workflow/GraphFeatureSelectStage.jsx', import.meta.url),
    'utf8',
  );

  const curveIndex = source.indexOf('...curvePoints.map');
  const endpointIndex = source.indexOf('...endpointMarkers');
  const marksIndex = source.indexOf('...marks');

  assert.ok(curveIndex >= 0 && endpointIndex >= 0 && marksIndex >= 0);
  assert.ok(curveIndex < marksIndex && endpointIndex < marksIndex,
    'SVG draws later points on top, so the student mark must be last');
  assert.match(source, /selectionIndex\s*=\s*index\s*-\s*fixedPointCount/,
    'CoordinatePlane returns the combined points-array index; translate it back to the student selection index');
});
