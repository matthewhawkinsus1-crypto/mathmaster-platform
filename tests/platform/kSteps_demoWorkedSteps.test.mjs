/*
 * JOB K (CT02) — THE DEMO BANK'S WORKED STEPS.
 *
 * src/demo/demoAssignmentBank.json is the live question JSON the teacher demo
 * runs in the real QuestionEngine (DemoExperience.jsx). 44 of its 70 items are
 * `literal` items no support family covers: two-line systems, exponent rules,
 * a cost formula to evaluate, inverse functions, x² = c, logarithms and growth
 * models. The linearEquations and systems families leave them out on purpose
 * (supportFamily_linearEquations, supportFamily_systems), so once closed they
 * showed only the answer (kSteps_answerOnlyInventory, "demo | literal"). Each
 * now carries its own solutionReview, written for it. The other 26 keep the
 * linearEquations family's steps. The bank has no other copy to keep in step.
 *
 * Checked here with this file's own reading:
 *   - exactly those 44 carry a review, and the closed review shows it as the
 *     item's own steps (never a family's); the 26 still show the family's;
 *   - every answer a summary states is graded right by the shared server grader
 *     (gradeServerResponse) and is the item's accepted answer, and each one
 *     meets the item's own condition read from its formula and prompt;
 *   - every equation a step writes holds at the answer (mathjs), an
 *     approximation only where the step writes ≈, and the growth model's
 *     amount, rounded to the cent, only to that rounding;
 *   - every $…$ is typeset as mathematics, and the rest reads as words;
 *   - the review reaches what the demo hands QuestionEngine: generateQuestion,
 *     and the demo seed.
 *
 * Mutation-checked (each made in the bank, seen red, undone):
 *   - a step's arithmetic changed ("$6 = 2x$" to "$6 = 3x$") → the equation check;
 *   - a summary stating another value ("$x = 4$" for 3) → the grader check;
 *   - one item's review removed → the 44 and the inventory's demo floor;
 *   - a closing $ dropped → the typesetting check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import { generateQuestion } from '../../src/problemGenerator.js';
import { createDemoSeed } from '../../src/demo/demoExperienceData.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const math = create(all);
const BANK = JSON.parse(readFileSync(new URL('../../src/demo/demoAssignmentBank.json', import.meta.url), 'utf8'));
const AUTHORED = BANK.flatMap((assignment) => assignment.questions);
const generated = (authored) => generateQuestion(authored, `k-steps-demo|${authored.questionId}`);
const reviewOf = (question) => buildClosedQuestionReview({ question, isToolQuestion: false, wasCorrect: false, legacyContent: () => ({ hasContent: true }) });

/*
 * This file's own reading of each item: where its answer is (a scope for every
 * letter the steps use; several when there are several answers), and the
 * condition its answer v meets, read from its formula and prompt.
 */
