/*
 * A LITERAL-EQUATION QUESTION THAT NAMES NO VARIABLE NEVER SAYS "UNDEFINED".
 *
 * authoringIntentV5Core compiles a solveLiteral action into a literal question
 * even when the intent gives no solveFor. Its graded part was labelled
 * "Expression for undefined", so a miss read "Focus on: Expression for
 * undefined." (found by the p3-ci batch), and the screen's prompt, placeholder
 * and box name said "undefined" too.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gradeLiteralResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { focusOnText } from '../../src/platform/student/submitCost.js';

let vite;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

test('the graded part names the variable when there is one, and says "Your answer" when there is not', () => {
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['A/b'], solveFor: 'h' }, 'A/b').parts[0].label, 'Expression for h');
  for (const solveFor of [undefined, null, '', '  ']) {
    const graded = gradeLiteralResponse({ acceptedAnswers: ['A/b'], solveFor }, 'A/h');
    assert.equal(graded.parts[0].label, 'Your answer', String(solveFor));
    assert.equal(graded.isCorrect, false);
    assert.equal(focusOnText([graded.parts[0].label]), 'Focus on: Your answer.');
  }
});

test('the screen says nothing about "undefined" when the question names no variable', async () => {
  const LiteralGrader = (await vite.ssrLoadModule('/src/LiteralGrader.jsx')).default;
  const render = (question) => renderToStaticMarkup(React.createElement(LiteralGrader, {
    question: { type: 'literal', formula: 'A = bh', acceptedAnswers: ['A/b'], ...question },
    onStateChange: () => {},
  }));
  const named = render({ solveFor: 'h' });
  assert.match(named, /aria-label="h ="/);
  assert.match(named, /h equals/);
  assert.doesNotMatch(named, /undefined/);
  const unnamed = render({});
  assert.doesNotMatch(unnamed, /undefined/);
  assert.match(unnamed, /aria-label="Your answer"/);
  assert.match(unnamed, /rearrange it as the question asks/);
  assert.doesNotMatch(unnamed, / equals</, 'no "… =" label in front of the box');
  // The box's placeholder is set after mount (MathInput), so it is read from the source.
  const source = readFileSync(new URL('../../src/LiteralGrader.jsx', import.meta.url), 'utf8');
  assert.match(source, /placeholder=\{variable \? `type expression for \$\{variable\}` : 'type your answer'\}/);
});
