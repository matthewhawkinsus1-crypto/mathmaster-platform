import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASSROOM_STUDENT_SESSION_TTL_MS,
  classroomSessionIsExpired,
  isClassroomLaunchSearch,
  nextClassroomSessionExpiry,
  shouldPromoteClassroomStudentSession,
} from '../../src/auth/classroomSession.js';

test('Classroom launch detection requires an actual MathMaster launch assignment', () => {
  assert.equal(isClassroomLaunchSearch('?launch=lesson-7&classroomSection=classwork'), true);
  assert.equal(isClassroomLaunchSearch('?classroomSection=classwork'), false);
  assert.equal(isClassroomLaunchSearch(''), false);
});

test('only non-remembered students entering from Classroom get a temporary cross-tab session', () => {
  assert.equal(shouldPromoteClassroomStudentSession({
    role: 'student',
    search: '?launch=lesson-7&classroomSection=practice',
    rememberDevice: false,
  }), true);

  assert.equal(shouldPromoteClassroomStudentSession({
    role: 'student',
    search: '',
    rememberDevice: false,
  }), false);

  assert.equal(shouldPromoteClassroomStudentSession({
    role: 'teacher',
    search: '?launch=lesson-7',
    rememberDevice: false,
  }), false);

  assert.equal(shouldPromoteClassroomStudentSession({
    role: 'student',
    search: '?launch=lesson-7',
    rememberDevice: true,
  }), false);
});

test('temporary Classroom session lease is two hours and expires deterministically', () => {
  const now = Date.parse('2026-09-09T14:00:00.000Z');
  const expiresAt = nextClassroomSessionExpiry(now);

  assert.equal(expiresAt, now + CLASSROOM_STUDENT_SESSION_TTL_MS);
  assert.equal(classroomSessionIsExpired(expiresAt, expiresAt - 1), false);
  assert.equal(classroomSessionIsExpired(expiresAt, expiresAt), true);
  assert.equal(classroomSessionIsExpired(null, expiresAt + 1), false);
});
