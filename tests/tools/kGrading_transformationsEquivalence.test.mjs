import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  descriptionDrawsSameFunction,
  describedTransformationSpec,
  sameTransformedFunction,
} from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';

/*
 * JOB K, DEFECT 2e — TRANSFORMATIONS LAB IDENTIFY / DESCRIBE.
 *
 * The student sees a graph. y = a·f(b(x − h)) + k does not always fix a, b,
 * h, k (2·2^(x−1) is 2^x, |2x| is 2|x|, a line's h and k slide along it,
 * log(2x) is log x + 1), yet identify marked only the question's own set.
 * Every parameter set that draws the same function is now right, and a
 * different graph is still wrong.
 *
 * The oracle here never uses the module under test: each function is written
 * out as a mathjs expression and sampled, and the alternative parameter sets
 * are derived by hand in the comments beside them.
 */

const math = create(all);
const TOOL_ID = 'transformationsLab';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const identify = (family, fn, extra = {}) => ({ type: TOOL_ID, questionId: 'k-2e', mode: 'identify', family, function: { type: family, ...fn }, ...extra });
const boxes = (spec, withB) => Object.fromEntries((withB ? ['a', 'b', 'h', 'k'] : ['a', 'h', 'k']).map((key) => [key, String(spec[key])]));

// y = a·f(b(x − h)) + k, written out for mathjs.
const PARENTS = {
  linear: (u) => `(${u})`,
  quadratic: (u) => `(${u})^2`,
  absolute: (u) => `abs(${u})`,
  cubic: (u) => `(${u})^3`,
  cubeRoot: (u) => `cbrt(${u})`,
  squareRoot: (u) => `sqrt(${u})`,
  exponential: (u, base) => `(${base})^(${u})`,
  logarithmic: (u, base) => `log(${u}, ${base})`,
  rational: (u) => `1/(${u})`,
};
const expression = (type, { a, b = 1, h, k, base = 2 }) => `(${a}) * ${PARENTS[type](`(${b}) * (x - (${h}))`, base)} + (${k})`;
const SAMPLES = Array.from({ length: 121 }, (_, index) => -12.05 + index * 0.2);
const samplesOf = (type, spec) => {
  const compiled = math.compile(expression(type, spec));
  return SAMPLES.map((x) => {
    let value;
    try { value = compiled.evaluate({ x }); } catch { value = Number.NaN; }
    return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  });
};
// Same function: the same domain among the samples and the same values on it.
const sameSamples = (left, right) => left.every((value, index) => (Number.isNaN(value)
  ? Number.isNaN(right[index])
  : !Number.isNaN(right[index]) && Math.abs(value - right[index]) <= 1e-9 * Math.max(1, Math.abs(value))));
const oracleSame = (type, student, target) => sameSamples(samplesOf(type, student), samplesOf(type, target));

/* ------------------------------------------------------------------ */
/* identify: the alternative parameter sets, family by family          */
/* ------------------------------------------------------------------ */

