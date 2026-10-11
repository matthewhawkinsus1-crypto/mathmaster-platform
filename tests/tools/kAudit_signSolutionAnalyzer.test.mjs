import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';
import Fraction from 'fraction.js';

import { buildSignSolutionAnalyzerReview } from '../../src/tools/shared/reviews/signSolutionAnalyzerReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * JOB K AUDIT — THE SIGN & SOLUTION ANALYZER WORKED SOLUTION, RECOMPUTED
 * INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws per mode —
 * polynomial and rational sign charts with every relation, integer and
 * decimal roots, a root at 0, repeated roots (a multiplicity, or the same
 * factor listed twice), even and odd powers, a numerator of 1, numerator and
 * denominator sharing a root (a hole), no solution, all reals, an isolated
 * zero; radical equations with genuine, extraneous and out-of-domain
 * candidates, decimal coefficients, candidates written as text — the answer
 * is recomputed here in exact Fraction arithmetic from the question alone
 * (never the tool's signSolutionMath helpers), and the review is read back:
 *
 *   - the inequality item is the question's own factors and relation;
 *   - the critical points, each "(denominator 0)" note, the intervals and
 *     their order;
 *   - every test step: the test value inside its interval, each factor's
 *     value and sign at it, the sign pattern, the product sign, and the
 *     select / leave verdict for the relation;
 *   - the power-rule check: each power, odd or even, and every sign;
 *   - the intervals to select (typed back as chart toggles and graded by the
 *     shared grader) and the full solution set, endpoints, holes and isolated
 *     zeros included, compared as sets;
 *   - for a radical equation: the equation, each candidate's radicand, both
 *     sides, its verdict and reason, the squared equation, the "satisfies the
 *     squared equation" claim, and the selection graded by the shared grader;
 *   - display hygiene.
 */

const TOOL_ID = 'signSolutionAnalyzer';
const math = create(all);
const F = (value) => new Fraction(value);
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

/* ------------------------------------------------------------ reading -- */

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fromSuperscript = (text) => (text ? Number(text.split('').map((c) => SUPERSCRIPTS.indexOf(c)).join('')) : 1);
const num = (text) => Number(String(text).replace(/−/g, '-'));
// "−∞" / "∞" / a number.
const bound = (text) => {
  const clean = text.trim().replace(/−/g, '-');
  if (clean === '-∞') return -Infinity;
  if (clean === '∞') return Infinity;
  assert.match(clean, /^-?\d+(\.\d+)?$/, `a number: "${text}"`);
  return Number(clean);
};
const parseInterval = (text) => {
  const match = text.trim().match(/^\((.+), (.+)\)$/);
  assert.ok(match, `an open interval: "${text}"`);
  return [bound(match[1]), bound(match[2])];
};
// "x(x + 2.5)² / [x(x − 3)]" → { top: Map root→power, bottom }.
const readProduct = (text) => {
  const factors = new Map();
  if (text.trim() === '1') return factors;
  const rest = text.replace(/\(x ([−+]) (\d+(?:\.\d+)?)\)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)|x([⁰¹²³⁴⁵⁶⁷⁸⁹]*)/g, (whole, sign, value, power, barePower) => {
    const root = sign === undefined ? 0 : (sign === '−' ? 1 : -1) * Number(value);
    const multiplicity = fromSuperscript(sign === undefined ? barePower : power);
    factors.set(root, (factors.get(root) || 0) + multiplicity);
    return '';
  });
  assert.equal(rest.trim(), '', `only factors in "${text}"`);
  return factors;
};
const readExpression = (text) => {
  const [top, bottom] = text.split(' / ');
  return { top: readProduct(top), bottom: bottom ? readProduct(bottom.replace(/^\[|\]$/g, '')) : new Map() };
};
const sameMap = (a, b) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

/* ---------------------------------------------------- the key, here -- */

const RELATIONS = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

// The factors as the question gives them (numeratorFactors before factors;
// a denominator only on a rational chart), grouped by root.
const group = (factors) => {
  const map = new Map();
  (factors || []).forEach((factor) => {
    const root = Number(factor.root);
    map.set(root, (map.get(root) || 0) + Number(factor.multiplicity ?? 1));
  });
  return map;
};

