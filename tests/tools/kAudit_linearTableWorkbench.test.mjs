import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildLinearTableWorkbenchReview } from '../../src/tools/shared/reviews/linearTableWorkbenchReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE LINEAR TABLE WORKBENCH'S WORKED SOLUTION, RECOMPUTED.
 *
 * Job A shipped buildLinearTableWorkbenchReview without the independent
 * mathematics review it planned. This file is that review. Over seeded
 * tables for every mode the grader grades — constantRate on linear and on
 * nonlinear tables, deriveEquation and repairValue — with every interval
 * count an author can ask for, plus edge cases (a horizontal table, negative
 * and fractional rates, decimals, rows out of order, the broken row first or
 * last), it builds the review and recomputes everything it shows with exact
 * fractions (mathjs in Fraction mode), never with the workbench's helpers:
 *
 *   - each recorded interval's Δx, Δy and rate, from the smaller x;
 *   - the classification (one rate everywhere, exactly);
 *   - the slope, intercept and equation (the equation holds on every row);
 *   - the offending row (the only one whose removal leaves a line) and its
 *     corrected value;
 *   - every "a = b" chain in the steps and the check, and every row, rate
 *     and substitution they quote;
 *   - the shared grader marks the stated work correct and complete;
 *   - display hygiene; and a null review only where the table has no one
 *     answer to state.
 */

const TOOL_ID = 'linearTableWorkbench';
const math = create(all, { number: 'Fraction' });
const F = (value, denominator) => (denominator === undefined ? math.fraction(value) : math.fraction(value, denominator));

