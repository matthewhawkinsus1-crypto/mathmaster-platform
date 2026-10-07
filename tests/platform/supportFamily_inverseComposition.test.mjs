/*
 * THE "INVERSE AND COMPOSITION" SUPPORT FAMILY, ON REAL ITEMS
 * (src/platform/supports/families/inverseComposition.js).
 *
 * Every item here is a question the classroom actually renders:
 *   - the two Algebra II Honors lessons in teacher-import-jsons
 *     (L3_Inverse_Linear_Functions, L4_Operations_on_Functions_Composition),
 *     compiled by the production V5 compiler — every multiAnswer item the
 *     family claims and both inverseCompositionLab views they use;
 *   - the inverseCompositionLab items of SAMPLE_BATCH_A_DEEP_DIVE.json (full,
 *     restriction on a quadratic, inverse of an exponential) and
 *     SAMPLE_MISSING_MATH_TOOLS.json (no mode), in their raw stored shape;
 *   - authored V5 intents compiled by the same production compiler for the
 *     shapes the corpus has only one or two of: the derivation lab
 *     (deriveInverse), a restriction on an unbranched quadratic, the Function
 *     Operations Workbench, and more multiAnswer items of the pointwise,
 *     composition-from-values, context-composition, inverse-property and
 *     inverse-graph kinds.
 *
 * The answers every hint is checked against are computed HERE, independently
 * of the family: rules are read from the prompt by this file's own patterns
 * and evaluated with the platform's mathjs instance, polynomials are recovered
 * by interpolation, and each computed answer is first proved equal to the
 * question's own key (the answer field, or the shared grader marking the
 * computed work correct for the registry tools).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as family from '../../src/platform/supports/families/inverseComposition.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../functions/shared/answerUtils.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { evaluate } from '../../functions/shared/algebra/safeMath.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

/* ------------------------------------------- this file's own math */

const MINUS = '−';
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const toMath = (raw) => String(raw).trim().replace(/\.$/, '').replace(/[−–]/g, '-').replace(/[·×]/g, '*')
  .replace(/²/g, '^2').replace(/³/g, '^3');
const fnOf = (rule, variable = 'x') => (value) => Number(evaluate(toMath(rule), { [variable]: value }));
const SAMPLES = [-3, -0.5, 1.5, 4, 7];
const sameFunction = (f, g, samples = SAMPLES) => samples.every((t) => near(f(t), g(t)));
const num = (raw) => Number(String(raw).replace(/[−–]/g, '-'));
// A key as written (3, −1/4, 0.5) as a number.
const val = (raw) => Number(evaluate(toMath(raw)));

// The coefficients (ascending) of a polynomial of degree ≤ 4, by interpolation
// at points that are not whole numbers (so a quotient's excluded input is never one).
const polyOf = (fn) => {
  const n = 5;
  const rows = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (__, j) => (i + 0.25) ** j), fn(i + 0.25)]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const k = rows[r][c] / rows[c][c];
      for (let j = c; j <= n; j += 1) rows[r][j] -= k * rows[c][j];
    }
  }
  const out = rows.map((row, i) => {
    const value = row[n] / row[i];
    return Math.abs(value - Math.round(value)) < 1e-7 ? Math.round(value) + 0 : Math.round(value * 1e6) / 1e6;
  });
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  return out;
};
const degreeOf = (fn) => polyOf(fn).length - 1;

// How this file writes an answer, in the spellings a hint could carry.
const variantsOf = (ascii) => {
  const out = new Set();
  [ascii, ascii.replace(/\s+/g, '')].forEach((form) => {
    const sup = form.replace(/\^2/g, '²').replace(/\^3/g, '³');
    [form, sup].forEach((variant) => { out.add(variant); out.add(variant.replace(/-/g, MINUS)); });
  });
  return [...out];
};
const polyForms = (coefficients) => {
  const terms = coefficients.map((c, p) => [c, p]).filter(([c]) => c !== 0).reverse();
  if (!terms.length) return ['0'];
  const term = (c, p) => {
    const m = Math.abs(c);
    const v = p === 0 ? '' : p === 1 ? 'x' : `x^${p}`;
    return `${v && m === 1 ? '' : m}${v}`;
  };
  return variantsOf(terms.map(([c, p], i) => `${i === 0 ? (c < 0 ? '-' : '') : (c < 0 ? ' - ' : ' + ')}${term(c, p)}`).join(''));
};
const numberForms = (value) => {
  const v = near(value, Math.round(value)) ? Math.round(value) : Math.round(value * 1e9) / 1e9;
  const out = new Set([String(v)]);
  if (v < 0) out.add(`${MINUS}${-v}`);
  if (!Number.isInteger(v)) {
    out.add(String(Math.round(v * 100) / 100));
    for (let d = 2; d <= 100; d += 1) {
      const n = Math.round(v * d);
      if (near(n / d, v)) { out.add(`${n}/${d}`); if (n < 0) out.add(`${MINUS}${-n}/${d}`); break; }
    }
  }
  return [...out];
};
const inverseForms = (a, b) => {
  const out = [...polyForms([-b / a, 1 / a])];
  const B = Math.abs(b);
  const A = Math.abs(a);
  if (a > 0) out.push(...variantsOf(b === 0 ? `x/${A}` : `(x ${b > 0 ? '-' : '+'} ${B})/${A}`));
  else if (b > 0) out.push(...variantsOf(`(${B} - x)/${A}`));
  else out.push(...variantsOf(b === 0 ? `-x/${A}` : `-(x + ${B})/${A}`));
  return out;
};
const pairsIn = (source) => [...String(source).matchAll(/\(\s*([−-]?\d+(?:\.\d+)?)\s*,\s*([−-]?\d+(?:\.\d+)?)\s*\)/g)].map(([, x, y]) => [num(x), num(y)]);
const setForms = (pairs) => variantsOf(`{${pairs.map(([x, y]) => `(${x}, ${y})`).join(', ')}}`);
const sameSet = (a, b) => a.length === b.length && a.every(([x, y], i) => near(x, b[i][0]) && near(y, b[i][1]));

