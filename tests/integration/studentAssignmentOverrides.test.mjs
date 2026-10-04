// A STUDENT'S PRIVATE ASSIGNMENT CONTROLS, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-overrides \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/studentAssignmentOverrides.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The pure resolver, merge and planners are pinned in
// tests/platform/studentAssignmentOverrides.test.mjs and the rules in
// tests/rules/studentAssignmentOverrideRules.test.mjs. This file runs the REAL
// exported Cloud Functions against the emulator and proves what production
// relies on:
//
//   * the teacher of record grants an extension, an attempt, an excusal and a
//     reopen through the callables — nobody else can;
//   * submission ingestion and the deadline finalizer honour the stored private
//     controls and ignore every forged or legacy-shaped claim in a payload;
//   * offline work captured inside the window still counts when it arrives late;
//   * Recovery and Classroom passback use the student's own cutoff;
//   * every one of those server answers is the same whether the control sits
//     on the shared copy alone, on both, or in the private record alone;
//   * the staged migration: dry run, backfill (idempotent, resumable after an
//     interruption), strip (refused until the shared copy is retired; archives
//     first), the absorber, and restore — with every student's effective access
//     identical before and after;
//   * a class move re-authorizes the record. (Deleting a student also deletes
//     their Auth account, which this Firestore-only emulator cannot serve;
//     that path is pinned in the unit suite.)
//
// Every id here starts with `sao-`, and every migration call is scoped to that
// prefix: integration files share one emulator and run in parallel, and
// tests/integration/assignmentPrivacyMigration.test.mjs counts the whole
// collection. For the same reason no fixture carries a pre-#415 extension
// with its absence details (that suite counts those); that path reuses the
// #415 planner and is pinned in the unit suite.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  db, fns, patchGradeCalls, refusal, repo, resetClassroomCalls, runClassroomSync, studentRequest, teacherRequest,
} from './canonicalPersistenceHarness.mjs';
import {
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION,
  ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION,
  legacyStudentIds,
  resolveStudentOverride,
  sharedAssignmentIsClean,
  studentAssignmentOverrideId,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { stripAssignment } from '../../functions/shared/studentAssignmentOverrideStore.mjs';
import { assignmentFinalCloseAt } from '../../functions/shared/sectionDeadline.mjs';
import { resolveTeacherGrantedExtraAttempts } from '../../functions/shared/attemptPolicy.mjs';

const require = createRequire(import.meta.url);
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));

const P = 'sao-';
const TEACHER_A = 'sao.teacher.a@desotoisd.org';
const TEACHER_B = 'sao.teacher.b@desotoisd.org';
const CLASS_A = `${P}class-a`;
const CLASS_B = `${P}class-b`;
const S1 = `${P}s1`; // gets an attendance extension
const S2 = `${P}s2`; // classmate, no controls
const S3 = `${P}s3`; // another class
const CLOSED = `${P}closed`; // class final cutoff passed yesterday
const OPEN = `${P}open`; // open now, with a DOL question
const DAY = 86_400_000;
const NOW = Date.now();

