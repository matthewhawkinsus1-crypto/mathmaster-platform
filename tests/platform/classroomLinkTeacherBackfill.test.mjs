// STAMPING THE TEACHER ON A CLASSROOM PUBLICATION THAT RECORDS NONE: THE PLAN.
//
// scripts/backfill-classroom-link-teachers.mjs is for the owner to run, read-only
// report first. Its decisions are here, pure: which link gets which teacher,
// which is left for review because its grade passback would move to another
// Google connection, which is left alone and why, and the re-check inside the
// write's transaction that makes a second run, or an overlap, write nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIONS,
  REASONS,
  assignedClassIds,
  isWritten,
  linkTeacherUid,
  parseArgs,
  planLinkTeacher,
  stampFields,
  stillStamp,
} from '../../scripts/lib/classroomLinkTeacherBackfill.mjs';

const classesById = new Map([
  ['c-amy-1', { teacherOfRecord: 'Amy@School.test' }],
  ['c-amy-2', { teacherOfRecord: 'amy@school.test ' }],
  ['c-ben', { teacherOfRecord: 'ben@school.test' }],
  ['c-nobody', { teacherOfRecord: '' }],
  ['c-gone', null],
]);
const uidByEmail = new Map([['amy@school.test', 'uid-amy'], ['ben@school.test', '']]);
const original = (migratedToUid) => ({ exists: true, migratedToUid });
const plan = (assignment, originalConnection = original('uid-amy'), link = { assignmentId: 'A1' }) => planLinkTeacher({
  link, assignment, classesById, uidByEmail, originalConnection,
});

test('a link whose classes share one signed-in teacher is stamped with that teacher when its passback keeps its connection', () => {
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1', 'c-amy-2'] }), {
    action: ACTIONS.STAMP, reason: REASONS.TEACHER_HOLDS_ORIGINAL_CONNECTION, teacherUid: 'uid-amy',
  }, 'the same address, however it was typed');
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1'] }, { exists: false }), {
    action: ACTIONS.STAMP, reason: REASONS.ORIGINAL_CONNECTION_GONE, teacherUid: 'uid-amy',
  });
});

test('a link whose passback would move to the teacher\'s own connection is for review, not stamped by default', () => {
  for (const connection of [original('uid-someone-else'), original(''), original(undefined)]) {
    const decided = plan({ assignedClassIds: ['c-amy-1'] }, connection);
    assert.deepEqual(decided, { action: ACTIONS.REVIEW, reason: REASONS.PASSBACK_WOULD_MOVE, teacherUid: 'uid-amy' }, JSON.stringify(connection));
    assert.equal(isWritten(decided), false);
    assert.equal(isWritten(decided, { includeReview: true }), true);
  }
});

test('a link with no one teacher to give it is left as it is, and says why', () => {
  assert.deepEqual(plan(null), { action: ACTIONS.LEAVE, reason: REASONS.ASSIGNMENT_MISSING });
  assert.deepEqual(plan({}), { action: ACTIONS.LEAVE, reason: REASONS.ASSIGNMENT_NOT_ASSIGNED });
  assert.deepEqual(plan({ assignedClassIds: [' ', ''] }), { action: ACTIONS.LEAVE, reason: REASONS.ASSIGNMENT_NOT_ASSIGNED });
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1', 'c-ben'] }), { action: ACTIONS.LEAVE, reason: REASONS.SEVERAL_TEACHERS });
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1', 'c-nobody'] }), { action: ACTIONS.LEAVE, reason: REASONS.CLASS_WITHOUT_TEACHER });
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1', 'c-gone'] }), { action: ACTIONS.LEAVE, reason: REASONS.CLASS_WITHOUT_TEACHER });
  assert.deepEqual(plan({ assignedClassIds: ['c-amy-1', 'c-unknown'] }), { action: ACTIONS.LEAVE, reason: REASONS.CLASS_WITHOUT_TEACHER });
  assert.deepEqual(plan({ assignedClassIds: ['c-ben'] }), { action: ACTIONS.LEAVE, reason: REASONS.TEACHER_NEVER_SIGNED_IN });
  for (const left of [plan(null), plan({ assignedClassIds: ['c-ben'] })]) {
    assert.equal(isWritten(left), false);
    assert.equal(isWritten(left, { includeReview: true }), false, 'not even with --include-review');
  }
});

