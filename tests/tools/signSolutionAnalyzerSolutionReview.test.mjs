import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildSignSolutionAnalyzerReview,
  implemented,
} from '../../src/tools/shared/reviews/signSolutionAnalyzerReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildSignIntervals } from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * THE SIGN & SOLUTION REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Sign & Solution Analyzer question is closed, its review names the
 * chart intervals to select (polynomial and rational sign charts) or the
 * candidates to keep (radicalCheck), with the worked steps that reach them.
 * Every review here is turned back into the work a student following it would
 * submit — the chart toggles whose labels it names, the candidate buttons it
 * names — and graded by the shared grader the server records with; it must
 * come back correct, and a selection one interval/candidate off must not.
 *
 * The full solution set the review also states (endpoints, isolated zeros,
 * holes) is not graded by the chart, so it is checked independently: by
 * evaluating the expression itself across the number line.
 */

const TOOL_ID = 'signSolutionAnalyzer';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/* ------------------------------------------------------------------ */
/* realistic questions                                                 */
/* ------------------------------------------------------------------ */

const compiled = compileAuthoringIntentV5({
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

const sampleQuestions = (file) => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
  .questions.filter((question) => question.toolId === TOOL_ID);
const batchB = sampleQuestions('SAMPLE_BATCH_B_DEEP_DIVE.json');
const missingTools = sampleQuestions('SAMPLE_MISSING_MATH_TOOLS.json');

const q = (fields) => ({ type: TOOL_ID, ...fields });

// [label, question, mode the grader marks]
const CHARTS = [
  ['V5 (x + 1)²(x − 4) ≤ 0', compiled[0], 'polynomial'],
  ['V5 rational (x − 2)/(x + 3) ≥ 0', compiled[1], 'rational'],
  ['V5 x(x − 5) > 0 (a bare x factor)', compiled[3], 'polynomial'],
  ['batch B polynomial (x + 2)(x − 3)² > 0', batchB.find((question) => question.mode === 'polynomial'), 'polynomial'],
  ['batch B rational (x + 2)(x − 3)/(x − 1) ≥ 0', batchB.find((question) => question.mode === 'rational'), 'rational'],
  ['missing-tools sample (x + 2)(x − 3) > 0, no mode', missingTools[0], 'polynomial'],
  ['inferred rational (x − 2)/[(x + 1)(x − 4)] < 0', q({ numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -1 }, { root: 4 }], relation: '<' }), 'rational'],
  ['cubic (x + 3)x(x − 2) < 0', q({ mode: 'polynomial', factors: [{ root: -3 }, { root: 0 }, { root: 2 }], relation: '<' }), 'polynomial'],
  ['isolated zero (x − 1)²(x − 3) ≥ 0', q({ factors: [{ root: 1, multiplicity: 2 }, { root: 3 }], relation: '>=' }), 'polynomial'],
  ['no solution (x − 1)² < 0', q({ factors: [{ root: 1, multiplicity: 2 }], relation: '<' }), 'polynomial'],
  ['single point (x − 1)² ≤ 0', q({ factors: [{ root: 1, multiplicity: 2 }], relation: '<=' }), 'polynomial'],
  ['fractional roots (x − 1.5)(x + 0.5) ≤ 0', q({ factors: [{ root: 1.5 }, { root: -0.5 }], relation: '<=' }), 'polynomial'],
  ['a hole (x − 2)(x + 1)/(x − 2) ≥ 0', q({ mode: 'rational', numeratorFactors: [{ root: 2 }, { root: -1 }], denominatorFactors: [{ root: 2 }], relation: '>=' }), 'rational'],
  ['template text roots', q({ factors: [{ root: '-2', multiplicity: '1' }, { root: '3' }], relation: '<=' }), 'polynomial'],
  ['a factor listed twice (x − 2)(x − 2)(x + 1) > 0', q({ factors: [{ root: 2 }, { root: 2 }, { root: -1 }], relation: '>' }), 'polynomial'],
  ['even denominator (x + 1)/(x − 3)² > 0', q({ mode: 'rational', numeratorFactors: [{ root: -1 }], denominatorFactors: [{ root: 3, multiplicity: 2 }], relation: '>' }), 'rational'],
  ['numerator 1: 1/(x − 1) < 0', q({ mode: 'rational', numeratorFactors: [], denominatorFactors: [{ root: 1 }], relation: '<' }), 'rational'],
  ['seven critical points (eight intervals)', q({ factors: [-3, -2, -1, 0, 1, 2, 3].map((root, index) => ({ root, multiplicity: 1 + (index % 2) })), relation: '>=' }), 'polynomial'],
  ['an unknown mode is the polynomial chart', q({ mode: 'weird', factors: [{ root: -4 }, { root: 1 }], relation: '>' }), 'polynomial'],
];

