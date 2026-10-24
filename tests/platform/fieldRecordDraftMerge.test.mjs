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
  adoptedFieldEditedAt,
  buildWorkspaceDraftPatch,
  fieldRecordDraftKind,
  fieldRecordGroupsFor,
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

test('Step Algebra: prompt answers typed on two devices are kept one by one (RT22)', () => {
  // Device A answers the first prompt.
  const first = stampFieldRecordEdits({
    kind: 'step-algebra',
    previous: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 3' } }),
    previousEditedAt: { work: at(5), 'promptAnswers/first': at(8), promptAnswers: at(8) },
    next: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 4' } }),
    edit: true,
    now: at(10),
  });
  assert.deepEqual(first, { work: at(5), 'promptAnswers/first': at(10), promptAnswers: at(10) },
    'each answer is dated on its own; the whole set keeps its latest time for older builds');
  const server = serverDoc([{ key: ALGEBRA, value: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 4' } }), savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: first }]);
  // Device B had not received it: it still holds the first answer from before,
  // and answers the second prompt later.
  const second = {
    key: ALGEBRA,
    value: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 3', second: 'It checks.' } }),
    savedAt: at(20),
    savedAtIsEdit: true,
    fieldEditedAt: { work: at(5), 'promptAnswers/first': at(8), 'promptAnswers/second': at(20), promptAnswers: at(20) },
  };
  const merged = valueOf(save(server, [second]), ALGEBRA);
  assert.deepEqual(merged.value.promptAnswers, { first: 'x = 4', second: 'It checks.' }, 'the later second answer does not take the first back to its older text');
  assert.equal(merged.fieldEditedAt.promptAnswers, at(20));
});

test('Step Algebra: a copy an older build dated as one set is merged with it whole, as that build merges it', () => {
  const older = { value: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 4', second: 'It checks.' } }), savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: { work: at(5), promptAnswers: at(30) } };
  const newer = { value: algebra({ equation: SOLVED, promptAnswers: { first: 'x = 5' } }), savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/first': at(20), promptAnswers: at(20) } };
  const merged = mergeFieldRecordCopies({ kind: 'step-algebra', a: older, b: newer });
  assert.deepEqual(merged.value.promptAnswers, { first: 'x = 4', second: 'It checks.' }, 'its set is the later one');
  assert.equal(merged.fieldEditedAt.promptAnswers, at(30));
  const laterHere = { ...newer, savedAt: at(40), fieldEditedAt: { work: at(5), 'promptAnswers/first': at(40), promptAnswers: at(40) } };
  assert.deepEqual(mergeFieldRecordCopies({ kind: 'step-algebra', a: older, b: laterHere }).value.promptAnswers, { first: 'x = 5' }, 'this build\'s later set, whole');
  // The draft keeps the old rule: merged, it carries no per-answer times, and
  // this build's next edit to it dates the set as that build would.
  assert.deepEqual(Object.keys(merged.fieldEditedAt).filter((group) => group.startsWith('promptAnswers/')), []);
  const stepped = { ...older.value, workSteps: [{ n: 1 }] };
  const dated = stampFieldRecordEdits({ kind: 'step-algebra', previous: older.value, previousEditedAt: older.fieldEditedAt, next: stepped, edit: true, now: at(50) });
  assert.deepEqual(dated, { work: at(50), promptAnswers: at(30) });
  const answered = stampFieldRecordEdits({ kind: 'step-algebra', previous: older.value, previousEditedAt: older.fieldEditedAt, next: { ...older.value, promptAnswers: { first: 'x = 4', second: 'Yes.' } }, edit: true, now: at(50) });
  assert.deepEqual(answered, { work: at(5), promptAnswers: at(50) });
  assert.deepEqual(mergeFieldRecordCopies({ kind: 'step-algebra', a: { value: stepped, savedAt: at(50), savedAtIsEdit: true, fieldEditedAt: dated }, b: laterHere }).value.promptAnswers, { first: 'x = 5' });
});
test('Step Algebra: an older build\'s later edit is not judged by the answer times it carried unchanged (RT22 review)', () => {
  // The server (this build) dated p1 at t20. Chromebook 1, still on an older
  // build, kept that time as it was and dated only the set when it typed again at t40.
  const older = { value: algebra({ equation: SOLVED, promptAnswers: { p1: 'D (latest)' } }), savedAt: at(40), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(20), promptAnswers: at(40) } };
  const server = { value: algebra({ equation: SOLVED, promptAnswers: { p1: 'C' } }), savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(30), promptAnswers: at(30) } };
  const merge = (a, b) => mergeFieldRecordCopies({ kind: 'step-algebra', a, b }).value.promptAnswers;
  assert.deepEqual(merge(server, older), { p1: 'D (latest)' });
  // Merged whole, as that build merges it: an earlier set loses to its set...
  const typedElsewhere = { ...server, value: algebra({ equation: SOLVED, promptAnswers: { p1: 'C', p2: 'B2' } }), fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(30), 'promptAnswers/p2': at(25), promptAnswers: at(30) } };
  assert.deepEqual(merge(typedElsewhere, older), { p1: 'D (latest)' });
  // ...and a later one wins whole.
  const typedAfter = { ...typedElsewhere, savedAt: at(50), fieldEditedAt: { ...typedElsewhere.fieldEditedAt, 'promptAnswers/p2': at(50), promptAnswers: at(50) } };
  assert.deepEqual(merge(typedAfter, older), { p1: 'C', p2: 'B2' });
});
test('Step Algebra: an answer an older build never had comes back with a later set, as it always did (RT22 re-review)', () => {
  // This build's server copy: p1 at t5, p4 at t10.
  const server = serverDoc([{ key: ALGEBRA, value: algebra({ equation: SOLVED, promptAnswers: { p1: 'D0', p4: 'D4' } }), savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(5), 'promptAnswers/p4': at(10), promptAnswers: at(10) } }]);
  // An older build opened it at t5 (p1 only) and changed p1 at t20: it dates
  // only the set, so the sets are merged whole and its later one wins.
  const older = { key: ALGEBRA, value: algebra({ equation: SOLVED, promptAnswers: { p1: 'O1' } }), savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(5), promptAnswers: at(20) } };
  const afterOlder = save(server, [older]);
  assert.deepEqual(valueOf(afterOlder, ALGEBRA).value.promptAnswers, { p1: 'O1' });
  // The first device, still showing p4, changes p1 at t25: p4 comes back with its set.
  const later = { key: ALGEBRA, value: algebra({ equation: SOLVED, promptAnswers: { p1: 'D1', p4: 'D4' } }), savedAt: at(25), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(25), 'promptAnswers/p4': at(10), promptAnswers: at(25) } };
  assert.deepEqual(valueOf(save(afterOlder, [later]), ALGEBRA).value.promptAnswers, { p1: 'D1', p4: 'D4' });
});
test('Step Algebra: a copy with upper-bound times keeps the old rule, and the later answer still wins (RT22 re-review)', () => {
  const write = (held, next, now) => ({
    key: ALGEBRA, value: next, savedAt: now, savedAtIsEdit: true,
    fieldEditedAt: stampFieldRecordEdits({ kind: 'step-algebra', previous: held.value, previousEditedAt: adoptedFieldEditedAt('step-algebra', held), next, edit: true, now }),
  });
  const empty = { value: algebra({ equation: SOLVED }), savedAt: 0, fieldEditedAt: {} };
  // D holds a copy saved with no answer times at t50 (p1 "at or before t50") and commits a step at t55.
  const legacy = { key: ALGEBRA, value: algebra({ equation: SOLVED, promptAnswers: { p1: 'L1' } }), savedAt: at(50), savedAtIsEdit: true };
  const d = write({ ...legacy, fieldEditedAt: adoptedFieldEditedAt('step-algebra', legacy) }, algebra({ equation: SOLVED, workSteps: [{ n: 1 }], promptAnswers: { p1: 'L1' } }), at(55));
  let server = serverDoc([d]);
  // B typed p1 at t40 and saved a step at t60: its p1 wins over the bound (B saved after it).
  const b = write(write(empty, algebra({ equation: SOLVED, promptAnswers: { p1: 'B1' } }), at(40)), algebra({ equation: SOLVED, workSteps: [{ n: 2 }], promptAnswers: { p1: 'B1' } }), at(60));
  server = save(server, [b]);
  const mid = valueOf(server, ALGEBRA);
  assert.equal(mid.value.promptAnswers.p1, 'B1');
  assert.equal(mid.fieldEditedAt['promptAnswers/p1'], undefined, 'a draft a copy saved with no times reached keeps the old rule');
  // C typed p1 at t45 (saved t47) and syncs late: its later answer wins.
  const c = { ...write(empty, algebra({ equation: SOLVED, promptAnswers: { p1: 'C1' } }), at(45)), savedAt: at(47) };
  assert.equal(valueOf(save(server, [c]), ALGEBRA).value.promptAnswers.p1, 'C1');
});

