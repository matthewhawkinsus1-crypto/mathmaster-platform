import test from 'node:test';
import assert from 'node:assert/strict';

import { getSectionAccessState } from '../../src/assignmentLifecycle.js';

const now = new Date('2026-09-12T16:00:00.000Z');
const baseAssignment = {
  schemaVersion: 5,
  releaseAt: '2026-09-12T12:00:00.000Z',
  dueAt: '2026-09-13T12:00:00.000Z',
  lateDueAt: '2026-09-14T12:00:00.000Z',
  assessmentPolicy: {
    mode: 'testCycle',
    passingScore: 70,
    review: { required: true },
    test: {},
    retest: { strategy: 'shortForm', scorePolicy: 'replaceIfHigher' },
  },
  sections: [
    { id: 'review', role: 'review', questions: [{ questionId: 'r1' }] },
    { id: 'test', role: 'test', questions: [{ questionId: 't1' }, { questionId: 't2' }] },
    { id: 'retest', role: 'retest', questions: [{ questionId: 'rt1' }] },
  ],
};

test('unscheduled Test Cycle Test and Retest start closed', () => {
  const testState = getSectionAccessState({
    assignment: baseAssignment,
    activityRole: 'test',
    classId: 'class-a',
    nowValue: now,
  });
  const retestState = getSectionAccessState({
    assignment: baseAssignment,
    activityRole: 'retest',
    classId: 'class-a',
    nowValue: now,
  });
  assert.equal(testState.enabled, true);
  assert.equal(testState.defaultState, 'closed');
  assert.equal(testState.isOpen, false);
  assert.equal(retestState.defaultState, 'closed');
  assert.equal(retestState.isOpen, false);
});

test('opening Test for one class does not open another class', () => {
  const assignment = {
    ...baseAssignment,
    sectionAccess: {
      test: {
        defaultState: 'closed',
        overridesByClassId: {
          'class-a': { state: 'open', changedAt: '2026-09-12T15:55:00.000Z' },
        },
      },
    },
  };
  const classA = getSectionAccessState({ assignment, activityRole: 'test', classId: 'class-a', nowValue: now });
  const classB = getSectionAccessState({ assignment, activityRole: 'test', classId: 'class-b', nowValue: now });
  assert.equal(classA.isOpen, true);
  assert.equal(classB.isOpen, false);
});

test('an authored stage opensAt opts into automatic opening after the pathway time gate', () => {
  const assignment = {
    ...baseAssignment,
    assessmentPolicy: {
      ...baseAssignment.assessmentPolicy,
      test: { opensAt: '2026-09-12T16:30:00.000Z' },
    },
  };
  const access = getSectionAccessState({ assignment, activityRole: 'test', classId: 'class-a', nowValue: now });
  assert.equal(access.defaultState, 'open');
  assert.equal(access.isOpen, false);
  assert.equal(access.status, 'stageScheduled');
});

test('Test Cycle does not turn a closed Test into post-deadline Practice Mode', () => {
  const closedAssignment = {
    ...baseAssignment,
    lateDueAt: '2026-09-12T15:00:00.000Z',
  };
  const access = getSectionAccessState({
    assignment: closedAssignment,
    activityRole: 'test',
    classId: 'class-a',
    nowValue: now,
  });
  assert.equal(access.isOpen, false);
  assert.equal(access.status, 'closedAssignment');
  assert.equal(access.practiceOnly, undefined);
});