const RADICALS = [
  ['V5 √(2x + 3) = x', compiled[2]],
  ['batch B √(x + 6) = 3', batchB.find((question) => question.mode === 'radicalCheck')],
  ['no solution √x = −2', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 0, b: -2 } }, candidates: [4] })],
  ['template text candidates', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: 1, b: 0 } }, candidates: ['3', '-1'] })],
  ['two genuine √(5x − 4) = x', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 5, b: -4 }, rhs: { m: 1, b: 0 } }, candidates: [1, 4] })],
  ['extraneous and outside the domain √(x + 7) = x − 5', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 7 }, rhs: { m: 1, b: -5 } }, candidates: [9, 2, -8] })],
  ['an irrational left side √(x + 1) = 2', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 1 }, rhs: { m: 0, b: 2 } }, candidates: [3, 6] })],
  ['decimal coefficient √(0.5x + 2) = 2', q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 0.5, b: 2 }, rhs: { m: 0, b: 2 } }, candidates: [4, -6] })],
];

/* ------------------------------------------------------------------ */
/* reading the review back as work                                     */
/* ------------------------------------------------------------------ */

const assertTextOnly = (model, label, { items }) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.ok(typeof model.title === 'string' && model.title, `${label}: title`);
  assert.equal(model.items.length, items, `${label}: items`);
  model.items.forEach((item) => {
    assert.ok(typeof item.label === 'string' && item.label, `${label}: item label`);
    assert.ok(typeof item.value === 'string' && item.value, `${label}: item value`);
  });
  assert.ok(model.steps.length >= 3 && model.steps.length <= 12, `${label}: steps (textOnlyReview keeps 12)`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify(model), /NaN|undefined|Infinity|\[object|null\)/, `${label}: no broken value`);
};

// The chart the student sees (SignSolutionAnalyzer.jsx SignChart): its
// factors, and each toggle's label in the order the toggles hold indexes.
const chartOf = (question, mode) => {
  const numeratorFactors = question.numeratorFactors || question.factors;
  const denominatorFactors = mode === 'rational' ? question.denominatorFactors : [];
  const { intervals } = buildSignIntervals({ numeratorFactors, denominatorFactors }, question.relation || '>');
  const labels = intervals.map((interval) => `(${Number.isFinite(interval.left) ? interval.left : '−∞'}, ${Number.isFinite(interval.right) ? interval.right : '∞'})`);
  return { numeratorFactors, denominatorFactors, labels };
};

const statedIntervals = (model) => {
  const value = itemValue(model, 'Intervals to select');
  assert.ok(value, 'the review names the intervals to select');
  return value.startsWith('None') ? [] : value.split(' ∪ ');
};

// The toggles a student following the review presses, last one first.
const chartWorkFromReview = (model, question, mode) => {
  const { labels } = chartOf(question, mode);
  const selected = statedIntervals(model).map((label) => {
    const index = labels.indexOf(label);
    assert.ok(index >= 0, `the review's interval ${label} is a toggle on the chart (${labels.join(' | ')})`);
    return index;
  });
  return { selected: selected.reverse() };
};

// The candidate buttons a student following the review presses (authored values).
const radicalWorkFromReview = (model, question) => {
  const value = itemValue(model, 'Genuine solutions (select)');
  assert.ok(value, 'the review names the genuine solutions');
  if (value.startsWith('None')) return { selected: [] };
  const selected = value.split(', ').map((label) => {
    const candidate = question.candidates.find((entry) => `x = ${String(entry).trim()}` === label);
    assert.ok(candidate !== undefined, `the review's ${label} is a candidate button`);
    return candidate;
  });
  return { selected };
};

/* ------------------------------------------------------------------ */
/* independent mathematics (no analyzer code)                          */
/* ------------------------------------------------------------------ */

const expressionAt = ({ numeratorFactors, denominatorFactors }, x) => {
  const product = (factors) => factors.reduce((value, factor) => value * (x - Number(factor.root)) ** Number(factor.multiplicity ?? 1), 1);
  const bottom = product(denominatorFactors);
  return bottom === 0 ? Number.NaN : product(numeratorFactors) / bottom;
};
const satisfies = (value, relation) => {
  if (!Number.isFinite(value)) return false;
  if (relation === '>') return value > 0;
  if (relation === '>=') return value >= 0;
  if (relation === '<') return value < 0;
  return value <= 0;
};

