/*
 * JOB K — THE pointsAndIntervals FAMILY'S WORKED SOLUTION OF THE QUESTION ITSELF.
 *
 * workedSolution(question) is what the closed-question review panel shows
 * when an item has no authored solution steps (closedQuestionReview.js): the
 * question's OWN inequality, sign chart, radical, point or number line worked
 * the way the family's siblings work theirs. This file draws every shape the
 * family claims, from the same real sources its support-family test uses —
 *   - intervalNumberLine: the Algebra II honors corpus (V5-compiled), the
 *     catalog examples, and the Path number-line templates instantiated over
 *     many seeds: graph a given inequality, solve a linear one (a negative
 *     coefficient included), solve a factored one, read a condition in words;
 *   - signSolutionAnalyzer: the sample-file charts, the V5 sign-chart and
 *     radical items, and polynomial / rational / radical fixtures;
 *   - orderedPair: generated plotted points over many seeds, V5 "where do the
 *     lines meet" items, a horizontal line;
 *   - numberLine: generated over many seeds, and the composed-workflow fixture;
 *   - stepAlgebra: the shared graders' linear-inequality fixtures plus seeded
 *     ax + b REL c, c REL ax + b, x on both sides, brackets and decimals;
 * plus hand-made edges (all real numbers, a single point, "and", a fraction
 * or decimal endpoint, a zero coordinate, zero on the number line, no real
 * solution, a chart with nothing to select) and the shapes it must refuse.
 *
 * Every step is read back from its TEXT and recomputed here (mathjs and plain
 * comparisons), never with the family's helpers:
 *   - each solving step states an inequality with the same solution set as
 *     the original, reached by exactly the move it names (subtract, add,
 *     divide, with the flip a negative divisor needs), and the check value is
 *     on the solution side with both sides evaluated right;
 *   - zeros, critical points, test values and their signs, radicands and
 *     right sides, coordinates and label positions are each recomputed;
 *   - the last step states the key: the graph, interval notation and
 *     inequality as asked, the intervals / candidates to select, the pair, the
 *     point — and the shared grader (gradeToolWork, the relation workspace's
 *     grader, gradeOrderedPairResponse, gradeNumberLineResponse) marks it right;
 *   - the text has no "+ -3", "1x", "--", "-0", NaN, null, undefined or Infinity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { all, create } from 'mathjs';

import * as pointsAndIntervals from '../../src/platform/supports/families/pointsAndIntervals.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { gradeToolWork, gradeWorkWithGrader } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { relationWorkspaceWork, workGraderForQuestion } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { parseRelationSource } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { gradeNumberLineResponse, gradeOrderedPairResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(relative, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all);
const ascii = (value) => String(value).replace(/[−–]/g, '-');
/** An expression in x as mathjs reads it: implicit products, powers, brackets. */
const toMath = (expression) => ascii(expression)
  .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4')
  .replace(/\[/g, '(').replace(/\]/g, ')')
  .replace(/·/g, '*')
  .replace(/√\(/g, 'sqrt(')
  .replace(/(\d|x|\))\s*\(/g, '$1*(')
  .replace(/\)\s*(x|\d)/g, ')*$1')
  .replace(/(\d)\s*x/g, '$1*x');
