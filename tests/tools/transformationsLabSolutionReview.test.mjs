import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildTransformationsLabReview,
  implemented,
} from '../../src/tools/shared/reviews/transformationsLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import {
  TOOLS_WITH_SOLUTION_REVIEW_BUILDER,
  buildToolSolutionReviewModel,
} from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  mapParentPoint,
  resolveTransformationsQuestion,
  transformationDescriptor,
  transformedAnchor,
  transformedSourcePoints,
} from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

/*
 * THE TRANSFORMATIONS LAB REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Transformations Lab question is closed, its review gives the answer
 * for the lab's mode — the target's parameters (match), the graph's a, h, k
 * (identify), the mapped point (pointMap), every transformed source point in
 * order (plotTransform), the ten descriptions (describe) or the transformed
 * defining feature (anchor) — with the worked steps and a check.
 *
 * Every review is turned back into the work a student following it would
 * enter (each stated value typed into its box, each stated point plotted in
 * order) and graded by the shared grader the server records with: it must
 * come back correct. Where the graph a student reads does not fix the value
 * the grader marks (a line's h and k, an exponential's a and h, any a·b trade
 * off), the review is null rather than a guess dressed as a deduction.
 */

const TOOL_ID = 'transformationsLab';
const q = (fields = {}) => ({ type: TOOL_ID, questionId: 'tl-review', ...fields });
const build = buildTransformationsLabReview;
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const DESCRIBE_KEYS = {
  'Reflection across the x-axis?': 'reflection',
  'Vertical scale': 'scaleKind',
  'Vertical scale factor |a|': 'scaleFactor',
  'Reflection across the y-axis?': 'horizontalReflection',
  'Horizontal scale': 'horizontalScaleKind',
  'Horizontal scale factor 1/|b|': 'horizontalScaleFactor',
  'Horizontal translation': 'horizontalDirection',
  'Horizontal shift (units)': 'horizontalDistance',
  'Vertical translation': 'verticalDirection',
  'Vertical shift (units)': 'verticalDistance',
};
const CHOICE_KEYS = new Set(['reflection', 'scaleKind', 'horizontalReflection', 'horizontalScaleKind', 'horizontalDirection', 'verticalDirection']);

// What a student types for a stated number: "5/3 ≈ 1.667" is typed 1.667
// (the lab's boxes are type="number"); "2" is typed 2.
const typedOf = (value) => (value.includes('≈') ? value.split('≈')[1].trim() : value);
const numberOf = (text) => {
  const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+)$/.exec(text.trim());
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(text);
};
const pointOf = (value) => {
  const match = /^\(([^,]+), ([^)]+)\)$/.exec(value);
  assert.ok(match, `a stated point is written (x, y): ${value}`);
  return [numberOf(match[1]), numberOf(match[2])];
};
const modeOf = (question) => question.mode || 'match';
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

