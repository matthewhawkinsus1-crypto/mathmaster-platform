/*
 * MULTI-ANSWER, STEP ALGEBRA AND COMPOSED-STEP DRAFTS MERGE ANSWER BY ANSWER (Batch 3).
 *
 * PR #458 stopped a fresh Chromebook's first touch from replacing a whole tool
 * workspace (`__fresh`). Three drafts that hold several answers in one record
 * were left merging whole by edit time: `…:multi-answer`, `…:step-algebra` and
 * `…:workflow-responses`. On a Chromebook that had not yet received the work,
 * one early touch saved the boxes it showed (empty) as the newest copy of every
 * answer, and two devices editing different steps of one composed question
 * kept only the later device's whole record.
 *
 * Each copy now carries per-answer edit times (`fieldEditedAt`) and, when begun
 * from nothing, `fieldsFresh`; the server and the device merge answer by
 * answer (workspaceDraftSchema.mjs mergeFieldRecordCopies,
 * questionDraftStorage.js reconcileFieldRecordDrafts). Every rule below is
 * mutation-checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildWorkspaceDraftPatch,
  fieldRecordDraftKind,
  mergeFieldRecordCopies,
  mergeWorkspaceDraftDocument,
  readWorkspaceDraftEntries,
  stampFieldRecordEdits,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const BASE = Date.now() - 60 * 60 * 1000;
const at = (seconds) => BASE + seconds * 1000;
const STUDENT = 'S-fields';
const ASSIGNMENT = 'A-fields';
const prefix = (question) => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student`;
const MULTI = `${prefix(2)}:multi-answer`;
const STEPS = `${prefix(3)}:workflow-responses`;
const ALGEBRA = `${prefix(4)}:step-algebra`;
const STAGE_ALGEBRA = `${prefix(5)}:stage-solve:step-algebra`;
const LITERAL = `${prefix(6)}:literal`;

const serverDoc = (entries) => mergeWorkspaceDraftDocument({
  existing: null,
  patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }),
});
const save = (existing, entries) => mergeWorkspaceDraftDocument({
  existing,
  patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }),
});
const valueOf = (document, key) => readWorkspaceDraftEntries(document).find((entry) => entry.key === key);

const algebra = ({ equation, workSteps = [], armedTile = null, promptAnswers = {} }) => ({
  algebraDraftVersion: 3, equation, supportLevel: 'standard', operand: '', workSteps, armedTile, promptAnswers,
});
const STEP_ONE = { left: '2x', right: '8' };
const SOLVED = { left: 'x', right: '4' };

/* ---------------------------------------------------------------- the keys */

test('exactly the three answer records are kept field by field', () => {
  assert.equal(fieldRecordDraftKind(MULTI), 'multi-answer');
  assert.equal(fieldRecordDraftKind(STEPS), 'workflow-responses');
  assert.equal(fieldRecordDraftKind(ALGEBRA), 'step-algebra');
  assert.equal(fieldRecordDraftKind(STAGE_ALGEBRA), 'step-algebra', 'a composed question\'s Step Algebra stage too');
  assert.equal(fieldRecordDraftKind(`${prefix(3)}:stage-a:multi-answer`), 'multi-answer');
  assert.equal(fieldRecordDraftKind(LITERAL), null);
  assert.equal(fieldRecordDraftKind(`${prefix(3)}:workflow-stage`), null, 'the step a student is on is one value');
  assert.equal(fieldRecordDraftKind(`${prefix(3)}:work:stage-a`), null, 'tool workspaces keep their own merge');
  assert.equal(fieldRecordDraftKind(`${prefix(3)}:work:multi-answer`), null);
  assert.equal(fieldRecordDraftKind('mathmaster:draft:v2::S:A:2:0:student:multi-answer:undo:x'), null);
});

/* ------------------------------------------------- the server merge (shared) */

