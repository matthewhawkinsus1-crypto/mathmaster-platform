// EVERY STUDENT SCREEN PRINTS THE STUDENT'S OWN DUE DATE.
//
// An extra-time accommodation moves a student's real deadline: the lifecycle
// that decides "on time" vs "late" reads it from the student's in-memory copy
// of the assignment (withStudentSupportDates). The dashboard card and the
// assignment header already said "Your due date: Fri". Four other places kept
// printing the class date — a day early for this student — because their
// models copied `assignment.dueAt` instead of reading the lifecycle they had
// already computed:
//
//   Home "Do this next"          resolveNextAction → WhatShouldIDoNow
//   Assignments tab              buildStudentAssignmentsCenter rows
//   Grades tab, result screen    buildStudentGradeCenter entries
//
// The same gap hid attendance extensions: a closed row printed the class's
// final date, not the extended one the platform actually enforced.
//
// Every assertion compares INSTANTS (or formats through the same local
// formatter), never a Chicago wall-clock string: a date-only class due is end
// of day in the viewer's own zone, and CI runs in UTC.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUCKET, buildStudentDashboardModel, resolveNextAction } from '../../src/studentDashboardModel.js';
import { buildStudentGradeCenter, findGradeCenterEntry } from '../../src/platform/student/studentGradeCenterModel.js';
import { buildStudentAssignmentsCenter } from '../../src/platform/student/studentAssignmentsCenterModel.js';
import {
  assignmentIsForStudent, formatDateTime, getAssignmentDate, getAssignmentLifecycle, getDOLState,
  getIncludedQuestionIndices, getWarmupState, prerequisiteAccess, questionIsIncluded, studentDueDates,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { withStudentSupportDates } from '../../functions/shared/supportDeadline.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const CLASS_ID = 'class-alg1-a';
const SUPPORTED = 'S1';
const CLASSMATE = 'S2';

// Extra time "until the end of the next school day", in effect since August.
const extraTimeProfile = buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false,
    accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-09-30',
});

// Class due Thursday 2026-10-01, end of day; no late window.
const lesson = Object.freeze({
  id: 'A1',
  title: 'Systems of Equations',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  dueAt: '2026-10-01',
  sections: [{
    id: 'practice', role: 'practice', title: 'Practice',
    questions: [{ id: 'q1', activityRole: 'practice' }, { id: 'q2', activityRole: 'practice' }],
  }],
});

// Friday 2026-10-02 23:59:59.999 in the school's zone (CDT).
const FRIDAY_END = '2026-10-03T04:59:59.999Z';
const WEDNESDAY_NOON = Date.parse('2026-09-30T17:00:00Z');

// The student's own copy, exactly as App.jsx's assignmentsForViewer builds it.
const forSupported = withStudentSupportDates(lesson, SUPPORTED, extraTimeProfile);
const classDueIso = getAssignmentDate(lesson, 'due').toISOString();

// The providers App.jsx hands the dashboard, bound to the signed-in student.
const providersFor = (studentId) => ({
  assignmentIsForStudent,
  getAssignmentLifecycle: (assignment, nowValue) => getAssignmentLifecycle(assignment, nowValue, { studentId }),
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView: (assignment, viewId, options) => matchesSmartView(assignment, viewId, { ...options, studentId }),
});

const dashboardFor = (studentId, assignments, extra = {}) => buildStudentDashboardModel({
  assignments,
  classId: CLASS_ID,
  classPeriod: 'Period 3',
  nowValue: WEDNESDAY_NOON,
  providers: providersFor(studentId),
  ...extra,
});

const gradeCenterFor = (studentId, assignments, nowValue = WEDNESDAY_NOON) => buildStudentGradeCenter({
  assignments,
  classId: CLASS_ID,
  classPeriod: 'Period 3',
  studentId,
  nowValue,
});