const ORACLE = Object.freeze({
  'systems-dol-q1': { scopes: [{ x: 3, y: 5 }], condition: 'v + 2 == 3v - 4' },
  'systems-dol-q2': { scopes: [{ x: 3, y: 7 }], condition: '2v + 1 == -v + 10' },
  'systems-dol-q3': { scopes: [{ x: 7, y: 5 }], condition: 'v + (v - 2) == 12' },
  'systems-dol-q4': { scopes: [{ x: 6, y: 1 }], condition: '2v + 1 == 13' },
  'systems-dol-q5': { scopes: [{ x: 3, y: 5 }], condition: '4v - 7 == v + 2' },
  'exponents-adaptive-q1': { scopes: [{ x: 4 }], condition: '2^v == 16' },
  'exponents-adaptive-q2': { scopes: [{ x: 3 }], condition: '3^v == 27' },
  'exponents-adaptive-q3': { scopes: [{ x: 5 }], condition: '5^2 * 5^3 == 5^v' },
  // x is any base here: every equation must hold for each one.
  'exponents-adaptive-q4': { scopes: [{ n: 7 }], free: { x: [2, 3, -1.5] }, condition: '2^3 * 2^4 == 2^v' },
  'exponents-adaptive-q5': { scopes: [{ n: 4 }], condition: '10^6 / 10^2 == 10^v' },
  'phone-modeling-q1': { scopes: [{ C: 45, g: 4 }], condition: 'v == 25 + 5 * 4' },
  'phone-modeling-q2': { scopes: [{ g: 4 }], condition: '20 + 6v == 32 + 3v' },
  'phone-modeling-q3': { scopes: [{ C: 42, g: 6 }], condition: 'v == 18 + 4 * 6' },
  'phone-modeling-q5': { scopes: [{ g: 4 }], condition: '30 + 2v == 18 + 5v' },
  'systems-quiz-q1': { scopes: [{ x: 4, y: 9 }], condition: 'v + 5 == 2v + 1' },
  'systems-quiz-q2': { scopes: [{ x: 5, y: 6 }], condition: 'v + (v + 1) == 11' },
  'systems-quiz-q3': { scopes: [{ x: 3, y: 7 }], condition: '5v - 8 == 2v + 1' },
  'systems-quiz-q4': { scopes: [{ x: 4, y: 2 }], condition: '3v + 2 == 14' },
  'systems-quiz-q5': { scopes: [{ x: 4, y: 5 }], condition: '-v + 9 == v + 1' },
  'honors-modeling-q1': { scopes: [{ x: 6 }], condition: '12 + 4v == 30 + v' },
  'honors-modeling-q2': { scopes: [{ x: 5, y: 19 }], condition: '2v + 9 == -v + 24' },
  'honors-modeling-q3': { scopes: [{ m: 9 }], condition: '75 + 12v == 120 + 7v' },
  'honors-modeling-q4': { scopes: [{ x: 7, y: 15 }], condition: '4v - 13 == v + 8' },
  'honors-modeling-q5': { scopes: [{ n: 6 }], condition: '22 + 6v == 10 + 8v' },
  'a2-inverse-q1': { scopes: [{ x: 4 }], f: '2x + 3', condition: '2v + 3 == 11' },
  'a2-inverse-q2': { scopes: [{ x: 5 }], f: '5x - 1', condition: '5v - 1 == 24' },
  'a2-inverse-q3': { scopes: [{ x: 7 }], f: '3x + 7', condition: '3v + 7 == 28' },
  'a2-inverse-q4': { scopes: [{ x: 6 }], f: '4x - 6', condition: '4v - 6 == 18' },
  'a2-inverse-q5': { scopes: [{ x: 5 }], f: '7x + 2', condition: '7v + 2 == 37' },
  'a2-lq-q1': { scopes: [{ x: 2, y: 4 }, { x: -2, y: 4 }], condition: 'v^2 == 4' },
  'a2-lq-q2': { scopes: [{ x: 3, y: 9 }, { x: -3, y: 9 }], condition: 'v^2 == 9' },
  'a2-lq-q3': { scopes: [{ x: 3, y: 8 }, { x: -3, y: 8 }], condition: 'v^2 - 1 == 8' },
  'a2-lq-q4': { scopes: [{ x: 4, y: 18 }, { x: -4, y: 18 }], condition: 'v^2 + 2 == 18' },
  'a2-lq-q5': { scopes: [{ x: 5, y: 20 }, { x: -5, y: 20 }], condition: 'v^2 - 5 == 20' },
  'a2-exp-q1': { scopes: [{ x: 5 }], condition: '2^v == 32' },
  'a2-exp-q2': { scopes: [{ x: 3 }], condition: '10^v == 1000' },
  'a2-exp-q3': { scopes: [{ x: 4 }], condition: '3^v == 81' },
  'a2-exp-q4': { scopes: [{ x: 6 }], condition: '2^v == 64' },
  'a2-exp-q5': { scopes: [{ x: 3 }], condition: '5^v == 125' },
  // P = 153.15 is 120(1.05)^5 = 153.1537875 rounded to the cent.
  'a2-honors-q1': { scopes: [{ t: 5, P: 153.15 }], rounded: 1e-4, condition: 'abs(120 * 1.05^v - 153.15) < 0.005' },
  'a2-honors-q2': { scopes: [{ x: 7 }], condition: '2^v == 128' },
  'a2-honors-q3': { scopes: [{ x: 5 }], condition: '3^v == 243' },
  'a2-honors-q4': { scopes: [{ t: 2, A: 605 }], condition: 'abs(500 * 1.1^v - 605) < 1e-9' },
  'a2-honors-q5': { scopes: [{ x: 5 }], condition: '4^v == 1024' },
});
const AUTHORED_STEPS = AUTHORED.filter((question) => question.solutionReview);

