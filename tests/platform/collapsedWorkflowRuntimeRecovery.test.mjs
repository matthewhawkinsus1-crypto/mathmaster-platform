import test from 'node:test';
import assert from 'node:assert/strict';

import {
  repairAssignmentForCurrentRuntime,
  RUNTIME_REPAIR_KEYS,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';
import { inspectLibraryContentRepair } from '../../src/platform/assignments/libraryAssignmentReuse.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';

const collapsedQuestion = () => ({
  questionId: 'legacy-collapsed-q1',
  type: 'functionGraph',
  prompt: 'Write the equation, complete the table, graph the relationship, and state the domain.',
  studentActions: ['writeEquation', 'completeTable', 'constructGraph', 'stateDomain'],
  functionSpec: { type: 'linear', m: 1, b: 0 },
  studentChoosesX: true,
  recipe: { name: 'functionModeling', ask: ['equation', 'table', 'graph', 'domain'] },
  correctEquation: 'y=x',
  correctDomain: 'all real numbers',
});

const liveAssignment = () => ({
  id: 'legacy-live-assignment',
  schemaVersion: 5,
  title: 'Legacy collapsed workflow',
  courseId: 'algebra1',
  assignedClassIds: ['class-1'],
  assignedClassPeriods: ['1st'],
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [collapsedQuestion()],
  }],
});

test('known pre-provenance collapsed workflow recovers from its own recipe without sibling content', () => {
  const assignment = liveAssignment();
  const result = repairAssignmentForCurrentRuntime(assignment);
  const manifest = result.repairManifest.find((entry) => (
    entry.questionId === 'legacy-collapsed-q1'
    && entry.repairKey === RUNTIME_REPAIR_KEYS.COLLAPSED_WORKFLOW
  ));

  assert.ok(manifest);
  assert.equal(manifest.changed, false, 'self-contained recovery is a runtime read, not a content mutation');
  assert.equal(manifest.presentationOnly, true);
  assert.equal(manifest.safeToPersist, false);

  const runtime = readComposedQuestion(assignment.sections[0].questions[0]);
  assert.equal(runtime.composed, true);
  assert.ok(runtime.workflow.length >= 4);
});

test('library inspection does not search siblings when the collapsed workflow is self-contained', () => {
  const inspection = inspectLibraryContentRepair(liveAssignment(), []);
  assert.equal(inspection.source, null);
  assert.equal(inspection.reason, 'runtime-self-contained');
  assert.deepEqual(inspection.questionIds, ['legacy-collapsed-q1']);
});

test('ambiguous no-workflow question without a known recipe remains outside automatic recovery', () => {
  const assignment = liveAssignment();
  delete assignment.sections[0].questions[0].recipe;
  const result = repairAssignmentForCurrentRuntime(assignment);
  assert.equal(result.repairManifest.some((entry) => entry.repairKey === RUNTIME_REPAIR_KEYS.COLLAPSED_WORKFLOW), false);
});