test('Step Algebra: an answer held with no time of its own marks an older build\'s copy, merged whole', () => {
  // An older build restored this copy and never dated its set: p2 has no time.
  const older = { value: algebra({ equation: SOLVED, promptAnswers: { p1: 'O1', p2: 'O2' } }), savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(5) } };
  const here = { value: algebra({ equation: SOLVED, promptAnswers: { p1: 'N1' } }), savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { work: at(5), 'promptAnswers/p1': at(10), promptAnswers: at(10) } };
  // As that build merges them: the dated set wins whole.
  assert.deepEqual(mergeFieldRecordCopies({ kind: 'step-algebra', a: older, b: here }).value.promptAnswers, { p1: 'N1' });
});

test('Step Algebra: the page groups a draft an older build touched as one set too', () => {
  const value = algebra({ equation: SOLVED, promptAnswers: { p1: 'O1', p2: 'O2' } });
  assert.deepEqual([...fieldRecordGroupsFor('step-algebra', value, { work: at(5), promptAnswers: at(30) }).keys()].sort(), ['promptAnswers', 'work']);
  assert.deepEqual([...fieldRecordGroupsFor('step-algebra', value, { work: at(5), 'promptAnswers/p1': at(30), 'promptAnswers/p2': at(20), promptAnswers: at(30) }).keys()].sort(), ['promptAnswers/p1', 'promptAnswers/p2', 'work']);
  const storage = executableSource(readFileSync(new URL('../../src/questionDraftStorage.js', import.meta.url), 'utf8'));
  assert.match(storage, /const incoming = fieldRecordGroupsFor\(fieldKind, value, stored\?\.fieldEditedAt\);/);
  assert.match(storage, /fieldRecordGroupsFor\(fieldKind, storedValue, stored\?\.fieldEditedAt\)\.forEach/);
});