// [family, the question's function, whether the lab shows a b box,
//  sets that draw the same graph (derived by hand), near misses]
const CASES = [
  // 2·2^(x−1) − 3 = 2^x − 3 = 4·2^(x−2) − 3; 2^(x+1) is 2·2^x.
  ['exponential', { a: 2, h: 1, k: -3, base: 2 }, false,
    [{ a: 1, h: 0, k: -3 }, { a: 4, h: 2, k: -3 }, { a: 0.5, h: -1, k: -3 }],
    [{ a: 1.05, h: 0, k: -3 }, { a: 1, h: 0, k: -2.9 }, { a: 2, h: 0, k: -3 }]],
  // 3·3^(x−1) + 1 = 3^x + 1.
  ['exponential', { a: 3, h: 1, k: 1, base: 3 }, false,
    [{ a: 1, h: 0, k: 1 }, { a: 9, h: 2, k: 1 }],
    [{ a: 1, h: 0.1, k: 1 }]],
  // b box: 2^(2(x−1)) = 2^(2x)/4 = 4·2^(2(x−2)).
  ['exponential', { a: 1, b: 2, h: 1, k: 0, base: 2 }, true,
    [{ a: 0.25, b: 2, h: 0, k: 0 }, { a: 4, b: 2, h: 2, k: 0 }],
    [{ a: 0.25, b: 1, h: 0, k: 0 }, { a: 1, b: 2, h: 0, k: 0 }]],
  // 2(x − 1) + 3 = 2x + 1 = 2(x − 2) + 5 = 2(x + 0.5) + 0.
  ['linear', { a: 2, h: 1, k: 3 }, false,
    [{ a: 2, h: 0, k: 1 }, { a: 2, h: 2, k: 5 }, { a: 2, h: -0.5, k: 0 }],
    [{ a: 2, h: 0, k: 1.05 }, { a: 2.05, h: 0, k: 1 }, { a: -2, h: 1, k: 3 }]],
  // b box: 1·2(x − 1) = 2(x − 1) = −2(−(x − 1)).
  ['linear', { a: 1, b: 2, h: 1, k: 0 }, true,
    [{ a: 2, b: 1, h: 1, k: 0 }, { a: -2, b: -1, h: 1, k: 0 }, { a: 4, b: 0.5, h: 0, k: -2 }],
    [{ a: 2, b: 2, h: 1, k: 0 }]],
  // |2(x − 1)| + 3 = 2|x − 1| + 3 = 2|−(x − 1)| + 3.
  ['absolute', { a: 1, b: 2, h: 1, k: 3 }, true,
    [{ a: 2, b: 1, h: 1, k: 3 }, { a: 2, b: -1, h: 1, k: 3 }, { a: 1, b: -2, h: 1, k: 3 }, { a: 4, b: 0.5, h: 1, k: 3 }],
    [{ a: -2, b: -1, h: 1, k: 3 }, { a: 2.05, b: 1, h: 1, k: 3 }, { a: 2, b: 1, h: 1.1, k: 3 }]],
  // (2(x − 1))² = 4(x − 1)² = 4(−(x − 1))².
  ['quadratic', { a: 1, b: 2, h: 1, k: 0 }, true,
    [{ a: 4, b: 1, h: 1, k: 0 }, { a: 4, b: -1, h: 1, k: 0 }, { a: 1, b: -2, h: 1, k: 0 }, { a: 16, b: 0.5, h: 1, k: 0 }],
    [{ a: 2, b: 1, h: 1, k: 0 }, { a: 4.1, b: 1, h: 1, k: 0 }, { a: -4, b: 1, h: 1, k: 0 }]],
  // (2x)³ = 8x³ = −8(−x)³.
  ['cubic', { a: 1, b: 2, h: 0, k: -1 }, true,
    [{ a: 8, b: 1, h: 0, k: -1 }, { a: -8, b: -1, h: 0, k: -1 }, { a: -1, b: -2, h: 0, k: -1 }],
    [{ a: 8, b: -1, h: 0, k: -1 }, { a: 4, b: 1, h: 0, k: -1 }]],
  // ∛(8(x + 2)) = 2∛(x + 2) = −2∛(−(x + 2)).
  ['cubeRoot', { a: 1, b: 8, h: -2, k: 0 }, true,
    [{ a: 2, b: 1, h: -2, k: 0 }, { a: -2, b: -1, h: -2, k: 0 }],
    [{ a: 2, b: -1, h: -2, k: 0 }, { a: 8, b: 1, h: -2, k: 0 }]],
  // √(4(x − 1)) = 2√(x − 1); √(−4(x − 1)) is the mirror image, not the same graph.
  ['squareRoot', { a: 1, b: 4, h: 1, k: 2 }, true,
    [{ a: 2, b: 1, h: 1, k: 2 }, { a: 0.5, b: 16, h: 1, k: 2 }],
    [{ a: 2, b: -1, h: 1, k: 2 }, { a: 1, b: -4, h: 1, k: 2 }, { a: 2, b: 1, h: 1.5, k: 2 }]],
  // 6/(2(x − 1)) = 3/(x − 1) = −3/(−(x − 1)).
  ['rational', { a: 6, b: 2, h: 1, k: 0 }, true,
    [{ a: 3, b: 1, h: 1, k: 0 }, { a: -3, b: -1, h: 1, k: 0 }, { a: 1.5, b: 0.5, h: 1, k: 0 }],
    [{ a: 3, b: -1, h: 1, k: 0 }, { a: 6, b: 1, h: 1, k: 0 }]],
  // log₂(2x) = log₂x + 1; 2·log₂(4(x − 1)) = 2·log₂(x − 1) + 4.
  ['logarithmic', { a: 1, b: 2, h: 0, k: 0, base: 2 }, true,
    [{ a: 1, b: 1, h: 0, k: 1 }, { a: 1, b: 4, h: 0, k: -1 }],
    [{ a: 1, b: 1, h: 0, k: 1.05 }, { a: 1, b: -2, h: 0, k: 0 }, { a: 2, b: 1, h: 0, k: 0 }]],
  ['logarithmic', { a: 2, b: 4, h: 1, k: 1, base: 2 }, true,
    [{ a: 2, b: 1, h: 1, k: 5 }, { a: 2, b: 2, h: 1, k: 3 }],
    [{ a: 2, b: 1, h: 1, k: 1 }]],
];

