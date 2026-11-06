import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';
import { radicalFormMiss } from '../../functions/shared/simplestRadicalFormEquivalence.mjs';
import { authoredHintTexts } from '../../src/platform/supports/hints/questionHints.js';
import { unicodeSuperscriptsToMathMarkup } from '../../src/mathDisplayFormat.js';
import { versionsOf } from './helpers/lessonFileChecks.mjs';

// The answer keys of the Algebra II Honors radicals lessons, recomputed, and
// the pacing and scaffolding rules from the same review. The lesson test
// (algebra2HonorsRadicalsLessons) holds each file to its builder; this one
// holds the mathematics. Two keys shipped wrong (PR #537 review):
// L3 CW 6 keyed 168^(8/5) as 3638 (it is 3634.92, so the right 3635 was
// refused), and L1 PR 1 called b·x^h the positive square root of b²x^(2h) for
// odd h, where a negative x makes it the negative one.

const fileText = (file) => readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-radicals/${file}`, import.meta.url), 'utf8');
const lesson = (file) => JSON.parse(fileText(file));
const compiledLessons = new Map();
/** A question as the teacher import compiles it: what students get and the grader reads. */
const compiledQuestion = (file, questionId) => {
  if (!compiledLessons.has(file)) compiledLessons.set(file, compileTeacherImport(fileText(file)).questions);
  return compiledLessons.get(file).find((question) => question.questionId === questionId);
};
const find = (node, questionId) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find(item, questionId);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (node.questionId === questionId) return node;
  for (const value of Object.values(node)) {
    const found = find(value, questionId);
    if (found) return found;
  }
  return null;
};

test('L3 CW 6: each weightlifting key is the number the formula gives', () => {
  const item = find(lesson('L3_Rational_Exponents.json'), 'a2r3-cw-6');
  const key = (id) => item.responses.find((response) => response.id === id);
  const power = 168 ** (8 / 5);
  assert.equal(key('power').answer, String(Math.round(power)), `168^(8/5) = ${power}`);
  assert.equal(key('quotient').answer, (146230 / power).toFixed(1));
  assert.equal(key('mass').answer, String(Math.round(512 - 146230 / power)));
  const light = 512 - 146230 / 80 ** (8 / 5);
  // Typed now, to the nearest kilogram as the first lifter's M is (it was a choice among 300–400 kg).
  assert.equal(key('cyp').answer, String(Math.round(light)), `M for 80 kg is ${light}`);
  assert.equal(key('cyp').numericTolerance, key('mass').numericTolerance);
  // The worked steps state the same numbers.
  const steps = item.solutionReview.reasoning.join(' ');
  assert.match(steps, new RegExp(`168\\^\\(8/5\\) ≈ ${power.toFixed(1)}`));
  assert.match(steps, new RegExp(`80\\^\\(8/5\\) ≈ ${(80 ** (8 / 5)).toFixed(1)}`));
  assert.match(steps, new RegExp(`≈ ${(146230 / 80 ** (8 / 5)).toFixed(1)}, so M ≈ 380 kg`));
});

test('L1 PR 1: the "positive square root" key is never negative, for any version', () => {
  const item = find(lesson('L1_nth_Roots.json'), 'a2r1-p-1');
  assert.deepEqual(item.responses.map((response) => [response.label, response.answer]), [
    ['Positive square root', '{{b}}x^{{h}}'],
    ['Negative square root', '-{{b}}x^{{h}}'],
  ]);
  // b·x^h is nonnegative for every real x only when h is even, as the lesson
  // teaches ("every even power is already nonnegative, so it needs no bars").
  const { parameters, derived } = item.generator;
  const values = (name) => {
    if (parameters[name]) {
      const { min, max } = parameters[name];
      return Array.from({ length: max - min + 1 }, (_, index) => min + index);
    }
    const [factor, variable] = derived[name].split('*');
    return values(variable).map((value) => Number(factor) * value);
  };
  const exponents = values('h');
  assert.ok(exponents.length > 0);
  for (const h of exponents) {
    assert.equal(h % 2, 0, `x^${h} is negative for a negative x`);
    for (const x of [-3, -1, 2]) assert.ok(x ** h >= 0);
  }
  // The radicand's exponent stays twice the root's.
  assert.deepEqual(values('e'), exponents.map((h) => 2 * h));
});

test('L1 Exit Ticket 1: the root is the practice item\'s, so the one try is no harder than PR 3', () => {
  // The exit ticket mirrors PR 3, a fourth root. A sixth root as well made the
  // one try range from ⁴√(16x⁴y⁸) to ⁶√(4096x³⁰y²⁴) (F-L1-EXIT-SPREAD).
  const file = lesson('L1_nth_Roots.json');
  const practice = find(file, 'a2r1-p-3');
  const exit = find(file, 'a2r1-dol-1');
  assert.match(practice.prompt, /\\sqrt\[4\]/);
  const { parameters } = exit.generator;
  assert.deepEqual(parameters.n.values, [4], 'the index is always 4');
  const range = ({ min, max }) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const largest = Math.max(...parameters.n.values.flatMap((n) => range(parameters.d).map((d) => d ** n)));
  const practiceLargest = Math.max(...range(practice.generator.parameters.d).map((d) => d ** 4));
  assert.ok(largest <= practiceLargest && largest <= 3 ** 6, `the largest coefficient, ${largest}, is within practice's ${practiceLargest} and 729`);
  // Each exponent is within practice's (PR 3 names y's exponent n, the exit ticket k).
  const most = (values) => 4 * Math.max(...values);
  assert.ok(most(parameters.m.values) <= most(practice.generator.parameters.m.values), 'x\'s exponent is within practice\'s');
  assert.ok(most(parameters.k.values) <= most(practice.generator.parameters.n.values), 'y\'s exponent is within practice\'s');
});

