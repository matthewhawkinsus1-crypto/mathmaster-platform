import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';
import Fraction from 'fraction.js';

import { buildParabolaGeometryLabReview } from '../../src/tools/shared/reviews/parabolaGeometryLabReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE PARABOLA GEOMETRY LAB WORKED SOLUTION, RECOMPUTED
 * INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws per view
 * (plus the edge cases: p negative, fractional and tiny, a vertex at the
 * origin, both orientations, P sampled with a fractional coordinate, P
 * authored on and off the curve, a focus left of / below its directrix), the
 * key is recomputed here in exact Fraction arithmetic from the question alone,
 * and every relation the review writes is parsed back out of its TeX and
 * checked with mathjs:
 *
 *   each "A = B = C" chain holds exactly ("≈" to the places it shows);
 *   every point it names is the vertex, the focus, P, or a point of the
 *   parabola (a latus-rectum end);
 *   every line "x = c" / "y = c" is the axis or the directrix, by orientation;
 *   every equation in x and y is satisfied by the parabola and not by its
 *   focus — the standard form it writes is this parabola.
 *
 * The stated boxes are compared with the exact key, typed back and graded by
 * the shared grader, and the text is checked for display hygiene.
 */

const TOOL_ID = 'parabolaGeometryLab';
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
    } else if (text.startsWith('\\sqrt', index)) {
      const [inside, after] = readGroup(text, index + 5);
      out += `sqrt(${convert(inside)})`;
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
// TeX → mathjs. A letter before "(" is a variable times a group (4p(y − k)),
// never a call; |…| is abs(…).
const texToMath = (tex) => {
  const text = String(tex).replace(/−/g, '-')
    .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
    .replace(/\\cdot/g, '*')
    .replace(/(?<![a-z])([a-zA-Z])\(/g, '$1*(')
    .replace(/(?<![a-z])p([xy])/g, 'p*$1')
    .replace(/\|([^|]+)\|/g, ' abs($1) ')
    .replace(/([\d.a-zA-Z)])\s*abs\(/g, '$1*abs(')
    .trim();
  return convert(text);
};

const RELATIONS = [[' \\approx ', '≈'], [' = ', '=']];
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
// "≈ 4.47" holds to the places it shows.
const holds = (op, left, right, rightText) => {
  if (op === '=') return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right));
  const places = (String(rightText).trim().split('.')[1] || '').length;
  return /^-?\d+(\.\d+)?$/.test(String(rightText).trim()) && Math.abs(left - right) <= 0.5 * 10 ** -places + 1e-9;
};

/* ------------------------------------------------------ the independent key */

const specOf = (question, defaults) => ({
  h: F(question.h ?? defaults.h),
  k: F(question.k ?? defaults.k),
  p: F(question.p ?? defaults.p),
  vertical: (question.orientation || 'vertical') !== 'horizontal',
});
const geometry = ({ h, k, p, vertical }) => ({
  vertex: [h, k],
  focus: vertical ? [h, k.add(p)] : [h.add(p), k],
  directrix: vertical ? k.sub(p) : h.sub(p),
  axis: vertical ? h : k,
  // A point of the parabola at offset t along its axis's perpendicular.
  at: (t) => {
    const along = F(t).mul(t).div(p.mul(4));
    return vertical ? [h.add(t), k.add(along)] : [h.add(along), k.add(t)];
  },
});

const keyOf = (mode, question) => {
  if (mode === 'fromGeometry') {
    const focus = (question.focus || [2, 3]).map(F);
    const directrix = question.directrix || { kind: 'horizontal', value: -1 };
    const d = F(directrix.value);
    const vertical = directrix.kind === 'horizontal';
    const h = vertical ? focus[0] : focus[0].add(d).div(2);
    const k = vertical ? focus[1].add(d).div(2) : focus[1];
    const p = vertical ? focus[1].sub(k) : focus[0].sub(h);
    return { spec: { h, k, p, vertical }, answers: { h, k, p } };
  }
  const defaults = { features: { h: 1, k: -1, p: 2 }, equidistance: { h: 0, k: 0, p: 2 }, equation: { h: -2, k: 1, p: 1.5 } }[mode];
  const spec = specOf(question, defaults);
  const g = geometry(spec);
  if (mode === 'features') {
    return { spec, answers: { focusX: g.focus[0], focusY: g.focus[1], directrix: g.directrix, latus: spec.p.abs().mul(4) } };
  }
  if (mode === 'equation') {
    const opening = spec.vertical ? (spec.p.s > 0 ? 'up' : 'down') : (spec.p.s > 0 ? 'right' : 'left');
    return { spec, answers: { coefficient: spec.p.mul(4), opening } };
  }
  const P = question.point ? question.point.map(F) : g.at(question.offset ?? 4);
  const dx = P[0].sub(g.focus[0]);
  const dy = P[1].sub(g.focus[1]);
  const squared = dx.mul(dx).add(dy.mul(dy));
  const toDirectrix = (spec.vertical ? P[1] : P[0]).sub(g.directrix).abs();
  return {
    spec,
    P,
    answers: { focusDistance: Math.sqrt(squared.valueOf()), focusSquared: squared, directrixDistance: toDirectrix, onCurve: squared.equals(toDirectrix.mul(toDirectrix)) ? 'yes' : 'no' },
  };
};

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
    assert.doesNotMatch(text, /[xy] [+-] 0(?![\d.])/, `${label}: a zero shift in "${raw}"`);
    for (const [, n, d] of text.matchAll(/\\frac\{(\d+)\}\{(\d+)\}|(?<![\d.])(\d+)\/(\d+)(?![\d.])/g)) {
      if (n === undefined) continue;
      assert.equal(gcd(Number(n), Number(d)), 1, `${label}: ${n}/${d} not in lowest terms in "${raw}"`);
      assert.notEqual(Number(d), 1, `${label}: ${n}/1 in "${raw}"`);
    }
  });
};