// name(v) = rule, read with this file's own pattern.
const defsIn = (source) => {
  const out = new Map();
  for (const [, name, variable, rule] of String(source).matchAll(/(?<![A-Za-z])([A-Za-z])\(([a-z])\)\s*=\s*(.+?)(?=\s+(?:and|where|at|are|is|by|to|with|for)\b|,|\.\s|\.$|$)/g)) {
    if (!out.has(name) && /[a-z]/.test(rule) && !/[=]/.test(rule)) out.set(name, { variable, rule, fn: fnOf(rule, variable) });
  }
  return out;
};
const givensIn = (source) => [...String(source).matchAll(/(?<![A-Za-z⁻¹])([A-Za-z])\(([−-]?\d+(?:\.\d+)?)\)\s*=\s*([−-]?\d+(?:\.\d+)?)/g)]
  .map(([, name, input, output]) => ({ name, input: num(input), output: num(output) }));
const keyOf = (field) => answerCandidatesForField(field)[0];
const keyFn = (field, variable = 'x') => fnOf(keyOf(field), variable);
const flat = (label) => String(label).replace(/\s+/g, '').replace(/[−–]/g, '-');

/* ------------------------------------- the registry tools, evaluated */

const specFn = (spec = {}) => {
  const type = spec.type || spec.family || 'linear';
  const a = Number(spec.a ?? spec.m ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? spec.b ?? 0);
  const base = Number(spec.base ?? 2);
  if (Array.isArray(spec.coefficients)) return (x) => spec.coefficients.reduce((sum, c) => sum * x + Number(c), 0);
  if (type === 'linear' || type === 'line') return (x) => a * (x - h) + k;
  if (type === 'quadratic') return (x) => a * (x - h) ** 2 + k;
  if (type === 'exponential') return (x) => a * base ** (x - h) + k;
  if (type === 'logarithmic') return (x) => a * (Math.log(x - h) / Math.log(base)) + k;
  throw new Error(`no evaluator for ${type}`);
};
const LAB_F = { type: 'linear', a: 2, h: 0, k: 3 };
const LAB_G = { type: 'linear', a: -1, h: 0, k: 4 };
const labParts = (mode, f) => (mode === 'composition' ? ['fog', 'gof'] : mode === 'inverse' ? ['inverse']
  : mode === 'restriction' ? ['restriction', 'inverse'] : ['fog', 'gof', 'inverse', ...(f.type === 'quadratic' ? ['restriction'] : [])]);

/* ------------------------------------------- the independent oracle */

