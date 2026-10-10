import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildRegressionCalculatorReview } from '../../src/tools/shared/reviews/regressionCalculatorReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE REGRESSION CALCULATOR'S WORKED SOLUTION, RECOMPUTED.
 *
 * Job A shipped buildRegressionCalculatorReview without the independent
 * mathematics review it planned. This file is that review. Over seeded data
 * sets in both graded modes (`data`, `scatterplot`), with and without the
 * interpretation — whole numbers, one- to four-place decimals, negatives,
 * calendar years, a tiny x-spread, exact lines, two points, repeated x-values,
 * near-zero r and every band edge — it builds the review and recomputes every
 * number it shows with exact fractions (mathjs in Fraction mode) and the
 * band edges written out here, never with the calculator's helpers:
 *
 *   - the table (the source pairs, and only those);
 *   - x̄, ȳ, Sxx, Syy, Sxy, the slope, the intercept, r and R², each within
 *     the rounding its printed digits claim, "=" only where it is exact;
 *   - every written-out chain ("m = Sxy ÷ Sxx = A ÷ B = M",
 *     "b = ȳ − m·x̄ = Y − M(X) = B", the mean-point check) is true;
 *   - the direction and strength sentences are true of the r they print;
 *   - the shared grader marks the stated work correct;
 *   - display hygiene, including no exponent notation a student cannot type;
 *   - null only where no r exists or no rounding of r shows its band.
 */

const TOOL_ID = 'regressionCalculator';
const math = create(all, { number: 'Fraction' });
// A number's own (shortest) decimal digits — the decimal the table shows —
// never exponent notation (fraction.js reads no "1e-7").
const decimal = (value) => (typeof value === 'number' && /e/i.test(String(value))
  ? value.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 21 })
  : String(value));
const F = (value) => math.fraction(decimal(value));

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const intIn = (rand, low, high) => low + Math.floor(rand() * (high - low + 1));
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const round = (value, places) => Number(value.toFixed(places)) + 0;

/* ------------------------------------------------------------ the draws */

const SHAPES = {
  integers: (rand) => {
    const n = intIn(rand, 3, 9);
    const m = intIn(rand, -5, 5);
    const b = intIn(rand, -20, 20);
    return Array.from({ length: n }, (_, index) => [index + intIn(rand, 0, 1) * index, m * index + b + intIn(rand, -6, 6)]);
  },
  decimals: (rand) => {
    const n = intIn(rand, 3, 8);
    const places = intIn(rand, 1, 4);
    return Array.from({ length: n }, () => [round(rand() * 20 - 10, places), round(rand() * 40 - 20, places)]);
  },
  years: (rand) => {
    const n = intIn(rand, 4, 8);
    const start = intIn(rand, 1990, 2015);
    return Array.from({ length: n }, (_, index) => [start + 2 * index, round(10 + 0.7 * index + (rand() - 0.5) * 3, 1)]);
  },
  exactLine: (rand) => {
    const n = intIn(rand, 3, 7);
    const m = pick(rand, [-3, -2, -1, -0.5, 0.25, 0.5, 1, 2, 3, 1.9]);
    const b = pick(rand, [-4, -1, 0, 0.5, 2, 6]);
    return Array.from({ length: n }, (_, index) => [index - 2, round(m * (index - 2) + b, 4)]);
  },
  twoPoints: (rand) => [[intIn(rand, -5, 0), intIn(rand, -9, 9)], [intIn(rand, 1, 6), intIn(rand, -9, 9)]],
  repeatedX: (rand) => [[1, intIn(rand, 0, 9)], [1, intIn(rand, 0, 9)], [2, intIn(rand, 0, 9)], [3, intIn(rand, 0, 9)], [3, intIn(rand, 0, 9)]],
  tinySpread: (rand) => Array.from({ length: 5 }, (_, index) => [round(0.001 * (index + 1), 3), round(rand() * 2, 2)]),
  nearZeroR: (rand) => {
    // x symmetric, y symmetric about the middle plus a small tilt: r near 0.
    const tilt = round((rand() - 0.5) * 0.02, 3);
    return [[-2, 5 + 2 * tilt], [-1, 3 - tilt], [0, 7], [1, 3 + tilt], [2, 5 - 2 * tilt + 0.001 * intIn(rand, 0, 3)]];
  },
  largeValues: (rand) => Array.from({ length: 5 }, (_, index) => [1000 * (index + 1), intIn(rand, 100000, 900000)]),
  // Sums in the millions and beyond, with decimals: a value rounded to 4
  // places there is within a relative 1e-10 of the truth, but it is not it.
  largeDecimals: (rand) => Array.from({ length: intIn(rand, 3, 6) }, (_, index) => [
    round(100000 * (index + 1) + rand() * 10, pick(rand, [0, 1, 2])),
    round(1000 * intIn(rand, 1, 900) + rand(), pick(rand, [0, 1, 3])),
  ]),
};