/* ------------------------------------------------------------ reading a step's mathematics */

/** The $…$ pieces of a line, as written. */
const mathPieces = (line) => [...String(line).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
/** A piece's sides, split at = and ≈, as mathjs expressions, with how each pair is related. */
const sidesOf = (piece) => {
  const parts = piece.split(/(=|\\approx)/);
  const sides = [];
  const relations = [];
  parts.forEach((part, index) => {
    if (index % 2) relations.push(part === '=' ? 'equal' : 'approx');
    else sides.push(latexToExpression(part.replace(/\\log_\{?(\d+)\}?\(([^)]+)\)/g, 'log($2, $1)')).trim());
  });
  return { sides, relations };
};
const close = (a, b, tolerance) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));

/** Does every equation in this piece hold at some answer (and, for a free base, at every base)? */
const holds = (piece, oracle) => {
  // f⁻¹(N) = M is f(M) = N.
  const inverse = /^f\^\{-1\}\((\d+)\) = (-?\d+)$/.exec(piece.trim());
  const { sides, relations } = inverse ? { sides: [`f(${inverse[2]})`, inverse[1]], relations: ['equal'] } : sidesOf(piece);
  const freeNames = Object.keys(oracle.free || {});
  const freeScopes = freeNames.length ? oracle.free[freeNames[0]].map((value) => ({ [freeNames[0]]: value })) : [{}];
  return oracle.scopes.some((scope) => freeScopes.every((free) => {
    const values = { ...scope, ...free };
    if (oracle.f) values.f = (input) => math.evaluate(oracle.f.replace(/(\d)x/g, '$1*x'), { x: input });
    const evaluated = sides.map((side) => math.evaluate(side, values));
    return relations.every((relation, index) => close(Number(evaluated[index]), Number(evaluated[index + 1]), relation === 'approx' ? 1e-3 : (oracle.rounded || 1e-9)));
  }));
};

/** The answers a summary states: each "$<solveFor> = <number>$". */
const statedAnswers = (summary, solveFor) => mathPieces(summary)
  .map((piece) => new RegExp(`^${solveFor} = (-?\\d+(?:\\.\\d+)?)$`).exec(piece.trim()))
  .filter(Boolean)
  .map((match) => match[1]);

/* ------------------------------------------------------------ the tests */

test('the 44 demo items no family covers each carry a worked solution; the other 26 keep their family\'s steps', () => {
  assert.equal(AUTHORED.length, 70);
  assert.deepEqual(AUTHORED_STEPS.map((question) => question.questionId).sort(), Object.keys(ORACLE).sort());
  for (const authored of AUTHORED) {
    const question = generated(authored);
    const review = reviewOf(question);
    assert.equal(review.hasSteps, true, `${authored.questionId}: steps once closed`);
    if (authored.solutionReview) {
      // The item's own steps, as written; no family or builder is asked.
      assert.equal(review.fromFamily, false, authored.questionId);
      assert.equal(review.fromBuilder, false, authored.questionId);
      assert.deepEqual(review.authored.reasoning, authored.solutionReview.reasoning, authored.questionId);
      assert.equal(review.authored.headline, authored.solutionReview.headline, authored.questionId);
      assert.equal(review.authored.answerSummary, authored.solutionReview.answerSummary, authored.questionId);
    } else {
      assert.equal(review.fromFamily, true, `${authored.questionId}: the linearEquations family's steps`);
    }
  }
});