// Every kind returns the answers a hint must not contain, after proving
// they ARE this question's answers.
const ORACLES = {
  linearInverse(question) {
    const [name, def] = [...defsIn(question.prompt)].find(([, entry]) => degreeOf(entry.fn) === 1);
    const b = def.fn(0);
    const a = def.fn(1) - b;
    const inverse = (y) => (y - b) / a;
    const answers = [...inverseForms(a, b), ...numberForms(1 / a)];
    for (const field of question.answerFields) {
      const label = flat(field.label);
      if (/⁻¹\([a-z]\)|inverserule/i.test(label)) assert.ok(sameFunction(keyFn(field), inverse), `${label}: the key is f⁻¹`);
      else if (/slopeof/i.test(label)) assert.ok(near(val(keyOf(field)), 1 / a), 'slope of f⁻¹');
      else if (/^If[a-z]\(/i.test(label)) {
        const [, input, output] = label.match(/\(([-\d.]+)\)=([-\d.]+)/);
        const statement = `${name}⁻¹(${output})=${input}`;
        assert.equal(flat(keyOf(field)), statement, 'the check statement swaps the pair');
        answers.push(...variantsOf(statement), ...variantsOf(statement.replace('=', ' = ')));
      } else if (typeof keyOf(field) === 'number') {
        const amount = Number(String(field.label).match(/\$(\d+)/)[1]);
        assert.ok(near(keyOf(field), inverse(amount)), 'the context value is f⁻¹ of the total');
        answers.push(...numberForms(inverse(amount)));
      }
    }
    return answers;
  },
  inverseRelation(question) {
    const set = String(question.prompt).match(/\{[^}]*\}/);
    const swapField = question.answerFields.find((field) => /swapped/i.test(field.label));
    const pairs = set ? pairsIn(set[0]) : pairsIn(swapField.label).slice(0, 1);
    const swapped = pairs.map(([x, y]) => [y, x]);
    const answers = [];
    for (const field of question.answerFields) {
      if (/inverse relation$|swapped/i.test(field.label)) {
        assert.ok(sameSet(pairsIn(keyOf(field)), swapped), 'the key swaps every pair');
        answers.push(...(set ? setForms(swapped) : variantsOf(`(${swapped[0][0]}, ${swapped[0][1]})`)));
      }
      const evaluation = flat(field.label).match(/^If([a-z])\(x\)=(.+),then[a-z]\(([-\d]+)\)=$/i);
      if (evaluation) {
        const value = fnOf(evaluation[2])(num(evaluation[3]));
        assert.ok(near(num(keyOf(field)), value));
        answers.push(...numberForms(value));
      }
      if (/a function\?$/i.test(field.label)) {
        const inputs = swapped.map(([x]) => x);
        assert.equal(keyOf(field), new Set(inputs).size === inputs.length ? 'yes' : 'no');
      }
    }
    return answers;
  },
  inverseProperty(question) {
    const given = givensIn(question.prompt)[0];
    const point = pairsIn(question.prompt).find(([x, y]) => x === y);
    const answers = [];
    for (const field of question.answerFields) {
      const label = flat(field.label);
      const value = given ? (/^input/i.test(label) ? given.output : given.input) : point[0];
      assert.ok(near(val(keyOf(field)), value), `${label} = ${value}`);
      answers.push(...numberForms(value));
    }
    return answers;
  },
  inverseGraph(question) {
    const slope = question.answerFields.find((field) => /slope of y\s*=\s*x/i.test(field.label));
    if (!slope) return [];
    assert.equal(val(keyOf(slope)), 1, 'the slope of y = x is 1');
    return ['1'];
  },
  operations(question) {
    const defs = defsIn(question.prompt);
    const F = defs.get('f').fn;
    const G = defs.get('g').fn;
    const answers = [];
    for (const field of question.answerFields) {
      const label = flat(field.label);
      const op = label.match(/^\(f([+\-·/])g\)\(x\)$/)?.[1];
      if (op && op !== '/') {
        const fn = (t) => (op === '+' ? F(t) + G(t) : op === '-' ? F(t) - G(t) : F(t) * G(t));
        assert.ok(sameFunction(keyFn(field), fn), `${label}`);
        answers.push(...polyForms(polyOf(fn)));
      }
      if (op === '/') assert.ok(sameFunction(keyFn(field), (t) => F(t) / G(t), [-3.5, 0.5, 1.5, 7.25]), 'the quotient');
      if (/excluded/i.test(label)) {
        const root = -G(0) / (G(1) - G(0));
        assert.ok(near(val(keyOf(field)), root), 'the excluded input zeroes g');
        answers.push(...numberForms(root));
      }
      if (/degree/i.test(label)) {
        const degree = degreeOf((t) => F(t) * G(t));
        assert.equal(val(keyOf(field)), degree);
        answers.push(String(degree));
      }
    }
    return answers;
  },
  pointwise(question) {
    const givens = givensIn(question.prompt);
    const at = (name, input) => givens.find((entry) => entry.name === name && entry.input === input).output;
    return question.answerFields.flatMap((field) => {
      const [, op, arg] = flat(field.label).match(/^\(f([+\-·/])g\)\(([-\d]+)\)$/);
      const [p, q] = [at('f', num(arg)), at('g', num(arg))];
      const value = op === '+' ? p + q : op === '-' ? p - q : op === '·' ? p * q : p / q;
      assert.ok(near(num(keyOf(field)), value), field.label);
      return numberForms(value);
    });
  },
  compositionValues(question) {
    const givens = givensIn(question.prompt);
    const at = (name, input) => givens.find((entry) => entry.name === name && entry.input === input).output;
    return question.answerFields.flatMap((field) => {
      const label = flat(field.label);
      const nested = label.match(/^([a-z])\(([a-z])\(([-\d]+)\)\)$/);
      const value = nested ? at(nested[1], at(nested[2], num(nested[3]))) : at(label[0], num(label.match(/\(([-\d]+)\)/)[1]));
      assert.ok(near(num(keyOf(field)), value), label);
      return numberForms(value);
    });
  },
  contextComposition(question) {
    const defs = defsIn(question.prompt);
    const answers = [];
    for (const field of question.answerFields) {
      const nested = flat(field.label).match(/^([a-z])\(([a-z])\(([-\d.]+)\)\)$/);
      if (!nested) continue;
      const value = defs.get(nested[1]).fn(defs.get(nested[2]).fn(num(nested[3])));
      assert.ok(near(num(keyOf(field)), value), field.label);
      answers.push(...numberForms(value));
    }
    return answers;
  },
  compositionSymbolic(question) {
    const defs = defsIn(question.prompt);
    const F = defs.get('f').fn;
    const G = defs.get('g').fn;
    return question.answerFields.flatMap((field) => {
      const fn = /^\(f∘g\)/.test(flat(field.label)) ? (t) => F(G(t)) : (t) => G(F(t));
      assert.ok(sameFunction(keyFn(field), fn), field.label);
      return polyForms(polyOf(fn));
    });
  },
  inverseVerification(question) {
    const defs = defsIn(question.prompt);
    const F = defs.get('f').fn;
    const G = defs.get('g').fn;
    const identity = sameFunction((t) => F(G(t)), (t) => t) && sameFunction((t) => G(F(t)), (t) => t);
    const answers = [];
    for (const field of question.answerFields) {
      const label = flat(field.label);
      if (/^\((f∘g|g∘f)\)/.test(label)) {
        const fn = label.startsWith('(f∘g)') ? (t) => F(G(t)) : (t) => G(F(t));
        assert.ok(sameFunction(keyFn(field), fn), label);
        answers.push(...polyForms(polyOf(fn)));
      } else {
        assert.equal(/^yes/i.test(keyOf(field)), identity, 'the verdict follows the compositions');
        answers.push(keyOf(field));
      }
    }
    return answers;
  },
  lab(question) {
    const mode = question.mode || 'full';
    const f = question.f || LAB_F;
    const g = question.g || LAB_G;
    const x = question.x ?? 2;
    const [F, G] = [specFn(f), specFn(g)];
    const parts = labParts(mode, f);
    const h = Number(f.h ?? 0);
    const restriction = f.type !== 'quadratic' ? 'none'
      : f.inverseBranch === 'left' || Number(f.domain?.max) === h ? 'left'
        : f.inverseBranch === 'right' || Number(f.domain?.min) === h ? 'right' : 'required';
    const work = { x, fogAnswer: String(F(G(x))), gofAnswer: String(G(F(x))), inverseAnswer: String(x), restrictionChoice: restriction };
    const graded = gradeToolWork({ toolId: 'inverseCompositionLab', question, work });
    const invertible = f.type !== 'quadratic' || restriction === 'left' || restriction === 'right';
    if (invertible) assert.equal(graded.isCorrect, true, 'the shared grader accepts the independently computed work');
    const answers = [];
    if (parts.includes('fog')) answers.push(...numberForms(F(G(x))), ...numberForms(G(F(x))));
    if (parts.includes('inverse') && invertible) answers.push(...numberForms(x));
    if (parts.includes('restriction')) answers.push(restriction);
    return answers;
  },
  derive(question) {
    const f = question.f;
    const a = Number(f.a ?? 1);
    const b = Number(f.k ?? 0) - a * Number(f.h ?? 0);
    const equation = { left: { x: 1 / a, y: 0, c: -b / a }, right: { x: 0, y: 1, c: 0 } };
    assert.equal(gradeToolWork({ toolId: 'inverseCompositionLab', question, work: { equation } }).isCorrect, true, 'the derivation key');
    return [...inverseForms(a, b), ...numberForms(1 / a), ...numberForms(-b / a)];
  },
  ops(question) {
    const [F, G] = [specFn(question.f), specFn(question.g)];
    const operations = question.operations?.length ? question.operations : ['sum', 'difference', 'product', 'quotient'];
    const ascii = (fn) => polyForms(polyOf(fn))[0];
    const responses = {};
    const answers = [];
    let restrictions = '';
    for (const op of operations) {
      const fn = op === 'sum' ? (t) => F(t) + G(t) : op === 'difference' ? (t) => F(t) - G(t) : op === 'product' ? (t) => F(t) * G(t)
        : op === 'composition' ? (question.composeOrder === 'gOfF' ? (t) => G(F(t)) : (t) => F(G(t))) : null;
      if (fn) {
        responses[op] = ascii(fn);
        answers.push(...polyForms(polyOf(fn)));
      } else {
        const unsimplified = `(${ascii(F)})/(${ascii(G)})`;
        answers.push(...variantsOf(unsimplified));
        const roots = [];
        const g = polyOf(G);
        if (g.length === 2) roots.push(-g[0] / g[1]);
        restrictions = roots.join(', ');
        roots.forEach((root) => answers.push(...numberForms(root)));
        // A quotient that divides exactly is keyed (and typed) as the polynomial.
        const remainderFree = roots.length > 0 && roots.every((root) => near(F(root), 0));
        responses.quotient = remainderFree ? ascii((t) => F(t) / G(t)) : unsimplified;
        if (remainderFree) answers.push(...polyForms(polyOf((t) => F(t) / G(t))));
      }
    }
    assert.equal(gradeToolWork({ toolId: 'functionOperationsLab', question, work: { responses, restrictions } }).isCorrect, true, 'the operations key');
    return answers;
  },
};