/* ------------------------------------------------- every relation it writes */

const samePoint = (a, b) => Math.abs(a[0] - b[0]) <= 1e-9 && Math.abs(a[1] - b[1]) <= 1e-9;

const auditRelations = (model, key, label) => {
  const { spec } = key;
  const g = geometry(spec);
  const asNumber = (fraction) => fraction.valueOf();
  const scope = {
    h: asNumber(spec.h), k: asNumber(spec.k), p: asNumber(spec.p),
    ...(key.answers.focusDistance !== undefined ? { PF: key.answers.focusDistance } : {}),
  };
  const onParabola = ([x, y]) => {
    const [a, b] = spec.vertical ? [x - scope.h, y - scope.k] : [y - scope.k, x - scope.h];
    return Math.abs(a * a - 4 * scope.p * b) <= 1e-9 * Math.max(1, a * a);
  };
  const known = [g.vertex, g.focus, ...(key.P ? [key.P] : [])].map((pair) => pair.map(asNumber));
  const lines = spec.vertical ? { x: [asNumber(g.axis)], y: [asNumber(g.directrix)] } : { x: [asNumber(g.directrix)], y: [asNumber(g.axis)] };
  let checked = 0;
  const texts = [...model.steps, model.why];
  texts.forEach((text) => mathSegments(text).forEach((segment) => {
    // A point, optionally named: "F = (1, 2)", "P = (0, −7/6)", "(3, 1)".
    const point = segment.match(/^(?:([FP]) = )?\(([^,]+), ([^,]+)\)$/);
    if (point) {
      const value = [point[2], point[3]].map((part) => evaluateIn(texToMath(part), {}));
      if (point[1] === 'F') assert.ok(samePoint(value, known[1]), `${label}: F is the focus in "${text}"`);
      else if (point[1] === 'P') assert.ok(samePoint(value, known[2]), `${label}: P is the question's point in "${text}"`);
      else assert.ok(known.some((candidate) => samePoint(value, candidate)) || onParabola(value), `${label}: (${value}) is the vertex, focus, P or on the parabola in "${text}"`);
      checked += 1;
      return;
    }
    const { parts, ops } = splitChain(segment);
    if (ops.length === 0) return;
    const expressions = parts.map((part) => texToMath(part));
    const symbols = [...new Set(expressions.flatMap(freeSymbols))].filter((name) => !['sqrt', 'abs'].includes(name));

    // A line "x = c" / "y = c" (its value may be worked out along the chain).
    if (/^[xy]$/.test(parts[0].trim()) && freeSymbols(expressions.slice(1).join('+')).filter((name) => !['sqrt', 'abs'].includes(name)).length === 0) {
      const values = expressions.slice(1).map((expression) => evaluateIn(expression, {}));
      ops.slice(1).forEach((op, index) => assert.ok(holds(op, values[index], values[index + 1], parts[index + 2]), `${label}: ${parts[index + 1]} ${op} ${parts[index + 2]} in "${text}"`));
      assert.ok(lines[parts[0].trim()].some((value) => Math.abs(value - values[0]) <= 1e-9), `${label}: "${segment}" is the axis or the directrix (${spec.vertical ? 'vertical' : 'horizontal'} parabola) in "${text}"`);
      checked += 1;
      return;
    }
    if (symbols.includes('x') || symbols.includes('y')) {
      // An equation of the parabola: true at five of its points, false at the focus.
      assert.equal(ops.length, 1, `${label}: one equation in "${segment}"`);
      const residual = (pair) => evaluateIn(`(${expressions[0]}) - (${expressions[1]})`, { ...scope, x: pair[0], y: pair[1] });
      [-3, -1, 0, 0.5, 2].forEach((t) => {
        const pair = g.at(t).map(asNumber);
        assert.ok(Math.abs(residual(pair)) <= 1e-9 * Math.max(1, Math.abs(pair[0]) + Math.abs(pair[1])) ** 2, `${label}: "${segment}" holds at (${pair}) on the parabola`);
      });
      assert.ok(Math.abs(residual(g.focus.map(asNumber))) > 1e-9, `${label}: "${segment}" is not satisfied by the focus`);
      checked += 1;
      return;
    }
    const values = expressions.map((expression, index) => {
      const value = evaluateIn(expression, scope);
      assert.ok(value !== null, `${label}: "${parts[index]}" has a value in "${segment}"`);
      return value;
    });
    ops.forEach((op, index) => assert.ok(holds(op, values[index], values[index + 1], parts[index + 1]),
      `${label}: ${parts[index]} ${op} ${parts[index + 1]} (${values[index]} vs ${values[index + 1]}) in "${text}"`));
    checked += 1;
  }));
  assert.ok(checked >= 4, `${label}: the audit read the review's relations (${checked})`);
};