const rootRequest = (data) => ({
  auth: { uid: 'sao-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const question = (assignmentId, index, activityRole, accepted) => ({
  questionId: `${assignmentId}-q${index}`,
  id: `${assignmentId}-q${index}`,
  type: 'literal',
  activityRole,
  prompt: `Question ${index}`,
  solveFor: 'y',
  acceptedAnswers: [accepted],
});

const closedAssignment = (id = CLOSED) => ({
  title: 'Closed lesson',
  assignedClassIds: [CLASS_A],
  schemaVersion: 5,
  releaseAt: new Date(NOW - 3 * DAY).toISOString(),
  dueAt: new Date(NOW - 2 * DAY).toISOString(),
  lateDueAt: new Date(NOW - DAY).toISOString(),
  sections: [
    { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [question(id, 0, 'classwork', '2x+1'), question(id, 1, 'classwork', 'x+5')] },
    { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [question(id, 2, 'dol', '9')] },
  ],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  dol: { enabled: true, minutesBeforeEnd: 10 },
});

const openAssignment = (id = OPEN) => ({
  title: 'Open lesson with a DOL',
  assignedClassIds: [CLASS_A],
  schemaVersion: 5,
  releaseAt: new Date(NOW - DAY).toISOString(),
  dueAt: new Date(NOW + DAY).toISOString(),
  lateDueAt: new Date(NOW + 2 * DAY).toISOString(),
  sections: [
    { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [question(id, 0, 'dol', '9')] },
    { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [question(id, 1, 'classwork', 'x+5')] },
  ],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  dol: { enabled: true, minutesBeforeEnd: 10 },
});

const envelope = ({ actionId, assignmentId, questionIndex, activityRole = 'classwork', value, capturedAt = Date.now(), previousTotalAttempts = 0, extra = {} }) => ({
  schemaVersion: 1,
  actionId,
  kind: 'ordinarySubmission',
  assignmentId,
  questionIndex,
  questionId: `${assignmentId}-q${questionIndex}`,
  variantIndex: 0,
  activityRole,
  capturedAt,
  previousTotalAttempts,
  record: { totalAttempts: previousTotalAttempts + 1, attemptCount: previousTotalAttempts + 1, status: 'attempted' },
  response: { kind: 'scalar', type: 'literal', value, fields: [] },
  capturedSectionAccess: null,
  hasClassworkGrade: activityRole === 'classwork',
  hasDolGrade: activityRole === 'dol',
  ...extra,
});

const ingest = async (studentId, submissions) => (await fns.ingestStudentSubmissions.run(studentRequest(studentId, { submissions }))).receipts;
const overrideDoc = (studentId, assignmentId) => db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(studentAssignmentOverrideId(studentId, assignmentId));
const readOverride = async (studentId, assignmentId) => (await overrideDoc(studentId, assignmentId).get()).data() || null;
const readAssignment = async (assignmentId) => (await db.collection('assignments').doc(assignmentId).get()).data() || {};
const readRecord = async (studentId, assignmentId, index) => ((await db.collection('grades').doc(studentId).get()).data()?.gradesByAssignment?.[assignmentId]?.[String(index)]) || {};
const events = async (studentId) => (await db.collection('grades').doc(studentId).collection(ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const setStorage = (sharedRetired) => fns.setAssignmentOverrideStorage.run(rootRequest({ sharedRetired }));
const migrate = (data) => fns.migrateStudentAssignmentOverrides.run(rootRequest({ assignmentIdPrefix: P, ...data }));
const controls = (data) => fns.setStudentAssignmentControls.run(teacherRequest({ assignmentId: OPEN, classId: CLASS_A, ...data }, TEACHER_A));

const teardown = async () => {
  for (const name of ['assignments', 'classes', STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION, ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION, 'studentSubmissionReceipts', 'studentResponseCheckpoints', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || doc.id.includes(`:${P}`) || String(doc.data()?.studentId || '').startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
  for (const id of [S1, S2, S3, `${P}moved`, `${P}deleted`]) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(db.collection('grades').doc(id)).catch(() => {});
  }
  await db.collection('platformFlags').doc('assignmentOverrideStorage').delete().catch(() => {});
};

before(async () => {
  await teardown();
  await db.collection('classes').doc(CLASS_A).set({ name: 'SAO Period 1', period: 'Period 1', teacherOfRecord: TEACHER_A, status: 'active', course: 'algebra1' });
  await db.collection('classes').doc(CLASS_B).set({ name: 'SAO Period 2', period: 'Period 2', teacherOfRecord: TEACHER_B, status: 'active', course: 'algebra1' });
  for (const [id, classId, teacher] of [[S1, CLASS_A, TEACHER_A], [S2, CLASS_A, TEACHER_A], [S3, CLASS_B, TEACHER_B]]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(id).set({
      displayName: id, classId, classPeriod: classId === CLASS_A ? 'Period 1' : 'Period 2',
      assignedTeacherEmail: teacher, status: 'active', gradesByAssignment: {},
      assignmentActivity: { [CLOSED]: { totalTimeSeconds: 1800 } },
    });
  }
  await db.collection('assignments').doc(CLOSED).set(closedAssignment());
  await db.collection('assignments').doc(OPEN).set(openAssignment());
});

after(async () => {
  await teardown();
});

/* ------------------------------------------------------------------ writers */

test('7. the teacher of record grants an extension: the private record holds it, and the shared copy mirrors it while the switch is off', async () => {
  const proposed = NOW + 2 * DAY;
  const result = await fns.applyStudentAttendanceExtension.run(teacherRequest({
    classId: CLASS_A, studentId: S1, assignmentId: CLOSED, proposedLateDueAtMs: proposed,
    extension: { dateKey: '2099-01-01', meetingsGranted: 2, sourceAbsenceDates: ['2026-09-01'] },
  }, TEACHER_A));
  assert.equal(result.lateDueAt, new Date(proposed).toISOString());

  const record = await readOverride(S1, CLOSED);
  assert.equal(record.lateDueAt, new Date(proposed).toISOString());
  assert.equal(record.extension.dateKey, '2099-01-01');
  assert.deepEqual(record.authorizedTeacherEmails, [TEACHER_A]);
  assert.equal(record.classId, CLASS_A);
  assert.equal(record.revision, 1);
  assert.equal(JSON.stringify(record).includes('sourceAbsenceDates'), false, 'the student-readable record carries no reasons');
  // The previous release still reads the shared copy: it says the same thing.
  const shared = await readAssignment(CLOSED);
  assert.deepEqual(shared.studentOverrides[S1], { lateDueAt: record.lateDueAt, extension: record.extension });
  // Who and why: the staff history and the private grant record.
  const history = await events(S1);
  assert.equal(history.length, 1);
  assert.equal(history[0].kind, 'attendanceExtension');
  assert.equal(history[0].actorEmail, TEACHER_A);
  const grants = await db.collection('grades').doc(S1).collection('attendanceExtensionGrants').get();
  assert.equal(grants.size, 1);
  assert.deepEqual(grants.docs[0].data().sourceAbsenceDates, ['2026-09-01']);
});

test('4. nobody but the teacher of record (or the root admin) can grant one', async () => {
  const proposal = { classId: CLASS_A, studentId: S2, assignmentId: CLOSED, proposedLateDueAtMs: NOW + 9 * DAY, extension: {} };
  assert.equal((await refusal(fns.applyStudentAttendanceExtension.run(teacherRequest(proposal, TEACHER_B))))?.code, 'permission-denied');
  assert.equal((await refusal(fns.applyStudentAttendanceExtension.run(studentRequest(S2, proposal))))?.code, 'permission-denied');
  assert.equal((await refusal(fns.applyStudentAttendanceExtension.run({ auth: null, data: proposal, rawRequest: { headers: {} } })))?.code, 'unauthenticated');
  assert.equal(await readOverride(S2, CLOSED), null, 'nothing was written for the classmate');
});

/* --------------------------------------------------------- server authority */

test('8. ingestion honours the stored extension — for that student only', async () => {
  const [extended] = await ingest(S1, [envelope({ actionId: `${P}s1-closed-q0`, assignmentId: CLOSED, questionIndex: 0, value: '2x+1' })]);
  assert.equal(extended.disposition, 'accepted', JSON.stringify(extended));
  assert.equal((await readRecord(S1, CLOSED, 0)).status, 'correct');
  const [classmate] = await ingest(S2, [envelope({ actionId: `${P}s2-closed-q0`, assignmentId: CLOSED, questionIndex: 0, value: '2x+1' })]);
  assert.equal(classmate.disposition, 'permanently-invalid');
  assert.match(String(classmate.reason), /closed/);
  assert.equal((await readRecord(S2, CLOSED, 0)).status, undefined, 'no credit was recorded');
});

test('9. a forged payload cannot claim a later deadline, a reopen, an excusal, extra attempts or another student', async () => {
  const forged = {
    lateDueAt: new Date(NOW + 30 * DAY).toISOString(),
    dueAt: new Date(NOW + 30 * DAY).toISOString(),
    reopened: true,
    excused: true,
    extraAttempts: 5,
    attemptsAllowed: 9,
    teacherGrantedExtraAttempts: 5,
    maximumAttempts: 9,
    override: { lateDueAt: new Date(NOW + 30 * DAY).toISOString() },
    privateOverride: { lateDueAt: new Date(NOW + 30 * DAY).toISOString(), dolExtraAttempts: 20 },
    studentOverrides: { [S2]: { lateDueAt: new Date(NOW + 30 * DAY).toISOString(), reopened: true } },
    dol: { attemptGrantsByStudentId: { [S2]: { extraAttempts: 20 } } },
    // Somebody else's identity, and their extension.
    studentId: S1,
  };
  const [receipt] = await ingest(S2, [envelope({ actionId: `${P}s2-forged`, assignmentId: CLOSED, questionIndex: 1, value: 'x+5', extra: forged })]);
  assert.equal(receipt.disposition, 'permanently-invalid', 'judged by S2\'s stored controls, not the payload');
  assert.equal((await readRecord(S2, CLOSED, 1)).status, undefined);
  assert.equal((await readRecord(S1, CLOSED, 1)).status, undefined, 'and nothing was written to the student it named');
  // An older client's legacy-shaped record (the override riding inside the
  // attempt record) is no claim either.
  const [legacy] = await ingest(S2, [envelope({
    actionId: `${P}s2-legacy-shape`, assignmentId: CLOSED, questionIndex: 1, value: 'x+5',
    extra: { record: { totalAttempts: 1, attemptCount: 1, status: 'attempted', studentOverrides: forged.studentOverrides, lateDueAt: forged.lateDueAt } },
  })]);
  assert.equal(legacy.disposition, 'permanently-invalid');
});

test('11. work captured before the class closed and delivered late still counts', async () => {
  // Captured in the late window (between due and the class final), delivered now.
  const capturedAt = NOW - 1.5 * DAY;
  const [receipt] = await ingest(S2, [envelope({ actionId: `${P}s2-offline`, assignmentId: CLOSED, questionIndex: 1, value: 'x+5', capturedAt })]);
  assert.equal(receipt.disposition, 'accepted', JSON.stringify(receipt));
  assert.equal((await readRecord(S2, CLOSED, 1)).status, 'correct');
});

test('6/7. a DOL attempt grant through the callable: the server allows exactly that many, and a claim adds none', async () => {
  // Students cannot reach the callable at all.
  assert.equal((await refusal(fns.setStudentAssignmentControls.run(studentRequest(S1, { assignmentId: OPEN, classId: CLASS_A, studentIds: [S1], change: { kind: 'dolAttempts', increment: 5 } }))))?.code, 'permission-denied');
  const granted = await controls({ studentIds: [S1], change: { kind: 'dolAttempts', increment: 1 } });
  assert.deepEqual(granted.students.map((row) => [row.studentId, row.dolExtraAttempts]), [[S1, 1]]);
  assert.equal((await readOverride(S1, OPEN)).dolExtraAttempts, 1);
  // Mirrored for the previous release (switch off).
  assert.equal((await readAssignment(OPEN)).dol.attemptGrantsByStudentId[S1].extraAttempts, 1);

  // S1: DOL base 1 + their grant 1 → a second (wrong) attempt is allowed.
  const [first] = await ingest(S1, [envelope({ actionId: `${P}s1-dol-1`, assignmentId: OPEN, questionIndex: 0, activityRole: 'dol', value: '8' })]);
  assert.equal(first.disposition, 'accepted');
  assert.notEqual((await readRecord(S1, OPEN, 0)).status, 'expired', 'one attempt left');
  const [second] = await ingest(S1, [envelope({ actionId: `${P}s1-dol-2`, assignmentId: OPEN, questionIndex: 0, activityRole: 'dol', value: '7', previousTotalAttempts: 1 })]);
  assert.equal(second.disposition, 'accepted');
  const s1Record = await readRecord(S1, OPEN, 0);
  assert.equal(s1Record.totalAttempts, 2);
  assert.equal(s1Record.status, 'expired');

  // S2: no grant; a forged claim of attempts changes nothing.
  const [only] = await ingest(S2, [envelope({
    actionId: `${P}s2-dol-1`, assignmentId: OPEN, questionIndex: 0, activityRole: 'dol', value: '8',
    extra: { teacherGrantedExtraAttempts: 5, maximumAttempts: 9, privateOverride: { dolExtraAttempts: 20 } },
  })]);
  assert.equal(only.disposition, 'accepted');
  assert.equal((await readRecord(S2, OPEN, 0)).status, 'expired', 'one DOL attempt, no grant: exhausted after one');
});

test('5/7. excuse and reopen go through the same callable, all-or-nothing, for the teacher\'s own class only', async () => {
  const excused = await controls({ studentIds: [S1, S2], change: { kind: 'excused', value: true } });
  assert.deepEqual(excused.students.map((row) => row.excused), [true, true]);
  const reopened = await controls({ studentIds: [S2], change: { kind: 'reopened', value: true } });
  assert.equal(reopened.students[0].reopened, true);
  const record = await readOverride(S2, OPEN);
  assert.equal(record.excused, true);
  assert.equal(record.reopened, true);
  assert.equal(record.revision, 2, 'each change is a revision');
  // The history names the teacher for each revision.
  const history = (await events(S2)).filter((event) => event.assignmentId === OPEN).map((event) => [event.kind, event.revision, event.actorEmail]);
  assert.deepEqual(history.sort(), [['excused', 1, TEACHER_A], ['reopened', 2, TEACHER_A]]);
  // Un-excusing removes it everywhere — and the absorber, which sees that
  // write change the shared copy, does not bring it back: the "never lose a
  // control" merge only ever sees what the callable left there.
  const beforeUnexcuse = await db.collection('assignments').doc(OPEN).get();
  await controls({ studentIds: [S1], change: { kind: 'excused', value: false } });
  const afterUnexcuse = await db.collection('assignments').doc(OPEN).get();
  await fns.absorbSharedStudentControls.run({ params: { assignmentId: OPEN }, data: { before: beforeUnexcuse, after: afterUnexcuse } });
  assert.equal((await readOverride(S1, OPEN)).excused, false);
  assert.equal(resolveStudentOverride({ assignment: await readAssignment(OPEN), studentId: S1, privateOverride: await readOverride(S1, OPEN) }).excused, false);
  assert.equal(resolveStudentOverride({ assignment: await readAssignment(OPEN), studentId: S1 }).excused, false, 'nor does a previous-release client reading only the shared copy see it');

  // Another class's teacher, another class's student, a mismatched class, too many students.
  const notTheirs = await refusal(fns.setStudentAssignmentControls.run(teacherRequest({ assignmentId: OPEN, classId: CLASS_A, studentIds: [S1], change: { kind: 'excused', value: true } }, TEACHER_B)));
  assert.equal(notTheirs?.code, 'permission-denied');
  const wrongStudent = await refusal(controls({ studentIds: [S1, S3], change: { kind: 'reopened', value: true } }));
  assert.equal(wrongStudent?.code, 'failed-precondition');
  assert.equal((await readOverride(S1, OPEN)).reopened, false, 'all-or-nothing: S1 was not changed either');
  assert.equal(await readOverride(S3, OPEN), null);
  const tooMany = await refusal(controls({ studentIds: Array.from({ length: 61 }, (_, index) => `${P}x${index}`), change: { kind: 'excused', value: true } }));
  assert.equal(tooMany?.code, 'invalid-argument');
  const sneaky = await refusal(controls({ studentIds: [S1], change: { kind: 'attendanceExtension', lateDueAt: '2099-01-01' } }));
  assert.equal(sneaky?.code, 'invalid-argument', 'a deadline only moves through the extension callable and its never-shorten rule');
  // The root administrator may.
  const root = await fns.setStudentAssignmentControls.run(rootRequest({ assignmentId: OPEN, classId: CLASS_A, studentIds: [S2], change: { kind: 'reopened', value: false } }));
  assert.equal(root.students[0].reopened, false);
});

test('10. the checkpoint finalizer honours the stored extension: S1 is rescheduled, S2\'s in-time work finalizes', async () => {
  const acknowledgedAt = new Date(NOW - 1.5 * DAY);
  const checkpoint = (studentId) => ({
    schemaVersion: 2,
    documentId: `${P}cp-${studentId}`,
    studentId,
    assignmentId: CLOSED,
    classId: CLASS_A,
    questionIndex: 2,
    questionId: `${CLOSED}-q2`,
    variantIndex: 0,
    activityRole: 'dol',
    revision: 1,
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
    isComplete: true,
    previousTotalAttempts: 0,
    candidateFinalizeAt: null,
    serverAcknowledgedAt: acknowledgedAt,
    status: 'active',
    secure: false,
  });
  await db.collection('studentResponseCheckpoints').doc(`${P}cp-${S1}`).set(checkpoint(S1));
  await db.collection('studentResponseCheckpoints').doc(`${P}cp-${S2}`).set(checkpoint(S2));
  const sweep = await fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId: CLOSED, classId: CLASS_A }, TEACHER_A));
  assert.equal(sweep.complete, true);
  const s1 = (await db.collection('studentResponseCheckpoints').doc(`${P}cp-${S1}`).get()).data();
  assert.equal(s1.status, 'active', 'S1\'s own cutoff is days away: still open');
  assert.equal(s1.candidateFinalizeAt.toMillis(), Date.parse((await readOverride(S1, CLOSED)).lateDueAt), 'rescheduled to their private cutoff');
  const s2 = (await db.collection('studentResponseCheckpoints').doc(`${P}cp-${S2}`).get()).data();
  assert.equal(s2.status, 'auto-submitted', 'captured before the class closed: finalized for credit');
  assert.equal((await readRecord(S2, CLOSED, 2)).status, 'correct');
});

test('Recovery\'s end date is the student\'s own cutoff, from their private record', async () => {
  const forS1 = await fns.advanceSectionRecovery.run(studentRequest(S1, { assignmentId: CLOSED, section: 'dol', action: 'status' }));
  const forS2 = await fns.advanceSectionRecovery.run(studentRequest(S2, { assignmentId: CLOSED, section: 'dol', action: 'status' }));
  assert.equal(forS1.eligibility.endsAtMs, Date.parse((await readOverride(S1, CLOSED)).lateDueAt));
  assert.equal(forS2.eligibility.endsAtMs, Date.parse(closedAssignment().lateDueAt));
});

test('Classroom passback calls the extended student\'s grade final only at their own cutoff', async () => {
  // S1's rescheduled checkpoint would hold any final grade on its own; remove
  // it so the stage itself is what is tested.
  await db.collection('studentResponseCheckpoints').doc(`${P}cp-${S1}`).delete();
  await db.collection('classroomLinks').doc(`${P}publication`).set({
    schemaVersion: 2, publicationId: `${P}publication`, assignmentId: CLOSED, courseId: `${P}course`, courseName: 'SAO',
    courseworkId: `${P}coursework`, teacherUid: `uid-${TEACHER_A}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  for (const studentId of [S1, S2]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(`${P}course`, studentId)).set({ courseId: `${P}course`, studentId, googleUserId: `google-${studentId}` });
  }
  const stageFor = async (studentId) => {
    resetClassroomCalls();
    await runClassroomSync(studentId, {});
    const audit = await db.collection('classroomGradeSyncs').where('studentId', '==', studentId).get();
    return audit.docs.map((doc) => doc.data()).find((data) => data.publicationId === `${P}publication`) || null;
  };
  const s2 = await stageFor(S2);
  assert.equal(s2?.stage, 'final-deadline', JSON.stringify(s2));
  assert.equal(s2.isFinal, true, 'the class cutoff has passed for S2');
  const s1 = await stageFor(S1);
  assert.ok(s1, 'S1 has a grade to sync');
  assert.match(String(s1.stage), /progress/, `S1's own cutoff has not passed: a progress stage, not final (${s1.stage})`);
  assert.equal(s1.isFinal, false);
  assert.ok(patchGradeCalls().every((call) => call.courseWorkId === `${P}coursework`));
});

/* --------------------------- one answer, whichever store holds the control */

// Every assignment passes through three storage states: the shared copy alone
// (the backfill has not reached it yet), both (the mirror the tests above ran
// in — there the shared copy alone would give the same answer), and the
// private record alone (after the Stage 4 strip). A student must get the same
// answer from the server in all three, so each state below puts S1's controls
// in the store(s) it names and nowhere else, then runs every server path that
// decides access: ingestion's deadline and attempt limit, the checkpoint
// finalizer and Recovery. Fresh assignments per state, removed afterwards so
// the migration tests below see only their own fixtures.

const S1_CUTOFF = NOW + 2 * DAY;
const STORAGE_STATES = [
  ['the shared copy alone — a document the backfill has not reached', 'shared'],
  ['both — the mirror, while previous-release clients read the shared copy', 'both'],
  ['the private record alone — after the Stage 4 strip', 'private'],
];

/** S1: an attendance extension on the closed lesson and one extra DOL attempt on the open one. */
const placeS1Controls = async (state, { closed, open }) => {
  await db.collection('assignments').doc(closed).set(closedAssignment(closed));
  await db.collection('assignments').doc(open).set(openAssignment(open));
  if (state === 'shared') {
    // Exactly what the previous release wrote, and no private record at all.
    await db.collection('assignments').doc(closed).update({
      [`studentOverrides.${S1}`]: { lateDueAt: new Date(S1_CUTOFF).toISOString(), extension: { dateKey: '2099-01-01', grantedAt: NOW } },
    });
    await db.collection('assignments').doc(open).update({ [`dol.attemptGrantsByStudentId.${S1}`]: { extraAttempts: 1 } });
    assert.equal(await readOverride(S1, closed), null);
    assert.equal(await readOverride(S1, open), null);
    return;
  }
  await fns.applyStudentAttendanceExtension.run(teacherRequest({
    classId: CLASS_A, studentId: S1, assignmentId: closed, proposedLateDueAtMs: S1_CUTOFF, extension: { dateKey: '2099-01-01' },
  }, TEACHER_A));
  await controls({ assignmentId: open, studentIds: [S1], change: { kind: 'dolAttempts', increment: 1 } });
  assert.equal(legacyStudentIds(await readAssignment(closed)).includes(S1), true, 'mirrored while the switch is off');
  if (state === 'private') {
    // The Stage 4 strip, one document at a time (the migration runs exactly this).
    for (const id of [closed, open]) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await stripAssignment({ db, assignmentId: id })).stripped, true);
      // eslint-disable-next-line no-await-in-loop
      assert.equal(sharedAssignmentIsClean(await readAssignment(id)), true, `${id}: nothing per-student is left on the shared document`);
    }
  }
  assert.equal((await readOverride(S1, closed)).lateDueAt, new Date(S1_CUTOFF).toISOString());
  assert.equal((await readOverride(S1, open)).dolExtraAttempts, 1);
};

