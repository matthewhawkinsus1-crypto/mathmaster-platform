import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  readComposedQuestion,
  stageControlsLaterGraphConstruction,
  validateWorkflow,
} from '../../src/platform/workflow/questionWorkflow.js';
import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  RUNTIME_REPAIR_KEYS,
  repairQuestionForCurrentRuntime,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const syntheticIdentityGraph = () => ({
  xMin: -5,
  xMax: 5,
  yMin: -6,
  yMax: 6,
  functionSpec: { type: 'linear', m: 1, b: 0 },
});

const continuityThenStudentGraph = (continuityGraph = undefined) => ([
  {
    id: 'continuity',
    kind: 'classification',
    prompt: 'Is this discrete or continuous?',
    choices: ['discrete', 'continuous'],
    ...(continuityGraph ? { graph: continuityGraph } : {}),
  },
  {
    id: 'graph',
    kind: 'functionGraph',
    graphMode: 'studentSelected',
    continuityStageId: 'continuity',
    source: { fromStage: 'table' },
  },
]);

test('V5 compiler does not turn an empty function object into y = x', () => {
  const input = {
    schemaVersion: 5,
    assignment: { title: 'No invented graph', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.3C',
        prompt: 'Construct the graph.',
        studentActions: ['constructGraph'],
        functionSpec: {},
      }],
    }],
  };

  assert.throws(
    () => compileAuthoringIntentV5(input),
    /no function|no function, graph|enough mathematical intent|will not invent y = x/i,
  );
});

test('explicit y = x remains a valid authored function', () => {
  const input = {
    schemaVersion: 5,
    assignment: { title: 'Real identity function', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.3C',
        prompt: 'Graph y = x.',
        studentActions: ['constructGraph'],
        function: { family: 'linear', m: 1, b: 0 },
      }],
    }],
  };

  const compiled = compileAuthoringIntentV5(input);
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'functionGraph');
  assert.deepEqual(question.functionSpec, { type: 'linear', m: 1, b: 0 });
});

test('model workflow asks continuity before graph without attaching a static answer graph', () => {
  const input = {
    schemaVersion: 5,
    assignment: { title: 'Fountain model', courseId: 'algebra1' },
    sections: [{
      role: 'review',
      questions: [{
        standard: 'A.2A',
        prompt: 'A fountain starts with 10 gallons and adds 5 gallons each minute for 6 minutes.',
        studentActions: [
          'identifyQuantities',
          'writeEquation',
          'completeTable',
          'classifyContinuity',
          'constructGraph',
          'stateDomain',
          'stateRange',
        ],
        quantities: [
          { id: 'time', label: 'Time (minutes)' },
          { id: 'amount', label: 'Water (gallons)' },
        ],
        correctIndependentId: 'time',
        correctDependentId: 'amount',
        answerModel: {
          equation: 'A(t)=5t+10',
          tableXValues: [0, 2, 4, 6],
          continuity: 'continuous',
          domain: '0 <= t <= 6',
          range: '10 <= A <= 40',
        },
      }],
    }],
  };

  const compiled = compileAuthoringIntentV5(input);
  const question = compiled.package.sections[0].questions[0];
  const { workflow } = readComposedQuestion(question);
  const continuity = workflow.find((stage) => stage.id === 'continuity');
  const graph = workflow.find((stage) => stage.id === 'graph');

  assert.ok(continuity, 'continuity stage exists');
  assert.equal(continuity.graph, undefined, 'classification owns no graph');
  assert.ok(graph, 'student graph stage exists');
  assert.equal(graph.continuityStageId, 'continuity');
  assert.equal(stageControlsLaterGraphConstruction(workflow, 'continuity'), true);
});

test('Preflight refuses a static graph on a classification that controls later graph construction', () => {
  const workflow = [
    { id: 'table', kind: 'tableInput' },
    ...continuityThenStudentGraph(syntheticIdentityGraph()),
  ];
  const result = validateWorkflow(workflow, { label: 'Q2' });
  assert.ok(
    result.errors.some((message) => /includes a graph before the student builds the graph it controls/i.test(message)),
    result.errors.join('\n'),
  );
});

test('runtime self-healing removes the known synthetic y=x graph from an already-saved explicit workflow', () => {
  const question = {
    questionId: 'saved-q2',
    type: 'functionGraph',
    workflowProvenance: { source: 'authored' },
    workflow: [
      { id: 'table', kind: 'tableInput' },
      ...continuityThenStudentGraph(syntheticIdentityGraph()),
    ],
    grading: { continuity: 'continuous' },
  };

  const result = repairQuestionForCurrentRuntime(question);
  assert.equal(result.changed, true);
  assert.ok(result.repairKeys.includes(RUNTIME_REPAIR_KEYS.NO_PRECONSTRUCTION_SYNTHETIC_GRAPH));
  assert.equal(result.question.workflow.find((stage) => stage.id === 'continuity').graph, undefined);
  assert.equal(result.question.workflow.find((stage) => stage.id === 'graph').kind, 'functionGraph');
  assert.equal(result.safeToPersist, false, 'student runtime repair is conservative about authored persistence');
  assert.ok(ASSIGNMENT_RUNTIME_REPAIR_VERSION >= 5);
});

test('readComposedQuestion applies the same self-healing before anything renders', () => {
  const question = {
    questionId: 'saved-q2-runtime',
    type: 'functionGraph',
    workflow: [
      { id: 'table', kind: 'tableInput' },
      ...continuityThenStudentGraph(syntheticIdentityGraph()),
    ],
  };
  const read = readComposedQuestion(question);
  assert.equal(read.workflow.find((stage) => stage.id === 'continuity').graph, undefined);
});

test('a real authored y=x evidence graph is preserved when it is actually the graph being analyzed', () => {
  const question = {
    questionId: 'real-y-equals-x',
    type: 'graphAnalysis',
    workflow: [{
      id: 'continuity',
      kind: 'classification',
      choices: ['continuous', 'discrete'],
      graph: syntheticIdentityGraph(),
    }],
  };
  const result = repairQuestionForCurrentRuntime(question);
  assert.equal(result.changed, false);
  assert.deepEqual(result.question.workflow[0].graph, syntheticIdentityGraph());
});

test('WorkflowRunner refuses to normalize an empty graph function spec into a drawable function', () => {
  const source = readFileSync('src/platform/workflow/WorkflowRunner.jsx', 'utf8');
  const start = source.indexOf('export const staticGraphSpec');
  const end = source.indexOf('\n};', start) + 3;
  const body = source.slice(start, end);
  assert.ok(start >= 0, 'staticGraphSpec must exist');
  assert.match(body, /if \(!type\) return null/);
  assert.doesNotMatch(body, /return spec\.type === ['"]expression['"] \? null : spec/);
});

test('focus-mode rendering suppresses figures on a preconstruction classification controller', () => {
  const source = readFileSync('src/platform/workflow/WorkflowRunner.jsx', 'utf8');
  assert.match(
    source,
    /!stageControlsLaterGraphConstruction\(workflow, stage\.id\)/,
    'the renderer must suppress the graph before the student chooses continuity',
  );
});