test('L3 Practice: the band-3 items come before the Honors extension and the CCMR items', () => {
  // A student who stopped after the hardest items never reached the index
  // reduction the classwork had just taught (PR 14 sat after bands 4 and 5).
  const practice = lesson('L3_Rational_Exponents.json').sections.find((section) => section.role === 'practice').questions;
  const bands = practice.map((question) => question.difficultyBand);
  const peak = bands.findIndex((band) => band >= 4);
  assert.ok(peak > 0, 'the practice climbs to band 4');
  assert.deepEqual(bands.slice(peak).filter((band) => band < 4), [], `no easier item after the climb: ${bands.join(', ')}`);
  const reduction = practice.findIndex((question) => /Reduce the index/.test(question.prompt));
  assert.ok(reduction >= 0 && reduction < peak, 'the index reduction comes before the extension');
});

// F-CYP-AS-CHOICE: the "Check Your Progress" half of these items, where the
// student repeats the example alone, was a choice of four. With three tries it
// could be guessed, and the student never wrote the simplification the example
// had just modeled. Each is typed now, in a math box like the example's own; a
// choice is left only for a decision (bars or no bars, or the reason for
// them), which asks a question, never for a value ("… =").
const L1 = 'L1_nth_Roots.json';
const L2 = 'L2_Operations_with_Radical_Expressions.json';
const L3 = 'L3_Rational_Exponents.json';
const CHECK_YOUR_PROGRESS = [
  // a2r1-cw-6: √(−16) and its other square root, one to a box, as Example D's.
  [L1, ['a2r1-cw-3', 'a2r1-cw-4', 'a2r1-cw-6', 'a2r1-cw-7', 'a2r1-cw-8']],
  // a2r2-cw-12: the Check Your Progress after Examples A and B (L2 pacing).
  // a2r2-cw-8, 9 and 10: the second product, sum and FOIL product.
  [L2, ['a2r2-cw-6', 'a2r2-cw-8', 'a2r2-cw-9', 'a2r2-cw-10', 'a2r2-cw-12']],
  // a2r3-cw-8 and 9 were the walkthrough's L3 pair; the rest have the same shape.
  [L3, ['a2r3-cw-2', 'a2r3-cw-3', 'a2r3-cw-4', 'a2r3-cw-6', 'a2r3-cw-7', 'a2r3-cw-8', 'a2r3-cw-9']],
];

test('Check Your Progress: each simplification is typed in a math box, and a choice is left only for a decision', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    for (const [file, ids] of CHECK_YOUR_PROGRESS) {
      for (const questionId of ids) {
        const question = compiledQuestion(file, questionId);
        const choices = question.answerFields.filter((field) => field.type === 'choice');
        assert.deepEqual(choices.filter((field) => /=\s*$/.test(field.label)).map((field) => field.label), [], `${questionId}: a choice asks for a value`);
        // As a student sees it: |t| was drawn as a plain text box, read as the word "t".
        const typed = question.answerFields.filter((field) => field.type !== 'choice');
        const markup = renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null }));
        assert.equal((markup.match(/<math-field\b/g) || []).length, typed.length, `${questionId}: every typed answer is a math box`);
        assert.doesNotMatch(markup, /<input\b[^>]*type="text"/, `${questionId}: no answer is a plain text box`);
      }
    }
  } finally {
    await server.close();
  }
});

