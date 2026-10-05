// RECOVERY MISCONCEPTION EVIDENCE, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-misconception-recovery \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/misconceptionEvidenceRecovery.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The pure rules are in tests/platform/misconceptionEvidencePhase2.test.mjs.
// This drives the REAL exported Cloud Functions — the student's
// `advanceSectionRecovery` (Practice, Start, Submit) and the teacher's
// `loadStudentCaseEvidence` — and reads back what production stores:
//
//   * a Recovery item the server graded wrong, with a value exactly one
//     modeled strategy produces, writes ONE record to the server-only
//     grades/{sid}/misconceptionEvidence collection — never an attempt event
//     (so My Math Path mastery and Recovery scoring cannot move);
//   * the Recovery record itself carries no code;
//   * a Practice answer is classified the same way; a forfeit never is;
//   * only this student's teacher reads it back, through the case review.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { db, fns, refusal, studentRequest, teacherRequest } from './canonicalPersistenceHarness.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';

const P = 'mevrec-';
const TEACHER = 'mevrec.teacher@desotoisd.org';
const OTHER_TEACHER = 'mevrec.other@desotoisd.org';
const CLASS = `${P}class`;
const DAY = 86_400_000;
const NOW = Date.now();
const dateKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const STUDENTS = [`${P}s0`, `${P}s1`];
const [SUBMIT_STUDENT, PRACTICE_STUDENT] = STUDENTS;

const zeros = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight, questionFamily: { id: 'functions.identifyZeros' } });
const ASSIGNMENT_ID = `${P}zeros`;
const assignmentDoc = () => {
  const assignment = {
    id: ASSIGNMENT_ID,
    title: 'Zeros (synthetic)',
    schemaVersion: 5,
    assignedClassIds: [CLASS],
    releaseAt: new Date(NOW - 10 * DAY).toISOString(),
    dueAt: new Date(NOW - 3 * DAY).toISOString(),
    lateDueAt: new Date(NOW + 5 * DAY).toISOString(),
    dol: { instructionDate: dateKey(NOW - 3 * DAY) },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: [zeros('d1', 4), zeros('d2', 3), zeros('d3', 3)] }],
  };
  assignment.generationSeats = { version: 1, byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: STUDENTS }) } };
  const { id: _id, ...stored } = assignment;
  return stored;
};
const ORIGINAL_TRACKER = Object.fromEntries([0, 1, 2].map((index) => [index, { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() }]));

const reproduce = (item) => reproduceFamilyQuestionFromPin({
  question: getStoredAssignmentQuestions({ id: ASSIGNMENT_ID, ...assignmentDoc() })[item.storageIndex],
  assignmentId: ASSIGNMENT_ID,
  storageIndex: item.storageIndex,
  pin: item.pin,
});
const zerosResponse = (smaller, larger) => ({
  kind: 'fields', type: 'multiAnswer', value: '',
  fields: [{ id: 'smallerZero', value: String(smaller), isComplete: true }, { id: 'largerZero', value: String(larger), isComplete: true }],
});
const right = (item) => {
  const { low, high } = reproduce(item).instance.values;
  return zerosResponse(low, high);
};
const signReversed = (item) => {
  const { low, high } = reproduce(item).instance.values;
  return zerosResponse(Math.min(-low, -high), Math.max(-low, -high));
};

const recovery = (studentId, action, payload = undefined) => fns.advanceSectionRecovery.run(studentRequest(studentId, {
  assignmentId: ASSIGNMENT_ID, section: 'dol', action, ...(payload ? { payload } : {}),
}));
const evidenceDocs = async (studentId) => (await db.collection('grades').doc(studentId).collection('misconceptionEvidence').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const attemptEvents = async (studentId) => (await db.collection('grades').doc(studentId).collection('evidenceEvents').get()).docs;

const cleanup = async () => {
  for (const name of ['classes', 'grades', 'assignments']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs.filter((doc) => doc.id.startsWith(P)).map((doc) => doc.ref.delete()));
  }
  for (const studentId of STUDENTS) {
    for (const sub of ['misconceptionEvidence', 'evidenceEvents']) {
      // eslint-disable-next-line no-await-in-loop
      const docs = await db.collection('grades').doc(studentId).collection(sub).get();
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
    }
  }
};

