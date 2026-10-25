// TT23 — A SUPPORT-PROFILE CHANGE RE-SENDS THE CLASSROOM GRADES IT MOVED,
// AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-profile-resend \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/profileChangeClassroomResend.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// Saving a support profile writes `grades/{id}.profile` and nothing else. A
// reduced-item-count accommodation added to, or taken off, work that is still
// open changes which items the student owes, and so the grade MathMaster shows,
// but neither Classroom trigger looked at the profile: Classroom kept the old
// grade until the next answer. This drives BOTH real triggers (whole
// assignment, section columns) with the Classroom API stubbed, the way the
// pacing test does, and holds:
//
//   * the profile change re-sends exactly the columns whose grade it moved,
//     with the grade MathMaster now shows;
//   * it only corrects a grade Classroom already holds: an assignment that was
//     never pushed gets nothing, and no audit row is invented for it;
//   * nothing is sent when the grade is the same: an unrelated edit, work the
//     student has already answered in full, the same profile written again;
//   * taking the reduction off sends the grade back the other way, the grade
//     the gradebook already shows.
// The pure rules are pinned in tests/platform/profileChangeClassroomResend.test.mjs.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  db, patchGradeCalls, repo, resetClassroomCalls, runClassroomSync,
} from './canonicalPersistenceHarness.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';

const requireFromFunctions = createRequire(path.join(repo, 'functions/index.js'));
const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const sectionEntry = requireFromFunctions('./classroomSectionEntry.js');

const P = 'profresend';
const TEACHER = 'profresend.teacher@desotoisd.org';
const TEACHER_UID = `uid-${TEACHER}`;
const CLASS = `${P}-class`;
const STUDENT = `${P}-student`;
const DAY = 86_400_000;

// Three open assignments of twenty Classwork questions each.
//   SYNCED  pushed to Classroom at 30%: six of twenty answered
//   FRESH   the same work, never pushed
//   FULL    every question answered, pushed at 100%
const SYNCED = `${P}-synced`;
const FRESH = `${P}-fresh`;
const FULL = `${P}-full`;
const COURSE = `${P}-course`;
const PUBLICATION = (assignmentId) => ({ id: `${assignmentId}-pub`, courseworkId: `${assignmentId}-cw` });
const SECTION = { id: `${SYNCED}-pub-classwork`, courseworkId: `${SYNCED}-cw-classwork` };

/* --- the profiles ---------------------------------------------------------- */

const REDUCED = 'reduced-item-count-same-rigor';
const today = new Date().toISOString().slice(0, 10);
const revision = ({ n, percent = null, others = [] }) => ({
  id: `r${n}`,
  revisionId: `r${n}`,
  revision: n,
  status: 'active',
  effectiveStart: today,
  createdAtMs: Date.now() - (10 - n) * 1000,
  accommodations: [
    ...(percent === null ? [] : [{ id: REDUCED, params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo: [] }]),
    ...others.map((id) => ({ id, params: {}, appliesTo: [] })),
  ],
  modifications: [],
});
const profileOf = (revisions) => buildSupportProjection({ revisions, todayKey: today });
const NONE = profileOf([revision({ n: 1 })]);
const REDUCED_25 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 })]);
const REDUCED_25_WITH_READ_ALOUD = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 }), revision({ n: 3, percent: 25, others: ['text-to-speech'] })]);
const TAKEN_OFF = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 }), revision({ n: 3 })]);

/* --- the fixture ----------------------------------------------------------- */

const items = (id, count) => Array.from({ length: count }, (_, index) => ({
  questionId: `${id}-q${index}`,
  id: `${id}-q${index}`,
  type: 'literal',
  activityRole: 'classwork',
  prompt: `Solve ${index}`,
  solveFor: 'y',
  acceptedAnswers: ['4'],
  standard: index % 2 ? 'A.5A' : 'A.5B',
  dok: 2,
}));
const assignmentDoc = (id) => ({
  title: id,
  assignedClassIds: [CLASS],
  schemaVersion: 5,
  releaseAt: new Date(Date.now() - DAY).toISOString(),
  dueAt: new Date(Date.now() + DAY).toISOString(),
  lateDueAt: new Date(Date.now() + 2 * DAY).toISOString(),
  sections: [{ id: `${id}-section`, role: 'classwork', title: 'Classwork', questions: items(id, 20) }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
});
const answered = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  String(index), { status: 'correct', attemptCount: 1, totalAttempts: 1 },
]));
const trackers = () => ({ [SYNCED]: answered(6), [FRESH]: answered(6), [FULL]: answered(20) });

const gradeRef = db.collection('grades').doc(STUDENT);
const gradeDocument = (profile) => ({
  displayName: STUDENT,
  classId: CLASS,
  classPeriod: 'Period 1',
  status: 'active',
  profile,
  gradesByAssignment: trackers(),
  assignmentActivity: Object.fromEntries([SYNCED, FRESH, FULL].map((id) => [id, { totalTimeSeconds: 1800 }])),
});
const audit = async (publicationId) => {
  const snapshot = await db.doc(`classroomGradeSyncs/${gradeSyncDocumentId(publicationId, STUDENT)}`).get();
  return snapshot.exists ? snapshot.data() : null;
};
const pushedBefore = (publicationId, { grade, stage, sectionKey = 'whole' }) => db
  .doc(`classroomGradeSyncs/${gradeSyncDocumentId(publicationId, STUDENT)}`)
  .set({ publicationId, studentId: STUDENT, status: 'synced', stage, grade, maxPoints: 100, studentVisible: false, returnedToStudent: false, sectionKey });

