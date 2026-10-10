import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { buildInverseCompositionLabReview } from '../../src/tools/shared/reviews/inverseCompositionLabReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * EVERY STEP OF THE INVERSE WORKED SOLUTION IS TRUE AS WRITTEN.
 *
 * The inverse part undoes f one move at a time ("undo the + 3: 6.162 − 3 ≈
 * 3.162; …"). Each move is recomputed here with mathjs from the numbers the
 * step itself shows, and f⁻¹ is written out by hand per family — nothing from
 * the module under test. A move written "=" must be exactly true; one written
 * "≈" must be what its shown, rounded input gives. Two ways that failed:
 *
 *   - a rounded value carried into an exact result: "1.732² = 3" (2.999824);
 *   - a value rounded too hard to lead on: "log_5(0.004) ≈ −3.5" (−3.43).
 *
 * And a closing "f⁻¹(6.162) = 10" is false — f⁻¹(6.162) = 9.998244 — when
 * 6.162 is f(10) rounded.
 */

const math = create(all);
const TOOL_ID = 'inverseCompositionLab';
const q = (fields) => ({ type: TOOL_ID, ...fields });

// The shown text as mathjs reads it.
const toMath = (text) => text
  .replace(/−/g, '-').replace(/÷/g, '/').replace(/·/g, '*').replace(/²/g, '^2')
  .replace(/log_([\d.]+)\(([^()]*)\)/g, 'log($2, $1)')
  .replace(/√\(/g, 'sqrt(').replace(/√([\d.]+)/g, 'sqrt($1)');

// f⁻¹ by hand for each invertible family the lab draws.
const handInverse = (f, y) => {
  const { a = 1, h = 0, k = 0, base = 2 } = f;
  const t = (y - k) / a;
  switch (f.type) {
    case 'linear': return t + h;
    case 'quadratic': return h + ((f.inverseBranch === 'left' || f.domain?.max === h) ? -1 : 1) * Math.sqrt(t);
    case 'squareRoot': return t ** 2 + h;
    case 'exponential': return Math.log(t) / Math.log(base) + h;
    case 'logarithmic': return base ** t + h;
    default: return Number.NaN;
  }
};

// Every claim the inverse steps make, checked; returns the claims it read.
const inverseClaims = (question, review) => {
  const claims = [];
  // "f sends the input 2.25 to f(2.25) = 10^(2.25 + 2) − 4 ≈ 17778.794, so …"
  const sends = review.steps.find((step) => step.startsWith('f sends the input'));
  const evaluated = sends?.match(/ to f\([^()]*\) = (.+?) (=|≈) (\S+), so /);
  if (evaluated) {
    const [, work, relation, result] = evaluated;
    const left = math.evaluate(toMath(work));
    const right = math.evaluate(toMath(result));
    const tolerance = relation === '=' ? 1e-12 : 0.0005;
    assert.ok(Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(right)), `${work} ${relation} ${result} (${work} is ${left})`);
    claims.push(sends);
  }
  const undo = review.steps.find((step) => step.startsWith('To find f⁻¹('));
  if (undo) {
    const moves = undo.slice(undo.indexOf(' — ') + 3, undo.lastIndexOf('. So ')).split('; ');
    for (const move of moves) {
      const [, work, relation, result] = move.match(/: (.+) (=|≈) (\S+)$/);
      const left = math.evaluate(toMath(work));
      const right = math.evaluate(toMath(result));
      const tolerance = relation === '=' ? 1e-12 : 0.005;
      assert.ok(Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(right)), `${move} (${work} is ${left})`);
      claims.push(move);
    }
  }
  const x = Number(question.x);
  for (const [, argument] of [...review.steps, review.why].join(' ').matchAll(/f⁻¹\(([^()]*(?:\([^()]*\))?)\) = (\S+?),/g)) {
    if (/^f\(/.test(argument)) continue;
    // A number stated as f⁻¹'s input is exactly the one that goes back to x.
    const value = handInverse(question.f, math.evaluate(toMath(argument)));
    assert.ok(Math.abs(value - x) <= 1e-12 * Math.max(1, Math.abs(x)), `f⁻¹(${argument}) is ${value}, not ${x}`);
    claims.push(argument);
  }
  return claims;
};

// The work a student following the review submits, graded by the shared grader.
const accepted = (question, review) => {
  const work = { x: question.x, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: '' };
  for (const { label, value } of review.items) {
    const typed = value.split('≈').pop().trim().replace(/−/g, '-');
    if (label.startsWith('(f ∘ g)')) work.fogAnswer = typed;
    else if (label.startsWith('(g ∘ f)')) work.gofAnswer = typed;
    else if (label.startsWith('f⁻¹(')) work.inverseAnswer = typed;
    else if (label === 'Domain restriction') work.restrictionChoice = value.startsWith('No') ? 'none' : value.includes('left') ? 'left' : 'right';
  }
  return gradeToolWork({ toolId: TOOL_ID, question, work }).isCorrect === true;
};

test('f(x) = √x + 3 at x = 10: the rounded square is "≈", and f⁻¹ is named on f(10), not on 6.162', () => {
  const question = q({ mode: 'inverse', f: { type: 'squareRoot', a: 1, h: 0, k: 3 }, x: 10 });
  const review = buildInverseCompositionLabReview(question);
  assert.ok(review, 'a review');
  // f(10) = √10 + 3 = 6.16227…; 6.162 − 3 = 3.162; 3.162² = 9.998244, not 10.
  assert.ok(inverseClaims(question, review).some((claim) => claim.includes('3.162²')));
  assert.ok(review.steps.some((step) => step.includes('So f⁻¹(f(10)) = 10')));
  assert.ok(accepted(question, review));
});

test('f(x) = √x at x = 3 and a left-branch parabola: each undo move is true as written', () => {
  // √3 ≈ 1.732, and 1.732² = 2.999824.
  const root = q({ mode: 'inverse', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, x: 3 });
  // f(x) = −0.5(x + 2)² + 3 at x = −4: f(−4) = 1; 1 − 3 = −2; −2 ÷ (−0.5) = 4; −√4 = −2; −2 − 2 = −4.
  const parabola = q({ mode: 'restriction', f: { type: 'quadratic', a: -0.5, h: -2, k: 3, inverseBranch: 'left' }, x: -4 });
  for (const question of [root, parabola]) {
    const review = buildInverseCompositionLabReview(question);
    assert.ok(review, JSON.stringify(question));
    assert.ok(inverseClaims(question, review).length >= 1);
    assert.ok(accepted(question, review));
  }
});

test('a value rounded too hard to undo from gives no review, not a false step', () => {
  // f(x) = 2·5^(x − 0.5) at x = −3: f(−3) = 2·5^(−3.5) = 0.00716; ÷ 2 = 0.00358,
  // shown 0.004 — and log_5(0.004) = −3.43, which does not lead back to −3.
  const question = q({ mode: 'inverse', f: { type: 'exponential', a: 2, h: 0.5, k: 0, base: 5 }, x: -3 });
  assert.ok(Math.abs(math.evaluate('log(0.004, 5)') - -3.5) > 0.05);
  assert.equal(buildInverseCompositionLabReview(question), null);
});

test('an irrational f(x) is never written as an exact fraction', () => {
  // f(x) = 10^(x + 2) − 4 at x = 2.25: 10^4.25 − 4 = 17778.794…, irrational;
  // it was written "= 604479/34" (= 17778.79411…), and log_10 of the next
  // "fraction" "= 4.25".
  const question = q({ mode: 'restriction', f: { type: 'exponential', a: 1, h: -2, k: -4, base: 10 }, x: 2.25 });
  const review = buildInverseCompositionLabReview(question);
  assert.ok(review, 'a review');
  assert.ok(inverseClaims(question, review).length >= 3);
  assert.doesNotMatch(review.steps.join(' '), /\d{4,}\/\d+/);
  assert.ok(accepted(question, review));
  // A large value: f(x) = 3·2^x at x = 24.5 is 3·2^24.5 = 71179699.218…,
  // irrational, and within 1e-13 of 3914883457/55 — sixty-fourths sit closer
  // together there than any tolerance can tell apart.
  const large = q({ mode: 'inverse', f: { type: 'exponential', a: 3, h: 0, k: 0, base: 2 }, x: 24.5 });
  const largeReview = buildInverseCompositionLabReview(large);
  assert.ok(largeReview, 'a review');
  assert.ok(inverseClaims(large, largeReview).length >= 3);
  assert.doesNotMatch(largeReview.steps.join(' '), /\d{4,}\/\d+/);
  assert.ok(accepted(large, largeReview));
});

// "g(−18) = 0.25·4^(−18 + 1) + 1 ≈ 1": each composition step, recomputed from
// the arithmetic it shows; returns how many it read.
const compositionClaims = (review) => {
  let read = 0;
  for (const step of review.steps.filter((text) => /^(For|Then) /.test(text))) {
    const [, work, relation, result] = step.match(/: [fg]\([^()]*\) = ([^,]+?) (=|≈) (\S+?)(?:, so |\.$)/) || [];
    if (!work) continue;
    const left = math.evaluate(toMath(work).replace(/\|([^|]*)\|/g, 'abs($1)').replace(/³/g, '^3'));
    const right = math.evaluate(toMath(result));
    // A step worked from a rounded middle value lands within 0.5%.
    const tolerance = relation === '=' ? 1e-12 : 0.005;
    assert.ok(Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(right)), `${step} (${work} is ${left})`);
    read += 1;
  }
  return read;
};

