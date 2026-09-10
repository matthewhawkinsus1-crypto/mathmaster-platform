import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  repairQuestionForCurrentRuntime,
  RUNTIME_REPAIR_KEYS,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { shouldUseWorkflowFocusMode } from '../../src/platform/workflow/workflowFocusMode.js';
import { resolveWorkflowTaskPrompt } from '../../src/platform/workflow/workflowPresentation.js';

const exactPreProvenanceContinuityDomain = () => ({
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  type: 'relationshipModel',
  prompt: 'A school bus can carry at most 48 students. Classify the relationship and state a reasonable domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  continuity: 'discrete',
  correctDomain: '{0, 1, 2, ..., 48}',
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  workflow: [
    {
      id: 'continuity',
      kind: 'classification',
      prompt: 'Should this relationship be represented as discrete points or as a continuous graph?',
      choices: ['discrete', 'continuous'],
    },
    {
      id: 'graph',
      kind: 'graphConstruction',
      graphMode: 'studentSelected',
      continuityStageId: 'continuity',
      prompt: 'Build the graph of the relationship.',
    },
    {
      id: 'domainDiscrete',
      kind: 'domainInput',
      prompt: 'List the domain for this situation.',
      notation: 'set',
      showWhen: { stage: 'continuity', is: 'discrete' },
    },
    {
      id: 'domainContinuous',
      kind: 'domainInput',
      prompt: 'Describe a reasonable domain for this situation.',
      notation: 'inequality',
      showWhen: { stage: 'continuity', is: 'continuous' },
    },
  ],
  grading: {
    continuity: 'discrete',
    domainDiscrete: '{0, 1, 2, ..., 48}',
  },
});

test('runtime repair version advances when the known pre-provenance repair contract expands', () => {
  assert.equal(ASSIGNMENT_RUNTIME_REPAIR_VERSION, 2);
});

test('exact pre-provenance functionModeling synthetic graph is safely removed', () => {
  const question = exactPreProvenanceContinuityDomain();
  const result = repairQuestionForCurrentRuntime(question);

  assert.equal(result.changed, true);
  assert.equal(result.safeToPersist, true);
  assert.ok(result.repairKeys.includes(RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH));
  assert.equal(result.question.workflow.some((stage) => stage?.kind === 'graphConstruction'), false);
  assert.deepEqual(result.question.grading, question.grading);
  assert.deepEqual(result.question.studentActions, question.studentActions);
});

test('near-match pre-provenance workflow remains fail-closed instead of deleting a possibly authored graph', () => {
  const question = exactPreProvenanceContinuityDomain();
  question.workflow[1] = {
    ...question.workflow[1],
    id: 'teacherGraph',
    prompt: 'Create and justify your own graph.',
  };

  const result = repairQuestionForCurrentRuntime(question);
  assert.equal(result.changed, false);
  assert.equal(result.question.workflow.some((stage) => stage?.kind === 'graphConstruction'), true);
  assert.ok(result.diagnostics.some((entry) => /ambiguous|authored|provenance/i.test(String(entry?.message || ''))));
});

test('the live assignment player prepares the active V5 assignment before reading questions and preserves missing assignment semantics', () => {
  const source = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /prepareAssignmentForRuntime/);
  assert.match(source, /rawActiveAssignmentData\s*=\s*assignments\.find/);
  assert.match(source, /activeRuntimeRepair\s*=\s*useMemo/);
  assert.match(source, /rawActiveAssignmentData\s*\?\s*prepareAssignmentForRuntime\(rawActiveAssignmentData/);
  assert.match(source, /activeAssignmentData\s*=\s*activeRuntimeRepair\?\.assignment\s*\|\|\s*null/);
  assert.match(source, /getStoredAssignmentQuestions\(activeAssignmentData\)/);
});

test('District graph-characteristics workflow is focus-mode and each active stage owns the Your task prompt', () => {
  const question = {
    questionId: '278da14e-695e-4707-a721-63c4a534ec58',
    type: 'functionCharacteristics',
    prompt: 'Analyze the graph of y = 2x - 6.',
    graph: {
      xMin: -2,
      xMax: 7,
      yMin: -10,
      yMax: 10,
      functions: [{ type: 'line', m: 2, b: -6 }],
    },
    recipe: {
      name: 'functionCharacteristics',
      ask: ['xInterceptExists', 'xInterceptValue', 'zeros', 'behavior'],
    },
  };
  const runtime = readComposedQuestion(question);
  assert.equal(runtime.workflow.length, 4);
  assert.equal(shouldUseWorkflowFocusMode(runtime.workflow), true);
  runtime.workflow.forEach((stage, index) => {
    assert.equal(resolveWorkflowTaskPrompt({ workflow: runtime.workflow, activeStageIndex: index }), stage.prompt);
  });
});

test('WorkflowRunner republishes Your task when the question changes even if workflow prompts, responses, and stage index are unchanged', () => {
  const source = readFileSync(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  assert.match(source, /workflowGuidanceSignature/);
  assert.match(source, /questionKey:\s*question\?\.questionId\s*\|\|\s*question\?\.id\s*\|\|\s*question\?\.prompt/);
  assert.match(source, /\[responses,\s*activeStageIndex,\s*focusMode,\s*workflowGuidanceSignature\]/);
});
