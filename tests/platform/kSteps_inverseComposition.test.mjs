/*
 * JOB K — THE inverseComposition FAMILY'S WORKED SOLUTION OF THE QUESTION ITSELF.
 *
 * workedSolution(question) is what the closed-question review panel shows when
 * an inverse / composition item has no authored solution steps
 * (closedQuestionReview.js). This file draws every shape the family claims —
 * the two Algebra II Honors lessons compiled by the production V5 compiler,
 * authored V5 intents for the rarer shapes, and seeded instances of every
 * multiAnswer kind (linearInverse with its slope / check / composition-check /
 * value-in-context fields, inverseRelation, inverseProperty, inverseGraph,
 * operations with the product's degree and the quotient's excluded input,
 * pointwise, compositionValues, contextComposition, compositionSymbolic,
 * inverseVerification) and of the three tools (the derivation lab, the
 * inverse / composition lab on lines, the operations workbench) — plus edges:
 * a slope of ±1, a zero intercept, negative and decimal coefficients, a
 * fraction-form rule, a pair that is not inverse, a non-function inverse
 * relation.
 *
 * Everything is recomputed here, never with the family's helpers: rules are
 * read from the prompt by this file's own pattern and evaluated with mathjs.
 *   - every chain "a = b = c" a step writes, in numbers or one letter, is true
 *     (checked at sample values); the derivation's equations all hold on the
 *     swapped relation x = f(y);
 *   - each field's stated answer is this file's own answer for that field, and
 *     the shared grader (gradeMultiAnswerResponse, or gradeToolWork for the
 *     tools) marks every stated answer right;
 *   - the last step is "So " + the answer summary;
 *   - no "+ -3", "1x", "--", "-0", NaN, undefined or Infinity.
 *
 * Mutation-checked (each undone in inverseComposition.js, seen red, restored
 * byte for byte):
 *   - derivation() divided by a instead of writing 1/a's polynomial (poly
 *     [-b / a, a]) → the stated inverse is not f⁻¹ and the grader check fails;
 *   - linearAt in the lab printed b with the wrong sign → a chain is false;
 *   - compositionChain dropped the term-by-term line's last piece → a chain
 *     "… = …" is false;
 *   - the 'verdict' case always said "yes" → the non-inverse pairs are not
 *     explained (their key is "no") and the sweep fails;
 *   - the final "So …" line was dropped → the last-step assertion fails;
 *   - the SLOPPY guard was emptied and a step was made to print "+ −3" → the
 *     hygiene assertion fails;
 *   - the field grader check (accepts) was loosened and every number field
 *     stated value + 1 → the chain check fails; with the chain and oracle
 *     checks also switched off, the shared grader's check still fails;
 *   - the slope step wrote a fraction divisor bare ("1 ÷ 2/3 = 3/2") → the
 *     division-as-written check fails;
 *   - an identity rule echoed its value ("r(900) = 900 = 900") or an authored
 *     zero term was kept ("y = x + 0") → the hygiene assertion fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as family from '../../src/platform/supports/families/inverseComposition.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ this file's own math */

const math = create(all);
const SAMPLES = [-3, -0.5, 1.5, 4, 7];
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const ascii = (raw) => String(raw).replace(/[−–]/g, '-');
const toMath = (raw) => ascii(raw).trim().replace(/\.$/, '').replace(/[·×]/g, '*').replace(/÷/g, '/')
  .replace(/²/g, '^2').replace(/³/g, '^3').replace(/ˣ/g, '^x');
const evalAt = (expression, scope = {}) => Number(math.evaluate(toMath(expression), scope));
const fnOf = (rule, variable = 'x') => (value) => evalAt(rule, { [variable]: value });
const sameFunction = (f, g, samples = SAMPLES) => samples.every((t) => near(f(t), g(t)));
const letters = (segment) => [...new Set(toMath(segment).match(/[A-Za-z]/g) || [])].sort().join('');

/** name(v) = rule, read from a text with this file's own pattern. */
const defsIn = (source) => {
  const out = new Map();
  for (const [, name, variable, rule] of String(source).matchAll(/(?<![A-Za-z])([A-Za-z])\(([a-z])\)\s*=\s*(.+?)(?=\s+(?:and|where|at|are|is|by|to|with|for)\b|,|\.\s|\.$|$)/g)) {
    if (!out.has(name) && new RegExp(variable).test(rule) && !/=/.test(rule)) out.set(name, { variable, rule, fn: fnOf(rule, variable) });
  }
  return out;
};
const givensIn = (source) => [...ascii(source).matchAll(/(?<![A-Za-z⁻¹])([A-Za-z])\((-?\d+(?:\.\d+)?)\)\s*=\s*(-?\d+(?:\.\d+)?)/g)]
  .map(([, name, input, output]) => ({ name, input: Number(input), output: Number(output) }));
