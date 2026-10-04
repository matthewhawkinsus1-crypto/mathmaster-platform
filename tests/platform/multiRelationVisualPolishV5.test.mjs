import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  relationExpressionToLatex,
} from '../../src/algebraRelationFoundation.js';
import { multiRelationSource } from './helpers/solverSource.mjs';

test('grouped polynomial divided by a number renders as a real fraction', () => {
  const latex = relationExpressionToLatex('(2*x^2 - 12*x) / 2');

  assert.match(latex, /^\\frac\{/);
  assert.match(latex, /\}\{2\}$/);
  assert.doesNotMatch(latex, /\)2\}/);
});

test('subtracted constant divided by a number renders as a real fraction', () => {
  const latex = relationExpressionToLatex('(0 - 7) / 2');

  assert.match(latex, /^\\frac\{/);
  assert.match(latex, /\}\{2\}$/);
});

test('Other operations is an inline rail rather than an overlay popup', () => {
  const src = multiRelationSource();

  assert.match(src, /algebra-other-operations-inline/);
  assert.match(src, /Algebra tools/);
  assert.match(src, /OTHER_ALGEBRA_OPERATIONS\.map/);
  assert.match(src, /These choices stay available from the beginning/);
  assert.doesNotMatch(src, /position: 'absolute'[\s\S]{0,500}algebra-other-operations-menu/);
});

test('Other operation buttons inherit the matched semantic theme colors', () => {
  const src = multiRelationSource();

  assert.match(src, /background: 'var\(--mm-surface\)'/);
  // The primary TEXT token: #174ea6 in light, a readable light blue in dark.
  assert.match(src, /color: 'var\(--mm-primary-text\)'/);
  assert.doesNotMatch(src, /colorScheme: 'light'/);
});

test('division completion messaging preserves student-controlled simplification', () => {
  const src = multiRelationSource();

  assert.match(src, /The quotient is intentionally unsimplified/);
  assert.match(src, /use Rewrite \/ Simplify when you want to reduce it/);
});
