// SAVED ON ONE CHROMEBOOK, SUBMITTED FROM ANOTHER — AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-recovery-drafts \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/recoveryAnswerDraftsCrossDevice.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too; CI runs that in full-platform-suite.yml.)
//
// The release-candidate bug, end to end: a student answers Q1 and Q2 of a DOL
// Recovery on one device ("Answer saved"), then opens the same Recovery on a
// second device and submits. Before this change the answers lived only in the
// first browser's localStorage, so the second sent `responses: {}` and the
// REAL `advanceSectionRecovery` handler stored both as
// {status: 'unanswered', credit: 0, reason: 'no-answer'}.
//
// Each "device" here is its own copy of the runner's sync engine
// (src/platform/recovery/recoveryAnswerDrafts.js) with its own empty local
// copy, writing to and reading from the emulator's
// `studentWorkspaceDrafts/{studentId}__{assignmentId}-recovery` through the
// same transactional merge the browser runs (applyRecoveryAnswerPatch). The
// Security Rules for that write are certified separately, against the real
// firestore.rules, in tests/rules/recoveryAnswerDraftRules.test.mjs.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { db, fns, repo, studentRequest } from './canonicalPersistenceHarness.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import {
  RECOVERY_ANSWER_SAVED_WHERE,
  RECOVERY_DRAFT_FORBIDDEN_KEYS,
  applyRecoveryAnswerPatch,
  buildRecoveryAnswerValue,
  createRecoveryAnswerSync,
  readRecoveryDraftEntries,
  recoveryAnswerKey,
  recoveryDraftDocumentId,
} from '../../src/platform/recovery/recoveryAnswerDrafts.js';

const require = createRequire(import.meta.url);
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));

const P = 'rad-';
const TEACHER = 'rad.teacher@desotoisd.org';
const CLASS = `${P}class`;
const DAY = 86_400_000;
const NOW = Date.now();
const dateKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const CROSS_DEVICE_STUDENT = `${P}s0`;
const DEVICE_ONLY_STUDENT = `${P}s1`;
const STUDENTS = [CROSS_DEVICE_STUDENT, DEVICE_ONLY_STUDENT];

const twoStep = (questionId, questionWeight) => ({ questionId, type: 'stepAlgebra', prompt: 'Solve for x.', questionWeight, questionFamily: { id: 'linear.twoStepEquation' } });
const zeros = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight, questionFamily: { id: 'functions.identifyZeros' } });
const intercepts = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find both intercepts.', questionWeight, questionFamily: { id: 'functions.identifyIntercepts' } });
const ASSIGNMENT = { id: `${P}assignment`, dol: [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)] };

const assignmentDoc = ({ id, dol }) => {
  const assignment = {
    id,
    title: `Recovery drafts ${id}`,
    schemaVersion: 5,
    assignedClassIds: [CLASS],
    releaseAt: new Date(NOW - 10 * DAY).toISOString(),
    dueAt: new Date(NOW - 3 * DAY).toISOString(),
    lateDueAt: new Date(NOW + 5 * DAY).toISOString(),
    dol: { instructionDate: dateKey(NOW - 3 * DAY) },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: dol }],
  };
  assignment.generationSeats = { version: 1, byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: STUDENTS }) } };
  const { id: _id, ...stored } = assignment;
  return stored;
};

// The original DOL: only d2 right — 3 of 10 points of weight, 30%.
const ORIGINAL_TRACKER = {
  0: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  1: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
};

const questions = () => getStoredAssignmentQuestions({ id: ASSIGNMENT.id, ...assignmentDoc(ASSIGNMENT) });
const reproduce = (item) => reproduceFamilyQuestionFromPin({ question: questions()[item.storageIndex], assignmentId: ASSIGNMENT.id, storageIndex: item.storageIndex, pin: item.pin });

// The normalized response the runner builds for a correct answer
// (normalizeCheckpointResponse's shapes).
const correctResponse = ({ question, instance }) => {
  if (question.type === 'stepAlgebra') return { kind: 'opaque', type: 'stepAlgebra', value: `${question.variable || 'x'}=${question.generatedAnswer}`, fields: [] };
  const answer = instance.answer;
  const values = answer.kind === 'set' ? answer.value.map(String)
    : answer.kind === 'points' ? [`(${answer.value.xIntercept.join(', ')})`, `(${answer.value.yIntercept.join(', ')})`]
      : [String(answer.value)];
  return { kind: 'fields', type: question.type, value: '', fields: (question.answerFields || []).map((field, index) => ({ id: field.id, value: values[index] ?? '', isComplete: true })) };
};

