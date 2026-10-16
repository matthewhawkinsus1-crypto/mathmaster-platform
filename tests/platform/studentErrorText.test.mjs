/*
 * NAV-11 (student pass 3): one student-friendly error translator with a named
 * way out; no raw "internal" or "Firebase Functions log" on sign-in; a Test
 * Cycle card that cannot load is never a dead end; a Classroom link that
 * cannot open says so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUDENT_ERROR_TEXT, describeStudentError, studentSafeSentence } from '../../src/platform/student/studentErrorText.js';
import { LEVEL } from '../../src/platform/student/navigationModel.js';
import { describeAuthError } from '../../src/auth/authErrorText.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('NAV-11: an unanswered request reads "Can\'t reach MathMaster", with Try again and a way out', () => {
  for (const error of [
    { code: 'functions/internal', message: 'internal' },
    { code: 'functions/unavailable', message: 'unavailable' },
    { code: 'functions/deadline-exceeded', message: 'deadline-exceeded' },
    new TypeError('Failed to fetch'),
  ]) {
    const described = describeStudentError(error, { level: LEVEL.TEST_CYCLE });
    assert.equal(described.text, STUDENT_ERROR_TEXT.offline, JSON.stringify(error));
    assert.equal(described.retry, true);
    assert.equal(described.exit.label, 'Back to My assignments');
  }
});

test('NAV-11: a refusal keeps the server\'s student sentence and offers no retry; developer words never show', () => {
  const refused = describeStudentError({ code: 'functions/failed-precondition', message: 'Your teacher has paused this assessment. It is not open right now, and nothing you have done was lost.' });
  assert.match(refused.text, /^Your teacher has paused this assessment/);
  assert.equal(refused.retry, false);
  assert.equal(refused.exit.level, LEVEL.HOME, 'no level: Home is the way out');
  const leak = describeStudentError({ code: 'functions/failed-precondition', message: 'Firestore index missing; check the Firebase Functions log.' });
  assert.equal(leak.text, STUDENT_ERROR_TEXT.generic);
  assert.equal(studentSafeSentence('internal'), '');
  assert.equal(studentSafeSentence('TypeError: x is undefined'), '');
  assert.equal(studentSafeSentence('That code has expired. Ask your teacher for the current code.'), 'That code has expired. Ask your teacher for the current code.');
});

test('NAV-11: after two failed tries, Try again stops and the student is told it is not theirs to fix', () => {
  const third = describeStudentError({ code: 'functions/internal', message: 'internal' }, { level: LEVEL.TEST_CYCLE, retryCount: 2 });
  assert.equal(third.retry, false);
  assert.match(third.exhaustedMessage, /not something you did/);
});

test('NAV-11: sign-in never shows a bare code or "check the Firebase Functions log"', () => {
  assert.equal(describeAuthError({ code: 'functions/internal', message: 'internal' }), "Can't reach MathMaster right now. Check the Wi-Fi and try again.");
  assert.equal(describeAuthError({ code: 'functions/unavailable', message: 'unavailable' }), "Can't reach MathMaster right now. Check the Wi-Fi and try again.");
  assert.equal(describeAuthError({ code: 'functions/not-found', message: 'not-found' }), 'Something went wrong. Try again.');
  // A specific server sentence still wins ("3 attempts left").
  assert.equal(describeAuthError({ code: 'functions/permission-denied', message: 'That code is not right. 3 attempts left.' }), 'That code is not right. 3 attempts left.');
  const text = executableSource(read('src/auth/authErrorText.js'));
  assert.doesNotMatch(text, /Functions log/);
  assert.match(read('src/auth/authService.js'), /^export \{ describeAuthError \} from '\.\/authErrorText\.js';$/m);
});

test('NAV-11: a Test Cycle card that cannot load says why, offers Try again only while it can help, and a named way out', () => {
  const card = executableSource(read('src/components/student/TestCycleCard.jsx'));
  assert.match(card, /^import \{ describeStudentError \} from '\.\.\/\.\.\/platform\/student\/studentErrorText\.js';$/m);
  assert.match(card, /setError\(describeStudentError\(loadError, \{ level: LEVEL\.TEST_CYCLE, retryCount: failedLoadsRef\.current - 1 \}\)\);/);
  const branch = region(card, 'if (error && !card) {', '\n  }\n');
  assert.match(branch, /\{error\.text\}/);
  assert.doesNotMatch(branch, /\{error\}/, 'never the raw error');
  assert.match(branch, /\{error\.retry && \(\s*<button[^>]*onClick=\{load\}/);
  assert.match(branch, /\{onExit && \(\s*<button[^>]*onClick=\{onExit\}[^>]*>\{exitLabel\}<\/button>/);
});

test('NAV-11: a Classroom link whose assignment is not this student\'s, or that cannot be read, says so', () => {
  const app = executableSource(read('src/App.jsx'));
  assert.match(app, /^import \{ ARRIVAL_MESSAGES, readUrlArrival \} from '\.\/app\/routes\/urlArrival\.js';$/m);
  const effect = region(app, "    if (classroomLaunchInvalid) {", '}, [user?.role, pendingClassroomLaunch, classroomLaunchInvalid, assignments, studentAssignmentControls]);');
  assert.match(effect, /toastInfo\('That Google Classroom link could not be opened'/);
  // Only once the student's lessons have settled — the address's own test.
  assert.match(effect, /const settled = \[STUDENT_CONTROLS_STATUS\.READY, STUDENT_CONTROLS_STATUS\.UNAVAILABLE\]\.includes\(studentAssignmentControls\.status\)\s*&& lastPublishedRef\.current\?\.\[4\] === studentAssignmentControls;\s*if \(!settled\) return;/);
  assert.match(effect, /toastInfo\(ARRIVAL_MESSAGES\.studentStale\.title, ARRIVAL_MESSAGES\.studentStale\.body\);\s*setPendingClassroomLaunch\(null\);/);
  assert.match(app, /console\.error\('Rejected invalid Classroom launch link:', error\);\s*setClassroomLaunchInvalid\(true\);/);
});

test('review note: a server crash ("INTERNAL") is not called a Wi-Fi problem; Review My Work signed out says sign in', async () => {
  assert.match(describeAuthError({ code: 'functions/internal', message: 'INTERNAL' }), /^MathMaster could not finish that\./);
  assert.match(describeAuthError({ code: 'functions/internal', message: 'internal' }), /Wi-Fi/);
  const { describeReviewLoadError, SIGN_IN_AGAIN_TEXT } = await import('../../src/platform/student/reviewMyWorkModel.js');
  assert.deepEqual(describeReviewLoadError({ code: 'functions/unauthenticated', message: 'Sign in before starting My Math Path.' }), { kind: 'refused', text: SIGN_IN_AGAIN_TEXT, retry: false });
});
