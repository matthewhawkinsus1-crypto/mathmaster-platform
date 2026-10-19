import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVAILABILITY_REASON,
  resolveWalkthroughSelection,
  studentAssignmentAvailability,
  validatePersistedWalkthroughSession,
  walkthroughAssignmentsForClass,
  walkthroughEligibility,
} from '../../src/platform/assignments/assignmentAvailability.js';
import { buildStudentDashboardModel } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getDOLState,
  getIncludedQuestionIndices,
  getWarmupState,
  prerequisiteAccess,
  questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { buildWalkthroughMonitor } from '../../src/platform/teacher/walkthroughMonitor.js';
import { studentsInClass } from '../../functions/shared/classModel.mjs';

/*
 * WALKTHROUGH OFFERS ONLY THE SELECTED CLASS'S LIVE WORK.
 *
 * The reported bug: Period 1's Walkthrough selector listed Algebra II work and
 * last marking period's lessons that were never assigned to Period 1. Every
 * scenario below is a rule from that report, asserted against the shared
 * availability module the selector, Live Teaching and App's session restore
 * all call. Ids, titles and periods are invented and none is special-cased.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-14T15:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const SETTINGS = {
  periods: [
    { id: 'term-a', label: 'First term', order: 1, archived: true },
    { id: 'term-b', label: 'Second term', order: 2, archived: false },
  ],
  currentPeriodId: 'term-b',
};
const TERM_A = { id: 'term-a', label: 'First term', order: 1 };
const TERM_B = { id: 'term-b', label: 'Second term', order: 2 };

// Two Algebra I classes (same course), one Algebra II class.
const CLASSES = [
  { classId: 'cls-alg1-first', name: 'Algebra I', period: 'Period 1', course: 'algebra1', status: 'active' },
  { classId: 'cls-alg1-second', name: 'Algebra I', period: 'Period 2', course: 'algebra1', status: 'active' },
  { classId: 'cls-alg2', name: 'Algebra II', period: 'Period 4', course: 'algebra2', status: 'active' },
];
const P1 = 'cls-alg1-first';
const P2 = 'cls-alg1-second';
const ALG2 = 'cls-alg2';

const lesson = (id, overrides = {}) => ({
  id,
  title: `Lesson ${id}`,
  assignedClassIds: [P1],
  releaseAt: iso(NOW - 2 * DAY),
  dueAt: iso(NOW + 2 * DAY),
  lateDueAt: iso(NOW + 5 * DAY),
  gradingPeriod: TERM_B,
  questions: [{ activityRole: 'classwork', prompt: 'x' }],
  ...overrides,
});

const offered = (assignments, classId = P1, extra = {}) => walkthroughAssignmentsForClass({
  assignments, classId, nowValue: NOW, gradingPeriodSettings: SETTINGS, ...extra,
}).map((assignment) => assignment.id);

test('correct class: an assignment given to Period 1 appears for Period 1', () => {
  assert.deepEqual(offered([lesson('A')]), ['A']);
});

test('different class: Period 2\'s assignment does not appear while Period 1 is selected', () => {
  const assignments = [lesson('A'), lesson('B', { assignedClassIds: [P2] })];
  assert.deepEqual(offered(assignments, P1), ['A']);
  assert.deepEqual(offered(assignments, P2), ['B']);
});

test('same course, wrong class: two Algebra I classes keep their own assignments', () => {
  // Both titles say "Algebra I"; only assignedClassIds decides.
  const assignments = [
    lesson('first-only', { title: 'Algebra I — Factoring', assignedClassIds: [P1] }),
    lesson('second-only', { title: 'Algebra I — Factoring', assignedClassIds: [P2] }),
  ];
  assert.deepEqual(offered(assignments, P1), ['first-only']);
  assert.deepEqual(offered(assignments, P2), ['second-only']);
});

test('different course: an Algebra II assignment never appears in an Algebra I class because the teacher owns both', () => {
  const assignments = [
    lesson('alg2-work', { title: 'Algebra II — Systems', assignedClassIds: [ALG2] }),
    // A title naming the other course proves nothing either way.
    lesson('titled-alg1', { title: 'Algebra I review', assignedClassIds: [ALG2] }),
  ];
  assert.deepEqual(offered(assignments, P1), []);
  assert.deepEqual(offered(assignments, ALG2).sort(), ['alg2-work', 'titled-alg1']);
});

test('previous marking period: last term\'s assignment is not offered, even while still technically open', () => {
  const assignments = [lesson('old-term', { gradingPeriod: TERM_A }), lesson('this-term')];
  assert.deepEqual(offered(assignments), ['this-term']);
  assert.equal(walkthroughEligibility({ assignment: assignments[0], classId: P1, nowValue: NOW, gradingPeriodSettings: SETTINGS }).reason, AVAILABILITY_REASON.OTHER_MARKING_PERIOD);
});

test('an un-stamped (legacy) assignment belongs to the current term, and a school with no marking periods loses nothing', () => {
  const legacy = lesson('legacy', { gradingPeriod: undefined });
  assert.deepEqual(offered([legacy]), ['legacy']);
  assert.deepEqual(offered([legacy, lesson('stamped')], P1, { gradingPeriodSettings: null }).sort(), ['legacy', 'stamped']);
});

test('draft / unpublished: library items and explicit authoring drafts are not offered', () => {
  const assignments = [
    lesson('library', { assignedClassIds: [] }),
    lesson('incomplete', { authoringState: 'incomplete' }),
    lesson('needs-review', { authoringReview: { state: 'needsReview' } }),
    lesson('published', { authoringState: 'published' }),
  ];
  assert.deepEqual(offered(assignments), ['published']);
});

test('future assignment: not offered while students cannot open it yet', () => {
  const future = lesson('future', { releaseAt: iso(NOW + DAY) });
  assert.deepEqual(offered([future]), []);
  assert.equal(walkthroughEligibility({ assignment: future, classId: P1, nowValue: NOW, gradingPeriodSettings: SETTINGS }).reason, AVAILABILITY_REASON.SCHEDULED);
  // ...and a student in that class sees it locked, from the same rule.
  assert.equal(studentAssignmentAvailability({ assignment: future, classId: P1, nowValue: NOW }).open, false);
  // A prerequisite-gated lesson nobody has unlocked yet is not class work either.
  const gated = lesson('gated', { releaseAt: null, prerequisiteAssignmentId: 'A' });
  assert.deepEqual(offered([gated]), []);
});

test('archived or permanently closed: not offered', () => {
  const assignments = [
    lesson('archived', { archived: true }),
    lesson('closed', { dueAt: iso(NOW - 5 * DAY), lateDueAt: iso(NOW - DAY) }),
  ];
  assert.deepEqual(offered(assignments), []);
  const closed = walkthroughEligibility({ assignment: assignments[1], classId: P1, nowValue: NOW, gradingPeriodSettings: SETTINGS });
  assert.equal(closed.reason, AVAILABILITY_REASON.PRACTICE_ONLY);
});

test('overdue but still available: past due, inside the late window, current term — still offered', () => {
  // NOT `dueDate >= now`: students can still turn this in for credit.
  const overdue = lesson('overdue', { dueAt: iso(NOW - DAY), lateDueAt: iso(NOW + 3 * DAY) });
  assert.deepEqual(offered([overdue]), ['overdue']);
  const studentView = studentAssignmentAvailability({ assignment: overdue, classId: P1, nowValue: NOW });
  assert.equal(studentView.workable, true);
  assert.equal(studentView.lifecycle.isLate, true);
});

test('no active work: the list is empty — there is no fallback to other classes or history', () => {
  const assignments = [
    lesson('other-class', { assignedClassIds: [P2] }),
    lesson('old-term', { gradingPeriod: TERM_A }),
    lesson('closed', { dueAt: iso(NOW - 5 * DAY), lateDueAt: iso(NOW - DAY) }),
    lesson('library', { assignedClassIds: [] }),
  ];
  assert.deepEqual(offered(assignments), []);
  // No class chosen is not "every class".
  assert.deepEqual(walkthroughAssignmentsForClass({ assignments: [lesson('A')], classId: null, nowValue: NOW }), []);
});

test('Walkthrough agrees with what a Period 1 student can actually open (single source of truth)', () => {
  // Stored as V5 lessons, the only shape a student's device can open: the
  // dashboard (rightly) never offers Start on an assignment with no question
  // to land on, and the flat pre-V5 `questions` array has none for a student.
  const v5 = (assignment) => ({
    ...assignment,
    schemaVersion: 5,
    sections: [{ id: 'classwork', role: 'classwork', questions: [{ type: 'algebra', prompt: 'x', equationLatex: 'x=1', activityRole: 'classwork' }] }],
  });
  const assignments = [
    lesson('A'),
    lesson('other-class', { assignedClassIds: [P2] }),
    lesson('future', { releaseAt: iso(NOW + DAY) }),
    lesson('overdue', { dueAt: iso(NOW - DAY), lateDueAt: iso(NOW + 3 * DAY) }),
    lesson('closed', { dueAt: iso(NOW - 5 * DAY), lateDueAt: iso(NOW - DAY) }),
  ].map(v5);
  const dashboard = buildStudentDashboardModel({
    assignments,
    classId: P1,
    nowValue: NOW,
    providers: {
      assignmentIsForStudent, getAssignmentLifecycle, prerequisiteAccess,
      calculateGrade: () => null, getDOLState, getWarmupState, getIncludedQuestionIndices,
      normalizeQuestionRecord: (record) => record || { status: 'unattempted', totalAttempts: 0 },
      questionIsIncluded, assignmentHasHeldTeacherFeedback: () => false, matchesSmartView,
    },
  });
  // Cards a Period 1 student can open for credit (not locked, not practice-only).
  const studentWorkable = dashboard.allEntries
    .filter((entry) => !entry.disabled && !entry.lifecycle.isPracticeOnly)
    .map((entry) => entry.assignment.id)
    .sort();
  assert.deepEqual(offered(assignments).sort(), studentWorkable);
  assert.deepEqual(studentWorkable, ['A', 'overdue']);
});

test('sorting: today\'s lesson first, then on-time before late work, then most recently released — not alphabetical', () => {
  const todayKey = new Date(NOW).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const assignments = [
    lesson('a-old-release', { title: 'Alpha', releaseAt: iso(NOW - 6 * DAY) }),
    lesson('z-recent-release', { title: 'Zeta', releaseAt: iso(NOW - DAY) }),
    lesson('m-late', { title: 'Mu', releaseAt: iso(NOW - 3 * DAY), dueAt: iso(NOW - DAY), lateDueAt: iso(NOW + 3 * DAY) }),
    lesson('t-today', { title: 'Tau', releaseAt: iso(NOW - 4 * DAY), warmup: { enabled: true, instructionDate: todayKey } }),
  ];
  assert.deepEqual(offered(assignments), ['t-today', 'z-recent-release', 'a-old-release', 'm-late']);
});

test('period switch: options are recomputed and a selection from the previous class is cleared, never swapped', () => {
  const assignments = [lesson('A'), lesson('B', { assignedClassIds: [P2] }), lesson('shared', { assignedClassIds: [P1, P2] })];
  const forP1 = walkthroughAssignmentsForClass({ assignments, classId: P1, nowValue: NOW, gradingPeriodSettings: SETTINGS });
  const forP2 = walkthroughAssignmentsForClass({ assignments, classId: P2, nowValue: NOW, gradingPeriodSettings: SETTINGS });
  assert.equal(resolveWalkthroughSelection({ eligibleAssignments: forP1, selectedId: 'A' }), 'A');
  assert.equal(resolveWalkthroughSelection({ eligibleAssignments: forP2, selectedId: 'A' }), null);
  assert.equal(resolveWalkthroughSelection({ eligibleAssignments: forP2, selectedId: 'shared' }), 'shared');
  assert.equal(resolveWalkthroughSelection({ eligibleAssignments: forP2, selectedId: null }), null);
});

test('stale persisted session: an ineligible saved assignment does not come back', () => {
  const assignments = [
    lesson('A'),
    lesson('archived', { archived: true }),
    lesson('old-term', { gradingPeriod: TERM_A }),
    lesson('B', { assignedClassIds: [P2] }),
  ];
  const saved = (overrides) => ({ active: true, ownerUid: 'teacher-1', classId: P1, assignmentId: 'A', ...overrides });
  const check = (session, extra = {}) => validatePersistedWalkthroughSession({
    session, classId: P1, teacherUid: 'teacher-1', assignments, nowValue: NOW, gradingPeriodSettings: SETTINGS, ...extra,
  });
  assert.deepEqual(check(saved()), { valid: true, reason: AVAILABILITY_REASON.AVAILABLE });
  assert.equal(check(saved({ classId: P2 })).reason, 'otherClass');
  assert.equal(check(saved({ assignmentId: 'archived' })).reason, AVAILABILITY_REASON.ARCHIVED);
  assert.equal(check(saved({ assignmentId: 'old-term' })).reason, AVAILABILITY_REASON.OTHER_MARKING_PERIOD);
  assert.equal(check(saved({ assignmentId: 'B' })).reason, AVAILABILITY_REASON.NOT_ASSIGNED);
  assert.equal(check(saved({ assignmentId: 'deleted' })).reason, AVAILABILITY_REASON.MISSING);
  assert.equal(check(saved({ active: false })).reason, 'inactive');
  assert.equal(check(saved({ ownerUid: 'someone-else' })).reason, 'otherTeacher');
  assert.equal(check(saved(), { assignmentId: 'B' }).reason, 'otherAssignment');
  // Valid yesterday, closed today: refreshing does not revive it.
  const closedSince = validatePersistedWalkthroughSession({
    session: saved(), classId: P1, assignments, nowValue: NOW + 10 * DAY, gradingPeriodSettings: SETTINGS,
  });
  assert.equal(closedSince.valid, false);
});

test('walkthrough roster: only the selected class\'s students, even when another class has the same assignment', () => {
  const shared = lesson('shared', { assignedClassIds: [P1, P2] });
  const live = { assignmentId: 'shared', activityRole: 'classwork', sectionQuestionIndex: 0, updatedAt: NOW, lastInteractionAt: NOW, pageVisible: true, nowValue: NOW };
  const students = [
    { id: 's-p1', firstName: 'Ada', lastName: 'One', classId: P1, liveStatus: live },
    { id: 's-p2', firstName: 'Bo', lastName: 'Two', classId: P2, liveStatus: live },
    // Unplaced legacy student on an unambiguous period still belongs by period.
    { id: 's-legacy', firstName: 'Cy', lastName: 'Old', classPeriod: 'Period 1', liveStatus: live },
  ];
  const roster = studentsInClass({ students, classes: CLASSES, classId: P1 });
  const monitor = buildWalkthroughMonitor({ students: roster, assignmentId: shared.id, teacherQuestionIndex: 0, nowValue: NOW });
  assert.deepEqual(monitor.all.map((row) => row.id).sort(), ['s-legacy', 's-p1']);
});
