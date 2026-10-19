// A Test, Retest or Corrections item stores whatever its question nests — against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-secure-nested \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs \
//      --test tests/integration/secureItemNestedArraysStorage.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY. Secure issuance spreads the whole instantiated question onto the
// document. The Algebra II A2.3B RREF item carries `matrix.rows`, table items
// a stimulus of rows, regression items `points` — arrays of arrays outside the
// two tool fields the codec used to encode, so the write was refused and the
// student could not be issued the item. The Admin SDK accepts such values
// offline; only the emulator refuses them. The unit-level twin is
// tests/platform/secureItemNestedArrays.test.mjs.

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

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-secure-nested' });
const db = admin.firestore();
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const secureItems = require(path.join(repo, 'functions/lib/secureItems.js'));
const storage = require(path.join(repo, 'functions/lib/secureItemStorage.js'));
const { loadBankFamilies } = await import(path.join(repo, 'tests/fixtures/secureRichToolAnswers.mjs'));

const bank = await loadBankFamilies();
const PREFIX = 'securenested_';

/** The item buildCourseTestExamItem / issueTestCycleCorrectionQuestion store. */
const testCycleItem = async (family) => {
  const instantiated = await mathPath.instantiateQuestion(family, `${PREFIX}${family.id}`);
  if (!instantiated.question) return null;
  const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
  if (!issuePlan.issuable) return null;
  return {
    ...instantiated.question,
    bankQuestionId: family.id,
    familyId: family.id,
    questionInstanceId: `${PREFIX}${family.id}`,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    generatorParameters: instantiated.parameters,
    privateGrading: issuePlan.privateGrading,
    ...issuePlan.toolPayload,
  };
};

test('the A2.3B matrix item is refused unencoded, stored encoded, and grades the same read back', async () => {
  const item = await testCycleItem(bank.find((family) => family.id === 'mm_A2_3B_v2_matrix-technology-rref'));
  const ref = db.collection('testCycleCorrectionPlans').doc(`${PREFIX}matrix`);
  // The emulator is really checking: the item as the old codec stored it is refused.
  const { matrix, ...rest } = item;
  const oldForm = { ...storage.storableItem(rest), matrix };
  await assert.rejects(ref.set({ activeQuestions: { c1: oldForm } }), /array value in an array value|nested arrays/i);
  await ref.set({ activeQuestions: { c1: storage.storableItem(item) } });
  const stored = (await ref.get()).data().activeQuestions.c1;
  assert.deepEqual(storage.readStoredItem(stored), item);
  const { x, y, z } = item.privateGrading.definition.solution;
  const payload = { responses: {}, raw: { classification: 'one', technologyUsed: true, x, y, z } };
  const reloaded = await secureItems.gradeIssuedItem(stored, payload);
  assert.equal(reloaded.isCorrect, true);
  assert.deepEqual(reloaded, await secureItems.gradeIssuedItem(item, payload));
});

test('every bank family that nests arrays outside the tool fields stores on a secure item document', async () => {
  const nested = [];
  for (const family of bank.filter((entry) => entry.active !== false)) {
    let item;
    // eslint-disable-next-line no-await-in-loop
    try { item = await testCycleItem(family); } catch { continue; }
    if (!item) continue;
    if (storage.holdsNestedArray({ ...item, privateGrading: null, tool: null })) nested.push(item);
  }
  assert.ok(nested.length >= 300, `the affected families are all here (${nested.length})`);
  const writer = db.bulkWriter();
  const failures = [];
  writer.onWriteError((error) => { failures.push(error.documentRef.id); return false; });
  nested.forEach((item) => writer.set(db.collection('secureExamSessions').doc(`${PREFIX}${item.familyId}`), { item: storage.storableItem(item) }));
  await writer.close();
  assert.deepEqual(failures, []);
  for (const item of nested.slice(0, 40)) {
    // eslint-disable-next-line no-await-in-loop
    const stored = (await db.collection('secureExamSessions').doc(`${PREFIX}${item.familyId}`).get()).data().item;
    assert.deepEqual(storage.readStoredItem(stored), JSON.parse(JSON.stringify(item)), item.familyId);
  }
});
