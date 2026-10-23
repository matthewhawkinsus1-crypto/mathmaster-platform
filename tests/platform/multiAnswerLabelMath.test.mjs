/*
 * A RESPONSE FIELD'S LABEL SETS ITS MATHEMATICS.
 *
 * Question Families write field labels with $…$ mathematics in them —
 * "$x$-intercept" (functions.identifyIntercepts), "Slope $m$ =" (linear.
 * slopeFromPoints), "Smaller solution: $x$ =", "$(x, y)$ =". Every other
 * renderer of a field label sets that through MathText; MultiAnswerGrader, the
 * one an assignment uses, drew a label with a word in it as plain text, so the
 * student read the dollar signs. And Pre-Flight warned "raw LaTeX" on every
 * such family question, a warning no teacher could act on.
 *
 * Pinned at the boundary the student meets: the rendered field, its name for
 * a screen reader, and the Pre-Flight verdict on the family's own question.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { labelHasDelimitedMath } from '../../src/labelFormat.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';

let vite = null;
let MultiAnswerGrader = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  MultiAnswerGrader = (await vite.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
});
after(async () => { await vite?.close(); });

const render = (answerFields) => renderToStaticMarkup(React.createElement(MultiAnswerGrader, {
  question: { type: 'multiAnswer', prompt: 'Find the intercepts of $2x + 3y = 6$.', answerFields },
  onStateChange: () => {},
  onUndoStateChange: () => {},
  feedback: null,
  draftKey: null,
}));
const labelsOf = (html) => [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map((match) => match[1]);
const visibleText = (html) => html.replace(/<span class="mm-math-spoken"[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');

test('a label with $…$ mathematics in it is words and typeset mathematics, never dollar signs', () => {
  const html = render([
    { id: 'xi', label: '$x$-intercept', answer: '(3, 0)', answerFormat: 'orderedPair' },
    { id: 'm', label: 'Slope $m$ =', answer: '2' },
    { id: 'pair', label: '$(x, y)$ =', answer: '(1, 2)', answerFormat: 'orderedPair' },
  ]);
  const [intercept, slope, pair] = labelsOf(html);
  assert.match(intercept, /<math-span[^>]*>x<\/math-span>/, intercept);
  assert.equal(visibleText(intercept), 'x-intercept');
  assert.match(slope, /^<span>Slope <math-span[^>]*>m<\/math-span>/, slope);
  assert.equal(visibleText(slope), 'Slope m =');
  assert.match(pair, /<math-span[^>]*>\(x, y\)<\/math-span>/, pair);
  assert.ok(!labelsOf(html).some((label) => visibleText(label).includes('$')), 'no label shows a dollar sign');
  // The field's name for a screen reader is the label as characters.
  assert.ok(html.includes('aria-label="x-intercept"'), html);
  assert.ok(html.includes('aria-label="Slope m ="'), html);
  assert.ok(!/aria-label="[^"]*\$/.test(html), 'no accessible name carries a dollar sign');
});

test('a label of words and prices, or of words alone, is still plain text', () => {
  const html = render([
    { id: 'p', label: 'Price ($) and total ($)', answer: '4' },
    { id: 'c', label: 'Discrete or continuous?', answer: 'Discrete', options: ['Discrete', 'Continuous'] },
  ]);
  assert.deepEqual(labelsOf(html), ['Price ($) and total ($)', 'Discrete or continuous?']);
  assert.equal(labelHasDelimitedMath('Price ($) and total ($)'), false, 'two prices do not pair into a math span');
  assert.equal(labelHasDelimitedMath('Earned $15 and spent $4'), false);
  assert.equal(labelHasDelimitedMath('x-intercept'), false);
  assert.equal(labelHasDelimitedMath('$\\frac{1}{2}$ of the cost'), true);
});

test("Pre-Flight reads a family's $x$-intercept label as the mathematics it renders as, and still catches raw LaTeX", () => {
  const { question } = resolveFamilyPreviewInstance({
    questionId: 'intercepts', type: 'multiAnswer', prompt: 'Find the intercepts of {{equation}}.',
    questionFamily: { id: 'functions.identifyIntercepts', version: 1 },
  });
  assert.equal(question.answerFields[0].label, '$x$-intercept', 'the shipped family version is unchanged');
  const verdict = validateQuestionSemantics(question, { label: 'Question 1' });
  assert.deepEqual(verdict.warnings.filter((warning) => /raw LaTeX/.test(warning)), []);

  const raw = validateQuestionSemantics({
    type: 'multiAnswer', prompt: 'Simplify.', answerFields: [{ id: 'a', label: '\\frac{1}{2} of the total', answer: '3' }],
  }, { label: 'Question 2' });
  assert.ok(raw.warnings.some((warning) => /raw LaTeX/.test(warning)), 'LaTeX outside $…$ in a label still warns');
});