/* ------------------------------------------------------ the real items */

const compile = (source) => compileAuthoringIntentV5(source).package.sections.flatMap((section) => section.questions);
const ITEMS = [];
const add = (name, question, kind) => ITEMS.push({ name, question, kind });

// The two lessons, compiled as the platform compiles them.
const KIND_BY_PROMPT = [
  [/^Review ordered pairs/, 'inverseRelation'],
  [/^Review the graph relationship y=x/, 'inverseGraph'],
  [/inverse relation of/, 'inverseRelation'],
  [/^Use the inverse property|intersect at a point on y=x/, 'inverseProperty'],
  [/^Use the inverse workspace/, 'lab'],
  [/inverse of f\(x\)|identify f⁻¹|E\(s\)=|C\(h\)=|C\(m\)=/, 'linearInverse'],
  [/pointwise/, 'pointwise'],
  [/evaluate the composition f\(g/, 'compositionValues'],
  [/sum and difference|product \(f·g\)|quotient|product and quotient/, 'operations'],
  [/function machines|composition orders/, 'lab'],
  [/find both compositions/, 'compositionSymbolic'],
  [/retirement deduction/, 'contextComposition'],
  [/are inverses/, 'inverseVerification'],
];
for (const file of ['teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json', 'teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json']) {
  compile(readJson(file)).forEach((question, index) => {
    const kind = KIND_BY_PROMPT.find(([pattern]) => pattern.test(question.prompt))?.[1];
    if (kind) add(`${path.basename(file, '.json')} #${index}`, question, kind);
  });
}

// The raw stored sample items.
readJson('SAMPLE_BATCH_A_DEEP_DIVE.json').questions.filter((question) => question.toolId === 'inverseCompositionLab')
  .forEach((question, index) => add(`batch A lab #${index} (${question.mode})`, question, 'lab'));
readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions.filter((question) => question.toolId === 'inverseCompositionLab')
  .forEach((question, index) => add(`missing tools lab #${index}`, question, 'lab'));

// Authored intents, compiled by the production compiler.
{
  const item = (fields) => ({ standard: 'A2.2B', dok: 2, difficultyBand: 2, ...fields });
  const many = (prompt, responses) => item({ prompt, studentActions: ['multipleResponses'], responses });
  const n = (id, label, answer) => ({ id, label, answer });
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Inverses and composition — authored', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [
        item({ prompt: 'Derive the inverse of f(x)=3x−7 in the derivation lab.', studentActions: ['findInverse'], mode: 'deriveInverse', function: { family: 'linear', m: 3, b: -7 } }),
        item({ prompt: 'Derive the inverse of f(x)=x+4.', studentActions: ['findInverse'], mode: 'deriveInverse', function: { family: 'linear', m: 1, b: 4 } }),
        item({ prompt: 'Derive the inverse of f(x)=−2x.', studentActions: ['findInverse'], mode: 'deriveInverse', function: { family: 'linear', m: -2, b: 0 } }),
        item({ prompt: 'Derive the inverse of f(x)=−5x+15.', studentActions: ['findInverse'], mode: 'deriveInverse', function: { family: 'linear', m: -5, b: 15 } }),
        item({ prompt: 'Decide the restriction, then undo f.', studentActions: ['findInverse'], mode: 'restriction', function: { family: 'quadratic', a: 1, h: 2, k: -1 }, x: 5 }),
        item({ prompt: 'Undo f at the given input.', studentActions: ['findInverse'], mode: 'inverse', function: { family: 'linear', m: 4, b: -1 }, x: -2 }),
        item({ prompt: 'Find the requested operations for f and g.', studentActions: ['functionOperations'], f: { type: 'linear', a: 3, h: 0, k: -2 }, g: { type: 'linear', a: 1, h: 0, k: 4 }, operations: ['add', 'subtract', 'multiply', 'divide'] }),
        item({ prompt: 'Compose and add.', studentActions: ['functionOperations'], f: { type: 'quadratic', a: 1, h: 1, k: -3 }, g: { type: 'linear', a: 2, h: 0, k: 1 }, operations: ['compose', 'add'], composeOrder: 'gOfF' }),
        item({ prompt: 'Divide f by g.', studentActions: ['functionOperations'], f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'linear', a: 1, h: 1, k: 0 }, operations: ['divide'] }),
        item({ prompt: 'Compose f with g.', studentActions: ['functionOperations'], f: { type: 'linear', a: 2, h: 0, k: 1 }, g: { type: 'linear', a: 1, h: 2, k: 0 }, operations: ['compose', 'multiply'] }),
        many('If f(−1)=8 and g(−1)=5, evaluate two pointwise operations.', [n('sum', '(f+g)(−1)', 13), n('difference', '(f−g)(−1)', 3)]),
        many('If f(3)=−6 and g(3)=2, evaluate two pointwise operations.', [n('product', '(f·g)(3)', -12), n('quotient', '(f/g)(3)', -3)]),
        many('If g(1)=7 and f(7)=−2, evaluate the composition f(g(1)).', [n('inside', 'g(1)', 7), n('composition', 'f(g(1))', -2)]),
        many('If g(−3)=0 and f(0)=11, evaluate the composition f(g(−3)).', [n('inside', 'g(−3)', 0), n('composition', 'f(g(−3))', 11)]),
        many('A $50 coupon and a 20% discount can be applied in either order to a $400 jacket. Let c(x)=x−50 and d(x)=0.8x.', [
          n('couponFirst', 'd(c(400))', 280), n('discountFirst', 'c(d(400))', 270),
        ]),
        many('A shop adds a $6 fee and then triples a price, or triples first. Let a(x)=x+6 and m(x)=3x.', [
          n('feeFirst', 'm(a(10))', 48), n('tripleFirst', 'a(m(10))', 36),
        ]),
        many('Use the inverse property. If f(−4)=9, complete the statement about f⁻¹.', [n('input', 'Input to f⁻¹', 9), n('output', 'Output of f⁻¹', -4)]),
        many('Use the inverse property. If f(12)=−5, complete the statement about f⁻¹.', [n('input', 'Input to f⁻¹', -5), n('output', 'Output of f⁻¹', 12)]),
        many('A linear function and its inverse intersect at a point on y=x. If the point is (−3,−3), what must both functions do there?', [
          { id: 'fvalue', label: 'f(−3)', type: 'choice', options: ['−3', '3', '0'], answer: '−3' },
          { id: 'inversevalue', label: 'f⁻¹(−3)', type: 'choice', options: ['−3', '3', '0'], answer: '−3' },
        ]),
        many('Review how inverse graphs are related.', [
          { id: 'role', label: 'For inverse graphs, y=x acts as', type: 'choice', options: ['the reflection line', 'a vertical asymptote', 'the x-axis'], answer: 'the reflection line' },
        ]),
      ],
    }],
  };
  const KINDS = ['derive', 'derive', 'derive', 'derive', 'lab', 'lab', 'ops', 'ops', 'ops', 'ops', 'pointwise', 'pointwise', 'compositionValues', 'compositionValues',
    'contextComposition', 'contextComposition', 'inverseProperty', 'inverseProperty', 'inverseProperty', 'inverseGraph'];
  compile(source).forEach((question, index) => add(`authored #${index} (${KINDS[index]})`, question, KINDS[index]));
}

