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
  studentStillWorking,
  studentsStillWorkingByClass,
} from '../../src/app/teacher/feedbackReleaseHold.js';
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

test('App asks before releasing, with the still-working list, and imports what it calls', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /^import \{ describeFeedbackRelease, studentsStillWorkingByClass \} from '\.\/app\/teacher\/feedbackReleaseHold\.js';$/m);
  const handler = region(executableSource(app), 'const handleReleaseAssignmentFeedback = async (assignment) => {', 'setFeedbackReleaseBusyId(assignment.id);', 'release handler');
  assert.match(handler, /studentsStillWorkingByClass\(\{ assignment, students: allStudents, classes, nowValue: Date\.now\(\) \}\)/);
  assert.match(handler, /confirmAction\(\{\s*title: release\.title,\s*message: release\.message,\s*confirmLabel: release\.confirmLabel,\s*\}\)/);
  assert.match(handler, /if \(!proceedWithRelease\) return;/);
});
