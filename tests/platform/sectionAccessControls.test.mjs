import test from 'node:test';
import assert from 'node:assert/strict';
import { getSectionAccessState } from '../../src/assignmentLifecycle.js';

const NOW = new Date('2026-08-13T12:00:00');
const base = {
  releaseAt: '2026-08-13T08:00',
  dueAt: '2026-08-13T15:00',
  lateDueAt: '2026-08-13T16:00',
  questions: [
    { activityRole: 'warmup' },
    { activityRole: 'classwork' },
    { activityRole: 'practice' },
    { activityRole: 'dol' },
  ],
};

test('classwork and practice default to open for backward compatibility', () => {
  assert.equal(getSectionAccessState({ assignment: base, activityRole: 'classwork', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
  assert.equal(getSectionAccessState({ assignment: base, activityRole: 'practice', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
});

test('a section may start locked until the teacher opens that class', () => {
  const assignment = { ...base, sectionAccess: { classwork: { defaultState: 'closed', overridesByClassPeriod: {} } } };
  const state = getSectionAccessState({ assignment, activityRole: 'classwork', classPeriod: 'Period 3', nowValue: NOW });
  assert.equal(state.status, 'closed');
  assert.equal(state.isOpen, false);
});

test('class-period override does not leak to another class', () => {
  const assignment = {
    ...base,
    sectionAccess: { classwork: { defaultState: 'closed', overridesByClassPeriod: { 'Period 3': { state: 'open' } } } },
  };
  assert.equal(getSectionAccessState({ assignment, activityRole: 'classwork', classPeriod: 'Period 3', nowValue: NOW }).isOpen, true);
  assert.equal(getSectionAccessState({ assignment, activityRole: 'classwork', classPeriod: 'Period 5', nowValue: NOW }).isOpen, false);
});

test('teacher locks are ignored after the final cutoff because assignment is ungraded Practice Mode', () => {
  const assignment = { ...base, sectionAccess: { practice: { defaultState: 'closed', overridesByClassPeriod: {} } } };
  const after = new Date('2026-08-13T17:00:00');
  const state = getSectionAccessState({ assignment, activityRole: 'practice', classPeriod: 'Period 3', nowValue: after });
  assert.equal(state.practiceOnly, true);
  assert.equal(state.isOpen, true);
});
