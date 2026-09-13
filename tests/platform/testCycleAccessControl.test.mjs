import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const dashboard = componentSource('src/components/assessment/StudentSecureExamDashboard.jsx');
const card = componentSource('src/components/student/TestCycleCard.jsx');
const controls = componentSource('src/components/teacher/TestCycleControls.jsx');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

/*
 * WHO MAY ENTER A SECURE COURSE TEST, AND WHO MAY RELEASE ITS GRADE.
 *
 * Every case here was a real hole found in review of the first push. They share
 * one shape: a Test Cycle's secure sessions are created for a whole class at
 * once, long before any individual student is eligible to sit them, so
 * "the session exists and is yours" is not the same question as "you may enter
 * it now" — and the second question has exactly one authority, the stage
 * machine.
 */

test('a course-test session is only enterable at the stage the cycle says is open', () => {
  const guard = region(
    functionsIndex,
    'async function assertCourseTestEntryAllowed(',
    'async function teacherOwnedClassIds(',
    'entry guard',
  );
  // It resolves the real stage, with real review progress, and demands both the
  // matching secure stage AND canEnter.
  assert.match(guard, /resolveTestCycleStage/);
  assert.match(guard, /reviewProgress: testCycleLib\.reviewProgress\(assignment, tracker\)/);
  assert.match(guard, /state\?\.stage !== expectedStage \|\| state\.canEnter !== true/);
  // A simulation carries no courseTest block and is untouched.
  assert.match(guard, /if \(!courseTest\?\.assignmentId\) return;/);
});

test('the gate runs on start AND on resume, before the session can change state', () => {
  const start = region(
    functionsIndex,
    'exports.startSecureExamSession = onCall(',
    'exports.listStudentSecureExamSessions',
    'startSecureExamSession',
  );
  // Before the transaction, so the resume path (which returns an in-progress
  // session early) cannot slip past it.
  const beforeTransaction = start.slice(0, start.indexOf('db.runTransaction'));
  assert.match(beforeTransaction, /assertCourseTestEntryAllowed/);
});

test('a finished secure session still hands back its recorded screen', () => {
  // The gate answers "may you enter this?". A terminal session cannot be sat
  // again by anyone, so turning it into an error would only take the "Exam
  // recorded" screen away from a student who has already submitted.
  const guard = region(
    functionsIndex,
    'async function assertCourseTestEntryAllowed(',
    'async function teacherOwnedClassIds(',
    'entry guard',
  );
  assert.match(guard, /if \(secureExam\.TERMINAL_STATES\.has\(session\.status\)\) return;/);
});

test('a secure session replaced by a teacher reset is not enterable', () => {
  const guard = region(
    functionsIndex,
    'async function assertCourseTestEntryAllowed(',
    'async function teacherOwnedClassIds(',
    'entry guard',
  );
  assert.match(guard, /currentSessionId && currentSessionId !== session\.examSessionId/);
  assert.match(guard, /replaced by your teacher/);
});

test('the Tests & Exams list hands a course test to its assignment card', () => {
  // A Start button on this screen would be a way into a Test the student has
  // not unlocked — the list has no idea which stage is open.
  assertCapability(
    dashboard,
    [/onOpenCourseTest\?\.\(session\.courseTest\?\.assignmentId\)/],
    'a course test must hand off to its assignment card.',
  );
  assert.match(dashboard, /isCourseTest\(session\) && !canReview \?/);
  assert.match(app, /onOpenCourseTest=\{\(assignmentId\) => startAssignment\(assignmentId\)\}/);
});

test('releasing a course test requires the teacher of record for that class', () => {
  const guard = region(
    functionsIndex,
    'async function assertMayProctorCourseTest(',
    'async function courseTestSessionIsCurrent(',
    'proctor guard',
  );
  assert.match(guard, /if \(!secureExam\.isCourseTestSession\(session\)\) return;/);
  assert.match(guard, /ownedClassIds\.has\(classId\)/);
  assert.match(guard, /permission-denied/);

  const proctor = region(
    functionsIndex,
    'exports.proctorExamAction = onCall(',
    '// --- Test Cycle',
    'proctorExamAction',
  );
  // Checked before the transaction, so an unauthorized release never runs.
  const beforeTransaction = proctor.slice(0, proctor.indexOf('db.runTransaction'));
  assert.match(beforeTransaction, /assertMayProctorCourseTest\(db, request, proctorSession\)/);
});