// The sign of Π(x − r)^m / Π(x − s)^n at an exact x (0 at a zero, null where undefined).
const signAt = (top, bottom, x) => {
  const X = F(x);
  let value = F(1);
  for (const [root, power] of bottom) {
    const d = X.sub(F(root));
    if (d.equals(0)) return null;
    value = value.div(d.pow(power));
  }
  for (const [root, power] of top) value = value.mul(X.sub(F(root)).pow(power));
  return value.compare(0);
};

const chartKey = (question, rational) => {
  const top = group(question.numeratorFactors || question.factors);
  const bottom = rational ? group(question.denominatorFactors) : new Map();
  // The symbols themselves are the relations they show.
  const relation = { '≥': '>=', '≤': '<=' }[question.relation] || question.relation || '>';
  const points = [...new Set([...top.keys(), ...bottom.keys()])].sort((a, b) => a - b);
  const bounds = [-Infinity, ...points, Infinity];
  const intervals = bounds.slice(1).map((right, index) => {
    const left = bounds[index];
    // An exact midpoint (or one unit out on a ray).
    const probe = !Number.isFinite(left) ? F(right).sub(1) : !Number.isFinite(right) ? F(left).add(1) : F(left).add(F(right)).div(2);
    const sign = signAt(top, bottom, probe);
    return { left, right, sign };
  });
  const wantPositive = relation.startsWith('>');
  const inclusive = relation.includes('=');
  intervals.forEach((interval) => { interval.included = wantPositive ? interval.sign > 0 : interval.sign < 0; });
  // The true solution set: open intervals, plus each point where the value is
  // 0 (inclusive) — merged into maximal pieces.
  const pieces = [];
  intervals.forEach((interval, index) => {
    pieces.push({ included: interval.included, left: interval.left, right: interval.right, point: false });
    if (index < points.length) {
      const p = points[index];
      const value = signAt(top, bottom, p);
      pieces.push({ included: inclusive && value === 0, left: p, right: p, point: true });
    }
  });
  const components = [];
  let current = null;
  pieces.forEach((piece) => {
    if (!piece.included) {
      if (current) components.push(current);
      current = null;
      return;
    }
    if (!current) current = { left: piece.left, leftClosed: piece.point, right: piece.right, rightClosed: piece.point };
    else Object.assign(current, { right: piece.right, rightClosed: piece.point });
  });
  if (current) components.push(current);
  return { top, bottom, relation, points, intervals, components, inclusive, wantPositive };
};

const readSolutionSet = (text) => {
  if (text === 'No solution (∅)') return [];
  return text.split(' ∪ ').map((part) => {
    const point = part.match(/^\{(.+)\}$/);
    if (point) return { left: bound(point[1]), leftClosed: true, right: bound(point[1]), rightClosed: true };
    const match = part.match(/^([[(])(.+), (.+)([\])])$/);
    assert.ok(match, `a piece: "${part}"`);
    return { left: bound(match[2]), leftClosed: match[1] === '[', right: bound(match[3]), rightClosed: match[4] === ']' };
  });
};

/* ------------------------------------------------------- display hygiene -- */

