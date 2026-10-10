/*
 * THE INTEGRITY-NOTE MIGRATION, AGAINST A REAL FIRESTORE (emulator).
 *
 * scripts/migrate-integrity-override-notes.mjs with the Admin SDK (review of
 * #467, M4 follow-up): a section zero's saved previous override — the
 * teacher's correction a lift puts back — is left exactly as it was, note and
 * actor included, and never fills the incident's note; the section-zero copies
 * lose their note; a correction outside any zero is left alone and reported.
 * Run through npm run test:challenge-finish.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' });
const db = admin.firestore();
const { FieldPath } = createRequire(path.join(repo, 'functions/package.json'))('firebase-admin/firestore');
const { runIntegrityOverrideNoteMigration } = await import(path.join(repo, 'scripts/migrate-integrity-override-notes.mjs'));

const NOW = '2026-10-10T12:00:00.000Z';
const ACTOR = { uid: 'uid-teacher', email: 'teacher@example.test', name: 'Ms. Teacher' };
const CORRECTION = { active: true, score: 50, source: 'teacher-override', note: 'CORRECTION NOTE', actor: ACTOR, updatedAt: NOW };

test('a section zero\'s saved correction survives the migration verbatim and never becomes the incident\'s note', async () => {
  const studentId = 'inm-section';
  const sectionCopy = { active: true, score: 0, persistent: true, source: 'teacher-section-zero', incidentId: 'inm-inc', sectionRole: 'classwork', reasonCode: 'cellPhoneUse', reason: 'Prohibited cellphone use', participantRole: 'individual', actor: ACTOR, at: NOW };
  await db.collection('studentSupportEvents').doc('inm-inc').set({ kind: 'academicIntegrityIncident', authorizedTeacherEmails: ['teacher@example.test'], note: '', evidence: { scope: 'section' } });
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: 'teacher@example.test',
    teacherGradeOverridesByAssignment: {
      A1: {
        0: sectionCopy,
        __sectionIntegrity_classwork: { active: true, incidentId: 'inm-inc', sectionRole: 'classwork', previousOverridesByQuestion: { 0: CORRECTION } },
        // A correction outside any zero, as a control.
        3: CORRECTION,
      },
    },
  });
  const report = await runIntegrityOverrideNoteMigration({ db, FieldPath, mode: 'execute', actor: 'ops@example.test', listIds: true, now: () => NOW });
  assert.equal(report.execution.applied, 1);
  const overrides = (await db.collection('grades').doc(studentId).get()).data().teacherGradeOverridesByAssignment.A1;
  assert.equal(overrides[0].actor, undefined, 'the section-zero copy no longer carries the teacher');
  assert.equal(overrides[0].score, 0);
  assert.deepEqual(overrides.__sectionIntegrity_classwork.previousOverridesByQuestion[0], CORRECTION, 'a lift puts back the correction with its note and actor');
  assert.deepEqual(overrides[3], CORRECTION, 'the control is untouched');
  const incident = (await db.collection('studentSupportEvents').doc('inm-inc').get()).data();
  assert.notEqual(incident.note, 'CORRECTION NOTE', 'the incident\'s note is never the correction\'s');
  assert.equal(JSON.stringify(incident).includes('CORRECTION NOTE'), false);
  const reasons = report.ids.unresolved.filter((entry) => entry.studentId === studentId).map((entry) => entry.reason).sort();
  assert.deepEqual(reasons, ['not-an-integrity-override', 'saved-previous-override']);
});