const pairsIn = (source) => [...ascii(source).matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
/** The degree of a polynomial in x, from its values (finite differences). */
const degreeOf = (fn) => {
  let row = [0, 1, 2, 3, 4, 5].map(fn);
  for (let degree = 0; degree <= 5; degree += 1) {
    if (row.every((value) => near(value, row[0]))) return degree;
    row = row.slice(1).map((value, index) => value - row[index]);
  }
  return 6;
};

/* ------------------------------------------------------------ checking the steps */

const HYGIENE = [/\+\s*[-−]/, /[-−]\s*[-−]\s*\d/, /--|−−/, /(?<![\d.)⁻])1[a-z](?![a-z])/, /NaN|undefined|Infinity|\bnull\b|\[object/, /(?<![\d.])[-−]0(?![\d./])/,
  // A coefficient of 0 or 1 before a bracket (1(-8)², 0(-8)), a zero term after a variable (x + 0, x² + 0), a value echoed (1000 = 1000).
  /(?<![\d.])[01]\(/, /[a-z²³] [+\-−] 0(?!\d|\.\d)/, /= ([-−]?[\d.]+) = \1(?![\d.\w(/²³])/];

/** Every chain "a = b" whose sides are numbers, or expressions in one and the same letter, is true. */
const assertChainsTrue = (steps, label) => {
  let checked = 0;
  steps.forEach((step) => {
    step.split(/[,:;]\s|\.\s|\.$|\s(?:so|then|when|which|because|and)\s/).forEach((clause) => {
      const segments = clause.split(' = ').map((segment) => segment.trim()).filter(Boolean);
      for (let index = 0; index + 1 < segments.length; index += 1) {
        const [left, right] = [segments[index], segments[index + 1]];
        if ([left, right].some((side) => /[⁻¹∘|√{}$]|[A-Za-z]\(|[A-Za-z]{2,}/.test(side))) continue;
        const [lv, rv] = [letters(left), letters(right)];
        if (lv !== rv || lv.length > 1) continue;
        let a;
        let b;
        try {
          a = lv ? SAMPLES.map((t) => evalAt(left, { [lv]: t })) : [evalAt(left)];
          b = lv ? SAMPLES.map((t) => evalAt(right, { [lv]: t })) : [evalAt(right)];
        } catch { continue; }
        if (![...a, ...b].every(Number.isFinite)) continue;
        assert.ok(a.every((value, at) => near(value, b[at])), `${label}: "${left} = ${right}" is false in "${step}"`);
        checked += 1;
      }
    });
    // A division written inside a sentence ("its slope is 1 ÷ (2/3) = 3/2") is true as written, by order of operations.
    for (const [, left, right] of ascii(step).matchAll(/((?:-?[\d.]+|\([^()]+\))(?:\s*÷\s*(?:-?[\d./]+|\([^()]+\)))+)\s*=\s*(-?[\d.]+(?:\/\d+)?)(?=[.,;]?(?:\s|$))/g)) {
      assert.ok(near(evalAt(left), evalAt(right)), `${label}: "${left} = ${right}" is false as written in "${step}"`);
      checked += 1;
    }
  });
  return checked;
};

/** The derivation: after "swap x and y: x = R(y)" every equation of x and y holds on x = R(y). */
const assertDerivationHolds = (steps, f, variable, label) => {
  const start = steps.findIndex((step) => /swap x and y: x = |Let x stand for the output of/.test(step));
  assert.ok(start >= 0, `${label}: the derivation starts from the swap`);
  const out = variable === 'x' ? 'y' : variable;
  const swapped = /: x = (.+)\.$/.exec(steps[start])[1];
  assert.ok(sameFunction(fnOf(swapped, out), f), `${label}: the swap writes x = f(${out}): ${steps[start]}`);
  let checked = 0;
  steps.slice(start + 1).forEach((step) => {
    const equation = /^(?:Add|Subtract|Divide|Multiply)[^:]*: (.+) = (.+)\.$/.exec(step);
    if (!equation) return;
    SAMPLES.forEach((t) => {
      const scope = { x: f(t), [out]: t };
      assert.ok(near(evalAt(equation[1], scope), evalAt(equation[2], scope)), `${label}: "${step}" does not hold on x = f(${out})`);
    });
    checked += 1;
  });
  return checked;
};

const assertClean = (worked, label) => [worked.headline, ...worked.steps, worked.answerSummary]
  .forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: hygiene in "${line}"`)));

/** The closing line states exactly the summary. */
const assertLastIsSummary = (worked, label) => {
  const last = worked.steps.at(-1);
  assert.equal(last.toLowerCase(), `so ${worked.answerSummary}.`.toLowerCase(), `${label}: the last step is the answer`);
};

/** Each field's stated answer, read back out of the summary in field order. */
const statedAnswers = (question, worked, label) => {
  const pieces = worked.answerSummary.split('; ');
  assert.equal(pieces.length, question.answerFields.length, `${label}: one answer per field: ${worked.answerSummary}`);
  return Object.fromEntries(question.answerFields.map((field, index) => {
    const piece = pieces[index];
    const raw = String(field.label || field.id);
    const forms = [raw, raw.replace(/[:?]\s*$/, '')].flatMap((form) => [form, `${form[0].toLowerCase()}${form.slice(1)}`, `${form[0].toUpperCase()}${form.slice(1)}`]);
    const prefix = forms.flatMap((form) => [`${form} = `, `${form}: `, `${form} `]).find((candidate) => piece.startsWith(candidate));
    assert.ok(prefix, `${label}: "${piece}" names the field "${raw}"`);
    return [field.id, piece.slice(prefix.length)];
  }));
};

/* ------------------------------------------------------------ the oracle */

/** The true answer of every field, from the prompt alone; each stated answer must be it. */
const assertFieldTruth = (question, stated, label) => {
  const prompt = question.prompt;
  const defs = defsIn(prompt);
  const givens = givensIn(prompt);
  const at = (name, input) => {
    if (defs.has(name)) return defs.get(name).fn(input);
    const given = givens.find((entry) => entry.name === name && near(entry.input, input));
    assert.ok(given, `${label}: ${name}(${input}) is given`);
    return given.output;
  };
  const relation = /\{([^{}]*)\}/.exec(prompt) ? pairsIn(/\{([^{}]*)\}/.exec(prompt)[1]) : [];
  const linear = [...defs.entries()].find(([, entry]) => degreeOf(entry.fn) === 1);
  const sameNumber = (text, value) => assert.ok(near(evalAt(text), value), `${label}: stated ${text}, expected ${value}`);
  question.answerFields.forEach((field) => {
    const answer = stated[field.id];
    const flat = ascii(field.label).replace(/\s+/g, '');
    let match;
    if ((match = /^\(([a-z])([+\-·/∘])([a-z])\)\(([a-z]|-?\d+(?:\.\d+)?)\)$/.exec(flat))) {
      const [, L, op, R, arg] = match;
      if (/^[a-z]$/.test(arg)) {
        const F = defs.get(L).fn;
        const G = defs.get(R).fn;
        const truth = { '+': (t) => F(t) + G(t), '-': (t) => F(t) - G(t), '·': (t) => F(t) * G(t), '/': (t) => F(t) / G(t), '∘': (t) => F(G(t)) }[op];
        const samples = op === '/' ? [-3.5, 0.5, 1.5, 7.25] : SAMPLES;
        assert.ok(sameFunction(fnOf(answer), truth, samples), `${label}: ${field.label} = ${answer}`);
      } else {
        const [p, q] = [at(L, Number(arg)), at(R, Number(arg))];
        sameNumber(answer, { '+': p + q, '-': p - q, '·': p * q, '/': p / q }[op]);
      }
    } else if ((match = /^([a-z])\(([a-z])\((-?\d+(?:\.\d+)?)\)\)$/.exec(flat))) {
      sameNumber(answer, at(match[1], at(match[2], Number(match[3]))));
    } else if ((match = /^([a-z])⁻¹\((-?\d+(?:\.\d+)?)\)$/.exec(flat))) {
      const point = pairsIn(prompt).find(([x, y]) => x === y);
      sameNumber(answer, point[0]);
    } else if ((match = /^If([a-z])\(x\)=(.+),then[a-z]\((-?\d+)\)=$/.exec(flat))) {
      sameNumber(answer, fnOf(match[2])(Number(match[3])));
    } else if ((match = /^([a-z])\((-?\d+(?:\.\d+)?)\)=?$/.exec(flat))) {
      const point = pairsIn(prompt).find(([x, y]) => x === y);
      sameNumber(answer, point && /y\s*=\s*x/.test(prompt) ? point[0] : at(match[1], Number(match[2])));
    } else if (/⁻¹\([a-z]\)|inverserule/i.test(flat)) {
      const [, def] = linear;
      assert.ok(sameFunction((t) => def.fn(fnOf(answer)(t)), (t) => t), `${label}: ${answer} undoes ${def.rule}`);
    } else if (/slopeof[a-z]⁻¹/i.test(flat)) {
      const [, def] = linear;
      sameNumber(answer, 1 / (def.fn(1) - def.fn(0)));
    } else if ((match = /^If([a-z])\((-?\d+)\)=(-?\d+),then$/.exec(flat))) {
      assert.equal(ascii(answer).replace(/\s+/g, ''), `${match[1]}⁻¹(${match[3]})=${match[2]}`, `${label}: the check statement swaps the pair`);
    } else if (/whichcomposition/i.test(flat)) {
      assert.match(answer.replace(/\s+/g, ''), /^([a-z])\(\1⁻¹\(x\)\)$|^([a-z])⁻¹\(\2\(x\)\)$/, `${label}: a composition of f and f⁻¹`);
    } else if (/inverserelation$/i.test(flat)) {
      const swapped = relation.map(([x, y]) => [y, x]);
      const keyed = pairsIn(answer);
      assert.ok(keyed.length === swapped.length && swapped.every(([x, y]) => keyed.some(([p, q]) => p === x && q === y)), `${label}: every pair swapped: ${answer}`);
    } else if (/swappedorderedpair/i.test(flat)) {
      const [[x, y]] = pairsIn(field.label);
      assert.deepEqual(pairsIn(answer), [[y, x]], `${label}: ${answer}`);
    } else if (/whatwasdone|inverserelationsaremadeby/i.test(flat)) {
      assert.match(answer, /swap/i, label);
    } else if (/afunction\?$/i.test(flat)) {
      const inputs = relation.map(([, y]) => y);
      assert.equal(/^yes/i.test(answer), new Set(inputs).size === inputs.length, `${label}: function test`);
    } else if (/^(input|output)(?:to|of)([a-z])⁻¹$/i.test(flat)) {
      const [given] = givens;
      sameNumber(answer, /^input/i.test(flat) ? given.output : given.input);
    } else if (/excluded/i.test(flat)) {
      const G = defs.get('g').fn;
      assert.ok(near(G(evalAt(answer)), 0), `${label}: ${answer} zeroes the denominator`);
    } else if (/degree/i.test(flat)) {
      assert.equal(evalAt(answer), degreeOf((t) => defs.get('f').fn(t) * defs.get('g').fn(t)), label);
    } else if (/whichorder/i.test(flat)) {
      const nested = question.answerFields.map((other) => /^([a-z])\(([a-z])\((-?\d+(?:\.\d+)?)\)\)$/.exec(ascii(other.label).replace(/\s+/g, ''))).filter(Boolean);
      const values = nested.map(([, outer, inner, arg]) => [`${outer}∘${inner}`, at(outer, at(inner, Number(arg)))]);
      const [larger] = [...values].sort((p, q) => q[1] - p[1]);
      assert.ok(answer.replace(/\s+/g, '').includes(larger[0]), `${label}: ${answer} names ${larger[0]}`);
    } else if (/inverses\??$|^conclusion$/i.test(flat)) {
      const F = defs.get('f').fn;
      const G = defs.get('g').fn;
      const identity = sameFunction((t) => F(G(t)), (t) => t) && sameFunction((t) => G(F(t)), (t) => t);
      assert.equal(/^yes/i.test(answer), identity, `${label}: the verdict follows the compositions`);
    } else if (/inversegraphs?/i.test(flat)) {
      assert.match(answer, /reflect/i, label);
    } else if (/^slopeofy=x$/i.test(flat)) {
      sameNumber(answer, 1);
    } else if (typeof field.answer === 'number') {
      // A value in context: the input whose output is the label's amount.
      const [, def] = linear;
      const amount = Number(/\$(\d+)/.exec(field.label)[1]);
      assert.ok(near(def.fn(evalAt(answer)), amount), `${label}: ${def.rule} at ${answer} is ${amount}`);
    } else {
      assert.fail(`${label}: no oracle for "${field.label}"`);
    }
  });
};

/* ------------------------------------------------------------ the instances */

const compile = (source) => compileAuthoringIntentV5(source).package.sections.flatMap((section) => section.questions);
const intents = (questions) => compile({
  schemaVersion: 5,
  assignment: { title: 'K steps — inverse and composition', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ role: 'classwork', title: 'Classwork', questions }],
});
const item = (fields) => ({ standard: 'A2.2B', dok: 2, difficultyBand: 2, ...fields });
const many = (prompt, responses) => item({ prompt, studentActions: ['multipleResponses'], responses });
const num = (id, label, answer) => ({ id, label, answer });
const choice = (id, label, answer, distractors) => ({ id, label, type: 'choice', options: [answer, ...distractors.filter((option) => option !== answer)], answer });

const seeded = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const int = (low, high) => low + Math.floor(next() * (high - low + 1));
  return { next, int, pick: (values) => values[Math.floor(next() * values.length)], nonZero: (low, high) => { let value = 0; while (!value) value = int(low, high); return value; } };
};

const M = (value) => (value < 0 ? `−${-value}` : String(value));
/** a·x + b as an author writes it: 3x−7, −x+4, 12−9x (constant first), 5x. */
const ruleText = (a, b, variable = 'x', constantFirst = false) => {
  const head = a === 1 ? variable : a === -1 ? `−${variable}` : `${M(a)}${variable}`;
  if (!b) return head;
  if (constantFirst) return `${M(b)}${a < 0 ? '−' : '+'}${Math.abs(a) === 1 ? variable : `${Math.abs(a)}${variable}`}`;
  return `${head}${b < 0 ? '−' : '+'}${Math.abs(b)}`;
};
/** The inverse of a·x + b, written the way the lessons key it. */
const inverseKey = (a, b) => {
  if (Math.abs(a) === 1) return ruleText(1 / a, -b / a);
  if (a > 0) return b === 0 ? `x/${a}` : `(x${b > 0 ? '−' : '+'}${Math.abs(b)})/${a}`;
  if (b > 0) return `(${b}−x)/${-a}`;
  return b === 0 ? `−x/${-a}` : `−(x+${-b})/${-a}`;
};
const polyKey = (coefficients) => {
  // Ascending coefficients, written x²-first with Unicode minus and no spaces.
  const terms = coefficients.map((c, p) => [c, p]).filter(([c]) => c !== 0).reverse();
  if (!terms.length) return '0';
  return terms.map(([c, p], index) => {
    const body = p === 0 ? String(Math.abs(c)) : `${Math.abs(c) === 1 ? '' : Math.abs(c)}${['', 'x', 'x²', 'x³'][p] || `x^${p}`}`;
    return `${index === 0 ? (c < 0 ? '−' : '') : (c < 0 ? '−' : '+')}${body}`;
  }).join('');
};
const polyMul = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
const polyCompose = (outer, inner) => outer.reduceRight((acc, c) => { const out = polyMul(acc, inner); out[0] = (out[0] || 0) + c; return out; }, [0]);
const trim = (p) => { const out = [...p]; while (out.length > 1 && out[out.length - 1] === 0) out.pop(); return out; };

const SEEDED = [];
const PER_KIND = 30;
{
  const random = seeded(4242);
  const questions = [];
  const kinds = [];
  const add = (kind, question) => { kinds.push(kind); questions.push(question); };
  for (let index = 0; index < PER_KIND; index += 1) {
    // linearInverse: slopes of ±1, a zero intercept and the constant written first all appear.
    const a = index % 10 === 0 ? random.pick([1, -1]) : random.nonZero(-9, 9);
    const b = index % 7 === 0 ? 0 : random.nonZero(-15, 15);
    const rule = ruleText(a, b, 'x', index % 5 === 0 && b !== 0);
    const p = random.int(-5, 6);
    const second = [
      choice('slope', 'Slope of f⁻¹', [1, -1].includes(a) ? M(1 / a) : `${a < 0 ? '−' : ''}1/${Math.abs(a)}`, ['0', M(a), M(-a)]),
      choice('check', 'If f(' + M(p) + ')=' + M(a * p + b) + ', then', `f⁻¹(${M(a * p + b)})=${M(p)}`, [`f⁻¹(${M(p)})=${M(a * p + b)}`]),
      choice('compose', 'Which composition should equal x if the inverse is correct?', 'f(f⁻¹(x))', ['f(x)+f⁻¹(x)', 'f(x)−f⁻¹(x)']),
    ][index % 3];
    add('linearInverse', many(`Find the inverse of f(x)=${rule}.`, [choice('inverse', 'f⁻¹(x)', inverseKey(a, b), [ruleText(a, -b), 'x']), second]));
    // A value in context: C(h) = fee + rate·h, with a whole answer.
    const rate = random.int(2, 90);
    const fee = random.int(1, 99) * 5;
    const units = random.int(1, 40);
    add('linearInverse', many(`A plan costs C(h)=${fee}+${rate}h, where h is the number of hours. Use the inverse relationship.`, [
      choice('inverse', 'Inverse rule h=C⁻¹(x)', `(x−${fee})/${rate}`, [`${rate}x−${fee}`, `(x+${fee})/${rate}`]),
      num('hours', `Hours when the total cost is $${fee + rate * units}`, units),
    ]));
    // inverseRelation: a set (sometimes with a repeated output, so its inverse is not a function).
    const xs = [...new Set(Array.from({ length: 6 }, () => random.int(-9, 12)))].slice(0, random.int(3, 4));
    const ys = xs.map(() => random.int(-9, 12));
    if (index % 4 === 0 && ys.length > 2) ys[2] = ys[0];
    const pairs = xs.map((x, at) => [x, ys[at]]);
    const set = (list) => `{${list.map(([x, y]) => `(${M(x)}, ${M(y)})`).join(', ')}}`;
    add('inverseRelation', many(`Find the inverse relation of ${set(pairs)}.`, [
      choice('inverse', 'Inverse relation', set(pairs.map(([x, y]) => [y, x])), [set(pairs)]),
      index % 2
        ? choice('function', 'Is this inverse relation a function?', new Set(ys).size === ys.length ? 'yes' : 'no', ['yes', 'no'])
        : choice('property', 'What was done to each ordered pair?', 'swap x and y', ['change both signs']),
    ]));
    // inverseProperty: f(p) = q, and a point on y = x.
    const q = random.int(-12, 12);
    add('inverseProperty', many(`Use the inverse property. If f(${M(p)})=${M(q)}, complete the statement about f⁻¹.`, [num('input', 'Input to f⁻¹', q), num('output', 'Output of f⁻¹', p)]));
    add('inverseProperty', many(`A linear function and its inverse intersect at a point on y=x. If the point is (${M(q)},${M(q)}), what must both functions do there?`, [
      choice('fvalue', `f(${M(q)})`, M(q), ['0']), choice('inversevalue', `f⁻¹(${M(q)})`, M(q), ['0']),
    ]));
    // operations: polynomials of degree 1 or 2; a linear g with a whole root for the quotient.
    const f = trim([random.int(-9, 9), random.int(-9, 9), index % 2 ? random.nonZero(-4, 4) : 0]);
    if (f.length < 2) f.push(random.nonZero(-4, 4));
    const root = random.int(-6, 6);
    const gLinear = [-root, 1];
    const g = index % 3 === 0 ? gLinear : trim([random.int(-9, 9), random.nonZero(-5, 5), random.int(-3, 3)]);
    const defs = `Given f(x)=${polyKey(f)} and g(x)=${polyKey(g)}`;
    const sum = trim(f.map((c, at) => c + (g[at] || 0)).concat(g.slice(f.length)));
    const difference = trim(Array.from({ length: Math.max(f.length, g.length) }, (_, at) => (f[at] || 0) - (g[at] || 0)));
    add('operations', many(`${defs}, find the sum and difference.`, [choice('sum', '(f+g)(x)', polyKey(sum), ['0']), choice('difference', '(f−g)(x)', polyKey(difference), ['0'])]));
    const product = trim(polyMul(f, g));
    add('operations', many(`${defs}, identify the product (f·g)(x).`, [choice('product', '(f·g)(x)', polyKey(product), ['0']), choice('degree', 'Degree of the product', String(product.length - 1), ['1', '5'])]));
    if (g === gLinear && f.reduce((acc, c, at) => acc + c * root ** at, 0) !== 0) {
      add('operations', many(`${defs}, write the quotient and identify the excluded input.`, [
        choice('quotient', '(f/g)(x)', `(${polyKey(f)})/(${polyKey(g)})`, ['0']), choice('restriction', 'Excluded x-value', M(root), [M(-root - 1)]),
      ]));
    }
    // pointwise and composition from values.
    const [u, v] = [random.int(-12, 12), random.nonZero(-9, 9)];
    const w = random.int(-5, 8);
    add('pointwise', many(`If f(${M(w)})=${M(u)} and g(${M(w)})=${M(v)}, evaluate two pointwise operations.`, [
      num('sum', `(f+g)(${M(w)})`, u + v), num('difference', `(f−g)(${M(w)})`, u - v), num('product', `(f·g)(${M(w)})`, u * v),
    ]));
    const inner = random.int(-6, 9);
    add('compositionValues', many(`If g(${M(w)})=${M(inner)} and f(${M(inner)})=${M(u)}, evaluate the composition f(g(${M(w)})).`, [num('inside', `g(${M(w)})`, inner), num('composition', `f(g(${M(w)}))`, u)]));
    // contextComposition: a deduction then a rate, in both orders.
    const deduction = random.int(1, 20) * 10;
    const keep = random.pick([0.8, 0.9, 0.96, 0.75, 0.85]);
    const amount = random.int(5, 40) * 100;
    const [first, second2] = [keep * (amount - deduction), keep * amount - deduction];
    add('contextComposition', many(`A $${deduction} deduction and a tax can be applied in either order to $${amount}. Let r(x)=x−${deduction} and t(x)=${keep}x.`, [
      num('first', `t(r(${amount}))`, Math.round(first * 100) / 100), num('second', `r(t(${amount}))`, Math.round(second2 * 100) / 100),
      choice('better', 'Which order leaves the larger amount?', first > second2 ? 'deduction first: t∘r' : 'tax first: r∘t', [first > second2 ? 'tax first: r∘t' : 'deduction first: t∘r']),
    ]));
    // compositionSymbolic: a quadratic and a line.
    const fq = [random.int(-6, 6), random.int(-4, 4), random.nonZero(-3, 3)];
    const gl = [random.int(-6, 6), random.nonZero(-3, 3)];
    add('compositionSymbolic', many(`For f(x)=${polyKey(fq)} and g(x)=${polyKey(gl)}, find both compositions.`, [
      choice('fog', '(f∘g)(x)', polyKey(trim(polyCompose(fq, gl))), ['0']), choice('gof', '(g∘f)(x)', polyKey(trim(polyCompose(gl, fq))), ['0']),
    ]));
    // inverseVerification: an inverse pair, or one off by a constant; g as a fraction.
    const s = random.pick([2, 3, 4, 5, -2, -3]);
    const t = random.nonZero(-9, 9);
    const shift = index % 2 ? 0 : random.pick([1, -2, 3]);
    const gRule = s > 0 ? `(x${t + shift > 0 ? '−' : '+'}${Math.abs(t + shift)})/${s}` : `(${t + shift}−x)/${-s}`.replace(/^\(-/, '(−');
    const isInverse = shift === 0;
    const fog = isInverse ? 'x' : polyKey([-shift, 1]);
    // (g∘f)(x) = x − shift/s, keyed as an exact fraction (x+1/3), never x+0.3333333333333333.
    const divisorOf = (top, bottom) => (bottom ? divisorOf(bottom, top % bottom) : Math.abs(top));
    const [top, bottom] = [-shift / divisorOf(shift, s), s / divisorOf(shift, s)].map((value, at, pair) => (pair[1] < 0 ? -value : value));
    const gof = isInverse ? 'x' : bottom === 1 ? polyKey([top, 1]) : `x${top < 0 ? '−' : '+'}${Math.abs(top)}/${bottom}`;
    if (t + shift !== 0) {
      add('inverseVerification', many(`Determine whether f(x)=${ruleText(s, t)} and g(x)=${gRule} are inverses.`, [
        choice('fog', '(f∘g)(x)', fog, ['3x']), choice('gof', '(g∘f)(x)', gof, ['3x']), choice('inverse', 'Are they inverses?', isInverse ? 'yes' : 'no', ['yes', 'no']),
      ]));
    }
  }
  add('inverseGraph', many('Review how inverse graphs are related.', [
    choice('slope', 'Slope of y=x', '1', ['−1', '0']), choice('role', 'For inverse graphs, y=x acts as', 'the reflection line', ['a vertical asymptote']),
  ]));
  // A fraction slope, f(x) = (p/q)x + b: the slope of f⁻¹ is 1 ÷ (p/q) = q/p (never "1 ÷ 2/3", which is (1 ÷ 2)/3).
  [[2, 3], [-3, 4], [5, 2], [-1, 3], [3, 5], [-4, 3]].forEach(([p, q], index) => {
    const k = index % 3 === 0 ? 0 : random.nonZero(-4, 4);
    const b = p * k;
    const fraction = (top, bottom) => `${top * bottom < 0 ? '−' : ''}${Math.abs(bottom) === 1 ? Math.abs(top) : `${Math.abs(top)}/${Math.abs(bottom)}`}`;
    const coefficient = (top, bottom) => (Math.abs(bottom) === 1 ? `${fraction(top, bottom)}x` : `${top * bottom < 0 ? '−' : ''}(${Math.abs(top)}/${Math.abs(bottom)})x`);
    const tail = (value) => (value === 0 ? '' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`);
    add('linearInverse', many(`Find the inverse of f(x)=${coefficient(p, q)}${tail(b)}.`, [
      choice('inverse', 'f⁻¹(x)', `${coefficient(q, p)}${tail(-k * q)}`, ['x']),
      choice('slope', 'Slope of f⁻¹', fraction(q, p), ['0', fraction(p, q)]),
    ]));
  });
  // Authored zero terms: f(x) = x + 0, and a $0 deduction r(x) = x − 0 (no "+ 0", no "1000 = 1000").
  add('linearInverse', many('Find the inverse of f(x)=x+0.', [choice('inverse', 'f⁻¹(x)', 'x', ['2x'])]));
  add('contextComposition', many('A $0 deduction and a tax can be applied in either order to $1000. Let r(x)=x−0 and t(x)=0.9x.', [
    num('first', 't(r(1000))', 900), num('second', 'r(t(1000))', 900),
  ]));
  // A decimal rate: E(s) = 2200 + 0.05s keyed 20x − 44000.
  add('linearInverse', many('His earnings are E(s)=2200+0.05s. Use the inverse to determine sales from earnings.', [
    choice('inverse', 'Inverse rule s=E⁻¹(x)', '20x−44000', ['0.05x+2200']), num('sales', 'Sales needed for total earnings of $3450', 25000),
  ]));
  intents(questions).forEach((question, index) => SEEDED.push({ label: `seeded ${kinds[index]} #${index}: ${question.prompt.slice(0, 60)}`, kind: kinds[index], question }));
}

