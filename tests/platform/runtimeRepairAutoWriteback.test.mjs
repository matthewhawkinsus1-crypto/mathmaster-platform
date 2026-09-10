import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { findAssignmentsNeedingRuntimeRepairPersistence } from '../../src/platform/assignments/assignmentRuntimeRepairAutoWriteback.js';
import { RUNTIME_REPAIR_KEYS } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const staleQuestion = () => ({
  questionId: 'q-stale',
  type: 'relationshipModel',
  prompt: 'Classify the relationship and state the domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  workflowProvenance: { source: 'recipeExpansion', recipeName: 'functionModeling', generatorVersion: 0 },
  workflow: [
    { id: 'continuity', kind: 'classification', choices: ['discrete', 'continuous'] },
    { id: 'graph', kind: 'graphConstruction', graphMode: 'studentSelected' },
    { id: 'domainDiscrete', kind: 'domainInput', notation: 'set' },
  ],
  grading: { continuity: 'discrete', domainDiscrete: '{0,1,2}' },
});

const assignment = (overrides = {}) => ({
  id: 'assignment-1',
  schemaVersion: 5,
  title: 'Auto-writeback fixture',
  courseId: 'algebra1',
  sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [staleQuestion()] }],
  ...overrides,
});

test('only V5 assignments with a verifier-eligible deterministic runtime content repair are selected', () => {
  const clean = assignment({
    id: 'clean',
    sections: [{
      id: 'cw', role: 'classwork', title: 'Classwork', questions: [{
        questionId: 'q-clean',
        type: 'relationshipModel',
        prompt: 'Classify the relationship and state the domain.',
        studentActions: ['classifyContinuity', 'stateDomain'],
        recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
        workflowProvenance: { source: 'recipeExpansion', recipeName: 'functionModeling', generatorVersion: 1 },
        workflow: [
          { id: 'continuity', kind: 'classification', choices: ['discrete', 'continuous'] },
          { id: 'domainDiscrete', kind: 'domainInput', notation: 'set' },
        ],
        grading: { continuity: 'discrete', domainDiscrete: '{0,1,2}' },
      }],
    }],
  });

  const candidates = findAssignmentsNeedingRuntimeRepairPersistence([
    assignment(),
    clean,
    { id: 'legacy', schemaVersion: 4, questions: [] },
    assignment({ id: '' }),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].assignment.id, 'assignment-1');
  assert.deepEqual(candidates[0].repairKeys, [RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH]);
});

test('a current compatibility stamp prevents repeat auto-writeback evaluation', () => {
  const stamped = assignment({
    runtimeCompatibility: {
      repairVersion: 1,
      repairedAt: '2026-09-09T23:00:00.000Z',
      repairKeys: [RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH],
    },
  });
  assert.deepEqual(findAssignmentsNeedingRuntimeRepairPersistence([stamped]), []);
});

test('teacher Library owns the automatic writeback boundary and never routes it through student runtime', () => {
  const source = readFileSync(new URL('../../src/AssignmentLibrary.jsx', import.meta.url), 'utf8');
  assert.match(source, /findAssignmentsNeedingRuntimeRepairPersistence/);
  assert.match(source, /persistRuntimeRepairForTeacher/);
  assert.match(source, /actorRole:\s*'teacher'/);
  assert.match(source, /useEffect/);
  assert.doesNotMatch(source, /actorRole:\s*'student'/);
});
