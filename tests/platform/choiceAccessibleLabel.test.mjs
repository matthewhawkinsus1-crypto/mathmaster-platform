import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { choiceAccessibleLabel, choiceFieldAsksDimensions } from '../../src/platform/interaction/choiceOptions.js';

// Oct 2026 matrices walkthrough (WU 1): the choice "$20 grocery cards" was
// announced "20 grocery cards" — twenty cards, not the $20 card. The name
// dropped a dollar sign it took for a LaTeX delimiter that never closed.
test('a choice that starts with a price keeps its dollar sign', () => {
  assert.equal(choiceAccessibleLabel('$20 grocery cards'), '$20 grocery cards');
  assert.equal(choiceAccessibleLabel('$4.50 each'), '$4.50 each');
  assert.equal(choiceAccessibleLabel('$25'), '$25');
});

test('a choice wrapped in math delimiters is named by the mathematics inside', () => {
  assert.equal(choiceAccessibleLabel('$\\frac{1}{2}$'), '\\frac{1}{2}');
  assert.equal(choiceAccessibleLabel('$$x = 3$$'), 'x = 3');
  assert.equal(choiceAccessibleLabel('\\(y \\le 4\\)'), 'y \\le 4');
  assert.equal(choiceAccessibleLabel('  3 × 4 '), '3 × 4');
});

test('the multi-answer choices take their names from it', () => {
  const source = readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label=\{choiceAccessibleLabel\(raw, \{ dimensions \}\)\}/);
  assert.doesNotMatch(source, /const choiceLabel = /);
});

// AX30: "2 × 3" as a matrix's dimensions was "2 times 3" to a screen reader,
// while Read aloud said "2 by 3". In a field about dimensions it is now named
// "2 by 3"; anywhere else it is still a product.
test('a dimensions choice is named "rows by columns"; a product keeps its reading', () => {
  assert.equal(choiceAccessibleLabel('2 × 3', { dimensions: true }), '2 by 3');
  assert.equal(choiceAccessibleLabel('$2 \\times 3$', { dimensions: true }), '2 by 3');
  assert.equal(choiceAccessibleLabel('3x2', { dimensions: true }), '3 by 2');
  assert.equal(choiceAccessibleLabel('2 × 3'), '2 × 3', 'not about dimensions: a product');
  assert.equal(choiceAccessibleLabel('2 × 3 = 6', { dimensions: true }), '2 × 3 = 6', 'only a bare size');
  assert.equal(choiceFieldAsksDimensions('Dimensions of A'), true);
  assert.equal(choiceFieldAsksDimensions('Answer', 'What size is matrix B?'), true);
  assert.equal(choiceFieldAsksDimensions('Product', 'What is 2 × 3?'), false);
});

let vite;
after(async () => { await vite?.close(); });

test('rendered, a dimensions question names its choices "2 by 3" and says so to a screen reader', async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const MultiAnswerGrader = (await vite.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
  const render = (prompt, label) => renderToStaticMarkup(React.createElement(MultiAnswerGrader, {
    question: {
      type: 'multiAnswer', questionId: 'ax30', prompt,
      answerFields: [{ id: 'size', label, answer: '2 × 3', options: ['2 × 3', '3 × 2'] }],
    },
    onStateChange: () => {},
  }));
  const dims = render('What are the dimensions of matrix A?', 'Dimensions');
  assert.match(dims, /aria-label="2 by 3"/);
  assert.match(dims, /aria-label="3 by 2"/);
  const product = render('Which product equals 6?', 'Product');
  assert.doesNotMatch(product, / by /);
});
