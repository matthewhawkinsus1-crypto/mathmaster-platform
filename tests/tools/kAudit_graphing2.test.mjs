import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildGraphing2Review } from '../../src/tools/shared/reviews/graphing2Review.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — GRAPHING2'S WORKED SOLUTION, RECOMPUTED INDEPENDENTLY.
 *
 * Job A shipped buildGraphing2Review without the independent mathematics
 * review it planned. This file is that review. Over seeded draws of every
 * mode the tool renders (slope-intercept, point-slope, factored, standard
 * form, through two points, vertical/horizontal), under both construction
 * policies, plus hand-picked edge cases, it builds the review and checks
 * every number it shows against the line recomputed here with exact
 * fractions (mathjs in Fraction mode) — never with the builder's or the
 * tool's own helpers:
 *
 *   - the Line, Slope, y-intercept and x-intercept items are the line's;
 *   - every stated point is on the line exactly, on the snap grid, inside
 *     the graph, distinct, and as many as the tool takes;
 *   - every "a = b" the steps and the check write out is true, every
 *     substitution is the stated equation at the stated point, every
 *     equation the steps name is the target line, every move along the line
 *     is the slope;
 *   - the shared grader (gradeToolWork) marks the stated points correct and
 *     complete;
 *   - display hygiene: no "+ −3", "1x", "− −", NaN, −0, unreduced fractions;
 *   - a null review is honest: no plottable construction exists, or the
 *     line has no exact short form (checked independently, not trusted).
 */

const TOOL_ID = 'graphing2';
const math = create(all, { number: 'Fraction' });
const F = (value, denominator) => (denominator === undefined ? math.fraction(value) : math.fraction(value, denominator));
const ZERO = F(0);

/* ------------------------------------------------------------ the draws */

// mulberry32: a small deterministic PRNG, so every run audits the same cases.
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
// A slope or intercept the way authors write them: whole numbers mostly, then
// halves, thirds and quarters (authored as the float, e.g. 2/3).
const exactValue = (rand, range = 5) => {
  const q = pick(rand, [1, 1, 1, 2, 2, 3, 4]);
  return F(intIn(rand, -range * q, range * q)).div(q);
};
const asAuthored = (rand, fraction) => {
  const number = fraction.valueOf();
  // Seed-bank templates fill numbers in as text; a whole number sometimes is.
  return Number.isInteger(number) && rand() < 0.15 ? String(number) : number;
};

const POLICIES = [
  null,
  { strategy: 'formAware' },
  { strategy: 'formAware', minimumPoints: 3 },
];
const STANDARD_ANCHORS = [undefined, 'intercepts', 'xIntercept', 'yIntercept'];

/**
 * One draw: the question as the platform delivers it, and the exact line it
 * asks for (the expected answer, computed here from the draw itself).
 */