/** Save a new profile the way the editor does (profile only), then run a trigger on the change. */
const saveProfile = async (profile) => {
  const beforeData = (await gradeRef.get()).data();
  await gradeRef.update({ profile });
  return { beforeData, after: await gradeRef.get() };
};
const runWhole = async (change) => runClassroomSync(STUDENT, change.beforeData);
const runSection = async (change) => sectionEntry.cloudFunctions.syncSectionGradeToClassroom.run({
  params: { studentId: STUDENT },
  data: { before: { exists: true, data: () => change.beforeData }, after: change.after },
});
const patched = () => patchGradeCalls().map((call) => [call.courseWorkId, call.grade]);

const cleanup = async () => {
  for (const name of ['classes', 'grades', 'assignments', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || String(doc.data()?.studentId || '').startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
};

before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS).set({ name: 'Profile resend — Period 1', period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  for (const id of [SYNCED, FRESH, FULL]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('assignments').doc(id).set(assignmentDoc(id));
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomLinks').doc(PUBLICATION(id).id).set({
      schemaVersion: 2, publicationId: PUBLICATION(id).id, assignmentId: id, courseId: COURSE, courseName: COURSE,
      courseworkId: PUBLICATION(id).courseworkId, teacherUid: TEACHER_UID, status: 'published', maxPoints: 100,
      sectionKey: 'whole', publicationKind: 'assignment',
    });
  }
  await db.collection('classroomLinks').doc(SECTION.id).set({
    schemaVersion: 2, publicationId: SECTION.id, assignmentId: SYNCED, courseId: COURSE, courseName: COURSE,
    courseworkId: SECTION.courseworkId, teacherUid: TEACHER_UID, status: 'published', maxPoints: 100,
    sectionKey: 'classwork', publicationKind: 'section', gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
  });
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE, STUDENT)).set({
    courseId: COURSE, studentId: STUDENT, googleUserId: `google-${STUDENT}`,
  });
  await gradeRef.set(gradeDocument(NONE));
  // What Classroom already holds: 6 of 20 at 30%, and a finished assignment at
  // 100%. FRESH was never pushed.
  await pushedBefore(PUBLICATION(SYNCED).id, { grade: 30, stage: 'progress-25' });
  await pushedBefore(PUBLICATION(FULL).id, { grade: 100, stage: 'final-complete' });
  await pushedBefore(SECTION.id, { grade: 30, stage: 'progress-25', sectionKey: 'classwork' });
});

after(cleanup);

test('adding a reduction corrects the one column Classroom holds, to the grade MathMaster now shows', async () => {
  resetClassroomCalls();
  const change = await saveProfile(REDUCED_25);
  await runWhole(change);
  // Six answered of 15 owed, not of 20: 40%, not 30%. Nothing else is sent:
  // the never-pushed assignment gets no first grade from a profile change, and
  // the finished one owes the same items it always did.
  assert.deepEqual(patched(), [[PUBLICATION(SYNCED).courseworkId, 40]]);
  const row = await audit(PUBLICATION(SYNCED).id);
  assert.equal(row.status, 'synced');
  assert.equal(row.grade, 40);
  assert.equal(await audit(PUBLICATION(FRESH).id), null, 'no audit row is invented for a column that was never pushed');
  assert.equal((await audit(PUBLICATION(FULL).id)).grade, 100);
});

test('the section column follows, and only that column', async () => {
  resetClassroomCalls();
  // The same change, seen by the section trigger: its column was pushed at 30%.
  const change = { beforeData: { ...gradeDocument(NONE) }, after: await gradeRef.get() };
  await runSection(change);
  assert.deepEqual(patched(), [[SECTION.courseworkId, 40]]);
  assert.equal((await audit(SECTION.id)).grade, 40);
});

test('the same profile written again sends nothing', async () => {
  resetClassroomCalls();
  const change = { beforeData: (await gradeRef.get()).data(), after: await gradeRef.get() };
  await runWhole(change);
  await runSection(change);
  assert.deepEqual(patched(), []);
});

test('an unrelated profile edit sends nothing', async () => {
  resetClassroomCalls();
  const change = await saveProfile(REDUCED_25_WITH_READ_ALOUD);
  await runWhole(change);
  await runSection(change);
  assert.deepEqual(patched(), []);
  assert.equal((await audit(PUBLICATION(SYNCED).id)).grade, 40, 'Classroom still holds what it was last sent');
});

test('taking the reduction off sends the grade back the other way: it is the grade the gradebook shows', async () => {
  resetClassroomCalls();
  const change = await saveProfile(TAKEN_OFF);
  await runWhole(change);
  assert.deepEqual(patched(), [[PUBLICATION(SYNCED).courseworkId, 30]]);
  resetClassroomCalls();
  await runSection(change);
  assert.deepEqual(patched(), [[SECTION.courseworkId, 30]]);
  assert.equal((await audit(PUBLICATION(SYNCED).id)).grade, 30);
});

test('a column whose last push failed is left for the teacher to retry, not re-sent by a profile change', async () => {
  await db.doc(`classroomGradeSyncs/${gradeSyncDocumentId(PUBLICATION(SYNCED).id, STUDENT)}`).set({ status: 'failed' }, { merge: true });
  resetClassroomCalls();
  const change = await saveProfile(REDUCED_25);
  await runWhole(change);
  assert.deepEqual(patched(), []);
  assert.equal((await audit(PUBLICATION(SYNCED).id)).status, 'failed');
});