test('identify: every parameter set that draws the graph is right, in every family with the ambiguity', () => {
  for (const [family, fn, withB, alternatives] of CASES) {
    const question = identify(family, fn);
    const base = fn.base ?? 2;
    for (const alternative of alternatives) {
      const label = `${family} ${JSON.stringify(fn)} as ${JSON.stringify(alternative)}`;
      assert.ok(oracleSame(family, { ...alternative, base }, fn), `${label}: the hand derivation is the same function`);
      const result = grade(question, boxes(alternative, withB));
      assert.equal(result.graded, true, label);
      assert.equal(result.mode, 'identify', label);
      assert.equal(result.isCorrect, true, `${label}: marked right`);
      assert.equal(result.score, 1, `${label}: full score`);
      assert.ok(result.parts.every((part) => part.isCorrect), `${label}: every parameter part is right`);
    }
    // The question's own set is still right.
    assert.equal(grade(question, boxes({ b: 1, ...fn }, withB)).isCorrect, true, `${family}: its own parameters`);
  }
});

test('identify: a near-miss graph is still wrong, with the same partial credit as before', () => {
  for (const [family, fn, withB, , nearMisses] of CASES) {
    const question = identify(family, fn);
    const base = fn.base ?? 2;
    const own = { b: 1, ...fn };
    for (const miss of nearMisses) {
      const label = `${family} ${JSON.stringify(fn)} vs ${JSON.stringify(miss)}`;
      assert.equal(oracleSame(family, { ...miss, base }, fn), false, `${label}: really a different graph`);
      const result = grade(question, boxes(miss, withB));
      assert.equal(result.isCorrect, false, `${label}: marked wrong`);
      // Credit is still the share of the question's own parameters matched (to 0.01).
      const matched = ['a', 'b', 'h', 'k'].filter((key) => Math.abs(Number(miss[key] ?? 1) - own[key]) <= 0.01).length;
      assert.equal(result.score, matched / 4, `${label}: per-parameter credit`);
    }
  }
});

test('identify: an item whose graph fixes a, h, k is graded exactly as before', () => {
  // y = −0.5(x − 2)² − 1 with no b box: only its own a, h, k (to 0.01) draw it.
  const question = identify('quadratic', { a: -0.5, h: 2, k: -1 });
  const own = { a: -0.5, h: 2, k: -1 };
  const grid = [-0.5, -0.505, -0.52, 0.5, 2, 2.008, 1.98, -2, -1, -1.009, 1, 0];
  let checked = 0;
  for (const a of grid) for (const h of grid) for (const k of grid) {
    const result = grade(question, { a: String(a), h: String(h), k: String(k) });
    const checks = [Math.abs(a - own.a) <= 0.01, true, Math.abs(h - own.h) <= 0.01, Math.abs(k - own.k) <= 0.01];
    assert.equal(result.isCorrect, checks.every(Boolean), `${a}, ${h}, ${k}`);
    assert.equal(result.score, checks.filter(Boolean).length / 4, `${a}, ${h}, ${k}: score`);
    checked += 1;
  }
  assert.equal(checked, grid.length ** 3);
});

