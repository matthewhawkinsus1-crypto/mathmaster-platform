/*
 * A KEY TYPED "cbrt(9y)" OR "root(7)(a)" IS DRAWN AND READ AS A RADICAL
 * (display and reading polish, item 2).
 *
 * The radicals lessons key their boxes the way the grader reads them, and 27
 * keys write a root as text: "cbrt(9y)", "root(7)(a)", "2cbrt(9y)/(3y)". Every
 * surface that shows a key draws it through MathText (the closed review's
 * answer list, its "Correct:" rows, My Math Path's recap, a Test's results),
 * and MathText showed them as typed; inside a slash fraction it drew a wrong
 * one, "2cbrt" beside 9y over 3y. Read aloud said "2 cbrt 9y" and "root 7
 * times a". Now:
 *   - MathText draws each as the radical it is, \sqrt[n]{…}, set by MathDisplay
 *     in LaTeX, never through MathLive's ASCIIMath reader (which reads
 *     "[3, ∞)" as "3, ∞)"), and a fraction with one in it stacks whole;
 *   - Read aloud says it as a root ("2 times the cube root of 9y"), by the
 *     rules that read ∛ and ⁷√;
 *   - no key, stored question or grade changes: only the drawing and the
 *     reading of the text do.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { normalizePlainMathTypography, splitProseFractionRuns } from '../../src/components/common/mathSegments.js';
import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { mathSpeechLabel } from '../../src/platform/language/mathSpeechLabel.js';

const repo = new URL('../../', import.meta.url);
const TYPED = /(?<!\\)(?:cbrt|(?<![A-Za-z]{2})root\(\s*(?:\d+|[A-Za-z])\s*\))\s*\(/;

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const lessonFiles = (dir = new URL('teacher-import-jsons/', repo).pathname) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? lessonFiles(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : []));
// Every key of every lesson written with a typed root, as a student is shown
// it (a Path item as dealt).
const typedKeys = () => lessonFiles().flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).sections
  .flatMap((section) => section.questions || [])
  .flatMap((question) => {
    const shown = hasPathGenerator(question) ? generatePathInstanceWithRetries(question, 'answer-keys-0').question : question;
    return (shown?.responses || []).map((field) => ({ where: `${path.basename(file)} ${question.questionId} ${field.id}`, key: String(field.answer ?? '') }))
      .filter(({ key }) => TYPED.test(key));
  }));

// What MathText draws: prose with its powers set, and typeset pieces.
const drawn = (text) => splitProseFractionRuns(text).map((run) => (run.isFraction ? { math: run.text } : { text: normalizePlainMathTypography(run.text) }));
const proseOf = (text) => drawn(text).filter((part) => part.text !== undefined).map((part) => part.text).join('');
const piecesOf = (text) => drawn(text).filter((part) => part.math).map((part) => part.math);
// What MathDisplay would give MathLive for a piece: the format it resolves to.
const formatOf = (piece) => resolveMathDisplayFormat(stackDivisions(piece, { unicodeMath: true }), 'auto');

test('every typed root among the lessons\' keys is drawn as a radical, in LaTeX', () => {
  const keys = typedKeys();
  assert.ok(keys.length >= 25, `the radicals lessons' typed roots (${keys.length})`);
  for (const { where, key } of keys) {
    assert.doesNotMatch(proseOf(key), /cbrt|root/, `${where}: no typed root is left as text (${key})`);
    const pieces = piecesOf(key);
    const roots = (key.match(new RegExp(TYPED.source, 'g')) || []).length;
    assert.equal(pieces.join(' ').split('\\sqrt[').length - 1, roots, `${where}: each root is a radical (${key} → ${pieces.join(' | ')})`);
    pieces.forEach((piece) => assert.equal(formatOf(piece), 'latex', `${where}: ${piece} is set in LaTeX, never read as ASCIIMath`));
    // A key with a slash stacks whole, its root in the numerator.
    if (key.includes('/')) assert.match(pieces.join(' '), /^\\frac\{[^}]*\\sqrt\[\d+\]\{/, `${where}: ${key} stacks with its root on top`);
  }
});

test('the drawings, one by one', () => {
  assert.deepEqual(drawn('2cbrt(9y)/(3y)'), [{ math: '\\frac{2\\sqrt[3]{9y}}{3y}' }], 'was "2cbrt" beside 9y over 3y');
  assert.deepEqual(drawn('root(7)(a)'), [{ math: '\\sqrt[7]{a}' }]);
  assert.deepEqual(drawn('cbrt(2x^2)'), [{ math: '\\sqrt[3]{2x²}' }], 'the radicand\'s power is set as a key\'s is');
  assert.deepEqual(drawn('5m^10p^6cbrt(p^2)'), [{ text: '5m¹⁰p⁶' }, { math: '\\sqrt[3]{p²}' }]);
  assert.deepEqual(drawn('x root(12)(x)'), [{ text: 'x ' }, { math: '\\sqrt[12]{x}' }]);
  assert.deepEqual(drawn('cbrt(1/8)'), [{ math: '\\sqrt[3]{\\frac{1}{8}}' }], 'a fraction in the radicand stays inside it');
  assert.deepEqual(drawn('root(4)(root(3)(x))'), [{ math: '\\sqrt[4]{\\sqrt[3]{x}}' }]);
  assert.deepEqual(drawn('Find cbrt(8) and root(4)(16) now.'), [{ text: 'Find ' }, { math: '\\sqrt[3]{8}' }, { text: ' and ' }, { math: '\\sqrt[4]{16}' }, { text: ' now.' }]);
  // An author's own √ keeps its spelling beside a typed root.
  assert.deepEqual(drawn('√(5x)/5 and cbrt(2)/2'), [{ math: '\\frac{√(5x)}{5}' }, { text: ' and ' }, { math: '\\frac{\\sqrt[3]{2}}{2}' }]);
  // A letter before one is a factor; a word ending in "root" is not a root.
  assert.deepEqual(drawn('2xcbrt(3)'), [{ text: '2x' }, { math: '\\sqrt[3]{3}' }]);
  // Not roots: a word, a root with no radicand, an interval.
  for (const text of ['cuberoot(3)(x)', 'cuberoot(8)', 'the root(s)', 'root(x)', '[3, ∞)', 'Square roots (√) and cube roots']) {
    assert.deepEqual(drawn(text), [{ text: normalizePlainMathTypography(text) }], text);
  }
});

test('read aloud says each typed root as a root', () => {
  const keys = typedKeys();
  for (const { where, key } of keys) {
    const spoken = speechTextFor(key);
    assert.doesNotMatch(spoken, /cbrt|root \d|root\(/, `${where}: "${spoken}"`);
    assert.equal((spoken.match(/\broot of\b/g) || []).length, (key.match(new RegExp(TYPED.source, 'g')) || []).length, `${where}: "${spoken}"`);
  }
  assert.equal(speechTextFor('2cbrt(9y)/(3y)'), '2 times the cube root of 9y over the quantity 3y');
  assert.equal(speechTextFor('root(7)(a)'), 'the 7th root of a');
  assert.equal(speechTextFor('cbrt(2x^2)'), 'the cube root of 2x squared');
  assert.equal(speechTextFor('x root(12)(x)'), 'x times the 12th root of x');
  assert.equal(speechTextFor('-2a^2b root(5)(2a)'), 'negative 2a squared b times the 5th root of 2a');
  assert.equal(speechTextFor('Simplify root(4)(16)'), 'Simplify the 4th root of 16', 'a word before it is not a factor');
  assert.equal(speechTextFor('cuberoot(8)'), 'cuberoot 8', 'nor the tail of a word');
  assert.doesNotMatch(speechTextFor('cuberoot(3)(x)'), /root of/);
  assert.equal(speechTextFor('2xcbrt(3)'), '2x times the cube root of 3', 'a letter before it is a factor');
  // Spanish says it in the words it already uses for ∛ and ⁷√.
  assert.equal(speechTextFor('2cbrt(9y)/(3y)', { language: 'es' }), speechTextFor('2∛(9y)/(3y)', { language: 'es' }));
  assert.equal(speechTextFor('root(7)(a)', { language: 'es' }), speechTextFor('⁷√a', { language: 'es' }));
  // The typeset piece's own spoken copy (a screen reader's) says the root too.
  assert.match(mathSpeechLabel({ value: piecesOf('root(7)(a)')[0] }), /^the 7th root of a$/);
});

const radicalItem = (file, id) => {
  const text = fs.readFileSync(new URL(`teacher-import-jsons/${file}`, repo), 'utf8');
  const question = compileTeacherImport(text).questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} compiles`);
  return question;
};

test('a closed review draws the key as a radical, in its answer list and in its "Correct:" rows, and reads it as one', async () => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  const question = radicalItem('algebra2-polynomials-radicals/3_Radical_Expressions.json', 'rx-p-4');
  const field = question.answerFields.find((candidate) => candidate.id === 'second');
  assert.equal(field.answer, '2cbrt(9y)/(3y)', 'the key is as authored');
  const visible = (html) => html.replace(/<span class="mm-math-spoken"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ');
  // After a right answer: the answer list.
  const list = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, wasCorrect: true }));
  assert.match(list, /data-answer-details/);
  assert.ok(list.includes('\\frac{2\\sqrt[3]{9y}}{3y}'), 'the list typesets the radical over 3y');
  assert.doesNotMatch(visible(list.slice(list.indexOf('data-answer-details'))), /cbrt/, 'and shows no "cbrt"');
  // After a miss: each part, with its "Correct:" answer.
  const parts = question.answerFields.map((entry) => ({ key: entry.id, response: '1', isCorrect: false }));
  const rows = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, wasCorrect: false, yourParts: parts }));
  const part = rows.slice(rows.indexOf('data-part-review'));
  assert.ok(part.includes('\\frac{2\\sqrt[3]{9y}}{3y}'), 'the "Correct:" row typesets it');
  assert.doesNotMatch(visible(part), /cbrt/);
  // Read aloud, both ways.
  const { legacySolutionReviewContent } = await vite.ssrLoadModule('/src/SolutionReview.jsx');
  const { buildClosedQuestionReview, buildPartReviewRows, partReviewSpeech } = await vite.ssrLoadModule('/src/platform/supports/review/closedQuestionReview.js');
  const review = buildClosedQuestionReview({ question, wasCorrect: true, legacyContent: legacySolutionReviewContent });
  assert.match(speechTextFor(review.speechText), /2 times the cube root of 9y over the quantity 3y/);
  assert.match(speechTextFor(partReviewSpeech(buildPartReviewRows({ question, parts }))), /The answer is 2 times the cube root of 9y over the quantity 3y\./);
});
