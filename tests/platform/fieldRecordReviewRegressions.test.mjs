/*
 * BATCH 3 INTEGRATION REVIEW: THE ANSWER-BY-ANSWER MERGE, DRIVEN END TO END.
 *
 * An adversarial review of claude/pass3-b3-persistence-client drove the real
 * modules — questionDraftStorage (the device), workspaceDraftSync (the
 * background save), mergeWorkspaceDraftDocumentReport (the transaction's
 * merge) and App.jsx's read sequence — and found what the unit cases missed.
 * Each case below is one of its repros, asserting the CORRECT outcome:
 *
 *   S1  a submitted attempt's draft must not be folded into the next attempt
 *       through the server merge (it re-dated the old answers, after which the
 *       device's "older than the last submission" guard let them through);
 *   S2  a reset must stay a reset: through a second save from a device that
 *       missed it, a retried save, two such devices in either order, and
 *       typing within the save's debounce after Start over;
 *   S3  answers an older build saved (no per-answer times) must not lose to an
 *       older dated copy once a device on this build takes them in;
 *   R6  field ids are data: "__proto__", "toString" and "constructor" are
 *       answers like any other, and a merge too big to store never lets a
 *       fresh partial copy replace the saved one.
 *
 * Known and not addressed here (it predates this branch): edit times come from
 * each device's clock, so a device whose clock runs fast keeps an earlier
 * answer over a later one made on a correct clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkspaceDraftPatch,
  mergeFieldRecordCopies,
  mergeWorkspaceDraftDocument,
  mergeWorkspaceDraftDocumentReport,
  readWorkspaceDraftEntries,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const STUDENT = 'S';
const ASSIGNMENT = 'A';
const keyFor = (question, suffix) => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student:${suffix}`;
const PREFIX = (question) => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student`;

let clock = Date.parse('2026-10-16T10:00:00Z');
const realNow = Date.now;
Date.now = () => clock;
test.after(() => { Date.now = realNow; });
const tick = (ms) => { clock += ms; return clock; };
const now = () => clock;

// One Firestore document, merged exactly as writeWorkspaceDraft's transaction does.
const server = { doc: null };
const serverEntry = (key) => readWorkspaceDraftEntries(server.doc).find((entry) => entry.key === key);
const patchOf = (entries) => buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries });
const seed = (entries) => mergeWorkspaceDraftDocument({ existing: null, patch: patchOf(entries) });

let instance = 0;
/**
 * A device: its own local storage, page (module instance) and sync, wired as
 * App.jsx wires them — including the submission time the sync is handed, and
 * the read sequence (settles, restore, then the sync told what the server has).
 * `canonical(questionIndex)` is the question's last submission on this device.
 */
const loadDevice = async (storage = new MemoryStorage(), { canonical = () => 0 } = {}) => {
  instance += 1;
  const activate = () => { globalThis.window = { localStorage: storage }; };
  activate();
  const m = await import(`../../src/questionDraftStorage.js?review=${instance}`);
  const listeners = {};
  m.trackStudentInput({ addEventListener: (type, listener) => { listeners[type] = listener; } });
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    scheduler: { set: () => 1, clear: () => {} },
    now: () => clock,
    canonicalSavedAt: (questionIndex) => canonical(questionIndex),
    flush: ({ document }) => {
      const report = mergeWorkspaceDraftDocumentReport({ existing: server.doc, patch: document });
      server.doc = JSON.parse(JSON.stringify(report.document)); // a Firestore round trip
      return { written: true, droppedKeys: report.droppedKeys };
    },
  });
  m.subscribeToQuestionDrafts((event) => sync.record(event));
  const canonicalSavedAt = (entry) => canonical(entry?.questionIndex);
  const wrap = (fn) => (...args) => { activate(); return fn(...args); };
  return {
    sync,
    input: () => listeners.keydown?.({ isTrusted: true }),
    read: wrap(m.readQuestionDraft),
    write: wrap(m.writeQuestionDraft),
    reset: wrap(m.resetQuestionDraftFamily),
    envelope: (key) => JSON.parse(storage.getItem(key) || 'null'),
    flush: async () => { activate(); await sync.flushNow(); },
    appRead: () => {
      activate();
      const entries = readWorkspaceDraftEntries(server.doc);
      const restorable = selectRestorableDraftEntries({ entries, localSavedAt: (key) => m.questionDraftSavedAt(key), canonicalSavedAt });
      m.reconcileToolWorkspaceDrafts(entries, { studentId: STUDENT, assignmentId: ASSIGNMENT, canonicalSavedAt });
      const fieldRecords = m.reconcileFieldRecordDrafts(entries, { studentId: STUDENT, assignmentId: ASSIGNMENT, canonicalSavedAt });
      const restored = m.restoreQuestionDrafts(restorable.filter((entry) => !fieldRecords.keys.has(entry.key)));
      sync.noteServerCopy(entries);
      return { restored, fieldSettled: fieldRecords.settled };
    },
  };
};

