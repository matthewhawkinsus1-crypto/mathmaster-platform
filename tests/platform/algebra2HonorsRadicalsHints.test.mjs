/*
 * ALGEBRA II HONORS RADICALS: HINTS THAT ASK BEFORE THEY TELL
 * (PR #537 walkthrough, F-HINT-GIVES-STEP).
 *
 * Hint 1 often completed the box it was meant to help with: L1 CW 3's
 * "16 = 4² and x⁸ = (x⁴)²" when the box asks for 4x⁴, L3 CW 8's
 * "⁶√16 = 2^(4/6)" when the box asks for 2^(2/3). Now, on every Warm-Up,
 * Classwork and Practice question of the three lessons:
 *   - hint 1 asks a question that points at the move;
 *   - no hint but the last states a box's answer, in any generated version:
 *     the key's value (a number read by value, an expression by the value
 *     the grader reads, with bars or without) or its simplest-form spelling;
 *   - the leak guard shows every hint in every version. It reads each
 *     student's own numbers, so a hint that named one of them was hidden
 *     from that student (Warm-Up 1's first hint, from every student).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGEBRA2_HONORS_RADICALS_LESSONS } from '../../scripts/content/build-algebra2-honors-radicals.mjs';
import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { boxesStated } from './helpers/boxesStated.mjs';
import { authoredHintTexts, questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';

const HINTED = new Set(['warmup', 'classwork', 'practice']);
const hintedQuestions = () => ALGEBRA2_HONORS_RADICALS_LESSONS.flatMap((entry) => compiled(readRepoFile(entry.file)).questions
  .filter((question) => HINTED.has(question.sectionId)));

/* ------------------------------------------------------------- the rules */

test('every Warm-Up, Classwork and Practice question asks before it tells: hint 1 is a question', () => {
  const questions = hintedQuestions();
  assert.equal(questions.length, 9 + 36 + 45, 'three lessons: 9 Warm-Up, 36 Classwork and 45 Practice questions');
  const telling = questions.filter((question) => !/\?/.test(authoredHintTexts(question)[0] || ''))
    .map((question) => `${question.questionId}: ${authoredHintTexts(question)[0]}`);
  assert.deepEqual(telling, []);
});

test('no hint but the last states a box\'s answer, in any generated version', () => {
  const problems = new Set();
  let versions = 0;
  hintedQuestions().forEach((question) => versionsOf(question).forEach((version) => {
    versions += 1;
    const hints = authoredHintTexts(version);
    hints.slice(0, -1).forEach((hint, index) => {
      const stated = boxesStated(hint, version);
      if (stated.length) problems.add(`${version.questionId} hint ${index + 1} ("${hint}") states ${stated.join(', ')}`);
    });
  }));
  assert.deepEqual([...problems], []);
  assert.ok(versions >= 1000, `${versions} versions read`);
});

test('the leak guard shows every hint in every version: none names a student\'s own numbers', () => {
  const hidden = new Set();
  hintedQuestions().forEach((question) => versionsOf(question).forEach((version) => {
    questionHintAudit(version).filter((hint) => hint.source === 'authored' && !hint.shown)
      .forEach((hint) => hidden.add(`${version.questionId}: "${hint.text}" (${hint.reason})`));
  }));
  assert.deepEqual([...hidden], []);
});

test('what counts as stating a box\'s answer', () => {
  // The finding's own hints, and the readings that keep a quotation or a
  // variable's name from counting.
  const version = (prompt, fields) => ({ prompt, answerFields: fields.map(([id, label, answer, extra = {}]) => ({ id, label, answer, inputProfile: 'expression', ...extra })) });
  const cw8 = version('Simplify $\\dfrac{\\sqrt[6]{16}}{\\sqrt[3]{2}}$.', [['power16', '⁶√16 as a power of 2', '2^(2/3)']]);
  assert.deepEqual(boxesStated('16 = 2⁴, so ⁶√16 = 2^(4/6).', cw8), ['power16 (2^(2/3))'], 'the key\'s value, unsimplified');
  assert.deepEqual(boxesStated('What power of 2 is 16?', cw8), []);
  const cw7 = version('Simplify $\\sqrt[4]{16x^4y^8}$.', [['mixed', '⁴√(16x⁴y⁸) =', '2|x|y^2'], ['sixth', '⁶√(t⁶) =', '|t|']]);
  assert.deepEqual(boxesStated('16x⁴y⁸ = (2xy²)⁴.', cw7), ['mixed (2|x|y^2)'], 'the base of a power: the key with its bars left off');
  assert.deepEqual(boxesStated('Is the answer 2|x|y²?', cw7), ['mixed (2|x|y^2)'], 'the simplest-form spelling');
  assert.deepEqual(boxesStated('If t = −2, what is t⁶? Is the root t?', cw7), [], 'a variable named is not an answer stated');
  assert.deepEqual(boxesStated('What is ⁶√(t⁶) when t = −2?', cw7), [], 'the box\'s own expression, quoted, is not its answer');
  const cw11 = version('Rationalize.', [['denominator', '(a√2 − a)(a√2 + a) =', 'a^2', { gradingMode: 'equivalentExpression' }]]);
  assert.deepEqual(boxesStated('(a√2)² − a² = 2a² − a².', cw11), ['denominator (a^2)']);
  const p5 = { prompt: 'Simplify $\\sqrt{180}$.', answerFields: [{ id: 'factor', label: 'Largest perfect-square factor of 180', answer: '36', inputProfile: 'number' }] };
  assert.deepEqual(boxesStated('Try the perfect squares 4, 9, 16, 25, 36, 49, 64, 81, … from the largest down.', p5), ['factor (36)']);
  assert.deepEqual(boxesStated('Which perfect squares divide 180? Which is the largest?', p5), []);
});