const at = (expression, x) => Number(math.evaluate(toMath(expression), { x }));
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const readNumber = (value) => {
  const cleaned = ascii(value).trim();
  const fraction = cleaned.match(/^(-?\d+)\/(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(cleaned);
};
const COMPARE = {
  '<': (a, b) => a < b - 1e-12,
  '>': (a, b) => a > b + 1e-12,
  '≤': (a, b) => a <= b + 1e-12,
  '≥': (a, b) => a >= b - 1e-12,
};
const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
const normalizeRelations = (value) => ascii(value).replace(/\\(?:leq|le)(?![A-Za-z])|<=/g, '≤').replace(/\\(?:geq|ge)(?![A-Za-z])|>=/g, '≥').replace(/\$/g, '');
/** "a ≤ x < b", "-2x + 5 < 3", "x ≤ -5 or x > 1", "all real numbers": does x make it true? */
const statementHolds = (statement, x) => {
  if (/^all real numbers$/i.test(statement.trim())) return true;
  return normalizeRelations(statement).split(/\s+or\s+/).some((clause) => {
    const parts = clause.split(/\s*(≤|≥|<|>)\s*/);
    for (let index = 1; index < parts.length; index += 2) {
      if (!COMPARE[parts[index]](at(parts[index - 1], x), at(parts[index + 1], x))) return false;
    }
    return true;
  });
};
const inSet = (pieces, x) => pieces.some((piece) => (x > piece.min || (piece.minClosed && x === piece.min))
  && (x < piece.max || (piece.maxClosed && x === piece.max)));
/** Sample points: a grid, and every finite end with its two sides. */
const samplesFor = (pieces) => {
  const ends = pieces.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite);
  return [...Array.from({ length: 161 }, (_, index) => -40 + index * 0.5), ...ends.flatMap((end) => [end, end - 1e-4, end + 1e-4])];
};
const assertSameSet = (holds, pieces, label) => samplesFor(pieces).forEach((x) => assert.equal(holds(x), inSet(pieces, x), `${label}: x = ${x}`));

/** Interval notation as this test reads it: (a, b], (-∞, 3), [1, 1], ∅, unions. */
const parseNotation = (value) => {
  if (value.trim() === '∅') return [];
  return value.split('∪').map((part) => {
    const match = ascii(part.trim()).match(/^([[(])\s*(-∞|-?[\d./]+)\s*,\s*(∞|-?[\d./]+)\s*([\])])$/);
    assert.ok(match, `readable interval notation: ${value}`);
    return {
      min: match[2] === '-∞' ? -Infinity : readNumber(match[2]),
      max: match[3] === '∞' ? Infinity : readNumber(match[3]),
      minClosed: match[1] === '[',
      maxClosed: match[4] === ']',
    };
  });
};
/** The number-line wording of the graph, read back into pieces. */
const parseShading = (value) => value.split(', then ').map((part) => {
  let match;
  if (part === 'shade the whole number line, with an arrow at each end') return { min: -Infinity, max: Infinity, minClosed: false, maxClosed: false };
  if ((match = /^draw a closed dot at (\S+) and shade nothing else$/.exec(part))) return { min: readNumber(match[1]), max: readNumber(match[1]), minClosed: true, maxClosed: true };
  if ((match = /^draw (a closed|an open) dot at (\S+) and shade to the (left|right) with an arrow$/.exec(part))) {
    const end = readNumber(match[2]);
    const closed = match[1] === 'a closed';
    return match[3] === 'left'
      ? { min: -Infinity, max: end, minClosed: false, maxClosed: closed }
      : { min: end, max: Infinity, minClosed: closed, maxClosed: false };
  }
  match = /^draw (a closed|an open) dot at (\S+) and (a closed|an open) dot at (\S+), and shade the segment between them$/.exec(part);
  assert.ok(match, `readable shading: ${part}`);
  return { min: readNumber(match[2]), max: readNumber(match[4]), minClosed: match[1] === 'a closed', maxClosed: match[3] === 'a closed' };
});

/** "on the number line, …; in interval notation, …; as an inequality, …" read back. */
const parseStaged = (tail) => {
  const out = {};
  for (const part of tail.split(/; (?=on the number line, |in interval notation, |as an inequality, )/)) {
    let match;
    if ((match = /^on the number line, (.+)$/.exec(part))) out.graph = match[1];
    else if ((match = /^in interval notation, (.+)$/.exec(part))) out.interval = match[1];
    else if ((match = /^as an inequality, (.+)$/.exec(part))) out.inequality = match[1];
  }
  return out;
};

// …and no variable written twice in a row ("xx(x - 3)" for x(x)(x - 3)).
const SLOPPY = /NaN|undefined|\bnull\b|\[object|Infinity|\+\s*-|--|(?<![\d.])-0(?![\d./])|(?<![\d.)/])1x|(?<![A-Za-z])([a-z])\1(?![A-Za-z])/;
const assertTidy = (label, worked) => {
  assert.ok(worked.headline, `${label}: a headline`);
  [worked.headline, ...worked.steps, worked.answerSummary].forEach((line) => assert.doesNotMatch(line, SLOPPY, `${label}: "${line}"`));
};

/* ------------------------------------------------------------ solving steps, read back */

/**
 * The solving steps of a linear inequality, checked against the ORIGINAL the
 * test read from the item: every inequality a step reaches has the original's
 * solution set and comes from the previous one by exactly the move it names.
 */
const verifySolving = (label, steps, original, keyPieces) => {
  let before = normalizeRelations(original);
  let checked = false;
  for (const step of steps) {
    let match;
    if ((match = /^Check with x = (\S+), on the solution side: (\S+) (≤|≥|<|>) (\S+) is true\.$/.exec(step))) {
      const t = readNumber(match[1]);
      assert.ok(inSet(keyPieces, t), `${label}: the check value ${t} is on the solution side`);
      const [left, right] = normalizeRelations(original).split(/\s*(?:≤|≥|<|>)\s*/);
      assert.ok(near(readNumber(match[2]), at(left, t)) && near(readNumber(match[4]), at(right, t)), `${label}: ${step}`);
      assert.ok(COMPARE[match[3]](readNumber(match[2]), readNumber(match[4])), `${label}: the check is true: ${step}`);
      checked = true;
      continue;
    }
    match = /^(.*?): (.+) (≤|≥|<|>) (.+)\.$/.exec(step);
    if (!match || step.startsWith('So ')) continue;
    const [, move, left, relation, right] = match;
    const reached = `${left} ${relation} ${right}`;
    assertSameSet((x) => statementHolds(reached, x), keyPieces, `${label}: "${step}" keeps the solution set`);
    const [pl, pr] = before.split(/\s*(?:≤|≥|<|>)\s*/);
    const pRelation = before.match(/≤|≥|<|>/)[0];
    const probes = [2.75, -3.5];
    let named;
    if ((named = /^(Subtract|Add) (\S+) on both sides$/.exec(move))) {
      const k = readNumber(named[2]) * (named[1] === 'Subtract' ? -1 : 1);
      probes.forEach((x) => assert.ok(near(at(left, x), at(pl, x) + k) && near(at(right, x), at(pr, x) + k), `${label}: ${step}`));
      assert.equal(relation, pRelation, `${label}: adding keeps the symbol`);
    } else if ((named = /^(Subtract (\S+) from|Add (\S+) to) both sides$/.exec(move))) {
      const term = named[2] ? `-(${named[2]})` : `(${named[3]})`;
      probes.forEach((x) => assert.ok(near(at(left, x), at(pl, x) + at(term, x)) && near(at(right, x), at(pr, x) + at(term, x)), `${label}: ${step}`));
      assert.equal(relation, pRelation, `${label}: adding keeps the symbol`);
    } else if ((named = /^Divide both sides by (\S+?)(?:\. Dividing by a negative number flips the symbol, so (\S) becomes (\S))?$/.exec(move))) {
      const k = readNumber(named[1]);
      probes.forEach((x) => assert.ok(near(at(left, x), at(pl, x) / k) && near(at(right, x), at(pr, x) / k), `${label}: ${step}`));
      assert.equal(relation, k < 0 ? FLIP[pRelation] : pRelation, `${label}: the symbol ${k < 0 ? 'flips' : 'stays'}`);
      assert.equal(Boolean(named[2]), k < 0, `${label}: the flip is named exactly when the divisor is negative`);
      if (named[2]) assert.ok(named[2] === pRelation && named[3] === relation, `${label}: ${step}`);
    } else if (move.startsWith('Read it from right to left')) {
      probes.forEach((x) => assert.ok(near(at(left, x), at(pr, x)) && near(at(right, x), at(pl, x)), `${label}: ${step}`));
      assert.equal(relation, FLIP[pRelation], `${label}: reading backwards turns the symbol around`);
    } else {
      assert.match(move, /^(Drop|Clear) the brackets and collect like terms$|^Rewrite each side$/, `${label}: a known move: ${step}`);
      probes.forEach((x) => assert.ok(near(at(left, x), at(pl, x)) && near(at(right, x), at(pr, x)), `${label}: ${step} rewrites each side`));
      assert.equal(relation, pRelation, `${label}: a rewrite keeps the symbol`);
    }
    before = reached;
  }
  assert.ok(checked, `${label}: the solution is checked`);
  return before;
};

/* ------------------------------------------------------------ the items */

const ITEMS = [];
const add = (kind, label, question, extra = {}) => ITEMS.push({ kind, label, question, ...extra });
const keyOf = (question) => (question.intervals?.length ? question.intervals : question.expectedIntervals).map((piece) => ({
  min: piece.min === null || piece.min === undefined || piece.min === '-inf' ? -Infinity : Number(piece.min),
  max: piece.max === null || piece.max === undefined || piece.max === 'inf' ? Infinity : Number(piece.max),
  minClosed: Number.isFinite(Number(piece.min)) && piece.min !== null && piece.minClosed === true,
  maxClosed: Number.isFinite(Number(piece.max)) && piece.max !== null && piece.maxClosed === true,
}));
/** The inequality a prompt prints in math, as the test reads it. */
const promptInequality = (prompt) => (String(prompt).match(/\$([^$]*(?:<|>|\\le|\\ge|≤|≥)[^$]*)\$/) || [])[1];

// The Algebra II honors corpus.
['teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json',
  'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json'].forEach((file) => {
  compileAuthoringIntentV5(readJson(file)).package.sections.flatMap((section) => section.questions)
    .filter((question) => question.type === 'intervalNumberLine')
    .forEach((question) => add('graph', `corpus: ${question.prompt}`, question, { given: ascii(question.inequalityText) }));
});
add('graph', 'catalog example', QUESTION_TYPE_CATALOG.intervalNumberLine.example, { given: QUESTION_TYPE_CATALOG.intervalNumberLine.example.inequalityText });
add('graph', 'catalog unbounded example', QUESTION_TYPE_CATALOG.intervalNumberLine.unboundedExample, { given: QUESTION_TYPE_CATALOG.intervalNumberLine.unboundedExample.inequalityText });

const docById = (file, id) => readJson(file).documents.find((document) => document.id === id);
const pathItems = (file, id, count) => Array.from({ length: count }, (_, seed) => {
  const generated = generatePathInstanceWithRetries(docById(file, id), `k-steps-${seed}`);
  assert.ok(generated.question, `${id} instantiates: ${generated.reason}`);
  return generated.question;
});
['mm_gen_6_6_9B_greater-than', 'mm_gen_6_6_9B_greater-equal', 'mm_gen_6_6_9B_less-than', 'mm_gen_6_6_9B_less-equal'].forEach((id) => {
  pathItems('drafts/grade6.json', id, 6).forEach((question) => add('graph', `${id}: ${question.prompt}`, question, { given: ascii(question.inequalityText) }));
});
['mm_gen_7_7_10B_greater-ray', 'mm_gen_7_7_10B_at-least-ray', 'mm_gen_7_7_10B_less-ray', 'mm_gen_7_7_10B_at-most-ray'].forEach((id) => {
  pathItems('drafts/grade7.json', id, 6).forEach((question) => add('solve', `${id}: ${question.prompt}`, question, { original: promptInequality(question.prompt) }));
});
pathItems('drafts/algebra1.json', 'mm_A_5B_v2_negative-coefficient-number-line', 10).forEach((question) => add('solve', `A.5B: ${question.prompt}`, question, { original: promptInequality(question.prompt) }));
pathItems('drafts/algebra2.json', 'mm_A2_4H_v2_number-line-exterior-inclusive', 10).forEach((question) => add('factored', `A2.4H: ${question.prompt}`, question, { original: promptInequality(question.prompt) }));
pathItems('drafts/grade6.json', 'mm_gen_6_6_9B_context-boundary', 8).forEach((question) => add('verbal', `context: ${question.prompt}`, question));

// Hand-made interval edges.
const interval = (prompt, intervals, ask) => ({ type: 'intervalNumberLine', prompt, intervals, variable: 'x', ...(ask ? { ask } : {}) });
add('factored', 'all real numbers (x − 1)² ≥ 0', interval('Solve $(x - 1)^2 \\ge 0$.', [{ min: null, max: null }], ['graph', 'interval', 'inequality']), { original: '(x - 1)^2 \\ge 0' });
add('factored', 'one point (x − 1)² ≤ 0', interval('Solve $(x - 1)^2 \\le 0$.', [{ min: 1, max: 1, minClosed: true, maxClosed: true }], ['graph', 'interval', 'inequality']), { original: '(x - 1)^2 \\le 0' });
add('factored', 'cubic x(x − 2)(x + 3) < 0', interval('Solve $x(x - 2)(x + 3) < 0$.', [{ min: null, max: -3 }, { min: 0, max: 2 }]), { original: 'x(x - 2)(x + 3) < 0' });
add('factored', 'repeated bare factor x(x)(x − 3) > 0', interval('Solve $x(x)(x - 3) > 0$.', [{ min: 3, max: null }]), { original: 'x(x)(x - 3) > 0' });
add('factored', 'typed power x^2(x − 3) > 0', interval('Solve $x^2(x - 3) > 0$.', [{ min: 3, max: null }]), { original: 'x^2(x - 3) > 0' });
add('factored', 'leading coefficient (2x − 1)(x + 4) > 0', interval('Solve $(2x - 1)(x + 4) > 0$.', [{ min: null, max: -4 }, { min: 0.5, max: null }]), { original: '(2x - 1)(x + 4) > 0' });
add('graph', '"and" −2 < x ≤ 5', interval('Graph $x > -2$ and $x \\le 5$.', [{ min: -2, max: 5, maxClosed: true }], ['graph', 'interval', 'inequality']), { given: 'x > -2 and x ≤ 5' });
add('graph', '"or" x ≤ −5 or x > 1', interval('Graph $x \\le -5$ or $x > 1$.', [{ min: null, max: -5, maxClosed: true }, { min: 1, max: null }], ['graph', 'interval', 'inequality']), { given: 'x ≤ -5 or x > 1' });
add('graph', 'reversed 5 ≥ x', interval('Graph $5 \\ge x$.', [{ min: null, max: 5, maxClosed: true }], ['inequality']), { given: '5 ≥ x' });
add('solve', 'decimal endpoint 2x − 1 ≥ 4', interval('Solve $2x - 1 \\ge 4$.', [{ min: 2.5, max: null, minClosed: true }], ['graph', 'interval', 'inequality']), { original: '2x - 1 \\ge 4' });
add('solve', 'fraction endpoint 3x + 1 < 2', interval('Solve $3x + 1 < 2$.', [{ min: null, max: 1 / 3 }], ['graph', 'interval']), { original: '3x + 1 < 2' });
add('solve', 'x on the right 3 > 5 − 2x', interval('Solve $3 > 5 - 2x$.', [{ min: 1, max: null }], ['inequality']), { original: '3 > 5 - 2x' });
add('solve', 'x on both sides 2x + 1 ≤ 5x − 8', interval('Solve $2x + 1 \\le 5x - 8$.', [{ min: 3, max: null, minClosed: true }]), { original: '2x + 1 \\le 5x - 8' });
add('solve', 'brackets −2(x + 1) + 3x > 4', interval('Solve $-2(x + 1) + 3x > 4$.', [{ min: 6, max: null }]), { original: '-2(x + 1) + 3x > 4' });
add('verbal', 'at most', interval('A bag can hold at most 12 pounds. Graph the weights $x$ it can hold.', [{ min: null, max: 12, maxClosed: true }], ['graph', 'interval']));

// Sign & Solution Analyzer.
const sampleTools = (file) => readJson(file).questions.filter((question) => question.toolId === 'signSolutionAnalyzer');
const batchB = sampleTools('SAMPLE_BATCH_B_DEEP_DIVE.json');
const reviewCompiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Polynomial and rational inequalities', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Solve (x + 1)²(x − 4) ≤ 0 with a sign chart.', studentActions: ['solve inequality'], signChart: { factors: [{ root: -1, multiplicity: 2 }, { root: 4, multiplicity: 1 }], relation: '<=' } },
      { prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', studentActions: ['solve inequality'], signChart: { mode: 'rational', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } },
      { prompt: 'Which candidates solve √(2x + 3) = x?', studentActions: ['solve inequality'], signChart: { mode: 'radicalCheck', radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: 1, b: 0 } }, candidates: [3, -1] } },
      { prompt: 'Solve x(x − 5) > 0.', studentActions: ['solve inequality'], factors: [{ root: 0 }, { root: 5 }], relation: '>' },
    ],
  }],
}).package.sections[0].questions;
const tool = (fields) => ({ type: 'signSolutionAnalyzer', ...fields });
[
  ['batch B polynomial', batchB.find((question) => question.mode === 'polynomial')],
  ['missing-tools (x + 2)(x − 3) > 0', sampleTools('SAMPLE_MISSING_MATH_TOOLS.json')[0]],
  ['V5 (x + 1)²(x − 4) ≤ 0', reviewCompiled[0]],
  ['V5 x(x − 5) > 0', reviewCompiled[3]],
  ['cubic (x + 3)x(x − 2) < 0', tool({ mode: 'polynomial', factors: [{ root: -3 }, { root: 0 }, { root: 2 }], relation: '<' })],
  ['nothing to select (x − 1)² < 0', tool({ mode: 'polynomial', factors: [{ root: 1, multiplicity: 2 }], relation: '<' })],
  ['only a zero (x − 1)² ≤ 0', tool({ mode: 'polynomial', factors: [{ root: 1, multiplicity: 2 }], relation: '<=' })],
  ['decimal roots (x − 0.5)(x + 2.5) ≥ 0', tool({ mode: 'polynomial', factors: [{ root: 0.5 }, { root: -2.5 }], relation: '>=' })],
  ['batch B rational', batchB.find((question) => question.mode === 'rational')],
  ['V5 (x − 2)/(x + 3) ≥ 0', reviewCompiled[1]],
  ['inferred (x − 2)/[(x + 1)(x − 4)] < 0', tool({ numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -1 }, { root: 4 }], relation: '<' })],
  ['even denominator (x + 1)/(x − 3)² > 0', tool({ mode: 'rational', numeratorFactors: [{ root: -1 }], denominatorFactors: [{ root: 3, multiplicity: 2 }], relation: '>' })],
].forEach(([label, question]) => add('signChart', label, question));
[
  ['batch B radical', batchB.find((question) => question.mode === 'radicalCheck')],
  ['V5 √(2x + 3) = x', reviewCompiled[2]],
  ['two genuine √(5x − 4) = x', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 5, b: -4 }, rhs: { m: 1, b: 0 } }, candidates: [1, 4] })],
  ['extraneous and outside √(x + 7) = x − 5', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 7 }, rhs: { m: 1, b: -5 } }, candidates: [9, 2, -8] })],
  ['no real solution √(x + 2) = −3', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 2 }, rhs: { m: 0, b: -3 } }, candidates: [7, -11] })],
  ['not a perfect square √(x + 1) = 2', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 1 }, rhs: { m: 0, b: 2 } }, candidates: [3, 1] })],
  ['text candidates √(x + 6) = 3', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: ['3', '-15'] })],
  // Candidate lists that miss a root: the conclusion may speak only of the candidates.
  ['missed root √(x + 1) = 3', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 1 }, rhs: { m: 0, b: 3 } }, candidates: [2, 4] })],
  ['missed second root √(5x − 4) = x', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 5, b: -4 }, rhs: { m: 1, b: 0 } }, candidates: [1, 7] })],
  ['irrational squared roots √(x + 3) = x', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 3 }, rhs: { m: 1, b: 0 } }, candidates: [1, 6] })],
  ['squared equation has no root √x = x + 1', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 1, b: 1 } }, candidates: [0, 1] })],
].forEach(([label, question]) => add('radical', label, question));