test('a fresh Chromebook\'s first touch keeps every answer the server already had', () => {
  const server = serverDoc([{ key: MULTI, value: { a: '12', b: '7', c: 'x+1' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(5), b: at(8), c: at(10) } }]);
  // The fresh device showed empty boxes and the student typed into `b`.
  const fresh = save(server, [{ key: MULTI, value: { b: '9' }, savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { b: at(20) }, fieldsFresh: true }]);
  const merged = valueOf(fresh, MULTI);
  assert.deepEqual(merged.value, { a: '12', b: '9', c: 'x+1' });
  assert.equal(merged.savedAt, at(20));
  assert.deepEqual(merged.fieldEditedAt, { a: at(5), b: at(20), c: at(10) });
  assert.equal(merged.fieldsFresh, false, 'merged with the server copy, it is no longer fresh');
});

test('a fresh copy is merged over an entry an older build saved (no per-answer times)', () => {
  const server = serverDoc([{ key: MULTI, value: { a: '12', b: '7' }, savedAt: at(10), savedAtIsEdit: true }]);
  assert.equal(valueOf(server, MULTI).fieldEditedAt, null);
  const merged = valueOf(save(server, [{ key: MULTI, value: { a: '', b: '9' }, savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { b: at(20) }, fieldsFresh: true }]), MULTI);
  assert.deepEqual(merged.value, { a: '12', b: '9' }, 'the empty box the fresh device showed does not erase a saved answer');
  // Not fresh, and neither copy dated per answer: the ordinary rule, whole.
  const whole = valueOf(save(server, [{ key: MULTI, value: { b: '9' }, savedAt: at(20), savedAtIsEdit: true }]), MULTI);
  assert.deepEqual(whole.value, { b: '9' });
});