// The work a student who follows the review submits, read from its items only.
const workFromReview = (question, model) => {
  const mode = modeOf(question);
  if (mode === 'match' || mode === 'identify') {
    const work = {};
    for (const item of model.items) if (['a', 'b', 'h', 'k'].includes(item.label)) work[item.label] = typedOf(item.value);
    return work;
  }
  if (mode === 'pointMap') {
    return { mappedX: typedOf(itemValue(model, 'Transformed x')), mappedY: typedOf(itemValue(model, 'Transformed y')) };
  }
  if (mode === 'plotTransform') {
    return { plottedPoints: model.items.map((item, index) => {
      assert.match(item.label, new RegExp(`^P${index + 1}\\b`), 'points are stated in plotting order');
      return pointOf(item.value).map((value) => Number(value.toFixed(6)));
    }) };
  }
  if (mode === 'describe') {
    const work = {};
    for (const item of model.items) {
      const key = DESCRIBE_KEYS[item.label];
      assert.ok(key, `describe item ${item.label} names a lab box`);
      work[key] = CHOICE_KEYS.has(key) ? item.value.toLowerCase() : typedOf(item.value);
    }
    return work;
  }
  const xItem = model.items.find((item) => item.label.endsWith(' x-coordinate'));
  const yItem = model.items.find((item) => item.label.endsWith(' y-coordinate'));
  return { anchorX: typedOf(xItem.value), anchorY: typedOf(yItem.value) };
};

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 1, `${label}: items`);
  for (const item of model.items) {
    assert.equal(typeof item.label, 'string', `${label}: item label is text`);
    assert.equal(typeof item.value, 'string', `${label}: item value is text`);
    assert.ok(item.value.trim(), `${label}: item value is not blank`);
  }
  assert.ok(model.steps.length >= 2, `${label}: worked steps`);
  assert.ok(model.steps.length <= 12, `${label}: within what the review panel keeps`);
  for (const step of model.steps) assert.equal(typeof step, 'string', `${label}: step is text`);
  assert.equal(typeof model.why, 'string', `${label}: a check`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note is text or null`);
  // "undefined at x = …" is the rational check's own words about its asymptote.
  assert.doesNotMatch(JSON.stringify(model), /undefined(?! at \$x = )|NaN|Infinity|\[object Object\]/, `${label}: nothing unrendered leaks into the text`);
};

// Builds the review, checks its shape, grades what it states, and checks that
// the platform's review index serves the same model.
const assertReviewGradesCorrect = (question, label) => {
  const model = build(question);
  assertTextOnly(model, label);
  const work = workFromReview(question, model);
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.mode, modeOf(question), `${label}: graded in the lab's mode`);
  assert.equal(result.isCorrect, true, `${label}: the shared grader accepts the stated answer ${JSON.stringify(work)}`);
  assert.equal(result.score, 1, `${label}: full score`);
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the review index serves this model`);
  return { model, work, result };
};

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

test('the builder is implemented and picked up by the review index', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildTransformationsLabReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
});

test('null, {} and malformed input give null without throwing', () => {
  const hostile = new Proxy({}, { get() { throw new Error('boom'); } });
  const inputs = [
    null, undefined, {}, [], 'match', 42, true, hostile,
    q(), q({ mode: 'match' }), q({ mode: 'identify', family: 'absolute' }),
    q({ mode: 'match', target: [1, 2] }), q({ mode: 'describe', function: 'x^2' }),
    q({ mode: { toString: () => 'match' }, target: { a: 2 } }),
    q({ mode: 'plotTransform', family: 'linear', function: { a: 2 } }),
  ];
  inputs.forEach((input, index) => {
    assert.doesNotThrow(() => build(input), `input ${index} does not throw`);
    assert.equal(build(input), null, `input ${index} gives null`);
  });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
});

/* ------------------------------------------------------------------ */
/* match                                                               */
/* ------------------------------------------------------------------ */

const ALEKS_BOUNDS = { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };

test('match: the target\'s own parameters, for every family and with a b box', () => {
  const questions = {
    cubic: q({ mode: 'match', family: 'cubic', target: { a: -1, h: -3, k: 2 }, graphBounds: { ...ALEKS_BOUNDS, yMax: 10 }, initial: { a: -1, h: 0, k: 0 } }),
    absoluteWithB: q({ mode: 'match', family: 'absolute', target: { a: 1, b: 2, h: 0, k: -4 }, graphBounds: ALEKS_BOUNDS, initial: { a: 1, b: 1, h: 0, k: 0 } }),
    absoluteHalf: q({ mode: 'match', family: 'absolute', target: { a: 0.5, h: 4, k: -2 }, graphBounds: ALEKS_BOUNDS, initial: { a: 1, h: 0, k: 0 } }),
    exponential: q({ mode: 'match', family: 'exponential', target: { a: 0.5, h: -1, k: 2, base: 2 } }),
    quadratic: q({ mode: 'match', family: 'quadratic', target: { a: -2, h: 1, k: 3 } }),
    legacyTypeOnly: { toolId: TOOL_ID, type: 'quadratic', target: { a: -2, h: 1, k: 3 } },
    linear: q({ mode: 'match', family: 'linear', target: { a: 2, h: 1, k: 0 } }),
    rational: q({ mode: 'match', family: 'rational', target: { a: -1, h: 1, k: -2 } }),
    logarithmic: q({ mode: 'match', family: 'logarithmic', target: { a: 2, h: -1, k: 1, base: 3 } }),
    squareRootWithB: q({ mode: 'match', family: 'squareRoot', includeHorizontalScale: true, target: { a: 2, b: -1, h: 1, k: 0 } }),
  };
  for (const [label, question] of Object.entries(questions)) {
    const { model, work } = assertReviewGradesCorrect(question, `match ${label}`);
    const { targetSpec, showB } = resolveTransformationsQuestion(question);
    assert.deepEqual(Object.keys(work).sort(), (showB ? ['a', 'b', 'h', 'k'] : ['a', 'h', 'k']).sort(), `${label}: one value per box the lab shows`);
    for (const key of Object.keys(work)) assert.equal(Number(work[key]), targetSpec[key], `${label}: ${key} is the target's`);
    assert.match(model.note, /any a, (b, )?h, k that draw this same graph/, `${label}: equivalent graphs are named as accepted`);
  }

  const { model } = assertReviewGradesCorrect(questions.cubic, 'match cubic pinned');
  assert.equal(itemValue(model, 'Target graph'), '$y = -(x + 3)^{3} + 2$');
  assert.deepEqual(model.items.filter((item) => item.label.length === 1), [
    { label: 'a', value: '-1' }, { label: 'h', value: '-3' }, { label: 'k', value: '2' },
  ]);
  assert.match(model.steps.join(' '), /inflection point is at \$\(-3, 2\)\$, so \$h = -3\$ and \$k = 2\$/, 'the steps read THIS target');
  assert.match(model.why, /from \$x = -8\$ to \$x = 8\$/, 'the check names the window the grader samples');

  const withB = build(questions.absoluteWithB);
  assert.equal(itemValue(withB, 'b'), '2');
  assert.match(withB.steps.join(' '), /which is \$\\frac\{1\}\{b\}\$, so \$b = 2\$/);
});