// Ordered pairs.
for (let seed = 0; seed < 30; seed += 1) {
  const question = generateQuestion({ type: 'orderedPair', prompt: 'Name the coordinates of the plotted point.', generator: { kind: 'orderedPair', xRange: [-9, 9], yRange: [-9, 9] } }, `k-steps-op-${seed}`);
  add('plotted', `generated point ${seed}`, question);
}
const compiledPoints = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Points', courseId: 'algebra1' },
  sections: [{ role: 'practice', questions: [
    { prompt: 'Where do y = 2x - 1 and y = -x + 5 meet?', studentActions: ['stateOrderedPair'], answer: [2, 3] },
    { prompt: 'Where do y = 3x + 4 and y = -2x - 6 meet?', studentActions: ['stateOrderedPair'], answer: [-2, -2] },
    { prompt: 'Where do y = x + 3 and y = -x + 3 meet?', studentActions: ['stateOrderedPair'], answer: [0, 3] },
    { prompt: 'Where do y = 0.5x + 1 and y = -x + 4 meet?', studentActions: ['stateOrderedPair'], answer: [2, 2] },
    { prompt: 'Name the plotted point.', studentActions: ['stateOrderedPair'], answer: [-3, 4], graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, points: [[-3, 4]] } },
    { prompt: 'Name the plotted point.', studentActions: ['stateOrderedPair'], answer: [0, -5], graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, points: [[0, -5]] } },
  ] }],
}).package.sections[0].questions;
add('lines', 'V5 y = 2x - 1 and y = -x + 5', compiledPoints[0]);
add('lines', 'V5 y = 3x + 4 and y = -2x - 6', compiledPoints[1]);
add('lines', 'V5 meeting on the y-axis', compiledPoints[2]);
add('lines', 'V5 a decimal slope', compiledPoints[3]);
add('plotted', 'V5 plotted point', compiledPoints[4]);
add('plotted', 'V5 a zero x-coordinate', compiledPoints[5]);
add('lines', 'a horizontal line', { type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: [2, 3] });
add('lines', 'a horizontal line first', { type: 'orderedPair', prompt: 'Where do y = -4 and y = 2x + 6 meet?', answer: [-5, -4] });