test('a composition value a hair from a round number is "≈", not "="', () => {
  // f(x) = −2(x + 2), g(x) = 0.25·4^(x + 1) + 1, x = 7: f(7) = −18,
  // g(−18) = 0.25·4^(−17) + 1 = 1 + 4^(−18) = 1.0000000000146 — not 1.
  const question = q({ mode: 'composition', f: { type: 'linear', a: -2, h: -2, k: 0 }, g: { type: 'exponential', a: 0.25, h: -1, k: 1, base: 4 }, x: 7 });
  const review = buildInverseCompositionLabReview(question);
  assert.ok(review, 'a review');
  assert.equal(compositionClaims(review), 4);
  assert.ok(accepted(question, review));
  // f(x) = −10^(x − 1) − 1, g(x) = 0.5(x + 1)³ − 4, x = −2: f(−2) = −1.001 exactly,
  // and g(−1.001) = 0.5(−0.001)³ − 4 = −4.0000000005.
  const cubic = q({ mode: 'composition', f: { type: 'exponential', a: -1, h: 1, k: -1, base: 10 }, g: { type: 'cubic', a: 0.5, h: -1, k: -4 }, x: -2 });
  const cubicReview = buildInverseCompositionLabReview(cubic);
  assert.ok(cubicReview, 'a review');
  assert.equal(compositionClaims(cubicReview), 4);
  assert.ok(accepted(cubic, cubicReview));
});