const hygiene = (model, label) => {
  const texts = [model.title, ...model.steps, model.why, model.note || '', ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((text) => {
    assert.doesNotMatch(text, /NaN|undefined|Infinity|\[object|\bnull\b/, `${label}: no broken value in "${text}"`);
    // The power rule's sign sequence ("+ + − +") is signs, not arithmetic.
    const arithmetic = text.replace(/that gives [+− ]+ —/, '');
    assert.doesNotMatch(arithmetic, /[+−-] [−-]\d|[−-]{2}|\+ \+|[−-]0(?![.\d])/, `${label}: no doubled sign or -0 in "${text}"`);
    assert.doesNotMatch(text, /(?<![\d.])[01]x/, `${label}: no "1x" / "0x" in "${text}"`);
    assert.doesNotMatch(text, /\(x [−+] 0\)/, `${label}: no "(x − 0)" in "${text}"`);
    assert.doesNotMatch(text, /\d\.\d*0(?!\d)/, `${label}: no trailing-zero decimal in "${text}"`);
  });
};

/* ---------------------------------------------------- the chart audit -- */

const signChar = (sign) => (sign > 0 ? '+' : '−');

const auditChart = (question, rational, label) => {
  const model = buildSignSolutionAnalyzerReview(question);
  assert.ok(model, `${label}: explained`);
  hygiene(model, label);
  const key = chartKey(question, rational);
  const item = (name) => model.items.find((entry) => entry.label === name)?.value;

  // The inequality is the question's.
  const inequality = item('Inequality');
  const [expressionText, symbol, zero] = inequality.split(/ ([<>≤≥]) /);
  assert.equal(symbol, RELATIONS[key.relation], `${label}: the relation`);
  assert.equal(zero, '0');
  const expression = readExpression(expressionText);
  assert.ok(sameMap(expression.top, key.top), `${label}: the numerator of "${inequality}"`);
  assert.ok(sameMap(expression.bottom, key.bottom), `${label}: the denominator of "${inequality}"`);

  // Critical points and the "(denominator 0)" notes.
  const critical = item('Critical points').split(', ').map((text) => {
    const match = text.match(/^x = (\S+)( \(denominator 0\))?$/);
    assert.ok(match, `${label}: a critical point "${text}"`);
    return { value: num(match[1]), excluded: Boolean(match[2]) };
  });
  assert.deepEqual(critical.map((point) => point.value), key.points, `${label}: the critical points`);
  critical.forEach((point) => assert.equal(point.excluded, key.bottom.has(point.value), `${label}: x = ${point.value} denominator note`));

  // The interval list.
  const intervalStep = model.steps.find((step) => /split(s)? the number line into/.test(step));
  const listed = intervalStep.match(/into (\d+) intervals: (.+)\. The expression/);
  assert.equal(Number(listed[1]), key.intervals.length, `${label}: interval count`);
  const labels = listed[2].split(/, (?=\()/);
  assert.deepEqual(labels.map(parseInterval), key.intervals.map((interval) => [interval.left, interval.right]), `${label}: the intervals in order`);

  // One test step per interval, in order.
  const tests = model.steps.filter((step) => step.startsWith('Test x = '));
  assert.equal(tests.length, key.intervals.length, `${label}: one test per interval`);
  tests.forEach((step, index) => {
    const interval = key.intervals[index];
    const match = step.match(/^Test x = (\S+) in (\(.+?\)): (.+)\. The expression's sign is (.+) = ([+−]), and (positive|negative) (satisfies|does not satisfy) ([<>≤≥]) 0, so (select|leave) (\(.+?\))( unselected)?\.$/);
    assert.ok(match, `${label}: a test step "${step}"`);
    const [, tText, inLabel, factorsText, pattern, product, word, satisfies, sym, verb, again] = match;
    assert.equal(inLabel, labels[index]);
    assert.equal(again, labels[index]);
    assert.equal(sym, RELATIONS[key.relation]);
    const t = F(num(tText));
    assert.ok(t.valueOf() > interval.left && t.valueOf() < interval.right, `${label}: ${tText} is inside ${inLabel}`);
    const trueSign = signAt(key.top, key.bottom, t);
    assert.equal(trueSign, interval.sign, `${label}: one sign per interval`);
    assert.equal(product, signChar(trueSign), `${label}: the sign at ${tText}`);
    assert.equal(word, trueSign > 0 ? 'positive' : 'negative');
    assert.equal(satisfies === 'satisfies', interval.included, `${label}: the verdict at ${tText}`);
    assert.equal(verb === 'select', interval.included);
    // Each factor's value and sign at t.
    const groups = rational
      ? factorsText.match(/^numerator (.+); denominator (.+)$/).slice(1)
      : [factorsText];
    const patternGroups = rational ? pattern.split(' / ') : [pattern];
    assert.equal(patternGroups.length, groups.length);
    groups.forEach((groupText, side) => {
      const truth = side === 0 ? key.top : key.bottom;
      const patternSigns = [...patternGroups[side].matchAll(/\(([+−])\)/g)].map((m) => m[1]);
      if (groupText === '1 (+)') {
        assert.equal(truth.size, 0);
        assert.deepEqual(patternSigns, ['+']);
        return;
      }
      const entries = groupText.split(', ');
      assert.equal(entries.length, truth.size, `${label}: every factor tested in "${groupText}"`);
      const seen = new Map();
      entries.forEach((entry, position) => {
        const parts = entry.match(/^(.+) → (.+) \(([+−])\)$/);
        assert.ok(parts, `${label}: a factor at t "${entry}"`);
        const factor = readProduct(parts[1]);
        assert.equal(factor.size, 1);
        const [[root, power]] = [...factor];
        assert.equal(truth.get(root), power, `${label}: ${parts[1]} is a factor with its power`);
        seen.set(root, power);
        const valueMatch = parts[2].match(/^\(?(-?\d+(?:\.\d+)?)\)?([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/);
        assert.ok(valueMatch, `${label}: a value "${parts[2]}"`);
        const difference = t.sub(F(root)).valueOf();
        assert.ok(Math.abs(Number(valueMatch[1]) - difference) <= 5e-7, `${label}: ${parts[1]} at ${tText} is ${difference}, shown ${valueMatch[1]}`);
        assert.equal(fromSuperscript(valueMatch[2]), power, `${label}: the power shown with ${parts[2]}`);
        if (Number(valueMatch[1]) < 0 && power > 1) assert.ok(parts[2].startsWith('('), `${label}: a negative base is bracketed under a power`);
        const factorSign = difference < 0 && power % 2 === 1 ? -1 : 1;
        assert.equal(parts[3], signChar(factorSign), `${label}: the sign of ${entry}`);
        assert.equal(patternSigns[position], parts[3], `${label}: the pattern follows the factors`);
      });
      assert.ok(sameMap(seen, truth));
    });
  });

  // The power rule.
  const rules = [...model.why.matchAll(/at x = (\S+) the power is (\d+) \((odd|even)\), so the sign (flips to|stays) ([+−])/g)];
  assert.equal(rules.length, key.points.length, `${label}: one power-rule link per critical point`);
  rules.forEach(([, at, powerText, parity, move, sign], index) => {
    const point = key.points[key.points.length - 1 - index];
    assert.equal(num(at), point);
    const total = (key.top.get(point) || 0) + (key.bottom.get(point) || 0);
    assert.equal(Number(powerText), total, `${label}: the power at ${point}`);
    assert.equal(parity, total % 2 ? 'odd' : 'even');
    assert.equal(move, total % 2 ? 'flips to' : 'stays');
    assert.equal(sign, signChar(key.intervals[key.points.length - 1 - index].sign), `${label}: the sign left of ${point}`);
  });
  const sequence = model.why.match(/From left to right that gives ([+− ]+?) — /);
  assert.equal(sequence[1], key.intervals.map((interval) => signChar(interval.sign)).join(' '), `${label}: the sign sequence`);

  // Intervals to select, typed back as toggles.
  const selectText = item('Intervals to select');
  const selected = selectText.startsWith('None') ? [] : selectText.split(' ∪ ');
  const expected = key.intervals.map((interval, index) => (interval.included ? index : null)).filter((index) => index !== null);
  const indexes = selected.map((text) => labels.indexOf(text));
  assert.deepEqual(indexes, expected, `${label}: the intervals to select`);
  const verdict = grade(question, { selected: indexes });
  assert.equal(verdict.graded, true);
  assert.equal(verdict.isCorrect, true, `${label}: the shared grader accepts ${JSON.stringify(indexes)}`);

  // The full solution set, as sets.
  const solutionText = item('Solution set');
  assert.deepEqual(readSolutionSet(solutionText), key.components, `${label}: the solution set "${solutionText}"`);
  assert.ok(model.steps[model.steps.length - 1].endsWith(`Solution set: ${solutionText}.`));
  const isolated = key.components.filter((part) => part.left === part.right).map((part) => part.left);
  if (isolated.length) {
    assert.ok(model.note && isolated.every((value) => model.note.includes(`x = ${value}`)), `${label}: the isolated zeros are noted`);
  } else {
    assert.equal(model.note, null);
  }
  return model;
};

/* ---------------------------------------------------- the radical audit -- */

// "2(-1) + 3 = 1" / "−(-3) + 6" / "9": every side evaluates to the same value.
const chainValue = (text) => {
  const values = text.split(' = ').map((side) => math.evaluate(side.replace(/−/g, '-')));
  values.forEach((value) => assert.ok(Math.abs(value - values[0]) <= 1e-9, `"${text}" holds`));
  return values[values.length - 1];
};
const linearAt = (text, x) => math.evaluate(text.replace(/−/g, '-').replace(/²/g, '^2'), { x });

const auditRadical = (question, label) => {
  const model = buildSignSolutionAnalyzerReview(question);
  assert.ok(model, `${label}: explained`);
  hygiene(model, label);
  const spec = question.radicalEquation;
  const m1 = F(spec.radicand.m ?? 1);
  const b1 = F(spec.radicand.b ?? 0);
  const m2 = F(spec.rhs.m ?? 0);
  const b2 = F(spec.rhs.b ?? 0);
  const item = (name) => model.items.find((entry) => entry.label === name)?.value;

  // The equation item is the question's equation.
  const equation = item('Equation');
  const parts = equation.match(/^√\(?(.+?)\)? = (.+)$/);
  assert.ok(parts, `${label}: "${equation}"`);
  [-2, 0, 1, 3].forEach((x) => {
    assert.ok(Math.abs(linearAt(parts[1], x) - m1.mul(x).add(b1).valueOf()) < 1e-9, `${label}: radicand of "${equation}"`);
    assert.ok(Math.abs(linearAt(parts[2], x) - m2.mul(x).add(b2).valueOf()) < 1e-9, `${label}: right side of "${equation}"`);
  });

  const truth = question.candidates.map((candidate) => {
    const x = F(Number(candidate));
    const radicand = m1.mul(x).add(b1);
    const right = m2.mul(x).add(b2);
    const reason = radicand.compare(0) < 0 ? 'outside the domain'
      : right.compare(0) >= 0 && right.mul(right).equals(radicand) ? null : 'extraneous';
    return { candidate, x, radicand, right, reason, label: `x = ${typeof candidate === 'string' ? candidate.trim() : candidate}`, squares: right.mul(right).equals(radicand) };
  });
  const genuine = truth.filter((entry) => entry.reason === null);
  const rejected = truth.filter((entry) => entry.reason !== null);
  assert.equal(item('Genuine solutions (select)'), genuine.length ? genuine.map((entry) => entry.label).join(', ') : 'None — select no candidate', `${label}: genuine`);
  assert.equal(item('Rejected candidates'), rejected.length ? rejected.map((entry) => `${entry.label} (${entry.reason})`).join(', ') : 'None', `${label}: rejected`);

  // Each candidate's step.
  truth.forEach((entry, index) => {
    const step = model.steps[index + 1];
    assert.ok(step.startsWith(`${entry.label}: the radicand is `), `${label}: step for ${entry.label}`);
    const radicandWork = step.match(/the radicand is (.+?)(?:, which is negative|, so the left side)/)[1];
    assert.ok(Math.abs(chainValue(radicandWork) - entry.radicand.valueOf()) < 1e-9, `${label}: the radicand at ${entry.label}`);
    if (entry.reason === 'outside the domain') {
      assert.match(step, /which is negative, so √\((-?[\d.]+)\) is not a real number\. .* is outside the domain — leave it unselected\.$/);
      return;
    }
    const sides = step.match(/so the left side is √(\S+) (=|≈) (\S+), (?:and|but) the right side is (.+?)\. /);
    assert.ok(sides, `${label}: both sides in "${step}"`);
    assert.equal(num(sides[1]), entry.radicand.valueOf());
    const root = Math.sqrt(entry.radicand.valueOf());
    if (sides[2] === '=') assert.ok(Math.abs(num(sides[3]) - root) <= 1e-12, `${label}: √${sides[1]} = ${sides[3]}`);
    else assert.ok(Math.abs(num(sides[3]) - root) <= 5e-5 && Math.abs(num(sides[3]) - root) > 1e-12, `${label}: √${sides[1]} ≈ ${sides[3]}`);
    assert.ok(Math.abs(chainValue(sides[4]) - entry.right.valueOf()) < 1e-9, `${label}: the right side at ${entry.label}`);
    if (entry.reason === null) {
      assert.match(step, /Both sides equal (\S+), so .* is a genuine solution — select it\.$/);
      assert.equal(num(step.match(/Both sides equal (\S+),/)[1]), entry.right.valueOf());
    } else {
      const unequal = step.match(/\. (\S+) ≠ (\S+)( — a square root is never negative)?, so .* is extraneous — leave it unselected\.$/);
      assert.ok(unequal, `${label}: "${step}"`);
      assert.equal(unequal[1], sides[3]);
      assert.equal(num(unequal[2]), entry.right.valueOf());
      assert.equal(Boolean(unequal[3]), entry.right.valueOf() < 0, `${label}: "never negative" exactly when the right side is negative`);
    }
  });

  // The squared equation: radicand = (right side)², read back at sample x.
  const squared = model.why.match(/gives (.+?) = (.+?)\.(?: |$)/);
  assert.ok(squared, `${label}: the squared equation in "${model.why}"`);
  [-2, 0, 1, 3].forEach((x) => {
    assert.ok(Math.abs(linearAt(squared[1], x) - m1.mul(x).add(b1).valueOf()) < 1e-9);
    assert.ok(Math.abs(linearAt(squared[2], x) - m2.mul(x).add(b2).pow(2).valueOf()) < 1e-9, `${label}: "${squared[2]}" is the square of the right side`);
  });
  // "satisfies that squared equation too": exactly the extraneous candidates whose squares match.
  const traps = truth.filter((entry) => entry.reason === 'extraneous' && entry.squares);
  traps.forEach((entry) => {
    assert.ok(model.why.includes(`for ${entry.label}, `), `${label}: ${entry.label} is named as satisfying the squared equation`);
    assert.ok(entry.right.valueOf() < 0, `${label}: the trap's right side is negative, as claimed`);
  });
  if (!traps.length) assert.doesNotMatch(model.why, /squared equation too/);

  const verdict = grade(question, { selected: genuine.map((entry) => entry.candidate) });
  assert.equal(verdict.isCorrect, true, `${label}: the shared grader accepts the genuine solutions`);
  if (rejected.length) {
    assert.equal(grade(question, { selected: [...genuine, rejected[0]].map((entry) => entry.candidate) }).isCorrect, false);
  }
  return model;
};

/* ------------------------------------------------------------ the draws -- */

const SEEDS = 260;

const drawRoot = (random, style) => (style === 'int' ? int(random, -7, 7) : int(random, -45, 45) / 10);

const drawChart = (random, rational) => {
  const style = random() < 0.6 ? 'int' : 'decimal';
  const roots = [];
  const count = rational ? int(random, 0, 3) : int(random, 1, 4);
  const factors = [];
  for (let k = 0; k < count; k += 1) {
    // Sometimes the same factor twice (a repeated root written out).
    const root = roots.length && random() < 0.15 ? pick(random, roots) : drawRoot(random, style);
    roots.push(root);
    const multiplicity = random() < 0.65 ? undefined : int(random, 1, 4);
    factors.push(multiplicity === undefined ? { root } : { root, multiplicity });
  }
  const relation = pick(random, ['>', '>=', '<', '<=']);
  if (!rational) {
    const question = { factors, relation };
    if (random() < 0.5) question.mode = 'polynomial';
    return question;
  }
  const denominatorFactors = [];
  const bottomCount = int(random, 1, 2);
  for (let k = 0; k < bottomCount; k += 1) {
    // A shared root sometimes: a hole, or a cancelled power.
    const root = roots.length && random() < 0.3 ? pick(random, roots) : drawRoot(random, style);
    denominatorFactors.push(random() < 0.7 ? { root } : { root, multiplicity: int(random, 1, 3) });
  }
  const question = { numeratorFactors: factors, denominatorFactors, relation };
  if (random() < 0.5) question.mode = 'rational';
  return question;
};

test('polynomial sign charts: every relation, repeated and decimal roots, recomputed', () => {
  const random = prng(7001);
  for (let index = 0; index < SEEDS; index += 1) {
    const question = drawChart(random, false);
    auditChart(question, false, JSON.stringify(question));
  }
  [
    { factors: [{ root: 0 }], relation: '>' },
    { factors: [{ root: 0, multiplicity: 2 }], relation: '>=' }, // all reals
    { factors: [{ root: 0, multiplicity: 2 }], relation: '<' }, // no solution
    { factors: [{ root: 0, multiplicity: 2 }], relation: '<=' }, // one point
    { factors: [{ root: 1, multiplicity: 2 }, { root: 3 }], relation: '>=' }, // isolated zero
    { factors: [{ root: -2 }, { root: -2 }, { root: 5 }], relation: '<' },
    { factors: [{ root: '-2', multiplicity: '1' }, { root: '3.5' }], relation: '<=' },
    { factors: [{ root: 0.001 }, { root: 0.002 }], relation: '<' },
    { factors: [{ root: -3, multiplicity: 3 }, { root: 4, multiplicity: 4 }], relation: '>' },
  ].forEach((question) => auditChart(question, false, JSON.stringify(question)));
});

test('rational sign charts: holes, a numerator of 1, shared and even powers, recomputed', () => {
  const random = prng(7002);
  for (let index = 0; index < SEEDS; index += 1) {
    const question = drawChart(random, true);
    auditChart(question, true, JSON.stringify(question));
  }
  [
    { mode: 'rational', numeratorFactors: [], denominatorFactors: [{ root: 1 }], relation: '<' },
    { mode: 'rational', numeratorFactors: [], denominatorFactors: [{ root: 1, multiplicity: 2 }], relation: '>=' },
    { mode: 'rational', numeratorFactors: [{ root: 2 }, { root: -1 }], denominatorFactors: [{ root: 2 }], relation: '>=' },
    { mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: 2 }], relation: '>' },
    { mode: 'rational', numeratorFactors: [{ root: 2, multiplicity: 2 }], denominatorFactors: [{ root: 2 }], relation: '<=' },
    { mode: 'rational', numeratorFactors: [{ root: 0 }, { root: -2.5, multiplicity: 2 }], denominatorFactors: [{ root: 3 }, { root: 0 }], relation: '>=' },
    { numeratorFactors: [{ root: -1 }], denominatorFactors: [{ root: 3, multiplicity: 2 }], relation: '>' },
  ].forEach((question) => auditChart(question, true, JSON.stringify(question)));
});

test('radical equations: genuine, extraneous and out-of-domain candidates, recomputed', () => {
  const random = prng(7003);
  let genuine = 0;
  let traps = 0;
  for (let index = 0; index < SEEDS; index += 1) {
    // Build the equation from a chosen solution so genuine roots occur.
    const m1 = pick(random, [1, 1, 2, 3, -1, -2, 0.5, 4]);
    const m2 = pick(random, [0, 1, 1, -1, 2, 0.5]);
    const b2 = int(random, -6, 6);
    const solution = int(random, -6, 8);
    const right = m2 * solution + b2;
    // radicand at the solution = right² (a genuine root when right ≥ 0, a trap when right < 0).
    const b1 = right * right - m1 * solution;
    const candidates = new Set([solution]);
    // The other root of the squared equation, when it is a short decimal.
    const A = m2 * m2;
    const B = 2 * m2 * b2 - m1;
    const Cc = b2 * b2 - b1;
    if (A !== 0) {
      const other = -B / A - solution;
      if (Number.isFinite(other) && Math.abs(other * 100 - Math.round(other * 100)) < 1e-9) candidates.add(Number(other.toFixed(2)));
    } else if (B !== 0) {
      candidates.add(-Cc / B);
    }
    while (candidates.size < int(random, 2, 4)) candidates.add(int(random, -10, 10));
    const list = [...candidates].map((value) => (random() < 0.2 ? String(value) : value));
    const question = { mode: 'radicalCheck', radicalEquation: { radicand: { m: m1, b: b1 }, rhs: { m: m2, b: b2 } }, candidates: list };
    const model = auditRadical(question, JSON.stringify(question));
    if (!model.items[1].value.startsWith('None')) genuine += 1;
    if (/squared equation too/.test(model.why)) traps += 1;
  }
  assert.ok(genuine > SEEDS / 4 && traps > 10, `${genuine} with a genuine solution, ${traps} with a squared-equation trap`);
  [
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 0, b: 0 } }, candidates: [0, 1] },
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 0, b: -2 } }, candidates: [4] },
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: -2, b: 3 }, rhs: { m: 1, b: -1 } }, candidates: [-3, 1, 2, '0.5'] },
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: 0, b: 9 }, rhs: { m: 1, b: 0 } }, candidates: [3, -3] },
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 7 }, rhs: { m: 1, b: -5 } }, candidates: [9, 2, -8] },
    { mode: 'radicalCheck', radicalEquation: { radicand: { m: 0.5, b: 2 }, rhs: { m: 0, b: 2 } }, candidates: [4, -6] },
  ].forEach((question) => auditRadical(question, JSON.stringify(question)));
});