const answersOf = new Map();
const guardFor = (item) => {
  if (!answersOf.has(item)) {
    const independent = ORACLES[item.kind](item.question);
    answersOf.set(item, [...new Set([...family.expectedValues(item.question), ...questionAnswerValues(item.question), ...independent.map(String)])]);
  }
  return answersOf.get(item);
};

/* --------------------------------- checking a worked sibling, here */

const pieces = (answer) => String(answer).split(/;\s*|\s+and\s+(?=[(A-Za-z])/).map((piece) => piece.trim()).filter(Boolean);
const rhs = (piece) => piece.slice(piece.lastIndexOf('=') + 1).trim();
const letters = (segment) => [...new Set(toMath(segment).replace(/sqrt|log/g, '').match(/[A-Za-z]/g) || [])].sort().join('');

// Every chain a = b = c in a step whose sides are arithmetic, or expressions in
// one and the same letter, is TRUE: the work is right, not only the answer.
const assertStepsTrue = (example, label) => {
  let checked = 0;
  example.steps.forEach((step) => {
    step.split(/[,:;]\s|\.\s|\.$|\s(?:so|then|when|which|because)\s/).forEach((clause) => {
      const segments = clause.split(' = ').map((segment) => segment.trim()).filter(Boolean);
      for (let i = 0; i + 1 < segments.length; i += 1) {
        const [left, right] = [segments[i], segments[i + 1]];
        const [lv, rv] = [letters(left), letters(right)];
        if (lv !== rv || lv.length > 1 || /[⁻¹√∘|_]|log/.test(left + right)) continue;
        if (/[A-Za-z]{2,}/.test(left + right)) continue;
        const values = (segment) => (lv ? SAMPLES.map((t) => fnOf(segment, lv)(t)) : [Number(evaluate(toMath(segment)))]);
        let a;
        let b;
        try { [a, b] = [values(left), values(right)]; } catch { continue; }
        assert.ok(a.every((value, index) => near(value, b[index])), `${label}: "${left} = ${right}" in "${step}"`);
        checked += 1;
      }
    });
  });
  return checked;
};

const VERIFY = {
  linearInverse(example) {
    const [name, def] = [...defsIn(example.prompt)][0];
    const [first, second] = pieces(example.answer);
    assert.match(first, new RegExp(`^${name}⁻¹\\(x\\) = `));
    const inverse = fnOf(rhs(first));
    assert.ok(sameFunction((t) => def.fn(inverse(t)), (t) => t), `${example.answer} undoes ${def.rule}`);
    if (second) {
      const amount = num(example.prompt.match(/when [A-Za-z]\([a-z]\) = ([−\d.]+)/)[1]);
      assert.ok(near(def.fn(num(rhs(second))), amount), 'the value in context');
    }
  },
  inverseRelation(example) {
    const pairs = pairsIn(example.prompt.match(/\{[^}]*\}/)[0]);
    const [set, verdict] = example.answer.split('; ');
    assert.ok(sameSet(pairsIn(set), pairs.map(([x, y]) => [y, x])), 'every pair swapped');
    if (verdict) {
      const inputs = pairs.map(([, y]) => y);
      assert.equal(verdict === 'it is a function', new Set(inputs).size === inputs.length);
    }
  },
  inverseProperty(example) {
    const given = givensIn(example.prompt)[0];
    if (given) assert.deepEqual(givensIn(example.answer.replace('⁻¹', 'INV').replace(/INV/, '')).map(({ input, output }) => [input, output]), [[given.output, given.input]]);
    else {
      const [p] = pairsIn(example.prompt)[0];
      givensIn(example.answer.replace(/⁻¹/g, '')).forEach(({ input, output }) => assert.ok(near(input, p) && near(output, p)));
    }
  },
  inverseGraph(example) {
    const [p, q] = pairsIn(example.prompt)[0];
    assert.deepEqual(pairsIn(example.answer)[0], [q, p]);
  },
  operations(example) {
    const defs = defsIn(example.prompt);
    const F = defs.get('f').fn;
    const G = defs.get('g').fn;
    let checked = 0;
    pieces(example.answer).forEach((piece) => {
      const label = flat(piece.split(' = ')[0]);
      const ops = { '(f+g)(x)': (t) => F(t) + G(t), '(f-g)(x)': (t) => F(t) - G(t), '(f·g)(x)': (t) => F(t) * G(t), '(f/g)(x)': (t) => F(t) / G(t), '(f∘g)(x)': (t) => F(G(t)), '(g∘f)(x)': (t) => G(F(t)) };
      if (ops[label]) {
        assert.ok(sameFunction(fnOf(rhs(piece)), ops[label], [-3.5, 0.5, 1.5, 7.25]), `${piece}`);
        checked += 1;
      } else if (/^excluded/.test(piece)) {
        rhs(piece).split(', ').forEach((root) => assert.ok(near(G(num(root)), 0), `${piece} zeroes g`));
      } else if (/^degree/.test(piece)) {
        assert.equal(Number(piece.split(' ')[1]), degreeOf((t) => F(t) * G(t)));
      }
    });
    assert.ok(checked >= 1);
  },
  pointwise(example) {
    const givens = givensIn(example.prompt);
    const [p, q] = [givens[0].output, givens[1].output];
    pieces(example.answer).forEach((piece) => {
      const op = flat(piece).match(/^\(f([+\-·/])g\)/)[1];
      const value = op === '+' ? p + q : op === '-' ? p - q : op === '·' ? p * q : p / q;
      assert.ok(near(num(rhs(piece)), value), piece);
    });
  },
  compositionValues(example) {
    const givens = givensIn(example.prompt);
    const at = (name, input) => givens.find((entry) => entry.name === name && entry.input === input)?.output;
    pieces(example.answer).forEach((piece) => {
      const label = flat(piece.split(' = ')[0]);
      const nested = label.match(/^([a-z])\(([a-z])\(([-\d]+)\)\)$/);
      const value = nested ? at(nested[1], at(nested[2], num(nested[3]))) : at(label[0], num(label.match(/\(([-\d]+)\)/)[1]));
      assert.ok(near(num(rhs(piece)), value), piece);
    });
  },
  contextComposition(example) {
    const defs = defsIn(example.prompt);
    pieces(example.answer).forEach((piece) => {
      const [, outer, inner, arg] = flat(piece.split(' = ')[0]).match(/^([a-z])\(([a-z])\(([-\d.]+)\)\)$/);
      assert.ok(near(num(rhs(piece)), defs.get(outer).fn(defs.get(inner).fn(num(arg)))), piece);
    });
  },
  compositionSymbolic(example) { VERIFY.operations(example); },
  inverseVerification(example) {
    const defs = defsIn(example.prompt);
    const F = defs.get('f').fn;
    const G = defs.get('g').fn;
    const [fog, gof, verdict] = example.answer.split('; ');
    assert.ok(sameFunction(fnOf(rhs(fog), 't'), (t) => F(G(t))), fog);
    assert.ok(sameFunction(fnOf(rhs(gof), 't'), (t) => G(F(t))), gof);
    const identity = sameFunction((t) => F(G(t)), (t) => t) && sameFunction((t) => G(F(t)), (t) => t);
    assert.equal(verdict, identity ? 'f and g are inverses' : 'f and g are not inverses');
  },
  lab(example) {
    const defs = defsIn(example.prompt);
    const F = defs.get('f').fn;
    if (/Keep x/.test(example.answer)) {
      const [, side, h] = example.answer.match(/Keep x ([≤≥]) ([−\d]+)/);
      const [inverse] = givensIn(example.answer.replace(/⁻¹/g, ''));
      assert.ok(near(F(inverse.output), inverse.input), 'f of the recovered input is the given output');
      assert.ok(side === '≥' ? inverse.output >= num(h) : inverse.output <= num(h), 'the recovered input is on the kept side');
      assert.ok(near(F(num(h) + 1), F(num(h) - 1)), 'the kept side is split at the vertex');
      return;
    }
    const G = defs.get('g')?.fn;
    pieces(example.answer).forEach((piece) => {
      const label = flat(piece.split(' = ')[0]);
      const value = num(rhs(piece));
      const [, X] = label.match(/\)\(([-\d.]+)\)$|\(([-\d.]+)\)$/) || [];
      if (label.startsWith('(f∘g)')) assert.ok(near(value, F(G(num(label.match(/\(([-\d.]+)\)$/)[1])))), piece);
      else if (label.startsWith('(g∘f)')) assert.ok(near(value, G(F(num(label.match(/\(([-\d.]+)\)$/)[1])))), piece);
      else {
        const y = num(label.match(/⁻¹\(([-\d.]+)\)/)[1]);
        assert.ok(near(F(value), y), `${piece}: f(${value}) = ${y}`);
      }
      void X;
    });
  },
  derive(example) { VERIFY.linearInverse(example); },
  ops(example) { VERIFY.operations(example); },
};