// Number lines.
for (let seed = 0; seed < 20; seed += 1) {
  const question = generateQuestion({ type: 'numberLine', prompt: 'Select the target on the number line.', generator: { targetRange: [-20, 20], spacing: 5 } }, `k-steps-nl-${seed}`);
  add('numberLine', `generated number line ${seed}`, question);
}
add('numberLine', 'composed-workflow fixture', { type: 'numberLine', prompt: 'Find the target.', target: 3, choices: [1, 2, 3, 4, 5] });
add('numberLine', 'zero target', { type: 'numberLine', prompt: 'Find zero.', target: 0, choices: [-4, -2, 0, 2, 4] });

// Step Algebra linear inequalities: the shared graders' fixtures, then seeded shapes.
[
  ['shared grading INEQUALITY', { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 <= 7', representSolution: false }, '2x + 3 <= 7'],
  ['shared grading FLIP', { type: 'stepAlgebra', prompt: 'Solve.', equation: '-3x + 4 > 10', representSolution: false }, '-3x + 4 > 10'],
  ['shared grading PROMPT_ONLY', { type: 'stepAlgebra', prompt: 'Solve -2x + 3 > 7.', representSolution: false }, '-2x + 3 > 7'],
  ['shared grading REPRESENT', { type: 'stepAlgebra', prompt: 'Solve and graph.', equation: '2x + 3 <= 7' }, '2x + 3 <= 7'],
  ['Algebra I represent', { type: 'stepAlgebra', prompt: 'Solve and graph.', equation: '-4x - 2 >= 10', courseId: 'algebra1' }, '-4x - 2 >= 10'],
  ['step submission INEQUALITY', { questionId: 'q-ineq', type: 'stepAlgebra', prompt: 'Solve.', equation: '-2x + 3 > 7' }, '-2x + 3 > 7'],
  ['inequalityText item', { type: 'stepAlgebra', equation: '2x + 3 < 9', inequalityText: '2x + 3 < 9' }, '2x + 3 < 9'],
].forEach(([label, question, original]) => add('linearInequality', label, question, { original }));
{
  let state = 20261010;
  const rand = (low, high) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return low + (state % (high - low + 1));
  };
  const nonzero = (low, high) => {
    for (;;) {
      const value = rand(low, high);
      if (value !== 0) return value;
    }
  };
  const RELATIONS = ['<', '>', '<=', '>='];
  const lin = (a, b) => `${a === 1 ? '' : a === -1 ? '-' : a}x${b === 0 ? '' : b > 0 ? ` + ${b}` : ` - ${-b}`}`;
  for (let index = 0; index < 60; index += 1) {
    const relation = RELATIONS[index % 4];
    const shape = index % 6;
    const a = nonzero(-9, 9);
    const b = nonzero(-15, 15);
    const c = rand(-20, 20);
    let source;
    if (shape === 0) source = `${lin(a, b)} ${relation} ${c}`;
    else if (shape === 1) source = `${c} ${relation} ${lin(a, b)}`;
    else if (shape === 2) {
      const a2 = nonzero(-6, 6);
      source = `${lin(a, b)} ${relation} ${lin(a2 === a ? a2 + 1 || 2 : a2, c)}`;
    } else if (shape === 3) source = `${a}(x ${b > 0 ? '+' : '-'} ${Math.abs(b)}) ${relation} ${c}`;
    else if (shape === 4) source = `${Math.abs(a) === 1 ? 2 : a}x + 0.5 ${relation} ${c}.5`;
    else source = `${c} - ${Math.abs(a) === 1 ? 3 : Math.abs(a)}x ${relation} ${b}`;
    const question = { type: 'stepAlgebra', prompt: 'Solve.', equation: source, representSolution: index % 3 !== 0 ? false : undefined };
    if (question.representSolution === undefined) delete question.representSolution;
    if (pointsAndIntervals.matches(question)) add('linearInequality', `seeded ${source}`, question, { original: source });
  }
}

/* ------------------------------------------------------------ per-shape verification */

const gradeIntervalTool = (question, stated) => gradeToolWork({
  toolId: 'intervalNumberLine',
  question: { ...question, intervals: question.intervals?.length ? question.intervals : question.expectedIntervals },
  work: {
    intervals: stated.graph ? parseShading(stated.graph) : [],
    notation: stated.interval || '',
    inequality: stated.inequality || '',
  },
});

const askedStages = (ask) => {
  const stages = (Array.isArray(ask) ? ask : []).map((stage) => (stage === 'notation' ? 'interval' : stage)).filter((stage) => ['graph', 'interval', 'inequality'].includes(stage));
  return stages.length ? stages : ['graph', 'interval'];
};

/** The staged answer is the key, in every asked form, and only those. */
const verifyStaged = (label, stated, key, stages, variable = 'x') => {
  assert.deepEqual(Object.keys(stated).sort(), [...stages].sort(), `${label}: states exactly the asked stages`);
  if (stated.graph) assertSameSet((x) => inSet(parseShading(stated.graph), x), key, `${label}: the graph`);
  if (stated.interval) assertSameSet((x) => inSet(parseNotation(stated.interval), x), key, `${label}: the interval notation`);
  if (stated.inequality) {
    assert.ok(stated.inequality.includes(variable) || /all real numbers/.test(stated.inequality), `${label}: an inequality in ${variable}`);
    assertSameSet((x) => statementHolds(stated.inequality.replaceAll(variable, 'x'), x), key, `${label}: the inequality`);
  }
};

const verifyPieceStep = (label, step, key) => {
  const match = /^(.+?): (?:≤|≥|<|>) (includes|leaves out) (\S+), so draw (a closed|an open) dot at (\S+)\. "(Less|Greater) than" means (smaller|larger) numbers, so shade to the (left|right) with an arrow\.$/.exec(step)
    || /^(.+?): x is between (\S+) and (\S+)\. Draw (a closed|an open) dot at (\S+) and (a closed|an open) dot at (\S+), then shade the segment between them\.$/.exec(step);
  if (!match) return false;
  const statement = match[1];
  const piece = key.find((entry) => samplesFor([entry]).every((x) => inSet([entry], x) === statementHolds(statement, x)));
  assert.ok(piece, `${label}: "${statement}" is exactly one piece of the key`);
  if (match.length === 9) {
    const end = readNumber(match[3]);
    assert.equal(match[2] === 'includes', match[4] === 'a closed', `${label}: the dot matches the symbol`);
    assert.equal(match[4] === 'a closed', Number.isFinite(piece.min) ? piece.minClosed : piece.maxClosed, `${label}: ${step}`);
    assert.equal(end, Number.isFinite(piece.min) ? piece.min : piece.max, `${label}: ${step}`);
    assert.equal(match[8], Number.isFinite(piece.min) ? 'right' : 'left', `${label}: ${step}`);
  } else {
    assert.ok(readNumber(match[2]) === piece.min && readNumber(match[3]) === piece.max, `${label}: ${step}`);
    assert.ok((match[4] === 'a closed') === piece.minClosed && (match[6] === 'a closed') === piece.maxClosed, `${label}: ${step}`);
  }
  return true;
};

const verifyInterval = (item, worked) => {
  const { label, question, kind } = item;
  const key = keyOf(question);
  const stages = askedStages(question.ask);
  const last = worked.steps.at(-1);
  const final = /^So (?:the answer is:|(x (?:≤|≥|<|>) \S+);) (.+)\.$/.exec(last);
  assert.ok(final, `${label}: the last step states the answer: ${last}`);
  const stated = parseStaged(final[2]);
  verifyStaged(label, stated, key, stages);
  assert.equal(worked.answerSummary.toLowerCase(), `${final[2]}.`.toLowerCase(), `${label}: the summary is the last step's answer`);
  const graded = gradeIntervalTool(question, stated);
  assert.equal(graded.isCorrect, true, `${label}: the number-line grader accepts it (${JSON.stringify(graded.parts)})`);

  const body = worked.steps.slice(0, -1);
  if (kind === 'graph') {
    assert.ok(worked.headline.includes(item.given), `${label}: the headline quotes ${item.given}`);
    let pieces = 0;
    body.forEach((step) => {
      if (verifyPieceStep(label, step, key)) pieces += 1;
      const both = /: both conditions must hold at once, so (.+)\.$/.exec(step);
      if (both) {
        // The combined statement on its own is the key, and the key is what both given parts allow.
        assertSameSet((x) => statementHolds(both[1], x), key, `${label}: ${step}`);
        assertSameSet((x) => item.given.split(' and ').every((part) => statementHolds(part, x)), key, `precondition ${label}: the key is both conditions`);
      }
    });
    assert.equal(pieces, key.length, `${label}: one step per piece`);
  } else if (kind === 'solve') {
    assert.ok(final[1], `${label}: the solved inequality is stated with the answer`);
    assertSameSet((x) => statementHolds(final[1], x), key, `${label}: ${final[1]}`);
    const reached = verifySolving(label, body, item.original, key);
    assert.equal(ascii(reached), ascii(final[1]), `${label}: the answer is where the solving ended`);
  } else if (kind === 'factored') {
    const original = normalizeRelations(item.original);
    const [expression, relation] = [original.split(/\s*(?:≤|≥|<|>)\s*/)[0], original.match(/≤|≥|<|>/)[0]];
    const superscripts = (value) => value.replace(/\^\{?(\d)\}?/g, (match, digit) => ({ 2: '²', 3: '³', 4: '⁴' })[digit] || match);
    const samples = [-37.3, -11.1, -2.3, 0.37, 4.1, 23.9];
    const headlined = /^Solve (.+) (?:≤|≥|<|>) 0: /.exec(worked.headline);
    assert.ok(headlined, `${label}: ${worked.headline}`);
    samples.forEach((x) => assert.ok(near(at(headlined[1], x), at(expression, x)), `${label}: the headline's product is the prompt's: ${headlined[1]}`));
    const simply = body.find((step) => step.startsWith('Write the factors simply: '));
    if (simply) {
      const rewritten = /^Write the factors simply: (.+) (≤|≥|<|>) 0\.$/.exec(simply);
      assert.ok(rewritten && rewritten[2] === relation, `${label}: ${simply}`);
      samples.forEach((x) => assert.ok(near(at(rewritten[1], x), at(expression, x)), `${label}: ${simply}`));
      assert.notEqual(rewritten[1].replace(/\s+/g, ''), superscripts(expression).replace(/\s+/g, ''), `${label}: the rewrite changes more than how a power is typed: ${simply}`);
    }
    const zerosStep = body.find((step) => step.startsWith('The product is 0 when'));
    const zeros = [...zerosStep.matchAll(/x = (\S+?)(?= or |\.$)/g)].map((match) => readNumber(match[1]));
    zeros.forEach((zero) => assert.ok(near(at(expression, zero), 0), `${label}: x = ${zero} makes ${expression} zero`));
    samples.forEach((x) => assert.ok(!near(at(expression, x), 0) || zeros.some((zero) => near(zero, x)), `${label}: no zero missed`));
    const tests = body.filter((step) => step.startsWith('Test '));
    assert.equal(tests.length, zeros.length + 1, `${label}: one test per interval`);
    const bounds = [-Infinity, ...[...zeros].sort((p, q) => p - q), Infinity];
    tests.forEach((step, index) => {
      const match = /^Test x = (\S+) in \((\S+), (\S+)\): the product is (\S+), which is (positive|negative)\.$/.exec(step);
      assert.ok(match, `${label}: ${step}`);
      const t = readNumber(match[1]);
      assert.ok(t > bounds[index] && t < bounds[index + 1], `${label}: ${t} is inside its interval`);
      assert.ok(near(readNumber(match[4]), at(expression, t)), `${label}: ${step}`);
      assert.equal(match[5], at(expression, t) > 0 ? 'positive' : 'negative', `${label}: ${step}`);
    });
    const keeps = body.find((step) => / 0 keeps the /.test(step));
    assert.ok(keeps.startsWith(`${relation} 0 keeps the ${relation === '<' || relation === '≤' ? 'negative' : 'positive'} intervals`), `${label}: ${keeps}`);
    assert.equal(/zeros themselves are included/.test(keeps), relation === '≤' || relation === '≥', `${label}: ${keeps}`);
    assertSameSet((x) => statementHolds(original.replace(/\^2/g, '²'), x), key, `precondition ${label}: the key solves the prompt`);
  } else if (kind === 'verbal') {
    const PHRASES = { 'at least': '≥', 'no less than': '≥', 'at most': '≤', 'no more than': '≤', 'more than': '>', 'greater than': '>', 'less than': '<', 'fewer than': '<' };
    const [means, dotStep, shadeStep] = body;
    const match = /^"(.+) (\S+)" means x (≤|≥|<|>) (\S+)\.$/.exec(means);
    assert.ok(match && PHRASES[match[1]] === match[3] && match[2] === match[4], `${label}: ${means}`);
    assert.ok(new RegExp(`${match[1]}\\s*\\$?${match[2]}`).test(question.prompt), `${label}: the phrase is the prompt's`);
    assertSameSet((x) => statementHolds(`x ${match[3]} ${match[4]}`, x), key, `${label}: ${means}`);
    assert.equal(/closed dot/.test(dotStep), match[3] === '≤' || match[3] === '≥', `${label}: ${dotStep}`);
    assert.equal(/shade to the left/.test(shadeStep), match[3] === '≤' || match[3] === '<', `${label}: ${shadeStep}`);
  }
};

const verifyLinearInequality = (item, worked) => {
  const { label, question } = item;
  const original = normalizeRelations(item.original);
  // The solution set, solved here: a·x + c against 0.
  const [left, right] = original.split(/\s*(?:≤|≥|<|>)\s*/);
  const relation = original.match(/≤|≥|<|>/)[0];
  const c0 = at(left, 0) - at(right, 0);
  const c1 = at(left, 1) - at(right, 1) - c0;
  const boundary = -c0 / c1;
  const solved = c1 < 0 ? FLIP[relation] : relation;
  const key = [solved === '<' || solved === '≤'
    ? { min: -Infinity, max: boundary, minClosed: false, maxClosed: solved === '≤' }
    : { min: boundary, max: Infinity, minClosed: solved === '≥', maxClosed: false }];
  const last = worked.steps.at(-1);
  const final = /^So the solution is (x (?:≤|≥|<|>) (\S+?))(?:; (.+))?\.$/.exec(last);
  assert.ok(final, `${label}: the last step states the solution: ${last}`);
  assert.ok(near(readNumber(final[2]), boundary), `${label}: the boundary is ${boundary}`);
  assertSameSet((x) => statementHolds(final[1], x), key, `${label}: ${final[1]}`);
  const reached = verifySolving(label, worked.steps.slice(0, -1), item.original, key);
  assert.equal(reached, final[1], `${label}: the solution is where the solving ended`);
  assert.equal(worked.answerSummary, `The solution is ${final[1]}${final[3] ? `; ${final[3]}` : ''}.`, `${label}: the summary`);
  const stated = final[3] ? parseStaged(final[3]) : {};
  if (final[3]) verifyStaged(label, stated, key, Object.keys(stated));
  const work = relationWorkspaceWork({
    relationState: parseRelationSource(final[1], 'x'),
    representation: final[3] ? { intervals: stated.graph ? parseShading(stated.graph) : [], notation: stated.interval || '', inequality: stated.inequality || '' } : null,
  });
  const graded = gradeWorkWithGrader({ grader: workGraderForQuestion(question), question, work });
  assert.equal(graded.isCorrect, true, `${label}: the relation workspace's grader accepts it (${JSON.stringify(graded.parts)})`);
};

const verifySignChart = (item, worked) => {
  const { label, question } = item;
  const rational = (question.mode || (question.denominatorFactors?.length ? 'rational' : 'polynomial')) === 'rational';
  const top = (question.numeratorFactors || question.factors).map((factor) => ({ root: Number(factor.root), power: Number(factor.multiplicity ?? 1) }));
  const bottom = rational ? question.denominatorFactors.map((factor) => ({ root: Number(factor.root), power: Number(factor.multiplicity ?? 1) })) : [];
  const relation = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' }[question.relation || '>'];
  const value = (x) => top.reduce((p, f) => p * ((x - f.root) ** f.power), 1) / bottom.reduce((p, f) => p * ((x - f.root) ** f.power), 1);
  const holds = (x) => Number.isFinite(value(x)) && COMPARE[relation](value(x), 0);
  const points = [...new Set([...top, ...bottom].map((factor) => factor.root))].sort((a, b) => a - b);
  const bounds = [-Infinity, ...points, Infinity];
  const want = relation === '<' || relation === '≤' ? -1 : 1;
  const [critical, ...rest] = worked.steps;
  const listed = [...critical.matchAll(/x = (\S+?)( \(denominator 0\))?(?=, |\. )/g)];
  assert.deepEqual(listed.map((match) => readNumber(match[1])), points, `${label}: ${critical}`);
  listed.forEach((match) => assert.equal(Boolean(match[2]), bottom.some((factor) => factor.root === readNumber(match[1])), `${label}: ${critical}`));
  const tests = rest.filter((step) => step.startsWith('Test '));
  assert.equal(tests.length, bounds.length - 1, `${label}: one test per interval`);
  const selectedIndexes = [];
  tests.forEach((step, index) => {
    const match = /^Test x = (\S+) in \((\S+), (\S+)\): the expression is (positive|negative), so (select|leave out) this interval\.$/.exec(step);
    assert.ok(match, `${label}: ${step}`);
    const t = readNumber(match[1]);
    assert.ok(t > bounds[index] && t < bounds[index + 1], `${label}: ${t} is inside its interval`);
    assert.equal(match[4], value(t) > 0 ? 'positive' : 'negative', `${label}: ${step}`);
    assert.equal(match[5] === 'select', Math.sign(value(t)) === want, `${label}: ${step}`);
    if (match[5] === 'select') selectedIndexes.push(index);
  });
  const answer = /^So select (.+?); the solution set is (.+)\.$/.exec(worked.steps.at(-1));
  assert.ok(answer, `${label}: the last step states the selection: ${worked.steps.at(-1)}`);
  const labels = answer[1].startsWith('no interval') ? [] : [...answer[1].matchAll(/\((\S+), (\S+)\)/g)];
  assert.equal(answer[1].replace(/\((\S+), (\S+)\)/g, '()').replace(/^no interval.*/, ''), labels.length ? labels.map(() => '()').join(', ').replace(/, (?=[^,]*$)/, ' and ') : '', `${label}: the selection lists intervals`);
  const indexes = labels.map(([, l, r]) => {
    return bounds.findIndex((bound, index) => bound === (l === '-∞' ? -Infinity : readNumber(l)) && bounds[index + 1] === (r === '∞' ? Infinity : readNumber(r)));
  });
  assert.deepEqual(indexes, selectedIndexes, `${label}: the selection is the tested one`);
  const solution = answer[2] === '∅' ? [] : parseNotation(answer[2]);
  samplesFor([...solution, ...points.map((p) => ({ min: p, max: p, minClosed: true, maxClosed: true }))])
    .forEach((x) => assert.equal(inSet(solution, x), holds(x), `${label}: the solution set at x = ${x}`));
  assert.equal(worked.answerSummary, `${answer[1].charAt(0).toUpperCase()}${answer[1].slice(1)}; the solution set is ${answer[2]}.`.replace(/^No interval/, 'Select no interval').replace(/^(?!Select)/, 'Select '), `${label}: the summary`);
  const graded = gradeToolWork({ toolId: 'signSolutionAnalyzer', question, work: { selected: indexes } });
  assert.equal(graded.isCorrect, true, `${label}: the analyzer's grader accepts the selection`);
};

const verifyRadical = (item, worked) => {
  const { label, question } = item;
  const { radicand, rhs } = question.radicalEquation;
  const [m1, b1, m2, b2] = [Number(radicand.m ?? 1), Number(radicand.b ?? 0), Number(rhs.m ?? 0), Number(rhs.b ?? 0)];
  const genuine = question.candidates.map(Number).filter((x) => m1 * x + b1 >= 0 && near(Math.sqrt(m1 * x + b1), m2 * x + b2));
  const checks = worked.steps.filter((step) => step.startsWith('Check x = '));
  assert.equal(checks.length, question.candidates.length, `${label}: every candidate is checked`);
  checks.forEach((step, index) => {
    const x = Number(question.candidates[index]);
    const match = /^Check x = (\S+): the radicand .+? is (\S+?)(?:,|\.| which)/.exec(step);
    assert.ok(match && readNumber(match[1]) === x, `${label}: ${step}`);
    assert.ok(near(readNumber(match[2]), m1 * x + b1), `${label}: the radicand at ${x}: ${step}`);
    if (m1 * x + b1 < 0) assert.match(step, /which is negative, so the square root is not a real number\. Reject it\.$/, `${label}: ${step}`);
    const right = /the right side(?: [^,]*?)? is (-?[\d./]+?)(?=[,.] |\.$|, )/.exec(step);
    if (m1 * x + b1 >= 0) assert.ok(right && near(readNumber(right[1]), m2 * x + b2), `${label}: the right side at ${x}: ${step}`);
    const root = /√\(?(\S+?)\)? = (\S+?),/.exec(step);
    if (root) assert.ok(near(Math.sqrt(readNumber(root[1])), readNumber(root[2])), `${label}: ${step}`);
    assert.equal(step.endsWith('Keep it.'), genuine.includes(x), `${label}: ${step}`);
  });
  const last = worked.steps.at(-1);
  const kept = [...last.matchAll(/x = (\S+?)(?=:| and |, | checks? out)/g)].map((match) => readNumber(match[1]));
  assert.deepEqual(kept, genuine, `${label}: the last step keeps exactly the genuine solutions: ${last}`);
  // Every real root of the squared equation (m2·x + b2)² − (m1·x + b1) = 0, here.
  const [qa, qb, qc] = [m2 * m2, 2 * m2 * b2 - m1, b2 * b2 - b1];
  const disc = qb * qb - 4 * qa * qc;
  const squaredRoots = qa === 0 ? [-qc / qb] : disc < 0 ? [] : [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)];
  const complete = squaredRoots.every((root) => question.candidates.some((candidate) => near(Number(candidate), root)));
  // Only a candidate list holding every root may let the conclusion speak of the equation itself.
  const aboutEquation = /the equation's only real solution|the equation has no real solution/.test(last);
  assert.equal(aboutEquation, complete, `${label}: the conclusion claims ${aboutEquation ? 'the whole equation' : 'only the candidates'}: ${last}`);
  if (complete && !genuine.length) assert.match(last, /^So the equation has no real solution: select none of the candidates\.$/, `${label}: ${last}`);
  if (!complete) assert.match(last, genuine.length ? /^So of the candidates, only x = / : /^So none of the candidates solves the equation: select none of them\.$/, `${label}: ${last}`);
  assert.equal(worked.answerSummary, `${last.charAt(3).toUpperCase()}${last.slice(4)}`, `${label}: the summary is the conclusion`);
  const square = worked.steps.find((step) => step.startsWith('Square both sides: '));
  assert.equal(Boolean(square), complete, `${label}: the squaring is shown exactly when it proves the list complete`);
  if (square) {
    const match = /^Square both sides: (.+) = (.+)\. Gather every term on one side: (.+) = 0, (?:so x = (\S+)|and the quadratic formula gives (.+)|which has no real solution: its discriminant b² - 4ac is (\S+), which is negative)\.$/.exec(square);
    assert.ok(match, `${label}: ${square}`);
    const [, left, right, poly, single, formula, discriminant] = match;
    [-3.7, 0.4, 2.9, 11.3].forEach((x) => {
      assert.ok(near(at(left, x), m1 * x + b1) && near(at(right, x), (m2 * x + b2) ** 2), `${label}: the squared sides at ${x}: ${square}`);
      const p = at(poly, x);
      assert.ok(near(p, qa * x * x + qb * x + qc) || near(p, -(qa * x * x + qb * x + qc)), `${label}: the gathered side at ${x}: ${square}`);
    });
    const stated = single ? [readNumber(single)] : formula ? formula.split(' or ').map((part) => readNumber(part.replace(/^x = /, ''))) : [];
    if (discriminant) assert.ok(near(readNumber(discriminant), disc) && disc < 0, `${label}: ${square}`);
    assert.deepEqual(stated.map((root) => squaredRoots.some((r) => near(r, root))), stated.map(() => true), `${label}: each stated root solves the squared equation`);
    assert.ok(squaredRoots.every((root) => stated.some((r) => near(r, root))), `${label}: no root of the squared equation is left out`);
  }
  const selected = question.candidates.filter((candidate) => kept.includes(Number(candidate)));
  const graded = gradeToolWork({ toolId: 'signSolutionAnalyzer', question, work: { selected } });
  assert.equal(graded.isCorrect, true, `${label}: the analyzer's grader accepts ${JSON.stringify(selected)}`);
};