test('two devices editing different steps of a composed question both keep their step, in either order', () => {
  const start = serverDoc([{ key: STEPS, value: { s1: 'y=2x', s2: '', s3: 'x>0' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { s1: at(10), s3: at(4) } }]);
  const deviceA = { key: STEPS, value: { s1: 'y=2x+1', s2: '', s3: 'x>0' }, savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: { s1: at(30), s3: at(4) } };
  const deviceB = { key: STEPS, value: { s1: 'y=2x', s2: '(0, 1)', s3: 'x>0' }, savedAt: at(40), savedAtIsEdit: true, fieldEditedAt: { s1: at(10), s2: at(40), s3: at(4) } };
  for (const order of [[deviceA, deviceB], [deviceB, deviceA]]) {
    const merged = valueOf(save(save(start, [order[0]]), [order[1]]), STEPS);
    assert.deepEqual(merged.value, { s1: 'y=2x+1', s2: '(0, 1)', s3: 'x>0' });
    assert.equal(merged.savedAt, at(40));
  }
});

test('the same answer edited on two devices: the later edit wins', () => {
  const merged = mergeFieldRecordCopies({
    kind: 'multi-answer',
    a: { value: { a: '1', b: '2' }, savedAt: at(50), fieldEditedAt: { a: at(50), b: at(10) } },
    b: { value: { a: '3', b: '4' }, savedAt: at(40), fieldEditedAt: { a: at(20), b: at(40) } },
  });
  assert.deepEqual(merged.value, { a: '1', b: '4' });
});

test('an answer removed later on one device stays removed; one only a copy holds is kept', () => {
  const merged = mergeFieldRecordCopies({
    kind: 'workflow-responses',
    a: { value: { s1: 'one' }, savedAt: at(50), fieldEditedAt: { s1: at(10), s2: at(50) } },
    b: { value: { s1: 'one', s2: 'two', s4: 'four' }, savedAt: at(40), fieldEditedAt: { s1: at(10), s2: at(30), s4: at(35) } },
  });
  assert.deepEqual(merged.value, { s1: 'one', s4: 'four' });
  assert.equal(merged.fieldEditedAt.s2, at(50), 'the removal keeps its time');
  // An answer with no known edit time, held only by the older copy, is kept
  // by a newer copy that never had it.
  const untimed = mergeFieldRecordCopies({
    kind: 'multi-answer',
    a: { value: { a: '1' }, savedAt: at(10), fieldEditedAt: {} },
    b: { value: { b: '2' }, savedAt: at(40), fieldEditedAt: { b: at(40) } },
  });
  assert.deepEqual(untimed.value, { a: '1', b: '2' });
  // The same edit time and one copy lacks the answer: never lost on the tie,
  // even to a newer copy (a write-back that did not edit it).
  const tie = mergeFieldRecordCopies({
    kind: 'multi-answer',
    a: { value: { m: '-2/3' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { m: at(10) } },
    b: { value: {}, savedAt: at(30), fieldEditedAt: { m: at(10) } },
  });
  assert.deepEqual(tie.value, { m: '-2/3' });
});

test('Step Algebra: work begun on a fresh device yields to saved work; its prompt answers do not', () => {
  const server = serverDoc([{ key: ALGEBRA, value: algebra({ equation: SOLVED, workSteps: [{ n: 1 }, { n: 2 }] }), savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { work: at(10) } }]);
  // The fresh device opened on the starting equation and committed a step on
  // it, and answered the prompt, before the server copy arrived.
  const fresh = { key: ALGEBRA, value: algebra({ equation: STEP_ONE, workSteps: [{ n: 1 }], promptAnswers: { check: 'yes' } }), savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { work: at(18), promptAnswers: at(20) }, fieldsFresh: true };
  const merged = valueOf(save(server, [fresh]), ALGEBRA).value;
  assert.deepEqual(merged.equation, SOLVED, 'the saved equation and its steps come back whole');
  assert.equal(merged.workSteps.length, 2);
  assert.deepEqual(merged.promptAnswers, { check: 'yes' });
  // Not fresh: the later committed work wins, whole.
  const own = valueOf(save(server, [{ ...fresh, fieldsFresh: false }]), ALGEBRA).value;
  assert.deepEqual(own.equation, STEP_ONE);
  assert.equal(own.workSteps.length, 1);
});

test('Step Algebra: arming a tile or typing an operand does not date the work', () => {
  const previous = algebra({ equation: STEP_ONE, workSteps: [{ n: 1 }] });
  const tapped = { ...previous, armedTile: 'x-term', operand: '3' };
  assert.deepEqual(stampFieldRecordEdits({ kind: 'step-algebra', previous, previousEditedAt: { work: at(5) }, next: tapped, edit: true, now: at(60) }), { work: at(5) });
  const stepped = { ...previous, equation: SOLVED, workSteps: [{ n: 1 }, { n: 2 }] };
  assert.deepEqual(stampFieldRecordEdits({ kind: 'step-algebra', previous, previousEditedAt: { work: at(5) }, next: stepped, edit: true, now: at(60) }), { work: at(60) });
  // So another device's later steps beat this device's tap.
  const merged = mergeFieldRecordCopies({
    kind: 'step-algebra',
    a: { value: tapped, savedAt: at(60), savedAtIsEdit: true, fieldEditedAt: { work: at(5) } },
    b: { value: stepped, savedAt: at(40), savedAtIsEdit: true, fieldEditedAt: { work: at(40) } },
  });
  assert.deepEqual(merged.value.equation, SOLVED);
});

test('edit times: only an edit dates an answer, and an empty new box is not an edit', () => {
  assert.deepEqual(stampFieldRecordEdits({ kind: 'multi-answer', previous: { a: '1' }, previousEditedAt: { a: at(1) }, next: { a: '2' }, edit: false, now: at(9) }), { a: at(1) });
  assert.deepEqual(stampFieldRecordEdits({ kind: 'multi-answer', previous: {}, previousEditedAt: null, next: { a: '', b: '' }, edit: true, now: at(9) }), {});
  assert.deepEqual(stampFieldRecordEdits({ kind: 'multi-answer', previous: { a: '1', b: '' }, previousEditedAt: {}, next: { a: '', b: '2' }, edit: true, now: at(9) }), { a: at(9), b: at(9) },
    'clearing an answer is an edit');
});

test('a reset keeps only the answers edited after it', () => {
  const reset = serverDoc([{ key: MULTI, value: null, savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: {} }]);
  // A device that missed the reset edits `b`; its `a` is from before the reset.
  const later = valueOf(save(reset, [{ key: MULTI, value: { a: 'old', b: 'new' }, savedAt: at(40), savedAtIsEdit: true, fieldEditedAt: { a: at(10), b: at(40) } }]), MULTI);
  assert.deepEqual(later.value, { b: 'new' });
  // A record older than the reset does not come back at all.
  const older = valueOf(save(reset, [{ key: MULTI, value: { a: 'old' }, savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { a: at(20) } }]), MULTI);
  assert.equal(older.value, null);
});

test('every other draft still merges whole, by the ordinary rule', () => {
  const server = serverDoc([{ key: LITERAL, value: 'x=4', savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(10) } }]);
  const stored = server.entries.find((entry) => entry.key === LITERAL);
  assert.equal('fieldEditedAtJson' in stored, false, 'no per-answer times are stored for it');
  assert.equal(valueOf(save(server, [{ key: LITERAL, value: '', savedAt: at(20), savedAtIsEdit: true }]), LITERAL).value, '');
});

/* ------------------------------------------------------- the device side */

let instance = 0;
const page = async (storage = new MemoryStorage()) => {
  globalThis.window = { localStorage: storage };
  instance += 1;
  const module = await import(`../../src/questionDraftStorage.js?fields=${instance}`);
  const listeners = {};
  module.trackStudentInput({ addEventListener: (type, listener) => { listeners[type] = listener; } });
  const events = [];
  module.subscribeToQuestionDrafts((event) => events.push(event));
  return {
    ...module,
    storage,
    events,
    input: () => listeners.keydown?.({ isTrusted: true }),
    envelope: (key) => JSON.parse(storage.getItem(key) || 'null'),
  };
};

const OWNER = { studentId: STUDENT, assignmentId: ASSIGNMENT };

test('device: a fresh Chromebook\'s early touch is settled answer by answer when the server copy lands', async () => {
  const p = await page();
  // The question opens before the read: the boxes are empty.
  assert.deepEqual(p.readQuestionDraft(MULTI, {}), {});
  p.writeQuestionDraft(MULTI, {});
  assert.equal(p.envelope(MULTI).fieldsFresh, true, 'begun from nothing');
  p.input();
  p.writeQuestionDraft(MULTI, { b: '9' });
  assert.deepEqual(Object.keys(p.envelope(MULTI).fieldEditedAt), ['b']);
  assert.equal(p.events.at(-1).fieldsFresh, true, 'the background save is told too');
  assert.ok(p.events.at(-1).fieldEditedAt.b > 0);

  const generation = p.questionDraftRestoreGeneration();
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: MULTI, value: { a: '12', b: '7', c: 'x+1' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(5), b: at(8), c: at(10) } }]));
  const settled = p.reconcileFieldRecordDrafts(entries, OWNER);
  assert.equal(settled.settled, 1);
  assert.ok(settled.keys.has(MULTI), 'settled here, so not then restored whole');
  assert.deepEqual(p.envelope(MULTI).value, { a: '12', b: '9', c: 'x+1' });
  assert.equal(p.envelope(MULTI).fieldsFresh, undefined);
  assert.equal(p.questionDraftRestoreGeneration(), generation + 1, 'the question remounts to show it');
});

