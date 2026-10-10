import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';
import Fraction from 'fraction.js';

import { buildPolynomialWorkshopReview } from '../../src/tools/shared/reviews/polynomialWorkshopReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE POLYNOMIAL WORKSHOP WORKED SOLUTION, RECOMPUTED
 * INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws per view
 * (plus the edge cases: a root at 0, missing powers, decimal coefficients, a
 * negative leading coefficient, a zero middle term, a dividend of lower degree
 * than its divisor, an exact division, repeated roots, a hole whose cancelled
 * form is 0 there, a target that is no root), the key is recomputed here in
 * exact Fraction arithmetic from the question alone, and every relation the
 * review writes is parsed back out of its TeX and checked with mathjs:
 *
 *   a chain of numbers holds exactly ("≠" too);
 *   an equation in x is an identity (checked at five x values) — every
 *   expansion, every "divide, multiply back, subtract" round, every check;
 *   "x = c" names the candidate, the target, a zero or the divisor's zero;
 *   the prose claims are recomputed: multiplicities and how many copies
 *   cancel, the listed factor pairs and their sums, the sign of P either side
 *   of the target zero, the parity of the degree and the end behavior, what
 *   each area cell holds, and each division round starting where the last
 *   one left off.
 *
 * The stated answers are compared with the exact key, typed back and graded by
 * the shared grader, and the text is checked for display hygiene.
 */

const TOOL_ID = 'polynomialWorkshop';
const math = create(all);
const F = (value) => new Fraction(value);
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const OWN = { choicesAreOwn: true };

// A small deterministic PRNG (mulberry32), so every run draws the same cases.
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

/* ------------------------------------------------------------- reading TeX */