/** What the server decides for S1 (and their classmate) on those two lessons. */
const serverAnswers = async ({ closed, open }) => {
  const [late] = await ingest(S1, [envelope({ actionId: `${closed}-s1-q0`, assignmentId: closed, questionIndex: 0, value: '2x+1' })]);
  const [classmate] = await ingest(S2, [envelope({ actionId: `${closed}-s2-q0`, assignmentId: closed, questionIndex: 0, value: '2x+1' })]);

  const checkpointId = `${closed}-cp-s1`;
  await db.collection('studentResponseCheckpoints').doc(checkpointId).set({
    schemaVersion: 2, documentId: checkpointId, studentId: S1, assignmentId: closed, classId: CLASS_A,
    questionIndex: 2, questionId: `${closed}-q2`, variantIndex: 0, activityRole: 'dol', revision: 1,
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] }, isComplete: true, previousTotalAttempts: 0,
    candidateFinalizeAt: null, serverAcknowledgedAt: new Date(NOW - 1.5 * DAY), status: 'active', secure: false,
  });
  await fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId: closed, classId: CLASS_A }, TEACHER_A));
  const checkpoint = (await db.collection('studentResponseCheckpoints').doc(checkpointId).get()).data();

  const recovery = await fns.advanceSectionRecovery.run(studentRequest(S1, { assignmentId: closed, section: 'dol', action: 'status' }));

  const [first] = await ingest(S1, [envelope({ actionId: `${open}-s1-dol-1`, assignmentId: open, questionIndex: 0, activityRole: 'dol', value: '8' })]);
  const afterFirst = await readRecord(S1, open, 0);
  const [second] = await ingest(S1, [envelope({ actionId: `${open}-s1-dol-2`, assignmentId: open, questionIndex: 0, activityRole: 'dol', value: '7', previousTotalAttempts: 1 })]);
  const afterSecond = await readRecord(S1, open, 0);

  return {
    lateWork: late.disposition,
    classmateLateWork: classmate.disposition,
    checkpoint: checkpoint.status,
    checkpointFinalizeAt: checkpoint.candidateFinalizeAt?.toMillis?.() ?? null,
    recoveryEndsAt: recovery.eligibility.endsAtMs,
    dolFirst: [first.disposition, afterFirst.status],
    dolSecond: [second.disposition, afterSecond.status, afterSecond.totalAttempts],
  };
};

