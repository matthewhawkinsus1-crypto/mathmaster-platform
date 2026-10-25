/*
 * D10 PHASE 1, P1-4: THE SHADOW TRIGGER THAT STORES EACH ASSIGNMENT'S ANSWER
 * KEYS (functions/lib/assignmentKeyShadow.js, exported as shadowAssignmentKeys
 * from functions/entry.js; ANSWER_KEY_SERVER_SIDE_DESIGN.md §3; SI02).
 *
 * Proven here against an in-memory Firestore that records every read and
 * write (the real Admin SDK against the emulator:
 * tests/integration/assignmentKeyShadow.test.mjs):
 *   - what the key document holds, and that it gives back the stored sections
 *     exactly (through the storage encoding);
 *   - idempotent by sourceContentHash: an assignment write that leaves the
 *     sections alone writes nothing, and takes no transaction;
 *   - a late event for an older version cannot store old keys: the write
 *     re-reads the assignment in a transaction;
 *   - a deleted (or non-V5) assignment loses its key document;
 *   - a split that refuses stores the reason and no keys;
 *   - the assignment is read through a field mask (sections only), and is
 *     never written;
 *   - the deployed function is a Firestore write trigger on assignments/{id}.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { repairKnownFirestoreNestedArrays } from '../../src/platform/persistence/firestoreAssignmentSafety.js';
import { stableStringify } from '../../functions/shared/idUtils.mjs';
import {
  ASSIGNMENT_KEYS_COLLECTION, ASSIGNMENT_KEYS_SCHEMA_VERSION, SPLIT_VERSION, mergeAssignment, splitAssignment,
} from '../../functions/shared/assignmentKeySplit.mjs';

const require = createRequire(import.meta.url);
const shadow = require('../../functions/lib/assignmentKeyShadow.js');
const { readStoredItem } = require('../../functions/lib/secureItemStorage.js');

const { SHADOW_OUTCOME } = shadow;
const SERVER_TIME = { serverTimestamp: true };
const serverTimestamp = () => SERVER_TIME;
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/*
 * An in-memory Firestore: documents by path, reads masked the way a field mask
 * masks them, and a log of every read (with its mask), transaction and write.
 */
const memoryFirestore = (initial = {}) => {
  const documents = new Map(Object.entries(initial).map(([key, value]) => [key, clone(value)]));
  const log = { reads: [], writes: [], transactions: 0 };
  const masked = (data, fieldMask) => {
    if (data === undefined) return undefined;
    if (!fieldMask) return clone(data);
    return Object.fromEntries(fieldMask.filter((field) => field in data).map((field) => [field, clone(data[field])]));
  };
  const snapshot = (path, fieldMask) => {
    const data = documents.get(path);
    return { id: path.split('/').pop(), exists: data !== undefined, data: () => masked(data, fieldMask) };
  };
  const readAll = (args, how) => {
    const options = args.length && !args[args.length - 1].path ? args.pop() : {};
    return args.map((ref) => {
      log.reads.push({ path: ref.path, fieldMask: options.fieldMask || null, how });
      return snapshot(ref.path, options.fieldMask || null);
    });
  };
  const db = {
    documents,
    log,
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    getAll: async (...args) => readAll(args, 'direct'),
    runTransaction: async (update) => {
      log.transactions += 1;
      const pending = [];
      const transaction = {
        getAll: async (...args) => readAll(args, 'transaction'),
        get: async (ref) => readAll([ref], 'transaction')[0],
        set: (ref, data) => { pending.push(['set', ref.path, data]); },
        delete: (ref) => { pending.push(['delete', ref.path]); },
      };
      const result = await update(transaction);
      pending.forEach(([kind, path, data]) => {
        log.writes.push({ kind, path });
        if (kind === 'set') documents.set(path, data);
        else documents.delete(path);
      });
      return result;
    },
  };
  return db;
};

// A real lesson, stored as a save stores it, with per-student fields an
// assignment can still carry.
const lesson = () => {
  const text = readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url), 'utf8');
  const stored = clone(repairKnownFirestoreNestedArrays(parseAssignmentBlueprintText(text).assignmentV5).value);
  return { ...stored, studentOverrides: { S1: { lateDueAt: 'per-student' } }, excusedStudentIds: ['S2'] };
};
const KEYS_PATH = `${ASSIGNMENT_KEYS_COLLECTION}/a1`;
const hashOf = (sections) => createHash('sha256').update(stableStringify(sections)).digest('hex');
const decodedKeys = (document) => Object.fromEntries(Object.entries(document.keysByQuestionId).map(([id, part]) => [id, readStoredItem(part)]));
const sync = (db) => shadow.syncAssignmentKeys({ db, assignmentId: 'a1', serverTimestamp });
const onWrite = (db, after) => shadow.shadowAssignmentKeysOnWrite({ db, assignmentId: 'a1', after, serverTimestamp });
const snapshotOf = (data) => ({ exists: data !== undefined, data: () => clone(data) });
// The first typed answer in the lesson, to edit.
const firstAnswerField = (assignment) => assignment.sections.flatMap((section) => section.questions)
  .flatMap((question) => question.answerFields || []).find((field) => typeof field.answer === 'string');

