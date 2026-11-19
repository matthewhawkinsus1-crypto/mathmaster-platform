/*
 * A STEP ALGEBRA OPERATION NOT YET APPLIED IS JUDGED BY ITS OWN EDIT TIME
 * (src/platform/persistence/stepAlgebraOperationEdit.js, used by
 * src/questionDraftStorage.js's settle).
 *
 * 455b994e keeps the operation a device was typing when both copies of a Step
 * Algebra draft hold the same committed board and the device's copy was edited
 * later. "Later" was the whole copy's time, so a prompt answer decided which
 * operation survived. A review proved it with two devices, each its own copy
 * of questionDraftStorage.js and its own storage, and the shared server merge
 * (functions/shared/workspaceDraftSchema.mjs), driven as the sync drives it:
 *
 *   - Start over undone: A holds Divide 7, synced, not applied; the student
 *     presses Start over on B; before A reads the server's copy the student
 *     answers a prompt on A. A's read dropped the pre-reset operation and the
 *     rule copied Divide 7 back; A's next save put it on the server, and B
 *     got it back.
 *   - A fresh cart Chromebook whose student answers a prompt before the read
 *     lands dropped the Divide 7 left unapplied on another Chromebook (before
 *     455b994e it came back).
 *
 * Both run below exactly so, red on the rule as 455b994e wrote it. What
 * 455b994e fixed is still held by tests/platform/fieldRecordDraftMerge.test.mjs
 * (R12) and, in the real App, tests/browser/teacherWorkflow/
 * stepAlgebraOperandDraftJourneys.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkspaceDraftPatch,
  mergeWorkspaceDraftDocument,
  readWorkspaceDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import {
  STEP_ALGEBRA_OPERATION_EDIT,
  keepsOwnStepAlgebraOperation,
  stampStepAlgebraOperationEdit,
  stepAlgebraOperationEditedAt,
} from '../../src/platform/persistence/stepAlgebraOperationEdit.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const STUDENT = 'S-operation';
const ASSIGNMENT = 'A-operation';
const OWNER = { studentId: STUDENT, assignmentId: ASSIGNMENT };
const KEY = `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:4:0:student:step-algebra`;
const EQ = { left: '3x + 6', right: '21' };
const DIVIDE = { operation: 'divide', sourceSide: 'left' };
const board = ({ armedTile = null, operand = '', promptAnswers = {}, equation = EQ, workSteps = [] } = {}) => ({
  algebraDraftVersion: 3, equation, supportLevel: 'standard', operand, distributionState: null, structureTool: null,
  workSteps, armedTile, pendingMove: null, crossedSides: [], cancelledPairIds: {}, selectedCancellationIndices: {},
  simplificationAnswers: {}, promptAnswers, simplifyTool: null,
});
const operationOf = (value) => (value?.armedTile ? `${value.armedTile.operation} ${value.operand}` : 'none');

/* ------------------------------------------------------- the edit time */