// Each typed half is graded by value and form: its simplification, as MathLive
// spells it, is right; the expression copied from the prompt, or the slip the
// item is about, is not. [file, question, box, right, wrong answers]
const TYPED_HALVES = [
  [L1, 'a2r1-cw-4', 'cyp', '-\\left(a^{3}+2\\right)^{4}', ['-\\sqrt{\\left(a^3+2\\right)^8}', '\\left(a^3+2\\right)^4', '-\\left(a^3+2\\right)^8']],
  [L1, 'a2r1-cw-7', 'sixth', '\\left|t\\right|', ['t', '\\sqrt[6]{t^6}']],
  [L1, 'a2r1-cw-7', 'fourth', '\\left|x\\right|', ['x', '-x']],
  [L1, 'a2r1-cw-8', 'cyp', '2\\left(x+2\\right)^{5}', ['\\sqrt[3]{8\\left(x+2\\right)^{15}}', '\\left|2\\left(x+2\\right)^5\\right|', '3\\left(x+2\\right)^3']],
  [L2, 'a2r2-cw-6', 'first', '\\frac{x\\sqrt{xy}}{y^{4}}', ['\\sqrt{\\frac{x^3}{y^7}}', '\\frac{x\\sqrt{x}}{y^3\\sqrt{y}}']],
  [L2, 'a2r2-cw-12', 'first', '4x^{2}y^{5}\\sqrt{y}', ['\\sqrt{16x^4y^{11}}', '4x^2y^4\\sqrt{y^3}', '2x^2y^5\\sqrt{y}']],
  [L2, 'a2r2-cw-12', 'second', '3x^{3}y^{4}\\sqrt[3]{y^{2}}', ['\\sqrt[3]{27x^9y^{14}}', '3x^3y^4\\sqrt[3]{y}', '3x^3y^3\\sqrt[3]{y^5}', '9x^3y^4\\sqrt[3]{y^2}']],
  [L3, 'a2r3-cw-2', 'a', '\\frac{y^{2}z^{2}}{x^{5}}', ['x^{-5}y^2z^2', '\\frac{y^2}{x^5z^2}']],
  [L3, 'a2r3-cw-2', 'b', 'h^{8}', ['\\frac{h^6}{h^{-2}}', 'h^{6+2}', 'h^4']],
  [L1, 'a2r1-cw-6', 'rootPlus', '2i', ['-2i', '2']],
  [L1, 'a2r1-cw-6', 'rootMinus', '-2i', ['2i', '-2']],
  [L1, 'a2r1-cw-6', 'cypRoot', '4i', ['-4i', '4', '\\sqrt{-16}', '\\pm4i']],
  [L1, 'a2r1-cw-6', 'cypOther', '-4i', ['4i', '-4', '\\pm4i']],
  [L2, 'a2r2-cw-8', 'second', '24a', ['6\\sqrt[3]{64a^3}', '12a', '4a']],
  [L2, 'a2r2-cw-9', 'cyp', '8\\sqrt{3}', ['15\\sqrt{3}-8\\sqrt{3}+\\sqrt{3}', '\\sqrt{192}', '24\\sqrt{3}', '2\\sqrt{30}']],
  [L2, 'a2r2-cw-10', 'cyp', '10\\sqrt{5}-2\\sqrt{35}+20\\sqrt{6}-4\\sqrt{42}', ['\\left(2\\sqrt{5}+4\\sqrt{6}\\right)\\left(5-\\sqrt{7}\\right)', '10\\sqrt{5}-2\\sqrt{35}-4\\sqrt{42}', '10\\sqrt{5}-4\\sqrt{42}']],
  [L2, 'a2r2-cw-10', 'cyp', '20\\sqrt{6}+10\\sqrt{5}-4\\sqrt{42}-2\\sqrt{35}', []],
  [L3, 'a2r3-cw-3', 'a3', '\\sqrt[3]{a}', ['a^{\\frac{1}{3}}', '\\sqrt{a^3}']],
  [L3, 'a2r3-cw-3', 'x5', 'x^{\\frac{1}{5}}', ['\\sqrt[5]{x}', 'x^5']],
  [L3, 'a2r3-cw-4', 'cyp25', '\\frac{1}{5}', ['-5', '5', '-\\frac{1}{5}']],
  [L3, 'a2r3-cw-4', 'cyp16', '8', ['64', '12']],
  [L3, 'a2r3-cw-6', 'cyp', '380', ['512', '400', '472']],
  [L3, 'a2r3-cw-7', 'cyp1', 'x^{\\frac{3}{5}}', ['x^{\\frac{1}{5}}\\cdot x^{\\frac{2}{5}}', 'x^{\\frac{2}{25}}']],
  [L3, 'a2r3-cw-7', 'cyp2', '\\frac{y^{\\frac{1}{4}}}{y}', ['y^{-\\frac{3}{4}}', '\\frac{1}{y^{\\frac{3}{4}}}', 'y^{\\frac{3}{4}}']],
  [L3, 'a2r3-cw-8', 'cyp1', '1', ['\\frac{\\sqrt[4]{4}}{\\sqrt{2}}', '2^{\\frac{1}{4}}']],
  [L3, 'a2r3-cw-8', 'cyp2', '\\sqrt[3]{4x}', ['\\sqrt[6]{16x^2}', '\\sqrt[3]{4x^2}']],
  [L3, 'a2r3-cw-9', 'cyp', '\\frac{x-2x^{\\frac{1}{2}}+1}{x-1}', ['\\frac{x^{\\frac{1}{2}}-1}{x^{\\frac{1}{2}}+1}', '\\frac{x+1}{x-1}']],
];

test('Check Your Progress: each typed half takes its simplification and refuses the expression copied or the slip', () => {
  for (const [file, questionId, fieldId, right, wrongs] of TYPED_HALVES) {
    const question = compiledQuestion(file, questionId);
    const key = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
    const verdict = (typed) => gradeMultiAnswerResponse(question, { ...key, [fieldId]: typed }).parts.find((part) => part.id === fieldId)?.isCorrect;
    assert.equal(verdict(right), true, `${questionId} ${fieldId}: ${right} is right`);
    for (const wrong of wrongs) assert.equal(verdict(wrong), false, `${questionId} ${fieldId}: ${wrong} is not`);
  }
});

test('L1 CW 3: ±√(9x⁸) is two typed boxes, the positive root and the negative root, as PR 1 asks', () => {
  // Never a box that asks a student to type ±: one root in each, each graded alone.
  const question = compiledQuestion(L1, 'a2r1-cw-3');
  const key = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  const right = (fieldId, typed) => gradeMultiAnswerResponse(question, { ...key, [fieldId]: typed }).parts.find((part) => part.id === fieldId)?.isCorrect;
  assert.deepEqual([key.cypPositive, key.cypNegative], ['3x^4', '-3x^4']);
  assert.equal(right('cypPositive', '3x^{4}'), true);
  assert.equal(right('cypNegative', '-3x^{4}'), true);
  assert.equal(right('cypPositive', '-3x^4'), false, 'the positive root is not the negative one');
  assert.equal(right('cypNegative', '3x^4'), false, 'the negative root is not the positive one');
  assert.equal(right('cypPositive', '\\pm3x^4'), false, 'one root to a box');
  assert.equal(right('cypPositive', '\\sqrt{9x^8}'), false, 'the radical retyped is not its simplification');
  assert.equal(question.answerFields.some((field) => /±/.test(String(field.answer))), false);
});