const algebra = (equation, workSteps = []) => ({
  algebraDraftVersion: 3, equation, supportLevel: 3, operand: '', distributionState: null, structureTool: null,
  workSteps, armedTile: null, pendingMove: null, crossedSides: [], cancelledPairIds: [],
  selectedCancellationIndices: [], simplificationAnswers: {}, promptAnswers: {}, simplifyTool: null,
});
const START = { left: '2x+3', right: '11' };
const STEP1 = { left: '2x', right: '8' };
const STEP2 = { left: 'x', right: '4' };

/* ---------------------------------------------------------------------- S1 */

test('S1: attempt 1\'s answers stay out of attempt 2 typed on another Chromebook (R2a)', async () => {
  const MULTI = keyFor(2, 'multi-answer');
  const t = now();
  server.doc = seed([{ key: MULTI, value: { a: '1', b: '2', c: '3' }, savedAt: t, savedAtIsEdit: true, fieldEditedAt: { a: t - 20, b: t - 10, c: t }, questionIndex: 2 }]);
  const submittedAt = t + 30_000;
  const canonical = (index) => (index === 2 ? submittedAt : 0);
  tick(60_000);
  const B = await loadDevice(new MemoryStorage(), { canonical });
  assert.equal(B.appRead().restored, 0, 'the submitted attempt\'s draft is history: not restored');
  B.read(MULTI, {}); B.write(MULTI, {}, { edit: false });
  tick(5_000); B.input(); B.write(MULTI, { a: '5' }, { edit: true });
  await B.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: '5' }, 'the server keeps attempt 2 as typed, as before this merge');
  assert.equal(serverEntry(MULTI).canonicalAt, submittedAt, 'and remembers the submission it was saved after');
  tick(20_000);
  B.appRead();
  assert.deepEqual(B.envelope(MULTI).value, { a: '5' }, 'a re-read does not bring attempt 1 back');
});

test('S1: the device that submitted keeps working from its boxes, and another device gets them', async () => {
  const MULTI = keyFor(3, 'multi-answer');
  server.doc = null;
  const submitted = { at: 0 };
  const canonical = (index) => (index === 3 ? submitted.at : 0);
  const A = await loadDevice(new MemoryStorage(), { canonical });
  A.appRead();
  A.read(MULTI, {}); A.write(MULTI, {}, { edit: false });
  tick(1_000); A.input(); A.write(MULTI, { a: '1', b: '2', c: '3' }, { edit: true }); await A.flush();
  submitted.at = tick(5_000);
  // A misses and fixes one box for attempt 2: b and c are still on A's screen.
  tick(5_000); A.input(); A.write(MULTI, { a: '6', b: '2', c: '3' }, { edit: true }); await A.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: '6', b: '2', c: '3' });
  tick(30_000);
  const C = await loadDevice(new MemoryStorage(), { canonical });
  C.appRead();
  assert.deepEqual(C.envelope(MULTI).value, { a: '6', b: '2', c: '3' }, 'saved after the submission, it restores whole');
});

test('S1: a redo of a submitted Step Algebra question on another Chromebook is kept (R2b)', async () => {
  const K = keyFor(4, 'step-algebra');
  const t = now();
  server.doc = seed([{ key: K, value: algebra(STEP1, [{ n: 1 }]), savedAt: t, savedAtIsEdit: true, fieldEditedAt: { work: t }, questionIndex: 4 }]);
  const submittedAt = t + 30_000;
  const canonical = (index) => (index === 4 ? submittedAt : 0);
  tick(60_000);
  const B = await loadDevice(new MemoryStorage(), { canonical });
  B.appRead();
  tick(5_000);
  assert.equal(B.read(K, null), null);
  B.write(K, algebra(START));
  tick(5_000); B.input(); B.write(K, algebra(STEP2, [{ n: 'a' }, { n: 'b' }, { n: 'c' }]));
  await B.flush();
  tick(20_000);
  B.appRead();
  assert.deepEqual(B.envelope(K).value.equation, STEP2);
  assert.equal(B.envelope(K).value.workSteps.length, 3);
});

