// WHAT A TYPED `sqrt` MEANS (F-RADICAL-TYPING).
//
// Characters typed into a math field build the expression they mean as
// written text (src/platform/math/typedRootEntry.js). These drive the pure
// state machine the way MathInput does: each key with the field's latex and
// the caret's depth as the key arrives. The traces below are what MathLive
// 0.110 reported, key by key, in a browser; tests/browser/mathEntryContract.mjs
// types the same spellings into the real MathInput and grades what it holds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  climbToDepth,
  inEmptyTypedRoot,
  typedRootCommandStep,
  typedRootKeyStep,
} from '../../src/platform/math/typedRootEntry.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';

// What the wiring is asked to do at each key: "<index>:<key> swallowed" or
// "<index>:<key> climb to <depth>" (out of groups before the key goes in).
const actionsFor = (trace) => {
  let state = null;
  return trace.flatMap(([key, value, depth], index) => {
    const step = typedRootKeyStep(state, { key }, { value, depth });
    state = step.state;
    return [
      ...(step.swallow ? [`${index}:${key} swallowed`] : []),
      ...(step.climbTo !== null ? [`${index}:${key} climb to ${step.climbTo}`] : []),
    ];
  });
};
const stateAfter = (trace) => trace.reduce(
  (state, [key, value, depth]) => typedRootKeyStep(state, { key }, { value, depth }).state,
  null,
);

// [key, the field's latex as the key arrives, the caret's depth]
const X3_SQRT_X = [
  ['x', '', 0], ['^', 'x', 0], ['3', 'x^{}', 1], [' ', 'x^3', 0],
  ['s', 'x^3', 0], ['q', 'x^3s', 0], ['r', 'x^3sq', 0], ['t', 'x^3sqr', 0],
  [' ', 'x^3\\sqrt{\\placeholder{}}', 1],
  ['x', 'x^3\\sqrt{\\placeholder{}}', 1],
];
const Y4_SQRT_X_OVER_X4 = [
  ['y', '', 0], ['^', 'y', 0], ['4', 'y^{}', 1],
  ['s', 'y^4', 0], ['q', 'y^4s', 0], ['r', 'y^4sq', 0], ['t', 'y^4sqr', 0],
  ['(', 'y^4\\sqrt{\\placeholder{}}', 1],
  ['x', 'y^4\\sqrt{\\left(\\right)}', 2],
  [')', 'y^4\\sqrt{\\left(x\\right)}', 2],
  ['/', 'y^4\\sqrt{\\left(x\\right)}', 1],
  ['x', '\\frac{y^4\\sqrt{\\left(x\\right)}}{\\placeholder{}}', 1],
  ['^', '\\frac{y^4\\sqrt{\\left(x\\right)}}{x}', 1],
  ['4', '\\frac{y^4\\sqrt{\\left(x\\right)}}{x^{}}', 2],
];
const BRACKETED_Y4_SQRT_X_OVER_X4 = [
  ['(', '', 0], ['y', '\\left(\\right)', 1], ['^', '\\left(y\\right)', 1], ['4', '\\left(y^{}\\right)', 2],
  [' ', '\\left(y^4\\right)', 1],
  ['s', '\\left(y^4\\right)', 0], ['q', '\\left(y^4\\right)s', 0], ['r', '\\left(y^4\\right)sq', 0], ['t', '\\left(y^4\\right)sqr', 0],
  ['(', '\\left(y^4\\right)\\sqrt{\\placeholder{}}', 1],
  ['x', '\\left(y^4\\right)\\sqrt{\\left(\\right)}', 2],
  [')', '\\left(y^4\\right)\\sqrt{\\left(x\\right)}', 2],
  [')', '\\left(y^4\\right)\\sqrt{\\left(x\\right)}', 1],
  ['/', '\\left(y^4\\sqrt{\\left(x\\right)}\\right)', 0],
];
const SQRT_X_N_OVER_2 = [
  ['s', '', 0], ['q', 's', 0], ['r', 'sq', 0], ['t', 'sqr', 0],
  ['(', '\\sqrt{\\placeholder{}}', 1],
  ['x', '\\sqrt{\\left(\\right)}', 2],
  ['^', '\\sqrt{\\left(x\\right)}', 2],
  ['n', '\\sqrt{\\left(x^{}\\right)}', 3],
  [')', '\\sqrt{\\left(x^{n}\\right)}', 3],
  ['/', '\\sqrt{\\left(x^{n}\\right)}', 1],
  ['2', '\\frac{\\sqrt{\\left(x^{n}\\right)}}{\\placeholder{}}', 1],
];

