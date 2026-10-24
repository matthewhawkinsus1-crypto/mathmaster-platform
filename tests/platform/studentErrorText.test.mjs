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

test('NAV-11: after two failed tries, an error that keeps coming back stops offering Try again and the student is told it is not theirs to fix', () => {
  // The server answered something we cannot use, or the program failed: the
  // same button gives the same error, so it is not offered a third time.
  for (const error of [
    new TypeError('e.map is not a function'),
    { code: 'functions/data-loss', message: 'data-loss' },
    // A retryable refusal and an answer with a sentence are answers, not a dropped connection.
    { code: 'functions/failed-precondition', message: 'Your class check did not finish. Try again in a moment.', details: { retry: true } },
    { code: 'functions/deadline-exceeded', message: 'Time was up before your answer arrived, so it was not counted.', details: { retry: true } },
    // The Functions SDK's own sentence for a response it could not read.
    { code: 'functions/internal', message: 'Response is not valid JSON object.' },
  ]) {
    const first = describeStudentError(error, { level: LEVEL.TEST_CYCLE, retryCount: 0 });
    const second = describeStudentError(error, { level: LEVEL.TEST_CYCLE, retryCount: 1 });
    const third = describeStudentError(error, { level: LEVEL.TEST_CYCLE, retryCount: 2 });
    assert.equal(first.retry, true, `${JSON.stringify(error)}: the first failure offers Try again`);
    assert.equal(second.retry, true, `${JSON.stringify(error)}: so does the second`);
    assert.equal(third.retry, false, `${JSON.stringify(error)}: the third does not`);
    assert.match(third.exhaustedMessage, /not something you did/);
  }
});

test('TC17: a request that got no answer keeps Try again however often it fails, and still tells the student it is not theirs to fix', () => {
  // Flaky Wi-Fi: the Functions SDK turns a failed fetch into a bare "internal"
  // (it cannot tell a dropped connection from a backend that never answered),
  // and the browser's own words for a fetch that did not happen.
  for (const error of [
    { code: 'functions/internal', message: 'internal' },
    { code: 'functions/unavailable', message: 'unavailable' },
    { code: 'functions/deadline-exceeded', message: 'deadline-exceeded' },
    new TypeError('Failed to fetch'),
  ]) {
    for (const retryCount of [0, 1, 2, 3, 8]) {
      const described = describeStudentError(error, { level: LEVEL.TEST_CYCLE, retryCount });
      assert.equal(described.text, STUDENT_ERROR_TEXT.offline, JSON.stringify(error));
      assert.equal(described.retry, true, `${JSON.stringify(error)} after ${retryCount} failed tries still offers Try again`);
      assert.equal(described.exit.label, 'Back to My assignments', 'and the way out is still there');
      // The line that tells a student it is not on them still arrives with the limit.
      if (retryCount >= 2) assert.match(described.exhaustedMessage, /not something you did/);
      else assert.equal(described.exhaustedMessage, null);
    }
  }
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
