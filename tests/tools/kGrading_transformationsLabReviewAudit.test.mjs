import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { buildTransformationsLabReview as build } from '../../src/tools/shared/reviews/transformationsLabReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K — AN INDEPENDENT AUDIT OF THE TRANSFORMATIONS LAB WORKED SOLUTION.
 *
 * Over seeded draws of every family, every mode, negative a, reflections,
 * fractional b, zero and negative h and k, and bases 2, 3, 1/2 and 10, every
 * review the builder returns is re-derived without the lab's own mathematics:
 *
 *   - every numeric equality chain the review prints (3/(−0.5) + 1 = −5,
 *     (1 + 1, −2·0 + 3) = (2, 3), ...) holds, evaluated by mathjs;
 *   - every equation y = … it prints is the function (or its parent),
 *     sampled against a·f(b(x − h)) + k written out by hand;
 *   - every "x = X gives y = Y" is true of the function;
 *   - every stated answer is the hand-computed one (the parameters, the
 *     image (x/b + h, ay + k), the ten descriptions, the defining feature);
 *   - the work those answers make is marked correct by the shared grader.
 */

const math = create(all);
const TOOL_ID = 'transformationsLab';

/* ------------------------------------------------------------------ */
/* the review's TeX, read by mathjs                                    */
/* ------------------------------------------------------------------ */

