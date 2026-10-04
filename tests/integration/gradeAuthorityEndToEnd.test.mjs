/*
 * THE GRADE TRUST BOUNDARY, END TO END: REAL RULES, REAL CLOUD FUNCTIONS.
 *
 * HOW TO RUN: npm run test:grade-authority (also runs in CI with the other
 * tests/integration suites).
 *
 * tests/rules/gradeAuthorityRules.test.mjs proves the database refuses a
 * student's direct write to every authoritative grade field. This suite proves
 * the other half of the claim — that refusing it costs nothing a student is
 * owed — by driving the REAL `ingestStudentSubmissions` callable, the REAL
 * Classroom passback trigger and the REAL teacher override callable against a
 * Firestore emulator project whose rules are the production `firestore.rules`.
 *
 * So one test can do what an attacker and an honest student both do on the
 * same document: the student's console write is refused by the rules, the
 * student's Submit goes through the server, and what Google Classroom, the
 * Grade Center and Grade Transfer read afterwards is the server's result.
 *
 * Isolation: this file runs in its own project id (set before the Cloud
 * Functions load), so it shares no documents — and no rules — with the other
 * integration suites running beside it on the same emulator.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT = 'mathmaster-grade-authority-e2e';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set — this suite must never reach a real project.');
// Before functions/index.js runs initializeApp(): the Admin SDK, and therefore
// every callable below, writes into this suite's own project.
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });

const {
  ASSIGNMENT_ID, CLASS_ID, OTHER_CLASS_ID, PREFIX, TEACHER_EMAIL, certAssignment, db, fns, ingest,
  patchGradeCalls, readGradeDoc, readRecord, resetClassroomCalls, runClassroomSync, seedFixture,
  seedRosteredStudent, studentRequest, submissionEnvelope, teacherRequest, teardownFixture,
} = await import('./canonicalPersistenceHarness.mjs');
const { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } = await import(
  '../../src/platform/grading/canonicalGradeProjection.js'
);

const [emulatorHost, emulatorPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
let rulesEnv;

before(async () => {
  rulesEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: emulatorHost,
      port: Number(emulatorPort),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await seedFixture();
});

after(async () => {
  await teardownFixture();
  await rulesEnv?.cleanup();
});

/** The student's own browser: authenticated, their own claim, the real rules. */
const studentClient = (studentId) => rulesEnv
  .authenticatedContext(`uid-${studentId}`, { role: 'student', studentId })
  .firestore();
const teacherClient = () => rulesEnv
  .authenticatedContext(`uid-${TEACHER_EMAIL}`, { role: 'teacher', email: TEACHER_EMAIL })
  .firestore();

const ANSWERS = ['2x+1', 'x+5', 'x-4', '9'];
const literal = (value) => ({ kind: 'scalar', type: 'literal', value, fields: [] });
const correct = (index) => literal(ANSWERS[index]);
const wrong = () => literal('definitely not it');
const freshStudent = async (suffix) => {
  const studentId = `${PREFIX}-ga-${suffix}`;
  await seedRosteredStudent(studentId);
  return studentId;
};
const allCorrectTracker = () => Object.fromEntries(ANSWERS.map((_, index) => [String(index), {
  status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100,
}]));

/* Answer one question until the server records it terminal, the honest way. */
const exhaust = async (studentId, questionIndex) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const record = await readRecord(studentId, questionIndex);
    if (record.status === 'expired') return record;
    // eslint-disable-next-line no-await-in-loop
    const [receipt] = await ingest(studentId, [submissionEnvelope({
      actionId: `${studentId}-q${questionIndex}-wrong-${attempt}`,
      questionIndex,
      previousTotalAttempts: Number(record.totalAttempts) || 0,
      response: wrong(),
    })]);
    assert.equal(receipt.disposition, 'accepted');
  }
  throw new Error('the server never exhausted the question');
};

/* The wire shape the student app sends for elapsed time on a question. */
const progressEnvelope = ({ actionId, questionIndex, timeSpentSeconds, assignmentId = ASSIGNMENT_ID, ...extra }) => ({
  schemaVersion: 1,
  actionId,
  kind: 'questionProgress',
  assignmentId,
  questionIndex,
  activityRole: 'classwork',
  capturedAt: Date.now(),
  timeSpentSeconds,
  ...extra,
});