test('match: a value that is not a short decimal is stated with the places the graph check needs', () => {
  // a = 1/3 typed as 0.333 is off by 0.0003 · (x − 2)² — up to 0.027 at
  // x = −7, beyond the graph check's 0.02 — so six places are stated.
  const question = q({ mode: 'match', family: 'quadratic', target: { a: 1 / 3, h: 2, k: 0 } });
  const shortWork = { a: '0.333', h: '2', k: '0' };
  assert.equal(grade(question, shortWork).isCorrect, false, 'three places are not enough here');
  const { model, work } = assertReviewGradesCorrect(question, 'match a = 1/3');
  assert.equal(itemValue(model, 'a'), '1/3 ≈ 0.333333');
  assert.equal(work.a, '0.333333');
  assert.match(itemValue(model, 'Target graph'), /\\frac\{1\}\{3\}\(x - 2\)\^\{2\}/);
});

test('match: a target with no graph in the window, or a b the student cannot enter, has no review', () => {
  // ln(x − 20) is undefined from −7 to 7: the grader can mark nothing correct.
  assert.equal(build(q({ mode: 'match', family: 'logarithmic', target: { a: 1, h: 20, k: 0 } })), null);
  // inputScale is read as b, but no b box is shown, so the student's b is 1.
  assert.equal(build(q({ mode: 'match', family: 'quadratic', target: { a: 1, inputScale: 2, h: 0, k: 0 } })), null);
});

/* ------------------------------------------------------------------ */
/* identify                                                            */
/* ------------------------------------------------------------------ */

