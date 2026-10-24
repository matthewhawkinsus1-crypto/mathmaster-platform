// A PERMANENTLY DELETED STUDENT LEAVES NOTHING BEHIND (SI06, C1-68).
//
// permanentlyDeleteStudent revokes the student's refresh tokens and deletes
// their roster row, but an ID token already issued stays valid for up to an
// hour. The rules now refuse a student's own writes once the row is gone
// (tests/rules/deletedStudentTokenRules.test.mjs). Two things are proven here:
//
//   - the presence archive (archiveStudentPresenceSnapshot, run as written in
//     functions/index.js against a stand-in) writes no session summary for a
//     student whose roster row is gone. A student deleted while their tab was
//     open leaves a presence document; when the sweep or the deletion removes
//     it, its trigger would otherwise write a durable record of them;
//   - the deletion itself erases the student's unfinished work and delivery
//     trail (checkpoints, drafts, receipts, device reports, persistence
//     acknowledgements), their presence and their Path history, none of which
//     it reached before, and deletes the roster row before presence, so the
//     archive the presence deletion triggers finds no row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { FAKE_FIELD_VALUE, FakeFirestore, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const admin = require('../../functions/lib/admin.js');
const studentSessionSummary = require('../../functions/lib/studentSessionSummary.js');
const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const SUMMARIES = SERVER.match(/^const STUDENT_SESSION_SUMMARY_COLLECTION = "([^"]+)";/m)[1];

const archiveWith = (db) => new Function(
  'getFirestore', 'studentSessionSummary', 'studentIdentity', 'FieldValue', 'STUDENT_SESSION_SUMMARY_COLLECTION',
  `"use strict";\n${topLevelFunction('archiveStudentPresenceSnapshot')}\nreturn archiveStudentPresenceSnapshot;`,
)(
  () => db,
  studentSessionSummary,
  async () => import('../../functions/shared/studentIdentity.mjs'),
  FAKE_FIELD_VALUE,
  SUMMARIES,
);

const live = {
  studentId: 'S-77', name: 'Robin Sample', classId: 'class-a', assignmentId: 'A1',
  startedAt: 1_000, updatedAt: 61_000, answeredCount: 3, correctCount: 2,
};

test('the presence archive writes a session summary for a student on the roster', async () => {
  const db = new FakeFirestore({ grades: { 'S-77': { classId: 'class-a', assignedTeacherEmail: 'teacher.a@desotoisd.org' } } });
  assert.equal(await archiveWith(db)({ live, studentId: 'S-77', observedAt: 61_000 }), true);
  assert.equal(db.writes.filter((write) => write.collection === SUMMARIES).length, 1);
});

test('…and none for a student whose roster row is gone: a deleted student is not archived back into existence', async () => {
  const db = new FakeFirestore({ grades: {} });
  assert.equal(await archiveWith(db)({ live, studentId: 'S-77', observedAt: 61_000 }), false);
  assert.deepEqual(db.writes, [], 'nothing written anywhere');
});

test('permanent deletion erases the student\'s unfinished work, delivery trail, presence and Path history', () => {
  const queried = new Set(admin.STUDENT_QUERY_COLLECTIONS);
  for (const collectionName of [
    'studentResponseCheckpoints',
    'studentWorkspaceDrafts',
    'studentSubmissionReceipts',
    'studentDevicePersistenceReports',
    'studentPersistenceResolutions',
  ]) {
    assert.equal(queried.has(collectionName), true, `${collectionName} must be erased by studentId`);
  }
  const direct = new Set(admin.STUDENT_DIRECT_COLLECTIONS);
  assert.equal(direct.has('presence'), true, 'presence/{studentId}');
  assert.equal(direct.has('pathHistory'), true, 'pathHistory/{studentId}');

  // The roster row goes before the student's own documents, so deleting
  // presence/{studentId} triggers an archive that finds no row (above).
  const deletion = region(SERVER, 'exports.permanentlyDeleteStudent = onCall(', 'await writeAdminAudit(db, actor, "student_permanently_deleted"', 'permanentlyDeleteStudent');
  const rosterDeleted = deletion.indexOf('await recursiveDeleteDocument(db, rosterRef, deleted, "gradesWithSubcollections");');
  const ownDocuments = deletion.indexOf('for (const collectionName of adminPolicy.STUDENT_DIRECT_COLLECTIONS)');
  assert.ok(rosterDeleted > -1 && ownDocuments > -1, 'both steps are still in the deletion');
  assert.ok(rosterDeleted < ownDocuments, 'the roster row is deleted before presence');
});