/* ==========================================================================
 * THE EXPLOITS, CLOSED.
 * ======================================================================== */

test('a forged all-correct tracker is refused at the database, so Google Classroom never hears of it', async () => {
  const studentId = await freshStudent('forger');
  const before = await readGradeDoc(studentId);

  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`gradesByAssignment.${ASSIGNMENT_ID}`]: allCorrectTracker(),
  }));
  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`classroomReleaseSignals.${ASSIGNMENT_ID}`]: { reason: 'final-deadline' },
  }));

  resetClassroomCalls();
  await runClassroomSync(studentId, before);
  assert.deepEqual(patchGradeCalls(), [], 'nothing a student wrote may be posted to Google Classroom');
  assert.deepEqual((await readGradeDoc(studentId)).gradesByAssignment, {}, 'the canonical tracker is still empty');
});

test('a student cannot buy back attempts by rewriting the record the server attempt policy reads', async () => {
  const studentId = await freshStudent('attempts');
  const exhausted = await exhaust(studentId, 2);

  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`gradesByAssignment.${ASSIGNMENT_ID}.2.attemptCount`]: 0,
    [`gradesByAssignment.${ASSIGNMENT_ID}.2.totalAttempts`]: 0,
    [`gradesByAssignment.${ASSIGNMENT_ID}.2.status`]: 'attempted',
  }));
  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`gradesByAssignment.${ASSIGNMENT_ID}.2`]: deleteField(),
  }));

  // The correct answer, offered both as a "fresh" first attempt (what a forged
  // reset would have made acceptable) and as the honest next attempt.
  await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q2-after-forged-reset`, questionIndex: 2, previousTotalAttempts: 0, response: correct(2),
  })]);
  await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q2-one-more`, questionIndex: 2, previousTotalAttempts: exhausted.totalAttempts, response: correct(2),
  })]);
  const record = await readRecord(studentId, 2);
  assert.equal(record.status, 'expired', 'an exhausted question stays exhausted');
  assert.equal(record.attemptCount, exhausted.attemptCount);
  assert.equal(record.partialCredit, 0);
});

/* ==========================================================================
 * 5, 6, 7. THE HONEST PATH STILL RECORDS — AND THE SERVER DECIDES.
 * ======================================================================== */

test('5 & 6. a valid correct response through ingestion is accepted and the server records it correct', async () => {
  const studentId = await freshStudent('correct');
  const [receipt] = await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q0`, questionIndex: 0, response: correct(0),
  })]);
  assert.equal(receipt.disposition, 'accepted');
  assert.equal(receipt.gradedBy, 'server');
  const record = await readRecord(studentId, 0);
  assert.equal(record.status, 'correct');
  assert.equal(record.partialCredit, 100);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.lastSubmissionId, `${studentId}-q0`);
});

test('7. an incorrect response records the attempt and the score the server derived', async () => {
  const studentId = await freshStudent('incorrect');
  const [receipt] = await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q1-wrong`, questionIndex: 1, response: wrong(),
  })]);
  assert.equal(receipt.disposition, 'accepted');
  const record = await readRecord(studentId, 1);
  assert.equal(record.status, 'attempted');
  assert.equal(record.attemptCount, 1);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.partialCredit, 0);
  assert.equal(record.gradedBy, 'server');
});

/* ==========================================================================
 * 8 & 9. OFFLINE, RECONNECT, DUPLICATES.
 * ======================================================================== */