const readGroup = (text, start) => {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return [text.slice(start + 1, index), index + 1];
    }
  }
  throw new Error(`unbalanced: ${text}`);
};
const texToMath = (tex) => {
  const text = tex.replace(/\\left\|/g, 'abs(').replace(/\\right\|/g, ')').replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
    .replace(/\\cdot/g, '*').replace(/\\ /g, ' ');
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('\\frac', index)) {
      const [numerator, next] = readGroup(text, index + 5);
      const [denominator, end] = readGroup(text, next);
      out += `((${texToMath(numerator)})/(${texToMath(denominator)}))`;
      index = end;
    } else if (text.startsWith('\\sqrt[3]', index)) {
      const [radicand, end] = readGroup(text, index + 8);
      out += `cbrt(${texToMath(radicand)})`;
      index = end;
    } else if (text.startsWith('\\sqrt', index)) {
      const [radicand, end] = readGroup(text, index + 5);
      out += `sqrt(${texToMath(radicand)})`;
      index = end;
    } else if (text.startsWith('\\log_', index)) {
      const [base, end] = readGroup(text, index + 5);
      out += `(1/log(${texToMath(base)}))*log`;
      index = end;
    } else if (text[index] === '^' && text[index + 1] === '{') {
      const [power, end] = readGroup(text, index + 1);
      out += `^(${texToMath(power)})`;
      index = end;
    } else if (text[index] === '\\') {
      throw new Error(`unknown TeX: ${text.slice(index, index + 12)}`);
    } else {
      out += text[index];
      index += 1;
    }
  }
  return out;
};
const splitTop = (text) => {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let index = 0; index < text.length; index += 1) {
    if ('({['.includes(text[index])) depth += 1;
    else if (')}]'.includes(text[index])) depth -= 1;
    else if (depth === 0 && text[index] === ',') {
      parts.push(text.slice(last, index));
      last = index + 1;
    }
  }
  parts.push(text.slice(last));
  return parts;
};
const evalNumber = (expression, scope = {}) => {
  const value = math.evaluate(expression, scope);
  if (typeof value !== 'number') throw new Error('not a real number');
  return value;
};
// One side of a chain: a number or a coordinate pair.
const evalSide = (side) => {
  const text = side.trim();
  if (text.startsWith('(') && text.endsWith(')')) {
    const parts = splitTop(text.slice(1, -1));
    if (parts.length === 2) return parts.map((part) => evalNumber(texToMath(part)));
  }
  return [evalNumber(texToMath(text))];
};
const close = (left, right) => Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
const segments = (text) => [...String(text).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
const textsOf = (model) => [...model.steps, model.why, model.note || '', ...model.items.map((item) => item.value)];

let chainsChecked = 0;
const chainProblems = (model) => {
  const problems = [];
  for (const text of textsOf(model)) {
    for (const segment of segments(text)) {
      if (!segment.includes('=')) continue;
      let values;
      // A side with a letter in it (x, h, b, ...) is not a numeric chain.
      try { values = segment.split('=').map(evalSide); } catch { continue; }
      chainsChecked += 1;
      for (const value of values.slice(1)) {
        if (value.length !== values[0].length || !value.every((part, index) => close(part, values[0][index]))) problems.push(`chain: ${segment}`);
      }
    }
  }
  return problems;
};

/* ------------------------------------------------------------------ */
/* the function, by hand                                               */
/* ------------------------------------------------------------------ */

const parentValue = (type, u, base) => ({
  linear: u,
  quadratic: u ** 2,
  absolute: Math.abs(u),
  cubic: u ** 3,
  cubeRoot: Math.cbrt(u),
  squareRoot: u < 0 ? Number.NaN : Math.sqrt(u),
  exponential: base ** u,
  logarithmic: u <= 0 ? Number.NaN : Math.log(u) / Math.log(base),
  rational: u === 0 ? Number.NaN : 1 / u,
}[type]);
const valueAt = (spec, x) => spec.a * parentValue(spec.type, spec.b * (x - spec.h), spec.base) + spec.k;

const sameAsFunction = (expression, fn) => {
  const compiled = math.compile(texToMath(expression));
  let compared = 0;
  for (let x = -6.85; x <= 6.85; x += 0.5) {
    const want = fn(x);
    let got;
    try { got = compiled.evaluate({ x }); } catch { got = Number.NaN; }
    if (typeof got !== 'number' || !Number.isFinite(got)) got = Number.NaN;
    if (Number.isNaN(want) && Number.isNaN(got)) continue;
    if (Number.isNaN(want) || Number.isNaN(got) || !close(want, got)) return false;
    compared += 1;
  }
  return compared > 0;
};
const equationProblems = (model, spec) => {
  const parent = { ...spec, a: 1, b: 1, h: 0, k: 0 };
  const problems = [];
  for (const text of textsOf(model)) {
    for (const segment of segments(text)) {
      const match = /^(?:y|f\(x\)) = (.*)$/.exec(segment);
      if (!match || !/x/.test(match[1]) || /f\(/.test(match[1])) continue;
      if (!sameAsFunction(match[1], (x) => valueAt(spec, x)) && !sameAsFunction(match[1], (x) => valueAt(parent, x))) {
        problems.push(`equation is neither the function nor its parent: ${segment}`);
      }
    }
  }
  return problems;
};
const givesProblems = (model, spec) => {
  const problems = [];
  for (const text of [...model.steps, model.why]) {
    for (const match of text.matchAll(/\$x = ([^$]+)\$ gives \$y = ([^$]+)\$/g)) {
      const x = evalNumber(texToMath(match[1]));
      const ys = match[2].split('=').map((side) => evalNumber(texToMath(side)));
      if (!ys.every((y) => close(valueAt(spec, x), y))) problems.push(`gives: ${match[0]}`);
    }
    // "… at $x = X$, the height is $y = Y$": a point read off the graph.
    for (const match of text.matchAll(/at \$x = ([^$]+)\$, [^$]*?\$y = ([^$]+)\$/g)) {
      const x = evalNumber(texToMath(match[1]));
      if (!close(valueAt(spec, x), evalNumber(texToMath(match[2])))) problems.push(`read off the graph: ${match[0]}`);
    }
  }
  return problems;
};

// A stated number: "2", "-5/3" or "5/3 ≈ 1.667" (its exact part).
const exactOf = (value) => {
  const text = value.includes('≈') ? value.split('≈')[0].trim() : value;
  const fraction = /^(-?\d+)\/(\d+)$/.exec(text);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(text);
};
const typedOf = (value) => (value.includes('≈') ? value.split('≈')[1].trim() : value);
const KIND = (factor) => (factor === 1 ? 'Unchanged' : factor > 1 ? 'Stretch' : 'Compression');

const answerProblems = (question, model, spec) => {
  const mode = question.mode;
  const items = Object.fromEntries(model.items.map((item) => [item.label, item.value]));
  const problems = [];
  const expect = (label, got, want) => { if (!close(got, want)) problems.push(`${label}: ${got} is not ${want}`); };
  let work;
  if (mode === 'match' || mode === 'identify') {
    work = {};
    for (const key of ['a', 'b', 'h', 'k']) {
      if (items[key] == null) continue;
      expect(key, exactOf(items[key]), spec[key]);
      work[key] = typedOf(items[key]);
    }
    const equation = (items['Target graph'] || items.Function).replace(/^\$y = /, '').replace(/\$$/, '');
    if (!sameAsFunction(equation, (x) => valueAt(spec, x))) problems.push(`stated function ${equation}`);
  } else if (mode === 'pointMap') {
    const [x, y] = question.parentPoint;
    expect('mapped x', exactOf(items['Transformed x']), x / spec.b + spec.h);
    expect('mapped y', exactOf(items['Transformed y']), spec.a * y + spec.k);
    work = { mappedX: typedOf(items['Transformed x']), mappedY: typedOf(items['Transformed y']) };
  } else if (mode === 'plotTransform') {
    work = { plottedPoints: question.sourcePoints.map(([x, y], index) => {
      const point = model.items[index].value.slice(1, -1).split(', ').map(exactOf);
      expect(`P${index + 1} x`, point[0], x / spec.b + spec.h);
      expect(`P${index + 1} y`, point[1], spec.a * y + spec.k);
      return point.map((value) => Number(value.toFixed(6)));
    }) };
  } else if (mode === 'describe') {
    const want = {
      'Reflection across the x-axis?': spec.a < 0 ? 'Yes' : 'No',
      'Vertical scale': KIND(Math.abs(spec.a)),
      'Vertical scale factor |a|': Math.abs(spec.a),
      'Reflection across the y-axis?': spec.b < 0 ? 'Yes' : 'No',
      'Horizontal scale': KIND(1 / Math.abs(spec.b)),
      'Horizontal scale factor 1/|b|': 1 / Math.abs(spec.b),
      'Horizontal translation': spec.h > 0 ? 'Right' : spec.h < 0 ? 'Left' : 'None',
      'Horizontal shift (units)': Math.abs(spec.h),
      'Vertical translation': spec.k > 0 ? 'Up' : spec.k < 0 ? 'Down' : 'None',
      'Vertical shift (units)': Math.abs(spec.k),
    };
    const keys = ['reflection', 'scaleKind', 'scaleFactor', 'horizontalReflection', 'horizontalScaleKind', 'horizontalScaleFactor', 'horizontalDirection', 'horizontalDistance', 'verticalDirection', 'verticalDistance'];
    work = {};
    Object.entries(want).forEach(([label, value], index) => {
      if (typeof value === 'number') {
        expect(label, exactOf(items[label]), value);
        work[keys[index]] = typedOf(items[label]);
      } else {
        if (items[label] !== value) problems.push(`${label}: ${items[label]} is not ${value}`);
        work[keys[index]] = String(items[label]).toLowerCase();
      }
    });
  } else {
    // The defining feature: the parent's (1, 0) for a logarithm, else (0, 0).
    const parent = spec.type === 'logarithmic' ? [1, 0] : [0, 0];
    const [x, y] = Object.values(items);
    expect('feature x', exactOf(x), parent[0] / spec.b + spec.h);
    expect('feature y', exactOf(y), spec.a * parent[1] + spec.k);
    work = { anchorX: typedOf(x), anchorY: typedOf(y) };
  }
  const result = gradeToolWork({ toolId: TOOL_ID, question, work });
  if (!(result.graded && result.isCorrect && result.score === 1)) problems.push(`not marked correct: ${JSON.stringify(work)}`);
  return problems;
};

/* ------------------------------------------------------------------ */
/* the sweep                                                           */
/* ------------------------------------------------------------------ */

const FAMILIES = ['linear', 'quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot', 'exponential', 'logarithmic', 'rational'];
const MODES = ['match', 'identify', 'pointMap', 'plotTransform', 'describe', 'anchor'];
const A = [1, -1, 2, -2, 3, -3, 0.5, -0.5, 1 / 3, -2 / 3, 1.5, 4, -0.25];
const B = [1, -1, 2, -2, 0.5, -0.5, 1 / 3, 3];
const HK = [0, 0, 1, -1, 2, -2, 3, -3, 0.5, -1.5, 4];
const BASES = [2, 3, 0.5, 10];

test('every review over seeded draws re-derives step by step and is marked correct', () => {
  let seed = 20261010;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (values) => values[Math.floor(random() * values.length)];
  const built = {};
  const problems = [];
  for (let draw = 0; draw < 3000; draw += 1) {
    const family = pick(FAMILIES);
    const mode = pick(MODES);
    const fn = { type: family, a: pick(A), h: pick(HK), k: pick(HK) };
    if (random() < 0.5) fn.b = pick(B);
    if (family === 'exponential' || family === 'logarithmic') fn.base = pick(BASES);
    const question = { type: TOOL_ID, questionId: `audit-${draw}`, mode, family };
    if (mode === 'match') question.target = fn;
    else question.function = fn;
    if (random() < 0.2) question.includeHorizontalScale = true;
    if (mode === 'pointMap') question.parentPoint = [pick([-2, -1, 0, 1, 2, 4]), pick([-1, 0, 1, 2, 4, 8])];
    if (mode === 'plotTransform') question.sourcePoints = Array.from({ length: 1 + Math.floor(random() * 4) }, () => [pick([-3, -1, 0, 1, 2]), pick([-2, 0, 1, 3])]);
    const model = build(question);
    if (!model) continue;
    built[mode] = (built[mode] || 0) + 1;
    const spec = { type: family, a: fn.a, b: fn.b ?? 1, h: fn.h, k: fn.k, base: fn.base ?? 2 };
    for (const problem of [...chainProblems(model), ...equationProblems(model, spec), ...givesProblems(model, spec), ...answerProblems(question, model, spec)]) {
      problems.push(`${mode}/${family} ${JSON.stringify(fn)}: ${problem}`);
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
  // The sweep reaches every mode, and checks hundreds of printed chains.
  for (const mode of MODES) assert.ok(built[mode] > 100, `${mode}: ${built[mode]} reviews`);
  assert.ok(chainsChecked > 3000, `numeric chains checked: ${chainsChecked}`);
});

test('the audit checks can fail: a falsified step, equation or answer is caught', () => {
  const spec = { type: 'quadratic', a: 2, b: 1, h: 1, k: 0, base: 2 };
  const falsified = {
    steps: ['Transformed x: $\\frac{3}{-0.5} + 1 = -4$.', 'So $(1 + 1, -2 \\cdot 0 + 3) = (2, 4)$.'],
    why: 'Check: $x = 2$ gives $y = 7$; at $x = 0$, the height is $y = 1$; and the graph is $y = 2(x - 2)^{2}$.',
    note: null,
    items: [],
  };
  assert.equal(chainProblems(falsified).length, 2);
  assert.equal(givesProblems(falsified, spec).length, 2);
  assert.equal(equationProblems(falsified, spec).length, 1);
  const question = { type: TOOL_ID, questionId: 'audit-fake', mode: 'identify', family: 'quadratic', function: { a: 2, h: 1, k: 0 } };
  const wrongAnswer = { items: [{ label: 'a', value: '2' }, { label: 'h', value: '-1' }, { label: 'k', value: '0' }, { label: 'Function', value: '$y = 2(x + 1)^{2}$' }] };
  assert.equal(answerProblems(question, wrongAnswer, spec).length, 3, 'the wrong h, the wrong function, and the grader');
});

test('describe: the review says it chose b = 1; it never claims the graph shows it', () => {
  // 4(x − 1)² + 2 is also (2(x − 1))² + 2: a horizontal compression by 1/2
  // describes this graph exactly as well as a vertical stretch by 4.
  const question = { type: TOOL_ID, questionId: 'audit-describe', mode: 'describe', family: 'quadratic', function: { a: 4, h: 1, k: 2 } };
  const model = build(question);
  assert.ok(model);
  const steps = model.steps.join(' ');
  assert.doesNotMatch(steps, /so \$b = 1\$/, 'b = 1 is not deduced from the graph');
  assert.match(model.steps[0], /does not fix b/);
  assert.match(model.steps[0], /simplest form, with \$b = 1\$/);
  for (const family of ['absolute', 'cubic', 'cubeRoot', 'squareRoot', 'rational', 'logarithmic']) {
    const other = build({ ...question, family, function: { a: 2, h: 1, k: 2 } });
    assert.ok(other, family);
    assert.doesNotMatch(other.steps.join(' '), /so \$b = 1\$/, family);
  }
});