test('device: a draft begun after the server copy was read is not fresh', async () => {
  const p = await page();
  // The read lands first (the server had nothing), then the question mounts.
  p.reconcileFieldRecordDrafts([], OWNER);
  p.readQuestionDraft(MULTI, {});
  p.input();
  p.writeQuestionDraft(MULTI, { m: '-2/3' });
  assert.equal(p.envelope(MULTI).fieldsFresh, undefined, 'it has seen the server copy: nothing to settle');
  assert.equal(p.events.at(-1).fieldsFresh, undefined);
  // So a newer clear saved on another device (no per-answer times) replaces it,
  // by the ordinary rule, instead of yielding to it as to a fresh copy.
  const cleared = readWorkspaceDraftEntries(serverDoc([{ key: MULTI, value: {}, savedAt: Date.now() + 5_000, savedAtIsEdit: true }]));
  assert.ok(!p.reconcileFieldRecordDrafts(cleared, OWNER).keys.has(MULTI), 'left to the ordinary restore');
  // Another assignment's read says nothing about this one.
  const other = await page();
  other.reconcileFieldRecordDrafts([], { ...OWNER, assignmentId: 'A-other' });
  other.readQuestionDraft(MULTI, {});
  other.writeQuestionDraft(MULTI, {});
  assert.equal(other.envelope(MULTI).fieldsFresh, true);
});

