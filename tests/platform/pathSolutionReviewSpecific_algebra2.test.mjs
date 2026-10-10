// Algebra II My Math Path templates whose solution review is a worked solution
// of THE DRAW, not a sentence about the topic.
//
// These 13 templates are also the question pool for Live Challenge standard
// rounds. Release-candidate QA found their between-round solution useless: the
// review said what the topic is ("Boundary style is part of the solution.",
// "Mixed-degree sum over the LCD.") and several answer summaries stated no
// answer at all. Each review now works the drawn problem with the draw's own
// numbers (generator placeholders, plus display-only derived helper values):
// the plotted points of the parent graph, the boundaries, styles, sides and a
// checked test point of the inequality system, the LCD and expanded numerator
// of the rational expression, the consecutive ratios of the table, and the
// model evaluation and verdict of the prediction / decision / judgment items.
//
// A review is shown only once the question is closed (pathSolutionSupport.mjs)
// or the round is closed (liveChallengeSolutionReveal.mjs), so it may state the
// answer; it must be the right answer for that draw. This file proves, against
// the DRAFT source of truth (the seed mirrors are generated from it), for 40
// seeded draws of every variant plus the 30 recap-probe draws of every
// template:
//   * the review is fully substituted, has 2-5 reasoning steps (the projector
//     shows five) and fits the buildPrivateSupport / roundSolutionRecord limits;
//   * every relation the review writes in $...$ (a = b, a > b, a ≈ b, and
//     x-expressions joined by =) is TRUE, checked by mathjs;
//   * every number the review states is one an independent oracle computes
//     from the instance's VISIBLE prompt, table, data points and choices —
//     never from the template's generator values;
//   * the answer summary is the graded key: the oracle's answer equals the
//     key, the summary's answer equals the oracle's, and where a production
//     grader exists (response fields, the data-modeling lab) the summary's
//     values are submitted to it and accepted;
//   * the review names something from its own draw (a drawn number);
//   * prompts, keys, choices, tolerances, parameters, constraints, derived
//     values and difficulty cells are unchanged from the committed bank
//     (pinned literals below); added derived values are display-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as math from 'mathjs';

import { effectivePathVariants, generatePathInstance, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// Resolved from this file, not the process cwd, so the test runs from any directory.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STANDARDS = ['A2.2A', 'A2.3F', 'A2.7F', 'A2.8A', 'A2.8C'];
const draftDocs = STANDARDS.flatMap((code) => JSON.parse(readFileSync(join(REPO_ROOT, `drafts/fidelity-v2/algebra2/${code}.json`), 'utf8')).documents);
const template = (id) => {
  const found = draftDocs.find((doc) => doc.id === id);
  assert.ok(found, `${id} is in the draft source`);
  return found;
};

const PER_VARIANT_SEEDS = Array.from({ length: 40 }, (unused, index) => `review-specific-${index}`);
const RECAP_SEEDS = Array.from({ length: 30 }, (unused, index) => `recap-probe-${index}`);

// ---- LaTeX -> mathjs ----------------------------------------------------------
const matchBrace = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
};
const group = (text, at) => {
  if (text[at] !== '{') return null;
  const close = matchBrace(text, at);
  return close < 0 ? null : { inner: text.slice(at + 1, close), end: close + 1 };
};
const latexToMath = (source) => {
  let text = String(source).replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*').replace(/\\,/g, '');
  for (let guard = 0; guard < 200; guard += 1) {
    const frac = text.indexOf('\\frac');
    const sqrt3 = text.indexOf('\\sqrt[3]');
    const sqrt = text.indexOf('\\sqrt{');
    const power = text.indexOf('^{');
    const candidates = [frac, sqrt3, sqrt, power].filter((index) => index >= 0);
    if (!candidates.length) break;
    const at = Math.min(...candidates);
    if (at === frac) {
      const top = group(text, at + 5); if (!top) return null;
      const bottom = group(text, top.end); if (!bottom) return null;
      text = `${text.slice(0, at)}((${top.inner})/(${bottom.inner}))${text.slice(bottom.end)}`;
    } else if (at === sqrt3) {
      const body = group(text, at + 8); if (!body) return null;
      text = `${text.slice(0, at)}cbrt(${body.inner})${text.slice(body.end)}`;
    } else if (at === sqrt) {
      const body = group(text, at + 5); if (!body) return null;
      text = `${text.slice(0, at)}sqrt(${body.inner})${text.slice(body.end)}`;
    } else {
      const body = group(text, at + 1); if (!body) return null;
      text = `${text.slice(0, at)}^(${body.inner})${text.slice(body.end)}`;
    }
  }
  text = text.replace(/\|([^|]+)\|/g, 'abs($1)');
  if (/[\\{}]/.test(text)) return null;
  return text;
};

const FUNCTION_NAMES = new Set(['sqrt', 'cbrt', 'abs']);
/** A parsed piece: { kind: 'number', value } | { kind: 'x', node } | null (not arithmetic). */
const piece = (latex) => {
  const converted = latexToMath(latex);
  if (converted == null || !converted.trim()) return null;
  let node;
  try { node = math.parse(converted); } catch { return null; }
  const symbols = node.filter((entry) => entry.isSymbolNode).map((entry) => entry.name);
  const fnNames = node.filter((entry) => entry.isFunctionNode).map((entry) => entry.fn.name);
  if (fnNames.some((name) => !FUNCTION_NAMES.has(name))) return null;
  const free = symbols.filter((name) => !FUNCTION_NAMES.has(name));
  if (free.some((name) => name !== 'x')) return null;
  if (free.length) return { kind: 'x', node, text: converted };
  const value = Number(node.evaluate());
  return Number.isFinite(value) ? { kind: 'number', value, text: converted } : null;
};

const SAMPLE_X = [0.37, 1.91, -2.73, 5.13, -6.41, 9.29];
const atX = (entry, x) => Number(entry.node.evaluate({ x }));
const sameFunction = (left, right) => SAMPLE_X.every((x) => {
  const a = atX(left, x); const b = atX(right, x);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
});

const RELATION = /(\\ge|\\le|\\ne|\\approx|>|<|=)/;
const holds = (relation, a, b) => {
  const eps = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  switch (relation) {
    case '=': return Math.abs(a - b) <= eps;
    case '\\approx': return Math.abs(a - b) <= 0.0015 * Math.max(1, Math.abs(a));
    case '\\ne': return Math.abs(a - b) > eps;
    case '>': return a > b + eps;
    case '<': return a < b - eps;
    case '\\ge': return a >= b - eps;
    case '\\le': return a <= b + eps;
    default: return false;
  }
};

const mathSpans = (text) => String(text).split('$').filter((unused, index) => index % 2 === 1);

/**
 * Every relation chain in every $...$ span is checked where both sides are
 * arithmetic: numbers compare by the relation, x-expressions joined by '=' must
 * be the same function. Returns the number of relations checked.
 */
const checkRelations = (text, label) => {
  let checked = 0;
  for (const span of mathSpans(text)) {
    const cleaned = span.replace(/\\left|\\right/g, '');
    const parts = cleaned.split(RELATION);
    if (parts.length < 3) continue;
    const pieces = [];
    const relations = [];
    parts.forEach((part, index) => { if (index % 2 === 0) pieces.push(piece(part)); else relations.push(part); });
    for (let index = 0; index < relations.length; index += 1) {
      const left = pieces[index]; const right = pieces[index + 1];
      if (!left || !right) continue;
      const relation = relations[index];
      if (left.kind === 'number' && right.kind === 'number') {
        assert.ok(holds(relation, left.value, right.value), `${label}: false relation ${left.text} ${relation} ${right.text} in $${span}$`);
        checked += 1;
      } else if (left.kind === 'x' && right.kind === 'x' && relation === '=') {
        assert.ok(sameFunction(left, right), `${label}: non-identity ${left.text} = ${right.text} in $${span}$`);
        checked += 1;
      }
    }
  }
  return checked;
};

/** Unsigned numbers stated anywhere in the text (LaTeX command names removed). */
const statedNumbers = (text) => (String(text)
  .replace(/\\[A-Za-z]+/g, ' ')
  .match(/\d+(?:\.\d+)?/g) || []).map(Number);

const visibleNumbers = (question) => {
  const visible = [question.prompt, JSON.stringify(question.stimulus || null), JSON.stringify(question.points || null),
    JSON.stringify((question.responseFields || []).map((field) => (field.choices || []).map((choice) => choice.label)))].join(' ');
  return statedNumbers(visible);
};

const near = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) <= eps * Math.max(1, Math.abs(Number(a)));