test('8. a submission queued offline and delivered on reconnect is written exactly once', async () => {
  const studentId = await freshStudent('offline');
  const queued = submissionEnvelope({
    actionId: `${studentId}-q3-queued`,
    questionIndex: 3,
    // Captured twenty minutes ago, while the Chromebook had no network.
    capturedAt: Date.now() - 20 * 60_000,
    response: correct(3),
  });
  // Reconnect: the drain and a second tab's drain deliver the same row at once.
  const [first, second] = await Promise.all([ingest(studentId, [queued]), ingest(studentId, [queued])]);
  const dispositions = [first[0].disposition, second[0].disposition].sort();
  assert.deepEqual(dispositions, ['accepted', 'duplicate']);
  const record = await readRecord(studentId, 3);
  assert.equal(record.totalAttempts, 1, 'one captured submission is one attempt');
  assert.equal(record.status, 'correct');
  assert.ok(record.academicOccurredAt <= new Date(Date.now() - 19 * 60_000).toISOString(), 'recorded at capture time');
});

test('9. replaying a delivered action is idempotent', async () => {
  const studentId = await freshStudent('replay');
  const envelope = submissionEnvelope({ actionId: `${studentId}-q1`, questionIndex: 1, response: wrong() });
  await ingest(studentId, [envelope]);
  const [replay] = await ingest(studentId, [envelope]);
  assert.equal(replay.disposition, 'duplicate');
  const record = await readRecord(studentId, 1);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.attemptCount, 1);
});

/* ==========================================================================
 * 10. TERMINAL STAYS TERMINAL.
 * ======================================================================== */

test('10. a correct result cannot be weakened by a later submission or replaced by a student write', async () => {
  const studentId = await freshStudent('terminal');
  await ingest(studentId, [submissionEnvelope({ actionId: `${studentId}-q0`, questionIndex: 0, response: correct(0) })]);
  await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q0-later-wrong`, questionIndex: 0, previousTotalAttempts: 1, response: wrong(),
  })]);
  assert.equal((await readRecord(studentId, 0)).status, 'correct');

  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`gradesByAssignment.${ASSIGNMENT_ID}.0`]: { status: 'unattempted', attemptCount: 0, totalAttempts: 0 },
  }));
  assert.equal((await readRecord(studentId, 0)).status, 'correct');
});

/* ==========================================================================
 * 13. IDENTIFIERS IN A REQUEST DO NOT MOVE A GRADE.
 * ======================================================================== */

test('13. naming another class\'s assignment, or another student, in a request changes no grade', async () => {
  const studentId = await freshStudent('identifiers');
  const otherStudent = await freshStudent('identifiers-victim');
  const otherClassAssignment = `${PREFIX}-ga-other-class`;
  await db.collection('assignments').doc(otherClassAssignment).set({ ...certAssignment(), assignedClassIds: [OTHER_CLASS_ID] });

  const [foreign] = await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-foreign`, assignmentId: otherClassAssignment, questionIndex: 0, response: correct(0),
  })]);
  assert.notEqual(foreign.disposition, 'accepted');
  assert.equal((await readGradeDoc(studentId)).gradesByAssignment?.[otherClassAssignment], undefined);

  const [foreignProgress] = await ingest(studentId, [progressEnvelope({
    actionId: `${studentId}-foreign-progress`, assignmentId: otherClassAssignment, questionIndex: 0, timeSpentSeconds: 90,
  })]);
  assert.notEqual(foreignProgress.disposition, 'accepted');
  assert.equal((await readGradeDoc(studentId)).gradesByAssignment?.[otherClassAssignment], undefined);

  // The envelope's studentId is the caller's, whatever the envelope says.
  await fns.ingestStudentSubmissions.run(studentRequest(studentId, {
    submissions: [{
      ...submissionEnvelope({ actionId: `${studentId}-as-victim`, questionIndex: 1, response: correct(1) }),
      studentId: otherStudent,
    }],
  }));
  assert.deepEqual((await readGradeDoc(otherStudent)).gradesByAssignment, {}, 'nothing lands on the named student');
  assert.equal((await readRecord(studentId, 1)).status, 'correct', 'the work lands on the caller');
});

/* ==========================================================================
 * 15. A LEGACY PAYLOAD CARRYING A VERDICT CANNOT OVERRIDE SERVER GRADING.
 * ======================================================================== */