test('a link that records a teacher is never planned', () => {
  const decided = plan({ assignedClassIds: ['c-amy-1'] }, original('uid-amy'), { assignmentId: 'A1', teacherUid: 'uid-ben' });
  assert.deepEqual(decided, { action: null, reason: 'already-recorded' });
  assert.equal(isWritten(decided, { includeReview: true }), false);
  assert.equal(linkTeacherUid({ teacherUid: ' uid-ben ' }), 'uid-ben');
  assert.equal(linkTeacherUid({}), '');
  assert.deepEqual(assignedClassIds({ assignedClassIds: ['a', ' a ', 'b', '', null] }), ['a', 'b']);
});

test('inside the write\'s transaction: written only if the link is unchanged and the plan is the same', () => {
  const planned = { linkId: 'L1', assignmentId: 'A1', teacherUid: 'uid-amy', action: ACTIONS.STAMP };
  const replanned = { action: ACTIONS.STAMP, reason: REASONS.TEACHER_HOLDS_ORIGINAL_CONNECTION, teacherUid: 'uid-amy' };
  const current = { assignmentId: 'A1', courseId: 'C1' };
  assert.equal(stillStamp({ current, planned, replanned }), true);
  // The second run, or a publish that claimed the link meanwhile.
  assert.equal(stillStamp({ current: { ...current, teacherUid: 'uid-amy' }, planned, replanned }), false);
  assert.equal(stillStamp({ current: { ...current, teacherUid: 'uid-ben' }, planned, replanned }), false);
  assert.equal(stillStamp({ current: null, planned, replanned }), false, 'deleted since the report');
  assert.equal(stillStamp({ current: { ...current, assignmentId: 'A2' }, planned, replanned }), false);
  // The class changed hands, or the original connection moved, since the report.
  assert.equal(stillStamp({ current, planned, replanned: { ...replanned, teacherUid: 'uid-ben' } }), false);
  assert.equal(stillStamp({ current, planned, replanned: { action: ACTIONS.LEAVE, reason: REASONS.SEVERAL_TEACHERS } }), false);
  const review = { action: ACTIONS.REVIEW, reason: REASONS.PASSBACK_WOULD_MOVE, teacherUid: 'uid-amy' };
  assert.equal(stillStamp({ current, planned, replanned: review }), false);
  assert.equal(stillStamp({ current, planned, replanned: review, includeReview: true }), true);
  assert.equal(stillStamp({ current, planned, replanned: { ...replanned, teacherUid: '' } }), false);
});

test('a stamp writes the teacher and its provenance, nothing else', () => {
  assert.deepEqual(stampFields({ teacherUid: 'uid-amy', reason: REASONS.TEACHER_HOLDS_ORIGINAL_CONNECTION, now: Date.parse('2026-11-17T10:00:00.000Z') }), {
    teacherUid: 'uid-amy',
    teacherUidBackfilledAt: '2026-11-17T10:00:00.000Z',
    teacherUidBackfillReason: REASONS.TEACHER_HOLDS_ORIGINAL_CONNECTION,
  });
});

test('the options: a project is required, the report is the default, and the dangerous ones need --execute', () => {
  assert.throws(() => parseArgs([]), /--project <id> is required/);
  assert.deepEqual(parseArgs(['--project', 'p1']), { help: false, project: 'p1', execute: false, yes: false, includeReview: false, reportPath: null });
  assert.equal(parseArgs(['--project', 'p1', '--execute', '--include-review']).includeReview, true);
  assert.throws(() => parseArgs(['--project', 'p1', '--include-review']), /only makes sense with --execute/);
  assert.throws(() => parseArgs(['--project', 'p1', '--yes']), /only makes sense with --execute/);
  assert.throws(() => parseArgs(['--project', 'p1', '--execute', '--yes'], {}), /refusing --yes/);
  assert.equal(parseArgs(['--project', 'p1', '--execute', '--yes'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' }).yes, true);
  assert.throws(() => parseArgs(['--project']), /needs a value/);
  assert.throws(() => parseArgs(['--project', 'p1', '--everything']), /Unknown option/);
  assert.throws(() => parseArgs(['p1']), /Unexpected argument/);
  assert.deepEqual(parseArgs(['--help']), { help: true });
});