test('identify: a, h, k read off the graph for every family whose graph fixes them', () => {
  const cases = [
    [q({ mode: 'identify', family: 'absolute', function: { family: 'absolute', type: 'absolute', a: 2, h: 3, k: -1 } }), { a: '2', h: '3', k: '-1' }],
    [q({ mode: 'identify', family: 'rational', function: { type: 'rational', a: 3, h: -1, k: 2 } }), { a: '3', h: '-1', k: '2' }],
    [q({ mode: 'identify', family: 'cubeRoot', function: { type: 'cubeRoot', a: -2, h: 1, k: -3 } }), { a: '-2', h: '1', k: '-3' }],
    [q({ mode: 'identify', family: 'absolute', function: { type: 'absolute', a: 0.5, h: -2, k: 1 } }), { a: '0.5', h: '-2', k: '1' }],
    [q({ mode: 'identify', family: 'quadratic', function: { a: -0.5, h: 2, k: -1 } }), { a: '-0.5', h: '2', k: '-1' }],
    [q({ mode: 'identify', family: 'logarithmic', function: { a: -1, h: 2, k: 1, base: 2 } }), { a: '-1', h: '2', k: '1' }],
    [q({ mode: 'identify', family: 'squareRoot', function: { a: 1.5, h: -2, k: 0 } }), { a: '1.5', h: '-2', k: '0' }],
    [q({ mode: 'identify', family: 'cubic', function: { a: 2, h: 0, k: 4 } }), { a: '2', h: '0', k: '4' }],
  ];
  for (const [question, expected] of cases) {
    const label = `identify ${question.family}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual(work, expected, `${label}: the stated a, h, k`);
    assert.ok(model.steps.some((step) => /h = /.test(step) && /k = /.test(step)), `${label}: h and k are read from the graph`);
  }
  const rational = build(cases[1][0]);
  assert.equal(itemValue(rational, 'Function'), '$y = \\frac{3}{x + 1} + 2$');
  assert.match(rational.steps.join(' '), /asymptotes \$x = 0\$ and \$y = 0\$\. On the graph they are \$x = -1\$ and \$y = 2\$/);
  assert.match(rational.why, /\$x = 0\$ gives \$y = 5\$ — the point read from the graph/);
});

test('identify: no review where the graph does not fix the graded a, h, k', () => {
  // 2·2^(x−1) − 3 is 2^x − 3: the graph shows a = 1, h = 0 just as well as
  // a = 2, h = 1. The grader now accepts both (Job K, defect 2e — this line
  // used to pin the other reading as wrong), but a worked solution would
  // still present one arbitrary reading as a deduction, so there is none.
  const exponential = q({ mode: 'identify', family: 'exponential', function: { a: 2, h: 1, k: -3 } });
  assert.equal(grade(exponential, { a: '1', h: '0', k: '-3' }).isCorrect, true, 'the other reading of the same curve is marked right');
  assert.equal(build(exponential), null);
  // A line passes through every one of its points: h and k are not readable.
  assert.equal(build(q({ mode: 'identify', family: 'linear', function: { a: 2, h: 1, k: 3 } })), null);
  // With a b box, a and b trade off (|2x| is 2|x|).
  assert.equal(build(q({ mode: 'identify', family: 'absolute', function: { a: 1, b: 2, h: 0, k: 0 } })), null);
  assert.equal(build(q({ mode: 'identify', family: 'absolute', includeHorizontalScale: true, function: { a: 2, h: 0, k: 0 } })), null);
});

/* ------------------------------------------------------------------ */
/* pointMap                                                            */
/* ------------------------------------------------------------------ */

test('pointMap: the parent point carried to (x/b + h, ay + k), with exact fractions', () => {
  const cases = [
    [q({ mode: 'pointMap', family: 'cubic', function: { type: 'cubic', a: 2, h: 1, k: -1 }, parentPoint: [1, 1] }), ['2', '1']],
    [q({ mode: 'pointMap', family: 'squareRoot', function: { type: 'squareRoot', a: 0.5, h: 3, k: 2 }, parentPoint: [4, 2] }), ['7', '3']],
    [q({ mode: 'pointMap', family: 'exponential', function: { type: 'exponential', a: -3, base: 2, h: 2, k: 1 }, parentPoint: [0, 1] }), ['2', '-2']],
    [q({ mode: 'pointMap', family: 'exponential', function: { type: 'exponential', a: 2, h: 1, k: -3, base: 2 }, parentPoint: [1, 2] }), ['2', '1']],
    [q({ mode: 'pointMap', family: 'absolute', function: { a: -2, b: 3, h: 1, k: 4 }, parentPoint: [2, 2] }), ['5/3 ≈ 1.667', '0']],
    [q({ mode: 'pointMap', family: 'quadratic', function: { a: 1, b: -1, h: 0, k: 0 }, parentPoint: [1, 5] }), ['-1', '5']],
    // No parent point authored: the lab maps its defining feature's.
    [q({ mode: 'pointMap', family: 'quadratic', function: { a: 3, h: -2, k: 5 } }), ['-2', '5']],
  ];
  for (const [question, expected] of cases) {
    const label = `pointMap ${JSON.stringify(question.function)}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual([itemValue(model, 'Transformed x'), itemValue(model, 'Transformed y')], expected, `${label}: the stated point`);
    const { investigationSpec, parentPoint } = resolveTransformationsQuestion(question);
    const graded = mapParentPoint(parentPoint, investigationSpec);
    assert.ok(Math.abs(Number(work.mappedX) - graded[0]) <= 0.01 && Math.abs(Number(work.mappedY) - graded[1]) <= 0.01, `${label}: the grader's own image`);
  }
  const fractional = build(cases[4][0]);
  assert.ok(fractional.steps.includes('Transformed x: $\\frac{2}{3} + 1 = \\frac{5}{3}$.'), 'the x arithmetic is shown exactly');
  assert.ok(fractional.steps.includes('Transformed y: $-2 \\cdot 2 + 4 = 0$.'));
  assert.match(build(cases[0][0]).why, /substituting \$x = 2\$ into \$y = 2\(x - 1\)\^\{3\} - 1\$ gives \$y = 1\$/);
  assert.match(build(cases[5][0]).why, /undo each step/, 'a point off the parent graph is checked by undoing the moves');
});