const SAME_ANSWER_IN_EVERY_STATE = {
  lateWork: 'accepted', // S1's own cutoff has not passed
  classmateLateWork: 'permanently-invalid', // the class's has
  checkpoint: 'active', // S1's outstanding answer waits for their cutoff…
  checkpointFinalizeAt: S1_CUTOFF, // …and is rescheduled to exactly it
  recoveryEndsAt: S1_CUTOFF,
  dolFirst: ['accepted', 'attempted'], // DOL allows 1, plus S1's grant of 1: one left
  dolSecond: ['accepted', 'expired', 2],
};

for (const [label, state] of STORAGE_STATES) {
  test(`server authority with S1's controls in ${label}: the same answer`, async () => {
    const ids = { closed: `${P}st-${state}-closed`, open: `${P}st-${state}-open` };
    try {
      await placeS1Controls(state, ids);
      assert.deepEqual(await serverAnswers(ids), SAME_ANSWER_IN_EVERY_STATE);
    } finally {
      await Promise.all([
        ...Object.values(ids).map((id) => db.collection('assignments').doc(id).delete()),
        ...Object.values(ids).map((id) => overrideDoc(S1, id).delete()),
        db.collection('studentResponseCheckpoints').doc(`${ids.closed}-cp-s1`).delete(),
      ]);
      const archives = await db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).where('assignmentId', 'in', Object.values(ids)).get();
      await Promise.all(archives.docs.map((doc) => doc.ref.delete()));
    }
  });
}

