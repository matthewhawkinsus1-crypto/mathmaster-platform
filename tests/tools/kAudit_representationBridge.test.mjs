import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildRepresentationBridgeReview } from '../../src/tools/shared/reviews/representationBridgeReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';

/*
 * JOB K AUDIT — THE REPRESENTATION BRIDGE'S WORKED SOLUTION, RECOMPUTED.
 *
 * Job A shipped buildRepresentationBridgeReview without the independent
 * mathematics review it planned. This file is that review, for both boards
 * the grader grades:
 *
 *   linear (the bridge)   seeded linear tables — whole, negative, fractional
 *                         and zero slopes, rows out of order, every subset of
 *                         stages and interval count;
 *   the Multiple Representations board
 *                         seeded lines from every GIVEN kind (standard form,
 *                         slope-intercept, point-slope, two points, a graph,
 *                         a table, a situation), in Worksheet Mode and in
 *                         Process Mode, with every card set.
 *
 * Every number and equation the review shows is recomputed here with exact
 * fractions (mathjs in Fraction mode) from the question itself, never with
 * the tool's helpers: the intervals, m, b, the zero, each equation (it must
 * be the line, in the form its card names), each point (on the line; the
 * intercepts where they say), standard form's integer, reduced, A > 0 shape,
 * every "a = b" chain in the steps and the check, every equation the steps
 * pass through. The shared grader must mark the stated work correct and
 * complete, the display must be clean, and a null review must be one the
 * line cannot have (no zero for a flat line, a vertical line).
 */

const TOOL_ID = 'representationBridge';
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
const subset = (rand, list) => {
  const chosen = list.filter(() => rand() < 0.5);
  return chosen.length ? chosen : [pick(rand, list)];
};

const STAGES = ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'];
const CONTEXT = {
  inputLabel: 'hours', outputLabel: 'distance', inputUnit: 'hours', outputUnit: 'miles',
  rateUnit: 'miles per hour', rateMeaning: 'distance covered each hour',
  yInterceptMeaning: 'distance from the start at hour 0',
  zeroMeaning: 'hour at which the distance is 0',
};

// A table an author types: decimal cells (a rate of halves, quarters, fifths).
const decimalRate = (rand) => F(intIn(rand, -6, 6) * pick(rand, [1, 1, 3])).div(pick(rand, [1, 1, 2, 4, 5]));

const drawBridge = (rand) => {
  const m = decimalRate(rand);
  const b = F(intIn(rand, -20, 20)).div(pick(rand, [1, 2]));
  const count = intIn(rand, 3, 6);
  const xs = new Set();
  while (xs.size < count) xs.add(intIn(rand, -8, 8));
  const rows = shuffle(rand, [...xs]).map((x) => ({ x, y: m.mul(x).add(b).valueOf() }));
  const question = { type: TOOL_ID, mode: pick(rand, ['linear', 'linear', undefined]), source: { kind: 'table', rows }, context: { ...CONTEXT } };
  if (question.mode === undefined) delete question.mode;
  if (rand() < 0.6) question.requiredStages = subset(rand, STAGES);
  if (rand() < 0.7) question.requiredComparisons = pick(rand, [1, 2, 3, 4, 10]);
  if (rand() < 0.2) question.graphBounds = { xMin: -12, xMax: 12, yMin: -40, yMax: 40 };
  return { question, m, b };
};

