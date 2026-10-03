import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_MATH_UNDO_STACK,
  MATH_UNDO_TYPING_IDLE_MS,
  mathUndoDepth,
  recordMathUndoEntry,
  singleTextEditPath,
  undoMathUndoEntry,
} from '../../src/platform/workView/mathUndoStack.js';

// Feed a sequence of states through the stack the way useMathUndoHistory does.
const play = (states, { start = 1_000, gap = 120, stack = EMPTY_MATH_UNDO_STACK, clock = true } = {}) => {
  let current = stack;
  let at = start;
  for (let index = 1; index < states.length; index += 1) {
    const step = states[index];
    at += step.wait ?? gap;
    current = recordMathUndoEntry(current, states[index - 1].state ?? states[index - 1], step.state ?? step, clock ? { now: at } : {});
  }
  return current;
};
const typing = (text, base = {}, key = 'domain') => [...text].map((_, index) => ({ ...base, [key]: text.slice(0, index + 1) }));
const undoAll = (stack) => {
  const seen = [];
  let current = stack;
  for (;;) {
    const { stack: next, restored, changed } = undoMathUndoEntry(current);
    if (!changed) return seen;
    seen.push(restored);
    current = next;
  }
};

test('one run of typing in one field is one Undo', () => {
  const states = [{ domain: '' }, ...typing('-2, 1, 3')];
  const stack = play(states);
  assert.equal(mathUndoDepth(stack), 1, 'eight keystrokes, one entry');
  assert.deepEqual(undoAll(stack), [{ domain: '' }]);
});

test('a pause starts a new step, so Undo goes back to where the student stopped', () => {
  const states = [{ domain: '' }, { domain: '-' }, { domain: '-2' }, { state: { domain: '-2,' }, wait: MATH_UNDO_TYPING_IDLE_MS + 400 }, { domain: '-2, 1' }];
  const stack = play(states);
  assert.deepEqual(undoAll(stack), [{ domain: '-2' }, { domain: '' }]);
});

test('moving to another field starts a new step', () => {
  const states = [{ domain: '', range: '' }, { domain: '1', range: '' }, { domain: '1,', range: '' }, { domain: '1,', range: '3' }, { domain: '1,', range: '3,' }];
  assert.deepEqual(undoAll(play(states)), [{ domain: '1,', range: '' }, { domain: '', range: '' }]);
});

test('a point or an arrow between keystrokes is its own step, and typing after it is a new one', () => {
  const states = [
    { domain: '', points: [] },
    { domain: '1', points: [] },
    { domain: '1', points: [[0, 1]] },
    { domain: '12', points: [[0, 1]] },
  ];
  assert.equal(mathUndoDepth(play(states)), 3);
});

test('a long answer cannot push earlier work out of reach', () => {
  // Before grouping, 70 keystrokes spent the 60-entry limit and the arrow the
  // student drew first could no longer be undone.
  const text = 'the domain is every x-value that appears as an input in the relation!';
  const states = [{ arrows: [], domain: '' }, { arrows: [['a', 'b']], domain: '' }, ...typing(text, { arrows: [['a', 'b']] })];
  const restored = undoAll(play(states));
  assert.equal(restored.length, 2);
  assert.deepEqual(restored.at(-1), { arrows: [], domain: '' });
});

test('Backspace and a paste at the caret group with typing; a swapped choice and an overwrite do not', () => {
  assert.equal(singleTextEditPath({ a: 'x+1' }, { a: 'x+' }), '/a');
  assert.equal(singleTextEditPath({ a: 'x+1' }, { a: 'x+21' }), '/a', 'an insertion in the middle');
  assert.equal(singleTextEditPath({ a: '' }, { a: 'y = 2x + 1' }), '/a', 'a paste into an empty field');
  assert.equal(singleTextEditPath({}, { a: '1' }), '/a', 'the first keystroke in a field never set');
  assert.equal(singleTextEditPath({ isFunction: 'yes' }, { isFunction: 'no' }), null, 'a choice swapped');
  assert.equal(singleTextEditPath({ a: '123' }, { a: '7' }), null, 'select-all and type over it');
  assert.equal(singleTextEditPath({ a: '12' }, { a: undefined }), null, 'clearing a field is its own act');
  assert.equal(singleTextEditPath({ a: '1', b: '2' }, { a: '12', b: '23' }), null, 'two fields at once');
  assert.equal(singleTextEditPath({ x: 1 }, { x: 2 }), null, 'a number is not typing');
  assert.equal(singleTextEditPath({ a: '1' }, { a: '1' }), null, 'no change');
  assert.equal(singleTextEditPath({ rows: [{ y: '4' }] }, { rows: [{ y: '42' }] }), '/rows/0/y', 'a table cell');
  assert.equal(singleTextEditPath({ a: '1', view: { zoom: 1 } }, { a: '12', view: { zoom: 2 } }), '/a', 'the camera is never part of an edit');
});

// What a math field actually reports while a student types y = 1/2x − 3 on a
// keyboard (MathLive 0.110, read from the representations board in Chromium).
const MATHLIVE_SLOPE_INTERCEPT = ['y', 'y=', 'y=1', 'y=\\frac{1}{\\placeholder{}}', 'y=\\frac12', 'y=\\frac12x', 'y=\\frac12x-', 'y=\\frac12x-3'];