test('a composition worked from a rounded value that does not lead to the result gives no review', () => {
  // g(x) = √x + 1 at x = 0.000003 is 1.00173…, shown 1.002; f(x) = 1/(x − 1) + 2
  // gives 579.35 from 1.00173 but 1/0.002 + 2 = 502 from the 1.002 shown.
  assert.ok(Math.abs(math.evaluate('1/(1.002 - 1) + 2') - 502) < 1e-9);
  const question = q({ mode: 'composition', f: { type: 'rational', a: 1, h: 1, k: 2 }, g: { type: 'squareRoot', a: 1, h: 0, k: 1 }, x: 0.000003 });
  assert.equal(buildInverseCompositionLabReview(question), null);
});

test('over seeded draws, every review states only true steps and an answer the grader accepts', () => {
  let state = 20261010;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const pick = (values) => values[Math.floor(random() * values.length)];
  let reviewed = 0;
  let claims = 0;
  for (let i = 0; i < 600; i += 1) {
    const type = pick(['linear', 'quadratic', 'squareRoot', 'exponential', 'logarithmic']);
    const f = { type, a: pick([1, -1, 2, -2, 0.5, -0.5, 3, -1.5, 0.25]), h: pick([0, 1, -1, 2, -2, 0.5]), k: pick([0, 1, -1, 3, -4, 0.5, 2.5]) };
    if (type === 'exponential' || type === 'logarithmic') f.base = pick([2, 3, 10, 0.5, 5]);
    if (type === 'quadratic') f.inverseBranch = pick(['left', 'right']);
    const mode = pick(['inverse', 'restriction', 'full']);
    const g = { type: pick(['linear', 'exponential', 'cubic', 'absolute']), a: pick([1, -2, 0.5, 0.25]), h: pick([0, 1, -1]), k: pick([0, 1, -4]), base: pick([2, 4, 10]) };
    const question = q({ mode, f, ...(mode === 'full' ? { g } : {}), x: pick([0, 1, 2, -1, -2, 3, 5, -3, 0.5, 1.5, 10, 2.25, 7]) });
    const review = buildInverseCompositionLabReview(question);
    if (!review) continue;
    reviewed += 1;
    claims += inverseClaims(question, review).length + compositionClaims(review);
    assert.ok(accepted(question, review), JSON.stringify(question));
  }
  assert.ok(reviewed > 200, `the draws reach reviews (${reviewed})`);
  assert.ok(claims > reviewed, `and read their steps (${claims})`);
});