test('the fixture is the case the bug was about: the student is due Friday, the class Thursday', () => {
  assert.equal(getAssignmentDate(forSupported, 'due', SUPPORTED).toISOString(), FRIDAY_END);
  assert.ok(Date.parse(classDueIso) < Date.parse(FRIDAY_END));
  assert.notEqual(formatDateTime(FRIDAY_END), formatDateTime(lesson.dueAt),
    'the two dates must print differently, or nothing below can tell them apart');
});

test('Grades tab and result screen: the entry carries the student\'s own due date', () => {
  const entry = findGradeCenterEntry(gradeCenterFor(SUPPORTED, [forSupported]), 'A1');
  assert.equal(entry.dueAt, FRIDAY_END);
  assert.equal(entry.lateDueAt, FRIDAY_END, 'with no late window, the individualized due is also the last day');
  assert.equal(formatDateTime(entry.dueAt), formatDateTime(FRIDAY_END));

  // A classmate reading the same in-memory copy keeps the class date.
  const classmate = findGradeCenterEntry(gradeCenterFor(CLASSMATE, [forSupported]), 'A1');
  assert.equal(classmate.dueAt, classDueIso);
  assert.equal(formatDateTime(classmate.dueAt), formatDateTime(lesson.dueAt),
    'a student with no individual date sees exactly what the class date always printed');
});

test('Assignments tab: the row carries the student\'s own due date', () => {
  const rowFor = (studentId) => {
    const dashboard = dashboardFor(studentId, [forSupported]);
    const center = buildStudentAssignmentsCenter({
      dashboard,
      gradeCenter: gradeCenterFor(studentId, [forSupported]),
    });
    return center.rows.find((row) => row.assignmentId === 'A1');
  };
  assert.equal(rowFor(SUPPORTED).dueAt, FRIDAY_END);
  assert.equal(rowFor(SUPPORTED).lateDueAt, FRIDAY_END);
  assert.equal(rowFor(CLASSMATE).dueAt, classDueIso);
});

test('Home "Do this next": the card\'s due date comes from the student\'s lifecycle', () => {
  const supportedNext = resolveNextAction({ dashboard: dashboardFor(SUPPORTED, [forSupported]) });
  assert.equal(supportedNext.assignment.id, 'A1');
  assert.equal(supportedNext.dueAt, FRIDAY_END);

  const classmateNext = resolveNextAction({ dashboard: dashboardFor(CLASSMATE, [forSupported]) });
  assert.equal(classmateNext.dueAt, classDueIso);

  // Resumed work reads the dashboard's resume lifecycle.
  const resumed = resolveNextAction({
    dashboard: dashboardFor(SUPPORTED, [forSupported], { resumeAction: { assignmentId: 'A1', questionIndex: 1 } }),
  });
  assert.equal(resumed.kind, 'resume');
  assert.equal(resumed.dueAt, FRIDAY_END);
});

test('every kind of next action carries the due date of the lifecycle it was chosen with', () => {
  const lifecycle = getAssignmentLifecycle(forSupported, WEDNESDAY_NOON, { studentId: SUPPORTED });
  const candidate = { assignment: forSupported, lifecycle, questionsDone: 1, questionsTotal: 2, disabled: false };
  const cases = [
    ['dol', { activeDols: [{ ...candidate, state: { questionIndices: [0] }, records: [] }] }],
    ['warmup', { activeWarmups: [{ ...candidate, questionIndices: [0] }] }],
    ['resume', { resumeAssignment: forSupported, resumeLifecycle: lifecycle, resumeQuestionIndex: 0 }],
    ['inProgress', { groups: { [BUCKET.IN_PROGRESS]: [candidate] } }],
    ['pastDue', { groups: { [BUCKET.PAST_DUE]: [candidate] } }],
    ['dueToday', { groups: { [BUCKET.DO_NOW]: [candidate] } }],
    ['assignedLater', { groups: { [BUCKET.COMING_UP]: [candidate] } }],
  ];
  cases.forEach(([kind, dashboard]) => {
    const next = resolveNextAction({ dashboard });
    assert.equal(next.kind, kind);
    assert.equal(next.dueAt, FRIDAY_END, `${kind}: the card would print the class date`);
  });

  // No lifecycle at all (a hand-built dashboard): the class fields, as before.
  const bare = resolveNextAction({ dashboard: { groups: { [BUCKET.PAST_DUE]: [{ assignment: lesson }] } } });
  assert.equal(bare.dueAt, '2026-10-01');
});