const CORPUS = ['teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json', 'teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json']
  .flatMap((file) => compile(readJson(file)).filter((question) => family.matches(question)).map((question) => ({ label: `${file.split('/').pop()}: ${question.prompt.slice(0, 60)}`, kind: family.questionKind(question), question })));

const TOOLS = [];
{
  const random = seeded(99);
  const questions = [];
  for (let index = 0; index < PER_KIND; index += 1) {
    const [a, b] = [index % 9 === 0 ? random.pick([1, -1]) : random.nonZero(-7, 7), index % 6 === 0 ? 0 : random.nonZero(-12, 12)];
    questions.push(item({ prompt: `Derive the inverse of f(x)=${ruleText(a, b)} in the derivation lab.`, studentActions: ['findInverse'], mode: 'deriveInverse', function: { family: 'linear', m: a, b } }));
    const mode = ['inverse', 'composition', 'full'][index % 3];
    const fa = random.nonZero(-6, 6);
    const fb = random.int(-9, 9);
    questions.push(item({
      prompt: `Work the lab for f and g (${index}).`, studentActions: mode === 'inverse' ? ['findInverse'] : ['composeFunctions'], mode,
      f: { type: 'linear', a: fa, h: 0, k: fb }, g: { type: 'linear', a: random.nonZero(-5, 5), h: 0, k: random.int(-9, 9) }, x: random.int(-6, 8),
    }));
    const opsSets = [['add', 'subtract'], ['multiply'], ['compose'], ['compose', 'add'], ['divide']];
    const operations = opsSets[index % opsSets.length];
    const gRoot = random.int(-5, 5);
    const quadratic = { type: 'quadratic', a: random.nonZero(-3, 3), h: random.int(-3, 3), k: random.int(-6, 6) };
    const fSpec = operations.includes('divide') && index % 2
      ? { type: 'polynomial', coefficients: [1, -gRoot - 1, gRoot] } // (x − gRoot)(x − 1): divides exactly
      : random.next() < 0.5 ? quadratic : { type: 'linear', a: random.nonZero(-5, 5), h: 0, k: random.int(-9, 9) };
    questions.push(item({
      prompt: `Find the requested operations for f and g (${index}).`, studentActions: ['functionOperations'], f: fSpec,
      g: operations.includes('divide') ? { type: 'linear', a: 1, h: gRoot, k: 0 } : { type: 'linear', a: random.nonZero(-4, 4), h: 0, k: random.int(-8, 8) },
      operations, ...(index % 2 ? { composeOrder: 'gOfF' } : {}),
    }));
  }
  intents(questions).forEach((question, index) => TOOLS.push({ label: `tool ${family.questionKind(question)} #${index}: ${question.prompt.slice(0, 50)}`, kind: family.questionKind(question), question }));
  readJson('SAMPLE_BATCH_A_DEEP_DIVE.json').questions.filter((question) => question.toolId === 'inverseCompositionLab')
    .forEach((question, index) => TOOLS.push({ label: `batch A lab #${index}`, kind: family.questionKind(question), question }));
}