const bound = (text) => (text === '−∞' ? -Infinity : text === '∞' ? Infinity : Number(text));
const parseSolutionSet = (text) => {
  if (text === 'No solution (∅)') return [];
  return text.split(' ∪ ').map((part) => {
    const point = part.match(/^\{(.+)\}$/);
    if (point) return { left: Number(point[1]), right: Number(point[1]), leftClosed: true, rightClosed: true };
    const match = part.match(/^([[(])(.+), (.+)([\])])$/);
    assert.ok(match, `a solution-set piece: ${part}`);
    return { left: bound(match[2]), right: bound(match[3]), leftClosed: match[1] === '[', rightClosed: match[4] === ']' };
  });
};
const inSet = (pieces, x) => pieces.some((piece) => (piece.leftClosed ? x >= piece.left : x > piece.left)
  && (piece.rightClosed ? x <= piece.right : x < piece.right));

// Every critical point, points just beside each, and a fine grid across them.
const samplePoints = (roots) => {
  const low = Math.min(...roots) - 3;
  const high = Math.max(...roots) + 3;
  const points = [...roots, ...roots.map((root) => root - 0.01), ...roots.map((root) => root + 0.01)];
  for (let x = low; x <= high; x += 0.125) points.push(x);
  return points;
};

/* ------------------------------------------------------------------ */
/* the tests                                                           */
/* ------------------------------------------------------------------ */

test('the sign & solution review is implemented and the review index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildSignSolutionAnalyzerReview);
});