test('an edit to the work dates the operation; a prompt answer, a write-back or a fresh board do not', () => {
  const times = { work: 100 };
  const chosen = stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board(), next: board({ armedTile: DIVIDE }), edit: true, now: 500, times });
  assert.deepEqual(chosen, { work: 100, [STEP_ALGEBRA_OPERATION_EDIT]: 500 }, 'choosing an operation');
  assert.deepEqual(times, { work: 100 }, 'the times it was given are not changed under the caller');
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board({ armedTile: DIVIDE }), next: board({ armedTile: DIVIDE, operand: '7' }), edit: true, now: 600, times: chosen })[STEP_ALGEBRA_OPERATION_EDIT], 600, 'typing its value');
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board({ armedTile: DIVIDE, operand: '7' }), next: board(), edit: true, now: 700, times: chosen })[STEP_ALGEBRA_OPERATION_EDIT], 700, 'cancelling it');
  // Not the operation's edits.
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board({ armedTile: DIVIDE }), next: board({ armedTile: DIVIDE, promptAnswers: { check: 'x = 5' } }), edit: true, now: 800, times: chosen }), chosen, 'a prompt answer');
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board(), next: board({ armedTile: DIVIDE }), edit: false, now: 800, times }), times, 'a write that is not the student\'s edit');
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: null, next: board(), edit: true, now: 800, times }), times, 'the board written over a Start over\'s tombstone, or over nothing');
  // The same work with its fields in another order is not an edit.
  const reordered = Object.fromEntries(Object.entries(board({ armedTile: DIVIDE })).reverse());
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'step-algebra', previous: board({ armedTile: DIVIDE }), next: reordered, edit: true, now: 800, times }), times);
  // Every other draft keeps its times as they were.
  assert.equal(stampStepAlgebraOperationEdit({ kind: 'multi-answer', previous: { a: '1' }, next: { a: '2' }, edit: true, now: 800, times }), times);
  assert.equal(stepAlgebraOperationEditedAt({ fieldEditedAt: chosen }), 500);
  assert.equal(stepAlgebraOperationEditedAt({ fieldEditedAt: { work: 100 } }), 0);
  assert.equal(stepAlgebraOperationEditedAt(null), 0);
});

test('this device keeps its operation only when it edited it after the latest Start over and last attempt, and no earlier than the saved copy', () => {
  const own = (at) => ({ fieldEditedAt: { [STEP_ALGEBRA_OPERATION_EDIT]: at }, savedAt: 9_000, savedAtIsEdit: true });
  const saved = (at, extra = {}) => ({ fieldEditedAt: at ? { [STEP_ALGEBRA_OPERATION_EDIT]: at } : {}, savedAt: 5_000, savedAtIsEdit: true, ...extra });
  const merged = (resetAt = 0) => ({ value: board(), ...(resetAt ? { resetAt } : {}) });
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(3_000), saved: saved(2_000), merged: merged() }), true, 'edited later here');
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(3_000), saved: saved(3_000), merged: merged() }), true, 'a tie: the saved copy can be this device\'s own first save');
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(2_000), saved: saved(3_000), merged: merged() }), false, 'edited later there');
  // Whatever the copy's own time: a prompt answer moves that, not this.
  assert.equal(keepsOwnStepAlgebraOperation({ own: { fieldEditedAt: { 'promptAnswers/check': 8_000 }, savedAt: 8_000, savedAtIsEdit: true }, saved: saved(2_000), merged: merged() }), false, 'never edited here');
  // The board a Start over left (saved then, its operation never edited since).
  const afterReset = saved(0, { savedAt: 4_000 });
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(3_000), saved: afterReset, merged: merged(4_000) }), false, 'edited before a Start over, wherever it was pressed');
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(4_500), saved: afterReset, merged: merged(4_000) }), true, 'edited after it');
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(3_000), saved: saved(2_000), merged: merged(4_000) }), false, 'before it, even against an older operation');
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(3_000), saved: saved(2_000), merged: merged(), canonicalAt: 3_000 }), false, 'from before the last submitted attempt');
  // A copy an older build saved has no operation time: its own time bounds it.
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(6_000), saved: saved(0), merged: merged() }), true);
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(4_000), saved: saved(0), merged: merged() }), false);
  assert.equal(keepsOwnStepAlgebraOperation({ own: own(4_000), saved: saved(0, { savedAtIsEdit: false }), merged: merged() }), true, 'an opening\'s time bounds nothing');
});

