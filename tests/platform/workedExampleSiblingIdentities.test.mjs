/*
 * WE-I: EVERY BUILT-IN ALGEBRA II SIBLING STATES SOMETHING TRUE.
 *
 * Each sibling the WE-I families generate (the division replay,
 * polynomialDivision; the answer-box and sort generators,
 * algebra2AnswerBoxes) names the identities it states: its starting
 * expression and its answer, under the assumption its prompt states
 * (`identities`, `assume`). Over every real item each family claims, seeds 0
 * to 20, this evaluates both sides at random values that satisfy that
 * assumption (positive where it says positive, nonzero otherwise; a value the
 * identity names, such as a zero, as given) and requires them to agree to
 * 1e-9.
 *
 * It is evaluated here, with mathjs, from the plain text alone: nothing of the
 * generators' own arithmetic is reused, so a wrong rule (an exponent rule
 * applied to an even root of a negative number, a factor that does not
 * multiply back) shows up as two different numbers.
 *
 * And a sibling that needs positive values says so: "Assume all variables are
 * positive." (Codex on #626: (81t⁴u⁻¹²)^(−3/4) = u⁹/(27t³) is false at u = −1
 * unless the variables are positive.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { create, all } from 'mathjs';

import { asQuestionEngineReceivesIt, lessonFiles } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { familyFor } from '../../src/platform/supports/families/index.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const FAMILIES = new Set(['polynomialDivision', 'algebra2AnswerBoxes']);
const SEEDS = Array.from({ length: 21 }, (_, seed) => seed);

const math = create(all);
// Real roots and real rational powers: an odd root of a negative number is
// negative, an even one is not a real number (NaN, which never agrees).
const realRoot = (value, index) => {
  if (value < 0) return index % 2 === 1 ? -((-value) ** (1 / index)) : Number.NaN;
  return value ** (1 / index);
};
const realPow = (value, p, q) => realRoot(value, q) ** p;
math.import({ realRoot, realPow }, { override: true });

const SUPERSCRIPT = Object.freeze({ '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' });
const sup = (run) => [...run].map((character) => SUPERSCRIPT[character]).join('');

/** Plain text mathematics ("(81t⁴u⁻¹²)^(−3/4)", "3√3", "x² − 4") as a mathjs expression. */
export const toMathjs = (plain) => {
  let out = String(plain).replace(/−/g, '-').replace(/·|×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  // Roots first, while an index is still a superscript: ⁿ√(…), ⁿ√x, √, ∛, ∜.
  out = out.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)√|∛|∜/g, (match, index) => `Ω${match === '∛' ? 3 : match === '∜' ? 4 : index ? sup(index) : 2}Ω`);
  out = out.replace(/Ω(\d+)Ω(\(([^()]*)\)|[a-z0-9]+)/g, (match, index, whole, inner) => `Ρ(${inner ?? whole},${index})`);
  // A rational power: realPow(base, p, q), the base a bracket, a letter or a number.
  out = out.replace(/(\([^()]*\)|[a-z]|\d+)\^\((-?\d+)\/(\d+)\)/g, (match, base, p, q) => `Π(${base},${p},${q})`);
  out = out.replace(/\^\((-?\d+)\)/g, '^($1)');
  // Whole powers as superscripts.
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${sup(run)})`);
  // Letters side by side multiply; so does a letter or a bracket before a bracket or a function.
  out = out.replace(/([a-z0-9)])(?=[a-zΡΠ(])/g, '$1*').replace(/([a-z])(?=[0-9])/g, '$1*');
  return out.replace(/Ρ/g, 'realRoot').replace(/Π/g, 'realPow');
};

const lettersOf = (expression) => [...new Set((String(expression).match(/[a-z]/g) || []))];
const agree = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Deterministic draws: no flake, the same points every run.
let state = 7;
const random = () => {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state / 2147483648;
};
const valueFor = (assume) => {
  const size = 0.4 + random() * 2.6;
  return assume === 'positive' ? size : random() < 0.5 ? -size : size;
};

// Every item a WE-I family claims, in every section, as QuestionEngine receives it.
const CLAIMED = lessonFiles(ROOT).flatMap((file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')));
  return (compiled?.package?.sections || []).flatMap((section) => (section.questions || []).map((raw) => {
    try { return asQuestionEngineReceivesIt(raw); } catch { return null; }
  })).filter((question) => question && FAMILIES.has(familyFor(question)?.family));
});

test('the converter reads the generators\' plain mathematics the way it is meant', () => {
  const at = (plain, scope) => math.evaluate(toMathjs(plain), scope);
  assert.ok(agree(at('(81t⁴u⁻¹²)^(−3/4)', { t: 1, u: 2 }), 2 ** 9 / 27));
  assert.ok(agree(at('u⁹/(27t³)', { t: 1, u: 2 }), 2 ** 9 / 27));
  assert.ok(agree(at('3√3', {}), 3 * Math.sqrt(3)));
  assert.ok(agree(at('⁵√(−32)', {}), -2));
  assert.ok(agree(at('(−128)^(5/7)', {}), -32));
  assert.ok(agree(at('2xy + 6y', { x: 2, y: 3 }), 30));
  assert.ok(agree(at('(x − 2)(x + 3)', { x: 5 }), 24));
  assert.ok(agree(at('(x − (1/2))(2x²) + (3)', { x: 1 }), 4));
  // The finding itself: false for a negative u, true for positive values.
  assert.ok(!agree(at('(81t⁴u⁻¹²)^(−3/4)', { t: 1, u: -1 }), at('u⁹/(27t³)', { t: 1, u: -1 })));
});

test('over every real item and seeds 0 to 20, each sibling\'s starting expression and stated answer agree wherever its stated assumption holds', () => {
  assert.ok(CLAIMED.length >= 60, `${CLAIMED.length} items`);
  let siblings = 0;
  let checks = 0;
  const problems = [];
  for (const question of CLAIMED) {
    const family = familyFor(question);
    for (const seed of SEEDS) {
      const sibling = family.similarProblem(question, { seed });
      if (!sibling) continue;
      siblings += 1;
      const identities = Array.isArray(sibling.identities) ? sibling.identities : null;
      assert.ok(identities, `${question.questionId} seed ${seed}: the sibling names what it states`);
      // Only a list of possible rational zeros states no expression equal to another.
      if (!/possible rational zeros of/.test(sibling.prompt)) assert.ok(identities.length > 0, `${question.questionId} seed ${seed}: ${sibling.prompt}`);
      // A sibling that needs positive values says so, in its prompt.
      const positive = identities.some((entry) => entry.assume === 'positive' && lettersOf(`${entry.start} ${entry.answer}`).length);
      if (positive) assert.match(sibling.prompt, /Assume all variables are positive\./, `${question.questionId} seed ${seed}`);
      for (const entry of identities) {
        let start;
        let answer;
        try {
          start = toMathjs(entry.start);
          answer = toMathjs(entry.answer);
        } catch (error) {
          problems.push(`${question.questionId} seed ${seed}: cannot read ${entry.start} = ${entry.answer}`);
          continue;
        }
        const letters = lettersOf(`${entry.start} ${entry.answer}`);
        for (let point = 0; point < 5; point += 1) {
          const scope = Object.fromEntries(letters.map((letter) => [letter, valueFor(entry.assume)]));
          Object.assign(scope, entry.values || {});
          const left = math.evaluate(start, scope);
          const right = math.evaluate(answer, scope);
          checks += 1;
          if (!agree(Number(left), Number(right))) {
            problems.push(`${question.questionId} seed ${seed}: ${entry.start} = ${entry.answer} (${entry.assume}) at ${JSON.stringify(scope)}: ${left} vs ${right}`);
            break;
          }
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
  assert.ok(siblings >= 600, `${siblings} siblings`);
  assert.ok(checks >= 5000, `${checks} checks`);
});

test('a sibling that needs positive values is not played for an item that asks for negative ones', async () => {
  const { similarProblem } = await import('../../src/platform/supports/families/algebra2AnswerBoxes.js');
  const item = CLAIMED.find((question) => question.questionId === 'reh-cw-1');
  assert.ok(item, 'the item Codex named');
  const sibling = similarProblem(item, { seed: 0 });
  assert.ok(sibling && sibling.assume === 'positive' && /Assume all variables are positive\./.test(sibling.prompt), sibling?.prompt);
  // The same item, if its prompt let the variables be negative: an even root's rule would be false for it.
  const negative = { ...item, prompt: `${item.prompt} Assume the variables may be negative.` };
  assert.equal(similarProblem(negative, { seed: 0 }), null);
});