const readGroup = (text, start) => {
  assert.equal(text[start], '{', `a group at ${start} in "${text}"`);
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return [text.slice(start + 1, index), index + 1];
    }
  }
  throw new Error(`unbalanced braces in "${text}"`);
};
const convert = (text) => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('\\frac', index)) {
      const [top, afterTop] = readGroup(text, index + 5);
      const [bottom, afterBottom] = readGroup(text, afterTop);
      out += `((${convert(top)})/(${convert(bottom)}))`;
      index = afterBottom;
    } else if (text[index] === '^' && text[index + 1] === '{') {
      const [exponent, after] = readGroup(text, index + 1);
      out += `^(${convert(exponent)})`;
      index = after;
    } else if (text[index] === '\\') {
      throw new Error(`an unknown command in "${text}"`);
    } else {
      out += text[index];
      index += 1;
    }
  }
  return out;
};
// TeX → mathjs: x( is x times a group, pq is p·q; P(…) and f(…) are the
// independent polynomial and rational function of the scope.
const texToMath = (tex) => convert(String(tex).replace(/−/g, '-')
  .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
  .replace(/\\cdot/g, '*').replace(/\\div/g, '/')
  .replace(/(?<![A-Za-z])x\(/g, 'x*(')
  .replace(/\bpq\b/g, 'p*q')
  .trim());

const RELATIONS = [[' \\neq ', '≠'], [' = ', '=']];
const splitChain = (tex) => {
  const parts = [];
  const ops = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < tex.length; index += 1) {
    const char = tex[index];
    if (char === '{' || char === '(') depth += 1;
    if (char === '}' || char === ')') depth -= 1;
    if (depth !== 0) continue;
    const found = RELATIONS.find(([token]) => tex.startsWith(token, index));
    if (found) {
      parts.push(tex.slice(start, index));
      ops.push(found[1]);
      start = index + found[0].length;
      index = start - 1;
    }
  }
  parts.push(tex.slice(start));
  return { parts, ops };
};
const mathSegments = (text) => [...String(text).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
const freeSymbols = (expression) => {
  const names = new Set();
  math.parse(expression).traverse((node, path) => {
    if (node.isSymbolNode && path !== 'fn') names.add(node.name);
  });
  return [...names];
};
const evaluateIn = (expression, scope) => {
  const value = math.evaluate(expression, { ...scope });
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const close = (a, b, scale = 1) => Math.abs(a - b) <= 1e-9 * Math.max(1, scale, Math.abs(a), Math.abs(b));

/* ----------------------------------------------- exact polynomial arithmetic */

const trim = (list) => {
  const copy = [...list];
  while (copy.length > 1 && copy[0].equals(0)) copy.shift();
  return copy;
};
const evaluateExact = (coefficients, x) => coefficients.reduce((total, c) => total.mul(x).add(c), F(0));
const multiplyExact = (a, b) => {
  const out = Array(a.length + b.length - 1).fill(null).map(() => F(0));
  a.forEach((av, i) => b.forEach((bv, j) => { out[i + j] = out[i + j].add(av.mul(bv)); }));
  return trim(out);
};
const divideExact = (dividend, divisor) => {
  const N = trim(dividend);
  const D = trim(divisor);
  if (N.length < D.length) return { quotient: [F(0)], remainder: N };
  const work = [...N];
  const quotient = [];
  for (let i = 0; i <= N.length - D.length; i += 1) {
    const factor = work[i].div(D[0]);
    quotient.push(factor);
    D.forEach((d, j) => { work[i + j] = work[i + j].sub(factor.mul(d)); });
  }
  return { quotient: trim(quotient), remainder: trim(work.slice(N.length - D.length + 1).length ? work.slice(N.length - D.length + 1) : [F(0)]) };
};
const fromRoots = (roots, leading) => roots.reduce((poly, root) => multiplyExact(poly, [F(1), F(root).neg()]), [F(leading)]);

/* --------------------------------------------------------- display hygiene */

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertClean = (model, label) => {
  const texts = [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
  texts.forEach((raw) => {
    // "0/0, which is undefined" and "(x − 0), that is x" are the review's words.
    const text = String(raw).replace(/−/g, '-').replace(/which is undefined/g, '').replace(/\(x - 0\)/g, '');
    assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object|\bnull\b/, `${label}: leaked value in "${raw}"`);
    assert.doesNotMatch(text, /[+-]\s+-\s*\d|--|\+\s*\+|\+ -/, `${label}: a doubled sign in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.}^])1x|(^|[^\d.])0x/, `${label}: a written-out 1 or 0 coefficient in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.])-0(?![\d.])/, `${label}: −0 in "${raw}"`);
    assert.doesNotMatch(text, /x [+-] 0\)|\^\{1\}|\^\{0\}/, `${label}: a zero shift or a 0/1 power in "${raw}"`);
    assert.doesNotMatch(text, /\d\.\d{7,}|e[+-]\d/, `${label}: an unrounded or exponent-notation number in "${raw}"`);
    // A fraction a relation ends on is in lowest terms (one written out to be
    // divided, as in 20/4 = 5 or 0/24 = 0, is a computation, not a result).
    const results = mathSegments(text).map((segment) => splitChain(segment).parts.at(-1).trim());
    for (const [, n, d] of results.join('\n').matchAll(/^-?\\frac\{(\d+)\}\{(\d+)\}$/gm)) {
      if (n !== '0') assert.equal(gcd(Number(n), Number(d)), 1, `${label}: \\frac{${n}}{${d}} not in lowest terms in "${raw}"`);
    }
  });
};

/* ------------------------------------------------- every relation it writes */

const SAMPLES = [-2.7, -1.3, 0.4, 1.9, 3.3];

/*
 * context: { scope, xValues: the numbers "x = c" may name, identityOk(segment)
 * for an equation in x that is not an identity (a "= 0" equation) }.
 */
