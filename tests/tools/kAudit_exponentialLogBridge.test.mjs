import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildExponentialLogBridgeReview } from '../../src/tools/shared/reviews/exponentialLogBridgeReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE EXPONENTIAL ↔ LOG BRIDGE WORKED SOLUTION, RECOMPUTED
 * INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws per view
 * (plus the edge cases: negative and decimal exponents, decay bases,
 * reflections a < 0, fractional answers, irrational answers, results large and
 * small, a right side ≤ 0, a y outside the inverse's domain), every relation
 * the review writes — each "A = B ≈ C" chain, each equation in x (and y), each
 * inequality and point — is parsed back out of its TeX and recomputed with
 * mathjs, from the question's own numbers, never with the builder's or the
 * tool's helpers:
 *
 *   "="  holds to rounding error (so a rounded decimal is never written "=");
 *   "≈"  holds to the review's 4 places;
 *   an equation in x holds at the true solution (solve views), or is an
 *        identity / holds on the graph of f (inverse and composition views);
 *   "x = k", "y > k" name the true asymptote and side.
 *
 * Then the stated boxes are compared with the independent answer and graded by
 * the shared grader, and the text is checked for display hygiene. A null
 * review is checked to be honest: no real answer, or a number that cannot be
 * printed.
 */

const TOOL_ID = 'exponentialLogBridge';
const math = create(all);
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

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

// The review's TeX as a mathjs expression: \frac, powers, \log_{b}(…), \ln,
// \cdot, f and f⁻¹ (as the functions f and finv of the scope).
const convert = (text) => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('\\frac', index)) {
      const [top, afterTop] = readGroup(text, index + 5);
      const [bottom, afterBottom] = readGroup(text, afterTop);
      out += `((${convert(top)})/(${convert(bottom)}))`;
      index = afterBottom;
    } else if (text.startsWith('\\log_', index)) {
      const [base, after] = readGroup(text, index + 5);
      assert.equal(text[after], '(', `a logarithm's argument in "${text}"`);
      out += `logb((${convert(base)}), `;
      index = after + 1;
    } else if (text.startsWith('\\ln', index)) {
      out += 'log';
      index += 3;
    } else if (text[index] === '^') {
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
const texToMath = (tex) => convert(String(tex)
  .replace(/−/g, '-')
  .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
  .replace(/\\cdot/g, '*')
  .replace(/f\^\{-1\}/g, 'finv')
  .trim());

// Split a relation chain at its top-level relation signs.
const RELATIONS = [[' \\approx ', '≈'], [' = ', '='], [' > ', '>'], [' < ', '<']];
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
  return [...names].filter((name) => !['logb', 'f', 'finv', 'log', 'e', 'pi'].includes(name));
};

// A real number, or null (a complex value or no value is undefined here).
const real = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const evaluateIn = (expression, scope) => {
  try {
    return real(math.evaluate(expression, { ...scope }));
  } catch {
    return null;
  }
};

const EXACT = (value) => 1e-9 + 1e-13 * Math.abs(value);
const ROUNDED = (value) => 6e-4 * Math.max(1, Math.abs(value));
const holds = (op, left, right) => {
  if (op === '=') return Math.abs(left - right) <= EXACT(right);
  if (op === '≈') return Math.abs(left - right) <= ROUNDED(right);
  if (op === '>') return left > right;
  return left < right;
};

/* ------------------------------------------------------ the independent key */

const independentFunction = (question) => {
  const source = question.function || question.exponential || {
    a: question.a ?? 1, base: question.base ?? 2, h: question.h ?? 0, k: question.k ?? 0,
  };
  const spec = { a: Number(source.a ?? 1), base: Number(source.base ?? 2), h: Number(source.h ?? 0), k: Number(source.k ?? 0) };
  const f = (x) => spec.a * spec.base ** (x - spec.h) + spec.k;
  const finv = (y) => {
    const ratio = (y - spec.k) / spec.a;
    return ratio > 0 ? spec.h + Math.log(ratio) / Math.log(spec.base) : Number.NaN;
  };
  return { spec, f, finv };
};

const logb = (base, value) => (value > 0 && base > 0 && base !== 1 ? Math.log(value) / Math.log(base) : Number.NaN);

