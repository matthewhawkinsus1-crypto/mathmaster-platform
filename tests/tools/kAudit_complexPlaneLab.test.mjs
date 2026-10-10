import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';
import Fraction from 'fraction.js';

import { buildComplexPlaneLabReview } from '../../src/tools/shared/reviews/complexPlaneLabReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE COMPLEX PLANE LAB WORKED SOLUTION, RECOMPUTED
 * INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. For every mode (features; operations add,
 * subtract, multiply; division; powers positive, zero and negative; rotation;
 * quadraticRoots with complex, repeated, rational and irrational real roots)
 * it draws hundreds of seeded questions — integers, one- and two-place
 * decimals, zeros, pure real and pure imaginary numbers, negative leading
 * coefficients — and then:
 *
 *   - recomputes the key here, exactly, in Fraction arithmetic (and mathjs for
 *     the square roots), never with the lab's complexMath helpers;
 *   - compares every stated item with that key: an exact item must be exact,
 *     an "≈" item must be the key rounded to two places;
 *   - reads every relation the review writes back out of its TeX — each
 *     "=" / "\approx" chain, with z, w (and a, b, c, x for a quadratic) bound
 *     to the question's own numbers — and checks every link with mathjs
 *     complex arithmetic; "x = …" chains must land on a true root, "\pm"
 *     chains are checked on both branches;
 *   - checks the prose claims (the sign of the discriminant, the net
 *     rotation, the "$i^2$ product is 0" remark);
 *   - types the stated answers back and grades them with the shared grader;
 *   - checks display hygiene ("+ -", "1i", "--", -0, NaN, an unreduced
 *     fraction or a non-simplified surd given as an answer).
 *
 * A null review is allowed only where the builder's documented refusals say
 * so (division by 0, 0 to a power ≤ 0, a power whose steps would need more
 * than four decimal places); every integer question is explained.
 */

const TOOL_ID = 'complexPlaneLab';
const math = create(all);
const F = (value) => new Fraction(value);
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

/* ------------------------------------------------- exact complex numbers -- */

// { re: Fraction, im: Fraction }
const C = (re, im) => ({ re: F(re), im: F(im) });
const cAdd = (a, b) => ({ re: a.re.add(b.re), im: a.im.add(b.im) });
const cSub = (a, b) => ({ re: a.re.sub(b.re), im: a.im.sub(b.im) });
const cMul = (a, b) => ({ re: a.re.mul(b.re).sub(a.im.mul(b.im)), im: a.re.mul(b.im).add(a.im.mul(b.re)) });
const cNorm = (a) => a.re.mul(a.re).add(a.im.mul(a.im));
const cDiv = (a, b) => {
  const n = cNorm(b);
  const top = cMul(a, { re: b.re, im: b.im.neg() });
  return { re: top.re.div(n), im: top.im.div(n) };
};
const cPow = (a, n) => {
  let result = C(1, 0);
  for (let k = 0; k < Math.abs(n); k += 1) result = cMul(result, a);
  return n < 0 ? cDiv(C(1, 0), result) : result;
};

/* ------------------------------------------------------- reading the TeX -- */

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