test('S1, the merge itself: copies either side of a submission merge whole, never answer by answer', () => {
  const pre = { value: { a: '1', b: '2' }, savedAt: 100, savedAtIsEdit: true, fieldEditedAt: { a: 90, b: 100 } };
  const post = { value: { a: '5' }, savedAt: 300, savedAtIsEdit: true, fieldEditedAt: { a: 300 } };
  assert.equal(mergeFieldRecordCopies({ kind: 'multi-answer', a: pre, b: post, canonicalAt: 200 }), null);
  assert.deepEqual(mergeFieldRecordCopies({ kind: 'multi-answer', a: pre, b: post, canonicalAt: 50 }).value, { a: '5', b: '2' }, 'same side: answer by answer');
});

/* ---------------------------------------------------------------------- S2 */

test('S2: Start over, then typing within the save\'s debounce, does not bring the old answers back (R3a)', async () => {
  const MULTI = keyFor(2, 'multi-answer');
  server.doc = null;
  const A = await loadDevice();
  const B = await loadDevice();
  A.read(MULTI, {}); A.write(MULTI, {}, { edit: false });
  A.appRead(); B.appRead();
  tick(1000); A.input(); A.write(MULTI, { a: '12', b: '7' }, { edit: true }); await A.flush();
  tick(30_000); B.appRead(); B.read(MULTI, {}); B.write(MULTI, B.envelope(MULTI).value, { edit: false });
  tick(1000); B.input(); B.write(MULTI, { a: '12', b: '7', c: 'x+1' }, { edit: true }); await B.flush();
  tick(60_000); A.reset(PREFIX(2));
  A.read(MULTI, {}); A.write(MULTI, {}, { edit: false });
  tick(1500); A.input(); A.write(MULTI, { a: '5' }, { edit: true });
  await A.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: '5' }, 'what the student typed after Start over, and nothing from before it');
  tick(30_000); B.appRead();
  assert.deepEqual(B.envelope(MULTI).value, { a: '5' }, 'the other device follows the reset too');
});

test('S2: a device that missed the reset cannot put a pre-reset answer back on a later save (R3b)', async () => {
  const MULTI = keyFor(2, 'multi-answer');
  server.doc = null;
  const A = await loadDevice();
  const D = await loadDevice();
  A.appRead(); D.appRead();
  A.read(MULTI, {}); A.write(MULTI, {}, { edit: false });
  tick(1000); A.input(); A.write(MULTI, { a: 'old-a', b: 'old-b' }, { edit: true }); await A.flush();
  tick(30_000); D.appRead();
  tick(30_000); D.reset(PREFIX(2)); await D.flush();
  tick(30_000); A.input(); A.write(MULTI, { a: 'new-a', b: 'old-b' }, { edit: true }); await A.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: 'new-a' });
  tick(30_000); A.input(); A.write(MULTI, { a: 'newer-a', b: 'old-b' }, { edit: true }); await A.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: 'newer-a' }, 'the second save does not undo the reset');
  tick(30_000); A.appRead();
  assert.deepEqual(A.envelope(MULTI).value, { a: 'newer-a' }, 'and the device that missed it drops the old answer on its next read');
});

test('S2: the same save merged twice, and two devices in either order, honour the reset (R7a, R7b)', () => {
  const K = keyFor(2, 'multi-answer');
  const save = (doc, entry) => mergeWorkspaceDraftDocument({ existing: doc, patch: patchOf([entry]) });
  const val = (doc) => readWorkspaceDraftEntries(doc).find((entry) => entry.key === K).value;
  const reset = save(null, { key: K, value: null, savedAt: 1000, savedAtIsEdit: true });
  const A = { key: K, value: { a: 'new-a', b: 'pre-reset-b' }, savedAt: 2000, savedAtIsEdit: true, fieldEditedAt: { a: 2000, b: 500 } };
  const B = { key: K, value: { b: 'pre-reset-b2', c: 'new-c' }, savedAt: 3000, savedAtIsEdit: true, fieldEditedAt: { b: 600, c: 3000 } };
  const once = save(reset, A);
  assert.deepEqual(val(once), { a: 'new-a' });
  assert.deepEqual(val(save(once, A)), { a: 'new-a' }, 'a retried save (lost commit ack) changes nothing');
  assert.deepEqual(val(save(save(reset, A), B)), { a: 'new-a', c: 'new-c' });
  assert.deepEqual(val(save(save(reset, B), A)), { c: 'new-c', a: 'new-a' });
  assert.equal(readWorkspaceDraftEntries(once).find((entry) => entry.key === K).resetAt, 1000, 'the merged record remembers the reset');
});

/* ---------------------------------------------------------------------- S3 */