const verifyPoint = (item, worked) => {
  const { label, question, kind } = item;
  const [x, y] = (question.answer || question.solution).map(Number);
  const summary = /^The point is \((\S+), (\S+)\)\.$/.exec(worked.answerSummary);
  assert.ok(summary && readNumber(summary[1]) === x && readNumber(summary[2]) === y, `${label}: ${worked.answerSummary}`);
  const last = worked.steps.at(-1);
  assert.ok(last.endsWith(`(${summary[1]}, ${summary[2]}).`), `${label}: the last step ends on the point: ${last}`);
  assert.equal(gradeOrderedPairResponse(question, `(${summary[1]}, ${summary[2]})`).isCorrect, true, `${label}: the ordered-pair grader accepts it`);
  if (kind === 'plotted') {
    const [origin, across, upDown] = worked.steps;
    assert.match(origin, /origin/);
    const xm = /units (left|right) .*the x-coordinate is (\S+)\.$/.exec(across);
    if (x === 0) assert.match(across, /x-coordinate is 0\.$/);
    else assert.ok(xm && (xm[1] === 'left') === (x < 0) && readNumber(xm[2]) === x && across.includes(` ${Math.abs(x)} units`), `${label}: ${across}`);
    const ym = /units (down|up) .*the y-coordinate is (\S+)\.$/.exec(upDown);
    if (y === 0) assert.match(upDown, /y-coordinate is 0\.$/);
    else assert.ok(ym && (ym[1] === 'down') === (y < 0) && readNumber(ym[2]) === y && upDown.includes(` ${Math.abs(y)} units`), `${label}: ${upDown}`);
    return;
  }
  // Lines: read y = m·x + b off the prompt, by the test.
  const lines = [...ascii(question.prompt).matchAll(/y = ([^a-wz]+?)(?= and | meet|\?)/g)].map((match) => match[1].trim());
  assert.equal(lines.length, 2, `${label}: two lines in the prompt`);
  lines.forEach((line) => assert.ok(near(at(line, x), y), `precondition ${label}: (${x}, ${y}) is on y = ${line}`));
  for (const step of worked.steps) {
    let match;
    if ((match = /set the right sides equal: ([^=]+) = ([^=]+)\.$/.exec(step))) {
      [1.5, -2.25].forEach((t) => assert.ok(near(at(match[1], t), at(lines[0], t)) && near(at(match[2], t), at(lines[1], t)), `${label}: ${step}`));
    } else if ((match = /^Gather the x-terms and the numbers: ([^=]+) = (\S+?)(?:, so x = (\S+))?\.$/.exec(step))) {
      [1.5, -2.25].forEach((t) => assert.ok(near(at(match[1], t) - readNumber(match[2]), at(lines[0], t) - at(lines[1], t)), `${label}: ${step}`));
      assert.ok(near(readNumber(match[3] ?? match[2]), x), `${label}: ${step}`);
    } else if ((match = /^Substitute x = (\S+) into y = ([^:]+): y = ([^=]+) = (\S+)\.$/.exec(step))) {
      assert.ok(readNumber(match[1]) === x && near(at(match[3], 0), at(match[2], x)) && readNumber(match[4]) === y, `${label}: ${step}`);
    } else if ((match = /^Check in y = ([^:]+): ([^=]+) = (\S+)\.$/.exec(step))) {
      assert.ok(near(at(match[2], 0), at(match[1], x)) && readNumber(match[3]) === y, `${label}: ${step}`);
    } else if ((match = /^y = (\S+) is a horizontal line, so at the meeting point y = (\S+)\.$/.exec(step))) {
      assert.ok(readNumber(match[1]) === y && readNumber(match[2]) === y, `${label}: ${step}`);
    } else if ((match = /^Substitute into y = ([^:]+): (\S+) = ([^,]+), so (?:([^=]+) = (\S+) and )?x = (\S+)\.$/.exec(step))) {
      assert.ok(readNumber(match[2]) === y && readNumber(match[6]) === x, `${label}: ${step}`);
      [1.5, -2.25].forEach((t) => assert.ok(near(at(match[3], t), at(match[1], t)), `${label}: ${step}`));
      if (match[4]) [1.5, -2.25].forEach((t) => assert.ok(near(at(match[4], t) + (y - readNumber(match[5])), at(match[1], t)), `${label}: ${step}`));
    } else {
      assert.match(step, /^The lines meet at /, `${label}: a known step: ${step}`);
    }
  }
};