/* ------------------------------------------------------------------ */
/* the equivalence itself, against the sampled oracle                   */
/* ------------------------------------------------------------------ */

test('sameTransformedFunction agrees with the sampled functions on every pair of a dense grid', () => {
  const A = [1, -1, 2, -2, 4, -4, 0.5, -0.5];
  const B = [1, -1, 2, -2, 0.5, -0.5];
  const HK = [-1, 0, 1, 2];
  for (const family of Object.keys(PARENTS)) {
    const specs = [];
    for (const a of A) for (const b of B) for (const h of HK) for (const k of HK) specs.push({ a, b, h, k, base: 2 });
    const sampled = specs.map((spec) => samplesOf(family, spec));
    let alternatives = 0;
    let different = 0;
    // Every 19th spec as the target, against the whole grid.
    for (let t = 0; t < specs.length; t += 19) {
      const target = { type: family, ...specs[t] };
      for (let s = 0; s < specs.length; s += 1) {
        const expected = sameSamples(sampled[s], sampled[t]);
        const label = `${family}: ${JSON.stringify(specs[s])} vs ${JSON.stringify(specs[t])}`;
        assert.equal(sameTransformedFunction(specs[s], target, 1e-6), expected, label);
        // At the grader's 0.01 too: the grid's near misses are far wider than that.
        assert.equal(sameTransformedFunction(specs[s], target, 0.01), expected, `${label} at 0.01`);
        if (expected && s !== t) alternatives += 1;
        if (!expected) different += 1;
      }
    }
    assert.ok(alternatives > 0, `${family}: the grid reaches other parameter sets of the same graph`);
    assert.ok(different > 0, `${family}: and different graphs`);
  }
});

test('sameTransformedFunction compares nothing it cannot read', () => {
  const target = { type: 'quadratic', a: 1, b: 1, h: 0, k: 0 };
  assert.equal(sameTransformedFunction({ a: 1, h: 0 }, target), false, 'a missing k');
  assert.equal(sameTransformedFunction({ a: Number.NaN, h: 0, k: 0 }, target), false);
  assert.equal(sameTransformedFunction({ a: 1, b: 1, h: 0, k: 0 }, { a: 1, b: 1, h: 0, k: 0 }), false, 'a target with no family');
  assert.equal(sameTransformedFunction({ a: 0, h: 5, k: 0 }, { type: 'quadratic', a: 0, b: 1, h: 0, k: 0 }), false, 'a = 0 is compared parameter by parameter only');
  assert.equal(sameTransformedFunction({ a: 1, h: 0, k: 0 }, target), true, 'b defaults to 1');
});

/* ------------------------------------------------------------------ */
/* describe: the descriptions read as a spec                           */
/* ------------------------------------------------------------------ */

const description = (fields) => ({
  reflection: 'no', scaleKind: 'unchanged', scaleFactor: '1',
  horizontalReflection: 'no', horizontalScaleKind: 'unchanged', horizontalScaleFactor: '1',
  horizontalDirection: 'none', horizontalDistance: '0',
  verticalDirection: 'none', verticalDistance: '0',
  ...fields,
});