before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS).set({ name: 'Misconception evidence — Period 4', period: 'Period 4', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(assignmentDoc());
  for (const studentId of STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId, classId: CLASS, classPeriod: 'Period 4', assignedTeacherEmail: TEACHER, status: 'active',
      gradesByAssignment: { [ASSIGNMENT_ID]: ORIGINAL_TRACKER },
    });
  }
});

after(cleanup);

/** Practice with right answers until Recovery unlocks (optionally answering the first one with `first`). */
const practiceToUnlock = async (studentId, first = null) => {
  for (let step = 0; step < 24; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    const status = await recovery(studentId, 'status');
    if (status.state !== 'locked') return status;
    const item = status.nextPracticeItem;
    assert.ok(item?.pin, `a Practice item is offered (${status.reason})`);
    const response = step === 0 && first ? first(item) : right(item);
    // eslint-disable-next-line no-await-in-loop
    await recovery(studentId, 'practice', { pin: item.pin, practiceIndex: item.practiceIndex, response });
  }
  return recovery(studentId, 'status');
};

test('a Recovery item the server graded wrong writes one server-only misconception record — never an attempt event', async () => {
  await practiceToUnlock(SUBMIT_STUDENT);
  const started = (await recovery(SUBMIT_STUDENT, 'start')).record;
  const [r1, r2, r3] = started.plan.items;
  const eventsBefore = (await attemptEvents(SUBMIT_STUDENT)).length;
  const submitted = await recovery(SUBMIT_STUDENT, 'submit', {
    responses: { r1: signReversed(r1), r2: zerosResponse(9998, 9999), r3: right(r3) },
  });
  assert.equal(submitted.held, false);
  const records = await evidenceDocs(SUBMIT_STUDENT);
  assert.equal(records.length, 1, 'only r1: r2 is unmodeled, r3 is right');
  const [record] = records;
  assert.equal(record.source.kind, 'sectionRecovery');
  assert.equal(record.source.itemId, 'r1');
  assert.equal(record.source.assignmentId, ASSIGNMENT_ID);
  assert.deepEqual(record.performance.misconceptionCodes, ['zeros-sign-reversed']);
  assert.equal(record.performance.misconceptionEvidence.source, 'server-grading');
  assert.equal('score' in record.performance, false);
  assert.equal(record.questionSnapshot.instanceFingerprint, r1.pin.fingerprint);
  assert.equal(r2.itemId, 'r2');
  // No attempt event: My Math Path mastery reads those, and a Recovery item's
  // key would collide with the original DOL attempt's.
  assert.equal((await attemptEvents(SUBMIT_STUDENT)).length, eventsBefore);
  // The Recovery record holds no code.
  const stored = (await db.collection('grades').doc(SUBMIT_STUDENT).get()).data().sectionRecoveryByAssignment[ASSIGNMENT_ID].dol;
  assert.equal(JSON.stringify(stored).includes('misconception'), false);
  // A second submit is refused and writes nothing more.
  assert.ok(await refusal(recovery(SUBMIT_STUDENT, 'submit', { responses: { r1: signReversed(r1) } })));
  assert.equal((await evidenceDocs(SUBMIT_STUDENT)).length, 1);
});

test('a graded Practice answer is classified the same way; only the student\'s teacher reads it, through the case review', async () => {
  await practiceToUnlock(PRACTICE_STUDENT, signReversed);
  const records = await evidenceDocs(PRACTICE_STUDENT);
  assert.equal(records.length, 1);
  assert.equal(records[0].source.kind, 'recoveryPractice');
  assert.deepEqual(records[0].performance.misconceptionCodes, ['zeros-sign-reversed']);

  const request = { studentId: PRACTICE_STUDENT, assignmentIds: [ASSIGNMENT_ID], fromMs: NOW - 30 * DAY, toMs: NOW + DAY };
  const evidence = await fns.loadStudentCaseEvidence.run(teacherRequest(request, TEACHER));
  assert.deepEqual(evidence.misconceptionEvidence.map((entry) => entry.performance.misconceptionCodes), [['zeros-sign-reversed']]);
  assert.equal('studentId' in evidence.misconceptionEvidence[0], false);
  // Another teacher, and the student, are refused.
  assert.ok(await refusal(fns.loadStudentCaseEvidence.run(teacherRequest(request, OTHER_TEACHER))));
  assert.ok(await refusal(fns.loadStudentCaseEvidence.run(studentRequest(PRACTICE_STUDENT, request))));
});