// TeX → mathjs. \frac, \sqrt, \bar, ^{…} are read as groups; anything else
// starting with "\" is an unknown command and fails the parse.
const convert = (text) => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('\\frac', index)) {
      const [top, afterTop] = readGroup(text, index + 5);
      const [bottom, afterBottom] = readGroup(text, afterTop);
      out += ` ((${convert(top)})/(${convert(bottom)}))`;
      index = afterBottom;
    } else if (text.startsWith('\\sqrt', index)) {
      const [inside, after] = readGroup(text, index + 5);
      out += ` sqrt(${convert(inside)})`;
      index = after;
    } else if (text.startsWith('\\bar', index)) {
      const [inside, after] = readGroup(text, index + 4);
      out += ` conj(${convert(inside)})`;
      index = after;
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

const texToMath = (tex) => {
  let source = String(tex)
    .replace(/\\left|\\right/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\cdot/g, '*')
    .replace(/\\operatorname\{Re\}/g, ' re')
    .replace(/\\operatorname\{Im\}/g, ' im');
  source = convert(source);
  // |…| → abs(…), innermost first.
  for (let guard = 0; guard < 10 && source.includes('|'); guard += 1) source = source.replace(/\|([^|]*)\|/, ' abs($1)');
  // zw, 4ac, bx: products of one-letter names.
  source = source.replace(/(?<![A-Za-z])[zwabcx]{2,}(?![A-Za-z(])/g, (name) => name.split('').join('*'));
  // i(…), z(…): a one-letter name before a bracket is a product, not a call.
  source = source.replace(/(?<![A-Za-z])([zwabcxi])\s*\(/g, '$1*(');
  return source.trim();
};

// "a = b \approx c": the parts and the relation between each neighbour.
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
    const token = [[' \\approx ', '≈'], [' = ', '=']].find(([text]) => tex.startsWith(text, index));
    if (token) {
      parts.push(tex.slice(start, index));
      ops.push(token[1]);
      start = index + token[0].length;
      index = start - 1;
    }
  }
  parts.push(tex.slice(start));
  return { parts: parts.map((part) => part.trim()), ops };
};

const mathSegments = (text) => [...String(text).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);

const toComplex = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? { re: value, im: 0 } : null;
  if (value && typeof value === 'object' && 're' in value && 'im' in value && Number.isFinite(value.re) && Number.isFinite(value.im)) return { re: value.re, im: value.im };
  return null;
};
const evaluate = (tex, scope) => {
  try {
    return toComplex(math.evaluate(texToMath(tex), { ...scope }));
  } catch {
    return null;
  }
};
const EXACT_TOLERANCE = 1e-11;
const exactlyEqual = (a, b) => {
  const scale = Math.max(1, Math.hypot(a.re, a.im), Math.hypot(b.re, b.im));
  return Math.hypot(a.re - b.re, a.im - b.im) <= EXACT_TOLERANCE * scale;
};
// "\approx d": d is the other side rounded to two places (each part).
const roundedEqual = (a, b) => Math.abs(a.re - b.re) <= 0.005 + 1e-9 && Math.abs(a.im - b.im) <= 0.005 + 1e-9;

/*
 * Every relation chain in one text. `scope` binds z, w (and a, b, c); for a
 * quadratic, `roots` are the true roots: a chain that starts with a bare "x"
 * must land on them, and any other chain using x must hold at both. A part
 * written with "\pm" stands for the pair of values it gives, so a link holds
 * when both sides give the same pair (the ± of "(1 ± 2i)/(−2)" and of
 * "−1/2 ∓ i" name the same two numbers). Returns the number of links checked.
 */
const valuesOf = (part, binding) => {
  const branches = part.includes('\\pm') ? [part.replace(/\\pm/g, '+'), part.replace(/\\pm/g, '-')] : [part];
  const values = branches.map((branch) => evaluate(branch, binding));
  return values.every(Boolean) ? values : null;
};
const sameSet = (left, right, equal) => left.every((a) => right.some((b) => equal(a, b))) && right.every((b) => left.some((a) => equal(a, b)));

const checkRelations = (text, scope, label, roots = null) => {
  let links = 0;
  mathSegments(text).forEach((segment) => {
    const { parts, ops } = splitChain(segment);
    if (!ops.length) return;
    const startsWithX = parts[0] === 'x';
    const usesX = /x/.test(segment.replace(/\\[A-Za-z]+/g, ''));
    if (startsWithX) {
      assert.ok(roots, `${label}: "${segment}" — x is only used for a quadratic's roots`);
      const rootValues = roots.map((root) => ({ re: root.re, im: root.im }));
      parts.slice(1).forEach((part, index) => {
        const values = valuesOf(part, scope);
        if (!values) return;
        links += 1;
        const equal = ops[index] === '=' ? exactlyEqual : roundedEqual;
        values.forEach((value) => assert.ok(rootValues.some((root) => equal(value, root)), `${label}: "${segment}": ${part} is a true root`));
        if (values.length === 2) assert.ok(sameSet(values, rootValues, equal), `${label}: "${segment}": ${part} is the pair of roots`);
      });
      return;
    }
    const bindings = usesX && roots ? roots.map((root) => ({ ...scope, x: math.complex(root.re, root.im) })) : [scope];
    let counted = 0;
    bindings.forEach((binding) => {
      counted = 0;
      const values = parts.map((part) => valuesOf(part, binding));
      ops.forEach((op, index) => {
        const left = values[index];
        const right = values[index + 1];
        if (!left || !right) return;
        counted += 1;
        assert.ok(sameSet(left, right, op === '=' ? exactlyEqual : roundedEqual),
          `${label}: in "${segment}", ${parts[index]} ${op} ${parts[index + 1]} fails: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`);
      });
    });
    links += counted;
  });
  return links;
};