const auditRelations = (model, context, label) => {
  let checked = 0;
  const texts = [...model.steps, model.why, model.note].filter(Boolean);
  texts.forEach((text) => mathSegments(text).forEach((segment) => {
    const point = segment.match(/^\(([^,]+), ([^,]+)\)$/);
    if (point) {
      assert.ok(context.point, `${label}: a point is expected only for a hole in "${text}"`);
      const [x, y] = point.slice(1).map((part) => evaluateIn(texToMath(part), {}));
      assert.ok(close(x, context.point[0]) && close(y, context.point[1]), `${label}: the hole is (${context.point}), not (${x}, ${y})`);
      checked += 1;
      return;
    }
    const { parts, ops } = splitChain(segment);
    if (ops.length === 0) return;
    const expressions = parts.map((part) => texToMath(part));
    const symbols = [...new Set(expressions.flatMap(freeSymbols))];
    // The Factor Theorem stated in general, with r.
    if (symbols.includes('r')) return;
    const scope = { ...context.scope };
    const statement = segment.match(/^x (=|\\neq) (-?[\d.]+)$/);
    if (statement) {
      assert.ok(context.xValues.some((value) => close(value, Number(statement[2]))), `${label}: "${segment}" names one of ${context.xValues} in "${text}"`);
      checked += 1;
      return;
    }
    if (symbols.includes('x')) {
      if (context.equationOk && context.equationOk(segment)) return;
      SAMPLES.forEach((x) => {
        const values = expressions.map((expression) => evaluateIn(expression, { ...scope, x }));
        values.forEach((value, index) => assert.ok(value !== null, `${label}: "${parts[index]}" has a value at x = ${x}`));
        ops.forEach((op, index) => {
          const equal = close(values[index], values[index + 1], 1e3);
          assert.ok(op === '=' ? equal : !equal, `${label}: ${parts[index]} ${op} ${parts[index + 1]} for all x (at ${x}: ${values[index]} vs ${values[index + 1]}) in "${text}"`);
        });
      });
      checked += 1;
      return;
    }
    const values = expressions.map((expression, index) => {
      const value = evaluateIn(expression, scope);
      assert.ok(value !== null, `${label}: "${parts[index]}" has a value in "${segment}"`);
      return value;
    });
    ops.forEach((op, index) => {
      const equal = close(values[index], values[index + 1]);
      assert.ok(op === '=' ? equal : !equal, `${label}: ${parts[index]} ${op} ${parts[index + 1]} (${values[index]} vs ${values[index + 1]}) in "${text}"`);
    });
    checked += 1;
  }));
  assert.ok(checked >= (context.minimum ?? 2), `${label}: the audit read the review's relations (${checked})`);
};

const listOf = (text) => String(text).split(',').map((piece) => F(piece.trim()));
const sameExactList = (a, b) => a.length === b.length && a.every((value, index) => value.equals(b[index]));
const polyFn = (coefficients) => (x) => coefficients.reduce((total, c) => total * x + c.valueOf(), 0);

/* ----------------------------------------------------------- per view */