test('the shared merge carries the operation\'s time as it carries any time it does not group: the later, never one from before a reset the copy missed', () => {
  // functions/shared is not changed for this; if it ever drops a time it does
  // not group, the server's copy stops saying when its operation was edited.
  const save = (existing, entries) => mergeWorkspaceDraftDocument({ existing, patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }) });
  const entry = (value, savedAt, fieldEditedAt, extra = {}) => ({ key: KEY, value, savedAt, savedAtIsEdit: true, fieldEditedAt, questionIndex: 4, variantIndex: 0, ...extra });
  const read = (document) => readWorkspaceDraftEntries(document).find((item) => item.key === KEY);
  const A = save(null, [entry(board({ armedTile: DIVIDE, operand: '7' }), 1_000, { [STEP_ALGEBRA_OPERATION_EDIT]: 1_000 })]);
  assert.equal(stepAlgebraOperationEditedAt(read(A)), 1_000, 'stored and read back');
  const B = save(A, [entry(board({ armedTile: DIVIDE, operand: '3' }), 2_000, { [STEP_ALGEBRA_OPERATION_EDIT]: 2_000 })]);
  assert.equal(stepAlgebraOperationEditedAt(read(B)), 2_000, 'the later of the two');
  assert.equal(stepAlgebraOperationEditedAt(read(save(B, [entry(board({ armedTile: DIVIDE, operand: '7', promptAnswers: { p: '1' } }), 3_000, { [STEP_ALGEBRA_OPERATION_EDIT]: 1_000, 'promptAnswers/p': 3_000, promptAnswers: 3_000 })]))), 2_000, 'whichever copy is newer whole');
  // A Start over at 4_000; then a copy that never saw it, with its operation from before it.
  const reset = save(A, [entry(board(), 4_000, { work: 4_000 }, { resetAt: 4_000 })]);
  const missed = read(save(reset, [entry(board({ armedTile: DIVIDE, operand: '7', promptAnswers: { p: '1' } }), 5_000, { [STEP_ALGEBRA_OPERATION_EDIT]: 1_000, 'promptAnswers/p': 5_000, promptAnswers: 5_000 })]));
  assert.equal(stepAlgebraOperationEditedAt(missed), 0, 'an operation time from before the reset is gone');
  assert.equal(operationOf(missed.value), 'none');
});

/* ------------------------------------------ a copy the build before began */

// A review of this rule (PR #564): the build before dated no operation, so a
// copy it began on a Chromebook and left unsettled (the student worked before
// the server's copy was read, then the page reloaded into this build) holds the
// operation its student typed with no time. Judged as never edited, it yielded,
// as a fresh copy's work does, to the saved copy's operation, older or not:
// Divide 3 became the saved Divide 7, which 455b994e's rule had kept. Such a
// copy is fresh, holds an operation and has no time, and is dated by its own
// last save, as that build dated it; a fresh copy this build began is not.
test('a fresh copy the build before began, holding an operation and no time, is dated by its own last save; no other copy is', () => {
  const legacy = (extra = {}) => ({ fieldEditedAt: {}, fieldsFresh: true, savedAt: 6_000, savedAtIsEdit: true, value: board({ armedTile: DIVIDE, operand: '3' }), ...extra });
  const saved = (savedAt, at = 0) => ({ fieldEditedAt: at ? { [STEP_ALGEBRA_OPERATION_EDIT]: at } : {}, savedAt, savedAtIsEdit: true });
  const keeps = (own, other, { resetAt = 0, canonicalAt = 0 } = {}) => keepsOwnStepAlgebraOperation({ own, saved: other, merged: { value: board(), ...(resetAt ? { resetAt } : {}) }, canonicalAt });
  assert.equal(keeps(legacy(), saved(5_000)), true, 'over an older copy saved without times');
  assert.equal(keeps(legacy(), saved(9_000, 4_000)), true, 'over an older operation, though its copy was saved later');
  assert.equal(keeps(legacy(), saved(6_000)), true, 'a tie: its own first save, merged on the server');
  assert.equal(keeps(legacy(), saved(8_000)), false, 'not over a copy saved later without times');
  assert.equal(keeps(legacy(), saved(7_000, 7_000)), false, 'nor over an operation edited later');
  assert.equal(keeps(legacy(), saved(5_000), { resetAt: 5_500 }), false, 'nor past a Start over it has not seen: its time can be a prompt answer\'s after one');
  assert.equal(keeps(legacy({ resetAt: 5_500 }), saved(5_000), { resetAt: 5_500 }), true, 'one it made itself is behind it');
  assert.equal(keeps(legacy(), saved(5_000), { canonicalAt: 6_000 }), false, 'nor from before the last submitted attempt');
  assert.equal(keeps(legacy({ savedAtIsEdit: false }), saved(5_000)), false, 'an opening\'s time dates nothing');
  // Not such a copy.
  assert.equal(keeps(legacy({ fieldsFresh: false }), saved(5_000)), false, 'a settled copy: the shared merge judges it, the later copy whole');
  assert.equal(keeps(legacy({ value: board({ promptAnswers: { check: 'x = 5' } }) }), saved(5_000)), false, 'a fresh copy holding no operation, as this build begins one: the saved operation comes back');
});

