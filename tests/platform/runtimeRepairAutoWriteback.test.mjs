import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { findAssignmentsNeedingRuntimeRepairPersistence } from '../../src/platform/assignments/assignmentRuntimeRepairAutoWriteback.js';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION, RUNTIME_REPAIR_KEYS } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

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
      // "Current" means whatever the current version is. Pinned to a literal,
      // this fixture silently became a STALE stamp on the next bump — and the
      // test then asserted the opposite of its own name, because a stale stamp
      // is exactly what should trigger re-evaluation.
      repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION,
      repairedAt: '2026-09-09T23:00:00.000Z',
      repairKeys: [RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH],
    },
  });
  assert.deepEqual(findAssignmentsNeedingRuntimeRepairPersistence([stamped]), []);
});

/*
 * THE COUNTERPART TO THE TEST ABOVE, AND THE REASON THE VERSION EXISTS.
 *
 * A current stamp suppresses re-evaluation; an older one must not. That is the
 * entire purpose of ASSIGNMENT_RUNTIME_REPAIR_VERSION — when a release adds a
 * repair, assignments stamped by an earlier release have to be looked at again,
 * or the new repair never reaches anything already stamped.
 *
 * Written as CURRENT - 1 rather than a literal. Every version literal in this
 * file previously meant "current" and silently came to mean "stale" the moment
 * the constant advanced, which is what broke three tests at once in PR #169.
 * The same mistake in reverse would make this test pass forever by accident.
 */
test('an assignment stamped by an earlier runtime version is evaluated again', () => {
  const stampedByPreviousRelease = assignment({
    runtimeCompatibility: {
      repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION - 1,
      repairedAt: '2026-09-09T23:00:00.000Z',
      repairKeys: [RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH],
    },
  });

  const candidates = findAssignmentsNeedingRuntimeRepairPersistence([stampedByPreviousRelease]);
  assert.equal(
    candidates.length,
    1,
    'an assignment stamped by an older release must be re-evaluated, or a repair added in this release never reaches it',
  );
});

test('teacher Library owns the automatic writeback boundary and never routes it through student runtime', () => {
  const source = readFileSync(new URL('../../src/AssignmentLibrary.jsx', import.meta.url), 'utf8');
  assert.match(source, /findAssignmentsNeedingRuntimeRepairPersistence/);
  assert.match(source, /persistRuntimeRepairForTeacher/);
  assert.match(source, /actorRole:\s*'teacher'/);
  assert.match(source, /useEffect/);
  assert.doesNotMatch(source, /actorRole:\s*'student'/);
});
