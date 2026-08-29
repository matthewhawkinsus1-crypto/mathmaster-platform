import test from 'node:test';
import assert from 'node:assert/strict';
import { getSectionAccessState } from '../../src/assignmentLifecycle.js';

const NOW = new Date('2026-08-13T12:00:00');
// Assignment V5. getStoredAssignmentQuestions returns [] for anything that does
// not declare schemaVersion 5, so without it every role fell through to the
// `unavailable` branch — which also reports isOpen: true, so the "defaults to
// open" test passed while proving nothing.
const base = {
  schemaVersion: 5,
  releaseAt: '2026-08-13T08:00',
  dueAt: '2026-08-13T15:00',
  lateDueAt: '2026-08-13T16:00',
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ activityRole: 'warmup' }] },
    { id: 'classwork', role: 'classwork', questions: [{ activityRole: 'classwork' }] },
    { id: 'practice', role: 'practice', questions: [{ activityRole: 'practice' }] },
    { id: 'dol', role: 'dol', questions: [{ activityRole: 'dol' }] },
  ],
};

test('classwork and practice default to open for backward compatibility', () => {
  assert.equal(getSectionAccessState({ assignment: base, activityRole: 'classwork', classId: 'class-3', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
  assert.equal(getSectionAccessState({ assignment: base, activityRole: 'practice', classId: 'class-3', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
});

test('a section may start locked until the teacher opens that class', () => {
  const assignment = { ...base, sectionAccess: { classwork: { defaultState: 'closed', overridesByClassId: {} } } };
  const state = getSectionAccessState({ assignment, activityRole: 'classwork', classId: 'class-3', classPeriod: 'Period 3', nowValue: NOW });
  assert.equal(state.status, 'closed');
  assert.equal(state.isOpen, false);
});

test('class-ID override does not leak to another class', () => {
  const assignment = {
    ...base,
    sectionAccess: { classwork: { defaultState: 'closed', overridesByClassId: { 'class-3': { state: 'open' } } } },
  };
  // Overrides are scoped by class ID. The period name is passed through for
  // display only and no longer identifies the class, so the override has to be
  // claimed by its class ID rather than inferred from "Period 3".
  assert.equal(getSectionAccessState({ assignment, activityRole: 'classwork', classId: 'class-3', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
  assert.equal(getSectionAccessState({ assignment, activityRole: 'classwork', classId: 'class-5', classPeriod: 'Period 5', nowValue: NOW }).isOpen, false);
  // And a caller with no class ID at all must not inherit another class's open.
  assert.equal(getSectionAccessState({ assignment, activityRole: 'classwork', classPeriod: 'Period 3', nowValue: NOW }).isOpen, false);
});

test('teacher locks are ignored after the final cutoff because assignment is ungraded Practice Mode', () => {
  const assignment = { ...base, sectionAccess: { practice: { defaultState: 'closed', overridesByClassId: {} } } };
  const after = new Date('2026-08-13T17:00:00');
  const state = getSectionAccessState({ assignment, activityRole: 'practice', classId: 'class-3', classPeriod: 'Period 3', nowValue: after });
  assert.equal(state.practiceOnly, true);
  assert.equal(state.isOpen, true);
});