/* ----------------------------------------------- two devices, one server */

let instance = 0;
const device = async () => {
  const storage = new MemoryStorage();
  const win = { localStorage: storage };
  globalThis.window = win;
  instance += 1;
  const module = await import(`../../src/questionDraftStorage.js?operation=${instance}`);
  const listeners = {};
  module.trackStudentInput({ addEventListener: (type, listener) => { listeners[type] = listener; } });
  // Each device's module reads its own storage: this one's, while it acts.
  const onThisDevice = (fn) => { globalThis.window = win; return fn(); };
  return {
    input: () => listeners.keydown?.({ isTrusted: true }),
    read: () => onThisDevice(() => module.readQuestionDraft(KEY, {})),
    write: (value, options) => onThisDevice(() => module.writeQuestionDraft(KEY, value, options)),
    settle: (entries) => onThisDevice(() => module.reconcileFieldRecordDrafts(entries, OWNER)),
    restore: (entries) => onThisDevice(() => module.restoreQuestionDrafts(entries)),
    envelope: () => JSON.parse(storage.getItem(KEY) || 'null'),
    // A copy as another build left it in this device's storage.
    leave: (envelope) => storage.setItem(KEY, JSON.stringify(envelope)),
    // What the background save sends for the key: its newest copy.
    entry() {
      const env = this.envelope();
      return { key: KEY, value: env.value, savedAt: env.savedAt, savedAtIsEdit: env.savedAtIsEdit === true, fieldEditedAt: env.fieldEditedAt, fieldsFresh: env.fieldsFresh === true, resetAt: env.resetAt || 0, questionIndex: 4, variantIndex: 0 };
    },
  };
};
const server = () => {
  let document = null;
  return {
    save: (entry) => { document = mergeWorkspaceDraftDocument({ existing: document, patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [entry] }) }); },
    entries: () => readWorkspaceDraftEntries(document),
    value: () => readWorkspaceDraftEntries(document).find((item) => item.key === KEY)?.value,
  };
};

const realNow = Date.now;
let clock = 0;
const tick = (ms) => { clock += ms; };
const withClock = async (body) => {
  clock = Date.parse('2026-11-18T09:00:00Z');
  Date.now = () => clock;
  try { await body(); } finally { Date.now = realNow; }
};

test('device: a Start over on another Chromebook is not undone by a prompt answer typed here before the read', () => withClock(async () => {
  const cloud = server();
  // A: the question open and settled once; the student chooses Divide and types 7.
  const A = await device();
  A.settle([]);
  A.read();
  A.write(board());
  tick(1_000); A.input();
  A.write(board({ armedTile: DIVIDE, operand: '7' }));
  cloud.save(A.entry());
  assert.equal(operationOf(cloud.value()), 'divide 7');
  // B reads the server's copy, then the student presses Start over there.
  tick(60_000);
  const B = await device();
  B.settle(cloud.entries());
  B.restore(cloud.entries());
  B.read();
  assert.equal(operationOf(B.envelope().value), 'divide 7');
  tick(5_000); B.input();
  B.write(null, { edit: true });
  B.write(board());
  cloud.save(B.entry());
  assert.equal(operationOf(cloud.value()), 'none', 'the Start over reaches the server');
  // A, which has not read the server since, answers a prompt and saves.
  tick(30_000); A.input();
  A.write(board({ armedTile: DIVIDE, operand: '7', promptAnswers: { check: 'x = 5 works' } }));
  cloud.save(A.entry());
  // A reads the server's copy: the operation chosen before the Start over goes.
  tick(5_000);
  A.settle(cloud.entries());
  assert.equal(operationOf(A.envelope().value), 'none', 'A drops Divide 7 (it came back here before)');
  assert.deepEqual(A.envelope().value.promptAnswers, { check: 'x = 5 works' }, 'and keeps the answer typed after the Start over');
  // A's next save, and B's next read.
  tick(5_000); A.input();
  A.write(A.envelope().value);
  cloud.save(A.entry());
  assert.equal(operationOf(cloud.value()), 'none', 'the server keeps the Start over');
  B.settle(cloud.entries());
  assert.equal(operationOf(B.envelope().value), 'none', 'and B does not get Divide 7 back');
}));