const verifyNumberLine = (item, worked) => {
  const { label, question } = item;
  const target = Number(question.target);
  const labels = question.choices.map(Number).sort((a, b) => a - b);
  const [side, spacing, which] = worked.steps;
  if (target === 0) assert.match(side, /^0 is neither positive nor negative/);
  else assert.equal(/left of zero/.test(side), target < 0, `${label}: ${side}`);
  const listed = /: (.+)\.$/.exec(spacing)[1].split(', ').map(Number);
  assert.deepEqual(listed, labels, `${label}: ${spacing}`);
  const by = /go up by (\S+) /.exec(spacing);
  if (by) labels.slice(1).forEach((value, index) => assert.equal(value - labels[index], Number(by[1]), `${label}: ${spacing}`));
  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const match = /^(\S+) is the (\S+) label from the left: select it\.$/.exec(which);
  assert.ok(match && Number(match[1]) === target && labels[ORDINALS.indexOf(match[2])] === target, `${label}: ${which}`);
  assert.equal(worked.answerSummary, `Select the point ${target}.`);
  assert.equal(gradeNumberLineResponse(question, target).isCorrect, true, `${label}: the number-line grader accepts ${target}`);
};

const VERIFY = {
  graph: verifyInterval,
  solve: verifyInterval,
  factored: verifyInterval,
  verbal: verifyInterval,
  linearInequality: verifyLinearInequality,
  signChart: verifySignChart,
  radical: verifyRadical,
  plotted: verifyPoint,
  lines: verifyPoint,
  numberLine: verifyNumberLine,
};

