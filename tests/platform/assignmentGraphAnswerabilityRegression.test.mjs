import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeStage } from '../../src/platform/workflow/workflowGrading.js';
import { workflowGraphDomainRestriction } from '../../src/platform/workflow/workflowGraphVisuals.js';
import { selectPersistentWorkflowGraph } from '../../src/platform/workflow/workflowPresentation.js';

test('continuous branch domain drives finite graph boundaries instead of continuation arrows', () => {
  const graphStage = {
    id: 'graph',
    kind: 'functionGraph',
    continuityStageId: 'continuity',
  };
  const workflow = [
    { id: 'continuity', kind: 'classification' },
    graphStage,
    {
      id: 'domain-continuous',
      kind: 'domainInput',
      notation: 'inequality',
      showWhen: { stage: 'continuity', is: 'continuous' },
    },
  ];
  const grading = {
    'domain-continuous': '0 ≤ t ≤ 6',
  };

  assert.deepEqual(
    workflowGraphDomainRestriction({ graphStage, workflow, grading }),
    { min: 0, max: 6, minInclusive: true, maxInclusive: true },
  );
});

test('discrete domain sets are not misread as continuous graph restrictions', () => {
  const graphStage = { id: 'graph', kind: 'functionGraph' };
  const workflow = [
    graphStage,
    { id: 'domain-discrete', kind: 'domainInput', notation: 'set' },
  ];
  const grading = {
    'domain-discrete': '{0, 2, 4, 6}',
  };

  assert.equal(workflowGraphDomainRestriction({ graphStage, workflow, grading }), null);
});

test('All Real Numbers quick-answer text is accepted by inequality domain grading', () => {
  const result = gradeStage({
    stage: {
      id: 'domain',
      kind: 'domainInput',
      notation: 'inequality',
      prompt: 'State the domain.',
    },
    rule: ['-inf<x<inf', 'allrealnumbers'],
    responses: {
      domain: '\\text{All Real Numbers}',
    },
  });

  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.credit, 1);
});

test('exponential function-characteristics graph is available before the first answer choice', () => {
  const question = {
    type: 'functionCharacteristics',
    questionId: 'review-q6-exponential',
    functionSpec: {
      a: 2,
      base: 2,
      k: 0,
      type: 'exponential',
    },
    correctDomain: ['-inf<x<inf', 'allrealnumbers'],
    correctRange: ['y>0'],
    asymptote: 'y = 0',
    behavior: 'Exponential growth',
    xIntercepts: 'none',
    yIntercept: [0, 2],
    graph: {
      functions: [
        {
          type: 'exponential',
          a: 2,
          base: 2,
          k: 0,
        },
      ],
      showAsymptotes: true,
    },
    recipe: {
      name: 'functionCharacteristics',
      ask: [
        'xInterceptExists',
        'yInterceptExists',
        'yIntercept',
        'yInterceptValue',
        'asymptote',
        'behavior',
        'domain',
        'range',
      ],
    },
  };

  const composed = readComposedQuestion(question);
  assert.equal(composed.workflow[0].id, 'xInterceptExists');

  const graph = selectPersistentWorkflowGraph({
    content: composed.content,
    workflow: composed.workflow,
    checkedGraph: null,
  });

  assert.ok(graph, 'the graph must exist before the student answers xInterceptExists');
  assert.equal(graph.showAsymptotes, true);
  assert.equal(Array.isArray(graph.functions), true);
  assert.equal(graph.functions.length, 1);
});

test('asymptotes use a high-contrast halo and opaque foreground when they overlap an axis', () => {
  const source = readFileSync('src/GraphDisplay.jsx', 'utf8');
  assert.match(source, /stroke="#ffffff"[\\s\\S]{0,180}strokeWidth="7"/);
  assert.match(source, /stroke="#a020f0"[\\s\\S]{0,180}strokeWidth="3\.5"/);
  assert.match(source, /strokeDasharray="9 6"[\\s\\S]{0,100}opacity="1"/);
});