/* --------------------------------------------------- the stated boxes */

// A results-list value: "5/2 ≈ 2.5", "√20 ≈ 4.47", "−3", "y = −3".
const readItem = (value) => {
  const text = String(value).replace(/−/g, '-').replace(/^[xy] = /, '');
  const [exact, rounded] = text.split('≈').map((part) => part.trim());
  const surd = exact.match(/^√\(?([^)]+)\)?$/);
  const exactValue = surd ? null : F(exact);
  const surdValue = surd ? Math.sqrt(F(surd[1]).valueOf()) : null;
  return { exact, rounded, exactValue, surdSquared: surd ? F(surd[1]) : null, number: exactValue ? exactValue.valueOf() : surdValue };
};

const FIELDS = {
  features: { 'Focus x': 'focusX', 'Focus y': 'focusY', Directrix: 'directrix', 'Latus rectum length': 'latus' },
  equidistance: { 'Distance P → focus': 'focusDistance', 'Distance P → directrix': 'directrixDistance', 'Is P on the parabola?': 'onCurve' },
  fromGeometry: { 'Vertex h': 'h', 'Vertex k': 'k', p: 'p' },
  equation: { 'Value of 4p': 'coefficient', 'Opening direction': 'opening' },
};

const auditOne = (mode, fields, label) => {
  const question = { type: TOOL_ID, mode, ...fields };
  const model = buildParabolaGeometryLabReview(question);
  let key;
  try {
    key = keyOf(mode, question);
  } catch {
    key = null;
  }
  if (!model) return { model, key, question };
  assertClean(model, label);
  auditRelations(model, key, label);

  const work = {};
  model.items.forEach(({ label: itemLabel, value }) => {
    const field = FIELDS[mode][itemLabel];
    assert.ok(field, `${label}: a known item ${itemLabel}`);
    const truth = key.answers[field];
    if (field === 'onCurve') {
      assert.equal(value, truth === 'yes' ? 'Yes' : 'No', `${label}: on the parabola?`);
      work[field] = truth;
      return;
    }
    if (field === 'opening') {
      assert.equal(value, truth, `${label}: the opening`);
      work[field] = value;
      return;
    }
    const read = readItem(value);
    if (field === 'directrix') assert.match(String(value), mode === 'features' && key.spec.vertical ? /^y = / : /^x = /, `${label}: the directrix's variable`);
    if (field === 'focusDistance' && read.surdSquared) {
      assert.ok(read.surdSquared.equals(key.answers.focusSquared), `${label}: √${read.surdSquared} is PF`);
    } else {
      const exact = field === 'focusDistance' ? null : truth;
      if (exact) assert.ok(read.exactValue.equals(exact), `${label}: ${field} ${read.exact} is ${exact.toFraction()}`);
      else assert.ok(Math.abs(read.number - truth) <= 1e-9, `${label}: ${field} ${read.exact} is ${truth}`);
    }
    if (read.rounded !== undefined) assert.ok(holds('≈', read.number, Number(read.rounded), read.rounded), `${label}: ${value} rounds right`);
    // A student types the exact value when it can be typed, else the decimal.
    work[field] = read.surdSquared ? read.rounded : read.exact;
  });
  const result = grade(question, work);
  assert.equal(result.isCorrect, true, `${label}: graded correct (${JSON.stringify(work)})`);
  assert.equal(result.score, 1, `${label}: full credit`);
  return { model, key, question };
};

/* ------------------------------------------------------------------ draws */