test('S3: answers an older build saved win over an older dated copy once this build takes them in (R4)', async () => {
  const MULTI = keyFor(2, 'multi-answer');
  server.doc = null;
  const Y = await loadDevice();
  Y.read(MULTI, {}); Y.write(MULTI, {}, { edit: false }); Y.appRead();
  tick(1000); Y.input(); Y.write(MULTI, { a: '1' }, { edit: true }); await Y.flush();
  // An older bundle edits a and saves the way that build does (no per-answer times).
  tick(80_000);
  const oStorage = new MemoryStorage();
  const t = now();
  oStorage.setItem(MULTI, JSON.stringify({ version: 2, savedAt: t, value: { a: '2' }, touchedAt: t, savedAtIsEdit: true }));
  const stripped = (doc) => ({ ...doc, entries: doc.entries.map(({ fieldEditedAtJson: _times, fieldsFresh: _fresh, resetAt: _reset, canonicalAt: _canonical, ...entry }) => entry) });
  server.doc = stripped(mergeWorkspaceDraftDocument({ existing: stripped(server.doc), patch: patchOf([{ key: MULTI, value: { a: '2' }, savedAt: t, savedAtIsEdit: true, questionIndex: 2 }]) }));
  assert.equal(serverEntry(MULTI).fieldEditedAt, null);
  // O reloads into this build and types b.
  tick(20_000);
  const O = await loadDevice(oStorage);
  O.read(MULTI, {}); O.write(MULTI, O.envelope(MULTI).value, { edit: false }); O.appRead();
  tick(1000); O.input(); O.write(MULTI, { a: '2', b: '5' }, { edit: true }); await O.flush();
  assert.equal(JSON.parse(JSON.stringify(serverEntry(MULTI).fieldEditedAt)).a, t, 'the older build\'s answer is dated at its save');
  tick(30_000); Y.appRead();
  assert.equal(Y.envelope(MULTI).value.a, '2', 'Y shows the newer a');
  tick(1000); Y.input(); Y.write(MULTI, { ...Y.envelope(MULTI).value, c: '9' }, { edit: true }); await Y.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: '2', b: '5', c: '9' }, 'and Y\'s next edit keeps it everywhere');
});

test('S3: a copy whose time may be an opening\'s (unmarked) is not dated, so it cannot win answers', async () => {
  const MULTI = keyFor(5, 'multi-answer');
  server.doc = seed([{ key: MULTI, value: { a: '' }, savedAt: now() + 1000, questionIndex: 5 }]);
  const F = await loadDevice();
  F.appRead();
  assert.equal(F.envelope(MULTI).fieldEditedAt, undefined, 'restored without per-answer times, as before');
});

/* ---------------------------------------------------------------------- R6 */

test('R6a: a field id "__proto__" is an answer like any other', () => {
  const a = { value: JSON.parse('{"__proto__":"7","x":"1"}'), savedAt: 10, fieldEditedAt: JSON.parse('{"__proto__":10,"x":10}') };
  const b = { value: { x: '2' }, savedAt: 20, fieldEditedAt: { x: 20 } };
  const merged = mergeFieldRecordCopies({ kind: 'multi-answer', a, b });
  assert.equal(Object.hasOwn(merged.value, '__proto__'), true);
  assert.equal(JSON.parse(JSON.stringify(merged.value)).__proto__, '7', 'and survives a round trip');
  assert.equal(Object.getPrototypeOf(merged.value), Object.prototype, 'without becoming the record\'s prototype');
  assert.equal(merged.value.x, '2');
  assert.equal(JSON.parse(JSON.stringify(merged.fieldEditedAt)).__proto__, 10, 'its edit time is kept with it');
});

test('R6b: ids like "toString" and "constructor" never read an inherited function as a time', () => {
  for (const id of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
    const merged = mergeFieldRecordCopies({
      kind: 'workflow-responses',
      a: { value: { [id]: 'new' }, savedAt: 20, fieldEditedAt: { [id]: 20 } },
      b: { value: { [id]: 'old' }, savedAt: 10, fieldEditedAt: {} },
      prefer: 'b',
    });
    assert.equal(merged.value[id], 'new', `${id}: the dated, newer answer wins`);
    assert.equal(JSON.parse(JSON.stringify(merged.fieldEditedAt))[id], 20, `${id}: and its time is a number`);
  }
});