const audits = {
  factorZero: (question, model, label) => {
    const coefficients = trim((question.coefficients || [1, -5, 6]).map(F));
    const root = F(question.candidateRoot ?? 2);
    const value = evaluateExact(coefficients, root);
    const isFactor = value.equals(0);
    const [valueItem, factorItem] = model.items;
    assert.ok(F(valueItem.value).equals(value), `${label}: P(r) is ${value.toFraction()}, not ${valueItem.value}`);
    assert.equal(factorItem.value, isFactor ? 'Yes' : 'No', `${label}: the Factor Theorem verdict`);
    auditRelations(model, { scope: { P: polyFn(coefficients) }, xValues: [root.valueOf()] }, label);
    return { value: valueItem.value, factorChoice: isFactor ? 'yes' : 'no' };
  },

  multiplyArea: (question, model, label) => {
    const [a, b] = (question.leftBinomial || [2, 3]).map(F);
    const [c, d] = (question.rightBinomial || [1, -4]).map(F);
    const cells = [a.mul(c), a.mul(d), b.mul(c), b.mul(d)];
    const product = [cells[0], cells[1].add(cells[2]), cells[3]];
    model.items.slice(0, 4).forEach((item, index) => assert.ok(F(item.value).equals(cells[index]), `${label}: cell ${index + 1} is ${cells[index].toFraction()}`));
    assert.ok(sameExactList(listOf(model.items[4].value), product), `${label}: the expanded list`);
    // "cell 1 holds -3": the prose names the same cells.
    const held = [...model.steps.join(' ').matchAll(/cell (\d) holds (-?\d+(?:\.\d+)?)/g)];
    assert.equal(held.length, 4, `${label}: each cell is named`);
    held.forEach(([, index, value]) => assert.ok(F(value).equals(cells[Number(index) - 1]), `${label}: cell ${index} holds ${cells[Number(index) - 1].toFraction()}`));
    auditRelations(model, { scope: {}, xValues: [2, 1, 3, -1, -2, 4, 5] }, label);
    return { cells: model.items.slice(0, 4).map((item) => item.value), expanded: model.items[4].value };
  },

  factorQuadratic: (question, model, label) => {
    const [, b, c] = (question.coefficients || [1, -5, 6]).map(Number);
    const p = Number(model.items[0].value);
    const q = Number(model.items[1].value);
    assert.ok(Number.isInteger(p) && Number.isInteger(q) && p + q === b && p * q === c, `${label}: p + q = ${b}, pq = ${c}`);
    // The factor pairs listed: every integer pair with product c, once, each sum right.
    const listed = [...model.steps.join(' ').matchAll(/\$(-?\d+)\$ and \$(-?\d+)\$ \(sum \$(-?\d+)\$\)/g)];
    if (listed.length) {
      listed.forEach(([, x, y, sum]) => assert.ok(Number(x) * Number(y) === c && Number(x) + Number(y) === Number(sum), `${label}: ${x}, ${y} (sum ${sum})`));
      const expected = new Set();
      for (let x = -Math.abs(c); x <= Math.abs(c); x += 1) if (x !== 0 && c % x === 0) expected.add([x, c / x].sort((m, n) => m - n).join(','));
      const seen = listed.map(([, x, y]) => [Number(x), Number(y)].sort((m, n) => m - n).join(','));
      assert.deepEqual([...new Set(seen)].sort(), [...expected].sort(), `${label}: every factor pair of ${c}, once`);
      assert.equal(seen.length, new Set(seen).size, `${label}: no pair twice`);
      assert.equal(listed.filter(([, , , sum]) => Number(sum) === b).length, 1, `${label}: only one pair adds to ${b}`);
    }
    const P = model.steps[0].match(/^Writing \$(.+?) = \(x \+ p\)\(x \+ q\)\$/)[1];
    auditRelations(model, {
      scope: { p, q },
      xValues: [-p, -q],
      equationOk: (segment) => segment === `${P} = 0`,
    }, label);
    return { p: String(p), q: String(q) };
  },

  division: (question, model, label) => {
    const N = trim((question.dividend || [1, -4, -7, 10]).map(F));
    const D = trim((question.divisor || [1, -2]).map(F));
    const { quotient, remainder } = divideExact(N, D);
    assert.ok(sameExactList(listOf(model.items[0].value), quotient), `${label}: the quotient ${quotient.map((v) => v.toFraction())}`);
    assert.ok(sameExactList(listOf(model.items[1].value), remainder), `${label}: the remainder ${remainder.map((v) => v.toFraction())}`);
    // Each round starts on what the last one left.
    const rounds = model.steps.map((step) => step.match(/Subtract: \$\((.+?)\) - \((.+?)\) = (.+?)\$\.$/)).filter(Boolean);
    const at = (tex) => SAMPLES.map((x) => evaluateIn(texToMath(tex), { x }));
    rounds.slice(1).forEach((round, index) => {
      const before = at(rounds[index][3]);
      at(round[1]).forEach((value, sample) => assert.ok(close(value, before[sample], 1e3), `${label}: round ${index + 2} starts on ${rounds[index][3]}`));
    });
    const dividendValue = polyFn(N);
    const zero = D.length === 2 ? D[1].neg().div(D[0]).valueOf() : null;
    auditRelations(model, { scope: { P: dividendValue }, xValues: zero === null ? [] : [zero], minimum: 1 }, label);
    const theorem = model.why.match(/the dividend's value there is \$(-?[\d.]+)\$/);
    if (theorem) assert.ok(evaluateExact(N, F(zero)).equals(F(theorem[1])), `${label}: the dividend's value at the divisor's zero`);
    return { quotient: model.items[0].value, remainder: model.items[1].value };
  },

  graphConnection: (question, model, label) => {
    const roots = question.roots || [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }];
    const leading = Number(question.leadingCoefficient ?? 1);
    const entries = roots.map((entry) => ({ root: Number(entry.root), multiplicity: Number(entry.multiplicity ?? 1) }));
    const targetValue = question.targetRoot ?? entries[0].root;
    const target = entries.find((entry) => Math.abs(entry.root - Number(targetValue)) < 1e-6) || entries[0];
    const degree = entries.reduce((total, entry) => total + entry.multiplicity, 0);
    const P = (x) => entries.reduce((total, { root, multiplicity }) => total * (x - root) ** multiplicity, leading);
    const behavior = target.multiplicity % 2 === 0 ? 'touches and turns' : 'crosses the x-axis';
    const end = degree % 2 === 0 ? (leading > 0 ? 'both ends rise' : 'both ends fall') : (leading > 0 ? 'left falls, right rises' : 'left rises, right falls');
    assert.equal(model.items[0].label, `At the target zero x = ${String(target.root).replace(/^-/, '−')}`, `${label}: the target zero`);
    assert.equal(model.items[0].value, behavior, `${label}: the behavior at the target`);
    assert.equal(model.items[1].value, end, `${label}: the end behavior`);
    const text = [...model.steps, model.why].join(' ');
    assert.match(text, new RegExp(`appears ${target.multiplicity === 1 ? '1 time' : `${target.multiplicity} times`}, so the zero has multiplicity ${target.multiplicity}, an ${target.multiplicity % 2 ? 'odd' : 'even'} number`), `${label}: the multiplicity`);
    assert.match(text, new RegExp(`${degree}\\$?, which is ${degree % 2 ? 'odd' : 'even'}`), `${label}: the degree`);
    assert.match(text, new RegExp(`which is ${leading > 0 ? 'positive' : 'negative'}\\.`), `${label}: the leading sign`);
    const far = text.match(/it is (positive|negative) when x is large and negative, and (positive|negative) when x is large and positive/);
    assert.ok(far, `${label}: the far-end signs`);
    assert.equal(far[1], P(-1e3) > 0 ? 'positive' : 'negative', `${label}: far left`);
    assert.equal(far[2], P(1e3) > 0 ? 'positive' : 'negative', `${label}: far right`);
    for (const [, x, sign] of text.matchAll(/\$P\((-?[\d.]+)\)\$ is (positive|negative)/g)) assert.equal(P(Number(x)) > 0 ? 'positive' : 'negative', sign, `${label}: P(${x}) is ${sign}`);
    for (const [, x, y, sign] of text.matchAll(/\$P\((-?[\d.]+)\)\$ and \$P\((-?[\d.]+)\)\$ are both (positive|negative)/g)) {
      [x, y].forEach((value) => assert.equal(P(Number(value)) > 0 ? 'positive' : 'negative', sign, `${label}: P(${value}) is ${sign}`));
      // No other zero lies between the two test points.
      entries.filter((entry) => entry !== target).forEach((entry) => assert.ok(entry.root <= Number(x) || entry.root >= Number(y), `${label}: no zero between the test points`));
    }
    auditRelations(model, { scope: { P }, xValues: [target.root], minimum: 2 }, label);
    return { behavior: target.multiplicity % 2 === 0 ? 'touches' : 'crosses', end, ...OWN };
  },

  rationalFeatures: (question, model, label) => {
    const numerator = (question.numeratorRoots || [2, -1]).map(Number);
    const denominator = (question.denominatorRoots || [2, 4]).map(Number);
    const all = [...new Set([...numerator, ...denominator])].sort((a, b) => a - b);
    const target = Number(question.targetValue ?? all[0] ?? 2);
    const count = (list) => list.filter((root) => root === target).length;
    const [n, d] = [count(numerator), count(denominator)];
    const cancelled = Math.min(n, d);
    const feature = cancelled > 0 && d === cancelled ? 'Hole' : d > cancelled ? 'Vertical asymptote' : n > 0 ? 'Zero / x-intercept' : 'None of these';
    assert.equal(model.items[0].value, feature, `${label}: the feature at ${target}`);
    const text = model.steps.join(' ');
    if (n && d) assert.match(text, new RegExp(`numerator \\(${n} times?\\) and the denominator \\(${d} times?\\), so ${cancelled === 1 ? '1 copy cancels' : `${cancelled} copies cancel`}`), `${label}: the multiplicities`);
    const product = (list, x) => list.reduce((total, root) => total * (x - root), 1);
    const f = (x) => product(numerator, x) / product(denominator, x);
    // Away from the cancelled factor, the cancelled form is f; at it, the hole.
    const remaining = (list, other) => {
      const copy = [...list];
      other.forEach((root) => {
        const index = copy.indexOf(root);
        if (index >= 0 && root === target) copy.splice(index, 1);
      });
      return copy;
    };
    const top = remaining(numerator, denominator.filter((root) => root === target).slice(0, cancelled));
    const bottom = remaining(denominator, numerator.filter((root) => root === target).slice(0, cancelled));
    const hole = feature === 'Hole' ? [target, product(top, target) / product(bottom, target)] : null;
    auditRelations(model, { scope: { f }, xValues: [target], point: hole, minimum: 1 }, label);
    const keys = { Hole: 'hole', 'Vertical asymptote': 'verticalAsymptote', 'Zero / x-intercept': 'zero', 'None of these': 'none' };
    return { choice: keys[feature], ...OWN };
  },
};