test('every answer a summary states is the item\'s accepted answer, meets its own condition, and is graded right by the shared grader', () => {
  let graded = 0;
  for (const authored of AUTHORED_STEPS) {
    const question = generated(authored);
    const oracle = ORACLE[authored.questionId];
    const stated = statedAnswers(authored.solutionReview.answerSummary, authored.solveFor);
    assert.ok(stated.length >= 1, `${authored.questionId}: the summary states ${authored.solveFor} = …`);
    assert.deepEqual(stated.map(Number).sort((a, b) => a - b), question.acceptedAnswers.map(Number).sort((a, b) => a - b), `${authored.questionId}: every accepted answer, and only those`);
    for (const value of stated) {
      assert.equal(math.evaluate(oracle.condition.replace(/(\d)v/g, '$1*v'), { v: Number(value) }), true, `${authored.questionId}: ${value} meets ${oracle.condition}`);
      const result = gradeServerResponse({ question, response: { kind: 'scalar', type: 'literal', value, fields: [] } });
      assert.equal(result.isCorrect, true, `${authored.questionId}: "${value}" is graded right`);
      graded += 1;
    }
    // A step that works out the unknown ends on the same answer ("x = 3", "C = 25 + 5 · 4 = 45").
    const solving = authored.solutionReview.reasoning.flatMap(mathPieces).map((piece) => piece.trim()).filter((piece) => new RegExp(`^${authored.solveFor} = -?\\d`).test(piece));
    assert.ok(stated.every((value) => solving.some((piece) => piece.endsWith(`= ${value}`))), `${authored.questionId}: a step reaches ${stated.join(' and ')}`);
  }
  assert.equal(graded, 44 + 5, 'one answer each, two for each x² = c');
});

test('every equation a step writes holds at the answer', () => {
  let checked = 0;
  for (const authored of AUTHORED_STEPS) {
    const oracle = ORACLE[authored.questionId];
    const { headline, reasoning, answerSummary } = authored.solutionReview;
    for (const line of [headline, ...reasoning, answerSummary]) {
      for (const piece of mathPieces(line)) {
        if (!/=|\\approx/.test(piece)) continue;
        assert.ok(holds(piece, oracle), `${authored.questionId}: "${piece}" in "${line}"`);
        checked += 1;
      }
    }
    // Every step of the working has something checked in it but a sentence of words.
    reasoning.forEach((line) => assert.ok(mathPieces(line).some((piece) => /=|\\approx/.test(piece)) || /^The graphs meet at|^So after/.test(line), `${authored.questionId}: nothing to check in "${line}"`));
  }
  assert.ok(checked > 150, `${checked} equations checked`);
});

test('each $…$ is typeset as mathematics, and the rest reads as plain words', () => {
  for (const authored of AUTHORED_STEPS) {
    const { headline, reasoning, answerSummary } = authored.solutionReview;
    for (const line of [headline, ...reasoning, answerSummary]) {
      assert.equal((line.match(/\$/g) || []).length % 2, 0, `${authored.questionId}: every $ is closed: ${line}`);
      const typeset = splitMathSegments(line).filter(isMathSegment);
      assert.equal(typeset.length, mathPieces(line).length, `${authored.questionId}: every $…$ is typeset: ${line}`);
      assert.doesNotMatch(line, /NaN|undefined|\bnull\b|Infinity|\[object/, `${authored.questionId}: ${line}`);
      assert.ok(line.length <= 240, `${authored.questionId}: one short step: ${line}`);
    }
  }
});

test('what the demo hands QuestionEngine carries the review: the demo seed\'s questions', () => {
  const seed = createDemoSeed(new Date('2026-08-08T12:00:00-05:00').getTime());
  const seeded = seed.assignments.flatMap((assignment) => assignment.questions);
  for (const authored of AUTHORED_STEPS) {
    const question = seeded.find((entry) => entry.questionId === authored.questionId);
    assert.deepEqual(question.solutionReview, authored.solutionReview, authored.questionId);
    assert.equal(reviewOf(generated(question)).authored.reasoning.length, authored.solutionReview.reasoning.length, authored.questionId);
  }
});