/* --------------------------------------------------------- display hygiene */

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertClean = (model, label) => {
  const texts = [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
  texts.forEach((raw) => {
    const text = String(raw).replace(/−/g, '-');
    assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object|\bnull\b/, `${label}: leaked value in "${raw}"`);
    assert.doesNotMatch(text, /[+-]\s*-\s*\d|--|\+\s*\+/, `${label}: a doubled sign in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.}])1[xy]\b|(^|[^\d.])1 \\cdot/, `${label}: a written-out 1 coefficient in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.])-0(?![\d.])/, `${label}: −0 in "${raw}"`);
    assert.doesNotMatch(text, /[+-] 0(?![\d.])/, `${label}: a zero term in "${raw}"`);
    // A rounded number keeps 4 places, or 4 significant figures below 0.1.
    for (const [, digits] of text.matchAll(/\\approx -?(\d+\.\d+)/g)) {
      const places = digits.split('.')[1].length;
      const significant = digits.replace('.', '').replace(/^0+/, '').length;
      assert.ok(places <= 4 || significant <= 4, `${label}: an unrounded decimal ${digits} in "${raw}"`);
    }
    // A fraction a relation ends on is in lowest terms (one being divided out
    // mid-chain, as in (y − k)/a, is a computation, not a result).
    const results = mathSegments(text).map((segment) => splitChain(segment).parts.at(-1));
    for (const [, n, d] of results.join('\n').matchAll(/^-?\\frac\{(\d+)\}\{(\d+)\}$/gm)) {
      assert.equal(gcd(Number(n), Number(d)), 1, `${label}: \\frac{${n}}{${d}} not in lowest terms in "${raw}"`);
      assert.notEqual(Number(d), 1, `${label}: \\frac{${n}}{1} in "${raw}"`);
    }
  });
};

/* ------------------------------------------------- every relation it writes */

/*
 * Check every $…$ segment of the review. `context` gives the scope an
 * equation in x / y is checked in:
 *   { solution }      solve views: x is the true solution;
 *   { fn, y0 }        inverse and composition: identities in x, equations on
 *                     the graph of f (y = f(x), or x = f(y) once swapped), and
 *                     "x|y op number" statements about the asymptote k.
 */
