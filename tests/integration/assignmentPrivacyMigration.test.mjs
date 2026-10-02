// The assignment-privacy migration, run for real against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-privacy-migration \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/assignmentPrivacyMigration.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY. `migrateAssignmentPrivacy` rewrites live documents: it moves every
// attendance extension's private details (absence dates, the granting teacher,
// meeting counts) off the shared `assignments/{id}` document into a private
// record under the student (F-PRIV-1). The planner is unit-tested
// (tests/platform/assignmentPrivacy.test.mjs); this runs the real exported
// callable — paging, transactions, deterministic grant ids — and proves what
// an operator relies on:
//   * a dry run (the default) reports and writes nothing;
//   * a run moves the details losslessly (verbatim copy) and leaves the
//     deadline untouched;
//   * a second run changes nothing and creates no duplicate;
//   * paging reaches assignments past the first page;
//   * the read-scope switch reads, turns on and off, and is audited;
//   * nobody but the root administrator can run either.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const { ADMIN_AUDIT_COLLECTION } = require(path.join(repo, 'functions/lib/auth.js'));
const db = admin.firestore();

const ROOT = { auth: { uid: 'privacy-migration-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } }, rawRequest: { headers: {} } };
const TEACHER = { auth: { uid: 'privacy-migration-teacher', token: { role: 'teacher', email: 'teacher.a@example.test', email_verified: true } }, rawRequest: { headers: {} } };
const STUDENT = { auth: { uid: 'privacy-migration-student', token: { role: 'student', studentId: 'pm-student-1' } }, rawRequest: { headers: {} } };
const call = (fn, who, data = {}) => functionsIndex[fn].run({ ...who, data });

const PREFIX = 'pm-';
const details = {
  dateKey: '2026-10-08',
  meetingsGranted: 2,
  meetingsRequested: 2,
  undetermined: false,
  resolved: true,
  sourceAbsenceDates: ['2026-10-02', '2026-10-01'],
  grantedByEmail: 'former.teacher@example.test',
  grantedAt: 1759300000000,
  // A key this version does not know about must still survive the move.
  futureField: 'kept verbatim',
};

const fresh = async () => {
  const assignments = await db.collection('assignments').where(admin.firestore.FieldPath.documentId(), '>=', PREFIX).where(admin.firestore.FieldPath.documentId(), '<', `${PREFIX}~`).get();
  await Promise.all(assignments.docs.map((entry) => entry.ref.delete()));
  for (const id of ['pm-student-1', 'pm-student-2', 'pm-student-3']) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(db.collection('grades').doc(id)).catch(() => {});
  }
  await db.collection('platformFlags').doc('assignmentReadScope').delete().catch(() => {});

  await db.collection('grades').doc('pm-student-1').set({ classId: 'pm-class-a', assignedTeacherEmail: 'teacher.a@example.test', status: 'active' });
  await db.collection('grades').doc('pm-student-2').set({ classId: 'pm-class-a', assignedTeacherEmail: 'teacher.a@example.test', status: 'active' });
  await db.collection('grades').doc('pm-student-3').set({ classId: 'pm-class-b', assignedTeacherEmail: 'teacher.b@example.test', status: 'active' });
  await db.collection('assignments').doc('pm-a1').set({
    title: 'Class A lesson',
    assignedClassIds: ['pm-class-a'],
    studentOverrides: {
      'pm-student-1': { lateDueAt: '2026-10-09T04:59:59.999Z', extension: details },
      // Already minimal: must be left exactly as it is.
      'pm-student-2': { lateDueAt: '2026-10-10T04:59:59.999Z', extension: { dateKey: '2026-10-09', grantedAt: 1759400000000 } },
    },
  });
  // Many assignments, so the run has to page past the first 200; the last one
  // (sorted by id) carries details.
  const batch = db.batch();
  for (let index = 0; index < 205; index += 1) {
    batch.set(db.collection('assignments').doc(`pm-filler-${String(index).padStart(3, '0')}`), { title: `Filler ${index}`, assignedClassIds: ['pm-class-a'] });
  }
  await batch.commit();
  await db.collection('assignments').doc('pm-zz-last').set({
    title: 'Class B lesson',
    assignedClassIds: ['pm-class-b'],
    studentOverrides: { 'pm-student-3': { lateDueAt: '2026-10-11T04:59:59.999Z', extension: { ...details, grantedByEmail: 'teacher.b@example.test' } } },
  });
};

const grant = async (studentId, assignmentId) => (await db.collection('grades').doc(studentId)
  .collection('attendanceExtensionGrants').doc(`legacy__${assignmentId}`).get());
const overrides = async (assignmentId) => (await db.collection('assignments').doc(assignmentId).get()).data().studentOverrides;

await fresh();

test('only the root administrator can run the migration or the switch', async () => {
  for (const who of [TEACHER, STUDENT]) {
    await assert.rejects(call('migrateAssignmentPrivacy', who), (error) => error.code === 'permission-denied');
    await assert.rejects(call('setAssignmentReadScope', who, { studentListScoped: true }), (error) => error.code === 'permission-denied');
  }
  await assert.rejects(call('migrateAssignmentPrivacy', { auth: null, rawRequest: { headers: {} } }), (error) => error.code === 'unauthenticated');
});

test('a dry run (the default) reports what it would move and writes nothing', async () => {
  const before = await overrides('pm-a1');
  const report = await call('migrateAssignmentPrivacy', ROOT);
  assert.equal(report.dryRun, true);
  assert.equal(report.extensionsMinimized, 2, 'student 1 on pm-a1 and student 3 on the last page');
  assert.equal(report.grantRecordsCreated, 2);
  assert.ok(report.assignmentsScanned >= 207, `paged through every assignment (${report.assignmentsScanned})`);
  assert.deepEqual(report.failures, []);
  assert.equal(report.sharedDocumentsClean, false, 'a dry run that found details does not call the documents clean');
  assert.deepEqual(await overrides('pm-a1'), before, 'nothing on the shared document changed');
  assert.equal((await grant('pm-student-1', 'pm-a1')).exists, false, 'no private record was written');
});

test('a run moves the details off the shared document, verbatim, and keeps the deadline', async () => {
  const report = await call('migrateAssignmentPrivacy', ROOT, { dryRun: false });
  assert.equal(report.dryRun, false);
  assert.equal(report.extensionsMinimized, 2);
  assert.equal(report.grantRecordsCreated, 2);
  assert.deepEqual(report.failures, []);

  const shared = await overrides('pm-a1');
  assert.deepEqual(shared['pm-student-1'].extension, { dateKey: '2026-10-08', grantedAt: 1759300000000 }, 'only the stub stays shared');
  assert.equal(shared['pm-student-1'].lateDueAt, '2026-10-09T04:59:59.999Z', 'the deadline a reader needs is untouched');
  assert.deepEqual(shared['pm-student-2'], { lateDueAt: '2026-10-10T04:59:59.999Z', extension: { dateKey: '2026-10-09', grantedAt: 1759400000000 } }, 'an already-minimal entry is untouched');

  const record = (await grant('pm-student-1', 'pm-a1')).data();
  assert.deepEqual(record.legacyExtension, details, 'every key that left the shared document is kept, verbatim');
  assert.deepEqual(record.sourceAbsenceDates, ['2026-10-01', '2026-10-02']);
  assert.equal(record.studentId, 'pm-student-1');
  assert.equal(record.assignmentId, 'pm-a1');
  assert.equal(record.source, 'migrated-from-assignment');
  assert.deepEqual([...record.authorizedTeacherEmails].sort(), ['former.teacher@example.test', 'teacher.a@example.test'], 'readable by the granting teacher and the teacher of record');

  const last = (await grant('pm-student-3', 'pm-zz-last')).data();
  assert.deepEqual(last.authorizedTeacherEmails, ['teacher.b@example.test'], 'a teacher who is both is listed once');
  assert.deepEqual((await overrides('pm-zz-last'))['pm-student-3'].extension, { dateKey: '2026-10-08', grantedAt: 1759300000000 }, 'the last page was reached and minimized');

  const audits = await db.collection(ADMIN_AUDIT_COLLECTION).where('action', '==', 'assignment_privacy_migrated').get();
  assert.ok(audits.size >= 1, 'the run is in the admin audit');
});

test('a second run changes nothing and duplicates nothing', async () => {
  const sharedBefore = await overrides('pm-a1');
  const recordBefore = (await grant('pm-student-1', 'pm-a1')).data();
  const report = await call('migrateAssignmentPrivacy', ROOT, { dryRun: false });
  assert.equal(report.extensionsMinimized, 0);
  assert.equal(report.grantRecordsCreated, 0);
  assert.equal(report.sharedDocumentsClean, true);
  assert.deepEqual(await overrides('pm-a1'), sharedBefore);
  assert.deepEqual((await grant('pm-student-1', 'pm-a1')).data(), recordBefore);
  const grants = await db.collection('grades').doc('pm-student-1').collection('attendanceExtensionGrants').get();
  assert.equal(grants.size, 1, 'exactly one private record per moved extension');
  const dry = await call('migrateAssignmentPrivacy', ROOT);
  assert.equal(dry.sharedDocumentsClean, true, 'a dry run now reports the shared documents clean');
});

test('the read-scope switch reads as off, turns on and off, and is audited', async () => {
  assert.deepEqual(await call('setAssignmentReadScope', ROOT), { studentListScoped: false, changed: false }, 'absent means off');
  assert.deepEqual(await call('setAssignmentReadScope', ROOT, { studentListScoped: true }), { studentListScoped: true, changed: true });
  assert.equal((await db.collection('platformFlags').doc('assignmentReadScope').get()).data().studentListScoped, true);
  assert.equal((await call('migrateAssignmentPrivacy', ROOT)).studentListScoped, true, 'the migration report shows the switch');
  assert.deepEqual(await call('setAssignmentReadScope', ROOT, { studentListScoped: false }), { studentListScoped: false, changed: true });
  const actions = (await db.collection(ADMIN_AUDIT_COLLECTION).where('target', '==', 'assignmentReadScope').get()).docs.map((entry) => entry.data().action);
  assert.ok(actions.includes('assignment_read_scope_enforced') && actions.includes('assignment_read_scope_relaxed'));
  assert.deepEqual(await call('setAssignmentReadScope', ROOT, { studentListScoped: 'yes' }), { studentListScoped: false, changed: false }, 'anything but a boolean only reads');
});
