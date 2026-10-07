/*
 * THE WEEKLY GRADE A STUDENT SEES IS THE GRADE CLASSROOM GETS.
 *
 * Classroom grades the frozen weekly snapshot as it is stored: no `settings`
 * (so the default grading policy) and its own `dueAt`. The student's panel and
 * the teacher's table grade the client-merged goal — the frozen snapshot with
 * the teacher's LIVE settings spread over it. Without publishedWeeklyGoal, a
 * teacher config carrying a grading policy, or a due day changed after the
 * week froze, would make the student's "Grade so far" disagree with Classroom.
 *
 * Every case below runs the REAL publisher (functions/lib/weeklyPathSync.js)
 * or the exact function it calls, with the completions from the shared
 * completion rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  buildTeacherWeeklyView,
  describeWeeklyGradeForStudent,
  dueAtFor,
  evaluateWeeklyGoalProgress,
  gradeWeeklyGoal,
  normalizeWeeklyGoalConfig,
  publishedWeeklyGoal,
} from '../../src/platform/path/weeklyPathGoal.js';
import { mergeWeeklyGoalSnapshot } from '../../src/platform/path/weeklyPathChoice.js';
import { completionFromPathSession } from '../../functions/shared/weeklyPathCompletion.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { syncWeeklyPathClassWeek } = require('../../functions/lib/weeklyPathSync.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const WEEK = '2026-10-05';
const WEDNESDAY = Date.parse('2026-10-07T15:00:00Z');
const NEXT_MONDAY_NOON = Date.parse('2026-10-12T17:00:00Z');
const display = (key) => String(key).split(':').pop();

const slot = (n, teks) => ({
  slot: n, weeklySlotKey: `${n}|skill-${teks}|${teks}|current|course|2|3`, skillId: `teks:${teks}`, teksCode: teks,
  purpose: 'current', context: 'course', dok: 2, difficultyBand: 3, status: 'notStarted', studentLabel: teks,
});

// Frozen on Monday with the default Sunday due day: the stored document.
const SUNDAY_DUE = dueAtFor(Date.parse(`${WEEK}T15:00:00Z`), { dueDayOfWeek: 0 });
const snapshot = {
  schemaVersion: 2, studentId: 'S1', classId: 'class-a', courseId: 'algebra1', weekKey: WEEK,
  dueAt: SUNDAY_DUE, goalSessions: 3, sessions: [slot(1, 'A.5A'), slot(2, 'A.2C'), slot(3, 'A.3B')],
  assignmentState: 'assigned', createdAt: Date.parse(`${WEEK}T15:00:00Z`),
};

// Mid-week the teacher changed the class settings: a different weighting and a
// Friday due day. The student's proposal is rebuilt with those settings.
const teacherConfig = normalizeWeeklyGoalConfig({
  sessions: 3, dueDayOfWeek: 5, grading: { completionWeight: 0.5, passingGrade: 70 },
});
const proposal = {
  ...snapshot, assignmentState: undefined, createdAt: undefined,
  dueAt: dueAtFor(WEDNESDAY, teacherConfig), settings: teacherConfig,
};
// What the student's panel and the teacher's table actually hold.
const clientGoal = mergeWeeklyGoalSnapshot({ proposed: proposal, snapshot });

// One slot finished at 40% accuracy, one opened and not finished.
const sessionDocs = [
  { id: 'p1', data: { studentId: 'S1', status: 'completed', completedAt: WEDNESDAY - 3600000, weekKey: WEEK, weeklySlotKey: snapshot.sessions[0].weeklySlotKey, weeklySlot: 1, target: { alignmentKey: 'texas:A.5A' }, summary: { completedQuestions: 5, correctQuestions: 2 } } },
  { id: 'p2', data: { studentId: 'S1', status: 'active', weekKey: WEEK, weeklySlotKey: snapshot.sessions[1].weeklySlotKey, weeklySlot: 2, target: { alignmentKey: 'texas:A.2C' }, summary: { completedQuestions: 1, correctQuestions: 1 } } },
];
const completions = sessionDocs
  .map((entry) => completionFromPathSession(entry.id, entry.data, { displayTeks: display }))
  .filter(Boolean);

test('the case is real: the teacher\'s live policy would change the grade', () => {
  assert.equal(completions.length, 1, 'the half-done session is not a completion');
  assert.ok(clientGoal.settings?.grading, 'the merged goal carries the live settings');
  const withLiveSettings = gradeWeeklyGoal({ goal: clientGoal, completions, now: WEDNESDAY }).grade;
  const asPublished = gradeWeeklyGoal({ goal: snapshot, completions, now: WEDNESDAY }).grade;
  assert.notEqual(withLiveSettings, asPublished, 'otherwise this file proves nothing');
});

test('mid-week: "Grade so far" and the teacher table equal the publisher\'s grade function on the stored snapshot', () => {
  const publisher = gradeWeeklyGoal({ goal: snapshot, completions, now: WEDNESDAY });
  const student = describeWeeklyGradeForStudent({ goal: publishedWeeklyGoal(clientGoal), completions, now: WEDNESDAY });
  assert.equal(student.score, Math.round(publisher.grade));
  assert.equal(student.label, 'Grade so far');
  const [row] = buildTeacherWeeklyView([{ studentId: 'S1', goal: clientGoal, completions }], { now: WEDNESDAY });
  assert.equal(row.grade, publisher.grade);
});

test('a due day changed after the freeze applies from next week, on every screen', () => {
  assert.notEqual(proposal.dueAt, SUNDAY_DUE);
  assert.equal(clientGoal.dueAt, SUNDAY_DUE, 'the merged goal keeps the frozen due date');
  const student = evaluateWeeklyGoalProgress({ goal: publishedWeeklyGoal(clientGoal), completions, now: WEDNESDAY });
  const publisher = evaluateWeeklyGoalProgress({ goal: snapshot, completions, now: WEDNESDAY });
  assert.equal(student.daysLeft, publisher.daysLeft);
  assert.equal(student.overdue, publisher.overdue);
});

test('after the week closes: the student\'s grade is the number the real publisher writes to Classroom', async () => {
  const written = [];
  const report = await syncWeeklyPathClassWeek({
    classId: 'class-a', weekKey: WEEK, courseId: 'course-1', enabled: true, maxPoints: 100,
    students: [{ studentId: 'S1', googleUserId: 'g1' }],
    goalsByStudentId: { S1: snapshot }, completionsByStudentId: { S1: completions },
    now: NEXT_MONDAY_NOON, gradeWeeklyGoal,
    findCourseWork: async () => ({ id: 'cw-1' }),
    createCourseWork: async () => ({ id: 'cw-1' }),
    findSubmission: async () => ({ id: 'sub-1' }),
    patchGrade: async ({ grade }) => { written.push(grade); },
    returnSubmission: async () => {},
  });
  assert.equal(report.results[0].published, true);
  const student = describeWeeklyGradeForStudent({ goal: publishedWeeklyGoal(clientGoal), completions, now: NEXT_MONDAY_NOON });
  assert.equal(student.final, true);
  assert.equal(student.score, Math.round(report.results[0].score));
  assert.equal(student.score, Math.round(written[0]));
  const [row] = buildTeacherWeeklyView([{ studentId: 'S1', goal: clientGoal, completions }], { now: NEXT_MONDAY_NOON });
  assert.equal(row.grade, report.results[0].score);
});

test('a week not frozen yet is graded as proposed (there is no published grade to match)', () => {
  const proposed = { ...proposal, assignmentState: 'proposed' };
  assert.equal(publishedWeeklyGoal(proposed), proposed);
  assert.equal(publishedWeeklyGoal(null), null);
});

test('the frozen document carries no settings, which is why the publisher uses the default policy', async () => {
  // If the freeze ever starts storing a policy, publishedWeeklyGoal must keep
  // it rather than strip it — this pins the assumption.
  const { freezeWeeklyPathGoalProposal } = await import('../../functions/shared/weeklyPathSlotAuthority.mjs');
  const frozen = freezeWeeklyPathGoalProposal(
    { ...proposal, sessions: snapshot.sessions },
    { studentId: 'S1', classId: 'class-a', courseId: 'algebra1', canonicalTeks: (code) => `texas:${display(code)}`, displayTeks: display },
  );
  assert.equal('settings' in frozen, false);
});

test('both client screens grade through publishedWeeklyGoal', () => {
  const panel = executableSource(read('src/components/student/WeeklyPathGoalPanel.jsx'));
  assert.match(panel, /describeWeeklyGradeForStudent\(\{ goal: publishedWeeklyGoal\(goal\), completions \}\)/);
  assert.match(panel, /import \{[^}]*\bpublishedWeeklyGoal\b[^}]*\} from '..\/..\/platform\/path\/weeklyPathGoal.js';/);
  const teacher = region(executableSource(read('src/platform/path/weeklyPathGoal.js')), 'export const buildTeacherWeeklyView', 'export default', 'teacher view');
  assert.match(teacher, /gradeWeeklyGoal\(\{ goal: publishedWeeklyGoal\(goal\), completions, now \}\)/);
});