// A line: a slope of halves, thirds or quarters sometimes, an intercept likewise.
const lineValue = (rand, range) => F(intIn(rand, -range, range)).div(pick(rand, [1, 1, 1, 2, 3, 4]));
const CARDS = ['standardForm', 'slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graphIntercepts', 'graphSlopeIntercept', 'graphPointSlope'];
const KINDS = ['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'graph', 'table', 'scenario'];

const drawBoard = (rand, kind, processMode) => {
  let m; let b; let source;
  const point = () => [intIn(rand, -6, 6), intIn(rand, -6, 6)];
  if (kind === 'standardForm') {
    let A; let B;
    do { A = intIn(rand, -6, 6); B = intIn(rand, -6, 6); } while (B === 0);
    const C = intIn(rand, -12, 12);
    m = F(-A).div(B); b = F(C).div(B);
    const term = (k, variable) => (k === 1 ? variable : k === -1 ? `-${variable}` : `${k}${variable}`);
    const equation = A === 0 ? `${term(B, 'y')} = ${C}` : `${term(A, 'x')} ${B < 0 ? '-' : '+'} ${term(Math.abs(B), 'y')} = ${C}`;
    source = rand() < 0.5 ? { kind, A, B, C } : { kind, equation };
  } else if (kind === 'slopeIntercept' || kind === 'scenario') {
    m = lineValue(rand, 6); b = lineValue(rand, 10);
    // Authored the way a teacher types them: decimals (thirds only as text).
    const usable = (value) => value.d === 1 || [2, 4].includes(Number(value.d));
    if (!usable(m) || !usable(b) || rand() < 0.3) {
      const text = (value) => (value.d === 1 ? String(value.valueOf()) : `(${value.toFraction()})`);
      source = { kind: kind === 'scenario' ? 'slopeIntercept' : kind, equation: `y = ${text(m)}x + ${text(b)}` };
    } else {
      source = kind === 'scenario' ? { kind, rate: m.valueOf(), initialValue: b.valueOf(), prompt: 'A quantity changes at a steady rate.' } : { kind, m: m.valueOf(), b: b.valueOf() };
    }
  } else if (kind === 'pointSlope') {
    const p = point();
    m = lineValue(rand, 4);
    b = F(p[1]).sub(m.mul(p[0]));
    source = [2, 4, 1].includes(Number(m.d)) && rand() < 0.5
      ? { kind, point: p, m: m.valueOf() }
      : { kind, equation: `y ${p[1] < 0 ? '+' : '-'} ${Math.abs(p[1])} = ${m.d === 1 ? m.valueOf() : `(${m.toFraction()})`}(x ${p[0] < 0 ? '+' : '-'} ${Math.abs(p[0])})` };
  } else {
    let p; let q;
    do { p = point(); q = point(); } while (p[0] === q[0]);
    m = F(q[1] - p[1]).div(q[0] - p[0]); b = F(p[1]).sub(m.mul(p[0]));
    if (kind === 'table') {
      // Rows along the line at whole-number steps of the run.
      const run = Number(m.d);
      const start = intIn(rand, -3, 1);
      const rows = [0, 1, 2, 3].map((k) => ({ x: (start + k) * run, y: m.mul((start + k) * run).add(b).valueOf() }));
      source = { kind, rows };
    } else {
      source = { kind, points: rand() < 0.3 ? [{ x: p[0], y: p[1] }, { x: q[0], y: q[1] }] : [p, q] };
    }
  }
  const question = { type: TOOL_ID, mode: 'linearMultipleRepresentations', source, feedbackTiming: 'guided' };
  if (processMode) question.interactionMode = 'process';
  if (rand() < 0.5) question.requiredCards = subset(rand, CARDS);
  return { question, m, b };
};

/* -------------------------------------------------- reading the display */

const ascii = (text) => String(text).replace(/−/g, '-').replace(/÷/g, '/');
const fr = (text) => {
  const clean = ascii(text).trim();
  assert.match(clean, /^-?\d+(?:\.\d+)?(?:\/\d+)?$/, `a number as the review writes one: "${text}"`);
  return math.evaluate(clean);
};
const pointsIn = (text) => [...String(text).matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => [fr(x), fr(y)]);
const isNumericSide = (text) => /^[−\-\d\s.+/÷()]+$/.test(text.trim()) && /\d/.test(text);
const same = (left, right) => F(left).equals(F(right));

const lineOf = ({ m, b }) => ({ m: F(m), b: F(b) });
const onLine = (line, [x, y]) => y.equals(line.m.mul(x).add(line.b));

/** The equation describes exactly this line. */
const assertIsLine = (text, line, label) => {
  const sides = ascii(text).split('=');
  assert.equal(sides.length, 2, `${label}: one equation in "${text}"`);
  const [left, right] = sides.map((side) => math.compile(side.trim()));
  const f = (x, y) => F(left.evaluate({ x, y })).sub(F(right.evaluate({ x, y })));
  [F(0), F(1), F(-3)].forEach((x) => assert.ok(f(x, line.m.mul(x).add(line.b)).equals(0), `${label}: "${text}" holds on the line at x = ${x}`));
  assert.ok(!f(F(0), line.b.add(1)).equals(0), `${label}: "${text}" is a line, not an identity`);
};

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertHygiene = (text, label) => {
  assert.doesNotMatch(text, /NaN|undefined|Infinity|\bnull\b|\[object/, `${label}: no broken value in "${text}"`);
  assert.doesNotMatch(text, /\+ [−-]|[−-] [−-]\d|−−|--|-−|−-/, `${label}: no doubled sign in "${text}"`);
  assert.doesNotMatch(text, /(^|[^\d./])[01][xy]\b/, `${label}: no 1x or 0x in "${text}"`);
  assert.doesNotMatch(text, /[−-]0(?![.\d/])/, `${label}: no −0 in "${text}"`);
  assert.doesNotMatch(text, /÷ [−-]/, `${label}: a negative divisor is bracketed in "${text}"`);
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
      assert.ok(same(math.evaluate(ascii(sides[index - 1])), math.evaluate(ascii(sides[index]))), `${label}: "${sides[index - 1]} = ${sides[index]}" is false in "${text}"`);
      checked += 1;
    }
  });
  return checked;
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;
const auditText = (model, label) => {
  [model.title, model.why, model.note || '', ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])]
    .forEach((text) => assertHygiene(text, label));
  [...model.steps, model.why].forEach((text) => assertArithmeticChains(text, label));
};

