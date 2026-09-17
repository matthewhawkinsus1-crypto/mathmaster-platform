import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeAttendanceExtensionActor,
  validateProposedFinalCutoff,
} from '../../functions/shared/attendanceExtensionAuthorization.mjs';

const classRecord = { classId: 'c1', status: 'active', teacherOfRecord: 'ms.smith@school.org' };
const studentRecord = { classId: 'c1', assignedTeacherEmail: 'ms.smith@school.org' };
const assignment = { id: 'a1', assignedClassIds: ['c1'] };

test('the teacher of record for this class may grant an extension for their own student', () => {
  const result = authorizeAttendanceExtensionActor({
    teacherEmail: 'ms.smith@school.org', classRecord, studentRecord, assignment, requestedClassId: 'c1',
  });
  assert.equal(result.authorized, true);
});

test('a different teacher cannot grant an extension for a class they do not teach', () => {
  const result = authorizeAttendanceExtensionActor({
    teacherEmail: 'mr.jones@school.org', classRecord, studentRecord, assignment, requestedClassId: 'c1',
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'permission-denied');
});

test('a student who has since moved to a different class is refused', () => {
  const movedStudent = { ...studentRecord, classId: 'c2' };
  const result = authorizeAttendanceExtensionActor({
    teacherEmail: 'ms.smith@school.org', classRecord, studentRecord: movedStudent, assignment, requestedClassId: 'c1',
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'failed-precondition');
});

test('an assignment not assigned to this class is refused, even for the correct teacher', () => {
  const otherAssignment = { id: 'a2', assignedClassIds: ['c9'] };
  const result = authorizeAttendanceExtensionActor({
    teacherEmail: 'ms.smith@school.org', classRecord, studentRecord, assignment: otherAssignment, requestedClassId: 'c1',
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'failed-precondition');
});

test('an archived class refuses a new extension, even for its own teacher of record', () => {
  const archived = { ...classRecord, status: 'archived' };
  const result = authorizeAttendanceExtensionActor({
    teacherEmail: 'ms.smith@school.org', classRecord: archived, studentRecord, assignment, requestedClassId: 'c1',
  });
  assert.equal(result.authorized, false);
});

test('a missing class, student, or assignment fails closed with not-found, before any role check', () => {
  assert.equal(authorizeAttendanceExtensionActor({ teacherEmail: 'ms.smith@school.org', classRecord: null, studentRecord, assignment, requestedClassId: 'c1' }).reason, 'not-found');
  assert.equal(authorizeAttendanceExtensionActor({ teacherEmail: 'ms.smith@school.org', classRecord, studentRecord: null, assignment, requestedClassId: 'c1' }).reason, 'not-found');
  assert.equal(authorizeAttendanceExtensionActor({ teacherEmail: 'ms.smith@school.org', classRecord, studentRecord, assignment: null, requestedClassId: 'c1' }).reason, 'not-found');
});

test('the root administrator bypasses roster/teacher-of-record checks, but not the assignment-assigned check', () => {
  const wrongClassAssignment = { id: 'a2', assignedClassIds: ['c9'] };
  const asAdmin = authorizeAttendanceExtensionActor({
    isRootAdmin: true, teacherEmail: 'admin@school.org', classRecord, studentRecord: { classId: 'c2' }, assignment, requestedClassId: 'c1',
  });
  assert.equal(asAdmin.authorized, true);
  const stillBlocked = authorizeAttendanceExtensionActor({
    isRootAdmin: true, teacherEmail: 'admin@school.org', classRecord, studentRecord, assignment: wrongClassAssignment, requestedClassId: 'c1',
  });
  assert.equal(stillBlocked.authorized, false);
});

test('a proposed cutoff earlier than what is already on file is rejected server-side, independent of the client', () => {
  const result = validateProposedFinalCutoff({
    proposedLateDueAtMs: Date.parse('2026-09-21T23:59:59Z'),
    currentEffectiveCutoffMs: Date.parse('2026-09-25T23:59:59Z'),
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'failed-precondition');
});

test('a proposed cutoff on or after what is on file is accepted', () => {
  assert.equal(validateProposedFinalCutoff({
    proposedLateDueAtMs: Date.parse('2026-09-25T23:59:59Z'),
    currentEffectiveCutoffMs: Date.parse('2026-09-25T23:59:59Z'),
  }).valid, true);
  assert.equal(validateProposedFinalCutoff({
    proposedLateDueAtMs: Date.parse('2026-10-02T23:59:59Z'),
    currentEffectiveCutoffMs: Date.parse('2026-09-25T23:59:59Z'),
  }).valid, true);
});

test('a first-ever extension (no current cutoff on file) is accepted whenever the proposal itself is a valid instant', () => {
  assert.equal(validateProposedFinalCutoff({ proposedLateDueAtMs: Date.parse('2026-09-25T23:59:59Z'), currentEffectiveCutoffMs: null }).valid, true);
  assert.equal(validateProposedFinalCutoff({ proposedLateDueAtMs: null, currentEffectiveCutoffMs: null }).valid, false);
});