test('device: a fresh Chromebook whose student answers a prompt before the read gets the operation left unapplied on another back', () => withClock(async () => {
  const cloud = server();
  // Yesterday, on another Chromebook: Divide chosen and 7 typed, not applied.
  const other = await device();
  other.settle([]);
  other.read();
  other.write(board());
  tick(1_000); other.input();
  other.write(board({ armedTile: DIVIDE, operand: '7' }));
  cloud.save(other.entry());
  // Today a fresh cart Chromebook opens the question before the read, and the student answers the prompt first.
  tick(86_400_000);
  const cart = await device();
  cart.read();
  cart.write(board());
  assert.equal(cart.envelope().fieldsFresh, true);
  tick(800); cart.input();
  cart.write(board({ promptAnswers: { check: 'I will check by substituting' } }));
  tick(400);
  const settled = cart.settle(cloud.entries());
  assert.equal(operationOf(cart.envelope().value), 'divide 7', 'the operation comes back (it was dropped before)');
  assert.deepEqual(cart.envelope().value.promptAnswers, { check: 'I will check by substituting' });
  assert.equal(settled.settled, 1, 'and the question is remounted to show it');
}));

test('device: the operand typed on a fresh Chromebook still outlives the saved copy, and one chosen elsewhere later still wins (R12)', () => withClock(async () => {
  const cloud = server();
  const other = await device();
  other.settle([]);
  other.read();
  other.write(board());
  tick(1_000); other.input();
  other.write(board({ armedTile: DIVIDE, operand: '7' }));
  cloud.save(other.entry());
  // A fresh Chromebook: Divide and 3 typed before the read; then a prompt answer too.
  tick(60_000);
  const fresh = await device();
  fresh.read();
  fresh.write(board());
  tick(500); fresh.input();
  fresh.write(board({ armedTile: DIVIDE, operand: '3' }));
  // Its own first save reaches the server before its read: merged there with the 7.
  cloud.save(fresh.entry());
  tick(500); fresh.input();
  fresh.write(board({ armedTile: DIVIDE, operand: '3', promptAnswers: { check: 'yes' } }));
  cloud.save(fresh.entry());
  assert.equal(operationOf(cloud.value()), 'divide 7', 'a fresh copy yields on the server');
  tick(500);
  const settled = fresh.settle(cloud.entries());
  assert.equal(operationOf(fresh.envelope().value), 'divide 3', 'the student\'s 3 stays');
  assert.equal(settled.settled, 0, 'and nothing is remounted under them');
  // Another Chromebook chooses Divide 9 afterwards: that later operation wins here.
  tick(60_000);
  other.settle(cloud.entries());
  other.restore(cloud.entries());
  tick(1_000); other.input();
  other.write(board({ armedTile: DIVIDE, operand: '9' }));
  cloud.save(other.entry());
  tick(1_000);
  fresh.settle(cloud.entries());
  assert.equal(operationOf(fresh.envelope().value), 'divide 9');
}));