/*
 * "=" MEANS EXACTLY EQUAL — CHECKED TO 120 DIGITS, NOT TO A DOUBLE.
 *
 * A double cannot tell 0.5·3^25.5 + 10 (irrational) from 733773460124.8296,
 * or 10 − 0.25^27 from 10, so the checks above (to 1e-12) pass them. Here
 * every "=" a step writes is recomputed with mathjs BigNumbers.
 */
const exactMath = create(all, { number: 'BigNumber', precision: 120 });
const forExact = (text) => toMath(text).replace(/³/g, '^3').replace(/\|([^|]*)\|/g, 'abs($1)');
const isExactly = (work, result) => {
  const left = exactMath.evaluate(forExact(work));
  const right = exactMath.evaluate(forExact(result));
  // Decimal's own comparison: mathjs's `smaller` allows a relative 1e-12.
  return left.minus(right).abs().lt(right.abs().plus(1).times('1e-90'));
};
// Every "work = result" and "work ≈ result" the arithmetic steps write, as
// [work, relation, result] — not the labels ("f(x) = …"), which name x.
const writtenClaims = (review) => {
  const claims = [];
  for (const step of review.steps) {
    for (const [, work, relation, result] of step.matchAll(/[fg]\([^()x]*\) = ([^,;]+?) (=|≈) ([^\s,;]+?)(?=[,;.]?(?:\s|$))/g)) claims.push([work, relation, result]);
    if (step.startsWith('To find')) {
      for (const move of step.slice(step.indexOf(' — ') + 3, step.lastIndexOf('. So ')).split('; ')) {
        const [, work, relation, result] = move.match(/: (.+) (=|≈) (\S+)$/);
        claims.push([work, relation, result]);
      }
    }
  }
  return claims;
};
test('a value that only rounds to a number is written "≈", never "="', () => {
  // f(x) = 0.5·3^(x + 0.5) + 10, g(x) = −0.2(x − 1)³, x = −4: g(−4) = 25, and
  // f(25) = 0.5·3^25.5 + 10 is irrational (3^25.5 = 3^25·√3).
  const irrational = q({ mode: 'full', f: { type: 'exponential', a: 0.5, h: -0.5, k: 10, base: 3 }, g: { type: 'cubic', a: -0.2, h: 1, k: 0 }, x: -4 });
  // g(x) = −0.25·0.25^(x − 1) + 10 at x = 27: 10 − 0.25^27, not 10.
  const hair = q({ mode: 'composition', f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'exponential', a: -0.25, h: 1, k: 10, base: 0.25 }, x: 27 });
  // g(x) = 3·0.25^(x − 1) − 1.25 at f(3) = 2·4³ + 2.5 = 130.5: −1.25 + 3·0.25^129.5, not −1.25.
  const tiny = q({ mode: 'full', f: { type: 'exponential', a: 2, h: 0, k: 2.5, base: 4 }, g: { type: 'exponential', a: 3, h: 1, k: -1.25, base: 0.25 }, x: 3 });
  for (const question of [irrational, hair, tiny]) {
    const review = buildInverseCompositionLabReview(question);
    assert.ok(review, JSON.stringify(question));
    const claims = writtenClaims(review);
    assert.ok(claims.length >= 2);
    for (const [work, relation, result] of claims) {
      if (relation === '=') assert.ok(isExactly(work, result), `${work} = ${result} is not exact`);
    }
    // The rounded composition is stated "≈" too.
    assert.doesNotMatch(review.steps.join(' '), /so \([fg] ∘ [fg]\)\([^()]*\) = /, JSON.stringify(question));
    assert.ok(accepted(question, review));
  }
});