// L1 pacing (PR #537 walkthrough): the slides simplify √63 and 3√12 (CW 9)
// after Examples A–D and the absolute-value items, so a student met "largest
// perfect-square factor" only after writing perfect powers of variables.
const sectionOf = (file, role) => lesson(file).sections.find((section) => section.role === role).questions;
/** The radicals a prompt writes, \sqrt{…} or \sqrt[n]{…} (one level of braces inside), as [index, radicand]. */
const radicals = (question) => [...String(question.prompt).matchAll(/\\sqrt(?:\[(\d+)\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
  .map(([, index = '2', radicand]) => [index, radicand]);
const radicands = (question) => radicals(question).map(([, radicand]) => radicand);
/** The slide number a classwork id carries (a2r1-cw-9 is the slides' ninth). */
const slideNumber = (question) => Number(question.questionId.split('-').pop());

test('L1 Classwork: the numerical radicals come before the variable work, after the definitions they use', () => {
  const classwork = sectionOf(L1, 'classwork');
  const numbers = classwork.findIndex((question) => question.questionId === 'a2r1-cw-9');
  assert.ok(numbers >= 0);
  assert.match(classwork[numbers].prompt, /largest perfect-square factor/);
  assert.deepEqual(radicands(classwork[numbers]), ['63', '12'], 'its radicands are numbers');
  const variables = classwork.findIndex((question) => radicands(question).some((radicand) => /[a-z]/i.test(radicand)));
  assert.ok(variables >= 0, 'the classwork has variable radicands');
  assert.ok(numbers < variables, `the numbers (CW ${numbers + 1}) come before the first variable radicand (CW ${variables + 1})`);
  // What it needs comes first: the index and the radicand (CW 1), real roots (CW 2).
  const definitions = classwork.filter((question) => slideNumber(question) <= 2).map((question) => classwork.indexOf(question));
  assert.equal(definitions.length, 2);
  assert.ok(definitions.every((index) => index < numbers), 'the definitions come before it');
  // Every other item keeps the slides' order.
  const others = classwork.filter((_, index) => index !== numbers).map(slideNumber);
  assert.deepEqual(others, [...others].sort((a, b) => a - b), `the slides' order: ${others.join(', ')}`);
});

// L2 pacing (PR #537 walkthrough). The slides' Check Your Progress B for the
// Product Property, ⁴√(625b²⁸k²³) with b any real number, was the third item:
// band 4 after band-3 examples, with bars, a radical left over, and k ≥ 0,
// which only its reason revealed. The Check Your Progress after the examples
// now repeats them, and the slides' item is an extension later on.
test('L2 Classwork: the Check Your Progress after Examples A and B repeats them, a cube root with every variable positive', () => {
  const classwork = sectionOf(L2, 'classwork');
  const examples = classwork.findIndex((question) => question.prompt.startsWith('Product Property, Examples A and B.'));
  assert.ok(examples >= 0);
  const check = classwork[examples + 1];
  assert.match(check.prompt, /^Check Your Progress A and B\./);
  assert.deepEqual(radicals(check).map(([index]) => index), radicals(classwork[examples]).map(([index]) => index), 'a square root, then a cube root, as in the examples');
  assert.match(check.prompt, /Assume every variable is positive\./);
  assert.ok(check.difficultyBand <= classwork[examples].difficultyBand, `band ${check.difficultyBand} after examples of band ${classwork[examples].difficultyBand}`);
  // Typed and graded by value and form; with every variable positive, no bars.
  assert.deepEqual(check.responses.map((response) => response.gradingMode), ['simplestRadicalForm', 'simplestRadicalForm']);
  assert.equal(check.responses.some((response) => /\|/.test(response.answer)), false);
  assert.match(check.solutionReview.reasoning.join(' '), /27x⁹y¹⁴ = \(3x³y⁴\)³ · y²/);
});

test('L2 Classwork: the slides\' Check Your Progress B is an extension after multiplying radicals, with its own supports', () => {
  const classwork = sectionOf(L2, 'classwork');
  const multiply = classwork.findIndex((question) => question.prompt.startsWith('Multiply radicals.'));
  const extension = classwork.findIndex((question) => question.questionId === 'a2r2-cw-3');
  assert.ok(multiply >= 0);
  assert.equal(extension, multiply + 1, `the extension (CW ${extension + 1}) comes straight after multiplying radicals (CW ${multiply + 1})`);
  const item = classwork[extension];
  assert.match(item.prompt, /^Extension — /);
  assert.deepEqual(radicals(item), [['4', '625b^{28}k^{23}']]);
  assert.equal(item.difficultyBand, 4);
  // Its hints, back-up step and worked solution are about its fourth root, and
  // nothing in them is left over from √(16x⁴y¹¹), which went to the Check Your Progress.
  assert.match(item.hints.join(' '), /625 = 5⁴/);
  assert.match(item.scaffold.prompt, /⁴√\(b²⁸\)/);
  assert.match(item.solutionReview.reasoning.join(' '), /625b²⁸k²³ = \(5b⁷k⁵\)⁴ · k³/);
  // As drawn: k⁵ times a fourth root. Written "k⁵⁴√(k³)", the run ⁵⁴ after k
  // was one power, k to the 54th (2026-11-06 walkthrough).
  [item.solutionReview.answerSummary, item.solutionReview.reasoning.join(' ')].forEach((text) => {
    const drawn = unicodeSuperscriptsToMathMarkup(text, 'latex');
    assert.ok(drawn.includes('k^{5}') && drawn.includes('\\sqrt[4]{k^{3}}') && !drawn.includes('k^{54}'), drawn);
  });
  assert.match(item.solutionReview.answerSummary, /^5\|b⁷\|k⁵/);
  assert.doesNotMatch(JSON.stringify([item.hints, item.scaffold, item.solutionReview, item.directionSteps]), /16x|y¹¹|square root/);
});

test('L2 Classwork: the four simplest-form rules come before the items that ask for simplest form', () => {
  const classwork = sectionOf(L2, 'classwork');
  const rules = classwork.findIndex((question) => question.prompt.startsWith('Simplest form.'));
  assert.ok(rules >= 0);
  // A radical of a fraction, or a radical in a denominator, is simplified by
  // rationalizing: two of the four rules.
  const asking = classwork.flatMap((question, index) => (
    radicals(question).some(([, radicand]) => radicand.startsWith('\\dfrac')) || /rationalize/i.test(question.prompt) ? [index] : []
  ));
  assert.ok(asking.length >= 4, `${asking.length} items ask for it`);
  assert.ok(asking.every((index) => rules < index), `the rules (CW ${rules + 1}) come before CW ${asking.map((index) => index + 1).join(', ')}`);
});

test('L2 Practice: it opens with its easiest item, the simplest rationalization, swapped with PR 1', () => {
  const practice = sectionOf(L2, 'practice');
  const bands = practice.map((question) => question.difficultyBand);
  assert.equal(bands[0], Math.min(...bands), `bands: ${bands.join(', ')}`);
  assert.ok(bands[0] < bands[1], 'an easier opener than the band-3 items after it');
  assert.match(practice[0].prompt, /^Rationalize the denominator/);
  // Only PR 1 and PR 6 traded places: the Honors and CCMR items keep the numbers the teacher note gives.
  const order = ['a2r2-p-6', 'a2r2-p-2', 'a2r2-p-3', 'a2r2-p-4', 'a2r2-p-5', 'a2r2-p-1', ...Array.from({ length: 9 }, (_, index) => `a2r2-p-${index + 7}`)];
  assert.deepEqual(practice.map((question) => question.questionId), order);
});

// The README and each teacher note count the items and name some by place
// ("Classwork 3", "CW9", "P12"). Items moved, so each count and place is
// checked against the files. A place the notes name must be in NAMED, with
// what the item there asks.
const README = readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-radicals/README.md', import.meta.url), 'utf8');
const NAMED = {
  [L1]: { 3: /\\sqrt\{63\}/, 9: /\\sqrt\[3\]\{8\(x\+2\)\^\{15\}\}/, 10: /\\sqrt\{9x\^4y\^\{10\}z\^4\}/ },
  [L2]: { 3: /\\sqrt\[3\]\{27x\^9y\^\{14\}\}/, 4: /^Simplest form\./, 9: /\\sqrt\[4\]\{625b\^\{28\}k\^\{23\}\}/ },
  [L3]: { 8: /\\sqrt\[6\]\{16x\^2\}/ },
};
const LESSON_NUMBER = { [L1]: '1', [L2]: '2', [L3]: '3' };

test('README and teacher notes: the counts, the CCMR and Honors item numbers, and each Classwork place they name', () => {
  for (const file of [L1, L2, L3]) {
    const data = lesson(file);
    const counts = data.sections.map((section) => section.questions.length).join(' · ');
    assert.ok(README.includes(`| \`${file}\` | ${data.assignment.title.replace(/^Algebra II Honors — /, '')} | ${counts} |`), `${file}: the README counts ${counts}`);
    const practice = sectionOf(file, 'practice');
    const classwork = sectionOf(file, 'classwork');
    // The CCMR table: each audited item at the place it names.
    const row = README.match(new RegExp(`^\\| ${LESSON_NUMBER[file]} \\| (.+) \\|$`, 'm'));
    const ccmr = [...row[1].matchAll(/`([^`]+)` \(P(\d+)\)/g)];
    assert.equal(ccmr.length, 2);
    for (const [, documentId, place] of ccmr) assert.equal(practice[place - 1]?.ccmrSource?.documentId, documentId, `${file}: P${place} is ${documentId}`);
    // The Honors extension items the teacher note names are deep (DOK 3+), and none is a CCMR item.
    const notes = data.assignment.teacherNotes;
    const honors = notes.split(/(?<=\.) /).find((sentence) => /Honors extension/.test(sentence));
    const places = [...honors.matchAll(/P(\d+)(?:–P(\d+))?/g)].flatMap(([, from, to = from]) => Array.from({ length: to - from + 1 }, (_, index) => Number(from) + index));
    assert.ok(places.length >= 3, `${file}: ${honors}`);
    for (const place of places) {
      assert.ok(Number(practice[place - 1].dok) >= 3 && !practice[place - 1].ccmrSource, `${file}: P${place} is an Honors extension item`);
    }
    // Each Classwork place named, in the teacher note or the README's lines for this lesson.
    const readmeLines = README.split('\n').filter((line) => line.startsWith(`- Lesson ${LESSON_NUMBER[file]}:`)).join(' ');
    const named = new Set([...notes.matchAll(/\bCW(\d+)/g), ...readmeLines.matchAll(/\bClasswork (\d+)/g)].map(([, place]) => Number(place)));
    assert.deepEqual([...named].sort((a, b) => a - b), Object.keys(NAMED[file]).map(Number), `${file}: the places named`);
    for (const [place, asks] of Object.entries(NAMED[file])) assert.match(classwork[place - 1].prompt, asks, `${file}: CW ${place}`);
  }
});

/* ------------------------------------------ the 2026-11-06 walkthrough */

const questionsOf = (file) => {
  if (!compiledLessons.has(file)) compiledLessons.set(file, compileTeacherImport(fileText(file)).questions);
  return compiledLessons.get(file);
};
const keyed = (question) => Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
const takes = (question, fieldId, typed) => gradeMultiAnswerResponse(question, { ...keyed(question), [fieldId]: typed })
  .parts.find((part) => part.id === fieldId)?.isCorrect === true;

// L1 PR 7: "Its two imaginary square roots are [ ] and [ ]" reads the roots in
// either order, but each box held one, so −5i then 5i was marked wrong twice.
// Each root has its own box now, named as Example D's are (CW 6): the radical
// names the principal root, and the other box its opposite.
test('L1 PR 7: each imaginary root has its own box, named by the root it holds, in every version', () => {
  const versions = versionsOf(compiledQuestion(L1, 'a2r1-p-7'), 200);
  assert.ok(versions.length >= 60, `${versions.length} versions`);
  for (const version of versions) {
    const field = (id) => version.answerFields.find((candidate) => candidate.id === id);
    const radicand = Number(/\\sqrt\{ -(\d+) \}/.exec(version.prompt)[1]);
    const root = Math.sqrt(radicand);
    assert.ok(Number.isInteger(root), version.prompt);
    assert.ok(field('rootPlus').label.includes(`√(−${radicand})`), `the first box names the radical: "${field('rootPlus').label}"`);
    assert.match(field('rootMinus').label, new RegExp(`\\bother\\b.*−${radicand}\\b`), `the second box names the other root: "${field('rootMinus').label}"`);
    assert.equal(takes(version, 'rootPlus', `${root}i`), true);
    assert.equal(takes(version, 'rootMinus', `-${root}i`), true);
    assert.equal(takes(version, 'rootPlus', `-${root}i`), false, 'the principal root is not the negative one');
  }
});

// L1 PR 10 asks for ∛k to the nearest thousandth, then k to the nearest tenth.
// Its key cubes the exact root, so a student who cubes that thousandth, as the
// box above asks, can land one tenth from it (d = 2.3: 2.666³ ≈ 18.9 for the
// key's 19.0), and a tolerance of exactly 0.1 refused that in floating point.
test('L1 PR 10: the rounding the item asks for is right in every version, and two tenths off is not', () => {
  const versions = versionsOf(compiledQuestion(L1, 'a2r1-p-10'), 200);
  assert.ok(versions.length >= 30, `${versions.length} versions`);
  let roundingsDiffer = 0;
  for (const version of versions) {
    const d = Number(/diameter (\d+(?:\.\d+)?) millimeters/.exec(version.prompt)[1]);
    const exactRoot = (d + 0.169) / 0.926;
    const typedRoot = Number(exactRoot.toFixed(3));
    const energy = (typed) => gradeMultiAnswerResponse(version, { ...keyed(version), cubeRoot: String(typedRoot), energy: typed })
      .parts.find((part) => part.id === 'energy')?.isCorrect === true;
    const fromTypedRoot = (typedRoot ** 3).toFixed(1);
    const fromExactRoot = (exactRoot ** 3).toFixed(1);
    if (fromTypedRoot !== fromExactRoot) roundingsDiffer += 1;
    assert.equal(energy(fromTypedRoot), true, `d = ${d}: ${fromTypedRoot}, the cube of ${typedRoot}`);
    assert.equal(energy(fromExactRoot), true, `d = ${d}: ${fromExactRoot}`);
    assert.equal(energy((Number(fromExactRoot) + 0.2).toFixed(1)), false, `d = ${d}: two tenths over`);
    assert.equal(energy((Number(fromExactRoot) - 0.2).toFixed(1)), false, `d = ${d}: two tenths under`);
  }
  assert.ok(roundingsDiffer > 0, 'some version rounds the two ways differently, so this can fail');
});

// A "radical form" box. CW 5 teaches b^(x/y) = ʸ√(bˣ) = (ʸ√b)ˣ, and the
// simplest-form grader takes one root with the power under it, worked out when
// it is a number: (∛V)² and ⁴√(2³) were refused with "take every perfect power
// out of the root", which neither has. Where the grader refuses the root raised
// to the power, or the number's power left unworked, the label says so.
test('a "radical form" box says the power goes under the root, where the grader refuses it outside', () => {
  // A key written as one root: root(n)(…) or ∛(…).
  const asRoot = (key) => {
    const general = /^root\((\d+)\)\((.+)\)$/.exec(key);
    if (general) return { index: general[1], radicand: general[2] };
    const cube = /^∛\((.+)\)$/.exec(key);
    return cube ? { index: '3', radicand: cube[1] } : null;
  };
  const checked = new Set();
  for (const file of [L1, L2, L3]) {
    questionsOf(file).filter((question) => ['classwork', 'practice'].includes(question.sectionId) && question.type === 'multiAnswer').forEach((question) => {
      versionsOf(question, 40).forEach((version) => version.answerFields
        .filter((field) => field.gradingMode === 'simplestRadicalForm' && /radical form/i.test(field.label))
        .forEach((field) => {
          const key = String(field.answer);
          const root = asRoot(key);
          if (!root) return;
          const { index, radicand } = root;
          const letterPower = /^([a-z])\^(\d+)$/i.exec(radicand);
          const number = /^\d+$/.test(radicand) ? Number(radicand) : null;
          const others = [];
          if (letterPower) others.push(`\\left(\\sqrt[${index}]{${letterPower[1]}}\\right)^{${letterPower[2]}}`);
          if (number) {
            for (let base = 2; base * base <= number; base += 1) {
              const power = Math.round(Math.log(number) / Math.log(base));
              if (base ** power === number) {
                others.push(`\\sqrt[${index}]{${base}^{${power}}}`, `\\left(\\sqrt[${index}]{${base}}\\right)^{${power}}`);
                break;
              }
            }
          }
          const refused = others.filter((other) => !takes(version, field.id, other) && radicalFormMiss(other, key) === 'notSimplest');
          if (!refused.length) return;
          checked.add(`${version.questionId} ${field.id}`);
          assert.match(field.label, /power under the root/, `${version.questionId} ${field.id}: the grader refuses ${refused.join(' and ')} for ${key}, and "${field.label}" does not say where the power goes`);
          if (number) assert.match(field.label, /worked out/, `${version.questionId} ${field.id}: ${refused[0]} is refused, so the label says the power is worked out`);
        }));
    });
  }
  assert.deepEqual([...checked].sort(), ['a2r3-p-15 radical', 'a2r3-p-3 radical', 'a2r3-p-7 radical', 'a2r3-p-9 product']);
});

// A last hint that ends in the other notation. L2 CW 7's "⁶√(x²) = x^(2/6) =
// x^(1/3)", L3 CW 8's "(2x²)^(2/6)" and L3 CW 10's "x^(4/8), and 4/8 can be
// reduced" end at an exponent, and their boxes take a radical only (a key in
// one notation asks for that one): a student who stopped where the hint did
// was told "the other notation" by a label that named none.
test('a box the last hint takes to the other notation names, in its label, the notation it takes', () => {
  const fragments = (sentence) => unicodeSuperscriptsToMathMarkup(String(sentence), 'latex')
    .replace(/[−–]/g, '-')
    .split(/\s*(?:=|,|;|:|\band\b|\bso\b)\s*/)
    .map((piece) => piece.trim().replace(/[.?!]+$/, ''))
    .filter(Boolean);
  const checked = [];
  for (const file of [L1, L2, L3]) {
    questionsOf(file).filter((question) => ['classwork', 'practice'].includes(question.sectionId) && question.type === 'multiAnswer').forEach((question) => {
      const [version] = versionsOf(question, 1);
      const hints = authoredHintTexts(version);
      const pieces = fragments(hints[hints.length - 1] || '');
      version.answerFields.filter((field) => field.gradingMode === 'simplestRadicalForm').forEach((field) => {
        const key = String(field.answer);
        const elsewhere = pieces.filter((piece) => {
          try { return radicalFormMiss(piece, key) === 'notation'; } catch { return false; }
        });
        if (!elsewhere.length) return;
        checked.push(`${version.questionId} ${field.id}`);
        const radical = /[√∛∜]|root\(/.test(key);
        assert.match(field.label, radical ? /\bradical\b/i : /\bexponent|\bpower\b/i, `${version.questionId} ${field.id}: the last hint ends at ${elsewhere.join(', ')}, the box takes ${key}, and "${field.label}" names no form`);
      });
    });
  }
  assert.deepEqual(checked.sort(), ['a2r2-cw-7 fix', 'a2r3-cw-10 fix', 'a2r3-cw-8 index', 'a2r3-cw-8 power16']);
});

// L2 CW 4: "To clear the radical from x³√x, multiply the top and bottom by"
// offered √x and √(x⁷), and both do it (x³√x · √(x⁷) = x⁷), so multiplying by
// the denominator's own radical, a sound method, was marked wrong. Where more
// than one option clears the radical, the label asks for the smallest, and the
// key is the smallest of them.
test('L2 CW 4: one option answers what the multiplier choice asks', () => {
  const field = compiledQuestion(L2, 'a2r2-cw-4').answerFields.find((candidate) => candidate.id === 'multiplier');
  const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  // Each option as a power of x: √x is x^(1/2), √(x⁷) is x^(7/2).
  const power = (option) => {
    const match = /^(√)?\(?x([⁰¹²³⁴⁵⁶⁷⁸⁹]*)\)?$/.exec(option);
    assert.ok(match, `an option this test reads: ${option}`);
    const whole = match[2] ? Number([...match[2]].map((digit) => SUPERSCRIPTS.indexOf(digit)).join('')) : 1;
    return match[1] ? whole / 2 : whole;
  };
  assert.match(field.label, /x³√x/);
  const clearing = field.options.filter((option) => Number.isInteger(3 + 1 / 2 + power(option)));
  assert.ok(clearing.includes(field.answer), `the key ${field.answer} clears the radical`);
  if (clearing.length > 1) {
    assert.match(field.label, /\bsmallest\b/, `${clearing.join(' and ')} both clear the radical, and the label does not ask for the smallest`);
    assert.equal(field.answer, clearing.reduce((least, option) => (power(option) < power(least) ? option : least)));
  }
});

// L2 CW 5, CW 6 and PR 12 asked "Multiply 9x by ? to get a perfect cube" (3y²
// in CW 6, ∛4 over itself in PR 12) and keyed the smallest factor. The
// denominator's own square makes a perfect cube too (9x · 81x² = (9x)³), the
// way many books clear a cube root, and was refused. The labels ask for the
// smallest, as CW 4's does; keys and grading are unchanged.
test('L2: a typed multiplier box asks for the smallest, where a larger factor also makes a perfect cube', () => {
  const perfectCube = (whole) => Math.round(Math.cbrt(whole)) ** 3 === whole;
  for (const [questionId, fieldId, larger, coefficient, exponent] of [
    ['a2r2-cw-5', 'multiplier', '81x^2', 9 * 81, 1 + 2],
    ['a2r2-cw-6', 'multiplier', '9y^4', 3 * 9, 2 + 4],
    ['a2r2-p-12', 'multiplier1', '∛(16)', 4 * 16, 0],
  ]) {
    const question = compiledQuestion(L2, questionId);
    const field = question.answerFields.find((candidate) => candidate.id === fieldId);
    assert.ok(perfectCube(coefficient) && exponent % 3 === 0, `${questionId}: ${larger} makes a perfect cube`);
    assert.equal(takes(question, fieldId, larger), false, `${questionId} takes ${larger}: this test is out of date`);
    assert.match(field.label, /\bsmallest\b/, `${questionId}: ${larger} also makes a perfect cube, and the label does not ask for the smallest`);
  }
});

// What a worked solution writes, in every version (2026-11-06 walkthrough):
// "(−3a^1b^4)³" and "6a²b¹" where an exponent drew 1, and "the 3th root" or
// "the 2th root" where an index did. A simplified answer never shows a power of
// 1, and these lessons grade simplest form. Classwork and Practice only: the
// Warm-Up and Exit Ticket are not edited here, because Recovery binds to them
// (docs/qa/2026-11-06-rewalk-changed-lessons/findings.md lists theirs).
test('no Classwork or Practice text writes a power of 1 or a wrong ordinal, in any version', () => {
  const wrongOrdinal = (text) => [...String(text).matchAll(/\b(\d+)th\b/g)].map(([, digits]) => Number(digits))
    .some((value) => [1, 2, 3].includes(value % 10) && ![11, 12, 13].includes(value % 100));
  const problems = new Set();
  let versionsRead = 0;
  for (const file of [L1, L2, L3]) {
    questionsOf(file).filter((question) => ['classwork', 'practice'].includes(question.sectionId)).forEach((question) => versionsOf(question, 400).forEach((version) => {
      versionsRead += 1;
      const review = version.solutionReview || {};
      const texts = [version.prompt, ...(version.answerFields || []).map((field) => field.label), ...authoredHintTexts(version),
        review.headline, ...(review.reasoning || []), review.answerSummary, review.commonError].filter(Boolean).map(String);
      texts.forEach((text) => {
        if (/[A-Za-z]\^1(?![0-9./])|[A-Za-z]¹(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/.test(text)) problems.add(`${version.questionId}: a power of 1 in "${text}"`);
        if (wrongOrdinal(text)) problems.add(`${version.questionId}: a wrong ordinal in "${text}"`);
      });
    }));
  }
  assert.deepEqual([...problems], []);
  assert.ok(versionsRead >= 1000, `${versionsRead} versions read`);
});

// Every typed Classwork and Practice answer is a math box. The box chooser
// reads a key with no sign it knows (27x, 7i, 2T, 48a) as words, and drew a
// plain text box among math boxes: no math keypad, the phone's letter
// keyboard, and a tell that the answer has no radical (2026-11-06
// walkthrough; the CT04 fix, as the Check Your Progress boxes have it). The
// Warm-Up's 8x is logged, not edited.
test('every typed Classwork and Practice answer is a math box', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    let boxes = 0;
    for (const file of [L1, L2, L3]) {
      for (const question of questionsOf(file).filter((candidate) => ['classwork', 'practice'].includes(candidate.sectionId) && candidate.type === 'multiAnswer')) {
        const [version] = versionsOf(question, 1);
        const typed = version.answerFields.filter((field) => field.type !== 'choice');
        if (!typed.length) continue;
        boxes += typed.length;
        const markup = renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question: version, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null }));
        assert.doesNotMatch(markup, /<input\b[^>]*type="text"/, `${question.questionId}: a typed answer is a plain text box`);
        assert.equal((markup.match(/<math-field\b/g) || []).length, typed.length, `${question.questionId}: every typed answer is a math box`);
      }
    }
    assert.ok(boxes >= 100, `${boxes} typed boxes`);
  } finally {
    await server.close();
  }
});