const SAMPLES = [-2.5, -1, -0.5, 0, 0.25, 0.5, 1, 1.5, 2, 3];
const auditRelations = (model, context, label) => {
  const scopeBase = { logb, ...(context.fn ? { f: context.fn.f, finv: context.fn.finv } : {}) };
  let checked = 0;
  const texts = [...model.steps, model.why, ...model.items.map((item) => item.value)];
  texts.forEach((text) => mathSegments(text).forEach((segment) => {
    // A point (p, q) on f or on f⁻¹.
    const point = segment.match(/^\(([^,]+), ([^,]+)\)$/);
    if (point && context.fn) {
      const [p, q] = point.slice(1).map((part) => evaluateIn(texToMath(part), scopeBase));
      assert.ok(p !== null && q !== null, `${label}: a point of numbers "${segment}"`);
      const onF = Math.abs(context.fn.f(p) - q) <= ROUNDED(q);
      const onInverse = Math.abs(context.fn.f(q) - p) <= ROUNDED(p);
      assert.ok(onF || onInverse, `${label}: (${p}, ${q}) is on f or f⁻¹ in "${text}"`);
      checked += 1;
      return;
    }
    // "a = −2": the question's vertical scale.
    const scale = segment.match(/^a = (-?[\d.]+)$/);
    if (scale && context.fn) {
      assert.equal(Number(scale[1]), context.fn.spec.a, `${label}: "${segment}" is the question's a`);
      checked += 1;
      return;
    }
    const { parts, ops } = splitChain(segment);
    if (ops.length === 0) return;
    const expressions = parts.map((part) => {
      try {
        return texToMath(part);
      } catch (error) {
        assert.fail(`${label}: cannot read "${part}" in "${segment}": ${error.message}`);
      }
    });
    const symbols = [...new Set(expressions.flatMap((expression) => {
      try {
        return freeSymbols(expression);
      } catch (error) {
        return assert.fail(`${label}: cannot parse "${expression}" (from "${segment}"): ${error.message}`);
      }
    }))];

    if (symbols.length === 0) {
      const values = expressions.map((expression) => evaluateIn(expression, scopeBase));
      values.forEach((value, index) => assert.ok(value !== null, `${label}: "${parts[index]}" has a value in "${segment}"`));
      ops.forEach((op, index) => assert.ok(holds(op, values[index], values[index + 1]),
        `${label}: ${parts[index]} ${op} ${parts[index + 1]} (${values[index]} vs ${values[index + 1]}) in "${text}"`));
      checked += 1;
      return;
    }
    assert.ok(symbols.every((name) => name === 'x' || name === 'y'), `${label}: only x and y are unknowns in "${segment}" (${symbols})`);

    if (context.solution !== undefined) {
      assert.deepEqual(symbols, ['x'], `${label}: a solve view writes equations in x: "${segment}"`);
      const values = expressions.map((expression) => evaluateIn(expression, { ...scopeBase, x: context.solution }));
      ops.forEach((op, index) => assert.ok(values[index] !== null && values[index + 1] !== null && holds(op, values[index], values[index + 1]),
        `${label}: ${parts[index]} ${op} ${parts[index + 1]} at x = ${context.solution} (${values[index]} vs ${values[index + 1]}) in "${text}"`));
      checked += 1;
      return;
    }

    // The mirror line of a reflection.
    if (segment === 'y = x') return;

    // "x = k", "y > k", "x < k": the asymptote and the side — or the composition's start y.
    const statement = segment.match(/^([xy]) (=|>|<) (-?[\d.]+|-?\\frac\{\d+\}\{\d+\})$/);
    if (statement) {
      const value = evaluateIn(texToMath(statement[3]), {});
      const { spec } = context.fn;
      if (statement[1] === 'y' && statement[2] === '=' && context.y0 !== undefined && Math.abs(value - context.y0) <= ROUNDED(context.y0)) {
        checked += 1;
        return;
      }
      assert.ok(Math.abs(value - spec.k) <= EXACT(spec.k), `${label}: "${segment}" names the asymptote ${spec.k}`);
      if (statement[2] !== '=') assert.equal(statement[2], spec.a > 0 ? '>' : '<', `${label}: "${segment}" is on the side of a's sign`);
      checked += 1;
      return;
    }

    // An identity in x, or an equation on the graph of f (either orientation).
    const pairings = symbols.includes('y')
      ? [(t) => ({ x: t, y: context.fn.f(t) }), (t) => ({ x: context.fn.f(t), y: t })]
      : [(t) => ({ x: t }), (t) => ({ x: context.fn.f(t) })];
    // An identity: true at inputs on both sides of k (the second pairing
    // reaches f⁻¹'s domain), so both are checked together.
    const ok = pairings.some((pairing) => {
      let defined = 0;
      const allHold = SAMPLES.every((t) => {
        const scope = { ...scopeBase, ...pairing(t) };
        if (![scope.x, scope.y ?? 0].every(Number.isFinite) || Math.abs(scope.y ?? 0) > 1e6 || Math.abs(scope.x) > 1e6) return true;
        const values = expressions.map((expression) => evaluateIn(expression, scope));
        if (values.some((value) => value === null)) return true;
        defined += 1;
        return ops.every((op, index) => holds(op === '≈' ? '≈' : op, values[index], values[index + 1]));
      });
      return allHold && defined >= 2;
    });
    assert.ok(ok, `${label}: "${segment}" holds as an identity or on the graph of f in "${text}"`);
    checked += 1;
  }));
  assert.ok(checked >= 3, `${label}: the audit read the review's relations (${checked})`);
};

/* --------------------------------------------------- reading the stated boxes */

const lastNumber = (value) => {
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*\$\s*$/);
  assert.ok(match, `a typed number ends "${value}"`);
  return match[1];
};