const auditOne = (mode, fields, label) => {
  const question = { type: TOOL_ID, mode, ...fields };
  const model = buildPolynomialWorkshopReview(question);
  if (!model) return { model, question };
  assertClean(model, label);
  const work = audits[mode](question, model, label);
  const result = grade(question, work);
  assert.equal(result.isCorrect, true, `${label}: graded correct (${JSON.stringify(work)})`);
  return { model, question };
};

/* ------------------------------------------------------------------ draws */

const SMALL = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 0.5, -1.5, 2.5, 0.25];
const NONZERO = [-3, -2, -1, 1, 2, 3, 4, 0.5, -0.5, 1.5];
const polynomial = (random, degree) => [pick(random, NONZERO), ...Array.from({ length: degree }, () => pick(random, SMALL))];

const draws = {
  factorZero: (random) => {
    const degree = int(random, 1, 4);
    const root = pick(random, [-3, -2, -1, 0, 1, 2, 3, 0.5, -1.5]);
    // Half the time, a polynomial with that root.
    const coefficients = random() < 0.5
      ? fromRoots([root, ...Array.from({ length: degree - 1 }, () => pick(random, [-2, -1, 0, 1, 2, 3]))], pick(random, NONZERO)).map((v) => v.valueOf())
      : polynomial(random, degree);
    return { coefficients, candidateRoot: root };
  },
  multiplyArea: (random) => ({ leftBinomial: [pick(random, NONZERO), pick(random, SMALL)], rightBinomial: [pick(random, NONZERO), pick(random, SMALL)] }),
  factorQuadratic: (random) => {
    const [p, q] = [int(random, -12, 12), int(random, -12, 12)];
    return { coefficients: [1, p + q, p * q] };
  },
  division: (random) => {
    const divisor = random() < 0.7 ? [pick(random, [1, 1, 2, -1]), pick(random, [-3, -2, -1, 1, 2, 3])] : polynomial(random, 2).map((v, i) => (i === 0 ? pick(random, [1, -1, 2]) : v));
    const dividend = polynomial(random, int(random, 1, 5));
    return { dividend, divisor };
  },
  graphConnection: (random) => {
    const count = int(random, 1, 4);
    const pool = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 1.5, -0.5];
    const roots = [];
    while (roots.length < count) {
      const root = pick(random, pool);
      if (!roots.some((entry) => entry.root === root)) roots.push({ root, multiplicity: int(random, 1, 4) });
    }
    const fields = { roots, leadingCoefficient: pick(random, [1, -1, 2, -2, 0.5, -3]) };
    if (random() < 0.5) fields.targetRoot = pick(random, roots).root;
    return fields;
  },
  rationalFeatures: (random) => {
    const pool = [-3, -2, -1, 0, 1, 2, 3, 4, 0.5];
    const numeratorRoots = Array.from({ length: int(random, 0, 3) }, () => pick(random, pool));
    const denominatorRoots = Array.from({ length: int(random, 1, 3) }, () => pick(random, pool));
    const fields = { numeratorRoots, denominatorRoots };
    if (random() < 0.7) fields.targetValue = pick(random, [...pool, 5]);
    return fields;
  },
};

