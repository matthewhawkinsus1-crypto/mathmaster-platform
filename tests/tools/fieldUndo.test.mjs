/*
 * UNDO OVER A TOOL'S ANSWER FIELDS (pass 3, TOOL-2; src/tools/shared/fieldUndo.js).
 *
 * Ten tools joined Universal Undo through useFieldUndoHistory, which records
 * `toolFieldState(fields)` in the platform history (mathUndoStack.js) and puts
 * a previous state back with `restoreToolFields`. Node cannot render the hook,
 * so this drives the same two functions through the same stack the hook uses:
 * edits are recorded, Undo walks them back one at a time to exactly what the
 * student had, and an Undo writes only what it takes back. The rendered tools
 * are driven in a browser by tests/browser/toolFocusAndUndo.mjs (every tool,
 * through the real QuestionEngine and its work-bar Undo, across a reload).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreToolFields, toolFieldState } from '../../src/tools/shared/fieldUndo.js';
import { EMPTY_MATH_UNDO_STACK, recordMathUndoEntry, undoMathUndoEntry } from '../../src/platform/workView/mathUndoStack.js';

// A tool's fields as React would hold them: a value and its setter.
const makeTool = (initial) => {
  const values = { ...initial };
  const writes = [];
  const fields = () => Object.fromEntries(Object.keys(values).map((name) => [name, [values[name], (next) => { values[name] = next; writes.push(name); }]]));
  return { values, writes, fields };
};

test('the recorded state is exactly the answer fields, by name', () => {
  const tool = makeTool({ fogAnswer: '7', gofAnswer: '', restrictionChoice: '__unanswered__' });
  assert.deepEqual(toolFieldState(tool.fields()), { fogAnswer: '7', gofAnswer: '', restrictionChoice: '__unanswered__' });
});

test('edits are recorded and each Undo restores exactly the state before the last one', () => {
  const tool = makeTool({ p: '', q: '', choice: '__unanswered__' });
  let stack = EMPTY_MATH_UNDO_STACK;
  let previous = toolFieldState(tool.fields());
  const edit = (name, value, at) => {
    tool.values[name] = value;
    const next = toolFieldState(tool.fields());
    stack = recordMathUndoEntry(stack, previous, next, { now: at });
    previous = next;
  };
  edit('p', '3', 1000);
  edit('q', '-4', 5000);            // another field: its own step
  edit('choice', 'hole', 9000);     // a choice: its own step
  assert.equal(stack.entries.length, 3);

  const undo = () => {
    const { stack: nextStack, restored, changed } = undoMathUndoEntry(stack);
    assert.ok(changed);
    stack = nextStack;
    restoreToolFields(tool.fields(), restored);
    previous = toolFieldState(tool.fields());
  };
  undo();
  assert.deepEqual(tool.values, { p: '3', q: '-4', choice: '__unanswered__' });
  undo();
  assert.deepEqual(tool.values, { p: '3', q: '', choice: '__unanswered__' });
  undo();
  assert.deepEqual(tool.values, { p: '', q: '', choice: '__unanswered__' });
  assert.equal(undoMathUndoEntry(stack).changed, false, 'nothing left to undo');
});

test('an Undo writes back only the fields it changes, and leaves a field the old history never had', () => {
  const tool = makeTool({ cells: ['2', '', '', ''], expanded: '2, -5', note: 'kept' });
  const written = restoreToolFields(tool.fields(), { cells: ['', '', '', ''], expanded: '2, -5' });
  assert.deepEqual(written, ['cells']);
  assert.deepEqual(tool.writes, ['cells']);
  assert.deepEqual(tool.values, { cells: ['', '', '', ''], expanded: '2, -5', note: 'kept' });
  assert.deepEqual(restoreToolFields(tool.fields(), null), [], 'no state, no writes');
});

test('an Open Sort group removed with its name and explanation comes back whole', () => {
  // The board records `{ groups }` (OpenSortBoard.jsx); the same stack.
  const before = { groups: [
    { id: 'group-1', name: 'Lines', rationale: 'Each one has a constant rate of change.', itemIds: ['a', 'c'] },
    { id: 'group-2', name: 'Curves', rationale: 'Each one bends and has a turning point.', itemIds: ['b'] },
    { id: 'group-3', name: 'Mixed', rationale: 'These two share an intercept at the origin.', itemIds: ['d'] },
  ] };
  const after = { groups: before.groups.filter((group) => group.id !== 'group-3') };
  const stack = recordMathUndoEntry(EMPTY_MATH_UNDO_STACK, before, after, { now: 1 });
  const { restored } = undoMathUndoEntry(stack);
  assert.deepEqual(restored, before);
});