/* ------------------------------------------------- independent mathematics */

const exactStats = (pairs) => {
  const n = pairs.length;
  const xs = pairs.map(([x]) => F(x));
  const ys = pairs.map(([, y]) => F(y));
  const sum = (values) => values.reduce((total, value) => math.add(total, value), F(0));
  const xBar = math.divide(sum(xs), n);
  const yBar = math.divide(sum(ys), n);
  const sxx = sum(xs.map((x) => math.square(math.subtract(x, xBar))));
  const syy = sum(ys.map((y) => math.square(math.subtract(y, yBar))));
  const sxy = sum(xs.map((x, index) => math.multiply(math.subtract(x, xBar), math.subtract(ys[index], yBar))));
  if (math.equal(sxx, 0) || math.equal(syy, 0)) return null;
  const m = math.divide(sxy, sxx);
  const b = math.subtract(yBar, math.multiply(m, xBar));
  const r2 = math.divide(math.square(sxy), math.multiply(sxx, syy));
  const r = Math.sign(Number(sxy)) * Math.sqrt(Number(r2));
  return { n, xBar, yBar, sxx, syy, sxy, m, b, r, r2 };
};

// The calculator's bands, written out: |r| ≥ 0.8 strong, ≥ 0.5 moderate, ≥ 0.1 weak.
const band = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'None' : r > 0 ? 'Positive' : 'Negative',
  strength: Math.abs(r) >= 0.8 ? 'Strong' : Math.abs(r) >= 0.5 ? 'Moderate' : Math.abs(r) >= 0.1 ? 'Weak' : 'None',
});

const num = (text) => Number(String(text).replace(/[()]/g, '').replace(/−/g, '-'));
const exactText = (text) => F(String(text).replace(/[()]/g, '').replace(/−/g, '-'));

// The rounding a printed number claims: half a unit in its last place.
const halfUlp = (text) => {
  const digits = (String(text).split('.')[1] || '').length;
  return 0.5 * 10 ** -digits;
};

// A printed value against its true value (an exact Fraction): "=" only when
// the printed decimal IS that fraction, "≈" when it is that fraction rounded
// to the digits it shows. (A float tolerance of 1e-10 relative let
// "Syy = 1886666.6667" stand for 1886666.666….)
const assertShown = (label, relation, text, exact) => {
  const gap = Math.abs(Number(math.subtract(exactText(text), exact)));
  if (relation === '=') {
    assert.ok(math.equal(exactText(text), exact), `${label}: "= ${text}" is exact (true ${Number(exact)}, off by ${gap})`);
  } else {
    assert.ok(gap <= halfUlp(text) * (1 + 1e-12), `${label}: "≈ ${text}" rounds ${Number(exact)}`);
    assert.ok(!math.equal(exactText(text), exact), `${label}: ${text} is exact, so it is "=", not "≈"`);
  }
};