test('R6c: a merge too big to store never lets a fresh partial copy replace the saved steps', () => {
  const K = keyFor(3, 'workflow-responses');
  const big = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`s${i}`, 'x'.repeat(1000)]));
  const doc = mergeWorkspaceDraftDocument({ existing: null, patch: patchOf([{ key: K, value: big, savedAt: 100, savedAtIsEdit: true, fieldEditedAt: Object.fromEntries(Object.keys(big).map((k) => [k, 100])) }]) });
  const fresh = { key: K, value: { s15: 'y'.repeat(1200) }, savedAt: 200, savedAtIsEdit: true, fieldEditedAt: { s15: 200 }, fieldsFresh: true };
  const after = readWorkspaceDraftEntries(mergeWorkspaceDraftDocument({ existing: doc, patch: patchOf([fresh]) }))[0];
  assert.deepEqual(Object.keys(after.value), Object.keys(big), 'all 15 saved steps stay');
  // A copy that is not fresh still replaces whole, as for a tool record.
  const own = readWorkspaceDraftEntries(mergeWorkspaceDraftDocument({ existing: doc, patch: patchOf([{ ...fresh, fieldsFresh: false }]) }))[0];
  assert.deepEqual(Object.keys(own.value), ['s15']);
});

test('S1: an entry replaced whole still remembers the later submission either copy knew of', () => {
  const K = keyFor(6, 'multi-answer');
  const known = mergeWorkspaceDraftDocument({ existing: null, patch: patchOf([{ key: K, value: { a: '1' }, savedAt: 100, savedAtIsEdit: true, fieldEditedAt: { a: 100 }, canonicalAt: 150 }]) });
  // A legacy copy (no times) newer whole, from a device that did not know of the submission.
  const after = readWorkspaceDraftEntries(mergeWorkspaceDraftDocument({ existing: known, patch: patchOf([{ key: K, value: { a: '2' }, savedAt: 200, savedAtIsEdit: true }]) }))[0];
  assert.deepEqual(after.value, { a: '2' });
  assert.equal(after.canonicalAt, 150);
});

test('App.jsx hands the background save the question\'s last submission, read as the restore reads it', async () => {
  const { readFileSync } = await import('node:fs');
  const { executableSource, region } = await import('./helpers/sourceContract.mjs');
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const sync = region(app, 'const sync = createWorkspaceDraftSync({', 'flush: async');
  assert.match(sync, /canonicalSavedAt: \(questionIndex\) => canonicalResponseSavedAt\(normalizeQuestionRecord\(trackerRef\.current\?\.\[activeAssignmentId\]\?\.\[questionIndex\]\)\),/);
});

test('S1: a device\'s own copy from before the submission is not merged into work saved after it', async () => {
  const MULTI = keyFor(7, 'multi-answer');
  server.doc = null;
  const submitted = { at: 0 };
  const canonical = (index) => (index === 7 ? submitted.at : 0);
  // B worked attempt 1 and kept its copy.
  const B = await loadDevice(new MemoryStorage(), { canonical });
  B.appRead();
  B.read(MULTI, {}); B.write(MULTI, {}, { edit: false });
  tick(1000); B.input(); B.write(MULTI, { a: '1', b: '2', c: '3' }, { edit: true }); await B.flush();
  // The attempt is submitted; another device then types attempt 2's first box.
  submitted.at = tick(5_000);
  tick(10_000);
  const C = await loadDevice(new MemoryStorage(), { canonical });
  C.appRead();
  C.read(MULTI, {}); C.write(MULTI, {}, { edit: false });
  tick(1000); C.input(); C.write(MULTI, { a: '5' }, { edit: true }); await C.flush();
  assert.deepEqual(serverEntry(MULTI).value, { a: '5' });
  // B comes back: its attempt-1 boxes do not join attempt 2.
  tick(30_000); B.appRead();
  assert.deepEqual(B.envelope(MULTI).value, { a: '5' });
});

test('S2: Start over dates no answer and records when it happened', async () => {
  const MULTI = keyFor(8, 'multi-answer');
  const D = await loadDevice();
  D.read(MULTI, {}); D.input(); D.write(MULTI, { a: '1' }, { edit: true });
  const at = tick(1000);
  D.reset(PREFIX(8));
  const tombstone = D.envelope(MULTI);
  assert.equal(tombstone.value, null);
  assert.deepEqual(tombstone.fieldEditedAt, {}, 'the answers it cleared are not carried as edits');
  assert.equal(tombstone.resetAt, at);
  D.read(MULTI, {}); D.input(); D.write(MULTI, { b: '2' }, { edit: true });
  assert.equal(D.envelope(MULTI).resetAt, at, 'what is written after it carries the reset');
  assert.deepEqual(Object.keys(D.envelope(MULTI).fieldEditedAt), ['b']);
});