test('an exact value is still "=" though the value before it was rounded', () => {
  // 2^(log_2 3) = 3 exactly, though log_2 3 ≈ 1.585 is irrational.
  const pair = q({ mode: 'full', f: { type: 'exponential', a: 1, h: 0, k: 0, base: 2 }, g: { type: 'logarithmic', a: 1, h: 0, k: 0, base: 2 }, x: 3 });
  assert.match(buildInverseCompositionLabReview(pair).steps.join(' '), /so \(f ∘ g\)\(3\) = 3\./);
  // f(2.25) = −0.5·1.25³ + 1 = 3/128 (shown ≈ 0.023), and 4(3/128 + 2) + 3 = 355/32.
  const fraction = q({ mode: 'composition', f: { type: 'cubic', a: -0.5, h: 1, k: 1 }, g: { type: 'linear', a: 4, h: -2, k: 3 }, x: 2.25 });
  assert.ok(isExactly('4(3/128 + 2) + 3', '355/32'));
  assert.match(buildInverseCompositionLabReview(fraction).steps.join(' '), /so \(g ∘ f\)\(2\.25\) = 355\/32\./);
  // f(x) = −2√(x + 1) + 10 at 27: undone, 5.292² ≈ 28 — but that 28 is exactly 27 + 1, so 28 − 1 = 27.
  const root = q({ mode: 'restriction', f: { type: 'squareRoot', a: -2, h: -1, k: 10 }, x: 27 });
  assert.match(buildInverseCompositionLabReview(root).steps.join(' '), /28 − 1 = 27\./);
});

test('over seeded draws, no step writes "=" for a value that is not exactly equal', () => {
  let state = 5;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const pick = (values) => values[Math.floor(random() * values.length)];
  const types = ['linear', 'quadratic', 'squareRoot', 'exponential', 'logarithmic', 'cubic', 'absolute', 'rational'];
  const draw = (invertible) => {
    const type = pick(invertible ? types.slice(0, 5) : types);
    const f = { type, a: pick([1, -1, 2, -2, 0.5, -0.5, 3, -1.5, 0.25, 0.2, -0.2, 4]), h: pick([0, 1, -1, 2, -2, 0.5, -0.5, 3]), k: pick([0, 1, -1, 3, -4, 0.5, 2.5, 10, -1.25]) };
    if (type === 'exponential' || type === 'logarithmic') f.base = pick([2, 3, 10, 0.5, 5, 4, 0.25]);
    if (type === 'quadratic') f.inverseBranch = pick(['left', 'right']);
    return f;
  };
  let equalities = 0;
  for (let i = 0; i < 1500; i += 1) {
    const mode = pick(['inverse', 'restriction', 'full', 'composition']);
    const question = q({ mode, f: draw(mode !== 'composition'), g: draw(false), x: pick([0, 1, 2, -1, -2, 3, 5, -3, 0.5, 1.5, 10, 2.25, 7, -4, 25, 27, 0.25, -0.5, 8, 9, 16, 100, 58.84, -27.5]) });
    const review = buildInverseCompositionLabReview(question);
    if (!review) continue;
    for (const [work, relation, result] of writtenClaims(review)) {
      if (relation !== '=') continue;
      equalities += 1;
      assert.ok(isExactly(work, result), `${JSON.stringify(question)}: ${work} = ${result}`);
    }
  }
  assert.ok(equalities > 1000, `the draws read their equalities (${equalities})`);
});