test('describe: a description of the same graph in other words draws the same function', () => {
  // 4(x − 1)² + 2: vertical stretch 4, or horizontal compression 1/2, or both mirrored.
  const quadratic = { type: 'quadratic', a: 4, b: 1, h: 1, k: 2 };
  const own = description({ scaleKind: 'stretch', scaleFactor: '4', horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'up', verticalDistance: '2' });
  const compressed = description({ horizontalScaleKind: 'compression', horizontalScaleFactor: '1/2', horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'up', verticalDistance: '2' });
  const mirrored = { ...compressed, horizontalReflection: 'yes' };
  for (const work of [own, compressed, mirrored]) {
    assert.equal(descriptionDrawsSameFunction(work, quadratic, 0.01), true, JSON.stringify(work));
  }
  assert.deepEqual(describedTransformationSpec(compressed, quadratic, 0.01), { type: 'quadratic', a: 1, b: 2, h: 1, k: 2, base: 2 });
  assert.ok(oracleSame('quadratic', { a: 1, b: 2, h: 1, k: 2 }, quadratic));

  // 2^(x − 1) − 3 (= 0.5·2^x − 3): "compression 0.5, no shift" describes it too.
  const exponential = { type: 'exponential', a: 1, b: 1, h: 1, k: -3, base: 2 };
  const shifted = description({ horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'down', verticalDistance: '3' });
  const squashed = description({ scaleKind: 'compression', scaleFactor: '0.5', verticalDirection: 'down', verticalDistance: '3' });
  assert.equal(descriptionDrawsSameFunction(shifted, exponential, 0.01), true);
  assert.equal(descriptionDrawsSameFunction(squashed, exponential, 0.01), true);
  assert.ok(oracleSame('exponential', { a: 0.5, h: 0, k: -3 }, exponential));

  // log₂(2x) = log₂x + 1: "horizontal compression 1/2" or "up 1".
  const logarithm = { type: 'logarithmic', a: 1, b: 2, h: 0, k: 0, base: 2 };
  assert.equal(descriptionDrawsSameFunction(description({ verticalDirection: 'up', verticalDistance: '1' }), logarithm, 0.01), true);
});

test('describe: a different graph, or a description that contradicts itself, does not', () => {
  const quadratic = { type: 'quadratic', a: 4, b: 1, h: 1, k: 2 };
  const base = { horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'up', verticalDistance: '2' };
  const cases = [
    description({ ...base, scaleKind: 'stretch', scaleFactor: '4.1' }), // a near miss
    description({ ...base, reflection: 'yes', scaleKind: 'stretch', scaleFactor: '4' }), // reflected
    description({ ...base, scaleKind: 'stretch', scaleFactor: '4', horizontalDirection: 'left' }), // shifted the wrong way
    description({ ...base, scaleKind: 'compression', scaleFactor: '4' }), // "compression" by 4
    description({ ...base, scaleKind: 'stretch', scaleFactor: '4', verticalDirection: 'none' }), // "none" with a distance
    description({ ...base, scaleKind: 'stretch', scaleFactor: '' }), // blank
    description({ ...base, scaleKind: 'stretch', scaleFactor: '4', horizontalScaleFactor: '0', horizontalScaleKind: 'compression' }),
    description({ ...base, scaleKind: 'stretch', scaleFactor: '4', horizontalDistance: '-1' }),
  ];
  for (const work of cases) assert.equal(descriptionDrawsSameFunction(work, quadratic, 0.01), false, JSON.stringify(work));
  // "None" with a distance contradicts itself even where k really is 0.
  const level = { type: 'quadratic', a: 4, b: 1, h: 1, k: 0 };
  const levelOwn = description({ scaleKind: 'stretch', scaleFactor: '4', horizontalDirection: 'right', horizontalDistance: '1' });
  assert.equal(descriptionDrawsSameFunction(levelOwn, level, 0.01), true);
  assert.equal(descriptionDrawsSameFunction({ ...levelOwn, verticalDistance: '2' }, level, 0.01), false);
  // A square root reflected across the y-axis is the mirror image, not the same graph.
  const root = { type: 'squareRoot', a: 2, b: 1, h: 0, k: 0 };
  const mirrored = description({ scaleKind: 'stretch', scaleFactor: '2', horizontalReflection: 'yes' });
  assert.equal(oracleSame('squareRoot', { a: 2, b: -1, h: 0, k: 0 }, root), false);
  assert.equal(descriptionDrawsSameFunction(mirrored, root, 0.01), false);
});