const HYGIENE = [
  [/NaN|undefined|Infinity|null|\[object/, 'a broken value'],
  [/\d[eE][+-]?\d/, 'exponent notation'],
  [/\+ [−-]|[−-] [−-]|--|−−/, 'a doubled sign'],
  [/(?<![\d.])[−-]0(?![.\d])/, 'a negative zero'],
];
const assertHygiene = (label, text) => {
  HYGIENE.forEach(([pattern, what]) => assert.doesNotMatch(text, pattern, `${label}: ${what} in "${text}"`));
};

const workFor = (model, pairs, r) => ({
  table: [...pairs].reverse(),
  regressionRun: { operation: 'linearRegression', table: pairs.map((pair) => [...pair]), r },
  interpretation: {
    direction: (model.items.find((item) => item.label === 'Direction')?.value || '').toLowerCase(),
    strength: (model.items.find((item) => item.label === 'Strength')?.value || '').toLowerCase(),
  },
  processEvidence: [],
});

/* ------------------------------------------------------------ the audit */

const auditOne = (label, question) => {
  const pairs = question.sourceData;
  const exact = exactStats(pairs);
  const model = buildRegressionCalculatorReview(question);
  if (!exact) {
    assert.equal(model, null, `${label}: no r exists, so no review`);
    return 'null';
  }
  if (model === null) {
    // Honest only when r sits within 0.5e-8 of a band edge (no 8-place rounding shows its side).
    const nearEdge = [0.1, 0.5, 0.8].some((edge) => Math.abs(Math.abs(exact.r) - edge) < 1e-8);
    assert.ok(nearEdge, `${label}: a review exists for r = ${exact.r}`);
    return 'null';
  }
  const all = [...model.items.map((item) => item.value), ...model.steps, model.why, model.note || ''].join(' | ');
  assertHygiene(label, all);

  // The table is the source.
  const table = [...model.items[0].value.matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => [num(x), num(y)]);
  assert.deepEqual(table, pairs, `${label}: the table is the source`);

  // The means and sums.
  const sums = model.steps[2].match(/x̄ ([=≈]) (\S+) and ȳ ([=≈]) (\S+), and the sums are Sxx = Σ\(x − x̄\)² ([=≈]) (\S+), Syy = Σ\(y − ȳ\)² ([=≈]) (\S+) and Sxy = Σ\(x − x̄\)\(y − ȳ\) ([=≈]) (\S+?)\.$/);
  assert.ok(sums, `${label}: the means and sums step (${model.steps[2]})`);
  const [, rx, tx, ry, ty, rxx, txx, ryy, tyy, rxy, txy] = sums;
  // A value below 0.1 is printed to 4 significant figures, not 4 places; either
  // way it is the true value rounded to the digits printed.
  const shownWithin = (what, relation, text, value) => {
    assertShown(`${label}: ${what}`, relation, text, value);
    if (relation === '≈' && Math.abs(Number(value)) < 0.1) {
      assert.ok(String(text).replace(/^[-−]?0\.0*/, '').length <= 4, `${label}: ${what} ${text} to 4 significant figures`);
    }
  };
  shownWithin('x̄', rx, tx, exact.xBar);
  shownWithin('ȳ', ry, ty, exact.yBar);
  shownWithin('Sxx', rxx, txx, exact.sxx);
  shownWithin('Syy', ryy, tyy, exact.syy);
  shownWithin('Sxy', rxy, txy, exact.sxy);

  // The slope and intercept: the line item, and the worked chain.
  const line = model.items[1].value.match(/^y ([=≈]) (?:(-?[\d.]*)x|(-?x))?(?: ([+−]) ([\d.]+))?$|^y ([=≈]) (-?[\d.]+)$/);
  assert.ok(line, `${label}: the line reads y = mx + b (${model.items[1].value})`);
  const slopeText = line[6] ? '0' : line[3] ? (line[3] === '-x' ? '-1' : '1') : line[2] === '' ? '1' : line[2] === '-' ? '-1' : line[2];
  const interceptText = line[6] ? line[7] : line[5] ? `${line[4] === '−' ? '-' : ''}${line[5]}` : '0';
  const m = num(slopeText);
  const b = num(interceptText);
  const tolerance = (value) => (Math.abs(value) >= 0.1 ? 5e-6 : 5e-5 * Math.abs(value)) * 1.0001 + 1e-12;
  assert.ok(Math.abs(m - Number(exact.m)) <= tolerance(Number(exact.m)), `${label}: m ${m} vs ${Number(exact.m)}`);
  assert.ok(Math.abs(b - Number(exact.b)) <= tolerance(Number(exact.b)), `${label}: b ${b} vs ${Number(exact.b)}`);
  const lineExact = math.equal(exactText(slopeText), exact.m) && math.equal(exactText(interceptText), exact.b);
  assert.equal(line[1] || line[6], lineExact ? '=' : '≈', `${label}: the line is "=" only when exact`);

  const slopeChain = model.steps[3].match(/m = Sxy ÷ Sxx = (\S+) ÷ (\S+) = (\S+) and/);
  if (slopeChain) assert.ok(math.equal(math.divide(exactText(slopeChain[1]), exactText(slopeChain[2])), exactText(slopeChain[3])), `${label}: ${slopeChain[0]}`);
  const interceptChain = model.steps[3].match(/b = ȳ − m·x̄ = (\S+) − (\S+)\((\S+)\) = (\S+?), so/);
  if (interceptChain) {
    const [, y, mm, x, bb] = interceptChain;
    assert.ok(math.equal(math.subtract(exactText(y), math.multiply(exactText(mm), exactText(x))), exactText(bb)), `${label}: ${interceptChain[0]}`);
  }
  assert.equal(Boolean(slopeChain), Boolean(interceptChain), `${label}: both chains or neither`);

  // r and R².
  const rStep = model.steps[4].match(/r = Sxy ÷ √\(Sxx · Syy\) ([=≈]) (\S+), and R² = r² ([=≈]) (\S+) —/);
  assert.ok(rStep, `${label}: the r step (${model.steps[4]})`);
  const rText = rStep[2];
  assert.ok(Math.abs(num(rText) - exact.r) <= 0.0005, `${label}: r ${rText} vs ${exact.r}`);
  const rIsExact = math.equal(math.square(exactText(rText)), exact.r2) && Math.sign(num(rText)) === Math.sign(Number(exact.sxy));
  assert.equal(rStep[1], rIsExact ? '=' : '≈', `${label}: r's relation`);
  shownWithin('R²', rStep[3], rStep[4], exact.r2);
  assert.ok(model.items[2].value.endsWith(` ${rText}`), `${label}: the item states the same r`);

  // The interpretation: the true band, and each sentence true of the printed r.
  const want = band(exact.r);
  const interpretation = question.requireInterpretation !== false;
  if (interpretation) {
    assert.equal(model.items.find((item) => item.label === 'Direction').value, want.direction, `${label}: direction`);
    assert.equal(model.items.find((item) => item.label === 'Strength').value, want.strength, `${label}: strength`);
    assert.deepEqual(band(num(rText)), want, `${label}: the printed r ${rText} reads in the true band`);
    const size = model.steps[6].match(/\|r\| [=≈] (\S+) is/);
    assert.ok(size && Math.abs(num(size[1]) - Math.abs(num(rText))) < 1e-12, `${label}: |r| is the printed r's size`);
  } else {
    assert.equal(model.steps.length, 5, `${label}: no interpretation steps`);
  }

  // The check: the mean point and the shared sign.
  const meanPoint = model.why.match(/\(x̄, ȳ\) ([=≈]) \((\S+), (\S+)\)/);
  assert.ok(meanPoint && num(meanPoint[2]) === num(tx) && num(meanPoint[3]) === num(ty), `${label}: the mean point is the stated means`);
  const meanCheck = model.why.match(/gives (\S+)\((\S+)\) ([+−]) (\S+) = (\S+) = ȳ/);
  if (meanCheck) {
    const [, mm, x, sign, bb, y] = meanCheck;
    const value = math.add(math.multiply(exactText(mm), exactText(x)), math.multiply(sign === '−' ? -1 : 1, exactText(bb)));
    assert.ok(math.equal(value, exactText(y)), `${label}: ${meanCheck[0]}`);
  }
  const sign = model.why.match(/here both are (\w+)/)[1];
  assert.equal(sign, exact.r === 0 ? 'zero' : exact.r > 0 ? 'positive' : 'negative', `${label}: the shared sign`);

  // The shared grader marks the stated work correct, with the printed r too.
  const result = gradeToolWork({ toolId: TOOL_ID, question, work: workFor(model, pairs, num(rText)) });
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, true, `${label}: the stated work is correct (${JSON.stringify(result.parts)})`);
  return 'review';
};