test('a fraction bar or a bracket typed into a math field does not split the run (PQ-009)', () => {
  // "/" turns y=1 into \frac{1}{\placeholder{}}; character by character that
  // is not one contiguous edit, and the run used to break there twice, so one
  // Undo handed back a fraction with an empty box in it.
  const states = [{ eq: '' }, ...MATHLIVE_SLOPE_INTERCEPT.map((eq) => ({ eq }))];
  assert.deepEqual(undoAll(play(states)), [{ eq: '' }], 'typing y = 1/2x − 3 is one step');
  assert.equal(singleTextEditPath({ a: 'y+2=2' }, { a: 'y+2=2\\left(\\right)' }), '/a', 'a bracket pair');
  assert.equal(singleTextEditPath({ a: 'y+2=2\\left(\\right)' }, { a: 'y+2=2\\left(x\\right)' }), '/a', 'typing inside it');
  assert.equal(singleTextEditPath({ a: 'y=\\frac12' }, { a: 'y=\\frac{1}{23}' }), '/a', 'a compact fraction growing a second digit');
  assert.equal(singleTextEditPath({ a: '-\\frac{2}{3x}' }, { a: '-\\frac23x' }), '/a', 'the typed-fraction rule moving x out of the denominator');
  // Still different acts:
  assert.equal(singleTextEditPath({ a: 'y=\\frac12x-3' }, { a: '5' }), null, 'select-all and type over an equation');
  assert.equal(singleTextEditPath({ a: 'x\\le5' }, { a: 'x\\ge5' }), null, 'a swapped relation');
});

// The same kind of typing on a slower Chromebook: MathLive reported the "/" and
// the denominator that followed it as ONE change (y-10=-4 straight to
// y-10=-\frac42), so the empty-box state above never appears. Read from the
// representations board's undo journey on a ChromeOS machine.
const MATHLIVE_POINT_SLOPE_BATCHED = ['y', 'y-', 'y-1', 'y-10', 'y-10=', 'y-10=-', 'y-10=-4', 'y-10=-\\frac42',
  'y-10=-\\frac42\\left(\\right)', 'y-10=-\\frac42\\left(x\\right)', 'y-10=-\\frac42\\left(x-\\right)', 'y-10=-\\frac42\\left(x-4\\right)'];

test('a fraction bar and its denominator arriving as one change do not split the run (slow device)', () => {
  // Compared with \frac still in the text, -4 → -frac42 is two insertions, not
  // one, so the run broke there and the next keystroke broke it again: one
  // equation became three Undo steps on a Chromebook and one on a fast laptop.
  const states = [{ eq: '' }, ...MATHLIVE_POINT_SLOPE_BATCHED.map((eq) => ({ eq }))];
  assert.deepEqual(undoAll(play(states)), [{ eq: '' }], 'typing y − 10 = −4/2 (x − 4) is one step however the keys arrive');
  assert.equal(singleTextEditPath({ a: 'y-10=-4' }, { a: 'y-10=-\\frac42' }), '/a', 'a batched fraction bar and denominator');
  assert.equal(singleTextEditPath({ a: 'y=1' }, { a: 'y=\\dfrac{1}{2}' }), '/a', 'a display fraction too');
  // A relation is a symbol, not a wrapper: swapping it is still its own act.
  assert.equal(singleTextEditPath({ a: 'x\\le5' }, { a: 'x\\ge5' }), null, 'a swapped relation');
  assert.equal(singleTextEditPath({ a: 'x\\lt5' }, { a: 'x\\le5' }), null, 'a swapped inequality');
});

test('typing a character and rubbing it out leaves no Undo that does nothing', () => {
  // The run's entry would restore exactly what is on screen: a press that
  // visibly does nothing. The step before it is the next Undo instead.
  const states = [{ a: '', points: [] }, { a: '', points: [[0, 1]] }, { a: '7', points: [[0, 1]] }, { a: '', points: [[0, 1]] }];
  const stack = play(states);
  assert.deepEqual(undoAll(stack), [{ a: '', points: [] }], 'the point is the next Undo');
  // Typing again after it is a new step.
  const again = recordMathUndoEntry(stack, { a: '', points: [[0, 1]] }, { a: '8', points: [[0, 1]] }, { now: 1_500 });
  assert.deepEqual(undoAll(again), [{ a: '', points: [[0, 1]] }, { a: '', points: [] }]);
});

test('a swapped choice made quickly is still two steps', () => {
  const states = [{ isFunction: '' }, { isFunction: 'yes' }, { isFunction: 'no' }];
  assert.deepEqual(undoAll(play(states)), [{ isFunction: 'yes' }, { isFunction: '' }]);
});

test('Undo ends the run: typing after it is a new step', () => {
  let stack = play([{ a: '' }, { a: '1' }, { a: '12' }]);
  ({ stack } = undoMathUndoEntry(stack));
  assert.equal(stack.typing, undefined);
  stack = recordMathUndoEntry(stack, { a: '' }, { a: '9' }, { now: 1_300 });
  assert.equal(mathUndoDepth(stack), 1);
  assert.deepEqual(undoAll(stack), [{ a: '' }]);
});

test('without a clock every change is still its own entry (callers that never asked for grouping)', () => {
  const states = [{ a: '' }, ...typing('abc', {}, 'a')];
  assert.equal(mathUndoDepth(play(states, { clock: false })), 3);
});

test('the limit still holds across runs', () => {
  let stack = EMPTY_MATH_UNDO_STACK;
  for (let index = 0; index < 5; index += 1) {
    stack = recordMathUndoEntry(stack, { n: index }, { n: index + 1 }, { now: 1_000 + index, limit: 3 });
  }
  assert.equal(mathUndoDepth(stack), 3);
});