/* ------------------------------------------------------------ the draws */

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
const shuffle = (rand, list) => {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rand() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

// A table an author types: decimal cells only (Number('4/3') is NaN), so a
// rate is a whole number, a half, a quarter, a fifth or a tenth.
const exactRate = (rand) => F(intIn(rand, -6, 6) * pick(rand, [1, 1, 1, 2, 3])).div(pick(rand, [1, 1, 2, 4, 5, 10]));
const distinctXs = (rand, count) => {
  const step = pick(rand, [1, 1, 1, 0.5, 2]);
  const xs = new Set();
  while (xs.size < count) xs.add(intIn(rand, -8, 8) * step);
  return [...xs].map((x) => F(x));
};
// A row the way an author stores it: { x, y } or [x, y], numbers.
const asRow = (rand, [x, y]) => (rand() < 0.2 ? [x.valueOf(), y.valueOf()] : { x: x.valueOf(), y: y.valueOf() });
const requiredComparisonsFor = (rand, rowCount) => {
  const pairs = (rowCount * (rowCount - 1)) / 2;
  return pick(rand, [undefined, 1, 2, 2, 3, Math.min(pairs, 4), pairs, pairs + 1, 2.5]);
};

const linearTable = (rand, count) => {
  const m = exactRate(rand); const b = F(intIn(rand, -20, 20)).div(pick(rand, [1, 2]));
  return { m, b, points: distinctXs(rand, count).map((x) => [x, m.mul(x).add(b)]) };
};

const drawQuestion = (rand, kind) => {
  if (kind === 'linear') {
    const count = intIn(rand, 3, 6);
    const { points } = linearTable(rand, count);
    return { type: TOOL_ID, mode: pick(rand, ['constantRate', 'constantRate', undefined]), rows: points.map((point) => asRow(rand, point)), requiredComparisons: requiredComparisonsFor(rand, count) };
  }
  if (kind === 'nonlinear') {
    const count = intIn(rand, 3, 6);
    const { points } = linearTable(rand, count);
    // Bend a linear table: a square term, or one row moved.
    const bent = rand() < 0.5
      ? points.map(([x, y]) => [x, y.add(x.mul(x).mul(pick(rand, [1, -1, 0.5])))])
      : points.map(([x, y], index) => [x, index === 1 ? y.add(intIn(rand, 1, 5)) : y]);
    return { type: TOOL_ID, mode: 'constantRate', rows: bent.map((point) => asRow(rand, point)), requiredComparisons: requiredComparisonsFor(rand, count) };
  }
  if (kind === 'deriveEquation') {
    const count = intIn(rand, 3, 6);
    const { points } = linearTable(rand, count);
    return { type: TOOL_ID, mode: 'deriveEquation', rows: points.map((point) => asRow(rand, point)), requiredComparisons: requiredComparisonsFor(rand, count) };
  }
  const count = intIn(rand, 4, 7);
  const { points } = linearTable(rand, count);
  const bad = intIn(rand, 0, count - 1);
  const broken = points.map(([x, y], index) => [x, index === bad ? y.add(F(pick(rand, [-1, 1]) * intIn(rand, 1, 30)).div(pick(rand, [1, 2]))) : y]);
  return { type: TOOL_ID, mode: 'repairValue', rows: broken.map((point) => asRow(rand, point)), requiredComparisons: requiredComparisonsFor(rand, count) };
};

/* -------------------------------------------- the truth, recomputed here */

const rowsOf = (question) => question.rows.map((row) => (Array.isArray(row) ? [F(row[0]), F(row[1])] : [F(row.x), F(row.y)]));
const rateOf = ([x1, y1], [x2, y2]) => y2.sub(y1).div(x2.sub(x1));
const isLine = (points) => points.length < 3 || points.slice(2).every((point) => rateOf(points[0], point).equals(rateOf(points[0], points[1])));
const lineThrough = (points) => {
  const m = rateOf(points[0], points[1]);
  return { m, b: points[0][1].sub(m.mul(points[0][0])) };
};
/** The single row whose removal leaves a line, and its corrected y — or null. */
const repairOf = (points) => {
  if (points.length < 4) return null;
  const candidates = points.map((_, index) => index).filter((index) => isLine(points.filter((__, other) => other !== index)));
  if (candidates.length !== 1) return null;
  const [bad] = candidates;
  const { m, b } = lineThrough(points.filter((__, other) => other !== bad));
  return { bad, m, b, corrected: m.mul(points[bad][0]).add(b) };
};
const need = (question) => Math.ceil(Math.max(1, Number(question.requiredComparisons) || 3));

/* -------------------------------------------------- reading the display */

const ascii = (text) => String(text).replace(/−/g, '-').replace(/÷/g, '/');
const fr = (text) => {
  const clean = ascii(text).trim();
  assert.match(clean, /^-?\d+(?:\.\d+)?(?:\/\d+)?$/, `a number as typed: "${text}"`);
  return math.evaluate(clean);
};
const pointIn = (text) => {
  const match = String(text).match(/^\(([^,()]+), ([^,()]+)\)$/);
  assert.ok(match, `a point: ${text}`);
  return [fr(match[1]), fr(match[2])];
};
const isNumericSide = (text) => /^[−\-\d\s.+/÷()]+$/.test(text.trim()) && /\d/.test(text);

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertHygiene = (text, label) => {
  assert.doesNotMatch(text, /NaN|undefined|Infinity|\bnull\b|\[object/, `${label}: no broken value in "${text}"`);
  assert.doesNotMatch(text, /\+ [−-]|[−-] [−-]\d|−−|--|-−|−-/, `${label}: no doubled sign in "${text}"`);
  assert.doesNotMatch(text, /(^|[^\d./])[01][xy]\b/, `${label}: no 1x or 0x in "${text}"`);
  assert.doesNotMatch(text, /[−-]0(?![.\d/])/, `${label}: no −0 in "${text}"`);
  assert.doesNotMatch(text, /÷ [−-]/, `${label}: a negative divisor is bracketed in "${text}"`);
  assert.doesNotMatch(text, /≈/, `${label}: an exact table needs no approximation in "${text}"`);
  for (const [, n, d] of text.matchAll(/(\d+)\/(\d+)/g)) {
    assert.ok(Number(d) > 1 && gcd(Number(n), Number(d)) === 1, `${label}: ${n}/${d} in lowest terms in "${text}"`);
  }
  let depth = 0;
  for (const character of text) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    assert.ok(depth >= 0, `${label}: balanced brackets in "${text}"`);
  }
  assert.equal(depth, 0, `${label}: balanced brackets in "${text}"`);
};

/** Every chain "a = b = c" of plain arithmetic in a sentence is true. */
const assertArithmeticChains = (text, label) => {
  let checked = 0;
  text.split(/: |; |, | and | so | — | then |\. |\.$/).forEach((clause) => {
    const sides = clause.split(' = ').map((side) => side.trim());
    for (let index = 1; index < sides.length; index += 1) {
      if (!isNumericSide(sides[index - 1]) || !isNumericSide(sides[index])) continue;
      assert.ok(F(math.evaluate(ascii(sides[index - 1]))).equals(F(math.evaluate(ascii(sides[index])))), `${label}: "${sides[index - 1]} = ${sides[index]}" is false in "${text}"`);
      checked += 1;
    }
  });
  return checked;
};

/** An equation as typed into the workbench, as f(x, y) = left − right. */
const equationHoldsAt = (text, [x, y]) => {
  const [left, right] = ascii(text).split('=').map((side) => math.evaluate(side.trim(), { x, y }));
  return F(left).equals(F(right));
};

const CLASSIFICATION = { 'Constant rate (linear)': 'linear', 'Not a constant rate (nonlinear)': 'nonlinear' };
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/** The work a student following the review submits, read from its items. */
const workFromReview = (model) => {
  const intervals = model.items.flatMap((item) => {
    const rows = item.label.match(/^Row (\d+) → Row (\d+)$/);
    if (!rows) return [];
    const [, dx, dy, rate] = item.value.match(/^Δx = (\S+), Δy = (\S+), rate = (\S+)$/);
    return [{ i: Number(rows[1]) - 1, j: Number(rows[2]) - 1, dx, dy, rate }];
  });
  const corrected = model.items.find((item) => item.label.startsWith('Corrected y-value'));
  const offending = itemValue(model, 'Offending row');
  return {
    intervals,
    classification: CLASSIFICATION[model.items.find((item) => item.label.startsWith('Classification'))?.value] || '',
    repairRowIndex: offending ? Number(offending.match(/^Row (\d+)$/)[1]) - 1 : null,
    repairedValue: corrected?.value ?? '',
    m: itemValue(model, 'Slope m') ?? '',
    b: itemValue(model, 'y-intercept b') ?? '',
    equation: itemValue(model, 'Equation') ?? '',
  };
};

/* ------------------------------------------------------- one full audit */

/** "Row 2 (1, 5)" in a sentence is that row of the table. */
const assertRowsQuoted = (text, points, label) => {
  for (const [, index, x, y] of text.matchAll(/Row (\d+) \(([^,()]+), ([^,()]+)\)/g)) {
    const point = points[Number(index) - 1];
    assert.ok(point && point[0].equals(fr(x)) && point[1].equals(fr(y)), `${label}: Row ${index} is (${x}, ${y}) in "${text}"`);
  }
};

const auditReview = (question, model, label) => {
  const points = rowsOf(question);
  const texts = [model.title, model.why, model.note || '', ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((text) => assertHygiene(text, label));
  [...model.steps, model.why].forEach((text) => {
    assertArithmeticChains(text, label);
    assertRowsQuoted(text, points, label);
  });
  // "Row a → Row b: r" and "rate = dy ÷ dx = r" — every rate a sentence names is that interval's.
  model.steps.forEach((text) => {
    for (const [, a, b, rate] of text.matchAll(/Row (\d+) → Row (\d+): (−?[\d./]+)(?=[;.])/g)) {
      assert.ok(rateOf(points[a - 1], points[b - 1]).equals(fr(rate)), `${label}: Row ${a} → Row ${b} has rate ${rate}`);
    }
    for (const [, a, b, dx, dy, rate] of text.matchAll(/Row (\d+) → Row (\d+): Δx = (\S+), Δy = (\S+), rate = (−?[\d/]+(?:\.\d+)?)/g)) {
      const [p, q] = [points[a - 1], points[b - 1]];
      assert.ok(q[0].sub(p[0]).equals(fr(dx)) && q[1].sub(p[1]).equals(fr(dy)) && rateOf(p, q).equals(fr(rate)), `${label}: folded interval ${a} → ${b}`);
    }
  });

  const work = workFromReview(model);
  const keys = new Set();
  work.intervals.forEach(({ i, j, dx, dy, rate }) => {
    const [p, q] = [points[i], points[j]];
    assert.ok(p[0].lt(q[0]), `${label}: Row ${i + 1} → Row ${j + 1} goes from the smaller x`);
    assert.ok(q[0].sub(p[0]).equals(fr(dx)), `${label}: Δx ${dx}`);
    assert.ok(q[1].sub(p[1]).equals(fr(dy)), `${label}: Δy ${dy}`);
    assert.ok(rateOf(p, q).equals(fr(rate)), `${label}: rate ${rate}`);
    // The worked sentence for this interval, when there is one, is this arithmetic.
    const sentence = model.steps.find((text) => text.startsWith(`Row ${i + 1} (`) && text.includes(`→ Row ${j + 1} (`));
    if (sentence) assert.ok(assertArithmeticChains(sentence, label) === 3, `${label}: Δx, Δy and the rate are each worked: ${sentence}`);
    keys.add(`${i}:${j}`);
  });
  assert.equal(keys.size, work.intervals.length, `${label}: distinct pairs`);
  assert.ok(work.intervals.length >= need(question), `${label}: as many intervals as the question asks for`);

  const mode = ['deriveEquation', 'repairValue'].includes(question.mode) ? question.mode : 'constantRate';
  if (mode === 'repairValue') {
    const repair = repairOf(points);
    assert.equal(work.repairRowIndex, repair.bad, `${label}: the offending row`);
    assert.ok(fr(work.repairedValue).equals(repair.corrected), `${label}: corrected value ${work.repairedValue}`);
    assert.equal(work.classification, 'linear', `${label}: the repaired table is linear`);
    const extend = model.steps.find((text) => text.startsWith('Extend the rate'));
    assert.ok(fr(extend.match(/^Extend the rate (\S+) /)[1]).equals(repair.m), `${label}: extends the line's rate`);
    assert.ok(fr(extend.match(/ = (\S+)\. That is the corrected value/)[1]).equals(repair.corrected), `${label}: ${extend}`);
    assert.ok(model.steps.some((text) => text.startsWith(`Leave out Row ${repair.bad + 1} (`) && fr(text.match(/with rate (\S+)\. /)[1]).equals(repair.m)), `${label}: names the row and the rate`);
    const check = model.why.match(/^Check: from \(([^,]+), ([^)]+)\) to \(([^,]+), ([^)]+)\) the rate is .+ = (\S+) — the same rate/);
    assert.ok(check && fr(check[5]).equals(repair.m), `${label}: ${model.why}`);
    const fixed = [points[repair.bad][0], repair.corrected];
    const ends = [[fr(check[1]), fr(check[2])], [fr(check[3]), fr(check[4])]];
    assert.ok(ends.some(([x, y]) => x.equals(fixed[0]) && y.equals(fixed[1])), `${label}: the check uses the corrected row`);
  } else {
    const linear = isLine(points);
    assert.equal(work.classification, linear ? 'linear' : 'nonlinear', `${label}: classification`);
    if (!linear) {
      assert.ok(new Set(work.intervals.map(({ rate }) => fr(rate).toFraction())).size >= 2, `${label}: two different rates recorded`);
      const named = model.steps.at(-1).match(/^Row (\d+) → Row (\d+) has rate (\S+) but Row (\d+) → Row (\d+) has rate (\S+)\. The rate changes/);
      assert.ok(named, `${label}: ${model.steps.at(-1)}`);
      assert.ok(rateOf(points[named[1] - 1], points[named[2] - 1]).equals(fr(named[3])) && rateOf(points[named[4] - 1], points[named[5] - 1]).equals(fr(named[6])), `${label}: the two rates`);
      assert.ok(!fr(named[3]).equals(fr(named[6])), `${label}: the two rates differ`);
    } else {
      const { m, b } = lineThrough(points);
      assert.ok(fr(model.why.match(/Δy ÷ Δx = ([^,]+),|the same rate, (\S+)\.$/).slice(1).find(Boolean)).equals(m), `${label}: the one rate`);
      if (mode === 'deriveEquation') {
        assert.ok(fr(work.m).equals(m), `${label}: m = ${work.m}`);
        assert.ok(fr(work.b).equals(b), `${label}: b = ${work.b}`);
        points.forEach((point) => assert.ok(equationHoldsAt(work.equation, point), `${label}: ${work.equation} holds on (${point.join(', ')})`));
        assert.ok(!equationHoldsAt(work.equation, [F(0), b.add(1)]), `${label}: ${work.equation} is a line`);
        const intercept = model.steps.find((text) => /^Substitute Row|has x = 0, so its y-value is the y-intercept/.test(text));
        assert.ok(intercept, `${label}: a step finds b`);
        const substituted = intercept.match(/^Substitute Row (\d+) \(([^,]+), ([^)]+)\) and m = (\S+) into y = mx \+ b: (\S+) = (.+?) \+ b, so b = (.+) = (\S+)\.$/);
        if (substituted) {
          const [, , x, y, mText, yAgain, product, , bText] = substituted;
          assert.ok(fr(mText).equals(m) && fr(yAgain).equals(fr(y)) && fr(bText).equals(b), `${label}: ${intercept}`);
          assert.ok(F(math.evaluate(ascii(product))).equals(m.mul(fr(x))), `${label}: m·x in ${intercept}`);
        } else {
          assert.ok(fr(intercept.match(/b = (\S+)\.$/)[1]).equals(b), `${label}: ${intercept}`);
        }
        const check = model.why.match(/^Check with Row (\d+) \(([^,]+), ([^)]+)\): (.+?) = (\S+), the y-value in the table/);
        assert.ok(check, `${label}: ${model.why}`);
        assert.ok(F(math.evaluate(ascii(check[4]))).equals(fr(check[3])), `${label}: ${check[0]}`);
      }
    }
  }

  // The note says any correct pairs count, and an equation is graded as a
  // line: probe the grader with another choice and another form.
  if (mode !== 'repairValue' && isLine(points)) {
    const pairs = [];
    for (let i = points.length - 1; i > 0 && pairs.length < work.intervals.length; i -= 1) {
      for (let j = i - 1; j >= 0 && pairs.length < work.intervals.length; j -= 1) {
        const [low, high] = points[i][0].lt(points[j][0]) ? [i, j] : [j, i];
        const [p, q] = [points[low], points[high]];
        pairs.push({ i: low, j: high, dx: q[0].sub(p[0]).toFraction(), dy: q[1].sub(p[1]).toFraction(), rate: rateOf(p, q).toFraction() });
      }
    }
    const other = { ...work, intervals: pairs };
    if (mode === 'deriveEquation') {
      const { m, b } = lineThrough(points);
      // m·x − y = −b, as a student might rearrange it.
      Object.assign(other, { equation: `(${m.toFraction()})x - y = ${b.neg().toFraction()}`, m: m.toFraction(), b: b.toFraction() });
    }
    const probe = gradeToolWork({ toolId: TOOL_ID, question, work: other });
    assert.equal(probe.isCorrect, true, `${label}: another correct choice is accepted (${JSON.stringify(other)})`);
  }

  const result = gradeToolWork({ toolId: TOOL_ID, question, work });
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated work (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
  assert.equal(result.isComplete, true, `${label}: complete`);
};