// ---- helpers reading visible content --------------------------------------------
const grab = (text, pattern, what) => {
  const match = pattern.exec(String(text));
  assert.ok(match, `oracle reads ${what} from: ${text}`);
  return match.slice(1);
};
const field = (question, id) => {
  const found = (question.responseFields || []).find((entry) => entry.id === id);
  assert.ok(found, `field ${id}`);
  return found;
};
const choiceByPattern = (question, id, pattern) => {
  const hits = field(question, id).choices.filter((choice) => pattern.test(choice.label));
  assert.equal(hits.length, 1, `exactly one ${id} choice matches ${pattern}`);
  return hits[0];
};
const tableColumn = (question, column) => question.stimulus.table.rows.map((row) => Number(row[column]));
const fn = (latex) => { const entry = piece(latex); assert.ok(entry && entry.kind === 'x', `model ${latex}`); return entry; };
const normInterval = (text) => String(text).replace(/\\infty/g, '∞').replace(/\s+/g, '');
const pointsIn = (text) => [...String(text).matchAll(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
const pointKey = ([x, y]) => `${Number(x)},${Number(y)}`;
const strictEvaluate = (node, x) => {
  // Every division in the ORIGINAL expression must have a nonzero, finite divisor.
  const walk = (entry) => {
    if (entry.isParenthesisNode) return walk(entry.content);
    if (entry.isConstantNode) return Number(entry.value);
    if (entry.isSymbolNode) { assert.equal(entry.name, 'x'); return x; }
    if (entry.isOperatorNode) {
      const args = entry.args.map(walk);
      if (args.some((value) => value === null)) return null;
      if (entry.fn === 'unaryMinus') return -args[0];
      if (entry.fn === 'unaryPlus') return args[0];
      if (entry.fn === 'add') return args[0] + args[1];
      if (entry.fn === 'subtract') return args[0] - args[1];
      if (entry.fn === 'multiply') return args[0] * args[1];
      if (entry.fn === 'divide') return (args[1] === 0 || !Number.isFinite(args[1])) ? null : args[0] / args[1];
      if (entry.fn === 'pow') return args[0] ** args[1];
    }
    throw new Error(`unsupported node ${entry.type} ${entry.fn}`);
  };
  return walk(node);
};

// ---- per-template oracles ---------------------------------------------------------
// Each returns { values: numbers a correct worked solution may state, specific:
// drawn numbers, keyCheck(review, question) asserting the summary IS the key }.

const graphOracle = (question, f, extra = []) => {
  const xs = question.pointTasks.map((task) => Number(task.x));
  const points = xs.map((x) => [x, f(x)]);
  // The graded key is the oracle's evaluation of the shown function.
  question.pointTasks.forEach((task, index) => assert.deepEqual(task.expected.map(Number), points[index], `point key x=${task.x}`));
  const values = [...points.flat(), ...extra];
  return { points, values };
};

const ORACLE = {
  'mm_A2_2A_v2_root-family-graph': (question) => {
    const cube = /sqrt\[3\]/.test(question.prompt);
    const xs = [...question.prompt.matchAll(/\$x=(-?\d+)\$/g)].map((match) => Number(match[1]));
    assert.ok(xs.length >= 3, 'prompt names inputs');
    const f = cube ? (x) => Math.round(math.cbrt(x)) : (x) => Math.sqrt(x);
    xs.forEach((x) => assert.ok(Number.isInteger(f(x)) && near(cube ? f(x) ** 3 : f(x) ** 2, x), `perfect power ${x}`));
    const { points, values } = graphOracle(question, f);
    const sorted = [...xs].sort((a, b) => a - b);
    const extra = cube ? [3] : [sorted.at(-1) - sorted.at(-2), f(sorted.at(-1)) - f(sorted.at(-2))];
    const domain = cube ? '(-∞,∞)' : '[0,∞)';
    return {
      values: [...values, ...extra, ...xs.map((x) => -x)],
      specific: xs.filter((x) => x !== 0),
      keyCheck: (review) => {
        assert.deepEqual(pointsIn(review.answerSummary).map(pointKey).sort(), points.map(pointKey).sort(), 'summary points = graded points');
        const [domainText] = grab(review.answerSummary, /domain \$([^$]+)\$/, 'domain');
        const [rangeText] = grab(review.answerSummary, /range \$([^$]+)\$/, 'range');
        const keyed = Object.fromEntries(question.analysisRequests.map((request) => [request.id, request.expected.map(normInterval)]));
        assert.equal(normInterval(domainText), domain); assert.ok(keyed.domain.includes(normInterval(domainText)), 'domain key');
        assert.equal(normInterval(rangeText), domain); assert.ok(keyed.range.includes(normInterval(rangeText)), 'range key');
        // Every point the review names lies on the shown function.
        for (const [x, y] of pointsIn([review.headline, ...review.reasoning, review.commonError, review.answerSummary].join(" "))) assert.ok(near(f(x), y), `(${x},${y}) on the graph`);
      },
    };
  },
  'mm_A2_2A_v2_symmetry-family-graph': (question) => {
    const cubic = /x\^3/.test(question.prompt);
    const [a, b] = grab(question.prompt, /\$x=\\pm(\d+)\$,? and \$x=\\pm(\d+)\$/, 'a, b').map(Number);
    const f = cubic ? (x) => x ** 3 : (x) => Math.abs(x);
    const { points, values } = graphOracle(question, f);
    assert.deepEqual(points.map(([x]) => x).sort((p, q) => p - q), [-b, -a, 0, a, b]);
    return {
      values: [...values, a, b, 1, 3],
      specific: [a, b],
      keyCheck: (review) => {
        assert.deepEqual(pointsIn(review.answerSummary).filter(([x, y]) => !(x === 0 && y === 0)).map(pointKey).sort(),
          points.filter(([x]) => x !== 0).map(pointKey).sort(), 'summary points = graded points');
        const keyed = Object.fromEntries(question.analysisRequests.map((request) => [request.id, request.expected.map(normInterval)]));
        const [rangeText] = grab(review.answerSummary, /range \$([^$]+)\$/, 'range');
        assert.equal(normInterval(rangeText), cubic ? '(-∞,∞)' : '[0,∞)');
        assert.ok(keyed.range.includes(normInterval(rangeText)), 'range key');
        if (cubic) {
          const [center] = grab(review.answerSummary, /center of rotational symmetry \$([^$]+)\$/, 'center');
          assert.equal(center, '(0,0)'); assert.ok(keyed.symmetry.includes(center));
        } else {
          const [line] = grab(review.answerSummary, /line of symmetry \$([^$]+)\$/, 'line');
          assert.equal(line, 'x=0'); assert.ok(keyed.symmetry.includes(line));
        }
        // Points stated anywhere lie on the graph, except the deliberate mirror image in the common error.
        for (const [x, y] of pointsIn([review.headline, ...review.reasoning, review.answerSummary].join(' '))) assert.ok(near(f(x), y), `(${x},${y}) on the graph`);
        if (cubic) {
          const mirrored = pointsIn(review.commonError);
          assert.ok(mirrored.some(([x, y]) => !near(f(x), y)), 'the common error names the off-graph mirror image');
        }
      },
    };
  },
};

// --- A2.3F -------------------------------------------------------------------------
const inequalityOracle = (question) => {
  const spans = mathSpans(question.prompt);
  const parsed = [];
  for (const span of spans) {
    for (const part of span.split(/,\s*/)) {
      const match = /^\s*y\s*(\\ge|\\le|>|<)\s*(.+)$/.exec(part);
      if (!match) continue;
      const relation = { '\\ge': '>=', '\\le': '<=', '>': '>', '<': '<' }[match[1]];
      const expression = piece(match[2]);
      assert.ok(expression, `boundary ${match[2]}`);
      const at = (x) => (expression.kind === 'number' ? expression.value : atX(expression, x));
      parsed.push({ m: at(1) - at(0), b: at(0), relation });
    }
  }
  assert.ok(parsed.length >= 2, `inequalities in ${question.prompt}`);
  // The graded construction key is exactly the prompt's system.
  assert.deepEqual(question.inequalities.map((entry) => ({ m: Number(entry.m), b: Number(entry.b), relation: entry.relation })), parsed, 'graded inequalities = prompt');
  const satisfies = ([x, y]) => parsed.every(({ m, b, relation }) => {
    const line = m * x + b;
    return relation === '>=' ? y >= line : relation === '<=' ? y <= line : relation === '>' ? y > line : y < line;
  });
  return {
    values: [...parsed.flatMap(({ m, b }) => [m, b]), 0, 1],
    specific: parsed.flatMap(({ m, b }) => [m, b]),
    keyCheck: (review) => {
      const stated = [...review.answerSummary.matchAll(/(Solid|Dashed) \$y=([^$]+)\$ shaded (above|below)/gi)].map((match) => {
        const expression = piece(match[2]);
        const at = (x) => (expression.kind === 'number' ? expression.value : atX(expression, x));
        const solid = match[1].toLowerCase() === 'solid';
        const above = match[3] === 'above';
        return { m: at(1) - at(0), b: at(0), relation: above ? (solid ? '>=' : '>') : (solid ? '<=' : '<') };
      });
      assert.deepEqual(stated, parsed, 'summary boundaries/styles/sides = graded inequalities');
      const joined = [...review.reasoning, review.answerSummary].join(' ');
      const testPoints = [...joined.matchAll(/(?:Test|contains) \$\((-?\d+),(-?\d+)\)\$/g)].map((match) => [Number(match[1]), Number(match[2])]);
      // Every "line through (0,b)" names a boundary's own intercept.
      for (const match of joined.matchAll(/through \$\(0,(-?\d+)\)\$ with slope (-?\d+)/g)) {
        assert.ok(parsed.some(({ m, b }) => b === Number(match[1]) && m === Number(match[2])), `boundary through (0,${match[1]}) slope ${match[2]}`);
      }
      assert.ok(testPoints.length > 0, 'a test point is checked');
      testPoints.forEach((point) => assert.ok(satisfies(point), `(${point}) is in the solution region`));
      // Boundary style statements in the reasoning agree with each relation.
      parsed.forEach(({ relation }) => {
        const symbol = { '>=': '\\ge', '<=': '\\le', '>': '>', '<': '<' }[relation];
        const step = review.reasoning.find((entry) => entry.startsWith(`$y${symbol}`));
        assert.ok(step, `a step handles y${symbol}`);
        assert.match(step, relation.includes('=') ? /solid/ : /dashed/, `style for ${relation}`);
        assert.match(step, relation.startsWith('>') ? /above/ : /below/, `side for ${relation}`);
      });
    },
  };
};
ORACLE['mm_A2_3F_v2_two-inclusive-overlap'] = inequalityOracle;
ORACLE['mm_A2_3F_v2_mixed-strict-overlap'] = inequalityOracle;

// --- A2.7F -------------------------------------------------------------------------
const rationalOracle = (question) => {
  const subtractFrom = question.prompt.startsWith('Subtract');
  const spans = mathSpans(question.prompt);
  // "Subtract B from A" shows B first: the expression is A - B.
  const expressionLatex = subtractFrom ? `${spans[1]}-${spans[0]}` : spans[0];
  const latex = expressionLatex.replace(/\\div/g, '/');
  const original = piece(latex);
  assert.ok(original && original.kind === 'x', `prompt expression ${latex}`);
  // The divisor of a quotient is a whole fraction: wrap so ÷ binds to it.
  let strictNode = original.node;
  if (/\\div/.test(expressionLatex)) {
    const [left, right] = expressionLatex.split('\\div');
    strictNode = math.parse(`(${latexToMath(left)})/(${latexToMath(right)})`);
  }
  const undefinedAt = [];
  for (let x = -12; x <= 12; x += 1) if (strictEvaluate(strictNode, x) === null) undefinedAt.push(x);
  const value = (x) => strictEvaluate(strictNode, x);
  const factorRoots = [...expressionLatex.matchAll(/x-\((-?\d+)\)/g)].map((match) => Number(match[1]));
  const distinctRoots = [...new Set(factorRoots)];
  const isSumDifference = /\+\\frac|-\\frac/.test(expressionLatex);
  // Denominator roots of the original fractions (LCD factors) for sums and differences.
  const denominatorRoots = undefinedAt;
  const lcd = (x) => denominatorRoots.reduce((product, root) => product * (x - root), 1);
  const numeratorAt = (x) => value(x) * lcd(x);
  // Numerator coefficients (linear) for sums/differences.
  const n0 = isSumDifference ? numeratorAt(0.5) - 0.5 * (numeratorAt(1.5) - numeratorAt(0.5)) : null;
  const n1 = isSumDifference ? numeratorAt(1.5) - numeratorAt(0.5) : null;
  const extras = [];
  if (isSumDifference) {
    const rounded = [Math.round(n1), Math.round(n0)];
    assert.ok(near(n1, rounded[0], 1e-7) && near(n0, rounded[1], 1e-7), 'integer numerator');
    extras.push(...rounded);
    // Expansion terms: each numerator constant times each root, and the numerators themselves.
    const numerators = [...expressionLatex.matchAll(/\\frac\{(-?\d+)\}/g)].map((match) => Number(match[1]));
    numerators.forEach((n) => distinctRoots.forEach((root) => extras.push(n * root)));
    extras.push(...numerators);
    // Numerator value at each excluded root, by the oracle's own linear numerator.
    undefinedAt.forEach((root) => extras.push(rounded[0] * root + rounded[1]));
  }
  return {
    values: [...distinctRoots, ...undefinedAt, ...extras, 0, 1, 2],
    numerator: isSumDifference ? { n1: Math.round(n1), n0: Math.round(n0), roots: undefinedAt } : null,
    specific: distinctRoots,
    keyCheck: (review, _question, grade) => {
      const summary = review.answerSummary;
      const restrictions = [...summary.matchAll(/x\\ne(-?\d+)/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
      assert.deepEqual(restrictions, [...undefinedAt].sort((a, b) => a - b), 'summary restrictions = where the original is undefined');
      const keyedRestrictions = [...String(field(question, 'restrictions').expected).matchAll(/x!=(-?\d+)/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
      assert.deepEqual(restrictions, keyedRestrictions, 'summary restrictions = graded restrictions');
      const [answerLatex] = grab(summary, /answer \$([^$]+)\$/i, 'answer');
      const answer = piece(answerLatex);
      assert.ok(answer && answer.kind === 'x', 'answer parses');
      SAMPLE_X.forEach((x) => { const v = value(x); if (v !== null) assert.ok(near(atX(answer, x), v, 1e-9), `answer equals the original at x=${x}`); });
      const responses = { restrictions: `{x|${restrictions.map((root) => `x!=${root}`).join(' and ')}}`, answer: answer.text };
      if (question.responseFields.some((entry) => entry.id === 'reciprocal-product')) responses['reciprocal-product'] = answer.text;
      if (isSumDifference) {
        const [numeratorLatex] = grab(summary, /Numerator \$([^$]+)\$/, 'numerator');
        const numerator = piece(numeratorLatex);
        SAMPLE_X.forEach((x) => assert.ok(near(atX(numerator, x), n1 * x + n0, 1e-7), 'numerator = oracle numerator'));
        responses['combined-numerator'] = numerator.text;
      }
      const cancelled = question.responseFields.filter((entry) => entry.id.startsWith('cancelled-factor'));
      if (cancelled.length) {
        const [list] = grab(summary, /Cancel (.+?); answer/, 'cancelled factors');
        const factors = mathSpans(list).map((span) => piece(span));
        assert.equal(factors.length, cancelled.length, 'one stated factor per cancelled-factor field');
        factors.forEach((factor, index) => {
          const root = SAMPLE_X[0] - atX(factor, SAMPLE_X[0]);
          assert.ok(near(atX(factor, root), 0, 1e-9) && factorRoots.filter((entry) => near(entry, root)).length >= 2, 'a cancelled factor appears in a numerator and a denominator');
          responses[cancelled[index].id] = factor.text;
        });
      }
      return grade(responses);
    },
  };
};
const rationalNumerator = (question) => rationalOracle(question).numerator;
for (const id of ['sum', 'difference', 'product', 'quotient']) ORACLE[`mm_A2_7F_v2_${id}-rational-degree-variants`] = rationalOracle;

// --- A2.8A -------------------------------------------------------------------------
ORACLE['mm_A2_8A_v2_exponential-growth-decay-ratios'] = (question) => {
  const ys = tableColumn(question, 1);
  const ratios = ys.slice(1).map((y, index) => math.fraction(y, ys[index]));
  assert.ok(ratios.every((ratio) => math.equal(ratio, ratios[0])), 'constant ratio');
  const differences = ys.slice(1).map((y, index) => y - ys[index]);
  const second = differences.slice(1).map((d, index) => d - differences[index]);
  assert.ok(new Set(differences).size > 1 && new Set(second).size > 1, 'not linear, not quadratic');
  const ratio = Number(ratios[0]);
  const verdict = choiceByPattern(question, 'model', /^Exponential$/);
  assert.equal(field(question, 'model').expected, verdict.id, 'graded model = oracle verdict');
  ['ratio-1', 'ratio-2', 'ratio-3'].forEach((id) => assert.ok(near(math.evaluate(String(field(question, id).expected)), ratio), `${id} key`));
  return {
    values: [...ys, ratio, 1 / ratio, ...differences, ...second, 0, 1],
    specific: ys,
    keyCheck: (review) => {
      const [stated] = grab(review.answerSummary, /Each ratio is (\$[^$]+\$|-?\d+(?:\.\d+)?)/, 'ratio');
      const value = piece(stated.replace(/\$/g, ''));
      assert.ok(value && near(value.value, ratio), 'summary ratio = graded ratio');
      assert.match(review.answerSummary, new RegExp(`best model: ${verdict.label}\\b`), 'summary names the keyed choice');
      assert.match(review.answerSummary, ratio > 1 ? /growth/ : /decay/);
    },
  };
};

// --- A2.8C dataModelingLab prediction -------------------------------------------------
const leastSquares = (rows, ys) => {
  const X = math.matrix(rows);
  const Xt = math.transpose(X);
  return math.lusolve(math.multiply(Xt, X), math.multiply(Xt, math.matrix(ys))).toArray().map((row) => row[0]);
};
ORACLE['mm_A2_8C_v2_prediction-model-variants'] = (question) => {
  const points = question.points.map(([x, y]) => [Number(x), Number(y)]);
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const target = Number(question.predictionX);
  const mode = String(question.mode);
  let fit; let prediction; const values = [];
  if (mode.startsWith('linear')) {
    const [b, m] = leastSquares(xs.map((x) => [1, x]), ys);
    fit = { m, b }; prediction = m * target + b;
    values.push(m, b, target * m, math.sum(ys), math.sum(xs.map((x, index) => x * ys[index])));
  } else if (mode.startsWith('quadratic')) {
    const [c, b, a] = leastSquares(xs.map((x) => [1, x, x * x]), ys);
    fit = { a, b, c }; prediction = a * target ** 2 + b * target + c;
    values.push(a, b, c, target ** 2);
  } else {
    const [logA, logBase] = leastSquares(xs.map((x) => [1, x]), ys.map((y) => Math.log(y)));
    fit = { a: Math.exp(logA), base: Math.exp(logBase) }; prediction = fit.a * fit.base ** target;
    values.push(fit.a, fit.base);
  }
  const type = target >= Math.min(...xs) && target <= Math.max(...xs) ? 'interpolation' : 'extrapolation';
  values.push(prediction, Number(prediction.toFixed(3)), target, ...xs, 5, 10, 3);
  return {
    values,
    specific: [prediction, ...Object.values(fit)].map((value) => Number(value.toFixed(3))),
    keyCheck: async (review, unused, grade) => {
      const [statedPrediction, statedX, statedType] = grab(review.answerSummary, /Prediction (-?\d+(?:\.\d+)?) at x=(-?\d+(?:\.\d+)?) \((interpolation|extrapolation)\)/, 'prediction');
      assert.ok(near(statedPrediction, prediction, 1e-6), `summary prediction ${statedPrediction} vs oracle ${prediction}`);
      assert.equal(Number(statedX), target);
      assert.equal(statedType, type, 'summary type = oracle type');
      const coefficient = (name) => {
        const match = new RegExp(`(?:\\$${name}=|${name} )(-?\\d+(?:\\.\\d+)?)`).exec(review.answerSummary);
        assert.ok(match, `summary states ${name}`);
        return Number(match[1]);
      };
      const raw = { predictionX: target, predictionY: Number(statedPrediction), predictionType: statedType };
      for (const name of Object.keys(fit)) {
        const stated = coefficient(name);
        assert.ok(near(stated, fit[name], 1e-6), `${name} ${stated} vs oracle ${fit[name]}`);
        raw[name] = stated;
      }
      return grade(raw);
    },
  };
};

// --- A2.8C response-field model items ---------------------------------------------------
const modelFromPrompt = (question) => {
  const [model] = grab(question.prompt, /\$y=([^$]+)\$/, 'model');
  return fn(model);
};
const predictionKeyCheck = (question, x, prediction, verdictLabel, approx = false) => (review, unused, grade) => {
  const [statedX, relation, statedY] = grab(review.answerSummary, /\$y\((-?\d+(?:\.\d+)?)\)(=|\\approx)(-?\d+(?:\.\d+)?)/, 'prediction');
  assert.equal(Number(statedX), x);
  const tolerance = Number(field(question, 'prediction').numericTolerance ?? 1e-6);
  assert.equal(relation, approx ? '\\approx' : '=');
  assert.ok(Math.abs(Number(statedY) - prediction) <= (approx ? Math.min(tolerance, 0.0005 + 1e-9) : 1e-9), `stated ${statedY} vs oracle ${prediction}`);
  assert.ok(Math.abs(Number(field(question, 'prediction').expected) - prediction) <= 1e-9, 'graded prediction = oracle');
  assert.ok(review.answerSummary.includes(verdictLabel), 'summary states the keyed choice text');
  const choiceField = question.responseFields.find((entry) => entry.choices);
  assert.equal(choiceField.choices.find((choice) => choice.label === verdictLabel)?.id, choiceField.expected, 'oracle verdict = graded choice');
  return grade({ prediction: statedY });
};

ORACLE['mm_A2_8C_v2_decision-model-variants'] = (question) => {
  const model = modelFromPrompt(question);
  const [xText] = grab(question.prompt, /Predict y\((\d+)\)/, 'target');
  const x = Number(xText);
  const prediction = atX(model, x);
  const ys = tableColumn(question, 1);
  ys.forEach((y, index) => assert.ok(near(atX(model, index), y), 'table matches the model'));
  let verdict; let threshold;
  if (/at most (\d+)/.test(question.prompt)) {
    [threshold] = grab(question.prompt, /at most (\d+)/, 'capacity').map(Number);
    verdict = choiceByPattern(question, 'decision', prediction > threshold ? /exceeds capacity/ : /within capacity/);
  } else if (/at least (\d+)/.test(question.prompt)) {
    [threshold] = grab(question.prompt, /at least (\d+)/, 'threshold').map(Number);
    verdict = choiceByPattern(question, 'decision', prediction >= threshold ? /^Approve/ : /^Do not approve/);
  } else {
    [threshold] = grab(question.prompt, /greater than (\d+)/, 'trigger').map(Number);
    verdict = choiceByPattern(question, 'decision', prediction > threshold ? /^Trigger/ : /^Do not trigger/);
  }
  const coefficientTerms = [];
  const deltas = ys.slice(1).map((y, index) => y - ys[index]);
  const ratiosList = ys.slice(1).map((y, index) => y / ys[index]);
  for (let k = 0; k <= 5; k += 1) coefficientTerms.push(atX(model, k));
  const numbersInModel = statedNumbers(question.prompt.match(/\$y=([^$]+)\$/)[1]);
  numbersInModel.forEach((n) => { [3, 4, 5, 9, 16, 25].forEach((p) => coefficientTerms.push(n * p, n ** 5, n ** 4)); });
  return {
    values: [prediction, threshold, Math.abs(prediction - threshold), x, x - 1, ...ys, ...deltas, ...ratiosList, ...coefficientTerms, ...numbersInModel, 3, 9, 16],
    specific: [threshold, ...ys],
    keyCheck: predictionKeyCheck(question, x, prediction, verdict.label),
  };
};

ORACLE['mm_A2_8C_v2_critical-judgment-model-variants'] = (question) => {
  const model = modelFromPrompt(question);
  const [xText] = grab(question.prompt, /at x=(\d+)/, 'target');
  const x = Number(xText);
  const prediction = atX(model, x);
  const [low, high] = grab(question.prompt, /(-?\d+)≤x≤(\d+)/, 'observed range').map(Number);
  assert.ok(x > high, 'the target is outside the observed range');
  let verdict;
  if (/nonnegative/.test(question.prompt)) {
    assert.ok(prediction < 0, 'negative prediction');
    verdict = choiceByPattern(question, 'judgment', /not physically credible/);
  } else {
    verdict = choiceByPattern(question, 'judgment', /^(Use caution|No\.)/);
  }
  const tableValues = tableColumn(question, 1);
  const numbersInModel = statedNumbers(question.prompt.match(/\$y=([^$]+)\$/)[1]);
  const products = numbersInModel.flatMap((n) => [n * x, n * x * x, n * 2 ** x]);
  const yHigh = atX(model, high);
  const doublings = Math.log2(prediction / yHigh);
  return {
    values: [prediction, x, low, high, x - high, x / high, ...tableValues, ...numbersInModel, ...products, yHigh, 2 ** x,
      ...(Number.isInteger(doublings) ? [doublings, 2 ** doublings] : []), 2, 0, 4, 10],
    specific: [prediction, ...numbersInModel],
    keyCheck: predictionKeyCheck(question, x, prediction, verdict.label),
  };
};

ORACLE['mm_A2_8C_v2_interpolation-extrapolation-model-variants'] = (question) => {
  const model = modelFromPrompt(question);
  const [xText] = grab(question.prompt, /Predict at x=(\d+(?:\.\d+)?)/, 'target');
  const x = Number(xText);
  const prediction = atX(model, x);
  const [low, high] = grab(question.prompt, /(-?\d+)≤x≤(\d+)/, 'observed range').map(Number);
  const inside = x >= low && x <= high;
  const verdict = choiceByPattern(question, 'type', inside ? /^Interpolation$/ : /^Extrapolation$/);
  const numbersInModel = statedNumbers(question.prompt.match(/\$y=([^$]+)\$/)[1]);
  const rounded = Number(prediction.toFixed(3));
  const approx = !near(prediction, rounded, 1e-12);
  const products = numbersInModel.flatMap((n) => [n * x, n * x * x, n ** x, Number((n ** x).toFixed(3))]);
  return {
    values: [prediction, rounded, x, low, high, x - high, x * x, ...numbersInModel, ...products, 1.5],
    specific: [x === 1.5 ? rounded : prediction, ...numbersInModel],
    keyCheck: predictionKeyCheck(question, x, prediction, verdict.label, approx),
  };
};

const checkNumbers = (review, question, oracleValues, label) => {
  const allowed = [...oracleValues, ...visibleNumbers(question)].map((value) => Math.abs(Number(value))).filter(Number.isFinite);
  const text = [review.headline, ...review.reasoning, review.commonError, review.connection, review.answerSummary].filter(Boolean).join(" ");
  for (const number of statedNumbers(text)) {
    assert.ok(allowed.some((value) => near(value, number, 1e-9)), `${label}: review states ${number}, which the oracle does not compute from the visible problem`);
  }
};

// Prose claims about the draw's data must hold for THAT draw (verifier finding:
// "grow by a roughly constant factor" for ratios 0.97 .. 2.02, "demand is
// rising" for a table that dips, a negative table value passed over in silence,
// and a no-cancellation argument that tested only one excluded root).
const checkClaims = (question, review, label) => {
  const text = reviewText(review);
  if (Array.isArray(question.points)) {
    const ys = question.points.map(([, y]) => Number(y));
    const ratios = ys.slice(1).map((y, index) => y / ys[index]);
    if (/constant factor/i.test(text)) assert.ok(Math.max(...ratios) / Math.min(...ratios) <= 1.1, `${label}: claims a constant factor, ratios ${ratios.map((r) => r.toFixed(3))}`);
    if (/grow|rising|increas/i.test(review.commonError)) assert.ok(ratios.every((r) => r > 1), `${label}: claims growth the data do not show`);
  }
  if (question.stimulus?.table && /rising|increas/i.test(review.commonError)) {
    const ys = tableColumn(question, 1);
    assert.ok(ys.slice(1).every((y, index) => y > ys[index]), `${label}: claims the table rises, it reads ${ys}`);
  }
  if (/nonnegative/.test(question.prompt) && question.stimulus?.table) {
    const negative = tableColumn(question, 1).filter((y) => y < 0);
    if (negative.length) assert.match(review.reasoning.join(' '), /negative value in the table/, `${label}: the table already shows ${negative}, the review must say it is not credible`);
    assert.doesNotMatch(text, /beyond x=4/, `${label}: the fall is not confined to beyond the data`);
  }
  // Sum/difference: nothing cancels only if the combined numerator is nonzero at
  // EVERY excluded root, and the review must show each of those values.
  if (/\+\\frac|-\\frac|^Subtract/.test(question.prompt) && question.responseFields.some((entry) => entry.id === 'combined-numerator')) {
    const n = rationalNumerator(question);
    const steps = review.reasoning.join(' ');
    for (const root of n.roots) {
      const value = n.n1 * root + n.n0;
      assert.notEqual(value, 0, `${label}: numerator vanishes at ${root}`);
      const at = steps.indexOf(`$x=${root}$`);
      assert.ok(at >= 0, `${label}: the review never evaluates the numerator at x=${root}`);
      const segment = steps.slice(at + `$x=${root}$`.length).split(/;|\.\s/)[0];
      assert.ok(statedNumbers(segment).some((number) => near(number, Math.abs(value))), `${label}: at x=${root} the review should show the numerator value ${value}: "${segment}"`);
    }
  }
};

// ---- the checks ---------------------------------------------------------------------

const IDS = Object.keys(ORACLE);
const reviewText = (review) => [review.headline, ...review.reasoning, review.commonError, review.connection, review.answerSummary]
  .filter(Boolean).join(' \n ');

const checkDraw = async (question, id, label) => {
  assert.deepEqual([...placeholdersUsed(question)], [], `${label} left a placeholder unbound`);
  const review = question.solutionReview;
  assert.ok(review && typeof review === 'object', `${label} has a review`);
  const text = reviewText(review);
  assert.doesNotMatch(text, /\{\{|\}\}|NaN|Infinity|[=($,]\s*(?:undefined|null)\b/, `${label} unresolved value`);
  // Rendering: collapseSigns only folds non-overlapping '+-' runs, so a chain
  // like {{p}}+{{q}}+{{r}} with negatives can leave '2-7+-2' on the projector.
  for (const span of mathSpans(text)) assert.doesNotMatch(span, /[+-]\s*[+-]\s*\d|[(=]\s*\+/, `${label}: doubled or dangling sign in $${span}$`);
  assert.ok(review.reasoning.length >= 2 && review.reasoning.length <= 5, `${label}: ${review.reasoning.length} steps (the projector shows 5)`);
  assert.ok(review.headline && review.headline.length <= 160, `${label} headline length`);
  review.reasoning.forEach((step) => assert.ok(step.length <= 400, `${label} step length`));
  assert.ok(review.commonError && review.commonError.length <= 400, `${label} common error`);
  assert.ok(review.answerSummary && review.answerSummary.length <= 240, `${label} answer summary length`);
  [review.headline, ...review.reasoning, review.commonError, review.answerSummary]
    .forEach((entry) => assert.equal((entry.match(/\$/g) || []).length % 2, 0, `${label}: unbalanced $ in ${entry}`));

  // What both consumers ship is the whole review, unclipped.
  const support = buildPrivateSupport(question).solutionReview;
  assert.deepEqual(support.reasoning, review.reasoning, `${label} buildPrivateSupport keeps every step`);
  assert.equal(support.answerSummary, review.answerSummary);
  const record = roundSolutionRecord({ question, solutionReview: support });
  assert.deepEqual([...record.solutionReview.reasoning], review.reasoning, `${label} roundSolutionRecord keeps every step`);
  assert.equal(record.solutionReview.answerSummary, review.answerSummary);

  const oracle = ORACLE[id](question);
  checkClaims(question, review, label);
  const relations = checkRelations(text, label);
  assert.ok(relations >= 1, `${label}: the review states no checkable relation`);
  checkNumbers(review, question, oracle.values, label);

  // Specific to its draw: a drawn number in the reasoning and in the summary.
  const specific = oracle.specific.map((value) => Math.abs(Number(value)));
  const mentions = (entry) => statedNumbers(entry).some((value) => specific.some((drawn) => Math.abs(drawn - value) < 1e-9));
  assert.ok(review.reasoning.some(mentions), `${label}: the reasoning names nothing from its draw`);
  assert.ok(mentions(review.answerSummary), `${label}: the answer summary names nothing from its draw`);

  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `${label}: ${plan.reason}`);
  const grade = async (payload) => {
    if (plan.privateGrading.pathToolId === 'dataModelingLab') {
      const graded = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: payload });
      assert.equal(graded.isCorrect, true, `${label}: the lab grader rejects the summary ${JSON.stringify(payload)}`);
      return graded;
    }
    const graded = await mathPath.gradePathToolResponse(plan.privateGrading, { responses: payload });
    for (const key of Object.keys(payload)) {
      const part = graded.parts.find((entry) => entry.id === key);
      assert.ok(part && part.isCorrect, `${label}: the grader rejects the summary's ${key} = ${payload[key]}`);
    }
    return graded;
  };
  await oracle.keyCheck(review, question, grade);
  return relations;
};

test('every variant: 40 draws whose review is a correct worked solution of that draw', async (t) => {
  for (const id of IDS) {
    const doc = template(id);
    const variants = Array.isArray(doc.variants) && doc.variants.length ? doc.variants : [null];
    for (let index = 0; index < variants.length; index += 1) {
      // Pin the variant so every one is exercised, whatever the seeded pick.
      const only = variants[index] ? { ...doc, variants: [variants[index]] } : doc;
      let relations = 0;
      const distinct = new Set();
      for (const seed of PER_VARIANT_SEEDS) {
        const generated = generatePathInstance(only, seed);
        assert.ok(generated.question, `${id} v${index} ${seed}: ${generated.reason}`);
        relations += await checkDraw(generated.question, id, `${id} v${index} ${seed}`);
        distinct.add(reviewText(generated.question.solutionReview));
      }
      t.diagnostic(`${id} v${index}: ${distinct.size} distinct reviews, ${relations} relations checked`);
      assert.ok(distinct.size >= 3, `${id} v${index}: the review does not follow the draw`);
    }
  }
});

test('the 30 recap-probe draws of every template (natural variant pick) carry a correct worked solution', async () => {
  for (const id of IDS) {
    for (const seed of RECAP_SEEDS) {
      const generated = generatePathInstance(template(id), seed);
      assert.ok(generated.question, `${id} ${seed}: ${generated.reason}`);
      await checkDraw(generated.question, id, `${id} ${seed}`);
    }
  }
});

// ---- pinned: the graded content is the committed content ------------------------------

const compactParameters = (parameters = {}) => Object.entries(parameters).map(([name, spec]) => (spec.type === 'choice'
  ? `${name}:choice[${spec.values.join('|')}]`
  : `${name}:${spec.type || 'int'} ${spec.min}..${spec.max}${spec.step ? `/${spec.step}` : ''}${spec.exclude ? ` !${spec.exclude.join(',')}` : ''}`));
const graded = (effective) => {
  const out = {};
  if (effective.responseFields) {
    out.fields = effective.responseFields.map((entry) => [entry.id, entry.expected,
      ...(entry.choices ? [entry.choices.map((choice) => `${choice.id}:${choice.label}`)] : []),
      ...(entry.numericTolerance != null ? [entry.numericTolerance] : []), ...(entry.equivalence ? [entry.equivalence] : [])]);
  }
  if (effective.analysisRequests) out.analysis = effective.analysisRequests.map((entry) => [entry.id, entry.expected, ...(entry.acceptedAnswers ? [entry.acceptedAnswers] : [])]);
  if (effective.pointTasks) out.points = effective.pointTasks.map((entry) => [entry.id, entry.x, entry.expected]);
  if (effective.inequalities) out.inequalities = effective.inequalities.map((entry) => [entry.m, entry.b, entry.relation]);
  if (effective.mode) out.mode = effective.mode;
  if (effective.points) out.data = effective.points;
  if (effective.predictionX != null) out.predictionX = effective.predictionX;
  const tolerances = Object.keys(effective).filter((key) => key.endsWith('Tolerance')).sort();
  if (tolerances.length) out.tolerances = tolerances.map((key) => [key, effective[key]]);
  out.prompt = effective.prompt;
  out.parameters = compactParameters(effective.generator?.parameters);
  if (effective.generator?.constraints) out.constraints = effective.generator.constraints;
  out.cell = [effective.difficultyBand, effective.dok, effective.taskType, effective.type ?? null];
  return out;
};

test('prompts, keys, choices, tolerances, parameters, constraints and cells keep their committed values', () => {
  for (const id of IDS) {
    const rows = effectivePathVariants(template(id)).map(({ template: effective }) => graded(effective));
    assert.deepEqual(rows, PINNED[id], `${id} graded content`);
  }
});

test('committed derived values are unchanged; added ones are display-only (used by the review alone)', () => {
  for (const id of IDS) {
    effectivePathVariants(template(id)).forEach(({ template: effective }, index) => {
      const derived = effective.generator?.derived || {};
      const committed = PINNED_DERIVED[id][index];
      for (const [name, expression] of Object.entries(committed)) assert.equal(derived[name], expression, `${id} v${index} derived ${name}`);
      const added = Object.keys(derived).filter((name) => !(name in committed));
      if (!added.length) return;
      const { solutionReview: _review, generator, ...visibleAndGraded } = effective;
      const elsewhere = JSON.stringify([visibleAndGraded, generator.constraints || [], Object.entries(derived)
        .filter(([name]) => name in committed).map(([, expression]) => expression)]);
      for (const name of added) {
        assert.ok(JSON.stringify(effective.solutionReview).includes(`{{${name}`), `${id} v${index}: ${name} is used by the review`);
        assert.doesNotMatch(elsewhere, new RegExp(`\\{\\{${name}\\b|\\b${name}\\b`), `${id} v${index}: added ${name} feeds nothing but the review`);
      }
    });
  }
});

// The 8C prediction family's own widening test pins its derived values, so this
// rewrite adds none there.
test('the prediction family adds no derived values (pathTemplateWidening_a2Regression pins them)', () => {
  effectivePathVariants(template('mm_A2_8C_v2_prediction-model-variants')).forEach(({ template: effective }, index) => {
    assert.deepEqual(Object.keys(effective.generator.derived), Object.keys(PINNED_DERIVED['mm_A2_8C_v2_prediction-model-variants'][index]));
  });
});

// Committed values (HEAD before this rewrite), one row per effective variant.
const PINNED = {
  'mm_A2_2A_v2_root-family-graph': [
    {"analysis":[["domain",["[0,∞)"]],["range",["[0,∞)"]]],"points":[["p0",0,[0,0]],["p1","{{xa}}",["{{xa}}","{{ra}}"]],["p4","{{xb}}",["{{xb}}","{{rb}}"]],["p9","{{xc}}",["{{xc}}","{{rc}}"]]],"prompt":"Construct the parent square-root graph $f(x)=\\sqrt{x}$. Plot the endpoint and the points at $x={{xa}}$, $x={{xb}}$, and $x={{xc}}$, sketch the curve, then state its domain and range.","parameters":["ra:int 1..3","rb:int 2..4","rc:int 3..5"],"constraints":["ra < rb","rb < rc"],"cell":[2,2,"representationTranslation","functionInvestigation"]},
    {"analysis":[["domain",["(-∞,∞)","all real numbers"]],["range",["(-∞,∞)","all real numbers"]]],"points":[["pm8","{{xnl}}",["{{xnl}}","{{ynl}}"]],["pm1","{{xns}}",["{{xns}}","{{yns}}"]],["p0",0,[0,0]],["p1","{{xps}}",["{{xps}}","{{ps}}"]],["p8","{{xpl}}",["{{xpl}}","{{pl}}"]]],"prompt":"Construct the parent cube-root graph $f(x)=\\sqrt[3]{x}$. Plot the points at $x={{xnl}}$, $x={{xns}}$, $x=0$, $x={{xps}}$, and $x={{xpl}}$, sketch the curve through both sides of the origin, then state its domain and range.","parameters":["omitNeg:int 1..3","omitPos:int 1..3"],"cell":[2,2,"representationTranslation","functionInvestigation"]},
  ],
  'mm_A2_2A_v2_symmetry-family-graph': [
    {"analysis":[["range",["[0,∞)"]],["symmetry",["x=0","y-axis","y axis"]]],"points":[["pm2","{{nb}}",["{{nb}}","{{b}}"]],["pm1","{{na}}",["{{na}}","{{a}}"]],["p0",0,[0,0]],["p1","{{a}}",["{{a}}","{{a}}"]],["p2","{{b}}",["{{b}}","{{b}}"]]],"prompt":"Construct the parent absolute-value graph $f(x)=|x|$. Plot the vertex and the points at $x=\\pm{{a}}$ and $x=\\pm{{b}}$, sketch the V-shape, then state the range and line of symmetry.","parameters":["a:int 1..5","b:int 2..6"],"constraints":["a < b"],"cell":[3,2,"interpretation","functionInvestigation"]},
    {"analysis":[["range",["(-∞,∞)","all real numbers"]],["symmetry",["(0,0)"],["(0,0)","0,0","origin"]]],"points":[["pm2","{{nb}}",["{{nb}}","{{ncb}}"]],["pm1","{{na}}",["{{na}}","{{nca}}"]],["p0",0,[0,0]],["p1","{{a}}",["{{a}}","{{ca}}"]],["p2","{{b}}",["{{b}}","{{cb}}"]]],"prompt":"Construct the parent cubic graph $f(x)=x^3$. Plot the points at $x=0$, $x=\\pm{{a}}$, and $x=\\pm{{b}}$, sketch the S-shaped curve, then state the range and center of rotational symmetry.","parameters":["a:int 1..2","b:int 2..3"],"constraints":["a < b"],"cell":[3,2,"interpretation","functionInvestigation"]},
  ],
  'mm_A2_3F_v2_two-inclusive-overlap': [
    {"inequalities":[["{{m1}}","{{b1}}",">="],["{{m2}}","{{b2}}","<="]],"mode":"inequalities","prompt":"Solve the system by constructing both inequality graphs and shading ONLY their overlap: $y\\ge {{m1}}x{{b1|signed}}$ and $y\\le {{m2}}x{{b2|signed}}$.","parameters":["m1:int 1..3","m2:int -3..-1","b1:int -4..0","b2:int 3..8"],"cell":[2,2,"representationTranslation","systemsWorkspace"]},
  ],
  'mm_A2_3F_v2_mixed-strict-overlap': [
    {"inequalities":[["{{m1}}","{{b1}}",">"],["{{m2}}","{{b2}}","<="]],"mode":"inequalities","prompt":"Solve the system graphically: $y>{{m1}}x{{b1|signed}}$ and $y\\le {{m2}}x{{b2|signed}}$. Construct the strict and inclusive boundaries correctly and shade only the overlap.","parameters":["m1:int 1..3","m2:int -3..-1","b1:int -4..0","b2:int 3..8"],"cell":[3,2,"representationTranslation","systemsWorkspace"]},
    {"inequalities":[["{{m1}}","{{b1}}",">"],["{{m2}}","{{b2}}","<="],[0,"{{c}}",">="]],"mode":"inequalities","prompt":"Solve the THREE-inequality system by constructing every boundary with the correct solid/dashed style and shading ONLY the common overlap: $y>{{m1}}x{{b1|signed}}$, $y\\le{{m2}}x{{b2|signed}}$, and $y\\ge{{c}}$.","parameters":["m1:int 1..3","m2:int -3..-1","b1:int -5..-2","b2:int 4..8","c:int -3..1"],"cell":[4,2,"representationTranslation","systemsWorkspace"]},
  ],
  'mm_A2_7F_v2_sum-rational-degree-variants': [
    {"fields":[["combined-numerator","{{N1}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}}}","setBuilder"],["answer","({{N1}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}})))","rationalExpression"]],"prompt":"Add $\\frac{{{A}}}{x-({{r}})}+\\frac{{{B}}}{x-({{s}})}$. Use the least common denominator, combine the numerators, simplify completely, and preserve every original restriction.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0"],"constraints":["r!=s","N1!=0"],"cell":[2,2,"procedural",null]},
    {"fields":[["combined-numerator","{{N1}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}} and x!={{t}}}","setBuilder"],["answer","({{N1}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}}))*(x-({{t}})))","rationalExpression"]],"prompt":"Add $\\frac{{{A}}}{(x-({{r}}))(x-({{s}}))}+\\frac{{{B}}}{(x-({{r}}))(x-({{t}}))}$. Build the quadratic-denominator LCD, combine and simplify the numerator, and preserve all original restrictions.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0","t:int -6..6 !0"],"constraints":["r!=s","r!=t","s!=t","N1!=0","atR!=0"],"cell":[4,2,"procedural",null]},
    {"fields":[["combined-numerator","{{A}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}}}","setBuilder"],["answer","({{A}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}})))","rationalExpression"]],"prompt":"Add $\\frac{{{A}}}{x-({{r}})}+\\frac{{{B}}}{(x-({{r}}))(x-({{s}}))}$. Use the mixed degree-1/degree-2 LCD, combine the numerator, simplify, and keep all original restrictions.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0"],"constraints":["r!=s","atR!=0"],"cell":[3,2,"procedural",null]},
  ],
  'mm_A2_7F_v2_difference-rational-degree-variants': [
    {"fields":[["combined-numerator","{{N1}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}}}","setBuilder"],["answer","({{N1}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}})))","rationalExpression"]],"prompt":"Subtract $\\frac{{{B}}}{x-({{s}})}$ from $\\frac{{{A}}}{x-({{r}})}$. Build the LCD, distribute the subtraction through the second numerator contribution, simplify, and preserve the original restrictions.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0"],"constraints":["r!=s","N1!=0"],"cell":[2,2,"procedural",null]},
    {"fields":[["combined-numerator","{{N1}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}} and x!={{t}}}","setBuilder"],["answer","({{N1}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}}))*(x-({{t}})))","rationalExpression"]],"prompt":"Subtract $\\frac{{{B}}}{(x-({{r}}))(x-({{t}}))}$ from $\\frac{{{A}}}{(x-({{r}}))(x-({{s}}))}$. Use the factored LCD, distribute the subtraction correctly, simplify, and preserve every original restriction.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0","t:int -6..6 !0"],"constraints":["r!=s","r!=t","s!=t","N1!=0","atR!=0"],"cell":[4,2,"procedural",null]},
    {"fields":[["combined-numerator","{{A}}*x+({{N0}})"],["restrictions","{x|x!={{r}} and x!={{s}}}","setBuilder"],["answer","({{A}}*x+({{N0}}))/((x-({{r}}))*(x-({{s}})))","rationalExpression"]],"prompt":"Simplify $\\frac{{{A}}}{x-({{r}})}-\\frac{{{B}}}{(x-({{r}}))(x-({{s}}))}$. Use the mixed-degree LCD, distribute the subtraction, and preserve both restrictions.","parameters":["A:int -7..7 !0","B:int -7..7 !0","r:int -6..6 !0","s:int -6..6 !0"],"constraints":["r!=s","atR!=0"],"cell":[3,2,"procedural",null]},
  ],
  'mm_A2_7F_v2_product-rational-degree-variants': [
    {"fields":[["cancelled-factor","x-({{b}})"],["restrictions","{x|x!={{b}} and x!={{c}}}","setBuilder"],["answer","(x-({{a}}))/(x-({{c}}))","rationalExpression"]],"prompt":"Multiply $\\frac{x-({{a}})}{x-({{b}})}\\cdot\\frac{x-({{b}})}{x-({{c}})}$. Factor/cancel only complete common factors, give the simplified product, and keep all restrictions from the original denominators.","parameters":["a:int -7..7 !0","b:int -7..7 !0","c:int -7..7 !0"],"constraints":["a!=b","a!=c","b!=c"],"cell":[2,2,"application",null]},
    {"fields":[["cancelled-factor-1","x-({{a}})"],["cancelled-factor-2","x-({{c}})"],["restrictions","{x|x!={{a}} and x!={{c}} and x!={{d}} and x!={{f}}}","setBuilder"],["answer","((x-({{b}}))*(x-({{e}})))/((x-({{d}}))*(x-({{f}})))","rationalExpression"]],"prompt":"Multiply $\\frac{(x-({{a}}))(x-({{b}}))}{(x-({{c}}))(x-({{d}}))}\\cdot\\frac{(x-({{c}}))(x-({{e}}))}{(x-({{a}}))(x-({{f}}))}$. Cancel only complete common factors, simplify completely, and preserve all restrictions from the original quadratic denominators.","parameters":["a:int -8..8 !0","b:int -8..8 !0","c:int -8..8 !0","d:int -8..8 !0","e:int -8..8 !0","f:int -8..8 !0"],"constraints":["a!=b","a!=c","a!=d","a!=e","a!=f","b!=c","b!=d","b!=e","b!=f","c!=d","c!=e","c!=f","d!=e","d!=f","e!=f"],"cell":[4,2,"application",null]},
    {"fields":[["cancelled-factor","x-({{b}})"],["restrictions","{x|x!={{b}} and x!={{d}} and x!={{e}}}","setBuilder"],["answer","((x-({{a}}))*(x-({{c}})))/((x-({{d}}))*(x-({{e}})))","rationalExpression"]],"prompt":"Multiply $\\frac{x-({{a}})}{x-({{b}})}\\cdot\\frac{(x-({{b}}))(x-({{c}}))}{(x-({{d}}))(x-({{e}}))}$. Simplify by factor cancellation and preserve every restriction from the original degree-1 and degree-2 denominators.","parameters":["a:int -8..8 !0","b:int -8..8 !0","c:int -8..8 !0","d:int -8..8 !0","e:int -8..8 !0"],"constraints":["a!=b","a!=c","a!=d","a!=e","b!=c","b!=d","b!=e","c!=d","c!=e","d!=e"],"cell":[3,2,"application",null]},
  ],
  'mm_A2_7F_v2_quotient-rational-degree-variants': [
    {"fields":[["reciprocal-product","((x-({{a}}))*(x-({{d}})))/((x-({{b}}))*(x-({{c}})))","rationalExpression"],["restrictions","{x|x!={{b}} and x!={{c}} and x!={{d}}}","setBuilder"],["answer","((x-({{a}}))*(x-({{d}})))/((x-({{b}}))*(x-({{c}})))","rationalExpression"]],"prompt":"Divide $\\frac{x-({{a}})}{x-({{b}})}\\div\\frac{x-({{c}})}{x-({{d}})}$. Rewrite using the reciprocal, simplify fully, and list every value excluded by the original expressions or by making the divisor equal to zero.","parameters":["a:int -8..8 !0","b:int -8..8 !0","c:int -8..8 !0","d:int -8..8 !0"],"constraints":["a!=b","a!=c","a!=d","b!=c","b!=d","c!=d"],"cell":[2,2,"application",null]},
    {"fields":[["restrictions","{x|x!={{a}} and x!={{c}} and x!={{d}} and x!={{e}} and x!={{f}}}","setBuilder"],["answer","((x-({{b}}))*(x-({{f}})))/((x-({{d}}))*(x-({{e}})))","rationalExpression"]],"prompt":"Divide $\\frac{(x-({{a}}))(x-({{b}}))}{(x-({{c}}))(x-({{d}}))}\\div\\frac{(x-({{a}}))(x-({{e}}))}{(x-({{c}}))(x-({{f}}))}$. Multiply by the reciprocal, cancel complete factors, simplify, and preserve all original and divisor-zero restrictions.","parameters":["a:int -9..9 !0","b:int -9..9 !0","c:int -9..9 !0","d:int -9..9 !0","e:int -9..9 !0","f:int -9..9 !0"],"constraints":["a!=b","a!=c","a!=d","a!=e","a!=f","b!=c","b!=d","b!=e","b!=f","c!=d","c!=e","c!=f","d!=e","d!=f","e!=f"],"cell":[4,2,"application",null]},
    {"fields":[["restrictions","{x|x!={{b}} and x!={{c}} and x!={{d}} and x!={{e}} and x!={{f}}}","setBuilder"],["answer","((x-({{a}}))*(x-({{e}}))*(x-({{f}})))/((x-({{b}}))*(x-({{c}}))*(x-({{d}})))","rationalExpression"]],"prompt":"Divide $\\frac{x-({{a}})}{x-({{b}})}\\div\\frac{(x-({{c}}))(x-({{d}}))}{(x-({{e}}))(x-({{f}}))}$. Multiply by the reciprocal, simplify completely, and preserve restrictions from both original expressions plus the divisor's zeros.","parameters":["a:int -9..9 !0","b:int -9..9 !0","c:int -9..9 !0","d:int -9..9 !0","e:int -9..9 !0","f:int -9..9 !0"],"constraints":["a!=b","a!=c","a!=d","a!=e","a!=f","b!=c","b!=d","b!=e","b!=f","c!=d","c!=e","c!=f","d!=e","d!=f","e!=f"],"cell":[3,2,"application",null]},
  ],
  'mm_A2_8A_v2_exponential-growth-decay-ratios': [
    {"fields":[["ratio-1","{{r}}"],["ratio-2","{{r}}"],["ratio-3","{{r}}"],["model","exponential",["linear:Linear","quadratic:Quadratic","exponential:Exponential"]]],"prompt":"Analyze the raw data. Compute each consecutive output ratio, then select the model family best supported by the evidence.","parameters":["a:int 1..8","r:int 2..4"],"cell":[3,2,"interpretation",null]},
    {"fields":[["ratio-1","1/{{r}}"],["ratio-2","1/{{r}}"],["ratio-3","1/{{r}}"],["model","exponential",["linear:Linear","quadratic:Quadratic","exponential:Exponential"]]],"prompt":"Analyze the raw data. Compute each consecutive output ratio, then select the model family best supported by the evidence.","parameters":["a:int 1..6","r:int 2..4"],"cell":[3,2,"interpretation",null]},
  ],
  'mm_A2_8C_v2_prediction-model-variants': [
    {"mode":"linearFitPrediction","data":[[-2,"{{ym2}}"],[-1,"{{ym1}}"],[0,"{{y0}}"],[1,"{{y1}}"],[2,"{{y2}}"]],"predictionX":4,"tolerances":[["interceptTolerance",0.03],["predictionTolerance",0.08],["slopeTolerance",0.02]],"prompt":"Use linear regression technology on all five observations, $(-2,{{ym2}})$, $(-1,{{ym1}})$, $(0,{{y0}})$, $(1,{{y1}})$, and $(2,{{y2}})$, then predict y when x=4. Enter the fitted m and b as supporting work and the model prediction at x=4.","parameters":["m:int -6..6 !0","b:int -10..10","e:int 1..2"],"cell":[2,2,"modeling","dataModelingLab"]},
    {"mode":"quadraticFitPrediction","data":[[-2,"{{ym2}}"],[-1,"{{ym1}}"],[0,"{{y0}}"],[1,"{{y1}}"],[2,"{{y2}}"]],"predictionX":0.5,"tolerances":[["predictionTolerance",0.08],["quadraticATolerance",0.02],["quadraticBTolerance",0.03],["quadraticCTolerance",0.04]],"prompt":"Use quadratic regression technology on all five observations, $(-2,{{ym2}})$, $(-1,{{ym1}})$, $(0,{{y0}})$, $(1,{{y1}})$, and $(2,{{y2}})$, then predict y when x=0.5. Enter a, b, and c as supporting work and the model prediction.","parameters":["a:int -3..3 !0","b:int -5..5","c:int -8..8","e:int 1..2"],"cell":[3,2,"modeling","dataModelingLab"]},
    {"mode":"exponentialFitPrediction","data":[[-2,"{{ym2}}"],[-1,"{{ym1}}"],[0,"{{y0}}"],[1,"{{y1}}"],[2,"{{y2}}"]],"predictionX":3,"tolerances":[["exponentialATolerance",0.03],["exponentialBaseTolerance",0.015],["predictionTolerance",0.12]],"prompt":"{{scenario}} Use exponential regression technology on all five positive observations, then predict y when x=3. Enter the fitted a and base as supporting work and the prediction.","parameters":["a:int 5..20","base:choice[1.4|1.5|1.8|2]","q:choice[1.1|1.2]","scenario:choice[The table tracks the area, in square meters, covered by an algae bloom; x is days from the reference survey at x=0.|The table tracks a bacteria culture, in thousands of cells; x is hours from the reference count at x=0.|The table tracks the mass, in grams, of a yeast culture; x is hours from the reference weighing at x=0.|The table tracks downloads of a new app, in thousands; x is weeks from the reference week at x=0.|The table tracks views of a viral video, in thousands; x is days from the reference day at x=0.|The table tracks the area, in square kilometers, covered by an invasive vine; x is years from the reference survey at x=0.|The table tracks followers of a new social media account, in thousands; x is months from the reference month at x=0.|The table tracks a fruit fly population in a lab jar, in hundreds of flies; x is weeks from the reference count at x=0.|The table tracks the area, in square centimeters, of a mold colony on bread; x is days from the reference photo at x=0.|The table tracks the area, in square meters, of duckweed covering a pond; x is days from the reference survey at x=0.|The table tracks shares of a popular post, in thousands; x is hours from the reference check at x=0.|The table tracks new flu cases per week in the early weeks of an outbreak, in hundreds; x is weeks from the reference week at x=0.|The table tracks a rabbit population on an island, in hundreds of rabbits; x is years from the reference census at x=0.|The table tracks subscribers to a new streaming channel, in thousands; x is months from the reference month at x=0.|The table tracks daily rides on a new scooter-share service, in hundreds; x is months from the reference month at x=0.|The table tracks the area, in square meters, covered by a floating water hyacinth mat on a lake; x is weeks from the reference survey at x=0.]"],"cell":[4,2,"modeling","dataModelingLab"]},
  ],
  'mm_A2_8C_v2_decision-model-variants': [
    {"fields":[["prediction","{{pred}}"],["decision","exceed",["exceed:Yes. The predicted amount exceeds capacity.","within:No. The predicted amount stays within capacity."]]],"prompt":"A staffing model fitted to the observed data is $y={{m}}x+({{b}})$. The table covers x=0 through 3. Management can staff at most {{threshold}} units at x=4. Predict y(4), then decide whether the model says capacity will be exceeded.","parameters":["m:int 2..8","b:int 10..40","margin:int 2..8"],"cell":[3,2,"application",null]},
    {"fields":[["prediction","{{pred}}"],["decision","do-not-approve",["approve:Approve; predicted demand meets the threshold.","do-not-approve:Do not approve; predicted demand is below the threshold."]]],"prompt":"A quadratic demand model fitted to the data is $y={{a}}x^2+({{b}})x+{{c}}$. A plan is approved only if predicted demand at x=4 is at least {{threshold}}. Predict y(4), then decide whether the model supports approval.","parameters":["a:int 1..3","b:int -2..5","c:int 10..30","margin:int 2..8"],"cell":[3,2,"application",null]},
    {"fields":[["prediction","{{pred}}"],["decision","upgrade",["upgrade:Trigger the upgrade; the prediction exceeds the threshold.","hold:Do not trigger; the prediction does not exceed the threshold."]]],"prompt":"An exponential growth model fitted to the data is $y={{a}}({{r}})^x$. A facility upgrade is triggered if the predicted amount at x=5 is greater than {{threshold}}. Predict y(5), then decide whether to trigger the upgrade.","parameters":["a:int 2..6","r:int 2..3","margin:int 1..10"],"cell":[3,2,"application",null]},
  ],
  'mm_A2_8C_v2_critical-judgment-model-variants': [
    {"fields":[["prediction","{{pred}}"],["judgment","caution",["caution:Use caution: x=80 is far outside the observed range, so the relationship may not remain linear.","guaranteed:Trust it automatically because a fitted linear model is exact outside the data range."]]],"prompt":"A linear model from data observed only for 0≤x≤10 is $y={{m}}x+({{b}})$. Someone uses it at x=80. Compute the model prediction, then judge the claim that the prediction is automatically reliable because the fitted line was strong on the observed interval.","parameters":["m:int 1..6","b:int 0..30"],"cell":[3,3,"conceptual",null]},
    {"fields":[["prediction","{{pred}}"],["judgment","not-credible",["not-credible:The negative extrapolation is not physically credible for a nonnegative measurement; the model should not be extended blindly.","credible:Any value from a quadratic formula is physically valid, even far outside the observed range."]]],"prompt":"A quadratic model for a nonnegative physical measurement was fitted only for 0≤x≤4: $y=-{{a}}x^2+{{c}}$. Compute the model prediction at x=10, then judge whether a negative predicted measurement should be treated as physically credible.","parameters":["a:int 1..3","c:int 20..40"],"constraints":["pred<0"],"cell":[4,3,"conceptual",null]},
    {"fields":[["prediction","{{pred}}"],["judgment","caution",["caution:No. This is a distant exponential extrapolation; resource limits or changing conditions may invalidate continued doubling.","guaranteed:Yes. An exponential fit over 0≤x≤4 guarantees continued doubling through x=15."]]],"prompt":"An exponential population model fitted only for 0≤x≤4 is $y={{a}}(2)^x$. Compute its prediction at x=15, then judge whether the model alone is enough to claim the population will actually reach that value.","parameters":["a:int 2..8"],"cell":[4,3,"conceptual",null]},
  ],
  'mm_A2_8C_v2_interpolation-extrapolation-model-variants': [
    {"fields":[["prediction","{{pred}}",0.001],["type","interpolation",["interpolation:Interpolation","extrapolation:Extrapolation"]]],"prompt":"Data were observed for 0≤x≤5 and modeled by $y={{m}}x+({{b}})$. Predict at x=2.5 and classify the prediction.","parameters":["m:int -6..6 !0","b:int -10..10"],"cell":[3,2,"interpretation",null]},
    {"fields":[["prediction","{{pred}}"],["type","extrapolation",["interpolation:Interpolation","extrapolation:Extrapolation"]]],"prompt":"Data were observed for -2≤x≤2 and modeled by $y={{a}}x^2+({{b}})x+{{c}}$. Predict at x=5 and classify the prediction.","parameters":["a:int -3..3 !0","b:int -5..5","c:int -8..8"],"cell":[3,2,"interpretation",null]},
    {"fields":[["prediction","{{pred}}",0.02],["type","interpolation",["interpolation:Interpolation","extrapolation:Extrapolation"]]],"prompt":"Data were observed for 0≤x≤4 and modeled by $y={{a}}({{r}})^x$. Predict at x=1.5 and classify the prediction.","parameters":["a:int 2..8","r:choice[1.5|2|2.5]"],"cell":[3,2,"interpretation",null]},
  ],
};

