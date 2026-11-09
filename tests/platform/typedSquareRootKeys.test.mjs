/*
 * A PATH KEY TYPED "3sqrt(3)" IS DRAWN AS A RADICAL (hint-ladder timing, item 2).
 *
 * The Path banks key a square root the way the grader reads it: "3sqrt(3)",
 * "sqrt(5x- 36)=3", "(-(4)-sqrt(5))/2", "7*x^2*sqrt(x)". Read aloud already
 * says each as a root, but every surface that shows a key draws it through
 * MathText (the closed review and its "Correct:" rows, My Math Path's recap, a
 * Test's results), and MathText showed "sqrt" as typed, as it did "cbrt" and
 * "root(n)" until the last pass (typedRadicalKeys.test.mjs). Now:
 *   - MathText draws each as \sqrt{…}, with no index, set by MathDisplay in
 *     LaTeX, and a slash fraction with one in it stacks whole;
 *   - no key, stored question, reading or grade changes: only the drawing
 *     (mathSegments.js draws; the text it is handed is the key as stored).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { normalizePlainMathTypography, splitProseFractionRuns } from '../../src/components/common/mathSegments.js';
import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { mathSpeechLabel } from '../../src/platform/language/mathSpeechLabel.js';

const repo = new URL('../../', import.meta.url);
const SQRT = /(?<![\\A-Za-z])sqrt\s*\(/;

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

// Every key of the Path banks written with a typed square root, as items are dealt.
const pathKeys = () => {
  const dir = new URL('functions/seeds/pathQuestionBank/', repo);
  const keys = [];
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const documents = JSON.parse(fs.readFileSync(new URL(name, dir), 'utf8')).documents || [];
    for (const template of documents) {
      if (!SQRT.test(JSON.stringify([template.responseFields, template.variants, template.inverseReflection]))) continue;
      for (let seed = 0; seed < 4; seed += 1) {
        const dealt = generatePathInstanceWithRetries(template, `typed-square-roots-${seed}`)?.question;
        const fields = dealt?.responseFields || [];
        fields.flatMap((field) => [field.expected, ...(field.accepted || [])].map((key) => ({ field, key })))
          .concat([{ field: { id: 'inverseReflection' }, key: dealt?.inverseReflection?.expectedEquation }])
          .filter(({ key }) => typeof key === 'string' && SQRT.test(key))
          .forEach(({ field, key }) => keys.push({ where: `${name} ${template.id} ${field.id}`, key }));
      }
    }
  }
  return keys;
};

// What MathText draws: prose with its powers set, and typeset pieces.
const drawn = (text) => splitProseFractionRuns(text).map((run) => (run.isFraction ? { math: run.text } : { text: normalizePlainMathTypography(run.text) }));
const proseOf = (text) => drawn(text).filter((part) => part.text !== undefined).map((part) => part.text).join('');
const piecesOf = (text) => drawn(text).filter((part) => part.math).map((part) => part.math);
const formatOf = (piece) => resolveMathDisplayFormat(stackDivisions(piece, { unicodeMath: true }), 'auto');

test('every typed square root among the Path banks\' keys is drawn as a radical, in LaTeX', () => {
  const keys = pathKeys();
  assert.ok(keys.length >= 60, `the banks' typed square roots, as dealt (${keys.length})`);
  for (const { where, key } of keys) {
    assert.doesNotMatch(proseOf(key), /sqrt/, `${where}: no "sqrt" is left as text (${key})`);
    const pieces = piecesOf(key);
    const roots = (key.match(new RegExp(SQRT.source, 'g')) || []).length;
    assert.equal(pieces.join(' ').split('\\sqrt{').length - 1, roots, `${where}: each root is a radical (${key} → ${pieces.join(' | ')})`);
    assert.doesNotMatch(pieces.join(' '), /\\sqrt\[2\]/, `${where}: a square root has no index`);
    pieces.forEach((piece) => assert.equal(formatOf(piece), 'latex', `${where}: ${piece} is set in LaTeX, never read as ASCIIMath`));
    if (key.includes('/')) assert.match(pieces.join(' '), /\\frac\{[^}]*\\sqrt\{/, `${where}: ${key} stacks with its root on top`);
  }
});

test('the drawings, one by one', () => {
  assert.deepEqual(drawn('3sqrt(3)'), [{ text: '3' }, { math: '\\sqrt{3}' }], 'was "3sqrt(3)"');
  assert.deepEqual(drawn('3*sqrt(2)'), [{ text: '3*' }, { math: '\\sqrt{2}' }]);
  assert.deepEqual(drawn('(-(4)-sqrt(5))/2'), [{ math: '\\frac{-(4)-\\sqrt{5}}{2}' }], 'was the whole key as typed');
  assert.deepEqual(drawn('3sqrt(5x- 34)=12'), [{ text: '3' }, { math: '\\sqrt{5x- 34}' }, { text: '=12' }]);
  assert.deepEqual(drawn('f^-1(x)=sqrt(x-(1))-1'), [{ text: 'f⁻¹(x)=' }, { math: '\\sqrt{x-(1)}' }, { text: '-1' }]);
  assert.deepEqual(drawn('7*x^2*sqrt(x)'), [{ text: '7*x²*' }, { math: '\\sqrt{x}' }]);
  assert.deepEqual(drawn('sqrt(x^2+9)'), [{ math: '\\sqrt{x²+9}' }], 'the radicand\'s power is set as a key\'s is');
  assert.deepEqual(drawn('sqrt(sqrt(x))'), [{ math: '\\sqrt{\\sqrt{x}}' }]);
  assert.deepEqual(drawn('sqrt(2)/2 and cbrt(2)/2'), [{ math: '\\frac{\\sqrt{2}}{2}' }, { text: ' and ' }, { math: '\\frac{\\sqrt[3]{2}}{2}' }]);
  // The cube and nth roots of the last pass are drawn as they were.
  assert.deepEqual(drawn('2cbrt(9y)/(3y)'), [{ math: '\\frac{2\\sqrt[3]{9y}}{3y}' }]);
  assert.deepEqual(drawn('root(7)(a)'), [{ math: '\\sqrt[7]{a}' }]);
  // Not typed roots: LaTeX's own command, a word, no bracket.
  for (const text of ['\\sqrt{3}', 'Take the sqrt of both sides.', 'sqrt', 'Square roots (√) and cube roots']) {
    assert.deepEqual(drawn(text), [{ text: normalizePlainMathTypography(text) }], text);
  }
});

test('Read aloud says them as it did: only the drawing changed', () => {
  assert.equal(speechTextFor('3sqrt(3)'), '3 times the square root of 3');
  assert.equal(speechTextFor('sqrt(5x- 36)=3'), 'the square root of the quantity 5x minus 36 equals 3');
  assert.equal(speechTextFor('7*x^2*sqrt(x)'), '7 times x squared times the square root of x');
  // The typeset piece's own spoken copy (a screen reader's) says the root too.
  assert.equal(mathSpeechLabel({ value: piecesOf('3sqrt(3)')[0] }), 'the square root of 3');
});

test('My Math Path\'s recap and a closed review draw the key as a radical', async () => {
  const { RecapValue } = await vite.ssrLoadModule('/src/components/student/MyMathPathSessionRecap.jsx');
  const recap = renderToStaticMarkup(React.createElement(RecapValue, { entry: { label: 'Answer', value: '4sqrt(3)', format: 'rich' } }));
  assert.ok(recap.includes('\\sqrt{3}'), recap);
  const visible = (html) => html.replace(/<span class="mm-math-spoken"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible(recap), /sqrt\(/, 'and shows no "sqrt("');
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  // Two solutions keyed as the bank's quadratic-formula items deal them.
  const question = {
    questionId: 'typed-square-root', type: 'multiAnswer', prompt: 'Solve x² + 8x + 11 = 0 with the quadratic formula.',
    answerFields: [
      { id: 'smaller', label: 'Smaller solution', answer: '(-(8)-sqrt(20))/2' },
      { id: 'larger', label: 'Larger solution', answer: '(-(8)+sqrt(20))/2' },
    ],
  };
  // After a right answer: the answer list.
  const list = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, wasCorrect: true }));
  const details = list.slice(list.indexOf('data-answer-details'));
  assert.notEqual(list.indexOf('data-answer-details'), -1);
  assert.ok(details.includes('\\frac{-(8)-\\sqrt{20}}{2}') && details.includes('\\frac{-(8)+\\sqrt{20}}{2}'), 'the list typesets both, stacked');
  assert.doesNotMatch(visible(details), /sqrt\(/);
  // After a miss: each part, with its "Correct:" answer.
  const parts = question.answerFields.map((field) => ({ key: field.id, response: '1', isCorrect: false }));
  const rows = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, wasCorrect: false, yourParts: parts }));
  assert.notEqual(rows.indexOf('data-part-review'), -1, 'the "Correct:" rows are there');
  const part = rows.slice(rows.indexOf('data-part-review'));
  assert.ok(part.includes('\\frac{-(8)-\\sqrt{20}}{2}'), 'the "Correct:" row typesets it, stacked');
  assert.doesNotMatch(visible(part), /sqrt\(/);
});
