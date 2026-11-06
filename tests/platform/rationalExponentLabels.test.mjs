/*
 * ALGEBRA II HONORS L3'S LABELS DRAW THEIR MATHEMATICS AS MATH (the
 * 2026-11-06 re-walk of the changed lessons: "L3 prose labels and choices show
 * '^(…)'", WU 3, CW 3, 5, 6, 7, 9, 10, PR 6, 7, 8 and 15).
 *
 * A label or a choice with words in it is drawn as text, so "x^(−2/3) in
 * simplest form" showed its caret. Each writes its mathematics as a $…$ span
 * now, drawn as math beside the words, as Question Family labels are. One
 * exception: PR 7's "Why?" options, because one of them is the key, and
 * rewriting it would change the key.
 *
 * A box's or a choice's name for a screen reader (toPlainMath) keeps an
 * exponent's grouping: "x^(-2/3) in simplest form", never "x^-2/3", which
 * reads as (x^-2)/3, or "(−16)³/2" for (−16)^(3/2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { toPlainMath } from '../../src/components/common/mathSegments.js';
import { compiled, versionsOf } from './helpers/lessonFileChecks.mjs';

const L3 = compiled(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-radicals/L3_Rational_Exponents.json', import.meta.url), 'utf8')).questions;
const questionIn = (questionId) => L3.find((question) => question.questionId === questionId);

/**
 * The text a student sees: the markup's words, without what is typeset (a
 * math-span holds LaTeX) or only spoken (Read aloud's words for a screen
 * reader, which the math speech work reads).
 */
const seenText = (markup) => markup
  .replace(/<math-span\b[\s\S]*?<\/math-span>/g, ' ')
  .replace(/<span class="mm-math-spoken"[^>]*>[\s\S]*?<\/span>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&quot;|&amp;|&lt;|&gt;/g, ' ');

test('no L3 label or choice shows a caret, as a student receives the lesson; only PR 7\'s "Why?" options, one of which is the key', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    const showing = [];
    let rendered = 0;
    for (const question of L3.filter((candidate) => candidate.type === 'multiAnswer')) {
      for (const version of versionsOf(question, 3)) {
        // One field at a time, so a caret is pinned to its own box.
        for (const field of version.answerFields) {
          rendered += 1;
          const markup = renderToStaticMarkup(React.createElement(MultiAnswerGrader, {
            question: { ...version, prompt: '', answerFields: [field] }, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null,
          }));
          const carets = seenText(markup).match(/[^\s]*\^[^\s]*/g);
          if (carets) showing.push(`${version.questionId} ${field.id}`);
        }
      }
    }
    assert.ok(rendered >= 150, `${rendered} boxes drawn`);
    assert.deepEqual([...new Set(showing)], ['a2r3-p-7 why']);
    // That one is the key's option, so it waits on the owner.
    const why = questionIn('a2r3-p-7').answerFields.find((field) => field.id === 'why');
    assert.match(why.answer, /\^\(/);
  } finally {
    await server.close();
  }
});

test('each L3 label and choice with a $…$ span is named with its exponents grouped, as its text was', () => {
  const named = [];
  for (const question of L3.filter((candidate) => candidate.type === 'multiAnswer')) {
    const [version] = versionsOf(question, 1);
    for (const field of version.answerFields) {
      for (const text of [field.label, ...(field.options || [])].map(String).filter((candidate) => candidate.includes('$'))) {
        const name = toPlainMath(text);
        named.push(name);
        assert.doesNotMatch(name, /\$|\\[A-Za-z]/, `"${text}" is named "${name}"`);
        // An exponent that is a fraction keeps its brackets: x^(-2/3), never x^-2/3 or x³/2.
        assert.doesNotMatch(name, /\^-?\d+\/|[²³]\//, `"${text}" is named "${name}"`);
      }
    }
  }
  assert.ok(named.length >= 15, `${named.length} names`);
  assert.ok(named.includes('x^(-2/3) in simplest form'), named.join(' | '));
  assert.ok(named.includes('146,230 ÷ 168^(8/5) ≈ (nearest tenth)'), named.join(' | '));
  assert.ok(named.includes('(-16)^(3/2) is…'), named.join(' | '));
});

test('toPlainMath groups an exponent that is more than one number or letter, and keeps the rest as it was', () => {
  assert.equal(toPlainMath('$x^{-2/3}$ in simplest form'), 'x^(-2/3) in simplest form');
  assert.equal(toPlainMath('$(-16)^{3/2}$ is…'), '(-16)^(3/2) is…');
  assert.equal(toPlainMath('$y^{\\frac{1}{4}}$'), 'y^(1/4)');
  assert.equal(toPlainMath('$146{,}230 \\div 168^{8/5}$'), '146,230 ÷ 168^(8/5)');
  assert.equal(toPlainMath('$a^{2b}$'), 'a^(2b)');
  // A single number or letter stands alone, and a whole 2 or 3 is ² or ³, as before.
  assert.equal(toPlainMath('$x^{2}+3x$ and $y^2$'), 'x²+3x and y²');
  assert.equal(toPlainMath('$x^{10}$, $e^{x}$, $x^{-1}$'), 'x^10, e^x, x^-1');
  assert.equal(toPlainMath('$x^{23}$'), 'x^23');
  assert.equal(toPlainMath('Slope $m$ ='), 'Slope m =');
});

// The choices rewritten are wrong answers; every key is as it was.
test('the rewritten choices are not keys: each key is unchanged', () => {
  const key = (questionId, fieldId) => questionIn(questionId).answerFields.find((field) => field.id === fieldId).answer;
  assert.equal(key('a2r3-cw-5', 'neg16'), 'not a real number: the root is even and the base is negative');
  assert.equal(key('a2r3-cw-10', 'b'), 'Not simplified: a fractional exponent is in the denominator');
  assert.equal(key('a2r3-p-8', 'verdict'), 'Ben: the law that turns it into ⁶√((−8)²) needs a base ≥ 0');
  assert.equal(key('a2r3-wu-3', 'meaning'), 'the nth root of b');
  assert.equal(key('a2r3-cw-9', 'conjugate'), 'y^(1/2) + 1');
});