test('pointMap: a parent point the lab cannot print has no review', () => {
  const base = { mode: 'pointMap', family: 'quadratic', function: { a: 1, h: 1, k: 1 } };
  assert.equal(build(q({ ...base, parentPoint: { x: 1, y: 1 } })), null, 'the lab prints parentPoint[0], parentPoint[1]');
  assert.equal(build(q({ ...base, parentPoint: [1, 'two'] })), null);
});

/* ------------------------------------------------------------------ */
/* plotTransform                                                       */
/* ------------------------------------------------------------------ */

test('plotTransform: every source point\'s image, in plotting order', () => {
  const general = (fn, sourcePoints) => q({ mode: 'plotTransform', family: 'linear', function: { family: 'linear', type: 'linear', ...fn }, sourcePoints, sourceLabel: 'General graph', graphBounds: ALEKS_BOUNDS, snapStep: 1 });
  const cases = [
    [general({ a: 1, b: -1, h: 0, k: 0 }, [{ x: -4, y: -5 }, { x: 4, y: -3 }]), ['(4, -5)', '(-4, -3)']],
    [general({ a: -1, b: 1, h: 0, k: 0 }, [{ x: -7, y: 5 }, { x: -4, y: 2 }, { x: 4, y: 6 }]), ['(-7, -5)', '(-4, -2)', '(4, -6)']],
    [general({ a: 0.5, b: 1, h: 0, k: 0 }, [{ x: -2, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 4 }]), ['(-2, 2)', '(0, 0)', '(2, 2)']],
    [general({ a: 1, b: 0.5, h: 0, k: 0 }, [{ x: -2, y: 2 }, { x: 2, y: 4 }]), ['(-4, 2)', '(4, 4)']],
    [general({ a: -1, b: 1, h: 0, k: 3 }, [{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 0 }]), ['(0, 3)', '(2, -1)', '(4, 3)']],
    [general({ a: 2, b: 1, h: -1, k: 0 }, [[-2, -4], [0, 0], [4, -2]]), ['(-3, -8)', '(-1, 0)', '(3, -4)']],
    [general({ a: 2, b: 3, h: -1, k: 1 }, [{ x: 1, y: 2 }, { x: 3, y: 0 }, [4, 4]]), ['(-2/3, 5)', '(0, 1)', '(1/3, 9)']],
  ];
  for (const [question, expected] of cases) {
    const label = `plotTransform ${JSON.stringify(question.function)}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual(model.items.map((item) => item.value), expected, `${label}: the stated images`);
    const { investigationSpec, sourcePoints } = resolveTransformationsQuestion(question);
    const images = transformedSourcePoints(sourcePoints, investigationSpec);
    assert.equal(work.plottedPoints.length, images.length, `${label}: one point per image`);
    assert.match(model.note, /Order matters/);
  }
  const negated = build(cases[5][0]);
  assert.ok(negated.steps.includes('S1 $(-2, -4)$ moves to $\\left(-2 + (-1),\\ 2 \\cdot (-4) + 0\\right) = (-3, -8)$, so P1 is $(-3, -8)$.'));
  assert.match(negated.steps[0], /^The new graph is \$y = 2f\(x \+ 1\)\$/);
  assert.match(negated.why, /\$-3 - \(-1\) = -2\$ and \$\\frac\{-8 - 0\}\{2\} = -4\$/);

  // The same points plotted out of order are not the answer.
  const reversed = { plottedPoints: workFromReview(cases[5][0], negated).plottedPoints.slice().reverse() };
  assert.equal(grade(cases[5][0], reversed).isCorrect, false);
});

test('plotTransform: more source points than the step budget are grouped, never dropped', () => {
  const sourcePoints = Array.from({ length: 14 }, (_, index) => ({ x: index - 7, y: (index % 3) - 1 }));
  const question = q({ mode: 'plotTransform', family: 'linear', function: { a: 2, b: 1, h: 1, k: -1 }, sourcePoints });
  const { model } = assertReviewGradesCorrect(question, 'plotTransform 14 points');
  assert.equal(model.items.length, 14);
  for (let index = 1; index <= 14; index += 1) assert.ok(model.steps.some((step) => step.includes(`so P${index} is`)), `P${index} is worked`);
});

test('plotTransform: an unplottable or missing source point has no review', () => {
  const fn = { a: 2, h: 1, k: 0 };
  assert.equal(build(q({ mode: 'plotTransform', family: 'linear', function: fn, sourcePoints: [] })), null);
  assert.equal(build(q({ mode: 'plotTransform', family: 'linear', function: fn, sourcePoints: [[0, 0], [1, 'x']] })), null);
  assert.equal(build(q({ mode: 'plotTransform', family: 'linear', function: fn, sourcePoints: [[0, 0], { x: null, y: 1 }] })), null);
});

/* ------------------------------------------------------------------ */
/* describe                                                            */
/* ------------------------------------------------------------------ */

test('describe: the ten descriptions, for every family whose graph fixes them', () => {
  const questions = [
    q({ mode: 'describe', family: 'absolute', function: { family: 'absolute', type: 'absolute', a: -1, h: 2, k: 3 }, graphBounds: ALEKS_BOUNDS }),
    q({ mode: 'describe', family: 'squareRoot', function: { type: 'squareRoot', a: -0.5, h: -2, k: 3 } }),
    q({ mode: 'describe', family: 'squareRoot', function: { type: 'squareRoot', a: -0.5, h: 3, k: 2 } }),
    q({ mode: 'describe', family: 'cubic', function: { a: 3, h: 0, k: -4 } }),
    q({ mode: 'describe', family: 'rational', function: { a: 0.25, h: -3, k: 0 } }),
    q({ mode: 'describe', family: 'logarithmic', function: { a: 2, h: 1, k: -2, base: 2 } }),
    q({ mode: 'describe', family: 'quadratic', function: { a: 1, b: 1, h: 0, k: 0 } }),
  ];
  for (const question of questions) {
    const label = `describe ${question.family} ${JSON.stringify(question.function)}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.equal(model.items.length, 10, `${label}: one item per description box`);
    const descriptor = transformationDescriptor(resolveTransformationsQuestion(question).investigationSpec);
    assert.equal(work.reflection, descriptor.reflection ? 'yes' : 'no', `${label}: reflection`);
    assert.equal(work.scaleKind, descriptor.verticalScaleKind, `${label}: vertical scale`);
    assert.equal(work.horizontalDirection, descriptor.horizontalDirection, `${label}: horizontal translation`);
    assert.equal(work.verticalDirection, descriptor.verticalDirection, `${label}: vertical translation`);
  }
  const { model } = assertReviewGradesCorrect(questions[1], 'describe squareRoot pinned');
  assert.deepEqual(model.items.map((item) => item.value), ['Yes', 'Compression', '0.5', 'No', 'Unchanged', '1', 'Left', '2', 'Up', '3']);
  assert.ok(model.steps.includes('Inside, $x - h = x + 2$ with $h = -2$: the graph moves left 2 units (x\'s do the opposite of the sign you see).'));
  assert.match(model.why, /becomes \$y = -0\.5\\sqrt\{x \+ 2\} \+ 3\$/);
});

