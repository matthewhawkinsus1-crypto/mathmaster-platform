/*
 * A SAVED UNDO STEP IS READ BACK THROUGH THE CHECKS ITS DRAFT IS READ THROUGH.
 *
 * The rules of persistedMathUndo.js's read, without React: each key of a saved
 * step goes through the check of the draft field it is restored into (here
 * hydrateToolDraftField with a field's own normalize, as useMathUndoHistory.js
 * restoreAsDraftField asks it of a tool's setter); a value the field keeps
 * comes back as the field restores it, a step its field cannot keep is
 * dropped, and a valid stack comes back as the very objects saved.
 * toolUndoDamagedRestore.test.mjs presses Undo in the real tools.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis.window || {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  },
  addEventListener() {},
  removeEventListener() {},
};

const { readPersistedUndo, repairUndoStep, writePersistedUndo } = await import('../../src/platform/workView/persistedMathUndo.js');
const { hydrateToolDraftField } = await import('../../src/tools/shared/usePersistentToolState.js');
const { draftNormalizer, draftShape: s } = await import('../../src/tools/shared/toolDraftShape.js');
const { EMPTY_MATH_UNDO_STACK } = await import('../../src/platform/workView/mathUndoStack.js');

// A draft field's own check, as a draft-backed setter answers it.
const fieldCheck = (field, initialValue, normalize = null) => (value) => hydrateToolDraftField({ record: { [field]: value }, field, initialValue, normalize });
const ROWS = draftNormalizer(s.list(s.record({ x: s.required(s.cell()), y: s.required(s.cell()) })));
const checks = {
  rows: fieldCheck('rows', [], ROWS),
  name: fieldCheck('name', ''),
  done: fieldCheck('done', false),
};

test('a valid step comes back as the very object saved, with nothing reported', () => {
  const step = { rows: [{ x: '1', y: 2 }], name: 'line', done: true, later: { kept: 1 } };
  const result = repairUndoStep(step, checks);
  assert.equal(result.value, step);
  assert.deepEqual(result.issues, []);
});

test('a key is repaired as its draft field repairs it: the valid part is kept', () => {
  const step = { rows: [{ x: '1', y: 2 }, { x: null }, 'row'], name: 12, done: false };
  const result = repairUndoStep(step, checks);
  assert.deepEqual(result.value, { rows: [{ x: '1', y: 2 }], name: '12', done: false });
  assert.notEqual(result.value, step);
  assert.ok(result.issues.some((issue) => issue.startsWith('rows: ')), result.issues.join('; '));
  assert.ok(result.issues.some((issue) => issue.startsWith('name: number-as-text')), result.issues.join('; '));
  assert.equal(result.value.rows[0], step.rows[0], 'a valid row is the same object');
});

test('a step whose value its field cannot keep is dropped, not given the blank', () => {
  // The draft would start these fields fresh; a saved step instead goes.
  [{ rows: 'abc' }, { name: { toString: 1 } }, { done: 'yes' }, { rows: [{ x: 1, y: 2 }], name: [] }].forEach((step) => {
    assert.equal(repairUndoStep(step, checks).value, undefined, JSON.stringify(step));
  });
  [null, 'step', 7, [], [{ rows: [] }]].forEach((step) => {
    assert.equal(repairUndoStep(step, checks).value, undefined, `${JSON.stringify(step)} is not a step`);
  });
});

test('a key no field claims is kept as it is, and __proto__ is removed', () => {
  const step = JSON.parse('{"name":"a","extra":{"deep":[1]},"__proto__":{"polluted":1}}');
  const result = repairUndoStep(step, checks);
  assert.deepEqual(Object.keys(result.value), ['name', 'extra']);
  assert.equal(result.value.extra, step.extra);
  assert.equal({}.polluted, undefined);
  // A field's own value loses its __proto__ keys at any depth, as a draft's does.
  const deep = repairUndoStep(JSON.parse('{"rows":[{"x":1,"y":2,"__proto__":{"polluted":1}}]}'), checks);
  assert.deepEqual(deep.value, { rows: [{ x: 1, y: 2 }] });
});

test('a check that hands back an equal copy repairs nothing: the step keeps the object it saved', () => {
  // Representation Match's assignments are rebuilt on every read.
  const copying = { sort: (value) => ({ value: { ...value }, restored: true, issues: [] }) };
  const step = { sort: { a: 0, b: 1 } };
  const result = repairUndoStep(step, copying);
  assert.equal(result.value, step);
  assert.deepEqual(result.issues, []);
  // A copy that differs is a repair.
  const dropping = { sort: () => ({ value: { a: 0 }, restored: true, issues: ['stale-card'] }) };
  assert.deepEqual(repairUndoStep(step, dropping).value, { sort: { a: 0 } });
});

test('a check that is not a draft field (null) keeps the key as before; one that throws drops the step', () => {
  assert.deepEqual(repairUndoStep({ a: 1 }, { a: () => null }).value, { a: 1 });
  assert.equal(repairUndoStep({ a: 1 }, { a: () => { throw new Error('x'); } }).value, undefined);
});

const save = (key, state, entries, resetKey = 'q') => writePersistedUndo(key, { resetKey, state, stack: { entries } });
const repair = (step) => repairUndoStep(step, checks);

test('readPersistedUndo: a stack that needs no repair comes back exactly as saved', () => {
  const steps = [{ rows: [], name: '' }, { rows: [{ x: 1, y: 2 }], name: '' }, { rows: [{ x: 1, y: 2 }], name: 'l' }];
  const state = { rows: [{ x: 1, y: 2 }], name: 'line' };
  save('undo-valid', state, steps);
  const plain = readPersistedUndo('undo-valid', { resetKey: 'q', state });
  let heard = null;
  const checked = readPersistedUndo('undo-valid', { resetKey: 'q', state, repair, onRepair: (report) => { heard = report; } });
  assert.deepEqual(checked, plain);
  assert.deepEqual(checked.entries, steps);
  assert.equal(heard, null, 'nothing is reported');
  // The limit still takes the newest steps.
  assert.deepEqual(readPersistedUndo('undo-valid', { resetKey: 'q', state, repair, limit: 2 }).entries, steps.slice(-2));
});

test('readPersistedUndo: damaged steps are repaired or dropped, and a step that changes nothing goes too', () => {
  const state = { rows: [{ x: 3, y: 4 }], name: 'c' };
  const steps = [
    { rows: [{ x: 1, y: 2 }], name: 'a' },
    { rows: 'damaged', name: 'b' },
    { rows: [{ x: 1, y: 2 }, null], name: 7 },
    { rows: [{ x: 3, y: 4 }, { y: 5 }], name: 'c' },
  ];
  save('undo-damaged', state, steps);
  let heard = null;
  const read = readPersistedUndo('undo-damaged', { resetKey: 'q', state, repair, onRepair: (report) => { heard = report; } });
  // Step 2 cannot be kept; step 3's row and name are repaired; step 4,
  // repaired, reads as the state after it, so an Undo there would change nothing.
  assert.deepEqual(read.entries, [{ rows: [{ x: 1, y: 2 }], name: 'a' }, { rows: [{ x: 1, y: 2 }], name: '7' }]);
  assert.equal(heard.saved, 4);
  assert.equal(heard.kept, 2);
  assert.ok(heard.issues.some((issue) => issue.startsWith('step 2 dropped')), heard.issues.join('; '));
  assert.ok(heard.issues.some((issue) => issue.startsWith('step 4 dropped')), heard.issues.join('; '));
  // Nothing left is an empty stack: Undo stays off.
  save('undo-nothing', state, [{ rows: null }, 'step']);
  assert.equal(readPersistedUndo('undo-nothing', { resetKey: 'q', state, repair }), EMPTY_MATH_UNDO_STACK);
});

test('readPersistedUndo: the stack still has to be this question\'s and end at the state shown', () => {
  const state = { rows: [], name: 'x' };
  save('undo-other', state, [{ rows: [], name: '' }], 'other-question');
  assert.equal(readPersistedUndo('undo-other', { resetKey: 'q', state, repair }), EMPTY_MATH_UNDO_STACK);
  save('undo-moved', { rows: [], name: 'y' }, [{ rows: [], name: '' }]);
  assert.equal(readPersistedUndo('undo-moved', { resetKey: 'q', state, repair }), EMPTY_MATH_UNDO_STACK);
});