test('device: an edit landing after a settle but before the remount keeps the answers it never saw', async () => {
  const p = await page();
  p.readQuestionDraft(MULTI, {});
  p.input();
  p.writeQuestionDraft(MULTI, { b: '9' });
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: MULTI, value: { a: '12', c: 'x+1' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(5), c: at(10) } }]));
  p.reconcileFieldRecordDrafts(entries, OWNER);
  // The workspace still holds `{ b }` and the student types again.
  p.input();
  p.writeQuestionDraft(MULTI, { b: '10' });
  assert.deepEqual(p.envelope(MULTI).value, { b: '10', a: '12', c: 'x+1' });
  // Its write-back (the hooks write the same value again, not as an edit)
  // still keeps them: the page has still not seen them (Batch 3 review, S4).
  p.writeQuestionDraft(MULTI, { b: '10' }, { edit: false });
  assert.deepEqual(p.envelope(MULTI).value, { b: '10', a: '12', c: 'x+1' });
  // After the remount the page holds them; one it then removes stays removed.
  assert.deepEqual(p.readQuestionDraft(MULTI, {}), { b: '10', a: '12', c: 'x+1' });
  p.input();
  p.writeQuestionDraft(MULTI, { b: '10', c: 'x+1' });
  assert.deepEqual(p.envelope(MULTI).value, { b: '10', c: 'x+1' });
});

test('device: two devices\' steps both survive the restore, not only the server\'s merge', async () => {
  const p = await page();
  p.readQuestionDraft(STEPS, {});
  p.input();
  p.writeQuestionDraft(STEPS, { s1: 'y=2x+1' });
  p.reconcileFieldRecordDrafts([], OWNER);
  assert.equal(p.envelope(STEPS).fieldsFresh, undefined, 'the server had nothing: no longer fresh');
  // Later, another device's step 2 (older save than this device's step 1 edit
  // is not possible to order whole) arrives.
  const mine = p.envelope(STEPS);
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: STEPS, value: { s1: '', s2: '(0, 1)' }, savedAt: mine.savedAt - 1, savedAtIsEdit: true, fieldEditedAt: { s2: mine.savedAt - 1 } }]));
  const settled = p.reconcileFieldRecordDrafts(entries, OWNER);
  assert.equal(settled.settled, 1);
  assert.deepEqual(p.envelope(STEPS).value, { s1: 'y=2x+1', s2: '(0, 1)' });
});