test('regression review: every seeded shape, both modes, recomputed independently', () => {
  const tally = {};
  Object.entries(SHAPES).forEach(([shape, draw], shapeIndex) => {
    const rand = prng(9100 + shapeIndex);
    for (let index = 0; index < 220; index += 1) {
      const sourceData = draw(rand);
      const question = {
        type: TOOL_ID,
        sourceData,
        ...(rand() < 0.5 ? { sourceMode: 'scatterplot' } : {}),
        ...(rand() < 0.3 ? { requireInterpretation: false } : {}),
      };
      const outcome = auditOne(`${shape}#${index} ${JSON.stringify(question)}`, question);
      tally[`${shape}:${outcome}`] = (tally[`${shape}:${outcome}`] || 0) + 1;
    }
  });
  // Every shape but the degenerate draws produced reviews.
  Object.keys(SHAPES).forEach((shape) => assert.ok((tally[`${shape}:review`] || 0) > 100, `${shape} reviewed (${JSON.stringify(tally)})`));
});

test('regression review: edge cases — band edges, tiny and huge values, exact lines', () => {
  const X = [-1, 1, -1, 1];
  const Z = [-1, -1, 1, 1];
  const withR = (t) => X.map((x, index) => [x, t * x + Math.sqrt(1 - t * t) * Z[index]]);
  const cases = [
    ...[0.05, 0.0999, 0.1001, 0.4999, 0.5001, 0.7999, 0.8001, 0.99999].flatMap((t) => [t, -t]).map((t) => [`r = ${t}`, withR(t)]),
    ['an exact line through the origin', [[1, 2], [2, 4], [3, 6]]],
    ['a falling exact line', [[0, 6], [1, 4], [2, 2]]],
    ['slope 1', [[0, 1], [1, 2], [2, 3.5]]],
    ['a tiny x-spread', [[0.001, 1], [0.002, 3], [0.003, 2], [0.004, 5]]],
    ['a tiny slope', [[0, 0], [1, 0.0000001], [2, 0], [3, 0.0000003]]],
    ['years with an intercept in the thousands', [[2000, 12.5], [2002, 13.1], [2004, 15.2], [2006, 14.8], [2008, 17.3], [2010, 18.0]]],
    ['negative zero in the source', [[-0, 1], [1, -0], [2, 3]]],
    ['a near-zero r', [[1, 3], [2, 7], [3, 5], [4, 2], [5, 6], [6, 4]]],
  ];
  cases.forEach(([label, sourceData]) => {
    const pairs = sourceData.map(([x, y]) => [Object.is(x, -0) ? 0 : x, Object.is(y, -0) ? 0 : y]);
    auditOne(label, { type: TOOL_ID, sourceData: pairs });
  });
});