/* ------------------------------------------------------------------ */
/* the tolerance stays in the question's own units                      */
/* ------------------------------------------------------------------ */

// A first version compared canonical coefficients (ab², a·base^(−bh), ...) at
// 0.01, which widened the tolerance on a by 1/|b|ⁿ or base^(bh): with a small
// b, or an exponential shifted right, a visibly different graph was marked
// fully right. The question's own form must keep exactly its old 0.01.
test('identify: in the question\'s own form, a is still checked at 0.01 however small b is or far h shifts', () => {
  const items = [
    ['quadratic', { a: 2, b: 0.25, h: 0, k: 0 }, true],
    ['cubic', { a: 2, b: 0.25, h: 0, k: 0 }, true],
    ['absolute', { a: -3, b: 0.2, h: 1, k: 2 }, true],
    ['cubeRoot', { a: 1, b: 0.125, h: 0, k: 0 }, true],
    ['squareRoot', { a: 1, b: 0.25, h: -1, k: 0 }, true],
    ['rational', { a: 1, b: 4, h: 0, k: 0 }, true],
    ['exponential', { a: 1, h: 2, k: 0 }, false],
    ['exponential', { a: 1, h: 3, k: 0 }, false],
    ['exponential', { a: 0.5, b: 2, h: 2, k: 1 }, true],
    ['logarithmic', { a: 1, b: 0.25, h: 0, k: 0 }, true],
    ['linear', { a: 2, b: 0.25, h: 3, k: 1 }, true],
  ];
  for (const [family, fn, withB] of items) {
    const question = identify(family, fn);
    const own = { b: 1, ...fn };
    for (const delta of [0.011, -0.011, 0.02, -0.03, 0.05, 0.15, -0.6]) {
      const work = boxes({ ...own, a: Number((own.a + delta).toFixed(6)) }, withB);
      const label = `${family} ${JSON.stringify(fn)} with a = ${work.a}`;
      assert.equal(oracleSame(family, { ...own, a: Number(work.a) }, own), false, `${label}: a different graph`);
      const result = grade(question, work);
      assert.equal(result.isCorrect, false, `${label}: marked wrong`);
      assert.equal(result.score, 0.75, `${label}: b, h, k right, a wrong — as before`);
    }
    for (const delta of [0.009, -0.009]) {
      const work = boxes({ ...own, a: Number((own.a + delta).toFixed(6)) }, withB);
      assert.equal(grade(question, work).isCorrect, true, `${family} ${JSON.stringify(fn)} with a = ${work.a}: within 0.01, as before`);
    }
  }
});

test('identify: the verifier\'s near misses are wrong', () => {
  // y(7): 2.15·(7/4)² = 6.584 against 2·(7/4)² = 6.125.
  const quadratic = grade(identify('quadratic', { a: 2, b: 0.25, h: 0, k: 0 }), { a: '2.15', b: '0.25', h: '0', k: '0' });
  assert.equal(quadratic.isCorrect, false);
  assert.equal(quadratic.score, 0.75);
  const cubic = grade(identify('cubic', { a: 2, b: 0.25, h: 0, k: 0 }), { a: '2.6', b: '0.25', h: '0', k: '0' });
  assert.equal(cubic.isCorrect, false);
  assert.equal(cubic.score, 0.75);
  // 1.03·2^(x − 2) against 2^(x − 2): 3% taller everywhere.
  const exponential = grade(identify('exponential', { a: 1, h: 2, k: 0 }), { a: '1.03', h: '2', k: '0' });
  assert.equal(exponential.isCorrect, false);
  assert.equal(exponential.score, 0.75);
});