/* ---------------------------------------------------------- the migration */

const L = `${P}legacy-`;
const legacyDocs = () => ({
  [`${L}1`]: {
    title: 'Legacy 1', assignedClassIds: [CLASS_A], dueAt: '2026-09-18T23:59:59.000Z', lateDueAt: '2026-09-25T23:59:59.000Z',
    studentOverrides: {
      [S1]: { lateDueAt: '2026-10-05T23:59:59.000Z', extension: { dateKey: '2026-10-05', grantedAt: 1758100000000 } },
      [S2]: { dueAt: '2026-09-30' },
    },
    excusedStudentIds: [S3],
  },
  [`${L}2`]: {
    title: 'Legacy 2', assignedClassIds: [CLASS_A], dueAt: '2026-09-18T23:59:59.000Z',
    studentOverrides: { [S2]: { excused: true, reopened: true } },
    reopenedStudentIds: [S1],
    dol: {
      enabled: true,
      attemptGrantsByClassId: { [CLASS_A]: { extraAttempts: 1 } },
      attemptGrantsByStudentId: { [S1]: { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z', changedBy: 'uid-t', reason: 'teacher-dol-recovery' }, [S2]: 3 },
      recoveryAudit: [
        { id: `grantAttempts:students:${S1}+${S2}:2026-09-16T15:05:00.000Z`, action: 'grantAttempts', section: 'dol', scope: { type: 'students', studentIds: [S1, S2], classId: null }, previous: { extraAttemptsByStudent: { [S1]: 1, [S2]: 2 } }, next: { extraAttemptsByStudent: { [S1]: 2, [S2]: 3 } }, teacherId: 'uid-t', at: '2026-09-16T15:05:00.000Z' },
        { id: `reopenWindow:class:${CLASS_A}:t`, action: 'reopenWindow', section: 'dol', scope: { type: 'class', classId: CLASS_A }, teacherId: 'uid-t', at: '2026-09-16T15:30:00.000Z' },
      ],
    },
  },
  [`${L}3`]: { title: 'Legacy 3 — nothing per-student', assignedClassIds: [CLASS_A], dueAt: '2026-09-18T23:59:59.000Z' },
});

/** Every student's effective access on every legacy doc, as the platform answers it. */
const effectiveAccess = async (privateRead) => {
  const out = {};
  for (const [id] of Object.entries(legacyDocs())) {
    // eslint-disable-next-line no-await-in-loop
    const assignment = { id, ...(await readAssignment(id)) };
    for (const studentId of [S1, S2, S3]) {
      // eslint-disable-next-line no-await-in-loop
      const privateOverride = privateRead ? await readOverride(studentId, id) : undefined;
      const resolved = resolveStudentOverride({ assignment, studentId, privateOverride });
      out[`${id}/${studentId}`] = {
        finalCloseAtMs: assignmentFinalCloseAt(assignment, 'America/Chicago', studentId, null, { privateOverride }),
        dolExtraAttempts: resolveTeacherGrantedExtraAttempts({ assignment, activityRole: 'dol', classId: CLASS_A, studentId, privateOverride }),
        excused: resolved?.excused === true,
        reopened: resolved?.reopened === true,
      };
    }
  }
  return out;
};

let accessBefore = null;

test('migration: only the root administrator can run it', async () => {
  const batch = db.batch();
  Object.entries(legacyDocs()).forEach(([id, data]) => batch.set(db.collection('assignments').doc(id), data));
  await batch.commit();
  accessBefore = await effectiveAccess(false);
  for (const who of [teacherRequest({ assignmentIdPrefix: P }, TEACHER_A), studentRequest(S1, { assignmentIdPrefix: P })]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns.migrateStudentAssignmentOverrides.run(who)))?.code, 'permission-denied');
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns.setAssignmentOverrideStorage.run(who)))?.code, 'permission-denied');
  }
});