CHARTS.forEach(([label, question, mode]) => {
  test(`sign-chart review — ${label}: text only, worked, and accepted by the shared grader`, () => {
    assert.ok(question, `${label}: fixture present`);
    const model = buildSignSolutionAnalyzerReview(question);
    assertTextOnly(model, label, { items: 4 });

    // The intervals it names are exactly what the grader accepts.
    const work = chartWorkFromReview(model, question, mode);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.mode, mode, `${label}: the mode the grader marks`);
    assert.equal(result.isCorrect, true, `${label}: the review's selection is correct`);
    assert.equal(result.score, 1);

    // ...and nothing one toggle away is.
    const { labels } = chartOf(question, mode);
    labels.forEach((_, index) => {
      const toggled = work.selected.includes(index) ? work.selected.filter((entry) => entry !== index) : [...work.selected, index];
      assert.equal(grade(question, { selected: toggled }).isCorrect, false, `${label}: toggling ${labels[index]} is wrong`);
    });

    // Independent: each interval it selects is where the expression has the
    // right sign, evaluated directly at the interval's midpoint.
    const chart = chartOf(question, mode);
    const relation = question.relation || '>';
    const { intervals } = buildSignIntervals(chart, relation);
    intervals.forEach((interval, index) => {
      const x = !Number.isFinite(interval.left) ? interval.right - 0.5 : !Number.isFinite(interval.right) ? interval.left + 0.5 : (interval.left + interval.right) / 2;
      const strict = relation.startsWith('>') ? expressionAt(chart, x) > 0 : expressionAt(chart, x) < 0;
      assert.equal(work.selected.includes(index), strict, `${label}: ${labels[index]} selected iff the expression has the right sign there`);
    });

    // Independent: the stated solution set is exactly where the inequality holds.
    const pieces = parseSolutionSet(itemValue(model, 'Solution set'));
    const roots = [...chart.numeratorFactors, ...chart.denominatorFactors].map((factor) => Number(factor.root));
    samplePoints(roots).forEach((x) => {
      assert.equal(inSet(pieces, x), satisfies(expressionAt(chart, x), relation), `${label}: x = ${x} in the stated solution set iff the inequality holds`);
    });

    // The steps work THIS question: every critical point and every interval.
    const critical = [...new Set(roots)];
    critical.forEach((root) => assert.ok(model.steps[0].includes(`x = ${root}`), `${label}: step 1 names x = ${root}`));
    labels.forEach((intervalLabel) => assert.ok(model.steps.some((step) => step.startsWith('Test x = ') && step.includes(` in ${intervalLabel}:`)), `${label}: ${intervalLabel} is tested`));

    // The platform's entry point returns the same model.
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: through buildToolSolutionReviewModel`);
  });
});

RADICALS.forEach(([label, question]) => {
  test(`radical-check review — ${label}: text only, worked, and accepted by the shared grader`, () => {
    assert.ok(question, `${label}: fixture present`);
    const model = buildSignSolutionAnalyzerReview(question);
    assertTextOnly(model, label, { items: 3 });

    const work = radicalWorkFromReview(model, question);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.mode, 'radicalCheck');
    assert.equal(result.isCorrect, true, `${label}: the review's candidates are correct`);

    // Nothing one candidate away is.
    question.candidates.forEach((candidate) => {
      const toggled = work.selected.includes(candidate) ? work.selected.filter((entry) => entry !== candidate) : [...work.selected, candidate];
      assert.equal(grade(question, { selected: toggled }).isCorrect, false, `${label}: toggling x = ${candidate} is wrong`);
    });

    // Independent: a candidate is genuine iff the original equation holds.
    const { radicand, rhs } = question.radicalEquation;
    question.candidates.forEach((candidate) => {
      const x = Number(candidate);
      const inside = radicand.m * x + radicand.b;
      const genuine = inside >= 0 && Math.abs(Math.sqrt(inside) - (rhs.m * x + rhs.b)) < 1e-9;
      assert.equal(work.selected.includes(candidate), genuine, `${label}: x = ${candidate} kept iff it solves the original equation`);
      assert.ok(model.steps.some((step) => step.startsWith(`x = ${String(candidate).trim()}:`)), `${label}: x = ${candidate} is worked`);
    });

    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: through buildToolSolutionReviewModel`);
  });
});

test('the steps show the arithmetic of this question', () => {
  const chart = buildSignSolutionAnalyzerReview(batchB.find((question) => question.mode === 'rational'));
  assert.equal(itemValue(chart, 'Inequality'), '(x + 2)(x − 3) / (x − 1) ≥ 0');
  assert.equal(itemValue(chart, 'Critical points'), 'x = -2, x = 1 (denominator 0), x = 3');
  assert.equal(itemValue(chart, 'Intervals to select'), '(-2, 1) ∪ (3, ∞)');
  assert.equal(itemValue(chart, 'Solution set'), '[-2, 1) ∪ [3, ∞)');
  assert.ok(chart.steps.includes('Test x = 0 in (-2, 1): numerator (x + 2) → 2 (+), (x − 3) → -3 (−); denominator (x − 1) → -1 (−). The expression\'s sign is (+)(−) / (−) = +, and positive satisfies ≥ 0, so select (-2, 1).'));
  assert.match(chart.why, /from left to right that gives − \+ − \+/i);

  const even = buildSignSolutionAnalyzerReview(batchB.find((question) => question.mode === 'polynomial'));
  assert.ok(even.steps.some((step) => step.includes('(x − 3)² → (-6)² (+)')), 'an even power is positive at a negative base');
  assert.match(even.why, /at x = 3 the power is 2 \(even\), so the sign stays \+/);

  const isolated = buildSignSolutionAnalyzerReview(q({ factors: [{ root: 1, multiplicity: 2 }, { root: 3 }], relation: '>=' }));
  assert.equal(itemValue(isolated, 'Solution set'), '{1} ∪ [3, ∞)');
  assert.match(isolated.note, /x = 1 is a solution on its own/);

  const radical = buildSignSolutionAnalyzerReview(compiled[2]);
  assert.equal(itemValue(radical, 'Equation'), '√(2x + 3) = x');
  assert.ok(radical.steps.includes('x = -1: the radicand is 2(-1) + 3 = 1, so the left side is √1 = 1, but the right side is -1. 1 ≠ -1 — a square root is never negative, so x = -1 is extraneous — leave it unselected.'));
  assert.match(radical.why, /2x \+ 3 = x²/);
  assert.match(radical.why, /for x = -1, 2x \+ 3 = 1 and x² = 1/);
  const domain = buildSignSolutionAnalyzerReview(batchB.find((question) => question.mode === 'radicalCheck'));
  assert.equal(itemValue(domain, 'Rejected candidates'), 'x = -15 (outside the domain)');
});

test('an empty selection is the stated answer when nothing qualifies, and the grader accepts it', () => {
  for (const question of [q({ factors: [{ root: 1, multiplicity: 2 }], relation: '<' }), q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 0, b: -2 } }, candidates: [4] })]) {
    const model = buildSignSolutionAnalyzerReview(question);
    assert.match(model.steps[model.steps.length - (question.mode === 'radicalCheck' ? 1 : 2)], /select no (interval|candidate) and press Check/);
    const result = grade(question, { selected: [] });
    assert.equal(result.isCorrect, true);
  }
});

/* ------------------------------------------------------------------ */
/* null — never a guess                                                */
/* ------------------------------------------------------------------ */

test('null, empty and malformed input give null without throwing', () => {
  for (const input of [null, undefined, {}, [], 'x', 5, true, () => {}]) {
    assert.equal(buildSignSolutionAnalyzerReview(input), null, `builder ${String(input)}`);
  }
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel({ type: TOOL_ID }), null);
});

test('a question with no sign-chart data of its own is not reviewed (the analyzer would show its demo, or Step Algebra)', () => {
  const demo = [
    q({ mode: 'polynomial', prompt: 'Make a sign chart.' }),
    q({ mode: 'polynomial', prompt: 'Solve -2x + 3 > 7.' }),
    q({ relation: '<' }),
    // A rational chart without its denominator draws the demo (x − 1).
    q({ mode: 'rational', numeratorFactors: [{ root: 2 }], relation: '>' }),
    q({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [], relation: '>' }),
    // A radical check without its equation or candidates draws the demo.
    q({ mode: 'radicalCheck' }),
    q({ mode: 'radicalCheck', candidates: [3, -15] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: 1, b: 0 } } }),
  ];
  demo.forEach((question) => {
    assert.equal(grade(question, { selected: [] }).graded, true, 'the grader still marks the demo');
    assert.equal(buildSignSolutionAnalyzerReview(question), null, JSON.stringify(question));
  });
});

test('shapes the review cannot explain correctly give null', () => {
  const nullCases = [
    // The explicit polynomial chart ignores denominators: not the problem stated.
    q({ mode: 'polynomial', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>' }),
    // Relations the grader does not read as written ('=>' is read as '<').
    q({ factors: [{ root: -2 }, { root: 3 }], relation: '=>' }),
    q({ factors: [{ root: -2 }, { root: 3 }], relation: 5 }),
    // Factors the grader would read as something else, or cannot read.
    q({ factors: 5 }),
    q({ factors: [3, 4] }),
    q({ factors: [{ root: null }] }),
    q({ factors: [{ root: '' }] }),
    q({ factors: [{ root: 'abc' }] }),
    q({ factors: [{ root: 1, multiplicity: 1.5 }] }),
    q({ factors: [{ root: 1, multiplicity: 0 }] }),
    q({ factors: [{ root: 1, multiplicity: true }] }),
    // No critical point, too many, or too close to tell apart.
    q({ mode: 'polynomial', numeratorFactors: [], factors: [{ root: 1 }] }),
    q({ factors: Array.from({ length: 8 }, (_, index) => ({ root: index })) }),
    q({ factors: [{ root: 1 }, { root: 1.0001 }] }),
    // Radical checks the review cannot state exactly.
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: [] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: [3, '3'] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: [3, null] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: 'three' }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 }, tolerance: 0.1 }, candidates: [3] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 'two', b: 6 }, rhs: { m: 0, b: 3 } }, candidates: [3] }),
    q({ mode: 'radicalCheck', radicalEquation: { radicand: 6, rhs: { m: 0, b: 3 } }, candidates: [3] }),
  ];
  nullCases.forEach((question) => {
    assert.doesNotThrow(() => buildSignSolutionAnalyzerReview(question));
    assert.equal(buildSignSolutionAnalyzerReview(question), null, JSON.stringify(question));
    assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null, `index: ${JSON.stringify(question)}`);
  });
  // Why '=>' must be null: the grader reads it by its first character, as
  // '<', so the intervals where (x + 2)(x − 3) ≥ 0 are graded wrong — a review
  // stating them would be wrong.
  const misspelled = q({ factors: [{ root: -2 }, { root: 3 }], relation: '=>' });
  assert.equal(grade(misspelled, { selected: [0, 2] }).isCorrect, false);
  assert.equal(grade(misspelled, { selected: [1] }).isCorrect, true);
  // The symbol '≥' itself is the relation the chart shows (Job K): graded as
  // '>=' and explained (kAudit_signSolutionAnalyzer.test.mjs).
  const unicode = q({ factors: [{ root: -2 }, { root: 3 }], relation: '≥' });
  assert.equal(grade(unicode, { selected: [0, 2] }).isCorrect, true);
  assert.equal(grade(unicode, { selected: [1] }).isCorrect, false);
});