test('describe: no review where the graph does not fix the graded descriptions', () => {
  // The teacher's exponential: −2·2^(x−2) + 1 is the same curve as −2^(x−1) + 1,
  // which describes as "unchanged, right 1" where the grader wants "stretch 2, right 2".
  const exponential = q({ mode: 'describe', family: 'exponential', function: { family: 'exponential', a: -2, base: 2, h: 2, k: 1, type: 'exponential' } });
  assert.equal(build(exponential), null);
  assert.equal(build(q({ mode: 'describe', family: 'linear', function: { a: 2, h: 1, k: 0 } })), null);
  // An inside multiplier trades off with a: |2x| is 2|x|.
  assert.equal(build(q({ mode: 'describe', family: 'absolute', function: { a: 1, b: 2, h: 0, k: 0 } })), null);
});

/* ------------------------------------------------------------------ */
/* anchor                                                              */
/* ------------------------------------------------------------------ */

test('anchor: the transformed defining feature', () => {
  const cases = [
    [q({ mode: 'anchor', family: 'rational', function: { type: 'rational', a: 3, h: -1, k: 2 } }), 'Asymptote intersection', ['-1', '2']],
    [q({ mode: 'anchor', family: 'quadratic', function: { a: -2, b: 3, h: 4, k: -1 } }), 'Vertex', ['4', '-1']],
    [q({ mode: 'anchor', family: 'absolute', function: { a: 0.5, h: -3, k: 2 } }), 'Vertex', ['-3', '2']],
    [q({ mode: 'anchor', family: 'squareRoot', function: { a: 1, h: -3, k: 0 } }), 'Endpoint', ['-3', '0']],
    [q({ mode: 'anchor', family: 'cubic', function: { a: -1, b: 2, h: 1.5, k: -2.5 } }), 'Inflection point', ['1.5', '-2.5']],
    [q({ mode: 'anchor', family: 'cubeRoot', function: { a: 2, h: 0, k: 3 } }), 'Inflection point', ['0', '3']],
    [q({ mode: 'anchor', family: 'logarithmic', function: { a: 2, h: 1, k: -1, base: 3 } }), 'Reference point', ['2', '-1']],
  ];
  for (const [question, feature, expected] of cases) {
    const label = `anchor ${question.family}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual(model.items, [
      { label: `${feature} x-coordinate`, value: expected[0] },
      { label: `${feature} y-coordinate`, value: expected[1] },
    ], `${label}: the stated feature`);
    const { point } = transformedAnchor(resolveTransformationsQuestion(question).investigationSpec);
    assert.deepEqual([Number(work.anchorX), Number(work.anchorY)], point, `${label}: the grader's own feature`);
  }
  const rational = build(cases[0][0]);
  assert.match(rational.steps.join(' '), /It is not a point of the graph/);
  assert.match(rational.why, /undefined at \$x = -1\$/);
});