test('15. verdict fields in a submission are ignored wherever the server can grade', async () => {
  const studentId = await freshStudent('legacy-verdict');
  await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q0-verdict`,
    questionIndex: 0,
    record: {
      status: 'correct', isCorrect: true, partialCredit: 100, bestPartialCredit: 100, score: 100,
      attemptCount: 1, totalAttempts: 1, partGrades: [{ id: 'answer', isCorrect: true, isComplete: true }],
    },
    response: wrong(),
  })]);
  const regraded = await readRecord(studentId, 0);
  assert.equal(regraded.status, 'attempted');
  assert.equal(regraded.partialCredit, 0);
  assert.equal(regraded.gradedBy, 'server');

  // Stripping the raw work does not fall back to the claimed verdict either.
  await ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q1-no-work`,
    questionIndex: 1,
    record: { status: 'correct', partialCredit: 100, bestPartialCredit: 100, attemptCount: 1, totalAttempts: 1 },
    response: null,
  })]);
  const unproven = await readRecord(studentId, 1);
  assert.notEqual(unproven.status, 'correct', 'a claimed correct without the raw response is not credited');
  assert.ok(Number(unproven.partialCredit) <= 90);
});

/* ==========================================================================
 * 14. GRADEBOOK, EXPORT AND PASSBACK READ THE CANONICAL SERVER RESULT.
 * ======================================================================== */

test('14. Classroom passback, the Grade Center projection and Grade Transfer agree on the server result', async () => {
  const studentId = await freshStudent('canonical');
  for (const index of [0, 1, 3]) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(studentId, [submissionEnvelope({ actionId: `${studentId}-q${index}`, questionIndex: index, response: correct(index) })]);
  }
  await exhaust(studentId, 2);

  // The student tries to improve the finished picture directly; refused.
  await assertFails(updateDoc(doc(studentClient(studentId), `grades/${studentId}`), {
    [`gradesByAssignment.${ASSIGNMENT_ID}.2.status`]: 'correct',
  }));

  resetClassroomCalls();
  await runClassroomSync(studentId, {});
  const posted = patchGradeCalls().at(-1);
  assert.ok(posted, 'a finished assignment posts to Classroom');

  const gradeDoc = await readGradeDoc(studentId);
  const student = { id: studentId, ...gradeDoc };
  const assignment = { id: ASSIGNMENT_ID, ...certAssignment() };
  const gradeCenter = canonicalPresentedAssignmentGrade({ student, assignment });
  const gradeTransfer = canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'classwork' });
  assert.equal(gradeCenter, 75, 'three of four correct');
  assert.equal(posted.grade, gradeCenter, 'Classroom receives exactly what the Grade Center shows');
  assert.equal(gradeTransfer, gradeCenter, 'Grade Transfer exports exactly what the Grade Center shows');
});

/* ==========================================================================
 * 11. THE AUDITED TEACHER OVERRIDE STILL WORKS — AND STAYS THE SERVER'S.
 * ======================================================================== */

test('11. a teacher-of-record override goes through the audited callable and reaches Classroom; nobody can forge or erase it from a client', async () => {
  const studentId = await freshStudent('override');
  for (const index of [0, 1, 2, 3]) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(studentId, [submissionEnvelope({ actionId: `${studentId}-q${index}`, questionIndex: index, response: correct(index) })]);
  }
  const before = await readGradeDoc(studentId);
  const result = await fns.overrideStudentAssignmentGrade.run(teacherRequest({
    studentId,
    assignmentId: ASSIGNMENT_ID,
    action: 'issueZero',
    reasonCode: 'academicDishonesty',
    note: 'Confirmed in class.',
    academicIntegrityConsequence: {
      scope: 'assignment', teacherConfirmed: true, incidentReason: 'academicDishonesty', participantRole: 'individual',
    },
  }));
  assert.equal(result.override.score, 0);

  const overridden = await readGradeDoc(studentId);
  assert.equal(overridden.teacherGradeOverridesByAssignment[ASSIGNMENT_ID].__assignment.score, 0);
  const audits = await db.collection('grades').doc(studentId).collection('gradeOverrideAudits').get();
  assert.equal(audits.size, 1, 'the override is audited');

  resetClassroomCalls();
  await runClassroomSync(studentId, before);
  assert.equal(patchGradeCalls().at(-1)?.grade, 0, 'Classroom receives the teacher\'s override');

  for (const client of [studentClient(studentId), teacherClient()]) {
    // eslint-disable-next-line no-await-in-loop
    await assertFails(updateDoc(doc(client, `grades/${studentId}`), {
      [`teacherGradeOverridesByAssignment.${ASSIGNMENT_ID}`]: deleteField(),
    }));
  }
  assert.equal((await readGradeDoc(studentId)).teacherGradeOverridesByAssignment[ASSIGNMENT_ID].__assignment.score, 0);
});