test('a space straight after sqrt keeps the root open: x^3 sqrt x is x³√x, not x³√□ x', () => {
  // The space used to move out of the root MathLive had just built, leaving it empty.
  assert.deepEqual(actionsFor(X3_SQRT_X), ['8:  swallowed']);
  // After it the radicand is MathLive's as before: no root is watched, only
  // the run of letters (which could start another sqrt).
  assert.deepEqual(stateAfter(X3_SQRT_X), { phase: 'letters', text: 'x' });
  // A second space is swallowed too: the root is still empty.
  const opened = stateAfter(X3_SQRT_X.slice(0, 8));
  const twice = typedRootKeyStep(typedRootKeyStep(opened, { key: ' ' }, { value: 'x^3\\sqrt{\\placeholder{}}', depth: 1 }).state, { key: ' ' }, { value: 'x^3\\sqrt{\\placeholder{}}', depth: 1 });
  assert.equal(twice.swallow, true);
});

test('the ) that matches the bracket typed after sqrt closes the root: y^4sqrt(x)/x^4 is (y⁴√(x))/x⁴', () => {
  // `)` is MathLive's own (it closes the bracket); the next character climbs
  // out of the root first, so `/` takes y⁴√(x) as its numerator.
  assert.deepEqual(actionsFor(Y4_SQRT_X_OVER_X4), ['9:) climb to 2', '10:/ climb to 0']);
  assert.equal(stateAfter(Y4_SQRT_X_OVER_X4), null);
});

test('the walkthrough\'s third spelling: (y^4 sqrt(x))/(x^4) closes the root, then the outer bracket', () => {
  // The space after y⁴ is outside any typed root: not this module's.
  assert.deepEqual(actionsFor(BRACKETED_Y4_SQRT_X_OVER_X4), ['11:) climb to 2', '12:) climb to 0']);
});

test('from inside a power, the closing bracket first climbs back to the bracket: sqrt(x^n)/2', () => {
  // Without the climb, MathLive's `)` would close from the exponent; the root
  // still ends there, and `/` comes after it.
  assert.deepEqual(actionsFor(SQRT_X_N_OVER_2), ['8:) climb to 2', '9:/ climb to 0']);
});

test('only the letters sqrt and cbrt, typed in a row, open a watched root', () => {
  const run = (keys) => keys.reduce((state, key) => typedRootKeyStep(state, { key }).state, null);
  assert.deepEqual(run([...'sqrt']), { phase: 'opening', name: 'sqrt' });
  assert.deepEqual(run([...'cbrt']), { phase: 'opening', name: 'cbrt' });
  // Letters before it do not matter (MathLive matches the end of the run).
  assert.deepEqual(run([...'ysqrt']), { phase: 'opening', name: 'sqrt' });
  // Shift (for a capital or a symbol) does not break the run.
  assert.deepEqual(run(['s', 'q', 'Shift', 'r', 't']), { phase: 'opening', name: 'sqrt' });
  // nthroot opens two boxes, index first: left as MathLive builds it.
  assert.notEqual(run([...'nthroot'])?.phase, 'opening');
  assert.notEqual(run([...'sqr2t'])?.phase, 'opening');
  assert.notEqual(run([...'sqrx'])?.phase, 'opening');
});

test('the root is watched only when the field shows the caret in its empty radicand', () => {
  const opening = { phase: 'opening', name: 'sqrt' };
  assert.equal(inEmptyTypedRoot('sqrt', 'x^3\\sqrt{\\placeholder{}}'), true);
  assert.equal(inEmptyTypedRoot('cbrt', '2\\sqrt[3]{\\placeholder{}}'), true);
  assert.equal(inEmptyTypedRoot('cbrt', '\\sqrt{\\placeholder{}}'), false);
  // MathLive did not build the root (the letters are still letters), or some
  // other empty box means the caret could be elsewhere: nothing is swallowed.
  for (const value of ['x^3sqrt', '\\frac{\\placeholder{}}{\\placeholder{}}\\sqrt{\\placeholder{}}', '\\sqrt{x}']) {
    const step = typedRootKeyStep(opening, { key: ' ' }, { value, depth: 1 });
    assert.equal(step.swallow, false, value);
    assert.notEqual(typedRootKeyStep(opening, { key: '(' }, { value, depth: 1 }).state?.phase, 'bracketed', value);
  }
  // Without a readable depth the bracket is not followed.
  assert.equal(typedRootKeyStep(opening, { key: '(' }, { value: '\\sqrt{\\placeholder{}}' }).state, null);
});