/* ------------------------------------------------------------ tests */

test('the corpus has every shape several times over, each owned by this family', () => {
  const counts = {};
  ITEMS.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  const minimum = { graph: 30, solve: 30, factored: 12, verbal: 8, linearInequality: 50, signChart: 10, radical: 6, plotted: 30, lines: 6, numberLine: 20 };
  Object.entries(minimum).forEach(([kind, count]) => assert.ok(counts[kind] >= count, `${kind}: ${counts[kind]} items`));
  ITEMS.forEach(({ label, question }) => assert.equal(familyFor(question)?.family, 'pointsAndIntervals', `${label} is owned by ${familyFor(question)?.family}`));
});

test('every worked step is true, follows from the one before, and ends on the key the grader accepts', () => {
  for (const item of ITEMS) {
    const worked = pointsAndIntervals.workedSolution(item.question);
    assert.ok(worked, `${item.label}: a worked solution`);
    assert.ok(worked.steps.length >= 2, `${item.label}: worked in steps`);
    assertTidy(item.label, worked);
    VERIFY[item.kind](item, worked);
  }
});

test('edges end on their conclusion: all real numbers, one point, nothing to select, no real solution', () => {
  const ws = (label) => pointsAndIntervals.workedSolution(ITEMS.find((item) => item.label === label).question);
  assert.match(ws('all real numbers (x − 1)² ≥ 0').steps.at(-1), /shade the whole number line, with an arrow at each end; in interval notation, \(-∞, ∞\); as an inequality, all real numbers\.$/);
  assert.match(ws('one point (x − 1)² ≤ 0').steps.at(-1), /draw a closed dot at 1 and shade nothing else; in interval notation, \[1, 1\]/);
  assert.equal(ws('nothing to select (x − 1)² < 0').steps.at(-1), 'So select no interval, since none makes the expression negative; the solution set is ∅.');
  assert.equal(ws('only a zero (x − 1)² ≤ 0').steps.at(-1), 'So select no interval, since none makes the expression negative; the solution set is [1, 1].');
  assert.equal(ws('no real solution √(x + 2) = −3').steps.at(-1), 'So the equation has no real solution: select none of the candidates.');
  assert.equal(ws('squared equation has no root √x = x + 1').steps.at(-1), 'So the equation has no real solution: select none of the candidates.');
  // x = 8 solves √(x + 1) = 3 and x = 4 solves √(5x − 4) = x: a list without them proves nothing about the equation.
  assert.equal(ws('missed root √(x + 1) = 3').steps.at(-1), 'So none of the candidates solves the equation: select none of them.');
  assert.equal(ws('missed second root √(5x − 4) = x').steps.at(-1), 'So of the candidates, only x = 1 checks out: select it.');
  assert.equal(ws('fraction endpoint 3x + 1 < 2').steps.at(-1), 'So x < 1/3; on the number line, draw an open dot at 1/3 and shade to the left with an arrow; in interval notation, (-∞, 1/3).');
});