test('a relation written as the symbol ≥ or ≤ is graded and explained as the chart shows it', () => {
  // The chart shows "≥ 0" for relation '≥' (and the V5 compiler copies the
  // symbol through), but the grader used to read it by its first character —
  // as '<': the negative intervals were marked right, the positive ones wrong.
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Sign charts', courseId: 'algebra2' },
    sections: [{ role: 'practice', questions: [
      { prompt: 'Solve (x + 2)(x − 3) ≥ 0.', studentActions: ['solve inequality'], signChart: { factors: [{ root: -2 }, { root: 3 }], relation: '≥' } },
      { prompt: 'Solve (x + 2)(x − 3) ≤ 0.', studentActions: ['solve inequality'], signChart: { factors: [{ root: -2 }, { root: 3 }], relation: '≤' } },
    ] }],
  }).package.sections[0].questions;
  assert.equal(compiled[0].relation, '≥', 'the compiler keeps the symbol');
  // (−∞, −2), (−2, 3), (3, ∞): ≥ 0 is the outer two, ≤ 0 the middle one.
  assert.equal(grade(compiled[0], { selected: [0, 2] }).isCorrect, true, '≥: the positive intervals are right');
  assert.equal(grade(compiled[0], { selected: [1] }).isCorrect, false, '≥: the negative interval is wrong');
  assert.equal(grade(compiled[1], { selected: [1] }).isCorrect, true, '≤: the negative interval is right');
  assert.equal(grade(compiled[1], { selected: [0, 2] }).isCorrect, false);
  const atLeast = auditChart(compiled[0], false, 'V5 ≥');
  assert.equal(atLeast.items.find((item) => item.label === 'Solution set').value, '(−∞, -2] ∪ [3, ∞)');
  const atMost = auditChart(compiled[1], false, 'V5 ≤');
  assert.equal(atMost.items.find((item) => item.label === 'Solution set').value, '[-2, 3]');
  auditChart({ mode: 'rational', numeratorFactors: [{ root: 1 }], denominatorFactors: [{ root: -1 }], relation: '≥' }, true, 'rational ≥');
  auditChart({ factors: [{ root: 2, multiplicity: 2 }], relation: '≤' }, false, 'a single point, ≤');
});