// The builder's documented nulls that are honest here: a factorable quadratic
// is never null; a division whose quotient or remainder does not terminate in
// 6 decimal places (it cannot be typed exactly) may be.
const honestNull = (mode, question) => {
  if (mode === 'division') {
    const { quotient, remainder } = divideExact((question.dividend).map(F), (question.divisor).map(F));
    return [...quotient, ...remainder].some((value) => !Number.isInteger(value.valueOf() * 1e6) || value.toString().includes('('));
  }
  if (mode === 'factorZero') {
    // Every term P(r) adds is printed: each must terminate in 6 places too.
    const root = F(question.candidateRoot);
    return question.coefficients.some((c, index) => F(c).mul(root.pow(question.coefficients.length - 1 - index)).toString().includes('('));
  }
  return false;
};

for (const [mode, draw] of Object.entries(draws)) {
  test(`${mode}: 300 seeded draws — every relation recomputed, the answers are the exact key and graded correct`, () => {
    const random = prng(0x501 + mode.length * 4099);
    let built = 0;
    const unexplained = [];
    for (let index = 0; index < 300; index += 1) {
      const fields = draw(random);
      const label = `${mode} #${index} ${JSON.stringify(fields)}`;
      const { model, question } = auditOne(mode, fields, label);
      if (model) built += 1;
      else if (!honestNull(mode, question)) unexplained.push(label);
    }
    assert.ok(built >= 200, `${mode}: draws have a review (${built})`);
    assert.deepEqual(unexplained, [], `${mode}: every null review is honest`);
  });
}