test('Step Algebra: a copy saved with no answer times is dated as one set, as the build that saved it dated it', () => {
  const times = adoptedFieldEditedAt('step-algebra', { value: algebra({ equation: SOLVED, promptAnswers: { p1: '', p2: 'x = 4' } }), savedAt: at(30), savedAtIsEdit: true });
  assert.deepEqual(times, { work: -at(30), promptAnswers: -at(30) });
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

test('device: a Step Algebra prompt answer merged in behind the page is kept by its next write (RT22)', async () => {
  const p = await page();
  p.readQuestionDraft(ALGEBRA, {});
  p.input();
  p.writeQuestionDraft(ALGEBRA, algebra({ equation: STEP_ONE, promptAnswers: { first: 'x = 4' } }));
  const entries = readWorkspaceDraftEntries(serverDoc([{ key: ALGEBRA, value: algebra({ equation: STEP_ONE, promptAnswers: { second: 'It checks.' } }), savedAt: at(10), savedAtIsEdit: true, fieldEditedAt: { work: at(10), 'promptAnswers/second': at(10), promptAnswers: at(10) } }]));
  p.reconcileFieldRecordDrafts(entries, OWNER);
  // The question still shows only the first answer, and the student edits it.
  const shown = algebra({ equation: STEP_ONE, promptAnswers: { first: 'x = 5' } });
  p.input();
  p.writeQuestionDraft(ALGEBRA, shown);
  assert.deepEqual(p.envelope(ALGEBRA).value.promptAnswers, { first: 'x = 5', second: 'It checks.' });
  assert.deepEqual(shown.promptAnswers, { first: 'x = 5' }, 'the page\'s own answers are not changed under it');
});

test('device: Step Algebra\'s own Start over drops prompt answers it never showed, here and on the server (RT22 review)', async () => {
  const p = await page();
  p.readQuestionDraft(ALGEBRA, {});
  p.input();
  p.writeQuestionDraft(ALGEBRA, algebra({ equation: STEP_ONE, promptAnswers: { p1: 'x = 4' } }));
  // Another device's answer to p2 is merged in behind the page.
  const elsewhere = { key: ALGEBRA, value: algebra({ equation: STEP_ONE, promptAnswers: { p2: 'B2' } }), savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { work: at(10), 'promptAnswers/p2': at(20), promptAnswers: at(20) } };
  p.reconcileFieldRecordDrafts(readWorkspaceDraftEntries(serverDoc([elsewhere])), OWNER);
  assert.deepEqual(p.envelope(ALGEBRA).value.promptAnswers, { p1: 'x = 4', p2: 'B2' });
  // Start over in the tool (StepByStepAlgebraCore resetQuestionWork): the
  // reset first, then the cleared workspace.
  p.input();
  p.writeQuestionDraft(ALGEBRA, null, { edit: true });
  p.writeQuestionDraft(ALGEBRA, algebra({ equation: STEP_ONE }));
  const mine = p.envelope(ALGEBRA);
  assert.deepEqual(mine.value.promptAnswers, {}, 'the answer the page never showed is not put back');
  assert.ok(mine.resetAt > 0);
  // The server, which still holds p2, takes the reset too.
  const server = save(serverDoc([elsewhere]), [{ key: ALGEBRA, value: mine.value, savedAt: mine.savedAt, savedAtIsEdit: true, fieldEditedAt: mine.fieldEditedAt, resetAt: mine.resetAt }]);
  assert.deepEqual(valueOf(server, ALGEBRA).value.promptAnswers ?? {}, {});
});

test('Step Algebra\'s Start over writes the reset before the cleared workspace (RT22 review)', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  const reset = region(core, 'const resetQuestionWork = () => {', 'setMessage(', 'the in-tool Start over');
  assert.match(reset, /if \(!confirmed\) return;\s*writeQuestionDraft\(localDraftKey, null, \{ edit: true \}\);\s*setEquation\(pristineEquation\);/);
});

test('device: a write the device could not store leaves the page\'s view of the draft as it was (RT22 re-review)', async () => {
  let refuse = false;
  const storage = new MemoryStorage();
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { if (refuse && key === MULTI) throw new Error('QuotaExceededError'); setItem(key, value); };
  const p = await page(storage);
  p.readQuestionDraft(MULTI, {});
  p.input();
  p.writeQuestionDraft(MULTI, { a: '1', b: '2' });
  // The page removes b, but the device is full: the stored copy still has it.
  refuse = true;
  p.input();
  p.writeQuestionDraft(MULTI, { a: '1' });
  assert.deepEqual(p.envelope(MULTI).value, { a: '1', b: '2' });
  // Space again: the next write is not taken to hold b for a page that never saw it.
  refuse = false;
  p.input();
  p.writeQuestionDraft(MULTI, { a: '1' });
  assert.deepEqual(p.envelope(MULTI).value, { a: '1' });
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
