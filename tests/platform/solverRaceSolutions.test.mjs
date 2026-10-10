/*
 * SOLVER RACE ROUNDS CARRY A WORKED SOLUTION (student push J; job E's
 * follow-up "the Solver Race bank carries no authored solution reviews").
 *
 * Every generated round now carries a `solutionReview` built from the draw's
 * own numbers (functions/shared/solverRaceSolutions.mjs). It is published
 * between rounds by job E's unchanged rules (liveChallengeSolutionReveal.mjs):
 * captured privately at the opening, public only after the round closes.
 *
 * THE MATHEMATICS IS CHECKED ON WHAT STUDENTS READ. For every structure and
 * many seeds, each `$…$` segment of every step and of the answer summary is
 * translated from its LaTeX into mathjs and evaluated:
 *   - a relation in x (an equation, an inequality, a chain, cases joined by
 *     "or") must have EXACTLY the truth set of the round's own equation, over
 *     a dense grid of integers, halves and thirds plus the boundary values;
 *   - a literal-equation step must hold at the solved value and fail next to
 *     it, for random values of the other letters;
 *   - a numeric check ("3(5) + 5 = 20") must be true.
 * So a wrong sign, a wrong constant, a missed flip, a lost case or a LaTeX
 * rendering that does not match the equation all fail here.
 *
 * Mutation-checked (each went red, then was restored):
 *   - isolateLinear stopped flipping the sign for a negative divisor;
 *   - the inside_coefficient split wrote kr for −kr in the second case;
 *   - an absolute-value "between" answer used \le for a strict <;
 *   - the review was dropped from generateSolverRaceQuestion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { all, create } from 'mathjs';

import { SOLVER_RACE_CATALOG, generateSolverRaceQuestion, planSolverRace } from '../../functions/shared/solverRace.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { publicSolutionDocument, roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const math = create(all, { epsilon: 1e-9 });

const SEEDS = Array.from({ length: 60 }, (_, index) => `solutions-seed-${index}`);

/* ------------------------------------------------------------- LaTeX → mathjs */

