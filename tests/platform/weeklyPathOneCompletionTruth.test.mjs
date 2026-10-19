/*
 * ONE COMPLETION TRUTH (student push D, item 1).
 *
 * The student's weekly panel used to count any session with one finalized
 * answer as a finished weekly session, while the teacher table and the Google
 * Classroom publisher counted only `pathSessions` with status "completed". A
 * student one question into a five-question session saw the slot ticked, a
 * "Grade so far" and the 🎉 that Classroom would never receive.
 *
 * These tests pin the one rule (functions/shared/weeklyPathCompletion.mjs) and
 * that all three readers go through it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  collectWeeklyPathSessions,
  completionFromPathSession,
  inProgressFromPathSession,
  weeklyCompletionWindow,
} from '../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress, describeWeeklyGradeForStudent, gradeWeeklyGoal } from '../../functions/shared/weeklyPathGrade.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const WEEK = '2026-10-05';
const MON = Date.parse(`${WEEK}T15:00:00Z`);
const display = (key) => String(key).split(':').pop();

const slot = (n, teks = 'A.5A') => ({ slot: n, weeklySlotKey: `${n}|skill|${teks}|current|course|2|3`, teksCode: teks, context: 'course' });
const goal = {
  weekKey: WEEK, goalSessions: 2, assignmentState: 'assigned', dueAt: MON + 6 * 86400000,
  sessions: [slot(1), slot(2, 'A.2C')],
};
const session = (overrides = {}) => ({
  studentId: 's1', status: 'active', weekKey: WEEK, weeklySlotKey: slot(1).weeklySlotKey, weeklySlot: 1,
  requiredQuestions: 5, target: { alignmentKey: 'texas:A.5A' },
  summary: { completedQuestions: 1, correctQuestions: 1 }, createdAt: MON, updatedAt: MON + 1000,
  ...overrides,
});

test('a session with one answered question is NOT a completion; it is in progress', () => {
  const active = session();
  assert.equal(completionFromPathSession('p1', active, { displayTeks: display }), null);
  const resume = inProgressFromPathSession('p1', active, { displayTeks: display });
  assert.equal(resume.weeklySlotKey, slot(1).weeklySlotKey);
  assert.equal(resume.answeredQuestions, 1);
  assert.equal(resume.requiredQuestions, 5);

  const { completions, inProgress } = collectWeeklyPathSessions({ sessions: [{ id: 'p1', data: active }], weekKey: WEEK, displayTeks: display });
  assert.deepEqual(completions, []);
  assert.equal(inProgress.length, 1);
  // The student panel and Classroom grade are computed from these completions,
  // so a half-done session can show no tick, no 🎉 and no completion credit.
  const progress = evaluateWeeklyGoalProgress({ goal, completions, now: MON + 2000 });
  assert.equal(progress.completed, 0);
  assert.equal(progress.complete, false);
});

test('a completed session counts, and the student and Classroom grade read the same number', () => {
  const done = session({ status: 'completed', completedAt: MON + 5000, summary: { completedQuestions: 5, correctQuestions: 4 } });
  const { completions } = collectWeeklyPathSessions({ sessions: [{ id: 'p1', data: done }], weekKey: WEEK, displayTeks: display });
  assert.equal(completions.length, 1);
  assert.equal(completions[0].accuracy, 0.8);
  assert.equal(completions[0].teksCode, 'A.5A');
  const now = MON + 6000;
  const student = describeWeeklyGradeForStudent({ goal, completions, now });
  const classroom = gradeWeeklyGoal({ goal, completions, now });
  assert.equal(student.score, classroom.grade ?? classroom.score);
  assert.equal(student.completed, 1);
});

test('the window is the publisher window: the week plus the Sunday-evening day', () => {
  const window = weeklyCompletionWindow(WEEK);
  assert.equal(window.end - window.start, 8 * 86400000);
  assert.equal(weeklyCompletionWindow('not-a-week'), null);
  const late = session({ status: 'completed', completedAt: window.end + 1 });
  const early = session({ status: 'completed', completedAt: window.start - 1 });
  const { completions } = collectWeeklyPathSessions({ sessions: [{ id: 'a', data: late }, { id: 'b', data: early }], weekKey: WEEK });
  assert.deepEqual(completions, []);
});

test('the same session returned by two queries is counted once', () => {
  const done = session({ status: 'completed', completedAt: MON + 5000 });
  const { completions } = collectWeeklyPathSessions({ sessions: [{ id: 'p1', data: done }, { id: 'p1', data: done }], weekKey: WEEK });
  assert.equal(completions.length, 1);
});

test('teacher table, Classroom publisher and the student callable all use the shared rule', () => {
  const source = executableSource(read('functions/index.js'));
  const teacher = region(source, 'exports.getTeacherWeeklyPathCompletions', 'exports.getWeeklyPathClassroomSync', 'teacher callable');
  assert.match(teacher, /weeklyCompletion\.completionFromPathSession\(/);
  assert.doesNotMatch(teacher, /status\s*!==\s*"completed"/, 'the teacher table must not keep its own completion rule');
  assert.match(teacher, /weeklyCompletionWindow\(weekKey\)/);

  const classroom = region(source, 'async function loadWeeklyPathClassWeek', 'async function runWeeklyPathClassroomSync', 'classroom loader');
  assert.match(classroom, /weeklyCompletion\.completionFromPathSession\(/);
  assert.doesNotMatch(classroom, /status\s*!==\s*"completed"/);

  const student = region(source, 'exports.getMyWeeklyPathCompletions', 'exports.getTeacherWeeklyPathCompletions', 'student callable');
  assert.match(student, /requireStudent\(request\)/, 'a student reads only their own sessions');
  assert.match(student, /\.where\("studentId", "==", studentId\)/);
  assert.match(student, /collectWeeklyPathSessions\(/);
});

test('the student weekly panel counts server completions, not evidence events', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.doesNotMatch(app, /deriveCompletionsFromEvidence/, 'evidence events are not weekly completions');
  assert.match(app, /fetchMyWeeklyPathCompletions\(\{ weekKey/);
  assert.match(app, /import \{[^}]*fetchMyWeeklyPathCompletions[^}]*\} from '..\/..\/platform\/path\/pathStore.js'/);
  // The simulator counts its synthetic sessions with the same collector.
  assert.match(app, /collectWeeklyPathSessions\(\{ sessions: sessionProvider\.listPathSessions/);
  const runtime = read('src/platform/simulation/teacherPathRuntime.js');
  assert.match(runtime, /listPathSessions: \(\) =>/);
  assert.match(runtime, /session\.status = 'completed';\s*\n\s*session\.completedAt = Date\.now\(\);/);
});

test('Home reads the same server completions, and App.jsx imports what it calls', () => {
  const app = executableSource(read('src/App.jsx'));
  const call = app.indexOf('fetchMyWeeklyPathCompletions({ weekKey: currentWeekKey })');
  assert.ok(call > 0, 'Home weekly status must use server completions');
  assert.match(app, /import \{[^}]*\bfetchMyWeeklyPathCompletions\b[^}]*\} from '.\/platform\/path\/pathStore.js'/s);
  assert.doesNotMatch(app, /deriveCompletionsFromEvidence\(/);
});

test('a half-done weekly session keeps Resume and cannot be swapped mid-session', () => {
  const panel = executableSource(read('src/components/student/WeeklyPathGoalPanel.jsx'));
  // The "do this next" session is marked on its own card, so it resumes an
  // opened session exactly as every card does: through `active`.
  const cards = region(panel, '<SessionCard', '/>', 'session cards');
  assert.match(cards, /active=\{done\.has\(session\.slot\) \? null : inProgressForSlot\(inProgress, session\)\}/);
  assert.match(cards, /isNext=\{session\.slot === next\?\.slot\}/, 'the next session is one of the cards');
  // Done and opened slots render no swap control. (Further conditions may
  // also hide it, e.g. while the week's sessions are still loading.)
  assert.match(panel, /\{!done && !active &&[^<{}]*<SlotChoice/);
  assert.match(panel, /`Resume session \$\{session\.slot\}/);
});
