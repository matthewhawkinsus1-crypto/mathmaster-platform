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
import { readFileSync } from 'node:fs';
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

/* ---------------- one equation, one round (coordinator review of #464, B1) */

import {
  SOLVER_RACE_FOCUS,
  SOLVER_RACE_DIFFICULTIES,
  generateDistinctSolverRaceQuestion,
  solverRaceEquationKey,
} from '../../functions/shared/solverRace.mjs';
import { revealableRounds, roundQuestionKeys } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import { executableSource as srcOf, region as regionOf } from './helpers/sourceContract.mjs';

const repeatedKeys = (race) => {
  const keys = race.map(solverRaceEquationKey);
  return keys.filter((key, index) => keys.indexOf(key) !== index);
};

test('the review\'s repros: no match asks the same equation twice', () => {
  const repros = [
    { roundCount: 10, focus: 'mixed', difficulty: 'ramp', seed: 'repro-15' },
    { roundCount: 8, focus: 'absoluteValueEquation', difficulty: 'foundation', seed: 'repro-0' },
    { roundCount: 10, focus: 'linearEquation', difficulty: 'foundation', seed: 'repro-15' },
    { roundCount: 8, focus: 'literalEquation', difficulty: 'developing', seed: 'repro-0' },
  ];
  for (const options of repros) assert.deepEqual(repeatedKeys(planSolverRace(options)), [], JSON.stringify(options));
});

test('literal equations are compared by structure, with the solved-for letter kept', () => {
  const key = (equation, solveFor = 'x') => solverRaceEquationKey({ challengeFamily: 'literalEquation', equation, solveFor });
  assert.equal(key('q = k*n + d', 'n'), key('v = p*u + h', 'u'), 'renamed letters are the same question');
  assert.notEqual(key('q = n - k', 'n'), key('q = d - n', 'n'), 'y = x - a and y = b - x differ');
});

test('every focus, stage and length: equations are distinct whenever the family has enough of them', () => {
  let matches = 0;
  for (const focus of SOLVER_RACE_FOCUS) {
    for (const difficulty of SOLVER_RACE_DIFFICULTIES) {
      for (const roundCount of [3, 5, 8, 10, 12]) {
        for (let seed = 0; seed < 25; seed += 1) {
          const race = planSolverRace({ roundCount, focus, difficulty, seed: `sweep-${seed}` });
          matches += 1;
          // Literal equations have a fixed set of structures (letters are only
          // renamed): more rounds than structures cannot be distinct, and the
          // reveal holds the earlier solution instead (next test).
          const structures = new Set(SOLVER_RACE_CATALOG.filter((entry) => focus === 'mixed' || entry.challengeFamily === focus).map((entry) => entry.id)).size;
          if (focus === 'literalEquation' && roundCount > structures) continue;
          assert.deepEqual(repeatedKeys(race), [], `${focus}/${difficulty}/${roundCount}/sweep-${seed}`);
        }
      }
    }
  }
  assert.ok(matches > 3000);
});

test('a solution is held while a later, unclosed round asks the same question', () => {
  const keys = ['a', 'b', 'a', 'c'];
  const base = { scheduledRoundCount: 4, secondChancePossible: false, replayOf: {}, questionKeys: keys };
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 1 }), [1], 'round 0 waits for round 2');
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 2 }), [0, 1, 2]);
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 1, questionKeys: null }), [0, 1], 'without keys, as before');
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 1, finished: true }), [0, 1, 2, 3]);
  const race = [{ challengeFamily: 'literalEquation', equation: 'q = k*n + d', solveFor: 'n' }, { challengeFamily: 'literalEquation', equation: 'v = p*u + h', solveFor: 'u' }];
  const [first, second] = roundQuestionKeys(race);
  assert.equal(first, second);
  assert.deepEqual(roundQuestionKeys([null, {}]), [null, null]);
});

test('a dry-run swap never brings in an equation another round asks', () => {
  const structure = SOLVER_RACE_CATALOG.find((entry) => entry.id === 'solverRace_absoluteValueEquation_basic');
  const taken = new Set();
  for (let index = 0; index < 8; index += 1) {
    const question = generateDistinctSolverRaceQuestion({ structure, seedKey: `swap-${index}`, usedKeys: taken });
    const key = solverRaceEquationKey(question);
    assert.equal(taken.has(key), false, `swap ${index} is new (${question.equation})`);
    taken.add(key);
  }
  const index = srcOf(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const swap = regionOf(index, 'async swap({ dryRun, roundIndex }) {', 'const GRAPH_FEATURE_RUSH_PLANNER');
  assert.match(swap, /\.filter\(\(_, index\) => index !== roundIndex\)\s*\.map\(\(question\) => solverRace\.solverRaceEquationKey\(question\)\)/);
  assert.match(swap, /solverRace\.generateDistinctSolverRaceQuestion\(\{\s*structure: alternate,[\s\S]*?usedKeys,\s*\}\)/);
  const reveal = regionOf(index, 'function liveChallengeRevealableRounds(', 'function applyLiveChallengeSolutionReveals(');
  assert.match(reveal, /questionKeys: engine\.solutionReveal\.roundQuestionKeys\(privateState\.roundQuestions, questionIds\)/);
});

test('standard Live Challenge: a round on the same bank template as a later round is held (#469 addendum)', () => {
  // Bank rounds are drawn per round from the template, so the template is the question.
  const keys = roundQuestionKeys(null, ['tpl-a', 'tpl-b', 'tpl-a']);
  assert.deepEqual(keys, ['bank|tpl-a', 'bank|tpl-b', 'bank|tpl-a']);
  const base = { scheduledRoundCount: 3, secondChancePossible: false, replayOf: {}, questionKeys: keys };
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 1 }), [1], 'round 0 waits for round 2 on the same template');
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 2 }), [0, 1, 2]);
  // Solver Race rounds keep their equation key; ids alone do not override it.
  const mixed = roundQuestionKeys([{ challengeFamily: 'linearEquation', equation: 'x+7 = 12', solveFor: 'x' }], ['sr-1']);
  assert.match(mixed[0], /^linearEquation\|/);
  // The bank planner itself never schedules one template twice: it draws
  // distinct bank documents, and a swap takes the first one not in use.
  const index = srcOf(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const select = regionOf(index, 'function selectChallengeQuestions(entries, requestedCount) {', '\n}\n');
  assert.match(select, /return \[\.\.\.firstByFamily, \.\.\.repeats\]\.slice\(0, requestedCount\);/);
  const bankSwap = regionOf(index, 'secureBank: Object.freeze({', 'solverRaceGenerator: Object.freeze({');
  assert.match(bankSwap, /\.find\(\(id\) => !inUse\.has\(id\)\)/);
});
