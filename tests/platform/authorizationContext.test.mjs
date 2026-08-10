import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORIZATION_FIELDS, buildAuthorizationContext, needsAuthorizationBackfill,
  planAuthorizationBackfill, reauthorizeContext, teacherMayRead,
} from '../../functions/shared/authorizationContext.mjs';

const CLASS_A = { classId: 'class-a', teacherOfRecord: 'teacher.a@d.org' };
const CLASS_B = { classId: 'class-b', teacherOfRecord: 'teacher.b@d.org' };

// --- A new record knows who may read it ------------------------------------------

test('a new record carries its class, its teacher, and its origin', () => {
  const context = buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A });
  assert.equal(context.studentId, 'S1');
  assert.equal(context.classId, 'class-a');
  assert.equal(context.originClassId, 'class-a');
  assert.equal(context.originTeacherEmail, 'teacher.a@d.org');
  assert.deepEqual(context.authorizedTeacherEmails, ['teacher.a@d.org']);
  AUTHORIZATION_FIELDS.forEach((field) => {
    assert.ok(field in context, `a new record must carry ${field}`);
  });
});

test('a record for a student with no class is readable by nobody but the administrator', () => {
  const context = buildAuthorizationContext({ studentId: 'S9', classRecord: null });
  assert.equal(context.classId, null);
  assert.deepEqual(context.authorizedTeacherEmails, []);
  assert.equal(teacherMayRead(context, 'teacher.a@d.org'), false);
});

test('emails are stored one way, so a differently-typed address is the same teacher', () => {
  const context = buildAuthorizationContext({ studentId: 'S1', classRecord: { classId: 'c', teacherOfRecord: ' Teacher.A@D.ORG ' } });
  assert.deepEqual(context.authorizedTeacherEmails, ['teacher.a@d.org']);
  assert.equal(teacherMayRead(context, 'TEACHER.A@d.org'), true);
});

// --- History does not move when a timetable does -----------------------------------

test('reassignment rewrites who may read, never what happened', () => {
  const record = buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A });
  const change = reauthorizeContext(record, { classRecord: CLASS_B });

  assert.deepEqual(change, {
    classId: 'class-b',
    authorizedTeacherEmails: ['teacher.a@d.org', 'teacher.b@d.org'],
  });
  // The change set does not contain the origin fields at all, so a caller
  // merging it cannot rewrite history even by accident.
  assert.equal('originClassId' in change, false);
  assert.equal('originTeacherEmail' in change, false);

  const after = { ...record, ...change };
  assert.equal(after.originClassId, 'class-a', 'February work still happened in February\'s class');
  assert.equal(after.originTeacherEmail, 'teacher.a@d.org');
});

test('the new teacher can read the history, and the old teacher does not lose their gradebook', () => {
  const record = { ...buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A }), ...reauthorizeContext(buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A }), { classRecord: CLASS_B }) };
  assert.equal(teacherMayRead(record, 'teacher.b@d.org'), true, 'the current teacher needs the history to teach the child');
  assert.equal(teacherMayRead(record, 'teacher.a@d.org'), true, 'the teacher who was there stays accountable for it');
  assert.equal(teacherMayRead(record, 'teacher.c@d.org'), false);
});

test('a student moved out of every class leaves only the teacher who was there', () => {
  const record = buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A });
  const change = reauthorizeContext(record, { classRecord: null });
  assert.equal(change.classId, null);
  assert.deepEqual(change.authorizedTeacherEmails, ['teacher.a@d.org']);
});

test('a move that changes nothing writes nothing', () => {
  const record = buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A });
  assert.equal(reauthorizeContext(record, { classRecord: CLASS_A }), null, 'a no-op reassignment must not touch a student\'s whole history');
});

test('moving back does not accumulate a longer and longer access list', () => {
  const start = buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A });
  const toB = { ...start, ...reauthorizeContext(start, { classRecord: CLASS_B }) };
  const backToA = { ...toB, ...reauthorizeContext(toB, { classRecord: CLASS_A }) };
  // Origin teacher plus current teacher — and here they are the same person.
  assert.deepEqual(backToA.authorizedTeacherEmails, ['teacher.a@d.org']);
  assert.equal(teacherMayRead(backToA, 'teacher.b@d.org'), false, 'a teacher who no longer teaches them, and did not when the work happened, loses access');
});

// --- Finding and fixing records written before any of this existed -------------------

test('a record with no authorization fields is found by the backfill', () => {
  assert.equal(needsAuthorizationBackfill({}), true);
  assert.equal(needsAuthorizationBackfill({ authorizedTeacherEmails: [] }), true);
  assert.equal(needsAuthorizationBackfill(buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A })), false);
});

test('the backfill plans only what is missing, and says what it found', () => {
  const legacy = { id: 'ev-1' };
  const alreadyDone = { id: 'ev-2', ...buildAuthorizationContext({ studentId: 'S1', classRecord: CLASS_A }) };
  const { updates, report } = planAuthorizationBackfill({
    records: [legacy, alreadyDone],
    studentId: 'S1',
    classRecord: CLASS_A,
  });
  assert.equal(report.scanned, 2);
  assert.equal(report.toUpdate, 1);
  assert.equal(report.alreadyAuthorized, 1);
  assert.equal(updates[0].id, 'ev-1');
  assert.deepEqual(updates[0].fields.authorizedTeacherEmails, ['teacher.a@d.org']);
});

test('the backfill is safe to run twice', () => {
  const legacy = { id: 'ev-1' };
  const first = planAuthorizationBackfill({ records: [legacy], studentId: 'S1', classRecord: CLASS_A });
  const migrated = [{ id: 'ev-1', ...first.updates[0].fields }];
  const second = planAuthorizationBackfill({ records: migrated, studentId: 'S1', classRecord: CLASS_A });
  assert.equal(second.report.toUpdate, 0, 'a second run must change nothing');
});

test('a backfilled record keeps an origin it already had', () => {
  // A record written after origin existed but before the access list did.
  const partial = { id: 'ev-3', originClassId: 'class-old', originTeacherEmail: 'teacher.old@d.org' };
  const { updates } = planAuthorizationBackfill({ records: [partial], studentId: 'S1', classRecord: CLASS_B });
  assert.equal(updates[0].fields.originTeacherEmail, 'teacher.old@d.org', 'a real origin is never overwritten with a guess');
  assert.deepEqual(updates[0].fields.authorizedTeacherEmails, ['teacher.b@d.org', 'teacher.old@d.org']);
});