const toMathjs = (latex) => {
  let out = String(latex)
    .replace(/\\left\|/g, '|').replace(/\\right\|/g, '|')
    .replace(/\\le\b/g, '<=').replace(/\\ge\b/g, '>=');
  for (let guard = 0; guard < 5 && /\\frac\{/.test(out); guard += 1) {
    out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
  }
  assert.doesNotMatch(out, /\\/, `untranslated LaTeX in ${latex}`);
  // Adjacent letters are a product (kn, 2L): single-letter variables only.
  out = out.replace(/([A-Za-z])(?=[A-Za-z(])/g, '$1*');
  out = out.replace(/\|([^|]*)\|/g, 'abs($1)');
  return out.replace(/(?<![<>=!])=(?!=)/g, '==');
};
const plainToMathjs = (equation) => String(equation).replace(/\|([^|]*)\|/g, 'abs($1)').replace(/(?<![<>=!])=(?!=)/g, '==');
const holds = (expression, scope) => {
  const value = math.evaluate(expression, scope);
  return value === true || value === 1;
};
const segmentsOf = (text) => [...String(text).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
const isRelation = (latex) => /(=|<|>|\\le|\\ge)/.test(latex) && !/\\neq/.test(latex);
const hasLetter = (latex) => /[A-Za-z]/.test(latex.replace(/\\(frac|left|right|le|ge|text\{[^}]*\})/g, ''));

/** The relations a step states, each a list of alternatives ("or"). */
const stepRelations = (text) => {
  const relations = segmentsOf(text).filter(isRelation);
  const withVariable = relations.filter(hasLetter);
  const numeric = relations.filter((latex) => !hasLetter(latex)).flatMap((latex) => latex.split(/\\text\{ and \}/));
  return { withVariable, numeric };
};

/* ------------------------------------------------------------- truth sets */

const gridFor = (question) => {
  const numbers = (String(question.equation).match(/-?\d+/g) || []).map(Number);
  const extent = Math.max(30, ...numbers.map(Math.abs)) * 2;
  const points = new Set();
  for (let k = -extent * 6; k <= extent * 6; k += 1) points.add(k / 6);
  return [...points];
};
const truthSet = (expressions, grid) => grid.map((x) => expressions.some((expression) => holds(expression, { x })));

/* ------------------------------------------------------------- every structure */

const generated = SOLVER_RACE_CATALOG.flatMap((structure) => SEEDS.map((seed) => ({ structure, question: generateSolverRaceQuestion(structure, seed) })));

test('every Solver Race structure generates a worked solution of the projector\'s length', () => {
  for (const { structure, question } of generated) {
    const review = question.solutionReview;
    assert.ok(review, `${structure.id} has a worked solution`);
    assert.ok(review.headline && review.commonError && review.answerSummary, `${structure.id} headline, common error, answer`);
    assert.ok(review.reasoning.length >= 2 && review.reasoning.length <= 5, `${structure.id}: ${review.reasoning.length} steps`);
    assert.match(review.reasoning[0], /^Start with \$/, 'the first step restates the equation the round showed');
  }
});

test('every step of every numeric round has exactly the truth set of the round\'s equation; every check is true', () => {
  let stepsChecked = 0;
  for (const { structure, question } of generated.filter((entry) => entry.structure.challengeFamily !== 'literalEquation')) {
    const grid = gridFor(question);
    const original = truthSet([plainToMathjs(question.equation)], grid);
    const expected = String(question.expectedFinalRelation);
    // The answer the grader expects agrees with the equation (independent of the review).
    if (/no solution/i.test(expected)) assert.ok(original.every((value) => !value), `${structure.id}: no solution`);
    else if (/all real/i.test(expected)) assert.ok(original.every(Boolean), `${structure.id}: all real numbers`);
    else assert.deepEqual(truthSet(expected.split(/\s+OR\s+/).map(plainToMathjs), grid), original, `${structure.id}: expectedFinalRelation`);

    const review = question.solutionReview;
    for (const text of [...review.reasoning, review.answerSummary]) {
      const { withVariable, numeric } = stepRelations(text);
      numeric.forEach((latex) => assert.ok(holds(toMathjs(latex), {}), `${structure.id} ${question.equation}: the check "${latex}" is true`));
      if (!withVariable.length) {
        if (text === review.answerSummary) {
          if (/no solution/i.test(expected)) assert.match(text, /No solution/);
          else if (/all real/i.test(expected)) assert.match(text, /All real numbers/);
          else assert.fail(`${structure.id}: the answer summary states the answer`);
        }
        continue;
      }
      const stated = truthSet(withVariable.map(toMathjs), grid);
      assert.deepEqual(stated, original, `${structure.id} "${question.equation}": the step "${text}" has the same solutions as the equation`);
      stepsChecked += 1;
    }
  }
  assert.ok(stepsChecked > 5000, `${stepsChecked} steps checked`);
});

test('every literal-equation step holds at the solved value and fails beside it', () => {
  const rng = (() => { let state = 7; return () => { state = (state * 48271) % 2147483647; return state / 2147483647; }; })();
  for (const { structure, question } of generated.filter((entry) => entry.structure.challengeFamily === 'literalEquation')) {
    const target = question.solveFor;
    const letters = [...new Set(String(question.equation).match(/[A-Za-z]/g))].filter((letter) => letter !== target);
    const [, solvedRight] = String(question.expectedFinalRelation).split('=');
    for (let trial = 0; trial < 6; trial += 1) {
      const scope = Object.fromEntries(letters.map((letter) => [letter, Math.round((rng() * 18 - 9) * 2) / 2 || 3]));
      const value = math.evaluate(solvedRight, scope);
      assert.ok(holds(plainToMathjs(question.equation), { ...scope, [target]: value }), `${structure.id}: the expected relation solves the equation`);
      for (const text of [...question.solutionReview.reasoning, question.solutionReview.answerSummary]) {
        for (const latex of segmentsOf(text).filter(isRelation)) {
          const expression = toMathjs(latex);
          assert.ok(holds(expression, { ...scope, [target]: value }), `${structure.id} "${question.equation}": "${latex}" holds at the solution`);
          assert.ok(!holds(expression, { ...scope, [target]: value + 1 }), `${structure.id} "${question.equation}": "${latex}" fails beside it`);
        }
      }
    }
  }
});

test('the review travels the private path only: captured for the round, never in the public question', () => {
  const race = planSolverRace({ roundCount: 10, focus: 'mixed', difficulty: 'ramp', seed: 'privacy' });
  for (const question of race) {
    const support = buildPrivateSupport(question);
    assert.ok(support.solutionReview?.reasoning?.length, 'the private support carries the review');
    const record = roundSolutionRecord({ question, solutionReview: support.solutionReview, displayStandard: null });
    const published = publicSolutionDocument({ roundIndex: question.solverRaceRound, record });
    assert.equal(published.available, true, 'between rounds the solution is available, not "no worked solution yet"');
    assert.deepEqual([...published.solutionReview.reasoning], [...question.solutionReview.reasoning]);
    const sanitized = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'q', attemptsAllowed: 1 });
    const json = JSON.stringify(sanitized);
    assert.equal('solutionReview' in sanitized, false);
    assert.ok(!question.solutionReview.reasoning.some((step) => json.includes(step)), 'no step reaches the public question');
    assert.ok(!json.includes(question.solutionReview.answerSummary), 'nor the answer');
  }
});

test('the one-step inequality structure shows a·x, never "+0"', () => {
  const structure = SOLVER_RACE_CATALOG.find((entry) => entry.id === 'solverRace_linearInequality_positive_coefficient');
  for (const seed of SEEDS) assert.doesNotMatch(generateSolverRaceQuestion(structure, seed).equation, /\+0\b/);
});