/* ------------------------------------------------------------ the sweep */

test('every multiAnswer shape: the steps work THIS item, each chain is true, the last is the key, and the grader accepts it', () => {
  const byKind = {};
  for (const { label, kind, question } of [...CORPUS.filter((entry) => !['lab', 'derive', 'ops'].includes(entry.kind)), ...SEEDED]) {
    assert.equal(family.questionKind(question), kind, `${label}: claimed as ${kind}`);
    const worked = family.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    byKind[kind] = (byKind[kind] || 0) + 1;
    assertClean(worked, label);
    assertLastIsSummary(worked, label);
    const chains = assertChainsTrue(worked.steps, label);
    // Every computed field (an operation, a value from rules) shows its arithmetic as a true chain.
    const computes = question.answerFields.some((field) => /^\(\w[+\-−·∘]\w\)\(|^\w\(\w\(-?[\d.]+\)\)$/.test(ascii(field.label).replace(/\s+/g, '')) && (kind !== 'compositionValues'));
    if (computes) assert.ok(chains >= 1, `${label}: the work is shown`);
    if (kind === 'linearInverse') {
      const [, def] = [...defsIn(question.prompt).entries()].find(([, entry]) => degreeOf(entry.fn) === 1);
      assert.ok(assertDerivationHolds(worked.steps, def.fn, def.variable, label) >= (Math.abs(def.fn(1) - def.fn(0)) === 1 && def.fn(0) === 0 ? 0 : 1), `${label}: the derivation moves`);
    }
    const stated = statedAnswers(question, worked, label);
    assertFieldTruth(question, stated, label);
    const graded = gradeMultiAnswerResponse(question, stated);
    assert.equal(graded.isCorrect, true, `${label}: the grader accepts ${JSON.stringify(stated)} (${JSON.stringify(graded.parts.filter((part) => !part.isCorrect))})`);
  }
  for (const kind of ['linearInverse', 'inverseRelation', 'inverseProperty', 'operations', 'pointwise', 'compositionValues', 'contextComposition', 'compositionSymbolic', 'inverseVerification', 'inverseGraph']) {
    assert.ok(byKind[kind] >= 1, `${kind} was worked (${JSON.stringify(byKind)})`);
  }
  assert.ok(Object.values(byKind).reduce((sum, count) => sum + count, 0) > 300, JSON.stringify(byKind));
});

const piecesOf = (worked) => Object.fromEntries(worked.answerSummary.split('; ').map((piece) => {
  const at = piece.indexOf(' = ');
  return [piece.slice(0, at), piece.slice(at + 3)];
}));

test('the tools: the derivation lab, the lab on lines and the operations workbench end on what their graders accept', () => {
  const counts = { derive: 0, lab: 0, ops: 0 };
  for (const { label, kind, question } of [...TOOLS, ...CORPUS.filter((entry) => ['lab', 'derive', 'ops'].includes(entry.kind))]) {
    const worked = family.workedSolution(question);
    const linearLab = kind !== 'lab' || ([question.f || { type: 'linear' }, question.g || { type: 'linear' }].every((spec) => (spec.type || 'linear') === 'linear' && !spec.domain));
    if (!linearLab) continue; // a curved lab is the tool review's to explain
    assert.ok(worked, `${label}: a worked solution`);
    counts[kind] += 1;
    assertClean(worked, label);
    assertLastIsSummary(worked, label);
    assertChainsTrue(worked.steps, label);
    if (kind === 'derive') {
      const a = Number(question.f.a ?? 1);
      const b = Number(question.f.k ?? 0) - a * Number(question.f.h ?? 0);
      assertDerivationHolds(worked.steps, (t) => a * t + b, 'x', label);
      const inverse = /^y = (.+)$/.exec(worked.answerSummary)[1];
      assert.ok(sameFunction((t) => a * fnOf(inverse)(t) + b, (t) => t), `${label}: y = ${inverse} undoes f`);
      const [slope, intercept] = [fnOf(inverse)(1) - fnOf(inverse)(0), fnOf(inverse)(0)];
      const graded = gradeToolWork({ toolId: 'inverseCompositionLab', question, work: { equation: { left: { x: slope, y: 0, c: intercept }, right: { x: 0, y: 1, c: 0 } } } });
      assert.equal(graded.isCorrect, true, `${label}: the derivation grader accepts y = ${inverse}`);
    } else if (kind === 'lab') {
      const f = question.f || { type: 'linear', a: 2, h: 0, k: 3 };
      const g = question.g || { type: 'linear', a: -1, h: 0, k: 4 };
      const F = (t) => Number(f.a ?? 1) * (t - Number(f.h ?? 0)) + Number(f.k ?? 0);
      const G = (t) => Number(g.a ?? 1) * (t - Number(g.h ?? 0)) + Number(g.k ?? 0);
      const x = Number(question.x ?? 2);
      const said = piecesOf(worked);
      const work = { x, restrictionChoice: 'none' };
      Object.entries(said).forEach(([name, value]) => {
        if (name === `(f ∘ g)(${M(x)})`) { assert.ok(near(evalAt(value), F(G(x))), `${label}: ${name}`); work.fogAnswer = ascii(value); }
        else if (name === `(g ∘ f)(${M(x)})`) { assert.ok(near(evalAt(value), G(F(x))), `${label}: ${name}`); work.gofAnswer = ascii(value); }
        else if (name === `f⁻¹(f(${M(x)}))`) { assert.ok(near(evalAt(value), x), `${label}: ${name}`); work.inverseAnswer = ascii(value); }
        else assert.fail(`${label}: unexpected "${name}"`);
      });
      const graded = gradeToolWork({ toolId: 'inverseCompositionLab', question, work });
      assert.equal(graded.isCorrect, true, `${label}: the lab grader accepts ${JSON.stringify(work)} (${JSON.stringify(graded.parts)})`);
    } else {
      const coefficients = (spec) => (Array.isArray(spec.coefficients) ? (t) => spec.coefficients.reduce((sum, c) => sum * t + Number(c), 0)
        : spec.type === 'quadratic' ? (t) => Number(spec.a ?? 1) * (t - Number(spec.h ?? 0)) ** 2 + Number(spec.k ?? 0)
          : (t) => Number(spec.a ?? 1) * (t - Number(spec.h ?? 0)) + Number(spec.k ?? 0));
      const [F, G] = [coefficients(question.f), coefficients(question.g)];
      const responses = {};
      let restrictions = '';
      Object.entries(piecesOf(worked)).forEach(([name, value]) => {
        const truth = {
          '(f + g)(x)': ['sum', (t) => F(t) + G(t)], '(f − g)(x)': ['difference', (t) => F(t) - G(t)], '(f · g)(x)': ['product', (t) => F(t) * G(t)],
          '(f ∘ g)(x)': ['composition', (t) => F(G(t))], '(g ∘ f)(x)': ['composition', (t) => G(F(t))], '(f / g)(x)': ['quotient', (t) => F(t) / G(t)],
        }[name];
        assert.ok(truth, `${label}: unexpected "${name}"`);
        const [operation, fn] = truth;
        const [expression, excluded] = value.split(', x ≠ ');
        assert.ok(sameFunction(fnOf(expression), fn, [-3.5, 0.5, 1.5, 7.25]), `${label}: ${name} = ${expression}`);
        if (operation === 'composition') assert.equal(name.startsWith('(g'), question.composeOrder === 'gOfF', `${label}: the composition order`);
        if (excluded) {
          excluded.split(', ').forEach((root) => assert.ok(near(G(evalAt(root)), 0), `${label}: ${root} zeroes g`));
          restrictions = ascii(excluded);
        }
        // Typed the way a student types it in the workbench: x^2, not x².
        responses[operation] = ascii(expression).replace(/²/g, '^2').replace(/³/g, '^3');
      });
      const graded = gradeToolWork({ toolId: 'functionOperationsLab', question, work: { responses, restrictions } });
      assert.equal(graded.isCorrect, true, `${label}: the operations grader accepts ${JSON.stringify(responses)} (${JSON.stringify(graded.parts)})`);
    }
  }
  assert.ok(counts.derive >= 20 && counts.lab >= 20 && counts.ops >= 20, JSON.stringify(counts));
});

test('edges: a slope of ±1, a zero intercept, a fraction-form rule and a pair that is not inverse read the way a student works them', () => {
  const [plusOne] = intents([many('Find the inverse of f(x)=x+4.', [choice('inverse', 'f⁻¹(x)', 'x−4', ['x+4'])])]);
  assert.deepEqual(family.workedSolution(plusOne).steps, [
    'Write y = x + 4, then swap x and y: x = y + 4.',
    'Subtract 4 from both sides: x − 4 = y.',
    'So f⁻¹(x) = x−4.',
  ]);
  const [minusOne] = intents([many('Find the inverse of f(x)=−x+6.', [choice('inverse', 'f⁻¹(x)', '−x+6', ['x+6'])])]);
  assert.deepEqual(family.workedSolution(minusOne).steps.slice(1, 3), ['Subtract 6 from both sides: x − 6 = −y.', 'Multiply both sides by −1: y = −x + 6.']);
  const [throughOrigin] = intents([many('Find the inverse of f(x)=−2x.', [choice('inverse', 'f⁻¹(x)', '−x/2', ['2x'])])]);
  assert.doesNotMatch(family.workedSolution(throughOrigin).steps.join(' '), /Add 0|Subtract 0|\+ 0|− 0/);
  const [notInverse] = intents([many('Determine whether f(x)=2x+3 and g(x)=(x−4)/2 are inverses.', [
    choice('fog', '(f∘g)(x)', 'x−1', ['x']), choice('gof', '(g∘f)(x)', 'x−0.5', ['x']), choice('inverse', 'Are they inverses?', 'no', ['yes']),
  ])]);
  const worked = family.workedSolution(notInverse);
  assert.equal(worked.steps.at(-2), '(f ∘ g)(x) simplifies to x − 1, which is not x, so f and g are not inverses (no).');
  // g written as a fraction is rewritten term by term before it is composed.
  assert.ok(worked.steps.includes('Written term by term, g(x) = (x − 4)/2 is 0.5x − 2.'), worked.steps.join('\n'));
});

test('it returns null — never a wrong step — when a key is not what the item computes, or a field cannot be read', () => {
  const [wrongKey] = intents([many('Find the inverse of f(x)=3x−7.', [choice('inverse', 'f⁻¹(x)', '(x−7)/3', ['(x+7)/3'])])]);
  assert.equal(family.matches(wrongKey), true);
  assert.equal(family.workedSolution(wrongKey), null);
  const [wrongValue] = intents([many('If g(4)=2 and f(2)=9, evaluate the composition f(g(4)).', [num('inside', 'g(4)', 2), num('composition', 'f(g(4))', 8)])]);
  assert.equal(family.workedSolution(wrongValue), null);
  const [wrongVerdict] = intents([many('Determine whether f(x)=3x−6 and g(x)=(x+6)/3 are inverses.', [choice('fog', '(f∘g)(x)', 'x', ['3x']), choice('inverse', 'Are they inverses?', 'no', ['yes'])])]);
  assert.equal(family.workedSolution(wrongVerdict), null);
  // A curved lab (a parabola's restriction) is left to the tool's own review.
  const curved = readJson('SAMPLE_BATCH_A_DEEP_DIVE.json').questions.find((question) => question.toolId === 'inverseCompositionLab' && question.f?.type === 'quadratic');
  if (curved) assert.equal(family.workedSolution(curved), null);
  assert.equal(family.workedSolution(null), null);
  assert.equal(family.workedSolution({ type: 'multiAnswer', prompt: 'Nothing here.', answerFields: [{ id: 'a', label: 'Anything', answer: '1' }] }), null);
});

test('the closed-question review uses it for an item with no authored steps, and only there', () => {
  const [question] = intents([many('Find the inverse of f(x)=5x+10.', [choice('inverse', 'f⁻¹(x)', '(x−10)/5', ['5x−10']), choice('slope', 'Slope of f⁻¹', '1/5', ['5'])])]);
  assert.equal(familyFor(question), family);
  const review = buildClosedQuestionReview({ question });
  assert.equal(review.fromFamily, true);
  assert.deepEqual(review.authored.reasoning, family.workedSolution(question).steps);
  assert.equal(review.authored.answerSummary, 'f⁻¹(x) = (x−10)/5; slope of f⁻¹: 1/5');
  // The open-item supports never reach it.
  const source = executableSource(readFileSync(new URL('src/platform/supports/families/inverseComposition.js', ROOT), 'utf8'));
  const sectionStart = source.indexOf('const accepts =');
  assert.ok(sectionStart > 0, 'the worked-solution section');
  for (const name of ['export const hints', 'export const backUpQuestion', 'export const similarProblem', 'export const expectedValues', 'export const matches']) {
    const at = source.indexOf(name);
    assert.ok(at > 0 && at < sectionStart, `${name} comes before the worked solution`);
  }
  assert.doesNotMatch(source.slice(0, sectionStart), /workedSolution|multiWorked|labWorked|opsWorked|deriveWorked/, 'an open-item path calls the worked solution');
  assert.deepEqual([...source.slice(sectionStart).matchAll(/export const (\w+)/g)].map((match) => match[1]), ['workedSolution']);
});