test('regression review: no r, no review — and the grader accepts nothing there either', () => {
  [[[1, 2], [1, 3], [1, 4]], [[1, 2], [2, 2], [3, 2]], [[4, 4]], []].forEach((sourceData) => {
    assert.equal(buildRegressionCalculatorReview({ type: TOOL_ID, sourceData }), null);
  });
});

test('regression review: a tiny value is printed in digits a student can type, and "=" only when it is exact', () => {
  // r ≈ −0.0006, so R² ≈ 3.2143e-7. It was printed "R² = r² = 3.214e-7": exponent
  // notation, and "=" because exactness was judged to an absolute 1e-10.
  const nearZero = buildRegressionCalculatorReview({ type: TOOL_ID, sourceData: [[-2, 5.002], [-1, 2.999], [0, 7], [1, 3.001], [2, 4.998]] });
  assert.equal(nearZero.items.find((item) => item.label === 'Coefficient of determination').value, 'R² ≈ 0.0000003214');
  // A source value and a slope below a millionth keep their digits too.
  const tiny = buildRegressionCalculatorReview({ type: TOOL_ID, sourceData: [[0, 0], [1, 0.0000001], [2, 0], [3, 0.0000003]] });
  assert.match(tiny.items[0].value, /\(1, 0\.0000001\)/);
  assert.match(tiny.items[1].value, /^y ≈ 0\.00000006x − 0\.00000002$|^y ≈ 0\.00000006x$|^y [=≈] 0\.0000000\d+x/);
  assertHygiene('tiny', JSON.stringify(tiny));
  // Syy = 6e-14 here: it is not printed "Syy = 0" beside r ≈ 0.73.
  assert.match(tiny.steps[2], /Syy = Σ\(y − ȳ\)² = 0\.00000000000006 /);
  auditOne('tiny', { type: TOOL_ID, sourceData: [[0, 0], [1, 0.0000001], [2, 0], [3, 0.0000003]] });
});

test('regression review: a large value rounded to 4 places is "≈", never "=" (exact fractions decide)', () => {
  // Each was printed with "=": Syy is 1886666.666…, Sxx …1000.000075, Sxy 1999000.999333….
  const cases = [
    [[[1, 1200], [2, 2500], [4, 3100]], /Syy = Σ\(y − ȳ\)² ≈ 1886666\.6667 /],
    [[[1, 1000], [2, 2000], [3, 3001]], /Syy = Σ\(y − ȳ\)² ≈ 2002000\.6667 /],
    [[[0, 0], [1000, 1000], [2000.001, 1999]], /Sxx = Σ\(x − x̄\)² ≈ 2000002, Syy = Σ\(y − ȳ\)² ≈ 1998000\.6667 and Sxy = Σ\(x − x̄\)\(y − ȳ\) ≈ 1999000\.9993\./],
    [[[100000, 1], [200000, 3], [300000.01, 2], [400000, 5]], /Sxx = Σ\(x − x̄\)² ≈ 50000001000\.0001,/],
  ];
  cases.forEach(([sourceData, pattern]) => {
    const model = buildRegressionCalculatorReview({ type: TOOL_ID, sourceData });
    assert.match(model.steps[2], pattern);
    auditOne(JSON.stringify(sourceData), { type: TOOL_ID, sourceData });
  });
  // An exact large value keeps "=".
  const exact = buildRegressionCalculatorReview({ type: TOOL_ID, sourceData: [[1, 1000000], [2, 3000000], [3, 2000000]] });
  assert.match(exact.steps[2], /Syy = Σ\(y − ȳ\)² = 2000000000000 /);
});