/* ---------------------------------------------------------------- tests */

test('the corpus covers every sub-kind the family claims, several times each', () => {
  const counts = {};
  ITEMS.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  const labModes = new Set(ITEMS.filter((item) => item.kind === 'lab').map((item) => item.question.mode || 'full'));
  assert.deepEqual([...labModes].sort(), ['composition', 'full', 'inverse', 'restriction']);
  Object.keys(ORACLES).forEach((kind) => assert.ok(counts[kind] >= 2, `${kind}: ${counts[kind] || 0} items`));
  ['linearInverse', 'inverseRelation', 'inverseProperty', 'lab', 'derive', 'ops', 'operations', 'compositionSymbolic', 'inverseVerification', 'pointwise', 'compositionValues', 'contextComposition']
    .forEach((kind) => assert.ok(counts[kind] >= 3, `${kind}: several items (${counts[kind]})`));
  assert.ok(ITEMS.length >= 60, `${ITEMS.length} items`);
});

test('every real item is owned by this family, as the right sub-kind, and only by this family', () => {
  for (const item of ITEMS) {
    assert.equal(family.matches(item.question), true, item.name);
    assert.equal(family.questionKind(item.question), item.kind, `${item.name}: read as ${item.kind}`);
    assert.equal(familyFor(item.question), family, `${item.name}: no earlier family claims it`);
  }
});

