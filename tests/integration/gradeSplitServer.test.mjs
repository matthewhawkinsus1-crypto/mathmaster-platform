// THE SERVER STORES QUESTION RECORDS SPLIT, AND READS THEM BACK EXACTLY.
//
// Against the Firestore emulator, through functions/lib/gradeDetailStore.js:
// a student's records written before the split are moved (splitInlineRecords)
// with every record intact and grading the same; a second move does nothing; a
// record written later replaces its detail entry whole (no stale field
// survives); a whole tracker written split replaces its detail document; and
// every read path joins records back to exactly what was stored.
//
//   firebase emulators:exec --only firestore --project mathmaster-finish-harness \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/gradeSplitServer.test.mjs"
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const store = require(path.join(repo, 'functions/lib/gradeDetailStore.js'));
const runtime = require(path.join(repo, 'functions/lib/classroomGradeRuntime.js'));

const P = 'gsplit-';
let db;

const step = (stepNumber, before, afterEq) => ({
  kind: 'operation', label: `Step ${stepNumber}`, stepNumber, variantIndex: 0, mode: 'guided',
  equationBefore: before, equationAfter: afterEq, earned: 1, possible: 1, expectedTotalPoints: 3,
  accepted: true, productive: true, recordedAt: '2026-11-13T14:24:18.412Z',
});
const stepRecord = () => ({
  status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0, variantIndex: 0,
  timeSpent: 210, lastAttemptAt: '2026-11-13T14:24:18.412Z', lastSubmissionId: 'sub-1', gradedBy: 'server',
  stepGrades: [step(1, '2x+3=11', '2x=8'), step(2, '2x=8', 'x=4')],
  algebraState: { equation: 'x=4', stepNumber: 2 }, partGrades: [], lastResponseKey: '{"x":"4"}', questionDetails: 'Solve 2x + 3 = 11',
  supportUsage: { hintUsed: false, isMathematicallyIndependent: true, accommodations: [] },
});
const partRecord = () => ({
  status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100, variantIndex: 1,
  timeSpent: 95, lastAttemptAt: '2026-11-14T21:27:14.720Z',
  partGrades: [{ id: 'm', label: 'slope', isComplete: true, isCorrect: true }], stepGrades: [],
  lastResponseKey: '{"m":"2"}', questionDetails: 'y = 2x - 1', familyDelivery: { familyId: 'lines', seat: 14 },
  supportUsage: { hintUsed: true, isMathematicallyIndependent: false, accommodations: ['read-aloud'] }, algebraState: null,
});
const strip = (record) => {
  if (!record || typeof record !== 'object') return record;
  const { detailRef, stepCredit, ...rest } = record;
  return rest;
};
const DETAIL_FIELDS = ['partGrades', 'stepGrades', 'supportUsage', 'lastResponseKey', 'questionDetails', 'algebraState', 'familyDelivery'];

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'runs against the Firestore emulator only');
  const app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' }, 'grade-split-server');
  db = app.firestore();
});

after(async () => {
  await Promise.all(admin.apps.filter((app) => app?.name === 'grade-split-server').map((app) => app.delete()));
});

test('a student\'s records stored whole move into the split intact, grading the same; a second move does nothing', async () => {
  const studentId = `${P}s1`;
  const gradeRef = db.collection('grades').doc(studentId);
  const original = { a1: { 0: stepRecord(), 1: partRecord(), 2: 'attempted' }, a2: { 0: partRecord() } };
  await gradeRef.set({ classId: `${P}c`, gradesByAssignment: original });

  const moved = await store.splitInlineRecords({ db, studentId });
  // a1/0's steps earned more than its stored credit: a reader built before the
  // split would grade its summary lower, so it stays whole
  // (gradeEntryStorage.mjs splitIsFaithful; tests/platform/gradeSplitOlderReaders.test.mjs).
  assert.deepEqual(moved, { split: 2, kept: 1 });

  const stored = (await gradeRef.get()).data();
  assert.deepEqual(stored.gradesByAssignment.a1[0], original.a1[0], 'a1/0 is left whole');
  for (const [assignmentId, tracker] of Object.entries(stored.gradesByAssignment)) {
    for (const [key, summary] of Object.entries(tracker)) {
      if (typeof summary !== 'object') { assert.equal(summary, original[assignmentId][key]); continue; }
      if (assignmentId === 'a1' && key === '0') continue;
      assert.equal(typeof summary.detailRef, 'string');
      for (const field of DETAIL_FIELDS) assert.ok(!(field in summary), `${assignmentId}/${key}: ${field} moved off the grades document`);
      assert.equal(runtime.getQuestionCredit(summary), runtime.getQuestionCredit(original[assignmentId][key]), 'the summary alone grades the same');
    }
  }
  const detail = (await store.responseDetailRef(gradeRef, 'a1').get()).data();
  assert.deepEqual(Object.keys(detail.questions).sort(), ['1']);
  assert.equal(detail.studentId, studentId);

  const joined = await store.hydrateGradeData({ db, gradeRef, gradeData: stored });
  for (const [assignmentId, tracker] of Object.entries(original)) {
    for (const [key, record] of Object.entries(tracker)) assert.deepEqual(strip(joined.gradesByAssignment[assignmentId][key]), record);
  }

  assert.deepEqual(await store.splitInlineRecords({ db, studentId }), { split: 0, kept: 1 }, 'nothing left to move');
});