/** Should there be a review? Only the conditions under which the table has one answer. */
const expectReview = (question) => {
  const points = rowsOf(question);
  const pairs = (points.length * (points.length - 1)) / 2;
  if (need(question) > pairs) return false;
  if (question.mode === 'deriveEquation') return isLine(points);
  if (question.mode === 'repairValue') return Boolean(repairOf(points));
  return true;
};

/* ----------------------------------------------------------------- tests */

const KINDS = ['linear', 'nonlinear', 'deriveEquation', 'repairValue'];
const CASES = 250;

KINDS.forEach((kind, kindIndex) => {
  test(`linearTableWorkbench audit, ${kind}: ${CASES} seeded tables are recomputed exactly`, () => {
    const rand = prng(0x17ab + kindIndex * 104729);
    let reviewed = 0;
    for (let index = 0; index < CASES; index += 1) {
      const question = drawQuestion(rand, kind);
      const label = `${kind} #${index} ${JSON.stringify(question)}`;
      const model = buildLinearTableWorkbenchReview(question);
      assert.equal(Boolean(model), expectReview(question), `${label}: a review exactly when the table has one answer`);
      if (!model) continue;
      reviewed += 1;
      auditReview(question, model, label);
    }
    assert.ok(reviewed >= CASES * 0.6, `${kind}: most tables are reviewed (${reviewed})`);
  });
});

