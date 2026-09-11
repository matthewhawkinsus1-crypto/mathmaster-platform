import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { sameIntervalNotation } from '../../functions/shared/answerEquivalence.mjs';
import { notationMatches, parseIntervalNotation } from '../../src/tools/intervalNumberLine/intervalMath.js';

const expectedText = '(-∞,-3)∪(3,∞)';
const expectedShape = [
  { min: -Infinity, max: -3, minClosed: false, maxClosed: false },
  { min: 3, max: Infinity, minClosed: false, maxClosed: false },
];

test('the live absolute-value interval survives every visible MathLive serialization', () => {
  const variants = [
    expectedText,
    '(-\\infty,-3)\\cup(3,\\infty)',
    '\\left(-\\infty,-3\\right)\\cup\\left(3,\\infty\\right)',
    '\\lparen-\\infty,-3\\rparen\\cup\\lparen3,\\infty\\rparen',
    '\\mathopen\\lparen-\\infty,-3\\mathclose\\rparen\\cup\\mathopen\\lparen3,\\infty\\mathclose\\rparen',
    '\\Bigl(-\\infty{,}-3\\Bigr)\\cup\\biggl(3{,}\\infty\\biggr)',
    '(\u200b-∞,\u2060-3)∪(3,\ufeff∞)',
  ];
  for (const variant of variants) {
    assert.equal(sameIntervalNotation(variant, expectedText), true, variant);
    assert.equal(notationMatches(variant, expectedShape), true, variant);
    assert.deepEqual(parseIntervalNotation(variant), expectedShape, variant);
  }
});

test('interval normalization preserves endpoint and union semantics', () => {
  for (const mutation of [
    '(-∞,-3]∪(3,∞)',
    '(-∞,-3)∪[3,∞)',
    '(-∞,-4)∪(3,∞)',
    '(-∞,-3)',
  ]) assert.equal(sameIntervalNotation(mutation, expectedText), false, mutation);
});

test('interval input alone disables smartFence and transformed source points are references', async () => {
  const mathInput = await readFile(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');
  assert.match(mathInput, /mathField\.smartFence\s*=\s*toolProfile\s*!==\s*['"]interval['"]/);

  const transformations = await readFile(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8');
  assert.match(transformations, /label:\s*`S\$\{index \+ 1\}`[^\n]+movable:\s*false/);
});
