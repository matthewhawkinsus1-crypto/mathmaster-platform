import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getStoredAssignmentQuestions,
  getRuntimeAssignmentQuestions,
  prepareAssignmentForRuntime,
} from '../../src/platform/contract/storedAssignmentV5.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';

const staleGeneratedQuestion = () => ({
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  type: 'relationshipModel',
  prompt: 'A school bus can carry at most 48 students. Classify the relationship and state a reasonable domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  correctDomain: '{0, 1, 2, ..., 48}',
  continuity: 'discrete',
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  workflowProvenance: {
    source: 'recipeExpansion',
    recipeName: 'functionModeling',
    generatorVersion: 0,
  },
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

const assignmentOf = (question) => ({
  schemaVersion: 5,
  id: 'assignment-live-fixture',
  title: 'Runtime preparation fixture',
  courseId: 'algebra1',
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [question],
  }],
});

test('literal stored reads remain untouched while runtime reads apply compatibility repair', () => {
  const assignment = assignmentOf(staleGeneratedQuestion());
  const before = structuredClone(assignment);

  const stored = getStoredAssignmentQuestions(assignment);
  const prepared = prepareAssignmentForRuntime(assignment);
  const runtime = getRuntimeAssignmentQuestions(assignment);

  assert.equal(stored[0].workflow.some((stage) => stage.kind === 'graphConstruction'), true);
  assert.equal(runtime[0].workflow.some((stage) => stage.kind === 'graphConstruction'), false);
  assert.equal(prepared.changed, true);
  assert.equal(prepared.assignment.sections[0].questions[0].questionId, stored[0].questionId);
  assert.deepEqual(assignment, before, 'runtime preparation must not mutate the saved assignment');
});

test('shared composed-question reader self-heals a proven stale generated workflow before explicit workflow precedence', () => {
  const question = staleGeneratedQuestion();
  const before = structuredClone(question);
  const composed = readComposedQuestion(question);

  assert.equal(composed.composed, true);
  assert.equal(composed.workflow.some((stage) => stage.kind === 'graphConstruction'), false);
  assert.ok(composed.workflow.some((stage) => stage.id === 'continuity'));
  assert.ok(composed.workflow.some((stage) => stage.id === 'domainDiscrete'));
  assert.deepEqual(question, before, 'composed runtime reads must be pure');
});

test('authored workflow remains explicit and is not rewritten by the shared runtime reader', () => {
  const question = staleGeneratedQuestion();
  question.workflowProvenance = { source: 'authored' };
  const composed = readComposedQuestion(question);
  assert.equal(composed.workflow.some((stage) => stage.kind === 'graphConstruction'), true);
});

test('student QuestionEngine routes composed questions through the shared self-healing reader', () => {
  const source = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(source, /readComposedQuestion\(processedQuestion\)\.composed/);
  assert.match(source, /<WorkflowRunner/);
});

test('preflight and teacher worksheet consumers use the prepared runtime assignment', () => {
  const preflightSource = readFileSync(
    new URL('../../src/platform/preflight/assignmentV5PreflightModel.js', import.meta.url),
    'utf8',
  );
  const worksheetSource = readFileSync(
    new URL('../../src/platform/resources/teacherAssignmentWorksheetExport.js', import.meta.url),
    'utf8',
  );

  assert.match(preflightSource, /prepareAssignmentForRuntime/);
  assert.match(worksheetSource, /prepareAssignmentForRuntime/);
});