test('device: a server entry older than the question\'s last submitted attempt is never merged in', async () => {
  const p = await page();
  p.readQuestionDraft(MULTI, {});
  p.input();
  p.writeQuestionDraft(MULTI, { b: '9' });
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: MULTI, value: { a: 'old attempt', b: '7' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(10), b: at(10) }, questionIndex: 2 }]));
  const settled = p.reconcileFieldRecordDrafts(entries, { ...OWNER, canonicalSavedAt: (entry) => (entry.questionIndex === 2 ? at(15) : 0) });
  assert.equal(settled.settled, 0);
  assert.deepEqual(p.envelope(MULTI).value, { b: '9' });
});

test('device: the tool-workspace settle refuses a superseded entry too (PR #458 review)', async () => {
  const p = await page();
  const TOOL = `${prefix(7)}:work:board`;
  p.storage.setItem(TOOL, JSON.stringify({ version: 2, savedAt: at(30), savedAtIsEdit: true, value: { slope: '2', __fresh: ['slope'] } }));
  const server = [{ key: TOOL, value: { slope: '1', intercept: 'old attempt' }, savedAt: at(10), savedAtIsEdit: true, questionIndex: 7 }];
  p.reconcileToolWorkspaceDrafts(server, { ...OWNER, canonicalSavedAt: (entry) => (entry.questionIndex === 7 ? at(20) : 0) });
  assert.deepEqual(p.envelope(TOOL).value, { slope: '2' }, 'the older attempt\'s field does not join the new one');
  // Without a newer submission the same entry still merges, as before.
  p.storage.setItem(TOOL, JSON.stringify({ version: 2, savedAt: at(30), savedAtIsEdit: true, value: { slope: '2', __fresh: ['slope'] } }));
  p.reconcileToolWorkspaceDrafts(server, OWNER);
  assert.deepEqual(p.envelope(TOOL).value, { slope: '2', intercept: 'old attempt' });
});

test('device: a whole restore keeps the server\'s per-answer times, so the next merge has them', async () => {
  const p = await page();
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: MULTI, value: { a: '1' }, savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { a: at(10) } }]));
  p.restoreQuestionDrafts(entries);
  assert.deepEqual(p.envelope(MULTI).fieldEditedAt, { a: at(10) });
  assert.equal(p.envelope(MULTI).fieldsFresh, undefined);
});

test('the background save sends the per-answer times and the fresh marker with the entry', () => {
  const sync = createWorkspaceDraftSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, flush: () => {}, scheduler: { set: () => 1, clear: () => {} } });
  sync.record({ key: MULTI, value: { b: '9' }, savedAt: at(20), edit: true, savedAtIsEdit: true, fieldEditedAt: { b: at(20) }, fieldsFresh: true });
  const [entry] = sync.snapshotPatch().entries;
  assert.equal(entry.fieldEditedAtJson, JSON.stringify({ b: at(20) }));
  assert.equal(entry.fieldsFresh, true);
});

test('App.jsx settles field-record drafts on the server read and does not then restore them whole', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\breconcileFieldRecordDrafts\b[^}]*\} from '\.\/questionDraftStorage';/, 'imported next to its call');
  const read = region(app, 'const readServerCopy = () => {', '.catch((error) => {');
  assert.match(read, /const fieldRecords = reconcileFieldRecordDrafts\(entries, \{ studentId: user\.id, assignmentId: activeAssignmentId, canonicalSavedAt \}\);/);
  assert.match(read, /reconcileToolWorkspaceDrafts\(entries, \{ studentId: user\.id, assignmentId: activeAssignmentId, canonicalSavedAt \}\)/, 'the tool settle reads the canonical guard too');
  assert.match(read, /restoreQuestionDrafts\(restorable\.filter\(\(entry\) => !fieldRecords\.keys\.has\(entry\.key\)\)\)/);
  assert.match(read, /if \(restored \|\| settled \|\| fieldRecords\.settled\) \{/);
  assert.ok(read.indexOf('reconcileFieldRecordDrafts(') < read.indexOf('restoreQuestionDrafts('), 'settled before anything is restored whole');
});
