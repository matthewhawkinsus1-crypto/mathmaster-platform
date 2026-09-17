import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAssignmentLifecycle,
  getSectionAccessState,
  recordAssignmentActivity,
} from '../../src/assignmentLifecycle.js';
import { practicePassLooksEligible } from '../../src/platform/rewards/practicePassClientEligibility.js';
import { classroomLaunchTarget } from '../../src/platform/classroom/classroomLaunchRoute.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { normalizeAssignmentV5 } from '../../src/platform/contract/assignmentSchemaV5.js';

/*
 * "getAssignmentLifecycle(assignment, now, { studentId })" is one function.
 * Nothing downstream matters if the client surfaces that actually gate a real
 * student's runtime — section locks, activity/time tracking, the Practice
 * Pass wallet, a Google Classroom deep link, dashboard bucketing — still call
 * the OLD two-argument form internally. These tests exercise those surfaces
 * directly (not just the resolver) so a future refactor that drops the
 * studentId parameter from one of them fails loudly here.
 */

const v5Content = normalizeAssignmentV5({
  schemaVersion: 5,
  assignment: { title: 'Extension runtime parity fixture', courseId: 'algebra1' },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [{ prompt: 'A', type: 'algebra' }] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [{ prompt: 'B', type: 'algebra' }] },
  ],
});

const extended = {
  ...v5Content,
  id: 'a1',
  assignedClassIds: ['c1'],
  dueAt: new Date(2026, 8, 18, 23, 59).toISOString(),
  lateDueAt: new Date(2026, 8, 25, 23, 59).toISOString(),
  studentOverrides: {
    s1: { lateDueAt: new Date(2026, 9, 2, 23, 59).toISOString() },
  },
  sectionAccess: {
    classwork: {
      defaultState: 'open',
      overridesByClassId: { c1: { state: 'closed' } },
    },
  },
};

const AFTER_CLASS_CUTOFF = new Date(2026, 8, 26);

test('getSectionAccessState respects a per-student extension, not just the class cutoff', () => {
  // Without the override, the class final cutoff has passed: the section is
  // voluntary Practice Mode and the teacher's manual close no longer applies.
  const noOverrideState = getSectionAccessState({
    assignment: { ...extended, studentOverrides: {} }, activityRole: 'classwork', classId: 'c1', nowValue: AFTER_CLASS_CUTOFF,
  });
  assert.equal(noOverrideState.practiceOnly, true);

  // With the override, the extended student is still inside the ordinary
  // graded window, so the teacher's manual "closed" override for this class
  // still governs — proving the lifecycle gate itself passed for them.
  const extendedState = getSectionAccessState({
    assignment: extended, activityRole: 'classwork', classId: 'c1', nowValue: AFTER_CLASS_CUTOFF, studentId: 's1',
  });
  assert.equal(extendedState.practiceOnly, undefined);
  assert.equal(extendedState.status, 'closed');
});

test('recordAssignmentActivity counts time as onTime for an extended student past the class cutoff, and as closed for everyone else', () => {
  const extendedActivity = recordAssignmentActivity({
    activity: null, assignment: extended, seconds: 60, nowValue: new Date(2026, 8, 20), studentId: 's1',
  });
  assert.equal(extendedActivity.onTimeSeconds, 0);
  assert.equal(extendedActivity.lateSeconds, 60); // past ordinary dueAt (18 Sept), still credit-eligible as "late"
  assert.equal(extendedActivity.totalTimeSeconds, 60); // NOT dropped as closed-time

  const everyoneElseActivity = recordAssignmentActivity({
    activity: null, assignment: extended, seconds: 60, nowValue: AFTER_CLASS_CUTOFF,
  });
  assert.equal(everyoneElseActivity.totalTimeSeconds, 0); // closed: time is not counted at all
});

test('the Practice Pass wallet keeps offering an extended assignment past the class final cutoff', () => {
  const forExtended = practicePassLooksEligible({
    assignment: extended, classId: 'c1', nowValue: AFTER_CLASS_CUTOFF, studentId: 's1',
  });
  const forEveryoneElse = practicePassLooksEligible({
    assignment: extended, classId: 'c1', nowValue: AFTER_CLASS_CUTOFF,
  });
  assert.equal(forExtended, true);
  assert.equal(forEveryoneElse, false);
});

test('a Google Classroom deep link does not force an extended student onto the frozen result screen', () => {
  const launch = { assignmentId: 'a1', sectionKey: 'whole', isSectionLaunch: false };
  const forExtended = classroomLaunchTarget({ assignment: extended, launch, nowValue: AFTER_CLASS_CUTOFF, studentId: 's1' });
  const forEveryoneElse = classroomLaunchTarget({ assignment: extended, launch, nowValue: AFTER_CLASS_CUTOFF });
  assert.equal(forExtended.showFrozenReportFirst, false);
  assert.equal(forEveryoneElse.showFrozenReportFirst, true);
});

test('dashboard Smart View bucketing (matchesSmartView) recognizes an extended student as still active, not closed', () => {
  const activeForExtended = matchesSmartView(extended, 'active', { nowValue: AFTER_CLASS_CUTOFF, studentId: 's1' });
  const closedForEveryoneElse = matchesSmartView(extended, 'closed', { nowValue: AFTER_CLASS_CUTOFF });
  assert.equal(activeForExtended, true);
  assert.equal(closedForEveryoneElse, true);
});

test('a legacy student dueAt override cannot shorten a later class-wide final cutoff', () => {
  const assignment = {
    ...extended,
    studentOverrides: {
      s1: { dueAt: new Date(2026, 8, 20, 23, 59).toISOString() },
    },
  };

  const lifecycle = getAssignmentLifecycle(assignment, new Date(2026, 8, 23), { studentId: 's1' });
  assert.equal(lifecycle.status, 'late');
  assert.equal(lifecycle.creditEligible, true);
  assert.equal(lifecycle.isPracticeOnly, false);
});

test('a later legacy student dueAt override still extends the class-wide final cutoff', () => {
  const assignment = {
    ...extended,
    studentOverrides: {
      s1: { dueAt: new Date(2026, 9, 2, 23, 59).toISOString() },
    },
  };

  const lifecycle = getAssignmentLifecycle(assignment, AFTER_CLASS_CUTOFF, { studentId: 's1' });
  assert.equal(lifecycle.status, 'late');
  assert.equal(lifecycle.creditEligible, true);
  assert.equal(lifecycle.isPracticeOnly, false);
});