test('what is not inverse, composition or operation work is not claimed', () => {
  const l3 = compile(readJson('teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json'));
  const l4 = compile(readJson('teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json'));
  const batchC = readJson('SAMPLE_BATCH_C_DEEP_DIVE.json').questions;
  const notOurs = [
    ['domain and range of f(x)=3x+2', l3.find((question) => /domain and range/.test(question.prompt))],
    ...l4.filter((question) => question.type === 'polynomialWorkshop').map((question) => ['the area-model product (polynomialWorkshop)', question]),
    ...batchC.filter((question) => question.toolId === 'exponentialLogBridge').map((question) => [`exponentialLogBridge ${question.mode}`, question]),
    ['a bare evaluation', { type: 'multiAnswer', prompt: 'Evaluate.', answerFields: [{ id: 'eval', label: 'If f(x)=2x−5, then f(4)=', answer: 3 }] }],
    ['an additive inverse', { type: 'multiAnswer', prompt: 'Find the additive inverse of 5.', answerFields: [{ id: 'a', label: 'Additive inverse', answer: '-5' }] }],
    ['inverse operations in an equation', { type: 'multiAnswer', prompt: 'Use inverse operations to solve 3x + 5 = 20.', answerFields: [{ id: 'x', label: 'x', answer: '5' }] }],
    ['a step algebra equation', { type: 'stepAlgebra', prompt: 'Apply the inverse operation to both sides.', equation: '3x + 5 = 20' }],
    ['an ordered-pair system', { type: 'system', prompt: 'Solve.', solution: [1, 2] }],
    ['nothing', null],
  ];
  for (const [name, question] of notOurs) {
    assert.ok(name === 'nothing' || question, `${name} exists`);
    assert.equal(family.matches(question), false, name);
    assert.deepEqual(family.hints(question), [], name);
    assert.equal(family.similarProblem(question), null, name);
    assert.equal(family.backUpQuestion(question), null, name);
  }
});

test('expectedValues carries the answer in the spellings a hint could leak', () => {
  for (const item of ITEMS) {
    const values = family.expectedValues(item.question);
    assert.ok(values.length, `${item.name}: some answers`);
    // Every key the question carries, as written.
    (item.question.answerFields || []).forEach((field) => {
      answerCandidatesForField(field).forEach((key) => assert.ok(values.includes(String(key)), `${item.name}: key ${key}`));
    });
    // And every answer computed here independently — in this file's own
    // spellings — is one the platform's guard would catch with the family's
    // list alone (long decimals like 0.333333x aside: no hint writes those).
    ORACLES[item.kind](item.question).map(String).filter((value) => !/\.\d{4,}/.test(value)).forEach((value) => {
      assert.equal(hintRevealsAnswer(`Look: ${value}.`, values), true, `${item.name}: ${value} is caught by ${JSON.stringify(values.slice(0, 10))}`);
    });
  }
  // The lab's numeric parts, and the restriction choice by id and label.
  const restriction = ITEMS.find((item) => item.name === 'batch A lab #1 (restriction)');
  ['5', 'right', 'Use the right branch (x ≥ vertex x)'].forEach((value) => assert.ok(family.expectedValues(restriction.question).includes(value), value));
  const inverse = ITEMS.find((item) => /x\+7\)\/3/.test(JSON.stringify(item.question.answerFields || '')));
  ['(x+7)/3', '(x + 7)/3', '(1/3)x + 7/3'].forEach((value) => assert.ok(family.expectedValues(inverse.question).includes(value), value));
});

test('hints: 2–4 sentences from this problem, none of which names or narrows the answer', () => {
  let specific = 0;
  for (const item of ITEMS) {
    const hints = family.hints(item.question);
    assert.ok(hints.length >= 2 && hints.length <= 4, `${item.name}: ${hints.length} hints`);
    const guard = guardFor(item);
    hints.forEach((hint) => {
      assert.equal(typeof hint, 'string');
      assert.equal(hintRevealsAnswer(hint, guard), false, `${item.name}: "${hint}" leaks an answer`);
      // No verdict word, whichever verdict is right.
      assert.doesNotMatch(hint, /\b(yes|no|none|left|right|required)\b/i, `${item.name}: "${hint}" carries a verdict word`);
      assert.doesNotMatch(hint, /the reflection line/i, item.name);
    });
    // Built from this problem: a hint quotes a number or a rule the student sees.
    const visible = `${item.question.prompt || ''} ${JSON.stringify(item.question.f || '')} ${(item.question.answerFields || []).map((field) => field.label).join(' ')}`;
    const visibleNumbers = new Set((visible.replace(/[−]/g, '-').match(/\d+(?:\.\d+)?/g) || []));
    if (hints.some((hint) => (hint.replace(/[−]/g, '-').match(/\d+(?:\.\d+)?/g) || []).some((value) => visibleNumbers.has(value)))) specific += 1;
    // The platform ladder carries them (after the leak guard).
    const ladder = buildQuestionHints(item.question).filter((hint) => hint.source === 'family').map((hint) => hint.text);
    hints.forEach((hint) => assert.ok(ladder.includes(hint), `${item.name}: buildQuestionHints keeps "${hint}"`));
  }
  assert.ok(specific >= ITEMS.length * 0.7, `most hint ladders quote the problem's own numbers (${specific}/${ITEMS.length})`);
});

test('an "are they inverses?" item never writes a bare x or a verdict, whichever verdict is right', () => {
  const yes = ITEMS.filter((item) => item.kind === 'inverseVerification');
  assert.ok(yes.length >= 3);
  for (const item of yes) {
    // The same item with g changed so the two are NOT inverses: its answers are
    // no longer "x" and yes, but the hints must have the same shape.
    const notInverse = {
      ...item.question,
      prompt: item.question.prompt.replace(/g\(x\)=[^ ]+/, 'g(x)=x+9'),
      answerFields: item.question.answerFields.map((field) => (/inverse|conclusion/i.test(field.id + field.label)
        ? { ...field, answer: field.options[field.options.length - 1] }
        : { ...field, answer: 'x+1' })),
    };
    assert.equal(family.questionKind(notInverse), 'inverseVerification');
    const [a, b] = [family.hints(item.question), family.hints(notInverse)];
    assert.equal(a.length, b.length, item.name);
    assert.equal(a[0], b[0], `${item.name}: the opening hint does not depend on the verdict`);
    [...a, ...b].forEach((hint) => assert.doesNotMatch(hint, /(^|[^\w])x($|[^\w])/, `${item.name}: "${hint}" writes x`));
  }
});

test('a hint whose numbers coincide with an answer falls back to a wording without them', () => {
  // f(x) = 2x + 4 at x = 4: "subtract 4" and "f(4)" would both name the answer 4.
  const question = { type: 'inverseCompositionLab', mode: 'inverse', f: { type: 'linear', a: 2, h: 0, k: 4 }, x: 4 };
  const hints = family.hints(question);
  assert.ok(hints.length >= 2);
  hints.forEach((hint) => assert.equal(hintRevealsAnswer(hint, ['4']), false, hint));
  assert.ok(hints.some((hint) => /reverse its steps/.test(hint)), 'still names the move');
  // The same lab with x = 3 quotes this f's own steps.
  assert.ok(family.hints({ ...question, x: 3 }).some((hint) => hint.includes('subtract 4, then divide by 2')));
});