/* ----------------------------------------------------- the bridge audit */

const auditBridge = ({ question, m, b }, model, label) => {
  auditText(model, label);
  const line = lineOf({ m, b });
  const rows = question.source.rows.map((row) => [F(row.x), F(row.y)]);
  const work = {};
  const intervals = model.items.filter((item) => /^Row \d+ → Row \d+$/.test(item.label)).map((item) => {
    const [, i, j] = item.label.match(/^Row (\d+) → Row (\d+)$/).map(Number);
    const [, dx, dy, rate] = item.value.match(/^Δx = (\S+), Δy = (\S+), rate = (\S+)$/);
    const [p, q] = [rows[i - 1], rows[j - 1]];
    assert.ok(p[0].lt(q[0]), `${label}: from the smaller x`);
    assert.ok(q[0].sub(p[0]).equals(fr(dx)) && q[1].sub(p[1]).equals(fr(dy)) && fr(rate).equals(m), `${label}: ${item.label} ${item.value}`);
    return { i: i - 1, j: j - 1, dx, dy, rate };
  });
  if (intervals.length) {
    const required = Math.min(Number(question.requiredComparisons) || 3, (rows.length * (rows.length - 1)) / 2);
    assert.ok(intervals.length >= required, `${label}: enough intervals`);
    assert.ok(fr(itemValue(model, 'm (your slope)')).equals(m), `${label}: m`);
    work.tableEvidence = intervals;
    work.studentSlope = itemValue(model, 'm (your slope)');
    work.rateConclusion = 'constant';
  }
  if (itemValue(model, 'General form equation')) {
    assert.ok(fr(itemValue(model, 'General form: m')).equals(m) && fr(itemValue(model, 'General form: b')).equals(b), `${label}: m and b`);
    assert.match(itemValue(model, 'General form equation'), /^y = /, `${label}: general form is y = …`);
    assertIsLine(itemValue(model, 'General form equation'), line, `${label} general form`);
    work.generalForm = { m: itemValue(model, 'General form: m'), b: itemValue(model, 'General form: b'), equation: itemValue(model, 'General form equation') };
  }
  const zero = m.equals(0) ? null : b.neg().div(m);
  if (itemValue(model, 'Factored form equation')) {
    assert.ok(fr(itemValue(model, 'Factored form: a')).equals(m) && fr(itemValue(model, 'Factored form: c')).equals(zero), `${label}: a and c`);
    const factored = itemValue(model, 'Factored form equation');
    assert.match(factored, /^y = \S+\(x [+-] [\d/]+\)$/, `${label}: y = a(x − c): ${factored}`);
    assertIsLine(factored, line, `${label} factored form`);
    work.factoredForm = { a: itemValue(model, 'Factored form: a'), c: itemValue(model, 'Factored form: c'), equation: factored };
    const step = model.steps.find((text) => text.startsWith('Factored form:'));
    const solved = step.match(/Set 0 = (.+?): x = (.+?) = (\S+), so c = /);
    assert.ok(solved, `${label}: ${step}`);
    assertIsLine(`0 = ${solved[1]}`.replace(/^0 = /, 'y = '), line, `${label} right side`);
    assert.ok(F(math.evaluate(ascii(solved[2]))).equals(zero) && fr(solved[3]).equals(zero), `${label}: ${solved[0]}`);
  }
  if (itemValue(model, 'Graph points')) {
    const points = pointsIn(itemValue(model, 'Graph points'));
    assert.equal(points.length, 2, label);
    assert.ok(points[0][0].equals(zero) && points[0][1].equals(0), `${label}: the graph starts at the x-intercept`);
    assert.ok(onLine(line, points[1]) && !points[1][0].equals(points[0][0]), `${label}: a second point on the line`);
    work.graphConstruction = { points: points.map((point) => point.map((value) => value.valueOf())) };
  }
  const meanings = {};
  model.items.forEach((item) => {
    const concept = item.label.match(/^Meaning of ([mbc]) = (\S+)$/);
    if (!concept) return;
    assert.ok(fr(concept[2]).equals({ m, b: b, c: zero }[concept[1]]), `${label}: ${item.label}`);
    const [, unit, contextMeaning, mathRole] = item.value.match(/^Unit: (.*) · Meaning: (.*) · Role: (.*)$/);
    meanings[{ m: 'rate', b: 'yIntercept', c: 'zero' }[concept[1]]] = { unit, contextMeaning, mathRole };
  });
  if (Object.keys(meanings).length) work.meaningAssignments = meanings;

  // The b step: from the x = 0 row, or by substitution.
  const general = model.steps.find((text) => /Substitute Row \d+ .+ into y = mx \+ b|has x = 0, so its y-value is the y-intercept/.test(text));
  if (itemValue(model, 'General form equation')) {
    assert.ok(general, `${label}: a step finds b`);
    const substituted = general.match(/Substitute Row (\d+) \(([^,]+), ([^)]+)\) and m = (\S+) into y = mx \+ b: (\S+) = (.+?) \+ b, so b = (.+?) = (\S+)\. So the equation is (.+)\.$/);
    if (substituted) {
      const [, row, x, y, mText, yAgain, product, , bText, equation] = substituted;
      assert.ok(rows[row - 1][0].equals(fr(x)) && rows[row - 1][1].equals(fr(y)) && fr(yAgain).equals(fr(y)), `${label}: Row ${row}`);
      assert.ok(fr(mText).equals(m) && F(math.evaluate(ascii(product))).equals(m.mul(fr(x))) && fr(bText).equals(b), `${label}: ${general}`);
      assertIsLine(equation, line, `${label} general step`);
    } else {
      const read = general.match(/Row (\d+) \(0, (\S+)\) has x = 0, so its y-value is the y-intercept: b = (\S+)\. So the equation is (.+)\.$/);
      assert.ok(read && fr(read[2]).equals(b) && fr(read[3]).equals(b), `${label}: ${general}`);
      assertIsLine(read[4], line, `${label} general step`);
    }
  }
  // The check: a(x − c) expands to the general form, the zero works, a row fits.
  const expanded = model.why.match(/^Check: expanding a\(x − c\) gives (.+?) = (.+?), the general form/);
  if (expanded) {
    assertIsLine(`y = ${expanded[1]}`, line, `${label} expansion`);
    assertIsLine(`y = ${expanded[2]}`, line, `${label} expanded general form`);
  }
  const rowCheck = model.why.match(/Row (\d+) \(([^,]+), ([^)]+)\): (.+?) = (\S+?)(?: —|\. One line)/);
  assert.ok(rowCheck, `${label}: ${model.why}`);
  assert.ok(rows[rowCheck[1] - 1][0].equals(fr(rowCheck[2])) && rows[rowCheck[1] - 1][1].equals(fr(rowCheck[3])), `${label}: the checked row`);

  const result = gradeToolWork({ toolId: TOOL_ID, question, work });
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated work (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
  assert.equal(result.isComplete, true, `${label}: complete`);
};