const drawQuestion = (rand, mode) => {
  const policy = pick(rand, POLICIES);
  const base = { type: TOOL_ID, mode, ...(policy ? { constructionPolicy: { ...policy } } : {}) };
  if (rand() < 0.2) base.graphBounds = { xMin: -intIn(rand, 3, 12), xMax: intIn(rand, 3, 12), yMin: -intIn(rand, 3, 12), yMax: intIn(rand, 3, 12) };
  if (mode === 'slopeIntercept') {
    if (rand() < 0.08) {
      const x = F(intIn(rand, -12, 12)).div(pick(rand, [1, 2]));
      return { question: { ...base, line: { x: asAuthored(rand, x) } }, line: { vertical: true, x } };
    }
    const m = exactValue(rand); const b = exactValue(rand);
    return { question: { ...base, line: { m: asAuthored(rand, m), b: asAuthored(rand, b) } }, line: { m, b } };
  }
  if (mode === 'pointSlope') {
    const point = [F(intIn(rand, -6, 6)), F(intIn(rand, -6, 6))];
    const m = exactValue(rand, 3);
    return {
      question: { ...base, point: point.map((value) => asAuthored(rand, value)), slope: asAuthored(rand, m) },
      line: { m, b: point[1].sub(m.mul(point[0])) },
    };
  }
  if (mode === 'factoredLinear') {
    const a = exactValue(rand, 3); const c = F(intIn(rand, -12, 12)).div(pick(rand, [1, 1, 2]));
    return { question: { ...base, factored: { a: asAuthored(rand, a), c: asAuthored(rand, c) } }, line: { m: a, b: a.mul(c).neg() } };
  }
  if (mode === 'standardForm') {
    let A; let B;
    do { A = intIn(rand, -6, 6); B = intIn(rand, -6, 6); } while (A === 0 && B === 0);
    const C = intIn(rand, -12, 12);
    const anchor = pick(rand, STANDARD_ANCHORS);
    const question = { ...base, standard: { A: asAuthored(rand, F(A)), B: asAuthored(rand, F(B)), C: asAuthored(rand, F(C)) } };
    if (anchor && question.constructionPolicy) question.constructionPolicy.requiredAnchor = anchor;
    const line = B === 0 ? { vertical: true, x: F(C).div(A) } : { m: F(-A).div(B), b: F(C).div(B) };
    return { question, line, standard: { A, B, C } };
  }
  if (mode === 'throughPoints') {
    const p = [F(intIn(rand, -6, 6)), F(intIn(rand, -6, 6))];
    let q;
    do { q = [F(intIn(rand, -6, 6)), F(intIn(rand, -6, 6))]; } while (q[0].equals(p[0]) && q[1].equals(p[1]));
    const question = { ...base, givenPoints: [p, q].map((point) => point.map((value) => value.valueOf())) };
    if (p[0].equals(q[0])) return { question, line: { vertical: true, x: p[0] } };
    const m = q[1].sub(p[1]).div(q[0].sub(p[0]));
    return { question, line: { m, b: p[1].sub(m.mul(p[0])) } };
  }
  const value = F(intIn(rand, -12, 12)).div(pick(rand, [1, 1, 2]));
  const orientation = rand() < 0.5 ? 'vertical' : 'horizontal';
  return {
    question: { ...base, orientation, value: asAuthored(rand, value) },
    line: orientation === 'vertical' ? { vertical: true, x: value } : { m: ZERO, b: value },
  };
};

const MODES = ['slopeIntercept', 'pointSlope', 'factoredLinear', 'standardForm', 'throughPoints', 'verticalHorizontal'];

/* -------------------------------------------------- reading the display */

const MINUS = /−/g;
const ascii = (text) => String(text).replace(MINUS, '-').replace(/÷/g, '/');
const fr = (text) => {
  const clean = ascii(text).trim();
  assert.match(clean, /^-?\d+(?:\.\d+)?(?:\/\d+)?$/, `a number as the review writes one: "${text}"`);
  return math.evaluate(clean);
};
// Plain arithmetic the review writes ("2(1) − 1", "(2/3)(4) + 1/3", "−(3 − 2)"), evaluated exactly.
const NUMERIC_SIDE = /^[−\-\d\s.+/÷()]+$/;
const arithmetic = (text) => math.evaluate(ascii(text));
const isNumericSide = (text) => NUMERIC_SIDE.test(text.trim()) && /\d/.test(text);
const pointsIn = (text) => [...String(text).matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => [fr(x), fr(y)]);

const onLine = (line, [x, y]) => (line.vertical ? x.equals(line.x) : y.equals(line.m.mul(x).add(line.b)));
const sameValue = (left, right) => F(left).equals(F(right));