// Committed generator.derived per effective variant (HEAD before this rewrite).
const PINNED_DERIVED = {
  'mm_A2_2A_v2_root-family-graph': [
    {"xa":"ra^2","xb":"rb^2","xc":"rc^2","xMax":"xStep*ceil(max(11, xc + 2)/xStep)","xStep":"1 + (xc > 9) + 3*(xc > 16)"},
    {"ns":"1 + (omitNeg == 1)","nl":"3 - (omitNeg == 3)","ps":"1 + (omitPos == 1)","pl":"3 - (omitPos == 3)","xnl":"-(nl^3)","xns":"-(ns^3)","xps":"ps^3","xpl":"pl^3","ynl":"-nl","yns":"-ns","xMin":"-xStep*ceil((nl^3 + 2)/xStep)","xMax":"xStep*ceil((pl^3 + 2)/xStep)","xStep":"2 + 3*(max(nl, pl) == 3)"},
  ],
  'mm_A2_2A_v2_symmetry-family-graph': [
    {"na":"-a","nb":"-b","xMax":"max(6, b + 1)","xMin":"-max(6, b + 1)","yMax":"max(7, b + 1)"},
    {"na":"-a","nb":"-b","ca":"a^3","cb":"b^3","nca":"-(a^3)","ncb":"-(b^3)","yMax":"yStep*ceil((b^3 + 2)/yStep)","yMin":"-yStep*ceil((b^3 + 2)/yStep)","yStep":"2 + 3*(b == 3)"},
  ],
  'mm_A2_3F_v2_two-inclusive-overlap': [
    {},
  ],
  'mm_A2_3F_v2_mixed-strict-overlap': [
    {},
    {},
  ],
  'mm_A2_7F_v2_sum-rational-degree-variants': [
    {"N1":"A+B","N0":"-A*s-B*r"},
    {"N1":"A+B","N0":"-A*t-B*s","atR":"A*(r-t)+B*(r-s)"},
    {"N0":"-A*s+B","atR":"A*(r-s)+B"},
  ],
  'mm_A2_7F_v2_difference-rational-degree-variants': [
    {"N1":"A-B","N0":"-A*s+B*r"},
    {"N1":"A-B","N0":"-A*t+B*s","atR":"A*(r-t)-B*(r-s)"},
    {"N0":"-A*s-B","atR":"A*(r-s)-B"},
  ],
  'mm_A2_7F_v2_product-rational-degree-variants': [
    {},
    {},
    {},
  ],
  'mm_A2_7F_v2_quotient-rational-degree-variants': [
    {},
    {},
    {},
  ],
  'mm_A2_8A_v2_exponential-growth-decay-ratios': [
    {"y0":"a","y1":"a*r","y2":"a*r*r","y3":"a*r*r*r"},
    {"y0":"a*r*r*r","y1":"a*r*r","y2":"a*r","y3":"a"},
  ],
  'mm_A2_8C_v2_prediction-model-variants': [
    {"ym2":"-2*m+b+e","ym1":"-m+b-2*e","y0":"b+2*e","y1":"m+b-2*e","y2":"2*m+b+e","pred":"4*m+b"},
    {"ym2":"4*a-2*b+c+e","ym1":"a-b+c-2*e","y0":"c","y1":"a+b+c+2*e","y2":"4*a+2*b+c-e","pred":"0.25*a+0.5*b+c"},
    {"ym2":"a*pow(base,-2)*q","ym1":"a*pow(base,-1)/q","y0":"a","y1":"a*base/q","y2":"a*base*base*q","pred":"round(a*pow(base,3)*1000)/1000"},
  ],
  'mm_A2_8C_v2_decision-model-variants': [
    {"y0":"b","y1":"m+b","y2":"2*m+b","y3":"3*m+b","pred":"4*m+b","threshold":"pred-margin"},
    {"y0":"c","y1":"a+b+c","y2":"4*a+2*b+c","y3":"9*a+3*b+c","pred":"16*a+4*b+c","threshold":"pred+margin"},
    {"y0":"a","y1":"a*r","y2":"a*r*r","y3":"a*r*r*r","pred":"a*pow(r,5)","threshold":"pred-margin"},
  ],
  'mm_A2_8C_v2_critical-judgment-model-variants': [
    {"pred":"80*m+b"},
    {"y2":"-4*a+c","y4":"-16*a+c","pred":"-100*a+c"},
    {"y2":"4*a","y4":"16*a","pred":"32768*a"},
  ],
  'mm_A2_8C_v2_interpolation-extrapolation-model-variants': [
    {"pred":"2.5*m+b"},
    {"pred":"25*a+5*b+c"},
    {"pred":"a*pow(r,1.5)"},
  ],
};