test('anchor: no review where the reference point is a choice, not a shape', () => {
  assert.equal(build(q({ mode: 'anchor', family: 'exponential', function: { a: 2, h: 1, k: -1 } })), null);
  assert.equal(build(q({ mode: 'anchor', family: 'linear', function: { a: 2, h: 1, k: -1 } })), null);
  assert.equal(build(q({ mode: 'anchor', family: 'logarithmic', function: { a: 1, b: 2, h: 0, k: 0 } })), null);
});

/* ------------------------------------------------------------------ */
/* shapes with nothing honest to state                                 */
/* ------------------------------------------------------------------ */

test('degenerate or inconsistent questions have no review', () => {
  const fn = { a: 2, h: 1, k: -1 };
  // The lab shows no panel for a mode it does not know; its only Check is the
  // anchor boxes the student never saw.
  for (const mode of ['unknownView', ' match ', 'Anchor']) {
    assert.equal(build(q({ mode, family: 'quadratic', function: fn, target: fn })), null, `mode ${JSON.stringify(mode)}`);
  }
  assert.equal(build(q({ mode: 'pointMap', family: 'quadratic', function: { ...fn, a: 0 }, parentPoint: [1, 1] })), null, 'a = 0');
  assert.equal(build(q({ mode: 'pointMap', family: 'quadratic', function: { ...fn, h: 'left' }, parentPoint: [1, 1] })), null, 'a non-numeric h');
  assert.equal(build(q({ mode: 'pointMap', family: 'exponential', function: { ...fn, base: 1 }, parentPoint: [0, 1] })), null, 'base 1');
  assert.equal(build(q({ mode: 'anchor', family: 'absolute', function: { ...fn, type: 'quadratic' } })), null, 'the function\'s type disagrees with the family');
});