/** An equation in x and y the review writes, as f(x, y) = left − right. */
const equationFunction = (text) => {
  const sides = ascii(text).split('=');
  assert.equal(sides.length, 2, `one equation: ${text}`);
  const [left, right] = sides.map((side) => math.compile(side.trim()));
  return (x, y) => F(left.evaluate({ x, y })).sub(F(right.evaluate({ x, y })));
};
/** The equation describes exactly the target line. */
const assertIsLine = (text, line, label) => {
  const f = equationFunction(text);
  const points = line.vertical
    ? [[line.x, F(0)], [line.x, F(3)]]
    : [F(0), F(1), F(-2)].map((x) => [x, line.m.mul(x).add(line.b)]);
  points.forEach(([x, y]) => assert.ok(f(x, y).equals(0), `${label}: ${text} holds at (${x}, ${y}) on the line`));
  const off = line.vertical ? [line.x.add(1), F(0)] : [F(0), line.b.add(1)];
  assert.ok(!f(off[0], off[1]).equals(0), `${label}: ${text} is a line, not an identity`);
};

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertHygiene = (text, label) => {
  assert.doesNotMatch(text, /NaN|undefined|Infinity|\bnull\b|\[object/, `${label}: no broken value in "${text}"`);
  assert.doesNotMatch(text, /\+ [−-]|[−-] [−-]|−−|--|-−|−-/, `${label}: no doubled sign in "${text}"`);
  assert.doesNotMatch(text, /(^|[^\d./])1[xy]\b/, `${label}: no 1x in "${text}"`);
  assert.doesNotMatch(text, /(^|[^\d./])0[xy]\b/, `${label}: no 0x in "${text}"`);
  assert.doesNotMatch(text, /−0(?![.\d/])/, `${label}: no −0 in "${text}"`);
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

/**
 * Every chain "a = b = c" of plain arithmetic in a sentence is true. A clause
 * is cut at the sentence's own punctuation, so "(3, 2): 2 − 3 = −1 and
 * −(3 − 2) = −1" yields the two chains.
 */
const assertArithmeticChains = (text, label) => {
  let checked = 0;
  const clauses = text.split(/: |; |, | and | so | — | then |\. |\.$/);
  clauses.forEach((clause) => {
    if (!clause.includes(' = ')) return;
    const sides = clause.split(' = ').map((side) => side.trim());
    for (let index = 1; index < sides.length; index += 1) {
      if (!isNumericSide(sides[index - 1]) || !isNumericSide(sides[index])) continue;
      assert.ok(sameValue(arithmetic(sides[index - 1]), arithmetic(sides[index])), `${label}: "${sides[index - 1]} = ${sides[index]}" is false in "${text}"`);
      checked += 1;
    }
  });
  return checked;
};

/* -------------------------------------------- the tool's plane, independently */

// Graphing2.jsx resolveSnapStep and its default bounds, restated (the
// existing graphing2SolutionReview test reads them from the component).
const snapStepFor = (line) => {
  if (line.vertical) return Number.isInteger(line.x.valueOf()) ? 1 : 0.5;
  return Number.isInteger(line.m.valueOf()) && Number.isInteger(line.b.valueOf()) ? 1 : 0.5;
};
const boundsFor = (question) => ({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, ...(question.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 }) });
const onGrid = (value, step) => value.div(step).d === 1n || value.div(step).d === 1;
const inside = (bounds, [x, y]) => x.valueOf() >= bounds.xMin && x.valueOf() <= bounds.xMax && y.valueOf() >= bounds.yMin && y.valueOf() <= bounds.yMax;
const plottable = (bounds, step, point) => inside(bounds, point) && point.every((value) => onGrid(value, step));

/** The points a form-aware grader insists on, from the draw itself. */
const requiredAnchors = (draw) => {
  const { question, line } = draw;
  const policy = question.constructionPolicy;
  if (!policy || policy.strategy !== 'formAware' || ['throughPoints', 'verticalHorizontal'].includes(question.mode)) return [];
  if (question.mode === 'slopeIntercept') return line.vertical ? null : [[ZERO, line.b]];
  if (question.mode === 'pointSlope') return [question.point.map((value) => F(value))];
  if (question.mode === 'factoredLinear') return [[F(question.factored.c), ZERO]];
  const { A, B, C } = draw.standard;
  if (A === 0) return policy.requiredAnchor === 'xIntercept' ? null : [[ZERO, F(C).div(B)]];
  if (B === 0) return policy.requiredAnchor === 'yIntercept' ? null : [[F(C).div(A), ZERO]];
  const anchors = { xIntercept: [F(C).div(A), ZERO], yIntercept: [ZERO, F(C).div(B)] };
  return policy.requiredAnchor === 'xIntercept' || policy.requiredAnchor === 'yIntercept'
    ? [anchors[policy.requiredAnchor]]
    : [anchors.xIntercept, anchors.yIntercept];
};

/** Can the student construct this line at all? (Independent of the builder.) */
const constructionExists = (draw) => {
  const { question, line } = draw;
  // y = 0(x − c) is the x-axis: its form names an "x-intercept" the line does
  // not have (every point is one), so no honest walk-through exists.
  if (question.mode === 'factoredLinear' && F(question.factored.a).equals(0)) return false;
  const anchors = requiredAnchors(draw);
  if (anchors === null) return false;
  const bounds = boundsFor(question);
  const step = snapStepFor(line);
  if (!anchors.every((point) => plottable(bounds, step, point))) return false;
  const need = question.constructionPolicy?.strategy === 'formAware' ? (Number(question.constructionPolicy.minimumPoints) === 3 ? 3 : 2) : 2;
  let found = 0;
  const steps = (min, max) => Array.from({ length: Math.floor(max / step) - Math.ceil(min / step) + 1 }, (_, k) => F(Math.ceil(min / step) + k).mul(step));
  if (line.vertical) {
    if (!plottable(bounds, step, [line.x, ZERO]) && !(onGrid(line.x, step) && line.x.valueOf() >= bounds.xMin && line.x.valueOf() <= bounds.xMax)) return false;
    found = steps(bounds.yMin, bounds.yMax).length;
  } else {
    found = steps(bounds.xMin, bounds.xMax).filter((x) => plottable(bounds, step, [x, line.m.mul(x).add(line.b)])).length;
  }
  return found >= need;
};

/* ------------------------------------------------------- one full audit */

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;
const workFor = (points) => {
  const numbers = points.map((point) => point.map((value) => value.valueOf()));
  const [p, q] = numbers;
  const studentLine = q ? (p[0] === q[0] ? { kind: 'vertical', x: p[0] } : { kind: 'slopeIntercept', m: (q[1] - p[1]) / (q[0] - p[0]), b: p[1] - ((q[1] - p[1]) / (q[0] - p[0])) * p[0] }) : null;
  return { points: numbers, studentLine };
};

const auditReview = (draw, model, label) => {
  const { question, line } = draw;
  [model.title, model.why, model.note || '', ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])]
    .forEach((text) => assertHygiene(text, label));

  // The items are the line's own numbers.
  assertIsLine(itemValue(model, 'Line'), line, `${label} Line`);
  if (line.vertical) {
    assert.equal(itemValue(model, 'Slope'), 'Undefined (vertical line)', label);
    assert.deepEqual(pointsIn(itemValue(model, 'x-intercept')).map((point) => point.map(String)), [[line.x, ZERO].map(String)], `${label}: x-intercept`);
  } else {
    assert.ok(sameValue(fr(itemValue(model, 'Slope')), line.m), `${label}: slope ${itemValue(model, 'Slope')}`);
    const [[ix, iy]] = pointsIn(itemValue(model, 'y-intercept'));
    assert.ok(ix.equals(0) && iy.equals(line.b), `${label}: y-intercept ${itemValue(model, 'y-intercept')}`);
    const xIntercept = itemValue(model, 'x-intercept');
    if (xIntercept !== undefined) {
      const [[zx, zy]] = pointsIn(xIntercept);
      assert.ok(zy.equals(0) && onLine(line, [zx, zy]), `${label}: x-intercept ${xIntercept}`);
    }
  }

  // The stated points: on the line exactly, plottable, distinct, enough.
  const points = pointsIn(itemValue(model, 'Points to plot'));
  const need = question.constructionPolicy?.strategy === 'formAware' ? (Number(question.constructionPolicy.minimumPoints) === 3 ? 3 : 2) : 2;
  assert.equal(points.length, need, `${label}: ${need} points`);
  const bounds = boundsFor(question);
  const step = snapStepFor(line);
  points.forEach((point) => {
    assert.ok(onLine(line, point), `${label}: (${point.join(', ')}) is on the line exactly`);
    assert.ok(plottable(bounds, step, point), `${label}: (${point.join(', ')}) can be plotted`);
  });
  assert.equal(new Set(points.map((point) => point.join())).size, points.length, `${label}: distinct points`);
  (requiredAnchors(draw) || []).forEach((anchor) => {
    assert.ok(points.some((point) => point[0].equals(anchor[0]) && point[1].equals(anchor[1])), `${label}: the anchor (${anchor.join(', ')}) is plotted`);
  });

  // The shared grader agrees.
  const result = gradeToolWork({ toolId: TOOL_ID, question, work: workFor(points) });
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated points`);
  assert.equal(result.isComplete, true, `${label}: complete`);

  // The note says any such points are marked correct: any other two plottable
  // points of the line are (the grader, probed, not just the review's choice).
  if (!question.constructionPolicy && !line.vertical) {
    const others = [];
    for (let x = Math.ceil(bounds.xMin / step); x * step <= bounds.xMax && others.length < 2; x += 1) {
      const point = [F(x).mul(step), line.m.mul(F(x).mul(step)).add(line.b)];
      if (plottable(bounds, step, point) && !points.some((stated) => stated[0].equals(point[0]))) others.push(point);
    }
    if (others.length === 2) {
      assert.equal(gradeToolWork({ toolId: TOOL_ID, question, work: workFor(others) }).isCorrect, true, `${label}: another pair of points on the line is accepted`);
      // (Not asserted: that a point one snap step off is refused. Under
      // equivalentLine the grader compares only the two points' line with
      // the target, within 0.12 in m and 0.24 in b, so through (−1, 6) and
      // (4, −2) it accepts (4, −1.5) — reported to the grader's owner.)
    }
  }

  // Every arithmetic chain is true.
  [...model.steps, model.why].forEach((text) => assertArithmeticChains(text, label));

  // "Choose x = 1: y = … = 3" — the computed y is the line's at that x.
  model.steps.forEach((stepText) => {
    const chosen = stepText.match(/^Choose x = ([^:]+): y = (?:[^=]+ = )?([^=.]+)\. Plot/);
    if (chosen && !line.vertical) assert.ok(line.m.mul(fr(chosen[1])).add(line.b).equals(fr(chosen[2])), `${label}: ${stepText}`);
    // "From (a, b), move right r and up u to (c, d): a rise of u over a run of r is s, the slope."
    const move = stepText.match(/^From \(([^,]+), ([^)]+)\), move (.+?) to \(([^,]+), ([^)]+)\)/);
    if (move) {
      let run = F(0); let rise = F(0);
      for (const [, direction, size] of move[3].matchAll(/(right|left|up|down) ([\d.]+)/g)) {
        const amount = fr(size);
        if (direction === 'right') run = run.add(amount);
        if (direction === 'left') run = run.sub(amount);
        if (direction === 'up') rise = rise.add(amount);
        if (direction === 'down') rise = rise.sub(amount);
      }
      assert.ok(fr(move[1]).add(run).equals(fr(move[4])) && fr(move[2]).add(rise).equals(fr(move[5])), `${label}: ${move[0]}`);
      const ratio = stepText.match(/a rise of (\S+) over a run of (\S+) is (\S+), the slope/);
      if (ratio) {
        assert.ok(fr(ratio[1]).equals(rise) && fr(ratio[2]).equals(run), `${label}: rise and run are the move`);
        assert.ok(fr(ratio[3]).equals(rise.div(run)) && fr(ratio[3]).equals(line.m), `${label}: ${ratio[0]}`);
      }
    }
    // "Set x = 2 in 3x + 2y = 7: 3(2) + 2y = 7, so 2y = 1 and y = 1/2."
    const standard = stepText.match(/^Set x = ([^ ]+) in (.+?): (.+?) ([+−]) (.*?)y = ([^,]+), so (.*?)y = ([^ ]+) and y = ([^.]+)\. Plot \(([^,]+), ([^)]+)\)/);
    if (standard) {
      const [, x, equation, known, sign, coefficientText, C, coefficientAgain, rest, y, px, py] = standard;
      assertIsLine(equation, line, `${label} set x`);
      const coefficient = coefficientText === '' ? F(1) : fr(coefficientText.replace(/[()]/g, ''));
      const B = sign === '−' ? coefficient.neg() : coefficient;
      const againText = coefficientAgain === '' ? '1' : coefficientAgain === '−' ? '−1' : coefficientAgain.replace(/[()]/g, '');
      assert.ok(fr(againText).equals(B), `${label}: the y-coefficient is carried: ${stepText}`);
      assert.ok(fr(C).sub(arithmetic(known)).equals(fr(rest)), `${label}: By = C − Ax in ${stepText}`);
      assert.ok(fr(rest).div(B).equals(fr(y)), `${label}: y = rest ÷ B in ${stepText}`);
      assert.ok(fr(px).equals(fr(x)) && fr(py).equals(fr(y)), `${label}: the point is the one solved for`);
    }
    // "… set y = 0: 2x = 4 and x = 2", "so −3y = 5 and y = −5/3"
    for (const [, coefficient, , rhs, solved] of stepText.matchAll(/(\(?−?[\d./]*\)?|−)([xy]) = ([^ ,]+) and \2 = ([^ ,]+?)(?= —|\.(?:\s|$)|,|$)/g)) {
      const k = coefficient === '' ? F(1) : coefficient === '−' ? F(-1) : fr(coefficient.replace(/[()]/g, ''));
      assert.ok(fr(rhs).div(k).equals(fr(solved)), `${label}: ${coefficient}x = ${rhs} gives ${solved}`);
    }
  });

  // Equations the steps name are the target line.
  const intro = model.steps[0];
  const pointSlope = intro.match(/: (y [−+] [^=]+ = [^,]+|y = [^,]+), which is (.+) in slope-intercept form\.$/);
  if (question.mode === 'pointSlope') {
    assert.ok(pointSlope, `${label}: the point-slope intro: ${intro}`);
    assertIsLine(pointSlope[1], line, `${label} point-slope`);
    assertIsLine(pointSlope[2], line, `${label} slope-intercept`);
  }
  if (question.mode === 'factoredLinear') {
    const factored = intro.match(/^In (y = [^,]+), the factor (.+) is 0 when x = ([^,]+), so the x-intercept is \(([^,]+), 0\); the number in front, ([^,]+), is the slope\. In slope-intercept form the line is (.+)\.$/);
    assert.ok(factored, `${label}: the factored intro: ${intro}`);
    assertIsLine(factored[1], line, `${label} factored`);
    assertIsLine(factored[6], line, `${label} factored → slope-intercept`);
    assert.ok(math.evaluate(ascii(factored[2]), { x: fr(factored[3]) }).equals(0), `${label}: the factor is 0 at c`);
    assert.ok(fr(factored[5]).equals(line.m), `${label}: the slope is a`);
  }
  if (question.mode === 'standardForm') {
    const named = intro.match(/^(?:Find the intercepts of )?(.+? = [^.:]+?)(?: has no [xy]-term|\. For the x-intercept)/);
    assert.ok(named, `${label}: the standard-form intro: ${intro}`);
    assertIsLine(named[1], line, `${label} standard`);
  }
  if (question.mode === 'slopeIntercept' && !line.vertical) {
    const compared = intro.match(/^Compare (.+) with y = mx \+ b: the slope is m = (.+) and the y-intercept is b = (.+), so the line crosses the y-axis at \((.+), (.+)\)\.$/);
    assert.ok(compared, `${label}: ${intro}`);
    assertIsLine(compared[1], line, `${label} compare`);
    assert.ok(fr(compared[2]).equals(line.m) && fr(compared[3]).equals(line.b) && fr(compared[5]).equals(line.b), `${label}: m and b read off`);
  }
  if (question.mode === 'throughPoints' && !line.vertical) {
    const slope = intro.match(/Its slope is (.+?) = (.+?) = (.+), so the line is (.+)\.$/);
    assert.ok(slope, `${label}: ${intro}`);
    assert.ok(arithmetic(slope[1]).equals(line.m) && arithmetic(slope[2]).equals(line.m) && fr(slope[3]).equals(line.m), `${label}: ${slope[0]}`);
    assertIsLine(slope[4], line, `${label} through points`);
  }
  // The last step names the line through the points.
  const last = model.steps.at(-1).match(/^The line through .+ is (.+) — the line the question asks for\.$/);
  assert.ok(last, `${label}: the closing step`);
  assertIsLine(last[1], line, `${label} closing`);

  // The check substitutes each stated point into the equation it names.
  const substituted = model.why.match(/^Check: substitute each point into (.+?)\. (.+)\. Every point satisfies/);
  if (substituted) {
    assertIsLine(substituted[1], line, `${label} check equation`);
    const clauses = substituted[2].split('; ');
    assert.equal(clauses.length, points.length, `${label}: every point is checked`);
    clauses.forEach((clause, index) => {
      const [, px, py, rest] = clause.match(/^\(([^,]+), ([^)]+)\): (.+)$/);
      assert.ok(fr(px).equals(points[index][0]) && fr(py).equals(points[index][1]), `${label}: the check uses the stated point`);
      // Each value written is the equation's left side at the point (the
      // point is on the line, so both sides are that value).
      const left = math.compile(ascii(substituted[1]).split('=')[0].trim()).evaluate({ x: points[index][0], y: points[index][1] });
      const values = rest.split(' and ').flatMap((part) => part.split(' = ')).map(arithmetic);
      values.forEach((value) => assert.ok(value.equals(left), `${label}: ${clause} is ${substituted[1]} at the point`));
    });
  } else {
    // "(4, 4) is on it too: 2(4) − 4 = 4 in y = 2x − 4."
    const extra = model.why.match(/on it too: (.+?) in (y = .+)\.$/);
    if (extra) {
      assertIsLine(extra[2], line, `${label} extra point`);
      extra[1].split(', ').forEach((part) => assert.ok(assertArithmeticChains(part, label) === 1, `${label}: ${part}`));
    }
    assert.match(model.why, /^Check: (every point has the same|these are the two given points)/, `${label}: ${model.why}`);
  }
};

/* ----------------------------------------------------------------- tests */

const CASES_PER_MODE = 260;

MODES.forEach((mode, modeIndex) => {
  test(`graphing2 audit, ${mode}: ${CASES_PER_MODE} seeded draws are recomputed exactly`, () => {
    const rand = prng(0x6a2b + modeIndex * 7919);
    let reviewed = 0; let nulls = 0;
    for (let index = 0; index < CASES_PER_MODE; index += 1) {
      const draw = drawQuestion(rand, mode);
      const label = `${mode} #${index} ${JSON.stringify(draw.question)}`;
      const model = buildGraphing2Review(draw.question);
      if (!model) {
        nulls += 1;
        // A null is honest only when no plottable construction exists.
        assert.equal(constructionExists(draw), false, `${label}: null although a construction exists`);
        continue;
      }
      reviewed += 1;
      assert.ok(constructionExists(draw), `${label}: a review for a line the student cannot construct`);
      auditReview(draw, model, label);
    }
    assert.ok(reviewed >= CASES_PER_MODE * 0.5, `${mode}: most draws are reviewed (${reviewed}, ${nulls} null)`);
  });
});