test('a record written later replaces its detail entry whole, in the same transaction as its summary', async () => {
  const studentId = `${P}s2`;
  const gradeRef = db.collection('grades').doc(studentId);
  await gradeRef.set({ classId: `${P}c`, gradesByAssignment: { a1: { 0: partRecord() } } });
  await store.splitInlineRecords({ db, studentId });

  // The next attempt carries no family pin: the old pin must not survive in the detail.
  const next = { ...partRecord(), totalAttempts: 3, attemptCount: 3, lastSubmissionId: 'sub-3' };
  delete next.familyDelivery;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(gradeRef);
    await store.hydrateGradeData({ transaction, gradeRef, gradeData: snapshot.data(), assignmentIds: ['a1'] });
    const update = await store.questionRecordUpdates({ writer: transaction, gradeRef, studentId, assignmentId: 'a1', questionKey: '0', record: next });
    transaction.update(gradeRef, ...update);
  });
  const stored = (await gradeRef.get()).data();
  const joined = await store.hydrateGradeData({ db, gradeRef, gradeData: stored, assignmentIds: ['a1'] });
  assert.deepEqual(strip(joined.gradesByAssignment.a1[0]), next);
  const detail = (await store.responseDetailRef(gradeRef, 'a1').get()).data();
  assert.ok(!('familyDelivery' in detail.questions[0]), 'no stale field survives a later write');
  assert.equal(detail.questions[0].detailRef, stored.gradesByAssignment.a1[0].detailRef);
});

test('a whole tracker written split replaces its detail document; rows load joined', async () => {
  const studentId = `${P}s3`;
  const gradeRef = db.collection('grades').doc(studentId);
  await gradeRef.set({ classId: `${P}c`, gradesByAssignment: { a1: { 0: stepRecord(), 1: partRecord() } } });
  await store.splitInlineRecords({ db, studentId });

  const [row] = await store.hydrateTrackerRows([{ studentId, ref: gradeRef, tracker: (await gradeRef.get()).data().gradesByAssignment.a1 }], 'a1', { db });
  assert.deepEqual(strip(row.tracker[0]), stepRecord());

  // A migration that keeps only question 0 (question 1 dropped).
  const storage = await store.gradeEntryStorage();
  const batch = db.batch();
  store.writeSplitTracker(storage, batch, gradeRef, 'a1', { 0: row.tracker[0] });
  await batch.commit();
  const detail = (await store.responseDetailRef(gradeRef, 'a1').get()).data();
  assert.deepEqual(Object.keys(detail.questions), ['0'], 'the detail document matches the tracker written');
  const joined = await store.hydrateGradeData({ db, gradeRef, gradeData: (await gradeRef.get()).data() });
  assert.deepEqual(Object.keys(joined.gradesByAssignment.a1), ['0']);
  assert.deepEqual(strip(joined.gradesByAssignment.a1[0]), stepRecord());
});

test('a summary reset by a writer that knows nothing of the split never shows the old detail', async () => {
  const studentId = `${P}s4`;
  const gradeRef = db.collection('grades').doc(studentId);
  await gradeRef.set({ classId: `${P}c`, gradesByAssignment: { a1: { 0: partRecord() } } });
  await store.splitInlineRecords({ db, studentId });
  const reset = { status: 'unattempted', attemptCount: 0, totalAttempts: 0, partialCredit: 0, bestPartialCredit: 0 };
  await gradeRef.update(new admin.firestore.FieldPath('gradesByAssignment', 'a1', '0'), reset);
  const joined = await store.hydrateGradeData({ db, gradeRef, gradeData: (await gradeRef.get()).data() });
  assert.deepEqual(joined.gradesByAssignment.a1[0], reset);
});