/* -------------------------------------------------------------- edge cases */

const EDGES = [
  ['factorZero', {}, 'unauthored'],
  ['factorZero', { coefficients: [1, 0, 0, -8], candidateRoot: 2 }, 'missing powers, a factor'],
  ['factorZero', { coefficients: [2, -3], candidateRoot: 0 }, 'r = 0'],
  ['factorZero', { coefficients: [0.5, -0.25, 1], candidateRoot: -0.5 }, 'decimals'],
  ['multiplyArea', { leftBinomial: [1, 2], rightBinomial: [1, -2] }, 'the middle term cancels'],
  ['multiplyArea', { leftBinomial: [-1, 0], rightBinomial: [3, 5] }, 'a zero constant'],
  ['factorQuadratic', { coefficients: [1, -3, 0] }, 'c = 0'],
  ['factorQuadratic', { coefficients: [1, 6, 9] }, 'a perfect square'],
  ['factorQuadratic', { coefficients: [1, 1, 1] }, 'no integer pair: no review'],
  ['division', { dividend: [3, 2], divisor: [1, 0, 1] }, 'a dividend of lower degree'],
  ['division', { dividend: [1, 0, 0, -1], divisor: [1, -1] }, 'exact, missing powers'],
  ['division', { dividend: [1, 2, 3, 4, 5], divisor: [1, 0, -2] }, 'by a quadratic'],
  ['division', { dividend: [1, 1], divisor: [3, 1] }, 'a quotient 1/3 that cannot be typed exactly: no review'],
  ['graphConnection', { roots: [{ root: -1, multiplicity: 1 }], leadingCoefficient: 2 }, 'one simple zero after a leading 2'],
  ['graphConnection', { roots: [{ root: 3, multiplicity: 1 }], leadingCoefficient: -1 }, 'one simple zero after a leading −1'],
  ['graphConnection', { roots: [{ root: 0, multiplicity: 2 }], leadingCoefficient: -0.5 }, 'x² alone'],
  ['graphConnection', { roots: [{ root: 1, multiplicity: 3 }, { root: -2, multiplicity: 2 }], leadingCoefficient: 1, targetRoot: -2 }, 'an even target'],
  ['rationalFeatures', {}, 'unauthored'],
  ['rationalFeatures', { numeratorRoots: [1, 1, -2], denominatorRoots: [1, 3], targetValue: 1 }, 'a hole whose cancelled form is 0'],
  ['rationalFeatures', { numeratorRoots: [2], denominatorRoots: [2, 2], targetValue: 2 }, 'an asymptote after cancelling'],
  ['rationalFeatures', { numeratorRoots: [], denominatorRoots: [3], targetValue: 1 }, 'no numerator roots'],
  ['rationalFeatures', { numeratorRoots: [1, 0, 4], denominatorRoots: [1], targetValue: 5 }, 'f(5) = 20/4'],
  ['rationalFeatures', { numeratorRoots: [-1, 2], denominatorRoots: [4, -1, 0.5], targetValue: 5 }, 'f(5) = 18/27'],
];