test('graphing2 audit: edge cases — zero, negatives, the origin, horizontal and vertical lines', () => {
  const edges = [
    { question: { type: TOOL_ID, mode: 'slopeIntercept', line: { m: 0, b: 0 } }, line: { m: F(0), b: F(0) } },
    { question: { type: TOOL_ID, mode: 'slopeIntercept', line: { m: -1, b: 0 } }, line: { m: F(-1), b: F(0) } },
    { question: { type: TOOL_ID, mode: 'slopeIntercept', line: { m: 1, b: -1 } }, line: { m: F(1), b: F(-1) } },
    { question: { type: TOOL_ID, mode: 'slopeIntercept', line: { m: -0.5, b: -3.5 }, constructionPolicy: { strategy: 'formAware' } }, line: { m: F(-1, 2), b: F(-7, 2) } },
    { question: { type: TOOL_ID, mode: 'slopeIntercept', line: { x: -3 } }, line: { vertical: true, x: F(-3) } },
    { question: { type: TOOL_ID, mode: 'pointSlope', point: [0, 0], slope: -1 }, line: { m: F(-1), b: F(0) } },
    { question: { type: TOOL_ID, mode: 'pointSlope', point: [-3, -2], slope: 0, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }, line: { m: F(0), b: F(-2) } },
    { question: { type: TOOL_ID, mode: 'pointSlope', point: [2, -1], slope: 1 }, line: { m: F(1), b: F(-3) } },
    { question: { type: TOOL_ID, mode: 'factoredLinear', factored: { a: -1, c: 3 }, constructionPolicy: { strategy: 'formAware' } }, line: { m: F(-1), b: F(3) } },
    { question: { type: TOOL_ID, mode: 'factoredLinear', factored: { a: 1, c: -2.5 } }, line: { m: F(1), b: F(5, 2) } },
    { question: { type: TOOL_ID, mode: 'factoredLinear', factored: { a: 0, c: 2 } }, line: { m: F(0), b: F(0) } },
    { question: { type: TOOL_ID, mode: 'standardForm', standard: { A: -1, B: -1, C: -4 }, constructionPolicy: { strategy: 'formAware' } }, line: { m: F(-1), b: F(4) }, standard: { A: -1, B: -1, C: -4 } },
    { question: { type: TOOL_ID, mode: 'standardForm', standard: { A: 0, B: -3, C: 6 }, constructionPolicy: { strategy: 'formAware' } }, line: { m: F(0), b: F(-2) }, standard: { A: 0, B: -3, C: 6 } },
    { question: { type: TOOL_ID, mode: 'standardForm', standard: { A: -2, B: 0, C: 5 } }, line: { vertical: true, x: F(-5, 2) }, standard: { A: -2, B: 0, C: 5 } },
    { question: { type: TOOL_ID, mode: 'standardForm', standard: { A: 3, B: -3, C: 0 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }, line: { m: F(1), b: F(0) }, standard: { A: 3, B: -3, C: 0 } },
    { question: { type: TOOL_ID, mode: 'standardForm', standard: { A: 1, B: -1, C: -1 } }, line: { m: F(1), b: F(1) }, standard: { A: 1, B: -1, C: -1 } },
    { question: { type: TOOL_ID, mode: 'throughPoints', givenPoints: [[-3, 2], [3, 2]] }, line: { m: F(0), b: F(2) } },
    { question: { type: TOOL_ID, mode: 'throughPoints', givenPoints: [[-1, -6], [-1, 4]] }, line: { vertical: true, x: F(-1) } },
    { question: { type: TOOL_ID, mode: 'throughPoints', givenPoints: [[4, 1], [-2, -2]] }, line: { m: F(1, 2), b: F(-1) } },
    { question: { type: TOOL_ID, mode: 'verticalHorizontal', orientation: 'horizontal', value: 0 }, line: { m: F(0), b: F(0) } },
    { question: { type: TOOL_ID, mode: 'verticalHorizontal', orientation: 'vertical', value: 0 }, line: { vertical: true, x: F(0) } },
    { question: { type: TOOL_ID, mode: 'verticalHorizontal', orientation: 'horizontal', value: -6.5 }, line: { m: F(0), b: F(-13, 2) } },
  ];
  edges.forEach((draw, index) => {
    const label = `edge #${index} ${JSON.stringify(draw.question)}`;
    const model = buildGraphing2Review(draw.question);
    assert.equal(Boolean(model), constructionExists(draw), `${label}: reviewed exactly when constructible`);
    if (model) auditReview(draw, model, label);
  });
});

test('graphing2 audit: the defects it found stay fixed', () => {
  // A zero slope through a point with x = 0 was written "y = 0x" (and through
  // the origin "y − 3 = 0x"): the bracket stays, as for every other point.
  const flat = buildGraphing2Review({ type: TOOL_ID, mode: 'pointSlope', point: [0, 3], slope: 0 });
  assert.ok(flat.steps[0].includes('with slope 0: y − 3 = 0(x − 0), which is y = 3'), flat.steps[0]);
  assert.ok(buildGraphing2Review({ type: TOOL_ID, mode: 'pointSlope', point: [0, 0], slope: 0 }).steps[0].includes('y = 0(x − 0)'));
  // y = 0(x − 5) is the x-axis. The review called (5, 0) "the x-intercept,
  // where the line crosses the x-axis" — every point of y = 0 is on the axis.
  [{}, { constructionPolicy: { strategy: 'formAware' } }].forEach((extra) => {
    assert.equal(buildGraphing2Review({ type: TOOL_ID, mode: 'factoredLinear', factored: { a: 0, c: 5 }, ...extra }), null);
  });
  // A negative run was divided unbracketed: "−3 ÷ −6".
  assert.ok(buildGraphing2Review({ type: TOOL_ID, mode: 'throughPoints', givenPoints: [[4, 1], [-2, -2]] }).steps[0]
    .includes('Its slope is (−2 − 1) ÷ (−2 − 4) = −3 ÷ (−6) = 1/2'));
  // A non-zero a is still explained from its x-intercept.
  assert.match(buildGraphing2Review({ type: TOOL_ID, mode: 'factoredLinear', factored: { a: 2, c: 0 } }).steps[0], /^In y = 2x, the factor x is 0 when x = 0/);
});