test('the root administrator is not filtered, and every other teacher is', () => {
  const owned = region(
    functionsIndex,
    'async function teacherOwnedClassIds(',
    'async function assertMayProctorCourseTest(',
    'owned classes',
  );
  assert.match(owned, /if \(authLib\.isRootAdminEmail\(email\)\) return null;/);
  assert.match(owned, /where\("teacherOfRecord", "==", email\)/);
  assert.match(owned, /A verified teacher email is required/);
});

test('the proctor monitor does not show another class their course tests', () => {
  const list = region(
    functionsIndex,
    'exports.listProctorExamSessions = onCall(',
    'function releasedExamEvidence(',
    'listProctorExamSessions',
  );
  assert.match(list, /!secureExam\.isCourseTestSession\(session\)/);
  assert.match(list, /ownedClassIds\.has\(String\(session\.classId \|\| ""\)\)/);
});

test('a superseded session cannot be released over the replacement attempt', () => {
  const proctor = region(
    functionsIndex,
    'exports.proctorExamAction = onCall(',
    '// --- Test Cycle',
    'proctorExamAction',
  );
  assert.match(proctor, /courseTestSessionIsCurrent\(db, proctorSession\)/);
  assert.match(proctor, /replaced by a reset/);

  // And the release helper refuses independently: a stale score reaching the
  // record is not something a student can recover from.
  const release = region(
    functionsIndex,
    'async function applyTestCycleFeedbackRelease(',
    'async function syncTestCycleSessionState',
    'release',
  );
  assert.match(release, /currentSessionId && currentSessionId !== session\.examSessionId\) return null;/);

  // So does the state mirror, so a superseded session cannot move the card.
  const sync = region(
    functionsIndex,
    'async function syncTestCycleSessionState(',
    'async function issueCourseTestQuestion(',
    'sync',
  );
  assert.match(sync, /current\.examSessionId && current\.examSessionId !== session\.examSessionId\) return;/);
});

test('batch assignment cannot reach outside the assignment audience', () => {
  const assign = region(
    functionsIndex,
    'exports.assignTestCycleSessions = onCall(',
    'exports.preflightTestCycleAssignment',
    'assignTestCycleSessions',
  );
  // A requested class must BE one of the assignment's assigned classes. The
  // teacher screen passes whichever class is active, which is not the same
  // thing as the class this cycle was assigned to.
  assert.match(assign, /if \(requestedClassId && !audienceClassIds\.includes\(requestedClassId\)\)/);
  assert.match(assign, /not assigned this Test Cycle/);
  // Named students are checked, not trusted.
  assert.match(assign, /studentMatchesAssignmentAudience\(\{ assignment, classId: data\?\.classId \|\| null \}\)/);
  // And the default audience is the assignment's own.
  assert.match(assign, /requestedClassId \? \[requestedClassId\] : audienceClassIds/);
});

test('a completed cycle opens the released secure review it advertises', () => {
  // "Review Test" and "Review Retest" are enterable actions. Falling through to
  // onExit would have made the advertised action a way of leaving the screen.
  assertCapability(card, [/<SecureExamReview/], 'a completed cycle must open the released review.');
  assert.match(card, /examSessionId=\{card\.reviewExamSessionId\}/);
  const enter = region(card, 'const enter = ', '};', 'enter');
  assert.match(enter, /if \(card\.reviewExamSessionId\) return setMode\('review'\);/);
  // The server names which session that review is of.
  const payload = region(
    functionsIndex,
    'exports.getStudentTestCycle = onCall(',
    'function studentVisibleCorrectionPlan(',
    'getStudentTestCycle',
  );
  assert.match(payload, /reviewExamSessionId: record\.retest\.state === shared\.record\.SESSION_STATE\.RELEASED/);
});

test('reset names the session it is throwing away', () => {
  // One "Reset session" control had to pick a default stage, and the default
  // was the Test — so resetting a student's Retest force-submitted the Test and
  // cleared its released score instead.
  assert.match(controls, /Reset Test session/);
  assert.match(controls, /Reset Retest session/);
  assert.match(controls, /teacherTestCycleAction\(\{ assignmentId, studentId: row\.studentId, action, stage \}\)/);
  assert.doesNotMatch(executableSource(controls), /'resetSecureSession', 'Reset session'/);
});

test('a reset that clears a released score is recorded in the grade history', () => {
  const action = region(
    functionsIndex,
    'exports.teacherTestCycleAction = onCall(',
    'exports.listTeacherTestCycleRecords',
    'teacherTestCycleAction',
  );
  assert.match(action, /appendTestCycleGradeHistory/);
  assert.match(action, /GRADE_HISTORY_REASON\.TEACHER_OVERRIDE/);
  assert.match(action, /Teacher reset the secure \$\{stage\} session/);
});