test('migration: a dry run (the default) reports and writes nothing', async () => {
  const recordsBefore = (await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get()).size;
  const sharedBefore = await readAssignment(`${L}2`);
  const report = await migrate({ mode: 'backfill' });
  assert.equal(report.dryRun, true);
  // S1, S2 and S3 (excused by the list) on legacy 1; S1 and S2 on legacy 2;
  // nothing on legacy 3; the students the earlier tests gave private records
  // (on the closed and open lessons) are already absorbed.
  assert.equal(report.recordsCreated, 5, JSON.stringify(report));
  assert.deepEqual(report.failures, []);
  assert.equal((await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get()).size, recordsBefore);
  assert.deepEqual(await readAssignment(`${L}2`), sharedBefore);
});

test('13/15. a backfill interrupted after one page resumes from its cursor and finishes exactly once', async () => {
  // The operator's run "dies" after its first page (sao-closed, sao-legacy-1).
  const firstPage = await migrate({ mode: 'backfill', dryRun: false, maxAssignments: 2 });
  assert.equal(firstPage.done, false);
  assert.equal(firstPage.nextCursor, `${L}1`, 'a cursor to resume from');
  const afterInterruption = (await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get()).size;
  assert.equal(afterInterruption, 3, 'legacy 1 is finished, legacy 2 untouched');
  assert.equal(await readOverride(S1, `${L}2`), null);
  // An interrupted assignment is either finished or untouched: legacy 1's
  // students are complete and every one of them still has the same access.
  assert.equal((await readOverride(S2, `${L}1`)).lateDueAt, '2026-09-30');
  // Resume from the cursor until done.
  let cursor = firstPage.nextCursor;
  let pages = 1;
  while (cursor) {
    // eslint-disable-next-line no-await-in-loop
    const page = await migrate({ mode: 'backfill', dryRun: false, maxAssignments: 1, startAfter: cursor });
    assert.deepEqual(page.failures, []);
    cursor = page.nextCursor;
    pages += 1;
  }
  assert.ok(pages >= 3);
  const records = await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get();
  assert.equal(records.size, 5);
  // Converted exactly.
  assert.equal((await readOverride(S2, `${L}1`)).lateDueAt, '2026-09-30');
  assert.equal((await readOverride(S3, `${L}1`)).excused, true);
  assert.equal((await readOverride(S1, `${L}2`)).dolExtraAttempts, 2);
  assert.equal((await readOverride(S1, `${L}2`)).reopened, true);
  assert.equal((await readOverride(S2, `${L}2`)).dolExtraAttempts, 3);
  // Each student's share of the DOL recovery audit is in their history.
  const s1History = (await events(S1)).filter((event) => event.kind === 'legacyAuditEntry');
  assert.equal(s1History.length, 1);
  assert.equal(JSON.stringify(s1History[0].legacy).includes(S2), false, 'a student\'s history names no classmate');
  // Nothing about any student's access changed, and the shared copy is still there.
  assert.deepEqual(await effectiveAccess(true), accessBefore);
  assert.equal(sharedAssignmentIsClean(await readAssignment(`${L}2`)), false);
});