test('edge cases: every relation recomputed; a null only where no answer is right or none can be typed exactly', () => {
  for (const [mode, fields, name] of EDGES) {
    const { model } = auditOne(mode, fields, `${mode} ${name}`);
    assert.equal(model === null, /no review/.test(name), `${mode} ${name}: ${model ? 'a review' : 'null'}`);
  }
});

const textOf = (mode, fields) => {
  const model = buildPolynomialWorkshopReview({ type: TOOL_ID, mode, ...fields });
  assert.ok(model, `${mode}: a review`);
  return [...model.steps, model.why].join('\n');
};

test('a lone factor after a leading coefficient keeps its parentheses, and f(x) at a plain point is finished', () => {
  // It read "P(x) = 2x + 1" for 2(x + 1).
  assert.match(textOf('graphConnection', { roots: [{ root: -1, multiplicity: 1 }], leadingCoefficient: 2 }), /\$P\(x\) = 2\(x \+ 1\)\$/);
  assert.match(textOf('graphConnection', { roots: [{ root: 3, multiplicity: 1 }], leadingCoefficient: -1 }), /\$P\(x\) = -\(x - 3\)\$/);
  // A factor already in parentheses, or the bare x, is unchanged.
  assert.match(textOf('graphConnection', { roots: [{ root: 0, multiplicity: 1 }], leadingCoefficient: 3 }), /\$P\(x\) = 3x\$/);
  assert.match(textOf('graphConnection', { roots: [{ root: 2, multiplicity: 2 }], leadingCoefficient: 3 }), /\$P\(x\) = 3\(x - 2\)\^\{2\}\$/);
  // "f(5) = 20/4" was left unfinished and unreduced.
  assert.match(textOf('rationalFeatures', { numeratorRoots: [1, 0, 4], denominatorRoots: [1], targetValue: 5 }), /\$f\(5\) = \\frac\{20\}\{4\} = 5\$/);
  assert.match(textOf('rationalFeatures', { numeratorRoots: [-1, 2], denominatorRoots: [4, -1, 0.5], targetValue: 5 }), /\$f\(5\) = \\frac\{18\}\{27\} = \\frac\{2\}\{3\}\$/);
  assert.match(textOf('rationalFeatures', { numeratorRoots: [3], denominatorRoots: [1, 2], targetValue: 4 }), /\$f\(4\) = \\frac\{1\}\{6\}\$/);
});