test('an attendance extension is the final date a closed or late row prints', () => {
  const extendedMs = Date.parse('2026-10-07T04:59:59.999Z');
  const withExtension = {
    ...lesson,
    lateDueAt: '2026-10-02',
    studentOverrides: { [CLASSMATE]: { lateDueAt: new Date(extendedMs).toISOString(), extension: { meetingsGranted: 3 } } },
  };
  // Saturday: past the class's final day, inside the extension.
  const saturday = Date.parse('2026-10-03T17:00:00Z');
  const extended = findGradeCenterEntry(gradeCenterFor(CLASSMATE, [withExtension], saturday), 'A1');
  assert.equal(extended.lifecycle.isLate, true);
  assert.equal(Date.parse(extended.lateDueAt), extendedMs,
    '"Late work open until" must name the extension, not the class\'s final day');
  // The extension moves only the final cutoff, never the on-time boundary.
  assert.equal(extended.dueAt, getAssignmentDate(withExtension, 'due').toISOString());

  const after = findGradeCenterEntry(gradeCenterFor(CLASSMATE, [withExtension], Date.parse('2026-10-08T17:00:00Z')), 'A1');
  assert.equal(after.frozen, true);
  assert.equal(Date.parse(after.lateDueAt), extendedMs, '"Closed" names the day it actually closed');

  const other = findGradeCenterEntry(gradeCenterFor('S3', [withExtension], saturday), 'A1');
  assert.equal(other.lateDueAt, getAssignmentDate(withExtension, 'late').toISOString());
});

test('without a readable lifecycle date the class fields pass through unchanged', () => {
  assert.deepEqual(studentDueDates(lesson, null), { dueAt: '2026-10-01', lateDueAt: '2026-10-01' });
  assert.deepEqual(studentDueDates({ dueDate: '2026-10-01', lateDueDate: '2026-10-05' }, { dueAt: null, lateDueAt: new Date(NaN) }),
    { dueAt: '2026-10-01', lateDueAt: '2026-10-05' });
  assert.deepEqual(studentDueDates({}, undefined), { dueAt: null, lateDueAt: null });
});

/*
 * The screens are .jsx, which node cannot render. These contracts pin the one
 * thing each must keep doing: print the date its model resolved, never reach
 * past it to the assignment's class fields.
 */
const read = (path) => executableSource(readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'));
const CLASS_DATE_READ = /assignment\??\.(?:dueAt|dueDate|lateDueAt|lateDueDate)\b/;

test('the "Do this next" card prints the model\'s due date, not the class date', () => {
  const card = read('components/student/WhatShouldIDoNow.jsx');
  assert.match(card, /formatDateTime\(\s*nextAction\.dueAt\s*\)/);
  assert.doesNotMatch(card, CLASS_DATE_READ);
});

test('the Assignments, Grades and result screens print the row\'s dates, not the class dates', () => {
  [
    ['components/student/StudentAssignmentsCenter.jsx', /formatDateTime\(\s*row\.dueAt\s*\)/],
    ['components/student/StudentGradeCenter.jsx', /formatDateTime\(\s*entry\.dueAt\s*\)/],
    ['components/student/StudentAssignmentResult.jsx', /formatDateTime\(\s*entry\.dueAt\s*\)/],
  ].forEach(([path, printsRowDate]) => {
    const source = read(path);
    assert.match(source, printsRowDate, `${path} no longer prints the row's due date`);
    assert.doesNotMatch(source, CLASS_DATE_READ, `${path} reads a class date directly`);
  });
});