test('14. a second backfill writes nothing', async () => {
  const before = (await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get()).docs
    .map((doc) => [doc.id, doc.data().revision]);
  const rerun = await migrate({ mode: 'backfill', dryRun: false });
  assert.equal(rerun.recordsCreated, 0);
  assert.equal(rerun.recordsUpdated, 0);
  assert.equal(rerun.auditCopiesCreated, 0);
  assert.ok(rerun.recordsUnchanged >= 5);
  const after = (await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '>=', L).where('assignmentId', '<', `${L}~`).get()).docs
    .map((doc) => [doc.id, doc.data().revision]);
  assert.deepEqual(after, before);
});

test('the strip is refused while previous-release clients still read the shared copy', async () => {
  const refused = await refusal(migrate({ mode: 'strip', dryRun: false }));
  assert.equal(refused?.code, 'failed-precondition');
  assert.equal(sharedAssignmentIsClean(await readAssignment(`${L}2`)), false);
});

test('Stage 4: retire the shared copy and strip — archived first, every student\'s access unchanged', async () => {
  assert.deepEqual(await setStorage(true), { sharedRetired: true, mirrorShared: false, changed: true });
  const dry = await migrate({ mode: 'strip' });
  // Legacy 1 and 2, and the closed/open lessons the earlier tests mirrored onto.
  assert.equal(dry.assignmentsStripped, 4, JSON.stringify(dry));
  const run = await migrate({ mode: 'strip', dryRun: false });
  assert.deepEqual(run.failures, []);
  assert.equal(run.assignmentsStripped, 4);
  for (const id of Object.keys(legacyDocs())) {
    // eslint-disable-next-line no-await-in-loop
    const shared = await readAssignment(id);
    assert.equal(sharedAssignmentIsClean(shared), true, `${id} carries no per-student data`);
    assert.deepEqual(legacyStudentIds(shared), []);
  }
  // The class-wide controls stay.
  const two = await readAssignment(`${L}2`);
  assert.deepEqual(two.dol.attemptGrantsByClassId, { [CLASS_A]: { extraAttempts: 1 } });
  assert.equal(two.dol.recoveryAudit.length, 1);
  // Verbatim archive, root admin only.
  const archives = await db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).where('assignmentId', '==', `${L}2`).get();
  assert.equal(archives.size, 1);
  assert.deepEqual(archives.docs[0].data().content.attemptGrantsByStudentId, legacyDocs()[`${L}2`].dol.attemptGrantsByStudentId);
  // Every student sees exactly what they saw before the migration.
  assert.deepEqual(await effectiveAccess(true), accessBefore);
  // A second strip finds nothing.
  const again = await migrate({ mode: 'strip', dryRun: false });
  assert.equal(again.assignmentsStripped, 0);
  assert.equal(again.archivesWritten, 0);
});