const WORK = {
  equivalentForms: { 'Logarithmic form': 'logAnswer', 'Exponential form': 'expAnswer' },
  solveExponential: { 'Exponent value': 'exponentAnswer', x: 'xAnswer' },
  solveLogarithmic: { 'Required argument value': 'argumentAnswer', x: 'xAnswer' },
};
const workOf = (mode, model) => {
  const work = {};
  model.items.forEach(({ label, value }) => {
    if (mode === 'inverse') {
      if (label === 'Inverse domain') work.domainSide = value.includes('>') ? 'greater' : 'less';
      else if (label === 'Inverse vertical asymptote') work.asymptote = lastNumber(value);
      else work.inverseAnswer = lastNumber(value);
    } else if (mode === 'composition') {
      work[label.startsWith('f⁻¹(f(') ? 'inverseAfterForward' : 'forwardAfterInverse'] = lastNumber(value);
    } else {
      work[WORK[mode][label]] = lastNumber(value);
    }
  });
  return work;
};

// The true value of each box, from the question alone.
const keyOf = (mode, question) => {
  const equation = question.equation || {};
  if (mode === 'equivalentForms') {
    const base = Number(question.base ?? 2);
    const exponent = Number(question.exponent ?? 3);
    return { logAnswer: exponent, expAnswer: base ** exponent };
  }
  if (mode === 'solveExponential') {
    const base = Number(equation.base ?? question.base ?? 2);
    const [m, c, rhs] = [Number(equation.m ?? 2), Number(equation.c ?? -1), Number(equation.rhs ?? 16)];
    const exponent = logb(base, rhs);
    return { exponentAnswer: exponent, xAnswer: (exponent - c) / m };
  }
  if (mode === 'solveLogarithmic') {
    const base = Number(equation.base ?? question.base ?? 3);
    const [m, c, result] = [Number(equation.m ?? 2), Number(equation.c ?? 1), Number(equation.result ?? 2)];
    const argument = base ** result;
    return { argumentAnswer: argument, xAnswer: (argument - c) / m };
  }
  const fn = independentFunction(question);
  if (mode === 'inverse') {
    return { inverseAnswer: Number(question.x ?? 2), asymptote: fn.spec.k, domainSide: fn.spec.a > 0 ? 'greater' : 'less' };
  }
  const x = Number(question.x ?? 1);
  const y = Number(question.y ?? fn.f(Number(question.inverseSeedX ?? x + 1)));
  return { inverseAfterForward: x, forwardAfterInverse: (y - fn.spec.k) / fn.spec.a > 0 ? y : Number.NaN, y };
};

const auditOne = (mode, fields, label) => {
  const question = { type: TOOL_ID, mode, ...fields };
  const model = buildExponentialLogBridgeReview(question);
  const key = keyOf(mode, question);
  if (!model) return { model, key, question };
  assertClean(model, label);
  const fn = mode === 'inverse' || mode === 'composition' ? independentFunction(question) : null;
  const context = fn ? { fn, y0: key.y } : (mode === 'equivalentForms' ? {} : { solution: key.xAnswer });
  auditRelations(model, context, label);

  // The boxes: the true values, to the 0.01 the grader allows (and the
  // review's own 4 places), and graded correct.
  const work = workOf(mode, model);
  Object.entries(work).forEach(([field, typed]) => {
    if (field === 'domainSide') assert.equal(typed, key.domainSide, `${label}: the domain side`);
    else assert.ok(Math.abs(Number(typed) - key[field]) <= 5.1e-5 * Math.max(1, Math.abs(key[field])), `${label}: ${field} ${typed} is ${key[field]}`);
  });
  const result = grade(question, work);
  assert.equal(result.isCorrect, true, `${label}: graded correct (${JSON.stringify(work)})`);
  return { model, key, question };
};

/* ------------------------------------------------------------------ draws */

const BASES = [2, 3, 4, 5, 10, 0.5, 0.25, 1.5, 2.5, 0.2, 6];
const NONZERO = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 0.5, -0.5, 1.5, 0.25];
const SMALL = [-6, -5, -3, -2, -1, 0, 1, 2, 3, 4, 7, 0.5, -1.5, 2.25];