test('the key document holds every keyed question\'s private part, and gives back the stored sections exactly', async () => {
  const assignment = lesson();
  const db = memoryFirestore({ 'assignments/a1': assignment });
  const result = await sync(db);
  const document = db.documents.get(KEYS_PATH);
  assert.deepEqual(result, { outcome: SHADOW_OUTCOME.CREATED, reason: null, keyedQuestions: Object.keys(document.keysByQuestionId).length });
  assert.ok(result.keyedQuestions > 20, `${result.keyedQuestions} questions carried keys`);
  assert.deepEqual(Object.keys(document).sort(), ['keysByQuestionId', 'schemaVersion', 'sourceContentHash', 'splitVersion', 'status', 'updatedAt']);
  assert.equal(document.schemaVersion, ASSIGNMENT_KEYS_SCHEMA_VERSION);
  assert.equal(document.splitVersion, SPLIT_VERSION);
  assert.equal(document.status, 'split');
  assert.equal(document.updatedAt, SERVER_TIME);
  assert.equal(document.sourceContentHash, hashOf(assignment.sections));
  const { publicSections } = splitAssignment(assignment.sections);
  const merged = mergeAssignment(publicSections, decodedKeys(document));
  assert.equal(JSON.stringify(merged), JSON.stringify(assignment.sections));
  // The keys left the public half, and nothing about any student is in the copy.
  assert.doesNotMatch(JSON.stringify(publicSections), /"answer":/);
  assert.doesNotMatch(JSON.stringify(document), /per-student|studentOverrides|excusedStudentIds/);
});

test('the assignment is read through a field mask, never written, and the shadow changes nothing a student reads', async () => {
  const assignment = lesson();
  const db = memoryFirestore({ 'assignments/a1': assignment });
  await sync(db);
  const assignmentReads = db.log.reads.filter((read) => read.path === 'assignments/a1');
  assert.ok(assignmentReads.length >= 1);
  assignmentReads.forEach((read) => assert.deepEqual(read.fieldMask, ['schemaVersion', 'sections']));
  db.log.reads.filter((read) => read.path === KEYS_PATH).forEach((read) => assert.deepEqual(read.fieldMask, ['schemaVersion', 'splitVersion', 'sourceContentHash']));
  assert.deepEqual(db.log.writes, [{ kind: 'set', path: KEYS_PATH }]);
  assert.deepEqual(db.documents.get('assignments/a1'), assignment, 'the assignment keeps every key');
});

test('idempotent: unchanged sections write nothing, changed sections are stored again, a new split version recomputes', async () => {
  const assignment = lesson();
  const db = memoryFirestore({ 'assignments/a1': assignment });
  await sync(db);
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.CURRENT);
  // A write that is not about content: a due date.
  db.documents.set('assignments/a1', { ...assignment, dueAt: '2026-11-01' });
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.CURRENT);
  assert.equal(db.log.writes.length, 1);
  // A content edit.
  const edited = clone(assignment);
  firstAnswerField(edited).answer = 'edited answer';
  db.documents.set('assignments/a1', edited);
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.UPDATED);
  const document = db.documents.get(KEYS_PATH);
  assert.equal(document.sourceContentHash, hashOf(edited.sections));
  assert.match(JSON.stringify(decodedKeys(document)), /edited answer/);
  // A key document from an older split is recomputed.
  db.documents.set(KEYS_PATH, { ...document, splitVersion: SPLIT_VERSION - 1 });
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.UPDATED);
  assert.equal(db.documents.get(KEYS_PATH).splitVersion, SPLIT_VERSION);
});

test('a write that leaves the sections alone is skipped without a transaction', async () => {
  const assignment = lesson();
  const db = memoryFirestore({ 'assignments/a1': assignment });
  await sync(db);
  const transactions = db.log.transactions;
  const result = await onWrite(db, snapshotOf({ ...assignment, title: 'Renamed' }));
  assert.equal(result.outcome, SHADOW_OUTCOME.CURRENT);
  assert.equal(db.log.transactions, transactions, 'no transaction, so no lock on the assignment');
  assert.ok(db.log.reads.filter((read) => read.how === 'direct').every((read) => read.path === KEYS_PATH && read.fieldMask.length === 3));
});