test('it returns null, never a wrong step, for what it cannot state exactly', () => {
  const ws = pointsAndIntervals.workedSolution;
  // A key no inequality in the prompt explains: only generic hints, no steps.
  const unknown = { type: 'intervalNumberLine', prompt: 'Show the domain on the number line.', intervals: [{ min: -2, max: 4, minClosed: true }] };
  assert.ok(pointsAndIntervals.matches(unknown));
  assert.equal(ws(unknown), null);
  // The tool's inequality sentence for 1/3 is the rounded "x < 0.3333": not exact, so not stated.
  assert.equal(ws(interval('Solve $3x + 1 < 2$.', [{ min: null, max: 1 / 3 }], ['inequality'])), null);
  // An ordered pair whose key the grader cannot read (text, not two numbers).
  const textKey = { type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' };
  assert.ok(pointsAndIntervals.matches(textKey));
  assert.equal(ws(textKey), null);
  // A pair with nothing to read it from.
  assert.equal(ws(QUESTION_TYPE_CATALOG.orderedPair.example), null);
  // A number line whose target is not one of the points to select.
  assert.equal(ws({ type: 'numberLine', prompt: 'Find 7.', target: 7, choices: [0, 5, 10] }), null);
  assert.equal(ws({ type: 'numberLine', prompt: 'Find 5.', target: 5 }), null);
  // A radical check with its own tolerance is not claimed.
  assert.equal(ws(tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 }, tolerance: 0.01 }, candidates: [3, -15] })), null);
  // An inequality only in equationLatex opens the equation engine, not the
  // relation workspace: its grader cannot read it, so no steps toward it.
  const latexOnly = { type: 'stepAlgebra', equationLatex: '2x + 3 \\le 9' };
  assert.ok(pointsAndIntervals.matches(latexOnly));
  assert.equal(ws(latexOnly), null);
  assert.ok(ws({ ...latexOnly, equation: '2x + 3 <= 9' }), 'the same inequality, opened in the relation workspace, is worked');
  assert.equal(ws(null), null);
});

test('the closed review shows these steps when the item has none of its own', () => {
  const question = ITEMS.find((item) => item.label === 'V5 y = 2x - 1 and y = -x + 5').question;
  const review = buildClosedQuestionReview({ question });
  assert.equal(review.fromFamily, true);
  assert.deepEqual(review.authored.reasoning, pointsAndIntervals.workedSolution(question).steps);
  assert.equal(review.authored.answerSummary, 'The point is (2, 3).');
});

test('it is reachable only from the closed review: no hint, back-up or sibling path calls it', () => {
  const source = executableSource(fs.readFileSync(new URL('src/platform/supports/families/pointsAndIntervals.js', ROOT), 'utf8'));
  const sectionStart = source.indexOf('const SLOPPY =');
  assert.ok(sectionStart > 0, 'the worked-solution section');
  for (const name of ['export const hints', 'export const backUpQuestion', 'export const similarProblem', 'export const expectedValues', 'export const matches']) {
    const position = source.indexOf(name);
    assert.ok(position > 0 && position < sectionStart, `${name} comes before the worked solution`);
  }
  assert.doesNotMatch(source.slice(0, sectionStart), /workedSolution|solveWork|stagedAnswer|WORKED\b/, 'an open-item path calls the worked solution');
  assert.deepEqual([...source.slice(sectionStart).matchAll(/export const (\w+)/g)].map((match) => match[1]), ['workedSolution']);
});