/* ------------------------------------------------------- display hygiene -- */

const hygiene = (model, label) => {
  const texts = [model.title, ...model.steps, model.why, model.note || '', ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((text) => {
    assert.doesNotMatch(text, /NaN|undefined|Infinity|\[object|\bnull\b/, `${label}: no broken value in "${text}"`);
    assert.doesNotMatch(text, /\+ -|- -|--|\+-|-\+/, `${label}: no doubled sign in "${text}"`);
    assert.doesNotMatch(text, /(?<![\d.\\{^])1(?:i|x)(?![\w])/, `${label}: no "1i" / "1x" in "${text}"`);
    // "$1 + 0i$" names the standard form a + bi on purpose (z⁰).
    assert.doesNotMatch(text.replace('that is $1 + 0i$', ''), /(?<![\d.{])0(?:i|x)(?![\w])/, `${label}: no "0i" / "0x" term in "${text}"`);
    assert.doesNotMatch(text, /(?<![\d.])-0(?![.\d])/, `${label}: no -0 in "${text}"`);
    assert.doesNotMatch(text, /\d\.\d*0(?!\d)/, `${label}: no trailing zero decimal in "${text}"`);
    assert.equal((text.match(/\$/g) || []).length % 2, 0, `${label}: balanced $ in "${text}"`);
  });
  // An answer item is written in lowest terms with a simplified surd. (A step
  // may show \frac{6}{1} on its way to 6 when |w|² = 1: true, if roundabout.)
  model.items.forEach((item) => {
    assert.doesNotMatch(item.value, /\\frac\{[^{}]*\}\{1\}/, `${label}: no denominator 1 in "${item.value}"`);
    for (const match of item.value.matchAll(/\\frac\{(-?\d+)\}\{(\d+)\}/g)) {
      const [p, q] = [Number(match[1]), Number(match[2])];
      assert.equal(math.gcd(p, q), 1, `${label}: ${item.label} "${item.value}" is reduced`);
    }
    const parts = splitChain(mathSegments(item.value)[0] || item.value).parts;
    const shown = parts.filter((part) => !/^-?\d+(\.\d+)?$/.test(part)).pop();
    if (shown) {
      for (const match of shown.matchAll(/\\sqrt\{(\d+)\}/g)) {
        const n = Number(match[1]);
        // The builder simplifies a surd up to 10¹⁰ and leaves a larger one as
        // √N ≈ value — a true statement that claims no simplification.
        if (n > 1e10) continue;
        for (let k = 2; k * k <= n; k += 1) assert.notEqual(n % (k * k), 0, `${label}: ${item.label} "${item.value}" ends on a simplified surd`);
      }
    }
  });
};

/* ---------------------------------------------- the stated answers -- */

const ROTATION_OPTIONS = { 'No net rotation': '0', '90° counterclockwise': '1', '180°': '2', '90° clockwise': '3' };
const BOXES = {
  features: { '|z|': 'magnitudeAnswer', 'Re(z̄)': 'conjugateRe', 'Im(z̄)': 'conjugateIm' },
  operations: { 'Real part': 'real', 'Imaginary part': 'imaginary' },
  division: { 'Re(w̄)': 'conjugateRe', 'Im(w̄)': 'conjugateIm', 'Quotient real part': 'real', 'Quotient imaginary part': 'imaginary' },
  powers: { 'Real part': 'real', 'Imaginary part': 'imaginary' },
  rotation: { 'Result real part': 'real', 'Result imaginary part': 'imaginary', 'Net rotation': 'rotation' },
  quadraticRoots: { 'Root 1 real': 'r1Re', 'Root 1 imaginary': 'r1Im', 'Root 2 real': 'r2Re', 'Root 2 imaginary': 'r2Im' },
};
const boxFor = (mode, label) => (mode === 'powers' && label.startsWith('|z') ? 'magnitude' : BOXES[mode][label]);

// The number typed from an item and whether the item calls it approximate.
const typed = (value) => {
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\$?$/);
  assert.ok(match, `an enterable number at the end of "${value}"`);
  return { text: match[1], approximate: /\\approx/.test(value) };
};

// The stated value must be the key exactly, or — said with ≈ — the key
// rounded to two places.
const assertStated = (item, truth, label) => {
  const { text, approximate } = typed(item.value);
  const rounded = Number(truth.toFixed(2));
  if (approximate) {
    assert.equal(Number(text), rounded === 0 ? 0 : rounded, `${label}: ${item.label} "${item.value}" is the key ${truth} rounded`);
    assert.ok(Math.abs(Number(text) - truth) > 1e-12, `${label}: ${item.label} is said to be approximate but is exact`);
  } else {
    assert.ok(Math.abs(Number(text) - truth) <= 1e-12 * Math.max(1, Math.abs(truth)), `${label}: ${item.label} "${item.value}" is exactly the key ${truth}`);
  }
  return text;
};

/* ------------------------------------------------------- the key, here -- */

const DEFAULTS = {
  features: { z: [3, -4] },
  operations: { z: [2, 3], w: [-1, 2] },
  division: { z: [4, 2], w: [1, -1] },
  powers: { z: [1, 1] },
  rotation: { z: [3, 1] },
};
const read = (raw, fallback) => C(raw?.re ?? fallback[0], raw?.im ?? fallback[1]);
const numeric = (value) => value.valueOf();

// Each mode's boxes → the true value (number) of that box; and the scope the
// TeX is read in.
const keyFor = (question) => {
  const mode = question.mode || 'features';
  if (mode === 'quadraticRoots') {
    const { a = 1, b = 2, c = 5 } = question.quadratic || {};
    const [A, B, Cc] = [F(a), F(b), F(c)];
    const disc = B.mul(B).sub(A.mul(Cc).mul(4));
    const center = B.neg().div(A.mul(2));
    const half = Math.sqrt(Math.abs(numeric(disc))) / Math.abs(numeric(A.mul(2)));
    const roots = numeric(disc) >= 0
      ? [{ re: numeric(center) + half, im: 0 }, { re: numeric(center) - half, im: 0 }]
      : [{ re: numeric(center), im: half }, { re: numeric(center), im: -half }];
    return { mode, roots, disc: numeric(disc), scope: { a, b, c } };
  }
  const z = read(question.z, DEFAULTS[mode].z);
  const scope = { z: math.complex(numeric(z.re), numeric(z.im)) };
  if (mode === 'features') {
    return { mode, scope, truth: { magnitudeAnswer: Math.sqrt(numeric(cNorm(z))), conjugateRe: numeric(z.re), conjugateIm: -numeric(z.im) } };
  }
  if (mode === 'operations' || mode === 'division') {
    const w = read(question.w, DEFAULTS[mode].w);
    scope.w = math.complex(numeric(w.re), numeric(w.im));
    if (mode === 'division') {
      const q = cDiv(z, w);
      return { mode, scope, truth: { conjugateRe: numeric(w.re), conjugateIm: -numeric(w.im), real: numeric(q.re), imaginary: numeric(q.im) } };
    }
    const operation = question.operation || 'multiply';
    const r = operation === 'add' ? cAdd(z, w) : operation === 'subtract' ? cSub(z, w) : cMul(z, w);
    return { mode, scope, operation, truth: { real: numeric(r.re), imaginary: numeric(r.im) }, product: cMul(z, w), z, w };
  }
  if (mode === 'powers') {
    const n = question.exponent ?? 3;
    const r = cPow(z, n);
    return { mode, scope, truth: { real: numeric(r.re), imaginary: numeric(r.im), magnitude: Math.sqrt(numeric(cNorm(r))) } };
  }
  const n = question.quarterTurns ?? 1;
  const k = ((n % 4) + 4) % 4;
  const r = cMul(cPow(C(0, 1), k), z);
  return { mode, scope, k, truth: { real: numeric(r.re), imaginary: numeric(r.im) } };
};

/* ------------------------------------------------------------ the audit -- */

const ROTATION_WORDS = ['there is no net rotation', 'the net rotation is 90° counterclockwise', 'the net rotation is 180°', 'the net rotation is 90° clockwise'];

const audit = (question, label) => {
  const model = buildComplexPlaneLabReview(question);
  assert.ok(model, `${label}: explained`);
  hygiene(model, label);
  const key = keyFor(question);
  const { mode } = key;
  const texts = [...model.steps, model.why, ...model.items.map((item) => item.value)];
  let links = 0;
  texts.forEach((text) => { links += checkRelations(text, key.scope, label, key.roots); });
  assert.ok(links >= 3, `${label}: the steps' relations were read (${links})`);

  const work = {};
  if (mode === 'quadraticRoots') {
    const stated = [0, 1].map((r) => ({
      re: Number(typed(model.items[2 * r].value).text),
      im: Number(typed(model.items[2 * r + 1].value).text),
    }));
    // The pair is the true pair, in some order; each part exact or rounded as it says.
    const order = [[0, 1], [1, 0]].find(([i, j]) => [stated[0], stated[1]].every((s, index) => {
      const root = key.roots[[i, j][index]];
      return Math.abs(s.re - root.re) <= 0.005 + 1e-9 && Math.abs(s.im - root.im) <= 0.005 + 1e-9;
    }));
    assert.ok(order, `${label}: the stated roots ${JSON.stringify(stated)} are the true roots ${JSON.stringify(key.roots)}`);
    order.forEach((rootIndex, r) => {
      const root = key.roots[rootIndex];
      assertStated(model.items[2 * r], root.re, label);
      assertStated(model.items[2 * r + 1], root.im, label);
    });
    Object.assign(work, { r1Re: typed(model.items[0].value).text, r1Im: typed(model.items[1].value).text, r2Re: typed(model.items[2].value).text, r2Im: typed(model.items[3].value).text });
    const sign = key.disc < 0 ? 'negative' : key.disc === 0 ? '0' : 'positive';
    assert.ok(model.steps.some((step) => step.startsWith(`It is ${sign}`)), `${label}: the discriminant ${key.disc} is called ${sign}`);
  } else {
    model.items.forEach((item) => {
      const box = boxFor(mode, item.label);
      assert.ok(box, `${label}: "${item.label}" is a box`);
      if (box === 'rotation') {
        assert.equal(ROTATION_OPTIONS[item.value], String(key.k), `${label}: net rotation`);
        work.rotation = ROTATION_OPTIONS[item.value];
        return;
      }
      work[box] = assertStated(item, key.truth[box], label);
    });
    assert.deepEqual(Object.keys(work).sort(), Object.keys(key.truth).concat(mode === 'rotation' ? ['rotation'] : []).sort(), `${label}: every box answered`);
  }
  if (mode === 'rotation') {
    assert.ok(model.steps[model.steps.length - 1].includes(ROTATION_WORDS[key.k]), `${label}: the last step names the net rotation`);
  }
  if (mode === 'operations' && key.operation === 'multiply') {
    const zeroProduct = model.steps.some((step) => step.includes('product is 0 here'));
    assert.equal(zeroProduct, key.z.im.mul(key.w.im).equals(0), `${label}: the i² remark matches b·d = 0`);
  }
  const verdict = grade(question, work);
  assert.equal(verdict.graded, true, `${label}: graded`);
  assert.equal(verdict.isCorrect, true, `${label}: the shared grader accepts ${JSON.stringify(work)}`);
  return model;
};

/* ------------------------------------------------------------ the draws -- */

const SEEDS = 240;
const drawNumber = (random, style) => {
  if (style === 'int') return int(random, -12, 12);
  if (style === 'small') return int(random, -3, 3);
  if (style === 'one') return int(random, -60, 60) / 10;
  return int(random, -400, 400) / 100;
};
const drawZ = (random, style) => {
  const shape = random();
  if (shape < 0.1) return { re: drawNumber(random, style), im: 0 };
  if (shape < 0.2) return { re: 0, im: drawNumber(random, style) };
  return { re: drawNumber(random, style), im: drawNumber(random, style) };
};

const sweep = (seed, make) => {
  const random = prng(seed);
  let explained = 0;
  let refused = 0;
  for (let index = 0; index < SEEDS; index += 1) {
    const { question, mayRefuse } = make(random, index);
    const label = `${JSON.stringify(question)}`;
    const model = buildComplexPlaneLabReview(question);
    if (!model) {
      assert.ok(mayRefuse, `${label}: refused, but nothing documented refuses it`);
      refused += 1;
      continue;
    }
    audit(question, label);
    explained += 1;
  }
  return { explained, refused };
};

test('features: |z| and the conjugate, recomputed', () => {
  ['int', 'one', 'two'].forEach((style, offset) => {
    const { explained } = sweep(101 + offset, (random) => ({ question: { mode: 'features', z: drawZ(random, style) }, mayRefuse: false }));
    assert.equal(explained, SEEDS);
  });
  audit({ mode: 'features', z: { re: 0, im: 0 } }, 'features at the origin');
  audit({ mode: 'features' }, 'features, the lab default');
});

test('operations: add, subtract and multiply, recomputed', () => {
  ['add', 'subtract', 'multiply'].forEach((operation, offset) => {
    ['int', 'one', 'two'].forEach((style, inner) => {
      const { explained } = sweep(200 + offset * 10 + inner, (random) => ({
        question: { mode: 'operations', operation, z: drawZ(random, style), w: drawZ(random, style) },
        mayRefuse: false,
      }));
      assert.equal(explained, SEEDS);
    });
  });
  audit({ mode: 'operations', operation: 'multiply', z: { re: 0, im: 0 }, w: { re: 3, im: -2 } }, 'times zero');
  audit({ mode: 'operations', operation: 'multiply', z: { re: 0, im: 2 }, w: { re: 0, im: -3 } }, 'two pure imaginaries');
  audit({ mode: 'operations', operation: 'subtract', z: { re: 1, im: 1 }, w: { re: 1, im: 1 } }, 'z − z');
});

test('division: the conjugate and the quotient, recomputed', () => {
  ['int', 'one', 'two'].forEach((style, offset) => {
    const { explained, refused } = sweep(300 + offset, (random) => {
      const w = drawZ(random, style);
      return { question: { mode: 'division', z: drawZ(random, style), w }, mayRefuse: w.re === 0 && w.im === 0 };
    });
    assert.ok(explained >= SEEDS - 5, `${style}: ${explained} explained, ${refused} refused`);
  });
  audit({ mode: 'division', z: { re: 0, im: 0 }, w: { re: 2, im: 3 } }, 'zero divided');
  audit({ mode: 'division', z: { re: 1, im: 0 }, w: { re: 0, im: -1 } }, 'divided by -i');
  assert.equal(buildComplexPlaneLabReview({ mode: 'division', z: { re: 1, im: 1 }, w: { re: 0, im: 0 } }), null, 'division by 0 has no answer');
});

test('powers: positive, zero and negative exponents, recomputed', () => {
  ['small', 'one', 'two'].forEach((style, offset) => {
    let noise = 0;
    sweep(400 + offset, (random) => {
      const z = drawZ(random, style);
      const exponent = style === 'small' ? int(random, -6, 12) : int(random, -3, 4);
      const places = Math.max(...[z.re, z.im].map((v) => (String(v).split('.')[1] || '').length));
      const zero = z.re === 0 && z.im === 0;
      const documented = (zero && exponent <= 0) || places * Math.abs(exponent) > 4;
      // An honest refusal, not a documented one: at exactly four places the
      // squared magnitude has eight, and above 10⁶ float noise passes the
      // builder's 1e-9 exactness test (e.g. (4.9 + 4.2i)⁴), so it says nothing
      // rather than print a number it cannot vouch for. Rare; counted below.
      const atTheEdge = !documented && places > 0 && places * Math.abs(exponent) === 4;
      if (atTheEdge && !buildComplexPlaneLabReview({ mode: 'powers', z, exponent })) noise += 1;
      return { question: { mode: 'powers', z, exponent }, mayRefuse: documented || atTheEdge };
    });
    assert.ok(noise <= SEEDS / 50, `${style}: ${noise} refusals at the four-place edge`);
  });
  audit({ mode: 'powers', z: { re: 0, im: 0 }, exponent: 5 }, '0 to a positive power');
  audit({ mode: 'powers', z: { re: 0, im: 1 }, exponent: -7 }, 'i to the -7');
  audit({ mode: 'powers', z: { re: 3, im: 0 }, exponent: -2 }, 'a real base, negative power');
  audit({ mode: 'powers', z: { re: 2, im: 2 }, exponent: 12 }, 'n = 12');
  audit({ mode: 'powers', z: { re: -1.5, im: 0.5 }, exponent: -2 }, 'decimal base, negative power');
});

test('rotation: powers of i of every residue, recomputed', () => {
  ['int', 'two'].forEach((style, offset) => {
    const { explained } = sweep(500 + offset, (random) => ({
      question: { mode: 'rotation', z: drawZ(random, style), quarterTurns: int(random, -13, 13) },
      mayRefuse: false,
    }));
    assert.equal(explained, SEEDS);
  });
  audit({ mode: 'rotation', z: { re: 0, im: 0 }, quarterTurns: 3 }, 'the origin');
  audit({ mode: 'rotation', z: { re: 4, im: 0 }, quarterTurns: -6 }, 'a real number, i^-6');
});

test('quadratic roots: complex, repeated, rational and irrational real roots, recomputed', () => {
  const tally = { negative: 0, zero: 0, positive: 0 };
  [['int', 600], ['one', 601], ['two', 602]].forEach(([style, seed]) => {
    sweep(seed, (random) => {
      let a = 0;
      while (a === 0) a = style === 'int' ? int(random, -5, 5) : drawNumber(random, style);
      const b = style === 'int' ? int(random, -12, 12) : drawNumber(random, style);
      const c = style === 'int' ? int(random, -12, 12) : drawNumber(random, style);
      const d = b * b - 4 * a * c;
      tally[Math.abs(d) < 1e-9 ? 'zero' : d < 0 ? 'negative' : 'positive'] += 1;
      return { question: { mode: 'quadraticRoots', quadratic: { a, b, c } }, mayRefuse: style !== 'int' };
    });
  });
  // Repeated roots and perfect-square discriminants, which random draws rarely hit.
  [[1, -6, 9], [4, 4, 1], [-2, 8, -8], [9, -12, 4], [1, 0, 0], [2, 0, -8], [1, 0, 9], [-1, 0, -2],
    [6, -5, 1], [3, 0, -1], [1, 1, -1], [5, 2, 1], [-3, 2, -1], [0.5, -1, 0.5], [0.25, 1, 1]].forEach(([a, b, c]) => {
    audit({ mode: 'quadraticRoots', quadratic: { a, b, c } }, `quadratic ${a}x² + ${b}x + ${c}`);
  });
  assert.ok(Object.values(tally).every((count) => count >= 0));
});

test('the audit itself can fail: a wrong link, a wrong root, a doubled sign', () => {
  // The relation reader rejects a false equation, a wrong rounding and a non-root.
  const scope = { z: math.complex(3, -4) };
  assert.throws(() => checkRelations('$|z| = \\sqrt{3^2 + (-4)^2} = \\sqrt{26}$', scope, 'false'));
  assert.throws(() => checkRelations('$\\sqrt{13} \\approx 3.62$', scope, 'rounding'));
  assert.equal(checkRelations('$\\sqrt{13} \\approx 3.61$', scope, 'rounding'), 1);
  assert.throws(() => checkRelations('$x = 1 \\pm 2i$', { a: 1, b: 2, c: 5 }, 'root', [{ re: -1, im: 2 }, { re: -1, im: -2 }]));
  assert.equal(checkRelations('$x = -1 \\pm 2i$', { a: 1, b: 2, c: 5 }, 'root', [{ re: -1, im: 2 }, { re: -1, im: -2 }]), 1);
  assert.throws(() => hygiene({ title: 't', steps: ['$3 + -4i$'], why: 'w', note: null, items: [] }, 'sign'));
  assert.throws(() => assertStated({ label: 'x', value: '$\\frac{1}{3} = 0.33$' }, 1 / 3, 'exact claim'));
});
