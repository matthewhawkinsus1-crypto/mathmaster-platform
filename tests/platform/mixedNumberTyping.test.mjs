// GR33: "3 1/2" typed into a math field is 3½, not 31/2.
//
// MathLive drops a typed space, so the 1 joined the 3 and the slash took 31 as
// its numerator: a student who wrote a right mixed number lost a try. The rule
// (src/platform/math/typedFractionEntry.js) is pinned here as behaviour; the
// real MathLive is driven through the real MathInput by
// tests/browser/mathEntryContract.mjs (3 1/2 → 3\frac12; 12 345 and 3 x as before).

import test from 'node:test';
import assert from 'node:assert/strict';

import { mixedNumberKeyStep, mixedNumberSpaceStep } from '../../src/platform/math/typedFractionEntry.js';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { componentSource } from './helpers/sourceContract.mjs';

const typeAfterSpace = (latexBefore, keys) => {
  let state = mixedNumberSpaceStep(latexBefore);
  for (const key of keys) {
    const step = mixedNumberKeyStep(state, { key });
    if (step.numerator) return step.numerator;
    state = step.state;
  }
  return null;
};

test('a space after a whole number, then digits and a slash, makes those digits a numerator', () => {
  assert.equal(typeAfterSpace('3', ['1', '/']), '1');
  assert.equal(typeAfterSpace('y=2', ['3', '/']), '3');
  assert.equal(typeAfterSpace('-12', ['3', '4', '/']), '34');
  assert.equal(typeAfterSpace('\\left(3', ['1', '/']), '1');
  assert.equal(typeAfterSpace('3', ['1', '÷']), '1');
  // Shift (to type a symbol) does not end the watch.
  assert.equal(typeAfterSpace('3', ['Shift', '1', '/']), '1');
});

test('anything else after the space forgets it, so the field behaves as before', () => {
  for (const keys of [['x'], ['+'], ['1', 'x'], ['1', 'Backspace', '/'], ['/'], ['1', '2', ' ']]) {
    assert.equal(typeAfterSpace('3', keys), null, keys.join(''));
  }
  // A modifier (a shortcut) or a composing key ends it too.
  assert.equal(mixedNumberKeyStep({ digits: '1' }, { key: '/', ctrlKey: true }).numerator, null);
  assert.equal(mixedNumberKeyStep({ digits: '1' }, { key: '/', isComposing: true }).numerator, null);
});

test('only a whole number starts the watch: not a decimal, a power, a letter or a fraction', () => {
  for (const before of ['3.5', 'x^2', 'x', 'a3', '\\frac{1}{2}', '\\frac{1}{2}3', '', '3.', 'x_1']) {
    assert.equal(mixedNumberSpaceStep(before), null, JSON.stringify(before));
  }
  for (const before of ['3', '12', 'y=3', '2x+3', '-3', '\\left(3', '3,4']) {
    assert.notEqual(mixedNumberSpaceStep(before), null, JSON.stringify(before));
  }
});

test('what the field then holds is graded as the mixed number', () => {
  assert.equal(matchesFieldAnswer('3\\frac12', { answer: '7/2' }), true);
  assert.equal(matchesFieldAnswer('3\\frac{1}{2}', { answer: '3.5' }), true);
  assert.equal(matchesFieldAnswer('\\frac{31}{2}', { answer: '7/2' }), false, 'what it used to build');
});

test('the math field runs the rule before MathLive inserts the slash, and forgets it on any reset', () => {
  const input = componentSource('src/MathInput.jsx');
  assert.match(input, /mixedNumberRef\.current = mathField\.position === before\s*\? mixedNumberSpaceStep\(mathField\.getValue\?\.\(0, mathField\.position, 'latex'\)\)\s*: null;/);
  assert.match(input, /for \(let typed = 0; typed < mixed\.numerator\.length; typed \+= 1\) mathField\.executeCommand\('deleteBackward'\);\s*mathField\.insert\(`\\\\frac\{\$\{mixed\.numerator\}\}\{#\?\}`, \{ selectionMode: 'placeholder' \}\);/);
  assert.match(input, /typedFractionRef\.current = TYPED_FRACTION_OPENING;/, 'the slash rules then watch its denominator');
  assert.ok((input.match(/mixedNumberRef\.current = null;/g) || []).length >= 4, 'a click, a keypad press and a reset forget it');
});