const draws = {
  equivalentForms: (random) => ({ base: pick(random, BASES), exponent: pick(random, [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 0.5, -0.5, 1.5, 0.25, 2.5]) }),
  solveExponential: (random) => {
    const base = pick(random, BASES);
    const rhs = random() < 0.6 ? base ** int(random, -3, 5) : pick(random, [1, 7, 20, 0.3, 50, 1000, 2.5, 0.01]);
    return { equation: { base, m: pick(random, NONZERO), c: pick(random, SMALL), rhs } };
  },
  solveLogarithmic: (random) => ({ equation: { base: pick(random, BASES), m: pick(random, NONZERO), c: pick(random, SMALL), result: pick(random, [-3, -2, -1, 0, 1, 2, 3, 4, 0.5, -0.5, 1.5]) } }),
  inverse: (random) => ({
    function: { type: 'exponential', a: pick(random, [1, -1, 2, -2, 0.5, -0.5, 3, -3, 1.5]), base: pick(random, BASES), h: pick(random, [-3, -2, -1, 0, 1, 2, 3, 0.5]), k: pick(random, SMALL) },
    x: pick(random, [-3, -2, -1, 0, 1, 2, 3, 4, 0.5, -0.5, 1.5]),
  }),
  composition: (random) => {
    const fields = {
      function: { type: 'exponential', a: pick(random, [1, -1, 2, -2, 0.5, -0.5, 3, -3, 1.5]), base: pick(random, BASES), h: pick(random, [-3, -2, -1, 0, 1, 2, 3, 0.5]), k: pick(random, SMALL) },
      x: pick(random, [-3, -2, -1, 0, 1, 2, 3, 0.5, -0.5]),
    };
    const choice = random();
    if (choice < 0.5) fields.y = pick(random, [-20, -7, -3, -1, 0, 1, 2, 3, 5, 9, 13, 30, 0.5, -2.5]);
    else if (choice < 0.75) fields.inverseSeedX = pick(random, [-2, -1, 0, 1, 2, 3, 0.5]);
    return fields;
  },
};

// Why a review may honestly be null: no real answer, or a number too large or
// too small to print.
const honestNull = (mode, key, question) => {
  if (mode === 'inverse' || mode === 'composition') {
    // f(x₀) = a·b^(x₀ − h) + k with a power too small to print: the screen's
    // f(x₀) is the asymptote itself.
    const { spec } = independentFunction(question);
    const power = spec.base ** (Number(question.x ?? (mode === 'inverse' ? 2 : 1)) - spec.h);
    if (Math.abs(power) < 5e-5 || Math.abs(power) >= 1e12) return 'f(x) too small or large to print';
  }
  const values = Object.entries(key).filter(([field]) => field !== 'domainSide' && field !== 'y').map(([, value]) => value);
  if (values.some((value) => !Number.isFinite(value))) return 'no real answer';
  if (values.some((value) => Math.abs(value) >= 1e12)) return 'too large';
  if (values.some((value) => value !== 0 && Math.abs(value) < 5e-5)) return 'rounds to 0';
  return null;
};

for (const [mode, draw] of Object.entries(draws)) {
  test(`${mode}: 300 seeded draws — every relation recomputed, the boxes are the true answer and graded correct`, () => {
    const random = prng(0x6E0 + mode.length * 977);
    let built = 0;
    const unexplained = [];
    for (let index = 0; index < 300; index += 1) {
      const fields = draw(random);
      const label = `${mode} #${index} ${JSON.stringify(fields)}`;
      const { model, key, question } = auditOne(mode, fields, label);
      if (model) built += 1;
      else if (!honestNull(mode, key, question)) unexplained.push(label);
    }
    assert.ok(built >= 150, `${mode}: most draws have a review (${built})`);
    assert.deepEqual(unexplained, [], `${mode}: every null review is honest`);
  });
}

/* -------------------------------------------------------------- edge cases */