test('the strip itself refuses a document whose students are not all in private storage — nothing leaves unabsorbed', async () => {
  const id = `${P}legacy-unabsorbed`;
  await db.collection('assignments').doc(id).set({ title: 'x', assignedClassIds: [CLASS_A], studentOverrides: { [S3]: { reopened: true } } });
  const outcome = await stripAssignment({ db, assignmentId: id });
  assert.deepEqual(outcome.notAbsorbed, [S3]);
  assert.equal(outcome.stripped, false);
  assert.deepEqual((await readAssignment(id)).studentOverrides, { [S3]: { reopened: true } }, 'the shared copy is untouched');
  await db.collection('assignments').doc(id).delete();
});

test('the absorber: a stale tab writes a grant back after the strip — it is absorbed (never lost) and removed again', async () => {
  const before = await db.collection('assignments').doc(`${L}2`).get();
  // A previous-release teacher tab, from an old snapshot: S1's grant is 4 there.
  await db.collection('assignments').doc(`${L}2`).update({ 'dol.attemptGrantsByStudentId': { [S1]: { extraAttempts: 4 } } });
  const after = await db.collection('assignments').doc(`${L}2`).get();
  await fns.absorbSharedStudentControls.run({ params: { assignmentId: `${L}2` }, data: { before, after } });
  assert.equal((await readOverride(S1, `${L}2`)).dolExtraAttempts, 4, 'the larger grant stands');
  assert.equal(sharedAssignmentIsClean(await readAssignment(`${L}2`)), true, 'retired: stripped again');
  // An unrelated write is ignored cheaply.
  const quiet = await db.collection('assignments').doc(`${L}3`).get();
  await fns.absorbSharedStudentControls.run({ params: { assignmentId: `${L}3` }, data: { before: quiet, after: quiet } });
});

test('a write while retired deletes the student\'s shared entries instead of mirroring them', async () => {
  // A document the strip has not reached yet still carries shared entries.
  await db.collection('assignments').doc(OPEN).update({
    'dol.attemptGrantsByStudentId': { [S1]: { extraAttempts: 1 }, [S2]: { extraAttempts: 1 } },
    [`studentOverrides.${S2}`]: { excused: true },
  });
  await controls({ assignmentId: OPEN, studentIds: [S2], change: { kind: 'dolAttempts', increment: 1 } });
  const open = await readAssignment(OPEN);
  assert.equal(open.dol.attemptGrantsByStudentId?.[S2], undefined, 'no shared copy is written, and the old one is removed');
  assert.equal(open.studentOverrides?.[S2], undefined);
  assert.deepEqual(open.dol.attemptGrantsByStudentId?.[S1], { extraAttempts: 1 }, 'another student\'s entry is left for the strip');
  assert.equal((await readOverride(S2, OPEN)).dolExtraAttempts, 2, 'the grant that was only on the shared copy (1) is the base: 1 + 1');
  assert.equal((await readOverride(S2, OPEN)).excused, true, 'and the excusal that was only on the shared copy');
});

test('rollback: restore is refused while retired; after the switch is off it writes the shared copy back', async () => {
  assert.equal((await refusal(migrate({ mode: 'restore', dryRun: false })))?.code, 'failed-precondition');
  await setStorage(false);
  const run = await migrate({ mode: 'restore', dryRun: false });
  assert.deepEqual(run.failures, []);
  assert.ok(run.assignmentsRestored >= 2);
  // A previous-release client reading only the shared copy sees the same access again.
  const shared = await effectiveAccess(false);
  const expected = await effectiveAccess(true);
  assert.deepEqual(shared, expected);
});

/* ------------------------------------------------- class move and deletion */

test('a class move re-authorizes the record for the new teacher and keeps the origin', async () => {
  const moved = `${P}moved`;
  await db.collection('grades').doc(moved).set({ displayName: moved, classId: CLASS_B, assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {} });
  await overrideDoc(moved, CLOSED).set({
    schemaVersion: 1, studentId: moved, assignmentId: CLOSED, classId: CLASS_B, originClassId: CLASS_B, originTeacherEmail: TEACHER_B,
    authorizedTeacherEmails: [TEACHER_B], lateDueAt: null, extension: null, excused: true, reopened: false, dolExtraAttempts: 0, dolAttemptGrant: null, revision: 1, source: 'test', updatedBy: 'test',
  });
  await fns.setStudentClass.run(rootRequest({ studentId: moved, classId: CLASS_A }));
  const record = await readOverride(moved, CLOSED);
  assert.equal(record.classId, CLASS_A);
  assert.deepEqual([...record.authorizedTeacherEmails].sort(), [TEACHER_A, TEACHER_B].sort());
  assert.equal(record.originTeacherEmail, TEACHER_B);
});

