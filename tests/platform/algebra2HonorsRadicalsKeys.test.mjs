import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';

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
  assert.equal(key('cyp').answer, `${Math.round(light / 20) * 20} kg`, `M for 80 kg is ${light}`);
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
  [L1, ['a2r1-cw-3', 'a2r1-cw-4', 'a2r1-cw-7', 'a2r1-cw-8']],
  [L2, ['a2r2-cw-6']],
  [L3, ['a2r3-cw-2']],
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
  [L3, 'a2r3-cw-2', 'a', '\\frac{y^{2}z^{2}}{x^{5}}', ['x^{-5}y^2z^2', '\\frac{y^2}{x^5z^2}']],
  [L3, 'a2r3-cw-2', 'b', 'h^{8}', ['\\frac{h^6}{h^{-2}}', 'h^{6+2}', 'h^4']],
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
/** The radicands a prompt writes, \sqrt{…} or \sqrt[n]{…}, one level of braces inside. */
const radicands = (question) => [...String(question.prompt).matchAll(/\\sqrt(?:\[\d+\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((match) => match[1]);
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
