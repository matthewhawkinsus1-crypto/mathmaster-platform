import test from 'node:test';
import assert from 'node:assert/strict';

import {
  repairAssignmentForCurrentRuntime,
  RUNTIME_REPAIR_KEYS,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';
import { buildRuntimeRepairPersistencePatch } from '../../src/platform/assignments/assignmentRuntimeRepairPersistence.js';

const staleQuestion = () => ({
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  type: 'relationshipModel',
  prompt: 'Classify the relationship and state a reasonable domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  workflowProvenance: {
    source: 'recipeExpansion',
    recipeName: 'functionModeling',
    generatorVersion: 0,
  },
  workflow: [
    { id: 'continuity', kind: 'classification', choices: ['discrete', 'continuous'] },
    { id: 'graph', kind: 'graphConstruction', graphMode: 'studentSelected' },
    { id: 'domainDiscrete', kind: 'domainInput', notation: 'set', showWhen: { stage: 'continuity', is: 'discrete' } },
  ],
  grading: { continuity: 'discrete', domainDiscrete: '{0,1,2}' },
});

const assignmentOf = (question = staleQuestion()) => ({
  id: 'assignment-live-fixture',
  schemaVersion: 5,
  title: 'Runtime persistence fixture',
  courseId: 'algebra1',
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: [question] }],
});

test('safe generated-workflow cleanup yields only sections plus a compatibility stamp', () => {
  const storedAssignment = assignmentOf();
  const repairResult = repairAssignmentForCurrentRuntime(storedAssignment);
  assert.equal(repairResult.changed, true);
  assert.equal(repairResult.safeToPersist, true);

  const result = buildRuntimeRepairPersistencePatch({
    storedAssignment,
    repairResult,
    nowIso: '2026-09-09T23:59:00.000Z',
  });

  assert.deepEqual(Object.keys(result.patch).sort(), ['runtimeCompatibility', 'sections']);
  assert.equal(result.patch.sections[0].questions[0].workflow.some((stage) => stage.kind === 'graphConstruction'), false);
  assert.equal(result.patch.runtimeCompatibility.repairVersion, 1);
  assert.equal(result.patch.runtimeCompatibility.repairedAt, '2026-09-09T23:59:00.000Z');
  assert.deepEqual(result.patch.runtimeCompatibility.repairKeys, [RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH]);
});

test('presentation-only compatibility never manufactures a persistence write', () => {
  const storedAssignment = assignmentOf({
    questionId: '278da14e-695e-4707-a721-63c4a534ec58',
    type: 'functionCharacteristics',
    prompt: 'Analyze y = 2x - 6.',
    graph: { functions: [{ type: 'line', m: 2, b: -6 }] },
    recipe: { name: 'functionCharacteristics', ask: ['xInterceptExists', 'xInterceptValue', 'zeros', 'behavior'] },
  });
  const repairResult = repairAssignmentForCurrentRuntime(storedAssignment);
  const result = buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult });
  assert.equal(repairResult.changed, false);
  assert.equal(result.patch, null);
});

test('persistence refuses a repair result that changes protected mathematical content', () => {
  const storedAssignment = assignmentOf();
  const legitimate = repairAssignmentForCurrentRuntime(storedAssignment);
  const tampered = structuredClone(legitimate);
  tampered.assignment.sections[0].questions[0].prompt = 'Different mathematical task';

  const result = buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult: tampered });
  assert.equal(result.patch, null);
  assert.ok(result.diagnostics.some((entry) => /protected|prompt|content/i.test(entry.message)));
});

test('persistence refuses question identity or ordering changes', () => {
  const storedAssignment = assignmentOf();
  const legitimate = repairAssignmentForCurrentRuntime(storedAssignment);
  const tampered = structuredClone(legitimate);
  tampered.assignment.sections[0].questions[0].questionId = 'changed-id';

  const result = buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult: tampered });
  assert.equal(result.patch, null);
  assert.ok(result.diagnostics.some((entry) => /identity|order/i.test(entry.message)));
});
