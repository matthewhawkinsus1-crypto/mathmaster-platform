/*
 * A SECURE ITEM STORES WHATEVER ITS AUTHORED QUESTION NESTS.
 *
 * Test, Retest and Corrections issuance spread the whole instantiated question
 * onto the secure document (buildCourseTestExamItem, buildSimulationExamItem,
 * issueTestCycleCorrectionQuestion). Firestore refuses an array directly
 * inside an array anywhere in a document, and authored content is full of
 * them: the Algebra II A2.3B 3×3 RREF item's `matrix.rows`, table stimuli,
 * regression `points`. Encoding only `privateGrading`/`tool` left those, so
 * the write failed and the student could not be issued the item.
 *
 * These tests issue the real bank families in the shape the Test Cycle writes,
 * walk the stored form for any array in an array, read it back, and grade the
 * read-back copy with the real grader against the original's verdict.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { loadBankFamilies } from '../fixtures/secureRichToolAnswers.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const storage = require('../../functions/lib/secureItemStorage.js');

const bank = await loadBankFamilies();
const A2_3B = bank.filter((family) => family.id.startsWith('mm_A2_3B_v2_'));

/** Every path at which an array sits directly inside an array — what Firestore rejects. */
const nestedArrayPaths = (value, path = '', insideArray = false, found = []) => {
  if (Array.isArray(value)) {
    if (insideArray) found.push(path);
    value.forEach((entry, index) => nestedArrayPaths(entry, `${path}[${index}]`, true, found));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => nestedArrayPaths(entry, `${path}.${key}`, false, found));
  }
  return found;
};

/** The item buildCourseTestExamItem hands to storableItem (index.js), before storage. */
const testCycleItem = async (family, seed = 'nested|seed-1') => {
  const instantiated = await mathPath.instantiateQuestion(family, seed);
  if (!instantiated.question) return null;
  const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
  if (!issuePlan.issuable) return null;
  return {
    ...instantiated.question,
    bankQuestionId: family.id,
    familyId: family.id,
    questionInstanceId: 'examq-1',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    slotId: 'slot-1',
    generatorParameters: instantiated.parameters,
    privateGrading: issuePlan.privateGrading,
    ...issuePlan.toolPayload,
  };
};

/** A right answer and a wrong one, read from the key (this tests storage, not the student path). */
const answersFor = (privateGrading) => {
  if (privateGrading?.pathToolId === 'systemsWorkspace') {
    const { x, y, z } = privateGrading.definition.solution;
    return [
      { responses: {}, raw: { classification: 'one', technologyUsed: true, x, y, z } },
      { responses: {}, raw: { classification: 'one', technologyUsed: true, x: x + 1, y, z } },
    ];
  }
  const fields = privateGrading.fields;
  return [
    { responses: Object.fromEntries(fields.map((field) => [field.id, String(field.expected)])) },
    { responses: Object.fromEntries(fields.map((field) => [field.id, 'nonsense'])) },
  ];
};

test('the A2.3B matrix item nests arrays — the reason this exists', async () => {
  const item = await testCycleItem(A2_3B.find((family) => family.id === 'mm_A2_3B_v2_matrix-technology-rref'));
  assert.ok(nestedArrayPaths(item).some((path) => path.startsWith('.matrix.')), 'the raw item holds matrix rows');
});

test('every A2.3B family stores with no array inside an array, reads back deep-equal, and grades the same', async () => {
  assert.equal(A2_3B.length >= 5, true, `${A2_3B.length} A2.3B families`);
  for (const family of A2_3B) {
    for (const seed of ['nested|seed-1', 'nested|seed-2', 'nested|seed-3']) {
      // eslint-disable-next-line no-await-in-loop
      const item = await testCycleItem(family, seed);
      assert.ok(item, `${family.id} issues`);
      const stored = storage.storableItem(item);
      assert.deepEqual(nestedArrayPaths(stored), [], `${family.id} stores without nested arrays`);
      // What Firestore hands back is plain data: no functions, no undefined.
      const fromFirestore = JSON.parse(JSON.stringify(stored));
      assert.deepEqual(storage.readStoredItem(fromFirestore), item, `${family.id} reads back as issued`);
      const [right, wrong] = answersFor(item.privateGrading);
      for (const [label, payload] of [['right', right], ['wrong', wrong]]) {
        // eslint-disable-next-line no-await-in-loop
        const original = await secureItems.gradeIssuedItem(item, payload);
        // eslint-disable-next-line no-await-in-loop
        const reloaded = await secureItems.gradeIssuedItem(fromFirestore, payload);
        assert.deepEqual(reloaded, original, `${family.id} ${label} answer grades the same after storage`);
        assert.equal(original.isCorrect, label === 'right', `${family.id} ${label} answer is ${label}`);
      }
    }
  }
});