/* ------------------------------------------------------ the board audit */

const CARD_FIELDS = {
  'Standard form': 'standardFormEquation',
  'Slope-intercept form': 'slopeInterceptEquation',
  'Point-slope form': 'pointSlopeEquation',
  Slope: 'featureSlope',
  'x-intercept': 'featureXIntercept',
  'y-intercept': 'featureYIntercept',
};
const GRAPH_FIELDS = { 'Graph 1 (intercepts)': 'graph1Points', 'Graph 2 (slope-intercept)': 'graph2Points', 'Graph 3 (point-slope)': 'graph3Points' };

const auditBoard = ({ question, m, b }, model, label) => {
  auditText(model, label);
  const line = lineOf({ m, b });
  const zero = m.equals(0) ? null : b.neg().div(m);
  const work = {};
  model.items.forEach(({ label: itemLabel, value }) => {
    const where = `${label} ${itemLabel}`;
    if (itemLabel === 'Standard form') {
      const match = value.match(/^(-?\d*)x ([+-]) (\d*)y = (-?\d+)$|^(-?\d*)y = (-?\d+)$/);
      assert.ok(match, `${where}: Ax + By = C with whole numbers: ${value}`);
      const coefficient = (text) => (text === '' ? 1 : text === '-' ? -1 : Number(text));
      const [A, B, C] = match[1] !== undefined
        ? [coefficient(match[1]), (match[2] === '-' ? -1 : 1) * coefficient(match[3]), Number(match[4])]
        : [0, coefficient(match[5]), Number(match[6])];
      assert.ok(A > 0 || (A === 0 && B > 0), `${where}: a positive leading coefficient`);
      assert.equal(gcd(gcd(A, B), C), 1, `${where}: reduced`);
      assertIsLine(value, line, where);
    } else if (itemLabel === 'Slope-intercept form') {
      assert.match(value, /^y = /, where);
      assert.doesNotMatch(value.slice(4), /y/, where);
      assertIsLine(value, line, where);
    } else if (itemLabel === 'Point-slope form') {
      const match = value.match(/^y ([+-]) ([\d/]+) = (-?\d+|\(-?\d+\/\d+\))\(x ([+-]) ([\d/]+)\)$/);
      assert.ok(match, `${where}: y − y₁ = m(x − x₁): ${value}`);
      const point = [fr(match[5]).mul(match[4] === '-' ? 1 : -1), fr(match[2]).mul(match[1] === '-' ? 1 : -1)];
      assert.ok(onLine(line, point), `${where}: (x₁, y₁) is on the line`);
      assert.ok(fr(match[3].replace(/[()]/g, '')).equals(m), `${where}: the slope`);
      assertIsLine(value, line, where);
    } else if (itemLabel === 'Slope') {
      assert.ok(fr(value).equals(m), where);
    } else if (itemLabel === 'x-intercept') {
      const [[x, y]] = pointsIn(value);
      assert.ok(x.equals(zero) && y.equals(0), where);
    } else if (itemLabel === 'y-intercept') {
      const [[x, y]] = pointsIn(value);
      assert.ok(x.equals(0) && y.equals(b), where);
    } else if (itemLabel === 'Two points on the line' || itemLabel === 'Table of values' || GRAPH_FIELDS[itemLabel]) {
      const points = pointsIn(value);
      points.forEach((point) => assert.ok(onLine(line, point), `${where}: (${point.join(', ')}) on the line`));
      assert.equal(new Set(points.map((point) => point[0].toFraction())).size, points.length, `${where}: different points`);
      if (itemLabel === 'Table of values') assert.ok(points.length >= 4, where);
      if (itemLabel === 'Graph 1 (intercepts)') {
        assert.ok(points.some(([x, y]) => x.equals(0) && y.equals(b)), `${where}: the y-intercept`);
        assert.ok(points.some(([x, y]) => x.equals(zero) && y.equals(0)), `${where}: the x-intercept`);
      }
      if (itemLabel === 'Graph 2 (slope-intercept)') assert.ok(points[0][0].equals(0) && points[0][1].equals(b), `${where}: starts at the y-intercept`);
    }
    if (CARD_FIELDS[itemLabel]) work[CARD_FIELDS[itemLabel]] = value;
    else if (GRAPH_FIELDS[itemLabel]) work[GRAPH_FIELDS[itemLabel]] = pointsIn(value).map((point) => point.map((v) => v.valueOf()));
    else if (itemLabel === 'Two points on the line') [work.featurePoint1, work.featurePoint2] = value.split(' and ');
    else if (itemLabel === 'Table of values') work.tableRows = [...value.matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => ({ x, y }));
    else assert.fail(`${label}: an item with no board field: ${itemLabel}`);
  });
  if (question.interactionMode === 'process') work.processLog = keyProcessLog(question);

  // The note says any point on the line works for point-slope form: probe the
  // grader with a point the review did not use (Graph 3, which starts at the
  // point-slope point, moves with it).
  if (work.pointSlopeEquation && question.interactionMode !== 'process') {
    const x1 = F(Number(m.d) * 2);
    const y1 = m.mul(x1).add(b);
    const text = (value, variable) => (value.s < 0 || value.n < 0 ? `${variable} + ${value.abs().toFraction()}` : `${variable} - ${value.toFraction()}`);
    const slope = m.d === 1n || m.d === 1 ? m.toFraction() : `(${m.toFraction()})`;
    const other = { ...work, pointSlopeEquation: `${text(y1, 'y')} = ${slope}(${text(x1, 'x')})` };
    if (work.graph3Points) other.graph3Points = [[x1, y1], [x1.add(1), y1.add(m)]].map((point) => point.map((value) => value.valueOf()));
    assert.equal(gradeToolWork({ toolId: TOOL_ID, question, work: other }).isCorrect, true, `${label}: point-slope through another point (${other.pointSlopeEquation}) is accepted`);
  }

  // Equations the steps pass through are the line.
  model.steps.forEach((text) => {
    const solved = text.match(/^Solve the GIVEN (.+?) for y with Step Algebra: (.+?)\.(?: |$)/);
    if (solved) {
      assertIsLine(solved[1], line, `${label} the GIVEN`);
      solved[2].split(', then ').forEach((equation) => assertIsLine(equation, line, `${label} Step Algebra`));
    }
    const substituted = text.match(/substitute ([xy]) = 0 into .+? and solve(?: \((.+?)\))?: ([xy]) = (\S+), so the (x|y)-intercept is \(([^,]+), ([^)]+)\)\./);
    if (substituted) {
      const [, , equation, , value, which, px, py] = substituted;
      const expected = which === 'x' ? zero : b;
      assert.ok(fr(value).equals(expected), `${label}: ${substituted[0]}`);
      assert.ok(which === 'x' ? fr(px).equals(zero) && fr(py).equals(0) : fr(px).equals(0) && fr(py).equals(b), `${label}: ${substituted[0]}`);
      if (equation) {
        // The opened equation is the line with the variable set to 0, and the stated value solves it.
        const [left, right] = ascii(equation).split('=').map((side) => math.compile(side.trim()));
        const scope = which === 'x' ? { x: fr(value), y: F(0) } : { x: F(0), y: fr(value) };
        assert.ok(same(left.evaluate(scope), right.evaluate(scope)), `${label}: ${equation} at ${value}`);
      }
    }
    // Whatever a sentence names as an intercept, a point on the line, or a table row, is one.
    for (const [, which, x, y] of text.matchAll(/(x|y)-(?:intercept is|axis at) \(([^,()]+), ([^,()]+)\)/g)) {
      assert.ok(which === 'x' ? fr(x).equals(zero) && fr(y).equals(0) : fr(x).equals(0) && fr(y).equals(b), `${label}: the ${which}-intercept in "${text}"`);
    }
    for (const [, x, y] of text.matchAll(/\(([^,()]+), ([^,()]+)\),? is on the (?:GIVEN graph's )?line/g)) {
      assert.ok(onLine(line, [fr(x), fr(y)]), `${label}: (${x}, ${y}) is on the line in "${text}"`);
    }
    for (const [, row, x, y] of text.matchAll(/Row (\d+)(?: of the table,)? \(([^,()]+), ([^,()]+)\)/g)) {
      const authored = question.source.rows?.[row - 1];
      assert.ok(authored && F(authored.x ?? authored[0]).equals(fr(x)) && F(authored.y ?? authored[1]).equals(fr(y)), `${label}: Row ${row} in "${text}"`);
    }
    const scenario = text.match(/the rate of change \(the slope\) is (\S+); it starts at (\S+), so/);
    if (scenario) assert.ok(fr(scenario[1]).equals(m) && fr(scenario[2]).equals(b), `${label}: ${text}`);
    const pointSlopeRead = text.match(/so read m = (\S+) and the point \(x₁, y₁\) = \(([^,]+), ([^)]+)\)\.$/);
    if (pointSlopeRead) assert.ok(fr(pointSlopeRead[1]).equals(m) && onLine(line, [fr(pointSlopeRead[2]), fr(pointSlopeRead[3])]), `${label}: ${text}`);
    const slopeFormula = text.match(/^Slope: use the slope formula on \(([^,]+), ([^)]+)\) and \(([^,]+), ([^)]+)\)/);
    if (slopeFormula) {
      const [p, q] = [[fr(slopeFormula[1]), fr(slopeFormula[2])], [fr(slopeFormula[3]), fr(slopeFormula[4])]];
      assert.ok(onLine(line, p) && onLine(line, q), `${label}: the slope formula's points are on the line`);
    }
    const riseRun = text.match(/go from \(([^,]+), ([^)]+)\) to \(([^,]+), ([^)]+)\) — the rise is (\S+) and the run is (\S+) — so m = rise ÷ run = .+ = (\S+)\.$/);
    if (riseRun) {
      const [p, q] = [[fr(riseRun[1]), fr(riseRun[2])], [fr(riseRun[3]), fr(riseRun[4])]];
      assert.ok(onLine(line, p) && onLine(line, q), `${label}: rise/run points on the line`);
      assert.ok(q[1].sub(p[1]).equals(fr(riseRun[5])) && q[0].sub(p[0]).equals(fr(riseRun[6])) && fr(riseRun[7]).equals(m), `${label}: ${riseRun[0]}`);
    }
    const delta = text.match(/Δy = .+? = (\S+) and Δx = .+? = (\S+), so m = Δy ÷ Δx = (\S+)\.$/);
    if (delta) assert.ok(fr(delta[1]).div(fr(delta[2])).equals(fr(delta[3])) && fr(delta[3]).equals(m), `${label}: ${delta[0]}`);
    const extend = text.match(/from Row \d+ \(([^,]+), ([^)]+)\), a change of (\S+) in x changes y by .+ = (\S+) — so the (x|y)-intercept is \(([^,]+), ([^)]+)\)/);
    if (extend) {
      const from = [fr(extend[1]), fr(extend[2])];
      const to = [fr(extend[6]), fr(extend[7])];
      assert.ok(onLine(line, from) && onLine(line, to) && from[0].add(fr(extend[3])).equals(to[0]) && from[1].add(fr(extend[4])).equals(to[1]), `${label}: ${extend[0]}`);
    }
    const choose = text.match(/^A point: choose x = (\S+) and compute y = .+ = (\S+), so \(([^,]+), ([^)]+)\) is on the line\.$/);
    if (choose) assert.ok(line.m.mul(fr(choose[1])).add(line.b).equals(fr(choose[2])), `${label}: ${text}`);
    const solveForB = text.match(/so b = .+ = (\S+) and the y-intercept is/);
    if (solveForB) assert.ok(fr(solveForB[1]).equals(b), `${label}: ${text}`);
    const read = text.match(/read m = (\S+) and b = (\S+) — /) || text.match(/m = (\S+), and b = (\S+), so/);
    if (read) assert.ok(fr(read[1]).equals(m) && fr(read[2]).equals(b), `${label}: ${text}`);
    const standard = text.match(/^Standard form: (?:multiply every term of (.+?) by (\d+) to clear the fractions|start from (.+?))(?:, then move the x-term to the left: (.+?)|: there is no x-term.+?)(?:;| —) (.+)\. Standard form: (.+)\.$|^Standard form: .+? so this is standard form: (.+)\.$/);
    if (text.startsWith('Standard form:')) {
      assert.ok(standard, `${label}: ${text}`);
      const finalEquation = standard[6] || standard[7];
      assertIsLine(finalEquation, line, `${label} standard step`);
      if (standard[4]) {
        assertIsLine(standard[4], line, `${label} moved`);
        // The stated finishing moves turn the moved equation into the final one.
        const coefficients = (equation) => {
          const f = math.compile(`(${ascii(equation).split('=')[0]}) - (${ascii(equation).split('=')[1]})`);
          const at = (x, y) => F(f.evaluate({ x: F(x), y: F(y) }));
          const C = at(0, 0).neg();
          return [at(1, 0).add(at(0, 0).neg()).valueOf(), at(0, 1).add(at(0, 0).neg()).valueOf(), C.valueOf()];
        };
        let raw = coefficients(standard[4]);
        if (/multiply every term by −1/.test(standard[5] || '')) raw = raw.map((value) => -value);
        const divisor = (standard[5] || '').match(/divide every term by (\d+)/);
        if (divisor) raw = raw.map((value) => value / Number(divisor[1]));
        assert.deepEqual(raw.map((value) => value + 0), coefficients(finalEquation).map((value) => value + 0), `${label}: the finishing moves give ${finalEquation}`);
      }
    }
  });

  // The check: both points satisfy standard form, as substituted, and give the slope.
  const check = model.why.match(/^Check: \(([^,]+), ([^)]+)\) and \(([^,]+), ([^)]+)\) both satisfy (.+?) — (.+?) = (\S+) and (.+?) = (\S+) — and the slope between them is .+ = (\S+) = m\./);
  assert.ok(check, `${label}: ${model.why}`);
  const [p, q] = [[fr(check[1]), fr(check[2])], [fr(check[3]), fr(check[4])]];
  assert.ok(onLine(line, p) && onLine(line, q), `${label}: the checked points are on the line`);
  assertIsLine(check[5], line, `${label} check`);
  const leftAt = ([x, y]) => F(math.evaluate(ascii(check[5]).split('=')[0], { x, y }));
  assert.ok(F(math.evaluate(ascii(check[6]))).equals(leftAt(p)) && F(math.evaluate(ascii(check[8]))).equals(leftAt(q)), `${label}: the substitutions are standard form's left side`);
  assert.ok(fr(check[10]).equals(m), `${label}: the slope`);

  const result = gradeToolWork({ toolId: TOOL_ID, question, work });
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated work (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
  assert.equal(result.isComplete, true, `${label}: complete`);
};