/* ------------------------------------------------------------------ */
/* every teacher-authored question                                     */
/* ------------------------------------------------------------------ */

const teacherQuestions = () => {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next);
    else if (next.endsWith('.json')) files.push(next);
  });
  walk('teacher-import-jsons');
  return files.flatMap((file) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(fs.readFileSync(file, 'utf8'))).package;
    return (compiled?.sections || []).flatMap((section) => section.questions || [])
      .filter((question) => question.type === TOOL_ID)
      .map((question) => ({ file: path.basename(file), question }));
  });
};

test('every compiled teacher question gets a review the grader accepts, or none for a documented reason', () => {
  const questions = teacherQuestions();
  assert.ok(questions.length >= 15, 'the teacher imports author Transformations Lab questions');
  const reviewedModes = new Set();
  const unreviewed = [];
  for (const { file, question } of questions) {
    const label = `${file}: ${question.prompt}`;
    const model = build(question);
    if (model) {
      assertReviewGradesCorrect(question, label);
      reviewedModes.add(modeOf(question));
    } else {
      unreviewed.push(`${modeOf(question)}:${resolveTransformationsQuestion(question).investigationSpec.type}`);
    }
  }
  assert.deepEqual([...reviewedModes].sort(), ['describe', 'identify', 'match', 'plotTransform', 'pointMap'].sort(), 'every authored mode except anchor (none authored) is reviewed');
  assert.deepEqual(unreviewed, ['describe:exponential'], 'only the exponential description, whose graph does not fix the graded answer, has no review');
});