test('device: a copy the build before began and left unsettled keeps the operation its student typed (PR #564 review)', () => withClock(async () => {
  const seven = (savedAt, fieldEditedAt = {}) => readWorkspaceDraftEntries(mergeWorkspaceDraftDocument({ existing: null, patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: KEY, value: board({ armedTile: DIVIDE, operand: '7' }), savedAt, savedAtIsEdit: true, fieldEditedAt, questionIndex: 4, variantIndex: 0 }] }) }));
  // As the build before left it on this Chromebook: begun before the server's
  // copy was read, Divide chosen and 3 typed, no operation time. The page
  // reloads into this build, which reads the draft and writes it back.
  const reopenedAgainst = async (serverCopy) => {
    const cart = await device();
    cart.leave({ version: 2, savedAt: clock, value: board({ armedTile: DIVIDE, operand: '3' }), touchedAt: clock, savedAtIsEdit: true, fieldEditedAt: {}, fieldsFresh: true });
    cart.read();
    cart.write(cart.envelope().value, { edit: false });
    assert.equal(cart.envelope().fieldsFresh, true, 'still unsettled');
    cart.settle(serverCopy);
    return operationOf(cart.envelope().value);
  };
  // An older copy of the same board with Divide 7, saved by the build before or by this one.
  assert.equal(await reopenedAgainst(seven(clock - 3_600_000)), 'divide 3', 'the student\'s 3, not the older 7 (which replaced it under this rule)');
  assert.equal(await reopenedAgainst(seven(clock - 3_600_000, { [STEP_ALGEBRA_OPERATION_EDIT]: clock - 3_600_000 })), 'divide 3');
  // An operation edited later elsewhere still wins, and so does a Start over this copy never saw.
  assert.equal(await reopenedAgainst(seven(clock + 60_000, { [STEP_ALGEBRA_OPERATION_EDIT]: clock + 60_000 })), 'divide 7');
  const startedOver = mergeWorkspaceDraftDocument({
    existing: mergeWorkspaceDraftDocument({ existing: null, patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: KEY, value: board({ armedTile: DIVIDE, operand: '7' }), savedAt: clock - 3_600_000, savedAtIsEdit: true, fieldEditedAt: {}, questionIndex: 4, variantIndex: 0 }] }) }),
    patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: KEY, value: board(), savedAt: clock - 1_000, savedAtIsEdit: true, fieldEditedAt: { work: clock - 1_000 }, resetAt: clock - 1_000, questionIndex: 4, variantIndex: 0 }] }),
  });
  assert.equal(await reopenedAgainst(readWorkspaceDraftEntries(startedOver)), 'none');
}));

test('device: a fresh copy this build began is never dated by its last save: with no operation it yields, with one typed it keeps it (PR #564 review)', () => withClock(async () => {
  // On the server: Divide 7, left unapplied on another Chromebook an hour ago.
  const seven = readWorkspaceDraftEntries(mergeWorkspaceDraftDocument({ existing: null, patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: KEY, value: board({ armedTile: DIVIDE, operand: '7' }), savedAt: clock - 3_600_000, savedAtIsEdit: true, fieldEditedAt: {}, questionIndex: 4, variantIndex: 0 }] }) }));
  // This build's fresh copy, the prompt answered first: the same shape as the
  // build before's copy above (fresh, an edit, saved later, no operation time),
  // but it holds no operation.
  const answered = await device();
  answered.read();
  answered.write(board());
  tick(800); answered.input();
  answered.write(board({ promptAnswers: { check: 'by substituting' } }));
  assert.equal(answered.envelope().fieldsFresh, true);
  assert.equal(stepAlgebraOperationEditedAt(answered.envelope()), 0);
  answered.settle(seven);
  assert.equal(operationOf(answered.envelope().value), 'divide 7', 'the other Chromebook\'s operation comes back');
  // This build's fresh copy with Divide 3 typed: dated by this build, and kept.
  const typed = await device();
  typed.read();
  typed.write(board());
  tick(800); typed.input();
  typed.write(board({ armedTile: DIVIDE, operand: '3' }));
  assert.ok(stepAlgebraOperationEditedAt(typed.envelope()) > 0);
  typed.settle(seven);
  assert.equal(operationOf(typed.envelope().value), 'divide 3');
}));