test('inside the root\'s bracket: brackets are counted, and a space stays put', () => {
  let state = typedRootKeyStep({ phase: 'opening', name: 'sqrt' }, { key: '(' }, { value: '\\sqrt{\\placeholder{}}', depth: 1 }).state;
  assert.deepEqual(state, { phase: 'bracketed', rootDepth: 1, bracketDepth: null, open: 0 });
  // sqrt((x+1)/2): the first `)` closes the inner bracket, the last one the root.
  for (const [key, depth] of [['(', 2], ['x', 3], ['+', 3], ['1', 3]]) state = typedRootKeyStep(state, { key }, { depth }).state;
  assert.equal(state.open, 1);
  assert.equal(state.bracketDepth, 2, 'the bracket\'s level is where the first key after `(` arrives');
  let step = typedRootKeyStep(state, { key: ')' }, { depth: 3 });
  assert.deepEqual([step.state.open, step.climbTo], [0, null], 'an inner `)` is MathLive\'s, nothing moves');
  step = typedRootKeyStep(step.state, { key: ')' }, { depth: 2 });
  assert.deepEqual(step, { state: { phase: 'closing', rootDepth: 1 }, swallow: false, climbTo: 2 });

  // sqrt(x + 1): a space at the bracket's level would have left the root.
  const bracketed = { phase: 'bracketed', rootDepth: 1, bracketDepth: 2, open: 0 };
  assert.equal(typedRootKeyStep(bracketed, { key: ' ' }, { depth: 2 }).swallow, true);
  // Deeper, in a power inside the root, the space moves out of the power as usual.
  assert.equal(typedRootKeyStep(bracketed, { key: ' ' }, { depth: 3 }).swallow, false);
  assert.equal(typedRootKeyStep(bracketed, { key: ' ' }, { depth: 3 }).state.phase, 'bracketed');
  // A field that types brackets as characters (an ordered pair) keeps the
  // caret in the radicand: the bracket's level is the radicand's.
  const literal = typedRootKeyStep({ phase: 'bracketed', rootDepth: 1, bracketDepth: null, open: 0 }, { key: '2' }, { depth: 1 }).state;
  assert.equal(literal.bracketDepth, 1);
  assert.equal(typedRootKeyStep(literal, { key: ')' }, { depth: 1 }).climbTo, 1);
});

test('the watch ends, changing nothing, when the caret leaves the bracket another way', () => {
  const bracketed = { phase: 'bracketed', rootDepth: 1, bracketDepth: 2, open: 0 };
  // MathInput's `=` leaves every group; the next key finds the caret outside.
  assert.deepEqual(typedRootKeyStep(bracketed, { key: '2' }, { depth: 0 }), { state: null, swallow: false, climbTo: null });
  assert.deepEqual(typedRootKeyStep(bracketed, { key: ')' }, { depth: 1 }), { state: null, swallow: false, climbTo: null });
  assert.deepEqual(typedRootKeyStep(bracketed, { key: ')' }, {}), { state: null, swallow: false, climbTo: null });
});

test('an arrow, Backspace, Enter or a shortcut ends the watch where it stands — the old behaviour is the fallback', () => {
  const watched = [
    { phase: 'opening', name: 'sqrt' },
    { phase: 'bracketed', rootDepth: 1, bracketDepth: 2, open: 1 },
    // Straight after the root's `)`: Backspace edits inside the root, as it
    // always has; only a character moves the caret out first.
    { phase: 'closing', rootDepth: 1 },
  ];
  const field = { value: '\\sqrt{\\placeholder{}}', depth: 2 };
  for (const state of watched) {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Enter', 'Tab', 'Home', 'Escape']) {
      assert.deepEqual(typedRootKeyStep(state, { key }, field), { state: null, swallow: false, climbTo: null }, `${state.phase} ${key}`);
    }
    assert.deepEqual(typedRootKeyStep(state, { key: 'z', ctrlKey: true }, field), { state: null, swallow: false, climbTo: null });
    assert.deepEqual(typedRootKeyStep(state, { key: ')', isComposing: true }, field), { state: null, swallow: false, climbTo: null });
    assert.equal(typedRootKeyStep(state, { key: 'Shift' }, field).state, state);
  }
  // A character after the root's `)` goes after the root, and is read afresh.
  assert.deepEqual(typedRootKeyStep({ phase: 'closing', rootDepth: 2 }, { key: 's' }), {
    state: { phase: 'letters', text: 's' }, swallow: false, climbTo: 1,
  });
});