test('identify: another form is right exactly when the question\'s own form, within 0.01, draws it', () => {
  // [family, question, b box, student set, the same function in the question's
  //  own form (derived by hand), whether that own-form set is within 0.01]
  const cases = [
    // 4.03x² = 1.0075·(2x)²; 4.05x² = 1.0125·(2x)².
    ['quadratic', { a: 1, b: 2, h: 0, k: 0 }, true, { a: 4.03, b: 1, h: 0, k: 0 }, { a: 1.0075, b: 2, h: 0, k: 0 }, true],
    ['quadratic', { a: 1, b: 2, h: 0, k: 0 }, true, { a: 4.05, b: 1, h: 0, k: 0 }, { a: 1.0125, b: 2, h: 0, k: 0 }, false],
    // 2·(x/4)² = 0.125x²: 0.13x² = 2.08·(x/4)², far from a = 2.
    ['quadratic', { a: 2, b: 0.25, h: 0, k: 0 }, true, { a: 0.13, b: 1, h: 0, k: 0 }, { a: 2.08, b: 0.25, h: 0, k: 0 }, false],
    // 1.004·2^x − 3 = 2.008·2^(x − 1) − 3; 1.006·2^x − 3 = 2.012·2^(x − 1) − 3.
    ['exponential', { a: 2, h: 1, k: -3 }, false, { a: 1.004, h: 0, k: -3 }, { a: 2.008, h: 1, k: -3 }, true],
    ['exponential', { a: 2, h: 1, k: -3 }, false, { a: 1.006, h: 0, k: -3 }, { a: 2.012, h: 1, k: -3 }, false],
    // 2^(x−3) = 0.125·2^x: 0.13·2^x = 1.04·2^(x − 3).
    ['exponential', { a: 1, h: 3, k: 0 }, false, { a: 0.13, h: 0, k: 0 }, { a: 1.04, h: 3, k: 0 }, false],
    // The graph fixes an exponential's b, so the student's own b is kept:
    // 2^(−6.027)·2^(2.009x) = 2^(2.009(x − 3)), b within 0.01 of 2 and a = 1.
    ['exponential', { a: 1, b: 2, h: 3, k: 0 }, true, { a: 2 ** -6.027, b: 2.009, h: 0, k: 0 }, { a: 1, b: 2.009, h: 3, k: 0 }, true],
    // log₂(x/4) = log₂x − 2: log₂x − 2.005 is k = −0.005 in the question's form.
    ['logarithmic', { a: 1, b: 0.25, h: 0, k: 0 }, true, { a: 1, b: 1, h: 0, k: -2.005 }, { a: 1, b: 0.25, h: 0, k: -0.005 }, true],
    ['logarithmic', { a: 1, b: 0.25, h: 0, k: 0 }, true, { a: 1, b: 1, h: 0, k: -2.02 }, { a: 1, b: 0.25, h: 0, k: -0.02 }, false],
    // 0.25(x − 3) + 1 = 0.252x + c: slope 0.252 is a = 1.008 at b = 0.25.
    ['linear', { a: 1, b: 0.25, h: 3, k: 1 }, true, { a: 0.252, b: 1, h: 3, k: 1 }, { a: 1.008, b: 0.25, h: 3, k: 1 }, true],
    ['linear', { a: 1, b: 0.25, h: 3, k: 1 }, true, { a: 0.255, b: 1, h: 3, k: 1 }, { a: 1.02, b: 0.25, h: 3, k: 1 }, false],
  ];
  for (const [family, fn, withB, student, ownForm, right] of cases) {
    const label = `${family} ${JSON.stringify(fn)} as ${JSON.stringify(student)}`;
    const base = fn.base ?? 2;
    assert.ok(oracleSame(family, { b: 1, ...student, base }, { b: 1, ...ownForm, base }), `${label}: the hand derivation is the same function`);
    const result = grade(identify(family, fn), boxes({ b: 1, ...student }, withB));
    assert.equal(result.isCorrect, right, label);
  }
});

