/*
 * "UNDO ON GRAPH 2" IS THE SAME HISTORY, FILTERED (PQ-009).
 *
 * The representations board keeps one Undo history for the whole board and an
 * Undo on each of its three graphs. The graph's Undo takes back the latest
 * change to THAT graph — even when the student typed elsewhere since — and the
 * step leaves the shared history, so the platform Undo can never replay it and
 * never loses the later typing. src/platform/workView/mathUndoStack.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_MATH_UNDO_STACK,
  latestMathUndoChangeIndex,
  mathematicalSnapshot,
  recordMathUndoEntry,
  undoMathUndoChange,
  undoMathUndoEntry,
} from '../../src/platform/workView/mathUndoStack.js';

const A = [0, 4];
const B = [1, 2];
const C = [2, 0];

// Record a session the way useMathUndoHistory does: one entry per change, the
// states a second apart so no two changes join a typing run.
const session = (states) => {
  let stack = EMPTY_MATH_UNDO_STACK;
  for (let index = 1; index < states.length; index += 1) {
    stack = recordMathUndoEntry(stack, states[index - 1], states[index], { now: 1_000 * (index + 1) });
  }
  return { stack, current: states.at(-1) };
};
// Every state the platform Undo walks back through, newest first. Bounded: a
// history that never runs out is itself the failure.
const MAX_PRESSES = 100;
const platformUndoAll = (stack) => {
  const seen = [];
  let rest = stack;
  for (let press = 0; press < MAX_PRESSES; press += 1) {
    const { stack: next, restored, changed } = undoMathUndoEntry(rest);
    if (!changed) return seen;
    seen.push(restored);
    rest = next;
  }
  throw new Error(`Undo never ran out after ${MAX_PRESSES} presses`);
};

test('the graph\'s Undo takes back its own latest change and keeps the typing that came after it', () => {
  const { stack, current } = session([
    { slope: '', g2: [], yInt: '' },
    { slope: '-2', g2: [], yInt: '' },
    { slope: '-2', g2: [A], yInt: '' },
    { slope: '-2', g2: [A], yInt: '(0,4)' },
  ]);
  const { stack: after, restored, changed } = undoMathUndoChange(stack, current, ['g2']);
  assert.equal(changed, true);
  assert.deepEqual(restored, { slope: '-2', g2: [], yInt: '(0,4)' }, 'the point is gone, the later y-intercept stays');
  // The platform Undo then walks back through the rest, and never brings the
  // point back.
  assert.deepEqual(platformUndoAll(after), [
    { slope: '-2', g2: [], yInt: '' },
    { slope: '', g2: [], yInt: '' },
  ]);
});

test('repeated graph Undos walk back that graph alone, then stop', () => {
  let { stack, current } = session([
    { g2: [], slope: '' },
    { g2: [A], slope: '' },
    { g2: [A], slope: '-2' },
    { g2: [A, B], slope: '-2' },
    { g2: [C, B], slope: '-2' }, // a drag
  ]);
  const seen = [];
  for (let press = 0; press < MAX_PRESSES; press += 1) {
    const result = undoMathUndoChange(stack, current, 'g2');
    if (!result.changed) break;
    ({ stack } = result);
    current = result.restored;
    seen.push(current.g2);
  }
  assert.deepEqual(seen, [[A, B], [A], []], 'the drag, the second point, the first point — then nothing left');
  assert.equal(current.slope, '-2', 'the slope typed between them is untouched');
  assert.deepEqual(platformUndoAll(stack), [{ g2: [], slope: '' }], 'only the slope step is left');
});

test('a graph Undo on the most recent change is exactly the platform Undo', () => {
  const { stack, current } = session([{ g1: [], g2: [] }, { g1: [A], g2: [] }, { g1: [A], g2: [B] }]);
  const filtered = undoMathUndoChange(stack, current, ['g2']);
  const plain = undoMathUndoEntry(stack);
  assert.deepEqual(filtered.restored, plain.restored);
  assert.deepEqual(filtered.stack.entries, plain.stack.entries);
});

test('no history for that graph: nothing to undo, nothing changed', () => {
  const { stack, current } = session([{ g1: [], g2: [] }, { g1: [A], g2: [] }]);
  assert.equal(latestMathUndoChangeIndex(stack, current, ['g2']), -1);
  const result = undoMathUndoChange(stack, current, ['g2']);
  assert.equal(result.changed, false);
  assert.equal(result.stack, stack, 'the same stack back');
  assert.equal(latestMathUndoChangeIndex(EMPTY_MATH_UNDO_STACK, current, ['g1']), -1);
  assert.equal(latestMathUndoChangeIndex(stack, current, []), -1, 'no keys, no change');
});

test('a step that changed two places gives back only the filtered one, and the other stays undoable', () => {
  const { stack, current } = session([{ g2: [], slope: '' }, { g2: [A], slope: '-2' }]);
  const result = undoMathUndoChange(stack, current, ['g2']);
  assert.deepEqual(result.restored, { g2: [], slope: '-2' });
  assert.deepEqual(platformUndoAll(result.stack), [{ g2: [], slope: '' }]);
});

test('the history after a graph Undo has no step that changes nothing', () => {
  // Property: over random sessions on three graphs and one field, any mix of
  // graph Undos and platform Undos never leaves an entry equal to its
  // neighbour or to the live state, and each platform Undo changes something.
  let seed = 7;
  const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let round = 0; round < 200; round += 1) {
    const states = [{ g1: [], g2: [], g3: [], slope: '' }];
    for (let step = 0; step < 8; step += 1) {
      const previous = states.at(-1);
      const key = ['g1', 'g2', 'g3', 'slope'][Math.floor(random() * 4)];
      const value = key === 'slope' ? `${previous.slope}${step}` : [...previous[key], [step, round]];
      states.push({ ...previous, [key]: value });
    }
    let { stack, current } = session(states);
    for (let press = 0; press < 12; press += 1) {
      const graph = ['g1', 'g2', 'g3', null][Math.floor(random() * 4)];
      const result = graph ? undoMathUndoChange(stack, current, [graph]) : undoMathUndoEntry(stack);
      if (!result.changed) continue;
      assert.notEqual(mathematicalSnapshot(result.restored), mathematicalSnapshot(current), `round ${round}: an Undo that changed nothing`);
      ({ stack } = result);
      current = result.restored;
      const snapshots = stack.entries.map(mathematicalSnapshot);
      snapshots.forEach((snapshot, index) => {
        if (index > 0) assert.notEqual(snapshot, snapshots[index - 1], `round ${round}: two identical neighbours`);
      });
      if (snapshots.length) assert.notEqual(snapshots.at(-1), mathematicalSnapshot(current), `round ${round}: an entry equal to the live state`);
    }
  }
});