test('a late event for an older version cannot store old keys: the write re-reads the assignment', async () => {
  const older = lesson();
  const newer = clone(older);
  firstAnswerField(newer).answer = 'newer answer';
  const db = memoryFirestore({ 'assignments/a1': newer });
  // The newer write's event arrives first.
  assert.equal((await onWrite(db, snapshotOf(newer))).outcome, SHADOW_OUTCOME.CREATED);
  // Then the older write's event, carrying the older sections.
  const late = await onWrite(db, snapshotOf(older));
  assert.equal(late.outcome, SHADOW_OUTCOME.CURRENT);
  assert.equal(db.documents.get(KEYS_PATH).sourceContentHash, hashOf(newer.sections));
  assert.equal(db.log.writes.length, 1);
});

test('a deleted assignment, or one that is not V5, has no key document', async () => {
  const assignment = lesson();
  const db = memoryFirestore({ 'assignments/a1': assignment });
  await sync(db);
  db.documents.delete('assignments/a1');
  assert.equal((await onWrite(db, snapshotOf(undefined))).outcome, SHADOW_OUTCOME.DELETED);
  assert.equal(db.documents.has(KEYS_PATH), false);
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.ABSENT);
  // Deleted and then created again before the delete's event ran: the keys follow the document that exists.
  db.documents.set('assignments/a1', assignment);
  assert.equal((await onWrite(db, snapshotOf(undefined))).outcome, SHADOW_OUTCOME.CREATED);
  db.documents.set('assignments/a1', { schemaVersion: 4, questions: [{ type: 'literal', answer: '2' }] });
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.DELETED);
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.NOT_V5);
  assert.equal(db.documents.has(KEYS_PATH), false);
});

test('a split that refuses stores why, with no keys, and is not recomputed while the sections stay the same', async () => {
  const sections = [{ id: 'dol', role: 'dol', questions: [{ type: 'literal', prompt: 'x + 1 = 3', acceptedAnswers: ['2'] }] }];
  const db = memoryFirestore({ 'assignments/a1': { schemaVersion: 5, sections } });
  assert.deepEqual(await sync(db), { outcome: SHADOW_OUTCOME.UNSPLITTABLE, reason: 'question-without-id', keyedQuestions: null });
  const document = db.documents.get(KEYS_PATH);
  assert.equal(document.status, 'unsplittable');
  assert.equal(document.reason, 'question-without-id');
  assert.equal('keysByQuestionId' in document, false);
  assert.equal((await sync(db)).outcome, SHADOW_OUTCOME.CURRENT);
  // Two questions with one id, one of them keyed.
  const shared = [{ id: 's', questions: [{ questionId: 'q', answer: '1' }, { questionId: 'q', prompt: 'p' }] }];
  assert.equal((await shadow.planAssignmentKeys({ assignment: { schemaVersion: 5, sections: shared } })).reason, 'duplicate-question-id');
  // Keys for one question larger than a Firestore document can hold.
  const huge = [{ id: 's', questions: [{ questionId: 'q', hints: ['x'.repeat(shadow.MAX_KEY_DOCUMENT_BYTES)] }] }];
  assert.equal((await shadow.planAssignmentKeys({ assignment: { schemaVersion: 5, sections: huge } })).reason, 'too-large');
});

test('a key holding an array inside an array is stored as JSON (Firestore refuses the array), and read back whole', async () => {
  const sections = [{ id: 's', questions: [{ questionId: 'q1', type: 'x', grading: { pairs: [[1, 2], [3, 4]] } }] }];
  const plan = await shadow.planAssignmentKeys({ assignment: { schemaVersion: 5, sections } });
  assert.equal(plan.outcome, SHADOW_OUTCOME.CREATED);
  const stored = plan.document.keysByQuestionId.q1;
  assert.equal(typeof stored.fieldsJson, 'string');
  assert.equal('fields' in stored, false);
  const { publicSections } = splitAssignment(sections);
  assert.deepEqual(mergeAssignment(publicSections, { q1: readStoredItem(stored) }), sections);
});

test('the deployed function is a Firestore write trigger on assignments/{assignmentId}, never retried', () => {
  const entry = require('../../functions/platformEntry.js');
  const endpoint = entry.shadowAssignmentKeys?.__endpoint;
  assert.ok(endpoint, 'shadowAssignmentKeys is exported by the deployed entry point');
  assert.equal(endpoint.eventTrigger.eventType, 'google.cloud.firestore.document.v1.written');
  assert.equal(endpoint.eventTrigger.eventFilterPathPatterns.document, 'assignments/{assignmentId}');
  assert.notEqual(endpoint.eventTrigger.retry, true);
});