const recovery = (studentId, action, payload = undefined) => fns.advanceSectionRecovery.run(studentRequest(studentId, {
  assignmentId: ASSIGNMENT.id,
  section: 'dol',
  action,
  ...(payload ? { payload } : {}),
}));
const gradeDoc = async (studentId) => (await db.collection('grades').doc(studentId).get()).data() || {};
const recordOf = async (studentId) => (await gradeDoc(studentId)).sectionRecoveryByAssignment?.[ASSIGNMENT.id]?.dol || null;

const practiceAndStart = async (studentId) => {
  for (let step = 0; step < 24; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    const status = await recovery(studentId, 'status');
    if (status.state !== 'locked') break;
    const item = status.nextPracticeItem;
    assert.ok(item?.pin, `a Practice item is offered (${status.reason})`);
    // eslint-disable-next-line no-await-in-loop
    await recovery(studentId, 'practice', { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduce(item)) });
  }
  const started = await recovery(studentId, 'start');
  assert.equal(started.record.status, 'inProgress');
  return started.record;
};

/* ------------------------------------------------------- the two devices */

const draftRef = (studentId) => db.collection('studentWorkspaceDrafts').doc(recoveryDraftDocumentId({ studentId, assignmentId: ASSIGNMENT.id }));

// The browser's transaction (recoveryAnswerDraftStore.js), on the Admin SDK.
const serverFlush = (studentId) => (patch) => db.runTransaction((transaction) => applyRecoveryAnswerPatch({
  read: async () => {
    const snapshot = await transaction.get(draftRef(studentId));
    return snapshot.exists ? snapshot.data() : null;
  },
  write: (merged) => { transaction.set(draftRef(studentId), { ...merged, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); },
}, patch));
const serverRead = async (studentId) => {
  const snapshot = await draftRef(studentId).get();
  return snapshot.exists ? readRecoveryDraftEntries(snapshot.data()) : [];
};

/** A Chromebook: its own page (writer) and its own, initially empty, local copy. */
const openDevice = async (studentId, name, { now } = {}) => {
  const local = {};
  const sync = createRecoveryAnswerSync({
    studentId,
    assignmentId: ASSIGNMENT.id,
    writer: `${name}-page`,
    flush: serverFlush(studentId),
    persist: (snapshot) => Object.assign(local, snapshot),
    ...(now ? { now } : {}),
  });
  sync.hydrate({});
  sync.noteServerCopy(await serverRead(studentId));
  await sync.whenIdle();
  return { sync, local };
};
const keyOf = (item, record) => recoveryAnswerKey({ section: 'dol', opportunity: record.plan.opportunity || 1, itemId: item.itemId });
const saveOn = (device, record, item, response) => device.sync.save(keyOf(item, record), buildRecoveryAnswerValue({ itemId: item.itemId, fingerprint: item.pin.fingerprint, response }));
// What the runner submits from this device: each plan item's saved answer,
// laid only onto the instance it answers.
const responsesOn = (device, record) => Object.fromEntries(record.plan.items.flatMap((item) => {
  const entry = device.sync.entry(keyOf(item, record));
  if (!entry?.value?.response || entry.value.closed || entry.value.fingerprint !== item.pin.fingerprint) return [];
  return [[item.itemId, entry.value.response]];
}));

const allKeys = (value, found = new Set()) => {
  if (typeof value === 'string') {
    if (/^[[{]/.test(value.trim())) { try { allKeys(JSON.parse(value), found); } catch { /* text */ } }
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach((entry) => allKeys(entry, found)); return found; }
  Object.entries(value).forEach(([key, nested]) => { found.add(key); allKeys(nested, found); });
  return found;
};

/* ------------------------------------------------------------- fixture */

const cleanup = async () => {
  for (const name of ['classes', 'grades', 'assignments', 'studentWorkspaceDrafts']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || String(doc.data()?.studentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
};

before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS).set({ name: 'Recovery drafts — Period 3', period: 'Period 3', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  await db.collection('assignments').doc(ASSIGNMENT.id).set(assignmentDoc(ASSIGNMENT));
  for (const studentId of STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId, classId: CLASS, classPeriod: 'Period 3', assignedTeacherEmail: TEACHER, status: 'active',
      gradesByAssignment: { [ASSIGNMENT.id]: ORIGINAL_TRACKER },
    });
  }
});

after(cleanup);

test('answers saved on one device are graded when the Recovery is submitted from another', async () => {
  const studentId = CROSS_DEVICE_STUDENT;
  const started = await practiceAndStart(studentId);
  const [q1, q2, q3] = started.plan.items;
  const trackerBefore = JSON.stringify((await gradeDoc(studentId)).gradesByAssignment[ASSIGNMENT.id]);

  // Device 1 answers Q1 and Q2; each is "saved" only once the server has it.
  const first = await openDevice(studentId, 'chromebook-1');
  saveOn(first, started, q1, correctResponse(reproduce(q1)));
  saveOn(first, started, q2, correctResponse(reproduce(q2)));
  assert.equal(first.sync.savedWhere(keyOf(q1, started)), RECOVERY_ANSWER_SAVED_WHERE.SAVING);
  assert.equal(await first.sync.whenIdle(), true);
  assert.equal(first.sync.savedWhere(keyOf(q1, started)), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
  assert.equal(first.sync.savedWhere(keyOf(q2, started)), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);

  // The stored draft is the student's answers and nothing else.
  const stored = (await draftRef(studentId).get()).data();
  assert.equal(stored.studentId, studentId);
  assert.equal(stored.secure, false);
  assert.equal(stored.entries.length, 2);
  const keys = allKeys(stored);
  RECOVERY_DRAFT_FORBIDDEN_KEYS.forEach((forbidden) => assert.ok(!keys.has(forbidden), `no "${forbidden}" in the server draft`));
  for (const item of [q1, q2, q3]) {
    const { instance } = reproduce(item);
    // The pin's own answer object never travels (the student's typed values may equal it).
    assert.ok(!JSON.stringify(stored).includes(JSON.stringify(instance.answer)), 'no answer-key object in the draft');
  }

  // Device 2: a fresh browser context — nothing of its own.
  const second = await openDevice(studentId, 'chromebook-2', { now: () => 5 });
  assert.deepEqual(Object.keys(responsesOn(second, started)).sort(), [q1.itemId, q2.itemId].sort(), 'both answers are there before Submit');
  saveOn(second, started, q3, correctResponse(reproduce(q3)));
  await second.sync.whenIdle();

  const submitted = await recovery(studentId, 'submit', { responses: responsesOn(second, started) });
  const record = await recordOf(studentId);
  assert.equal(record.status, 'completed');
  for (const item of [q1, q2, q3]) {
    assert.equal(record.results[item.itemId].status, 'correct', `${item.itemId} is graded from the saved answer`);
    assert.ok(record.results[item.itemId].credit > 0, `${item.itemId} earns its credit`);
    assert.notEqual(record.results[item.itemId].reason, 'no-answer');
  }
  assert.equal(submitted.rawScore, 100);
  assert.equal(submitted.recordedScore, 90, 'gates and caps unchanged: a Recovery records at most 90');
  assert.equal(JSON.stringify((await gradeDoc(studentId)).gradesByAssignment[ASSIGNMENT.id]), trackerBefore, 'the original DOL evidence is untouched');
});

test('the bug this fixes: answers that never left the first device are submitted as unanswered for 0', async () => {
  const studentId = DEVICE_ONLY_STUDENT;
  const started = await practiceAndStart(studentId);
  const [q1, q2] = started.plan.items;
  // The build before this change: the answers exist only on device 1, so
  // device 2 has nothing to send.
  const deviceOneOnly = { [q1.itemId]: correctResponse(reproduce(q1)), [q2.itemId]: correctResponse(reproduce(q2)) };
  assert.equal(Object.keys(deviceOneOnly).length, 2);
  const second = await openDevice(studentId, 'chromebook-2');
  assert.deepEqual(responsesOn(second, started), {}, 'no server copy: device 2 sees no saved answers');
  await recovery(studentId, 'submit', { responses: responsesOn(second, started) });
  const record = await recordOf(studentId);
  for (const item of [q1, q2]) {
    assert.deepEqual(
      { status: record.results[item.itemId].status, credit: record.results[item.itemId].credit, reason: record.results[item.itemId].reason },
      { status: 'unanswered', credit: 0, reason: 'no-answer' },
      'grading itself is unchanged: an answer that never arrives is unanswered',
    );
  }
});