/* ==========================================================================
 * ELAPSED TIME ON A QUESTION: SERVER-RECORDED, NEVER A GRADE.
 *
 * Moving to the next question used to write the whole canonical record back
 * from the browser with a new `timeSpent`. The record is server-owned now, so
 * the time travels as a `questionProgress` envelope through the same
 * ingestion callable — and can move `timeSpent` and nothing else.
 * ======================================================================== */

test('progress records elapsed time without touching status, attempts, credit or submission identity', async () => {
  const studentId = await freshStudent('progress');
  await ingest(studentId, [submissionEnvelope({ actionId: `${studentId}-q0`, questionIndex: 0, response: correct(0) })]);
  const graded = await readRecord(studentId, 0);

  const [receipt] = await ingest(studentId, [progressEnvelope({
    actionId: `${studentId}-q0-time`, questionIndex: 0, timeSpentSeconds: 412,
    // Everything a forged progress action might try to ride along with.
    record: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, partialCredit: 0 },
    status: 'expired', isCorrect: false, partialCredit: 0, totalAttempts: 0,
  })]);
  assert.equal(receipt.disposition, 'accepted');
  const after = await readRecord(studentId, 0);
  assert.equal(after.timeSpent, 412);
  assert.deepEqual({ ...after, timeSpent: graded.timeSpent }, graded, 'only timeSpent may change');
  // Time is not evidence: no submission receipt is minted for it.
  const receipts = await db.collection('studentSubmissionReceipts').where('actionId', '==', `${studentId}-q0-time`).get();
  assert.equal(receipts.size, 0);
});

test('progress only ever raises elapsed time, and a replay changes nothing', async () => {
  const studentId = await freshStudent('progress-monotonic');
  const first = progressEnvelope({ actionId: `${studentId}-q1-a`, questionIndex: 1, timeSpentSeconds: 300 });
  assert.equal((await ingest(studentId, [first]))[0].disposition, 'accepted');
  assert.equal((await ingest(studentId, [first]))[0].disposition, 'accepted');
  await ingest(studentId, [progressEnvelope({ actionId: `${studentId}-q1-b`, questionIndex: 1, timeSpentSeconds: 120 })]);
  const record = await readRecord(studentId, 1);
  assert.equal(record.timeSpent, 300, 'an older, smaller reading never lowers the recorded time');
  // A viewed-but-unanswered question is recorded as viewed, never attempted.
  assert.equal(record.status ?? 'unattempted', 'unattempted');
  assert.equal(Number(record.totalAttempts) || 0, 0);
  assert.equal(Number(record.attemptCount) || 0, 0);
  // Bounded: a day is the most one question can claim.
  await ingest(studentId, [progressEnvelope({ actionId: `${studentId}-q1-c`, questionIndex: 1, timeSpentSeconds: 10_000_000 })]);
  assert.equal((await readRecord(studentId, 1)).timeSpent, 86_400);
});

test('progress cannot reopen or rescore a terminal record', async () => {
  const studentId = await freshStudent('progress-terminal');
  const exhausted = await exhaust(studentId, 2);
  await ingest(studentId, [progressEnvelope({ actionId: `${studentId}-q2-time`, questionIndex: 2, timeSpentSeconds: 999 })]);
  const record = await readRecord(studentId, 2);
  assert.equal(record.status, 'expired');
  assert.equal(record.attemptCount, exhausted.attemptCount);
  assert.equal(record.lastSubmissionId, exhausted.lastSubmissionId);
  assert.equal(record.timeSpent, 999);
});