const COORDS = [-4, -3, -2, -1, 0, 1, 2, 3, 5, 0.5, -1.5, 2.25, -0.75];
const PS = [1, 2, -1, -2, 0.5, -0.5, 1.5, -0.25, 0.3, 3, -3, 0.1, 0.75, -1.25];
const ORIENT = ['vertical', 'horizontal', undefined];
const vertexFields = (random) => {
  const fields = { h: pick(random, COORDS), k: pick(random, COORDS), p: pick(random, PS) };
  const orientation = pick(random, ORIENT);
  if (orientation) fields.orientation = orientation;
  return fields;
};

const draws = {
  features: vertexFields,
  equation: vertexFields,
  equidistance: (random) => {
    const fields = vertexFields(random);
    const choice = random();
    if (choice < 0.4) fields.offset = pick(random, [-4, -3, -2, -1, 0, 1, 2, 3, 4, 1.5, -0.5, 6]);
    else if (choice < 0.85) fields.point = [pick(random, COORDS), pick(random, COORDS)];
    return fields;
  },
  fromGeometry: (random) => {
    const focus = [pick(random, COORDS), pick(random, COORDS)];
    const kind = pick(random, ['horizontal', 'vertical']);
    let value = pick(random, COORDS);
    if (value === focus[kind === 'horizontal' ? 1 : 0]) value += 1;
    return { focus, directrix: { kind, value } };
  },
};

for (const [mode, draw] of Object.entries(draws)) {
  test(`${mode}: 300 seeded draws — every relation recomputed exactly, the boxes are the key and graded correct`, () => {
    const random = prng(0x9A7 + mode.length * 131);
    let built = 0;
    const unexplained = [];
    for (let index = 0; index < 300; index += 1) {
      const fields = draw(random);
      const label = `${mode} #${index} ${JSON.stringify(fields)}`;
      const { model, key } = auditOne(mode, fields, label);
      if (model) built += 1;
      // The builder's honest nulls: P's two distances agree to the grader's
      // 2 places but not exactly (No would be marked, yet both boxes read the same).
      else if (!(mode === 'equidistance' && key && key.answers.onCurve === 'no'
        && Math.abs(key.answers.focusDistance - key.answers.directrixDistance.valueOf()) < 0.01)) unexplained.push(label);
    }
    assert.ok(built >= 250, `${mode}: draws have a review (${built})`);
    assert.deepEqual(unexplained, [], `${mode}: every null review is honest`);
  });
}

/* -------------------------------------------------------------- edge cases */

const EDGES = [
  ['features', { h: 0, k: 0, p: 0.000005 }, 'p tiny but nonzero'],
  ['features', { h: -0.75, k: 2.25, p: -0.3, orientation: 'horizontal' }, 'all decimals, opens left'],
  ['features', { h: 1, k: 1, p: 0 }, 'p = 0: no parabola'],
  ['equation', { h: 0, k: 0, p: -0.25, orientation: 'horizontal' }, '4p = −1 at the origin'],
  ['equation', { h: 0, k: 3, p: 0.25 }, '4p = 1'],
  ['equidistance', { h: 0, k: 0, p: 3 }, 'sampled P with a fractional y'],
  ['equidistance', { h: 2, k: -1, p: -0.5, offset: 0 }, 'P at the vertex'],
  ['equidistance', { h: 1, k: 2, p: 1, orientation: 'horizontal', offset: -3 }, 'horizontal, sampled below the axis'],
  ['equidistance', { h: 0, k: 0, p: 2, point: [0, 0] }, 'P the vertex, authored'],
  ['equidistance', { h: 0, k: 0, p: 2, point: [0, 2] }, 'P the focus'],
  ['equidistance', { h: 0, k: 0, p: 2, point: [5, -2] }, 'P on the directrix'],
  ['equidistance', { h: 0, k: 0, p: 2, point: ['4', '2'] }, 'P as numeric strings, on the curve'],
  ['fromGeometry', { focus: [0, -1], directrix: { kind: 'horizontal', value: 3 } }, 'focus below the directrix'],
  ['fromGeometry', { focus: [-1.5, 2], directrix: { kind: 'vertical', value: 0.5 } }, 'focus left of the directrix'],
  ['fromGeometry', { focus: [1, 0.1], directrix: { kind: 'horizontal', value: 0 } }, 'a decimal p'],
  ['fromGeometry', { focus: [2, 3], directrix: { kind: 'horizontal', value: 3 } }, 'a focus on its directrix: no parabola'],
];

test('edge cases: every relation recomputed, and a null only when there is no parabola', () => {
  for (const [mode, fields, name] of EDGES) {
    const { model } = auditOne(mode, fields, `${mode} ${name}`);
    assert.equal(model === null, /no parabola/.test(name), `${mode} ${name}: ${model ? 'a review' : 'null'}`);
  }
});