const EDGES = [
  // equivalentForms
  ['equivalentForms', {}, 'unauthored 2³'],
  ['equivalentForms', { base: 7, exponent: 0 }, 'exponent 0'],
  ['equivalentForms', { base: 6, exponent: -3 }, '1/216: an exact reciprocal past 1/64'],
  ['equivalentForms', { base: 0.2, exponent: 5 }, '0.00032 = 1/3125'],
  ['equivalentForms', { base: 10, exponent: -2.5 }, 'a small irrational result'],
  ['equivalentForms', { base: 10, exponent: 5.5 }, 'a large irrational result'],
  ['equivalentForms', { base: 1.5, exponent: -4 }, '16/81'],
  ['equivalentForms', { base: 2, exponent: 20.3 }, 'a large irrational result within rounding error of 82620703/64'],
  ['equivalentForms', { base: 10, exponent: 7.5 }, 'an irrational result past 10⁶'],
  ['equivalentForms', { base: 3, exponent: 15.5 }, 'an irrational result past 10⁷'],
  ['equivalentForms', { base: 10, exponent: 7 }, 'a whole number past 10⁶'],
  ['equivalentForms', { base: 2, exponent: 27.25 }, 'an irrational result within 16 ulps of a 4-place decimal'],
  ['equivalentForms', { base: 10, exponent: -12 }, 'a power too small to print'],
  ['equivalentForms', { base: 0.5, exponent: 40 }, 'a decay power too small to print'],
  ['equivalentForms', { base: 2, exponent: -39.8 }, 'an irrational power too small to print'],
  // solveExponential
  ['solveExponential', {}, 'unauthored 2^(2x − 1) = 16'],
  ['solveExponential', { equation: { base: 10, m: 1, c: 3, rhs: 1000 } }, 'x = log₁₀(1000) − 3 cancels to 0'],
  ['solveExponential', { equation: { base: 2, m: 1, c: 0, rhs: 1 } }, 'x = 0'],
  ['solveExponential', { equation: { base: 0.5, m: -1, c: 0, rhs: 8 } }, 'decay base, −x'],
  ['solveExponential', { equation: { base: 3, m: 2, c: 0, rhs: Math.sqrt(3) } }, 'irrational right side'],
  ['solveExponential', { equation: { base: 2, m: 1, c: 0, rhs: -8 } }, 'no real solution'],
  ['solveExponential', { equation: { base: 2, m: 1, c: 0, rhs: 0 } }, 'right side 0'],
  // solveLogarithmic
  ['solveLogarithmic', {}, 'unauthored log₃(2x + 1) = 2'],
  ['solveLogarithmic', { equation: { base: 2, m: 3, c: 0, result: 24.5 } }, 'an irrational argument past 10⁷'],
  ['solveLogarithmic', { equation: { base: 10, m: 1, c: 0, result: -12 } }, 'an argument too small to print'],
  ['solveLogarithmic', { equation: { base: 10, m: 1, c: -1, result: 0 } }, 'result 0: argument 1'],
  ['solveLogarithmic', { equation: { base: 2, m: -1, c: 0, result: -2 } }, 'negative result, −x'],
  ['solveLogarithmic', { equation: { base: 0.5, m: 3, c: 2, result: 2 } }, 'decay base'],
  // inverse
  ['inverse', {}, 'unauthored 2^x at 2'],
  ['inverse', { function: { type: 'exponential', a: 1, base: 10, h: 0, k: 0 }, x: -12 }, 'f(x₀) too small to print'],
  ['inverse', { function: { type: 'exponential', a: 3, base: 10, h: 2, k: 4 }, x: -0.5 }, 'f(x₀) near the asymptote'],
  ['inverse', { function: { type: 'exponential', a: -1, base: 0.5, h: 0, k: 0 }, x: 0 }, 'reflected decay, x₀ = 0'],
  ['inverse', { a: 2, base: 3, h: -1, k: -2, x: 1 }, 'flat fields'],
  // composition
  ['composition', {}, 'unauthored'],
  ['composition', { function: { type: 'exponential', a: 1000, base: 10, h: 0, k: 0 }, x: 4.5 }, 'f(x₀) past 10⁷'],
  ['composition', { function: { type: 'exponential', a: 1.5, base: 2, h: 3, k: 1 }, x: -2 }, 'a rounded screen y and a rounded ratio'],
  ['composition', { function: { type: 'exponential', a: -1, base: 6, h: 2, k: -5 }, x: -0.5 }, 'f(x₀) near the asymptote'],
  ['composition', { function: { type: 'exponential', a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 2 }, 'y outside the domain'],
  ['composition', { function: { type: 'exponential', a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 3 }, 'y on the asymptote'],
];

test('edge cases: every relation recomputed, and a null only when no answer exists or none can be printed', () => {
  for (const [mode, fields, name] of EDGES) {
    const label = `${mode} ${name}`;
    const { model, key, question } = auditOne(mode, fields, label);
    if (!model) assert.ok(honestNull(mode, key, question), `${label}: an honest null`);
  }
  // The ones no answer exists for are null.
  ['no real solution', 'right side 0', 'y outside the domain', 'y on the asymptote'].forEach((name) => {
    const [mode, fields] = EDGES.find((edge) => edge[2] === name);
    assert.equal(buildExponentialLogBridgeReview({ type: TOOL_ID, mode, ...fields }), null, name);
  });
});

const reviewText = (mode, fields) => {
  const model = buildExponentialLogBridgeReview({ type: TOOL_ID, mode, ...fields });
  assert.ok(model, `${mode} ${JSON.stringify(fields)}: a review`);
  return { model, text: [...model.steps, model.why, ...model.items.map((item) => item.value)].join('\n') };
};

test('a rounded number is never written "=", and a logarithm is never taken of a number rounded past its exponent', () => {
  // 10^5.5 = 316227.766016…: 4 places is a rounding, so "≈" (it read "=").
  const large = reviewText('equivalentForms', { base: 10, exponent: 5.5 });
  assert.match(large.text, /10\^\{5\.5\} \\approx 316227\.766/);
  assert.doesNotMatch(large.text, /= 316227\.766/);
  // 2^20.3 = 1290948.48436…, within 1e-11 of 82620703/64: a decimal, not that fraction.
  const nearFraction = reviewText('equivalentForms', { base: 2, exponent: 20.3 });
  assert.match(nearFraction.model.items[1].value, /^\$2\^\{20\.3\} \\approx 1290948\.4844\$$/);

  // 6⁻³ = 1/216 exactly, so log₆(1/216) = −3 (it read log₆(0.0046) ≈ −3, which is −3.0036).
  const reciprocal = reviewText('equivalentForms', { base: 6, exponent: -3 });
  assert.match(reciprocal.model.items[0].value, /\\log_\{6\}\\left\(\\frac\{1\}\{216\}\\right\) = -3/);

  // 10^−2.5 to 4 significant figures, so its logarithm is still −2.5 to 4 places
  // (log₁₀(0.0032) is −2.49).
  const small = reviewText('equivalentForms', { base: 10, exponent: -2.5 });
  assert.match(small.model.items[0].value, /\\log_\{10\}\\left\(0\.003162\\right\) \\approx -2\.5/);

  // The composition's ratio (1.0938 − 1)/1.5 = 0.06253… is kept exact: it read
  // "log₂(0.0625) + 3 ≈ −3.9992 + 3", and log₂(0.0625) is −4.
  const composition = reviewText('composition', { function: { type: 'exponential', a: 1.5, base: 2, h: 3, k: 1 }, x: -2 });
  assert.doesNotMatch(composition.text, /\\log_\{2\}\\left\(0\.0625\\right\)/);
  assert.match(composition.text, /\\log_\{2\}\\left\(\\frac\{1\.0938 - 1\}\{1\.5\}\\right\) \+ 3 \\approx -3\.9992 \+ 3 \\approx -0\.9992/);
  assert.match(composition.text, /1\.5 \\cdot \\left\(\\frac\{1\.0938 - 1\}\{1\.5\}\\right\) \+ 1 = 1\.0938/);

  // f(−0.5) = 4.00949… rounds to 4.0095, and f⁻¹(4.0095) is −0.4994, not −0.5:
  // the steps undo f(−0.5) itself.
  const inverse = reviewText('inverse', { function: { type: 'exponential', a: 3, base: 10, h: 2, k: 4 }, x: -0.5 });
  assert.doesNotMatch(inverse.text, /f\^\{-1\}\(4\.0095\)|f\^\{-1\}\\left\(4\.0095\\right\)/);
  assert.match(inverse.text, /f\^\{-1\}\(f\(-0\.5\)\) = -0\.5/);
  assert.match(inverse.text, /f\^\{-1\}\\left\(f\(-0\.5\)\\right\) = \\log_\{10\}\\left\(\\frac\{f\(-0\.5\) - 4\}\{3\}\\right\) \+ 2 = \\log_\{10\}\\left\(10\^\{-2\.5\}\\right\) \+ 2 = -2\.5 \+ 2 = -0\.5/);
  // The box is still the one the screen labels, and the grader marks −0.5 right.
  assert.equal(inverse.model.items[0].label, 'f⁻¹(4.0095)');
});

// Past 10⁶ a 4-place decimal is within a few ulps of many irrational values,
// and below 5e-5 a power's 4 places are 0: neither is ever "=".
test('a power past 10⁶ or below 4 places: never "=" a rounding, never log(0)', () => {
  const large = reviewText('equivalentForms', { base: 10, exponent: 7.5 });
  assert.match(large.model.items[1].value, /^\$10\^\{7\.5\} \\approx 31622776\.6017\$$/);
  const argument = reviewText('solveLogarithmic', { equation: { base: 2, m: 3, c: 0, result: 24.5 } });
  assert.doesNotMatch(argument.text, /= 23726566\.4061|x = 7908855/);
  const composition = reviewText('composition', { function: { type: 'exponential', a: 1000, base: 10, h: 0, k: 0 }, x: 4.5 });
  assert.doesNotMatch(composition.text, /= 31622776\.6017|\\left\(31622776\.6017\\right\) =/);
  // 2^27.25 = 159612677.0970999…: its 4 places are within 16 ulps, so past
  // 10⁶ only a whole number counts as exact.
  assert.match(reviewText('equivalentForms', { base: 2, exponent: 27.25 }).model.items[1].value, /\\approx 159612677\.0971\$$/);
  // The screen's y = 316227766.0168 is 10^8.5 rounded, so its logarithm is
  // 5.5 only to rounding (5.5 + 5e-14): "≈".
  assert.match(composition.text, /\\log_\{10\}\\left\(\\frac\{316227766\.0168\}\{1000\}\\right\) \\approx 5\.5/);
  // 10⁷ is a whole number: still "=".
  assert.match(reviewText('equivalentForms', { base: 10, exponent: 7 }).model.items[1].value, /= 10000000\$$/);
  // log₁₀(1000) − 3 cancels to rounding error: still x = 0.
  assert.match(reviewText('solveExponential', { equation: { base: 10, m: 1, c: 3, rhs: 1000 } }).model.items[1].value, /^\$x = 0\$$/);

  // 10⁻¹² is not 0: no log₁₀(0), no (−12, 0) on the graph.
  [
    ['equivalentForms', { base: 10, exponent: -12 }],
    ['equivalentForms', { base: 0.5, exponent: 40 }],
    ['equivalentForms', { base: 2, exponent: -39.8 }],
    ['solveLogarithmic', { equation: { base: 10, m: 1, c: 0, result: -12 } }],
    ['inverse', { function: { type: 'exponential', a: 1, base: 10, h: 0, k: 0 }, x: -12 }],
  ].forEach(([mode, fields]) => assert.equal(buildExponentialLogBridgeReview({ type: TOOL_ID, mode, ...fields }), null, `${mode} ${JSON.stringify(fields)}`));

  // A sweep of non-integer exponents to ±40: every relation recomputed, and
  // "=" never written for a number its exponent leaves irrational.
  const sweep = [];
  [2, 3, 5, 7, 10, 1.5, 0.5, 0.2].forEach((base) => {
    for (let exponent = -40; exponent <= 40; exponent += 0.25) sweep.push(['equivalentForms', { base, exponent }]);
    for (let result = -40; result <= 40; result += 1.5) sweep.push(['solveLogarithmic', { equation: { base, m: 3, c: 0, result } }]);
  });
  let built = 0;
  for (const [mode, fields] of sweep) {
    const label = `sweep ${mode} ${JSON.stringify(fields)}`;
    const { model, key, question } = auditOne(mode, fields, label);
    if (!model) {
      assert.ok(honestNull(mode, key, question), `${label}: an honest null`);
      continue;
    }
    built += 1;
    const power = mode === 'equivalentForms' ? key.expAnswer : key.argumentAnswer;
    const tex = model.items[mode === 'equivalentForms' ? 1 : 0].value;
    const printed = Number(tex.match(/(-?[0-9.]+)\$$/)[1]);
    if (/ = /.test(tex) && !/frac/.test(tex)) assert.ok(Math.abs(printed - power) <= 1e-13 * Math.abs(power), `${label}: "=" only for the value itself (${printed} vs ${power})`);
    assert.doesNotMatch(tex, /\\left\(0\\right\)|= 0\$$/, `${label}: never 0`);
  }
  assert.ok(built >= 500, `the sweep builds reviews (${built})`);
});