test('a substituted −x at x = 0 is written −(0), never "−0"', () => {
  const question = { mode: 'radicalCheck', radicalEquation: { radicand: { m: 4, b: 9 }, rhs: { m: -1, b: -3 } }, candidates: [0, -2] };
  const model = auditRadical(question, 'rhs −x − 3 at x = 0');
  assert.ok(model.steps[1].includes('the right side is −(0) − 3 = -3'), model.steps[1]);
  const bare = auditRadical({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: -1, b: 0 } }, candidates: [0, -1] }, 'rhs −x');
  assert.ok(bare.steps[1].includes('the right side is −(0) = 0'), bare.steps[1]);
});

test('the audit itself can fail: a wrong sign, a wrong set, a wrong radical verdict', () => {
  const question = { factors: [{ root: 1, multiplicity: 2 }, { root: 3 }], relation: '>=' };
  const key = chartKey(question, false);
  assert.deepEqual(key.components, [{ left: 1, leftClosed: true, right: 1, rightClosed: true }, { left: 3, leftClosed: true, right: Infinity, rightClosed: false }]);
  assert.notDeepEqual(readSolutionSet('[3, ∞)'), key.components);
  assert.deepEqual(readSolutionSet('{1} ∪ [3, ∞)'), key.components);
  assert.throws(() => chainValue('2(-1) + 3 = 2'));
  assert.ok(sameMap(readProduct('x(x + 2.5)²'), new Map([[0, 1], [-2.5, 2]])));
  assert.ok(!sameMap(readProduct('(x − 2.5)²'), new Map([[-2.5, 2]])));
});