/* ----------------------------------------------------------------- tests */

test('representationBridge audit, the bridge: 300 seeded tables are recomputed exactly', () => {
  const rand = prng(0x5eed);
  let reviewed = 0;
  for (let index = 0; index < 300; index += 1) {
    const draw = drawBridge(rand);
    const label = `bridge #${index} ${JSON.stringify(draw.question)}`;
    const model = buildRepresentationBridgeReview(draw.question);
    const stages = draw.question.requiredStages || STAGES;
    const needsZero = stages.some((stage) => ['factoredForm', 'graph', 'meaning'].includes(stage));
    // The only table here with no one answer is a flat one asked for its zero.
    assert.equal(Boolean(model), !(needsZero && draw.m.equals(0)), `${label}: a review exactly when the table has one answer`);
    if (!model) continue;
    reviewed += 1;
    auditBridge(draw, model, label);
  }
  assert.ok(reviewed >= 200, `bridge reviews (${reviewed})`);
});

KINDS.forEach((kind, kindIndex) => {
  [false, true].forEach((processMode) => {
    test(`representationBridge audit, the board from a GIVEN ${kind}${processMode ? ' (Process Mode)' : ''}: 150 seeded lines are recomputed exactly`, () => {
      const rand = prng(0xb0a7d + kindIndex * 31 + (processMode ? 7 : 0));
      let reviewed = 0;
      for (let index = 0; index < 150; index += 1) {
        const draw = drawBoard(rand, kind, processMode);
        const label = `board ${kind}${processMode ? ' process' : ''} #${index} ${JSON.stringify(draw.question)}`;
        const model = buildRepresentationBridgeReview(draw.question);
        const cards = draw.question.requiredCards || CARDS;
        const wantsZero = cards.includes('xIntercept') || cards.includes('graphIntercepts');
        if (!processMode) {
          // A Worksheet board has one answer unless its line is flat and a card needs the zero.
          // (A board asking only for its GIVEN card has nothing to grade.)
          const given = { standardForm: 'standardForm', slopeIntercept: 'slopeIntercept', pointSlope: 'pointSlope', twoPoints: 'twoPoints', table: 'table' }[draw.question.source.kind];
          const asked = cards.filter((card) => card !== given);
          const expected = asked.length > 0 && !(draw.m.equals(0) && (wantsZero || !asked.length));
          assert.equal(Boolean(model), expected, `${label}: a review exactly when the board has one answer`);
        } else if (draw.m.equals(0) && wantsZero) {
          assert.equal(model, null, `${label}: a flat line has no x-intercept`);
        }
        if (!model) continue;
        reviewed += 1;
        auditBoard(draw, model, label);
      }
      assert.ok(reviewed >= 75, `${kind}: reviews (${reviewed})`);
    });
  });
});