test('similarProblem: a fully worked sibling of the same kind, with different numbers and a different, correct answer', () => {
  let offeredAcrossSeeds = 0;
  let different = 0;
  let checkedSteps = 0;
  for (const item of ITEMS) {
    const example = family.similarProblem(item.question, { seed: 0 });
    assert.ok(example, `${item.name}: a sibling`);
    assert.ok(example.prompt && example.steps.length >= 2 && example.answer, item.name);
    // Its answer, recomputed here from its own prompt.
    VERIFY[item.kind](example);
    checkedSteps += assertStepsTrue(example, item.name);
    // Never this problem: a different prompt and answer, and no part names one of this question's answers.
    assert.notEqual(example.prompt, item.question.prompt, item.name);
    const guard = guardFor(item);
    [example.prompt, ...example.steps, example.answer].forEach((piece) => assert.equal(hintRevealsAnswer(piece, guard), false, `${item.name}: "${piece}" names this answer`));
    assert.ok(!guard.some((value) => value.toLowerCase() === example.answer.toLowerCase()), `${item.name}: a different answer`);
    // Deterministic from the seed; another seed, another sibling.
    assert.deepEqual(family.similarProblem(item.question, { seed: 0 }), example);
    if (JSON.stringify(family.similarProblem(item.question, { seed: 1 })) !== JSON.stringify(example)) different += 1;
    for (let seed = 1; seed <= 3; seed += 1) {
      const other = family.similarProblem(item.question, { seed });
      if (other) { VERIFY[item.kind](other); offeredAcrossSeeds += 1; }
    }
    assert.ok(buildSimilarWorkedExample(item.question), `${item.name}: the platform offers it`);
  }
  assert.ok(different >= ITEMS.length * 0.9, `another seed gives another sibling (${different}/${ITEMS.length})`);
  assert.ok(offeredAcrossSeeds >= ITEMS.length * 3 * 0.95, `siblings are offered across seeds (${offeredAcrossSeeds})`);
  assert.ok(checkedSteps >= ITEMS.length, `the worked steps' own equations are checked (${checkedSteps})`);
});

test('the sibling is the same kind of problem', () => {
  for (const item of ITEMS) {
    const example = family.similarProblem(item.question, { seed: 2 });
    const { kind } = item;
    if (kind === 'linearInverse' || kind === 'derive') assert.match(example.prompt, /inverse/i, item.name);
    if (kind === 'inverseRelation') assert.match(example.prompt, /^Find the inverse relation of \{/, item.name);
    if (kind === 'operations' || kind === 'ops') assert.match(example.prompt, /^Given f\(x\) = .* and g\(x\) = /, item.name);
    if (kind === 'compositionSymbolic') assert.match(example.answer, /\(f ∘ g\)\(x\) = .*\(g ∘ f\)\(x\) = /, item.name);
    if (kind === 'inverseVerification') assert.match(example.prompt, /^Determine whether f\(t\) = .* are inverses\.$/, item.name);
    if (kind === 'pointwise') assert.match(example.answer, /^\(f [+−·/] g\)\(/, item.name);
    if (kind === 'compositionValues' || kind === 'contextComposition') assert.match(example.answer, /[a-z]\([a-z]\([−\d.]+\)\) = /, item.name);
    if (kind === 'lab' && (item.question.mode || 'full') === 'composition') assert.match(example.prompt, /Find \(f ∘ g\)\(.*\) and \(g ∘ f\)/, item.name);
    if (kind === 'lab' && item.question.mode === 'restriction' && item.question.f?.type === 'quadratic') assert.match(example.prompt, /domain kept to x [≤≥]/, item.name);
  }
});

test('an "are they inverses?" sibling is an inverse pair or not by the seed alone', () => {
  const item = ITEMS.find((entry) => entry.kind === 'inverseVerification');
  const verdicts = new Set();
  for (let seed = 0; seed < 12; seed += 1) {
    const example = family.similarProblem(item.question, { seed });
    VERIFY.inverseVerification(example);
    verdicts.add(example.answer.split('; ')[2]);
    assert.doesNotMatch([example.prompt, ...example.steps, example.answer].join(' '), /(^|[^\w])x($|[^\w])|\byes\b/i, 'written in t, with no verdict word');
  }
  assert.deepEqual([...verdicts].sort(), ['f and g are inverses', 'f and g are not inverses']);
});

test('backUpQuestion: two choices about this problem’s first move, the conventional one correct, no answer in it', () => {
  let specific = 0;
  for (const item of ITEMS) {
    const step = family.backUpQuestion(item.question);
    assert.ok(step, item.name);
    assert.equal(step.options.length, 2, item.name);
    assert.notEqual(step.options[0], step.options[1], item.name);
    assert.ok(step.options.includes(step.correct), `${item.name}: the correct option is offered`);
    const guard = guardFor(item);
    [step.prompt, ...step.options].forEach((piece) => assert.equal(hintRevealsAnswer(piece, guard), false, `${item.name}: "${piece}"`));
    if (/\d|[fg]\(x\) = /.test(step.prompt)) specific += 1;
    assert.equal(backUpStepFor(item.question).source, 'family', `${item.name}: the inclusion step uses it`);
  }
  assert.ok(specific >= ITEMS.length * 0.5, `many back-up steps quote this problem (${specific}/${ITEMS.length})`);
});

test('the back-up step points the right way for each first move', () => {
  const find = (pattern) => ITEMS.find((item) => pattern.test(item.question.prompt || '')).question;
  assert.equal(family.backUpQuestion(find(/^Find the inverse of f\(x\)=3x−7/)).correct, 'Add 7 to both sides');
  assert.equal(family.backUpQuestion(find(/^Find the inverse of f\(x\)=12−9x/)).correct, 'Subtract 12 from both sides');
  assert.equal(family.backUpQuestion(find(/undo f\(x\)=2x\+3/)).correct, 'Subtract 3');
  assert.equal(family.backUpQuestion(find(/evaluate the composition f\(g\(4\)\)/)).correct, 'g, the inside function');
  assert.equal(family.backUpQuestion(find(/write the quotient function/)).correct, 'Inputs that make g(x) zero');
  assert.equal(family.backUpQuestion(find(/Derive the inverse of f\(x\)=3x−7/)).correct, 'Swap x and y');
  assert.equal(family.backUpQuestion(find(/retirement deduction/)).correct, 'r, the inside function');
});
