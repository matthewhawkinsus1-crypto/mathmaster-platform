/*
 * Releasing quiz/test feedback names everyone still working, by class, and
 * needs an explicit confirm (coordinator QA M3; src/app/teacher/feedbackReleaseHold.js).
 * One release shows worked solutions in every class the assessment is
 * assigned to, so period 1's release must not quietly hand period 3 the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeFeedbackRelease,
  releaseHoldReport,
  studentStillWorking,
  studentsStillWorkingByClass,
} from '../../src/app/teacher/feedbackReleaseHold.js';
import { readReleaseControls } from '../../src/app/teacher/feedbackReleaseControls.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-10T15:00:00Z');
const hours = (n) => new Date(NOW + n * 3600_000).toISOString();
const quiz = (overrides = {}) => ({
  schemaVersion: 5,
  id: 'quiz-1',
  title: 'Unit 2 Quiz',
  assignedClassIds: ['p1', 'p3'],
  dueAt: hours(48),
  lateDueAt: hours(96),
  sections: [
    { id: 'cw', role: 'classwork', title: 'Warm', questions: [{ type: 'algebra', prompt: 'a', equationLatex: 'x=1', activityRole: 'classwork' }] },
    { id: 'quiz', role: 'quiz', title: 'Quiz', questions: [
      { type: 'algebra', prompt: 'q1', equationLatex: 'x=2', activityRole: 'quiz' },
      { type: 'algebra', prompt: 'q2', equationLatex: 'x=3', activityRole: 'quiz' },
    ] },
  ],
  ...overrides,
});
const done = { status: 'correct', totalAttempts: 1 };
const outOfTries = { status: 'expired', totalAttempts: 2 };
const student = (id, classId, period, grades = null, extra = {}) => ({
  id: `9100${id.length}${id}`, firstName: id, lastName: 'Sample', classId, classPeriod: period,
  gradesByAssignment: grades ? { 'quiz-1': grades } : {}, ...extra,
});
const classes = [{ classId: 'p1', name: 'Algebra I — Period 1', period: '1' }, { classId: 'p3', name: 'Algebra I — Period 3', period: '3' }];

test('finished means every required quiz/test item is closed; not started is still working', () => {
  const assignment = quiz();
  assert.equal(studentStillWorking({ assignment, student: student('a', 'p1', '1', { 1: done, 2: outOfTries }), nowValue: NOW }), false);
  assert.equal(studentStillWorking({ assignment, student: student('b', 'p1', '1', { 1: done }), nowValue: NOW }), true, 'one quiz item still open');
  assert.equal(studentStillWorking({ assignment, student: student('c', 'p3', '3'), nowValue: NOW }), true, 'has not taken it yet');
  assert.equal(studentStillWorking({ assignment, student: student('d', 'p3', '3', { 0: done }), nowValue: NOW }), true, 'classwork alone is not the quiz');
  assert.equal(studentStillWorking({ assignment, student: student('e', 'p9', '9'), nowValue: NOW }), false, 'not assigned to their class');
  // Closed for the class: nothing can still be answered.
  assert.equal(studentStillWorking({ assignment: quiz({ dueAt: hours(-48), lateDueAt: hours(-24) }), student: student('c', 'p3', '3'), nowValue: NOW }), false);
  // Excused.
  assert.equal(studentStillWorking({ assignment: quiz({ excusedStudentIds: ['91001c'] }), student: student('c', 'p3', '3'), nowValue: NOW }), false);
});

test('the confirm names everyone still working, grouped by class, and asks for an explicit "Release anyway"', () => {
  const assignment = quiz();
  const stillWorking = studentsStillWorkingByClass({
    assignment,
    classes,
    nowValue: NOW,
    students: [
      student('Ava', 'p1', '1', { 1: done, 2: done }),
      student('Ben', 'p1', '1', { 1: done }),
      student('Cy', 'p3', '3'),
      student('Di', 'p3', '3'),
    ],
  });
  assert.deepEqual(stillWorking.map((group) => [group.label, group.students.map((entry) => entry.name)]), [
    ['Algebra I — Period 1', ['Sample, Ben']],
    ['Algebra I — Period 3', ['Sample, Cy', 'Sample, Di']],
  ]);
  const release = describeFeedbackRelease({ title: assignment.title, stillWorking });
  assert.equal(release.stillWorkingCount, 3);
  assert.equal(release.confirmLabel, 'Release anyway');
  assert.match(release.title, /^3 students have not finished “Unit 2 Quiz”$/);
  assert.match(release.message, /worked solutions to every student who has finished — in every class/);
  assert.match(release.message, /Algebra I — Period 1 \(1\): Sample, Ben/);
  assert.match(release.message, /Algebra I — Period 3 \(2\): Sample, Cy; Sample, Di/);
  const clear = describeFeedbackRelease({ title: assignment.title, stillWorking: [] });
  assert.equal(clear.confirmLabel, 'Release Feedback');
  assert.equal(clear.stillWorkingCount, 0);
});

// --- Review findings (a), (b), (c): nobody still working is left out -----------

// The class's window closed yesterday (no late window); today is Friday noon.
const closedForClass = () => quiz({ dueAt: '2026-10-01', lateDueAt: null });
const FRIDAY_NOON = Date.parse('2026-10-02T17:00:00Z');
const extraTime = buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false,
    accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-09-30',
});

test('(a) a student with extra time is still working after the class window closed', () => {
  const plain = student('Al', 'p1', '1', { 1: done });
  const supported = { ...student('Bo', 'p1', '1', { 1: done }), profile: extraTime };
  assert.equal(studentStillWorking({ assignment: closedForClass(), student: plain, nowValue: FRIDAY_NOON }), false, 'the class is closed');
  assert.equal(studentStillWorking({ assignment: closedForClass(), student: supported, nowValue: FRIDAY_NOON }), true, 'her own window is open');
  const report = releaseHoldReport({ assignment: closedForClass(), privateRecords: {}, students: [plain, supported], classes, nowValue: FRIDAY_NOON });
  const release = describeFeedbackRelease({ title: 'Unit 2 Quiz', ...report });
  assert.equal(release.stillWorkingCount, 1);
  assert.doesNotMatch(release.message, /Every assigned student has finished/);
});

test('(b) a private extension in a class not on screen keeps its student on the list', () => {
  const extended = student('Cy', 'p3', '3', { 1: done });
  const extension = { [extended.id]: { lateDueAt: '2026-10-09T04:59:59.000Z', extension: { dateKey: '2026-10-08', grantedAt: FRIDAY_NOON - 86_400_000 } } };
  const without = releaseHoldReport({ assignment: closedForClass(), privateRecords: {}, students: [extended], classes, nowValue: FRIDAY_NOON });
  assert.equal(without.stillWorking.length, 0, 'without its record the class looks finished');
  const withRecords = releaseHoldReport({ assignment: closedForClass(), privateRecords: extension, students: [extended], classes, nowValue: FRIDAY_NOON });
  assert.deepEqual(withRecords.stillWorking.map((group) => group.label), ['Algebra I — Period 3']);
});

test('(c) a class that could not be checked is named, and never called finished', () => {
  const otherTeachers = quiz({ assignedClassIds: ['p1', 'p5-other-teacher'] });
  const report = releaseHoldReport({ assignment: otherTeachers, privateRecords: {}, students: [student('Al', 'p1', '1', { 1: done, 2: done })], classes, nowValue: NOW });
  assert.deepEqual(report.unchecked.map((entry) => entry.classId), ['p5-other-teacher']);
  const release = describeFeedbackRelease({ title: 'Unit 2 Quiz', ...report });
  assert.equal(release.confirmLabel, 'Release anyway');
  assert.doesNotMatch(release.message, /Every assigned student has finished/);
  assert.match(release.message, /Not checked:\np5-other-teacher: not one of your classes/);
  // Extension records that could not be read leave every class unverified.
  const unread = releaseHoldReport({ assignment: quiz(), privateRecords: null, students: [], classes, nowValue: NOW });
  assert.deepEqual(unread.unchecked.map((entry) => entry.classId), ['p1', 'p3']);
  assert.equal(describeFeedbackRelease({ title: 'Unit 2 Quiz', ...unread }).confirmLabel, 'Release anyway');
});

test('the release reads the extension records of EVERY assigned class, in listener-sized groups', async () => {
  const many = quiz({ assignedClassIds: Array.from({ length: 33 }, (_, index) => `c${index}`) });
  const asked = [];
  const read = async (query) => { asked.push(query); return { docs: [{ data: () => ({ assignmentId: 'quiz-1', studentId: 's1', classId: 'c32', lateDueAt: 'x' }) }] }; };
  const buildQuery = (db, scope) => scope;
  const records = await readReleaseControls({ db: {}, assignment: many, email: 'teacher@example.org', read, buildQuery });
  assert.deepEqual(asked.map((scope) => scope.classIds.length), [30, 3]);
  assert.equal(asked.length, 2, '33 classes are read in two groups');
  assert.ok(records.s1, 'a record from the 33rd class is included');
  const failed = await readReleaseControls({ db: {}, assignment: many, email: 'teacher@example.org', read: async () => { throw new Error('denied'); }, buildQuery });
  assert.equal(failed, null, 'a failed read is reported, never treated as "no extensions"');
});

test('App asks before releasing, with the still-working list, and imports what it calls', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /^import \{ describeFeedbackRelease, releaseHoldReport \} from '\.\/app\/teacher\/feedbackReleaseHold\.js';$/m);
  assert.match(app, /^import \{ readReleaseControls \} from '\.\/app\/teacher\/feedbackReleaseControls\.js';$/m);
  const handler = region(executableSource(app), 'const handleReleaseAssignmentFeedback = async (assignment) => {', 'setFeedbackReleaseBusyId(assignment.id);', 'release handler');
  assert.match(handler, /const privateRecords = await readReleaseControls\(\{/);
  assert.match(handler, /releaseHoldReport\(\{ assignment, privateRecords, students: allStudents, classes, nowValue: Date\.now\(\) \}\)/);
  assert.match(handler, /confirmAction\(\{\s*title: release\.title,\s*message: release\.message,\s*confirmLabel: release\.confirmLabel,\s*\}\)/);
  assert.match(handler, /if \(!proceedWithRelease\) return;/);
});