test('linearTableWorkbench audit: edge cases', () => {
  const q = (mode, rows, extra = {}) => ({ type: TOOL_ID, mode, rows, ...extra });
  const edges = [
    q('constantRate', [[0, 0], [1, 0], [2, 0]]),
    q('deriveEquation', [[-3, 0], [0, 0], [4, 0]], { requiredComparisons: 2 }),
    q('deriveEquation', [[-2, 2], [0, 0], [2, -2], [4, -4]], { requiredComparisons: 2 }),
    q('deriveEquation', [[1, 1], [2, 2], [5, 5]], { requiredComparisons: 1 }),
    q('deriveEquation', [[-1, 1], [1, -1], [3, -3]], { requiredComparisons: 1 }),
    q('deriveEquation', [[0.5, 0.25], [1.5, 0.75], [2.5, 1.25]], { requiredComparisons: 2 }),
    q('deriveEquation', [[-4, -0.1], [6, 0.9], [16, 1.9]], { requiredComparisons: 2 }),
    q('constantRate', [[-1, 1], [0, 0], [1, 1]], { requiredComparisons: 1 }),
    q('constantRate', [[3, 7], [-2, -3], [0, 1], [1, 3]], { requiredComparisons: 6 }),
    q('repairValue', [[0, 0], [1, 1], [2, 2], [3, 10]], { requiredComparisons: 2 }),
    q('repairValue', [[0, -5], [1, 1], [2, 2], [3, 3]], { requiredComparisons: 6 }),
    q('repairValue', [[-2, 4], [-1, 4], [0, 9], [1, 4], [2, 4]], { requiredComparisons: 3 }),
    q('repairValue', [[0, 0], [1, 0], [2, 1], [3, 0]], { requiredComparisons: 2 }),
    q('repairValue', [[0, 1], [1, 3], [2, 5], [3, 7]], { requiredComparisons: 2 }),
    // Decimal cells whose differences are not exact in floating point.
    q('deriveEquation', [[0.1, 0.3], [0.2, 0.6], [0.3, 0.9], [0.7, 2.1]], { requiredComparisons: 3 }),
    q('constantRate', [[0.1, 0.7], [0.2, 0.4], [0.3, 0.1]], { requiredComparisons: 3 }),
    q('repairValue', [[0.1, 1.1], [0.2, 1.2], [0.3, 1.9], [0.4, 1.4]], { requiredComparisons: 2 }),
    q('constantRate', [[0, 0.1], [1, 0.2], [2, 0.4]], { requiredComparisons: 2 }),
  ];
  edges.forEach((question, index) => {
    const label = `edge #${index} ${JSON.stringify(question)}`;
    const model = buildLinearTableWorkbenchReview(question);
    assert.equal(Boolean(model), expectReview(question), `${label}: a review exactly when the table has one answer`);
    if (model) auditReview(question, model, label);
  });
});