test('the matrix item is served from storage exactly as issued, matrix included, in every secure mode', async () => {
  const item = await testCycleItem(A2_3B.find((family) => family.id === 'mm_A2_3B_v2_matrix-technology-rref'));
  const stored = JSON.parse(JSON.stringify(storage.storableItem(item)));
  const served = await secureItems.publicItem(stored, { mode: 'secureTest' });
  assert.deepEqual(served.tool.matrix.rows, item.tool.matrix.rows, 'the student sees the matrix');
  for (const mode of ['secureTest', 'secureRetest', 'corrections']) {
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(await secureItems.publicItem(stored, { mode }), await secureItems.publicItem(item, { mode }), mode);
  }
  // Corrections re-stores the open item with its attempt count, unencoded.
  const reopened = { ...stored, attemptsUsed: 1 };
  assert.deepEqual(storage.readStoredItem(reopened), { ...item, attemptsUsed: 1 });
});

test('every bank family stores in the Test Cycle shape with no array inside an array', async () => {
  const failures = [];
  let issued = 0;
  for (const family of bank) {
    if (family.active === false) continue;
    let item;
    // eslint-disable-next-line no-await-in-loop
    try { item = await testCycleItem(family); } catch { continue; }
    if (!item) continue;
    issued += 1;
    const stored = storage.storableItem(item);
    if (nestedArrayPaths(stored).length) failures.push(family.id);
    else assert.deepEqual(storage.readStoredItem(JSON.parse(JSON.stringify(stored))), JSON.parse(JSON.stringify(item)), family.id);
  }
  assert.ok(issued > 1000, `${issued} families issued`);
  assert.deepEqual(failures, []);
});

test('the codec reads documents written before it, and decodes only what it encoded', () => {
  // Written by the two-field codec: privateGradingJson/toolJson, no list.
  const legacy = {
    questionInstanceId: 'q',
    privateGrading: { ...storage.ENCODED_GRADING_STAND_IN, fields: [null] },
    privateGradingJson: JSON.stringify({ pathToolId: 'relationMapping', definition: { arrows: [[1, 2]] } }),
    toolJson: JSON.stringify({ points: [[0, 1]] }),
  };
  assert.deepEqual(storage.readStoredItem(legacy), {
    questionInstanceId: 'q',
    privateGrading: { pathToolId: 'relationMapping', definition: { arrows: [[1, 2]] } },
    tool: { points: [[0, 1]] },
  });
  // A field that merely ends in "Json" is authored content, never decoded.
  const authored = { prompt: 'p', stimulusJson: '{"a":1}' };
  assert.deepEqual(storage.readStoredItem(storage.storableItem(authored)), authored);
  // An item with no nested array is stored exactly as it was.
  assert.deepEqual(storage.storableItem(authored), authored);
  // Storing a stored item again — with a field it gained since — keeps both decodable.
  const item = { prompt: 'p', matrix: { rows: [[1, 2], [3, 4]] } };
  const twice = storage.storableItem({ ...storage.storableItem(item), points: [[0, 1]] });
  assert.deepEqual(storage.readStoredItem(twice), { ...item, points: [[0, 1]] });
  // An encoding that would overwrite one of the item's own fields refuses.
  assert.throws(() => storage.storableItem({ matrix: [[1]], matrixJson: 'mine' }), /already has "matrixJson"/);
});