test('representationBridge audit: edge cases', () => {
  const bridge = (rows, extra = {}) => ({ type: TOOL_ID, mode: 'linear', source: { kind: 'table', rows }, context: { ...CONTEXT }, ...extra });
  const board = (source, extra = {}) => ({ type: TOOL_ID, mode: 'linearMultipleRepresentations', source, feedbackTiming: 'guided', ...extra });
  const bridges = [
    { question: bridge([{ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }], { requiredStages: ['rateEvidence', 'generalForm'] }), m: F(0), b: F(0) },
    { question: bridge([{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: -2 }]), m: F(-1), b: F(0) },
    { question: bridge([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]), m: F(1), b: F(0) },
    { question: bridge([{ x: 0, y: -0.5 }, { x: 2, y: 0.5 }, { x: 4, y: 1.5 }]), m: F(1, 2), b: F(-1, 2) },
    { question: bridge([{ x: -6, y: 5 }, { x: -2, y: 4 }, { x: 2, y: 3 }]), m: F(-1, 4), b: F(7, 2) },
    { question: bridge([{ x: 3, y: -7 }, { x: 1, y: -3 }, { x: -1, y: 1 }], { requiredStages: ['factoredForm', 'graph'] }), m: F(-2), b: F(-1) },
  ];
  bridges.forEach((draw, index) => {
    const model = buildRepresentationBridgeReview(draw.question);
    assert.ok(model, `bridge edge #${index}`);
    auditBridge(draw, model, `bridge edge #${index}`);
  });
  const boards = [
    { question: board({ kind: 'slopeIntercept', m: 1, b: 0 }), m: F(1), b: F(0) },
    { question: board({ kind: 'slopeIntercept', m: -1, b: 0 }), m: F(-1), b: F(0) },
    { question: board({ kind: 'slopeIntercept', m: 0, b: -3 }, { requiredCards: ['standardForm', 'pointSlope', 'slope', 'yIntercept', 'table', 'graphSlopeIntercept', 'graphPointSlope'] }), m: F(0), b: F(-3) },
    { question: board({ kind: 'slopeIntercept', m: 0, b: 0 }, { requiredCards: ['standardForm', 'slope', 'yIntercept', 'graphSlopeIntercept'] }), m: F(0), b: F(0) },
    { question: board({ kind: 'standardForm', A: 0, B: -2, C: 6 }, { requiredCards: ['slopeIntercept', 'pointSlope', 'yIntercept'] }), m: F(0), b: F(-3) },
    { question: board({ kind: 'standardForm', A: -2, B: -4, C: -8 }), m: F(-1, 2), b: F(2) },
    { question: board({ kind: 'pointSlope', point: [0, 0], m: 3 }), m: F(3), b: F(0) },
    { question: board({ kind: 'pointSlope', point: [-2, 0], m: -0.5 }), m: F(-1, 2), b: F(-1) },
    { question: board({ kind: 'twoPoints', points: [[-3, 2], [3, 2]] }, { requiredCards: ['standardForm', 'slopeIntercept', 'pointSlope', 'graphPointSlope'] }), m: F(0), b: F(2) },
    { question: board({ kind: 'graph', points: [[0, 0], [4, 3]] }, { interactionMode: 'process' }), m: F(3, 4), b: F(0) },
    { question: board({ kind: 'table', rows: [{ x: -2, y: 7 }, { x: 0, y: 3 }, { x: 2, y: -1 }, { x: 4, y: -5 }] }, { interactionMode: 'process' }), m: F(-2), b: F(3) },
  ];
  boards.forEach((draw, index) => {
    const model = buildRepresentationBridgeReview(draw.question);
    assert.ok(model, `board edge #${index}`);
    auditBoard(draw, model, `board edge #${index}`);
  });
});

test('representationBridge audit: the defect it found stays fixed', () => {
  // A slope of 1 or −1 was expanded as "1x − 1(0)" or "(−1)x − (−1)(4)".
  const bridge = (rows) => ({ type: TOOL_ID, mode: 'linear', source: { kind: 'table', rows }, context: { ...CONTEXT } });
  const one = buildRepresentationBridgeReview(bridge([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]));
  assert.match(one.why, /^Check: expanding a\(x − c\) gives x − 1\(0\) = x, the general form/);
  const minusOne = buildRepresentationBridgeReview(bridge([{ x: 0, y: 4 }, { x: 1, y: 3 }, { x: 2, y: 2 }]));
  assert.match(minusOne.why, /^Check: expanding a\(x − c\) gives −x − \(−1\)\(4\) = −x \+ 4, the general form/);
  const half = buildRepresentationBridgeReview(bridge([{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 3 }]));
  assert.match(half.why, /^Check: expanding a\(x − c\) gives \(1\/2\)x − \(1\/2\)\(−2\) = \(1\/2\)x \+ 1, the general form/);
});