test('describe: the descriptions are compared in describe\'s own units', () => {
  // 2^(0.5x): "horizontal stretch 2.03" is b = 0.4926, within 0.01 of 0.5 —
  // but a factor 0.03 from 2, which the per-field describe check rejects.
  const exponential = { type: 'exponential', a: 1, b: 0.5, h: 0, k: 0, base: 2 };
  const stretch = (factor) => description({ horizontalScaleKind: 'stretch', horizontalScaleFactor: factor });
  assert.equal(descriptionDrawsSameFunction(stretch('2'), exponential, 0.01), true);
  assert.equal(descriptionDrawsSameFunction(stretch('2.008'), exponential, 0.01), true);
  assert.equal(descriptionDrawsSameFunction(stretch('2.03'), exponential, 0.01), false);
  // 2·(x/4)²: "vertical stretch 2.15, horizontal stretch 4" is a different graph.
  const quadratic = { type: 'quadratic', a: 2, b: 0.25, h: 0, k: 0 };
  const scaled = (factor) => description({ scaleKind: 'stretch', scaleFactor: factor, horizontalScaleKind: 'stretch', horizontalScaleFactor: '4' });
  assert.equal(descriptionDrawsSameFunction(scaled('2'), quadratic, 0.01), true);
  assert.equal(descriptionDrawsSameFunction(scaled('2.15'), quadratic, 0.01), false);
  // ... and "compression 0.13, no horizontal scale" (0.13x² = 2.08·(x/4)²) too.
  assert.equal(descriptionDrawsSameFunction(description({ scaleKind: 'compression', scaleFactor: '0.13' }), quadratic, 0.01), false);
  assert.equal(descriptionDrawsSameFunction(description({ scaleKind: 'compression', scaleFactor: '0.125' }), quadratic, 0.01), true);
});

// identify reads a blank box as no number, never 0: a blank that happens to
// complete an equivalent set must not lift the other parts' credit.
test('identify: a blank box is not read as 0 by the same-graph rule', () => {
  // 2·2^(x−1) − 3 = 1·2^(x−0) − 3, but h is left blank: only k is right.
  const exponential = grade(identify('exponential', { a: 2, h: 1, k: -3 }), { a: '1', h: '', k: '-3' });
  assert.equal(exponential.isCorrect, false);
  assert.deepEqual(exponential.parts.map((part) => part.isCorrect), [false, true, false, true]);
  const linear = grade(identify('linear', { a: 2, h: 1, k: 3 }), { a: '2', h: '', k: '1' });
  assert.deepEqual(linear.parts.map((part) => part.isCorrect), [true, true, false, false]);
});

test('describe (graded): another full description of the same graph is right in every part; a different graph is not', () => {
  // 4(x − 1)² + 2 = (2(x − 1))² + 2: a horizontal compression by 1/2 describes it.
  const question = { type: TOOL_ID, questionId: 'k-2e-describe', mode: 'describe', family: 'quadratic', function: { type: 'quadratic', a: 4, b: 1, h: 1, k: 2 } };
  const compressed = description({ horizontalScaleKind: 'compression', horizontalScaleFactor: '1/2', horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'up', verticalDistance: '2' });
  assert.ok(oracleSame('quadratic', { a: 1, b: 2, h: 1, k: 2 }, question.function));
  const right = grade(question, compressed);
  assert.equal(right.isCorrect, true);
  assert.ok(right.parts.every((part) => part.isCorrect));
  // Compression by 1/3 draws 9(x − 1)² + 2: still wrong, and its own wrong parts stay wrong.
  const wrong = grade(question, { ...compressed, horizontalScaleFactor: '1/3' });
  assert.ok(!oracleSame('quadratic', { a: 1, b: 3, h: 1, k: 2 }, question.function));
  assert.equal(wrong.isCorrect, false);
  // The question's own description is right as before.
  const own = description({ scaleKind: 'stretch', scaleFactor: '4', horizontalDirection: 'right', horizontalDistance: '1', verticalDirection: 'up', verticalDistance: '2' });
  assert.equal(grade(question, own).isCorrect, true);
});