test('a keypad press: a character as if typed; x² after the root\'s ) squares the root', () => {
  const bracketed = { phase: 'bracketed', rootDepth: 1, bracketDepth: 2, open: 0 };
  assert.equal(typedRootCommandStep(bracketed, ')', { depth: 2 }).state.phase, 'closing');
  assert.equal(typedRootCommandStep(bracketed, '#@^{2}', { depth: 2 }).state.phase, 'bracketed', 'a template builds inside the bracket');
  assert.deepEqual(typedRootCommandStep({ phase: 'closing', rootDepth: 1 }, '#@^{2}'), { state: null, swallow: false, climbTo: 0 });
  assert.deepEqual(typedRootCommandStep({ phase: 'closing', rootDepth: 1 }, '+'), { state: null, swallow: false, climbTo: 0 });
  assert.deepEqual(typedRootCommandStep({ phase: 'opening', name: 'sqrt' }, '\\pi', { value: '\\sqrt{\\placeholder{}}', depth: 1 }), { state: null, swallow: false, climbTo: null });
});

test('climbing out of groups stops at the depth asked for, or where the caret stops moving', () => {
  // A caret at the end of nested groups: each moveAfterParent goes one out.
  const fieldAt = (depths, { stuck = false } = {}) => {
    let position = 0;
    const moves = [];
    return {
      moves,
      get position() { return position; },
      getElementInfo: (offset) => (depths[offset] === undefined ? undefined : { depth: depths[offset] }),
      executeCommand: (command) => { moves.push(command); if (!stuck) position += 1; },
    };
  };
  const deep = fieldAt([3, 2, 1, 0]);
  climbToDepth(deep, 0);
  assert.equal(deep.moves.length, 3);
  const once = fieldAt([3, 2, 1, 0]);
  climbToDepth(once, 2);
  assert.deepEqual(once.moves, ['moveAfterParent']);
  const already = fieldAt([2, 1]);
  climbToDepth(already, 2);
  assert.equal(already.moves.length, 0);
  const stuck = fieldAt([3, 2], { stuck: true });
  climbToDepth(stuck, 0);
  assert.equal(stuck.moves.length, 1, 'a caret that does not move is not pushed again');
  const unreadable = fieldAt([]);
  climbToDepth(unreadable, 0);
  assert.equal(unreadable.moves.length, 0);
});

test('what the grader receives: the walkthrough\'s spellings, as the box now holds them, are right answers', () => {
  // The radicals lesson item the walkthrough names (A2 L2 CW 4), compiled as
  // the teacher import compiles it, graded by the shared grader.
  const text = readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json', import.meta.url), 'utf8');
  const question = compileTeacherImport(text).questions.find((candidate) => candidate.questionId === 'a2r2-cw-4');
  const key = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  assert.equal(key.denominator, 'x^3√x');
  assert.equal(key.simplified, '(y^4√x)/x^4');
  const graded = (fieldId, value) => gradeMultiAnswerResponse(question, { ...key, [fieldId]: value }).parts.find((part) => part.id === fieldId).isCorrect;
  // What MathInput now holds (tests/browser/mathEntryContract.mjs pins these).
  assert.equal(graded('denominator', 'x^3\\sqrt{x}'), true, 'x^3 sqrt x');
  assert.equal(graded('denominator', 'x^3\\sqrt{\\left(x\\right)}'), true, 'x^3sqrt(x)');
  assert.equal(graded('simplified', '\\frac{y^4\\sqrt{\\left(x\\right)}}{x^4}'), true, 'y^4sqrt(x)/x^4');
  assert.equal(graded('simplified', '\\frac{\\left(y^4\\sqrt{\\left(x\\right)}\\right)}{\\left(x^4\\right)}'), true, '(y^4 sqrt(x))/(x^4)');
  // What it held before: a right answer graded wrong.
  assert.equal(graded('denominator', 'x^3\\sqrt{\\placeholder{}}x'), false);
  assert.equal(graded('simplified', 'y^4\\sqrt{\\frac{\\left(x\\right)}{x^4}}'), false);
  assert.equal(graded('simplified', '\\left(y^4\\right)\\sqrt{\\frac{\\left(x\\right))}{\\left(x^4\\right)}}'), false);
});
