import test from 'node:test';
import assert from 'node:assert/strict';
import { labelLooksLikeMath, resolveLabelFormat } from '../../src/labelFormat.js';

test('English labels stay plain text', () => {
  // Each of these was mangled by the math typesetter: spaces collapsed and
  // "or" was rendered as the logical-disjunction symbol.
  for (const label of [
    'Reasonable domain',
    'Discrete or continuous?',
    'Money collected',
    'Slope m',
    'Y-intercept b',
    'X-intercepts',
    'Increasing interval(s)',
  ]) {
    assert.equal(labelLooksLikeMath(label), false, `${label} must render as plain text`);
    assert.equal(resolveLabelFormat(label), null, `${label} must render as plain text`);
  }
});

test('purely mathematical labels are still typeset', () => {
  for (const label of ['x', 'y', 'f(x)', '2x + 1', 'g(-3)', 'x^2', 'sin(x)', 'log x', '(x, y)']) {
    assert.equal(labelLooksLikeMath(label), true, `${label} must render as math`);
    assert.equal(resolveLabelFormat(label), 'ascii-math');
  }
});

test('explicit author overrides win', () => {
  assert.equal(resolveLabelFormat('Reasonable domain', { latexFlag: true }), 'latex');
  assert.equal(resolveLabelFormat('Reasonable domain', { explicitFormat: 'ascii-math' }), 'ascii-math');
  // The legacy flag outranks the newer one, matching the order they are read in.
  assert.equal(resolveLabelFormat('x', { latexFlag: true, explicitFormat: 'ascii-math' }), 'latex');
});

test('empty and hostile labels do not throw', () => {
  for (const label of [null, undefined, '', '   ', 0, {}, []]) {
    assert.doesNotThrow(() => resolveLabelFormat(label));
  }
  assert.equal(resolveLabelFormat(''), null);
});
