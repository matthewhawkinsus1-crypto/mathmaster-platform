// WHAT A TYPED SLASH MEANS (PQ-040).
//
// Characters typed into a math field must build the expression the same
// characters mean as written text — the reading every grader already applies.
// These drive the pure state machine the way MathInput and the calculator do:
// a keydown, then (for keys the field inserts) the field's new value.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlainNumberDenominator,
  typedFractionCommandStep,
  typedFractionKeyStep,
  typedFractionValueStep,
} from '../../src/platform/math/typedFractionEntry.js';

// A stand-in for MathLive that is just good enough to say WHERE each key lands:
// it tracks the latex of the expression and whether the caret is in the
// denominator of the last typed fraction. It models exactly the MathLive 0.110
// behaviours measured in a browser (see the PR notes): `/` with something before
// it opens \frac{<previous number or symbol>}{■} with the caret in ■; `/` with
// nothing before it opens \frac{■}{■} with the caret in the numerator.
const simulate = (keys) => {
  let state = null;
  let before = '';
  let numerator = '';
  let denominator = null; // null: not inside a typed fraction
  let after = '';
  const latex = () => (denominator === null
    ? `${before}${after}`
    : `${before}\\frac{${numerator || '\\placeholder{}'}}{${denominator || '\\placeholder{}'}}${after}`);
  for (const key of keys) {
    const step = typedFractionKeyStep(state, { key });
    state = step.state;
    if (step.leaveFraction && denominator !== null) {
      before = `${before}\\frac{${numerator}}{${denominator}}`;
      numerator = '';
      denominator = null;
    }
    if (key === '/') {
      if (denominator === null) {
        const match = /(-?)(\\frac\{[^{}]*\}\{[^{}]*\}|[0-9.]+|[A-Za-z])$/.exec(before);
        const taken = match ? match[2] : '';
        before = taken ? before.slice(0, before.length - taken.length) : before;
        numerator = taken;
        denominator = '';
        if (!taken) {
          // Nothing to take: both boxes empty, caret in the numerator. Model it
          // as "not in a denominator" and keep typing into the numerator.
          state = typedFractionValueStep(state, `${before}\\frac{\\placeholder{}}{\\placeholder{}}`);
          denominator = null;
          before = `${before}\\frac{`;
          after = '}{}';
          continue;
        }
      } else {
        denominator += '/';
      }
      state = typedFractionValueStep(state, latex());
      continue;
    }
    if (denominator !== null) denominator += key;
    else if (after) before += key;
    else before += key;
  }
  return latex();
};

test('a fraction opened by typing closes when a term follows a numeric denominator', () => {
  assert.equal(simulate([...'y=-2/3x+4']), 'y=-\\frac{2}{3}x+4');
  assert.equal(simulate([...'3/4x+2']), '\\frac{3}{4}x+2');
  assert.equal(simulate([...'6/3+1']), '\\frac{6}{3}+1');
  assert.equal(simulate([...'12/0.5x']), '\\frac{12}{0.5}x');
});

test('a denominator the student is building on purpose is left alone', () => {
  // Starts with a letter: 1/(x − 2).
  assert.equal(simulate([...'1/x-2']), '\\frac{1}{x-2}');
  // A sign before the digits is a negative denominator, then the term follows.
  assert.equal(simulate([...'1/-2x']), '\\frac{1}{-2}x');
  // A bracket right after the slash groups on purpose.
  assert.equal(typedFractionKeyStep({ phase: 'denominator', text: '' }, { key: '(' }).leaveFraction, false);
});

test('a comma or a closing bracket ends the denominator of a coordinate', () => {
  const step = typedFractionKeyStep({ phase: 'denominator', text: '2' }, { key: ',' });
  assert.deepEqual(step, { state: null, leaveFraction: true });
  assert.equal(typedFractionKeyStep({ phase: 'denominator', text: '2' }, { key: ')' }).leaveFraction, true);
});

test('a second slash never leaves the fraction: MathLive cannot take a fraction as a numerator', () => {
  // Measured: leaving first turned 2/3/4 into 2/3 beside an EMPTY fraction.
  // Staying builds the whole (if nested) expression 2/(3/4), and the new
  // denominator is watched as usual.
  const step = typedFractionKeyStep({ phase: 'denominator', text: '3' }, { key: '/' });
  assert.equal(step.leaveFraction, false);
  assert.deepEqual(step.state, { phase: 'opening' });
});

test('the keydown after a slash reads what the slash built (MathLive batches its input events)', () => {
  const afterDigit = typedFractionKeyStep({ phase: 'opening' }, { key: '3' }, 'y=-\\frac{2}{\\placeholder{}}');
  assert.deepEqual(afterDigit.state, { phase: 'denominator', text: '3' });
  const intoNumerator = typedFractionKeyStep({ phase: 'opening' }, { key: '3' }, '\\frac{\\placeholder{}}{\\placeholder{}}');
  assert.equal(intoNumerator.state, null);
});

test('a slash with nothing before it leaves the caret in the numerator, which is never watched', () => {
  const opened = typedFractionKeyStep(null, { key: '/' });
  assert.deepEqual(opened.state, { phase: 'opening' });
  assert.equal(typedFractionValueStep(opened.state, '\\frac{\\placeholder{}}{\\placeholder{}}'), null);
  assert.equal(typedFractionValueStep(opened.state, 'y=\\frac{\\placeholder{}}{\\placeholder{}}'), null);
  assert.deepEqual(typedFractionValueStep(opened.state, 'y=-\\frac{2}{\\placeholder{}}'), { phase: 'denominator', text: '' });
});

test('an exponent, an arrow, Backspace or a shortcut ends the watch — the old behaviour is the fallback', () => {
  const watching = { phase: 'denominator', text: '2' };
  for (const key of ['^', 'ArrowLeft', 'Backspace', 'Tab', 'Home', '(']) {
    assert.deepEqual(typedFractionKeyStep(watching, { key }), { state: null, leaveFraction: false }, key);
  }
  assert.deepEqual(typedFractionKeyStep(watching, { key: 'z', ctrlKey: true }), { state: null, leaveFraction: false });
  assert.deepEqual(typedFractionKeyStep(watching, { key: 'x', isComposing: true }), { state: null, leaveFraction: false });
});

test('Shift on its own does not forget the denominator', () => {
  const watching = { phase: 'denominator', text: '3' };
  assert.equal(typedFractionKeyStep(watching, { key: 'Shift' }).state, watching);
  assert.equal(typedFractionKeyStep(watching, { key: '+' }).leaveFraction, true);
});

test('only a plain number counts as a finished denominator', () => {
  for (const text of ['3', '12', '0.5', '.5', '-2', '7.']) assert.ok(isPlainNumberDenominator(text), text);
  for (const text of ['', '-', '.', 'x', '2x', '1.2.3']) assert.ok(!isPlainNumberDenominator(text), text);
});

test('a keypad press behaves like the key it stands for; a template ends the watch', () => {
  const watching = { phase: 'denominator', text: '3' };
  assert.equal(typedFractionCommandStep(watching, 'x').leaveFraction, true);
  assert.equal(typedFractionCommandStep(watching, '\\times').leaveFraction, true);
  assert.equal(typedFractionCommandStep(watching, '\\pi').leaveFraction, true);
  assert.deepEqual(typedFractionCommandStep(watching, '4').state, { phase: 'denominator', text: '34' });
  assert.deepEqual(typedFractionCommandStep(watching, '\\frac{#0}{#?}'), { state: null, leaveFraction: false });
  assert.deepEqual(typedFractionCommandStep(watching, '#@^{#?}'), { state: null, leaveFraction: false });
});
