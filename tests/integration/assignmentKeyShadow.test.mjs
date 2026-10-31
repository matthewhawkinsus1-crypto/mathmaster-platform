/*
 * D10 PHASE 1, P1-4, END TO END: the deployed shadowAssignmentKeys trigger
 * (functions/entry.js), run with the real Admin SDK against the Firestore
 * emulator, on real lessons stored the way a save stores them.
 *
 *   - Every lesson's key document is accepted by Firestore (no array inside an
 *     array, no field name it refuses, under the size limit), and read back
 *     from Firestore it gives back the stored sections exactly.
 *   - The assignment itself is never written: same data, same update time.
 *   - Running again, or after a write that is not about content, writes
 *     nothing; a content edit is stored again; a late event for an older
 *     version leaves the newer keys; a deleted assignment loses its key
 *     document; a split that refuses stores its reason and no keys.
 *
 * Own `akx-` ids only: every integration suite shares one emulator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { repairKnownFirestoreNestedArrays } from '../../src/platform/persistence/firestoreAssignmentSafety.js';
import { ASSIGNMENT_KEYS_COLLECTION, mergeAssignment, splitAssignment } from '../../functions/shared/assignmentKeySplit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

const entry = require(path.join(repo, 'functions/entry.js'));
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const { readStoredItem } = require(path.join(repo, 'functions/lib/secureItemStorage.js'));
const { assignmentKeysSourceHash } = require(path.join(repo, 'functions/lib/assignmentKeyShadow.js'));
const db = admin.firestore();

const LESSONS = Object.freeze({
  'akx-dol1': 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json',
  'akx-slopes': 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json',
  'akx-systems': 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json',
  'akx-family': 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json',
  'akx-matrices': 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json',
});
const storedLesson = (file) => {
  const { assignmentV5 } = parseAssignmentBlueprintText(readFileSync(path.join(repo, file), 'utf8'));
  return {
    ...JSON.parse(JSON.stringify(repairKnownFirestoreNestedArrays(assignmentV5).value)),
    assignedClassIds: ['akx-class'],
    // A per-student field an assignment can still carry: the shadow never reads it.
    studentOverrides: { 'akx-student': { lateDueAt: 'per-student' } },
  };
};

const assignmentRef = (id) => db.collection('assignments').doc(id);
const keysRef = (id) => db.collection(ASSIGNMENT_KEYS_COLLECTION).doc(id);
/** Run the real trigger as Firestore would after a write, with `after` as the event's snapshot. */
const fire = async (id, after) => entry.shadowAssignmentKeys.run({
  params: { assignmentId: id },
  data: { before: null, after: after === undefined ? await assignmentRef(id).get() : after },
});
const decoded = (keys) => Object.fromEntries(Object.entries(keys.keysByQuestionId || {}).map(([id, part]) => [id, readStoredItem(part)]));
/** The stored sections, rebuilt from their split public half and the key document read back from Firestore. */
const rebuilt = async (id) => {
  const [assignment, keys] = await Promise.all([assignmentRef(id).get(), keysRef(id).get()]);
  const sections = assignment.data().sections;
  return { sections, keys: keys.data(), merged: mergeAssignment(splitAssignment(sections).publicSections, decoded(keys.data())) };
};

test.before(async () => {
  await Promise.all(Object.keys(LESSONS).flatMap((id) => [assignmentRef(id).delete(), keysRef(id).delete()]));
  await Promise.all(['akx-broken', 'akx-gone'].flatMap((id) => [assignmentRef(id).delete(), keysRef(id).delete()]));
});

test('every lesson\'s key document is accepted by Firestore and gives back the stored sections exactly', async () => {
  for (const [id, file] of Object.entries(LESSONS)) {
    await assignmentRef(id).set(storedLesson(file));
    const before = await assignmentRef(id).get();
    await fire(id);
    const after = await assignmentRef(id).get();
    assert.deepEqual(after.data(), before.data(), `${id}: the assignment keeps every key`);
    assert.ok(after.updateTime.isEqual(before.updateTime), `${id}: the trigger never writes the assignment`);
    const { sections, keys, merged } = await rebuilt(id);
    assert.equal(keys.status, 'split', id);
    assert.equal(keys.sourceContentHash, await assignmentKeysSourceHash(sections), id);
    assert.ok(Object.keys(keys.keysByQuestionId).length > 0, `${id}: keys were stored`);
    assert.equal(JSON.stringify(merged), JSON.stringify(sections), `${id}: merged from Firestore`);
    assert.doesNotMatch(JSON.stringify(keys), /per-student/, `${id}: no student's field reaches the key document`);
  }
});

test('running again, or after a write that is not about content, writes nothing', async () => {
  const id = 'akx-slopes';
  const first = await keysRef(id).get();
  await fire(id);
  await assignmentRef(id).update({ dueAt: '2026-11-02T05:00:00.000Z' });
  await fire(id);
  const again = await keysRef(id).get();
  assert.ok(again.updateTime.isEqual(first.updateTime), 'the key document was not rewritten');
});

test('a content edit is stored again, and a late event for the older version leaves the newer keys', async () => {
  const id = 'akx-slopes';
  const older = await assignmentRef(id).get();
  const sections = older.data().sections;
  const question = sections.flatMap((section) => section.questions).find((entry) => entry.answerFields?.some((field) => typeof field.answer === 'string'));
  question.answerFields.find((field) => typeof field.answer === 'string').answer = 'akx edited answer';
  await assignmentRef(id).update({ sections });
  await fire(id);
  const { keys, merged } = await rebuilt(id);
  assert.equal(JSON.stringify(merged), JSON.stringify(sections));
  assert.match(JSON.stringify(decoded(keys)), /akx edited answer/);
  const stored = await keysRef(id).get();
  // The older write's event, arriving last.
  await fire(id, older);
  const late = await keysRef(id).get();
  assert.ok(late.updateTime.isEqual(stored.updateTime), 'the late event wrote nothing');
  assert.equal(late.data().sourceContentHash, await assignmentKeysSourceHash(sections));
});

test('a deleted assignment loses its key document; a split that refuses stores its reason and no keys', async () => {
  await assignmentRef('akx-gone').set(storedLesson(LESSONS['akx-dol1']));
  await fire('akx-gone');
  assert.equal((await keysRef('akx-gone').get()).exists, true);
  await assignmentRef('akx-gone').delete();
  await fire('akx-gone');
  assert.equal((await keysRef('akx-gone').get()).exists, false);

  await assignmentRef('akx-broken').set({ schemaVersion: 5, sections: [{ id: 'dol', role: 'dol', questions: [{ type: 'literal', prompt: 'x + 1 = 3', acceptedAnswers: ['2'] }] }] });
  await fire('akx-broken');
  const keys = (await keysRef('akx-broken').get()).data();
  assert.equal(keys.status, 'unsplittable');
  assert.equal(keys.reason, 'question-without-id');
  assert.equal(keys.keysByQuestionId, undefined);
});
