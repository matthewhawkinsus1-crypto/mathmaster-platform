import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import buildGraphing2ReviewDefault, {
  buildGraphing2Review,
  implemented,
} from '../../src/tools/shared/reviews/graphing2Review.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { graphingTargetLine, lineFromPoints } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import {
  formAwareAnchorsForMode,
  requiredConstructionPointCount,
  resolveConstructionPolicy,
} from '../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import { PATH_TOOL_QUESTIONS } from '../platform/fixtures/pathToolQuestions.mjs';
import { region } from '../platform/helpers/sourceContract.mjs';

/*
 * THE GRAPHING2 REVIEW STATES A CONSTRUCTION THE SHARED GRADER ACCEPTS.
 *
 * Once a Graphing2 question is closed, its review names the target line and
 * the points that construct it, with the worked steps that reach them. Every
 * review here is turned back into the work a student following it submits —
 * exactly the points it lists, in its order — and graded by the shared grader
 * the server records with (gradeToolWork): it must come back correct AND
 * complete. Every mode the tool renders is covered, under both construction
 * policies, with questions shaped the way the platform authors them (the Path
 * fixture, the V5 compiler, the seed bank's templated text values).
 *
 * The points must also be ones the student could have plotted: on the tool's
 * own snap grid (read from Graphing2.jsx's resolveSnapStep itself) and inside
 * the plane's bounds (CoordinatePlane clamps every click to them).
 */

const TOOL_ID = 'graphing2';
const MINUS = /−/g;
const FORM_AWARE = { strategy: 'formAware' };
const graphing2 = (fields) => ({ type: TOOL_ID, ...fields });

/* ---------------------------------------------------------------------------
 * The tool's own plane
 * ------------------------------------------------------------------------- */

const componentSource = readFileSync(new URL('../../src/tools/graphing2/Graphing2.jsx', import.meta.url), 'utf8');
// The snap rule the student plotted on, taken from the component itself (it
// is plain JavaScript inside the .jsx file), so a stated point that the plane
// could not land on fails here even if the builder's copy of the rule drifts.
const resolveSnapStep = new Function(`${region(componentSource, 'const resolveSnapStep = ', '\nconst hintsForMode', 'resolveSnapStep')}; return resolveSnapStep;`)();
// Graphing2.jsx: `questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 }`,
// with CoordinatePlane's own ±10 for a bound the object leaves out.
const boundsFor = (question) => ({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, ...(question.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 }) });

const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;

/* ---------------------------------------------------------------------------
 * Reading a review back
 * ------------------------------------------------------------------------- */

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;
const toNumber = (text) => Number(String(text).replace(MINUS, '-'));

// The points the review tells the student to plot, in its order.
const statedPoints = (model) => [...itemValue(model, 'Points to plot').matchAll(/\(([^,()]+), ([^,()]+)\)/g)]
  .map(([, x, y]) => [toNumber(x), toNumber(y)]);

// Graphing2's work: the plotted points plus its "Your line" readout.
const workFor = (points) => ({ points, studentLine: points.length >= 2 ? lineFromPoints(points[0], points[1]) : null });
const grade = (question, points) => gradeToolWork({ toolId: TOOL_ID, question, work: workFor(points) });

// A short arithmetic expression the review writes ("2(1) − 1", "(2/3)(4) + 1/3",
// "−(3 − 2)"), evaluated after a strict whitelist of characters.
const evaluate = (text) => {
  const expression = String(text).trim().replace(MINUS, '-').replace(/÷/g, '/').replace(/(\d|\))\s*\(/g, '$1*(');
  assert.match(expression, /^[\d\s.+\-*/()]+$/, `not plain arithmetic: ${text}`);
  return new Function(`return (${expression});`)();
};
const assertEqualSides = (clause, label) => {
  const sides = clause.split(' = ');
  assert.ok(sides.length >= 2, `${label}: "${clause}" is an equation`);
  const values = sides.map(evaluate);
  values.slice(1).forEach((value) => assert.ok(Math.abs(value - values[0]) < 1e-9, `${label}: ${clause} is not true`));
};

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 3, `${label}: items`);
  model.items.forEach((item) => {
    assert.equal(typeof item.label, 'string');
    assert.equal(typeof item.value, 'string');
    assert.ok(item.label && item.value, `${label}: no empty item`);
  });
  assert.ok(model.steps.length >= 3 && model.steps.length <= 12, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify(model), /NaN|undefined|Infinity|\[object|null\)/, `${label}: no broken value`);
};

// Every piece of arithmetic the review writes out is true.
const assertShownArithmetic = (model, label) => {
  let checked = 0;
  // why: "(x, y): <lhs> = <rhs>[ and <lhs> = <rhs>]" for each substituted point.
  for (const [, , clause] of model.why.matchAll(/\(([^()]+)\): ([^;]+?)(?=; |\. Every)/g)) {
    clause.split(' and ').forEach((part) => { assertEqualSides(part, `${label} why`); checked += 1; });
  }
  // why (through two given points): "<expr> = <y> in y = …".
  for (const [, clause] of model.why.matchAll(/too: (.+?) in y =/g)) {
    clause.split(', ').forEach((part) => { assertEqualSides(part, `${label} why`); checked += 1; });
  }
  model.steps.forEach((step) => {
    // "Choose x = 1: y = (2/3)(1) + 1/3 = 1."
    const substituted = step.match(/^Choose x = [^:]+: y = ([^=]+ = [^=]+?)\. Plot/);
    if (substituted) { assertEqualSides(substituted[1], `${label} step`); checked += 1; }
    // "Its slope is (3 − 1) ÷ (2 − (−2)) = 2 ÷ 4 = 1/2"
    const slope = step.match(/Its slope is (.+?), so the line/);
    if (slope) { assertEqualSides(slope[1], `${label} step`); checked += 1; }
    // "From (0, −1), move right 1 and up 2 to (1, 1): a rise of 2 over a run of 1 is 2, the slope."
    const move = step.match(/From \(([^,]+), ([^)]+)\), move (.+?) to \(([^,]+), ([^)]+)\)/);
    if (move) {
      const [, x1, y1, moves, x2, y2] = move;
      let run = 0; let rise = 0;
      for (const [, direction, size] of moves.matchAll(/(right|left|up|down) ([\d.]+)/g)) {
        if (direction === 'right') run += Number(size);
        if (direction === 'left') run -= Number(size);
        if (direction === 'up') rise += Number(size);
        if (direction === 'down') rise -= Number(size);
      }
      assert.ok(Math.abs(toNumber(x1) + run - toNumber(x2)) < 1e-9 && Math.abs(toNumber(y1) + rise - toNumber(y2)) < 1e-9, `${label}: ${move[0]}`);
      const ratio = step.match(/a rise of (\S+) over a run of (\S+) is (\S+), the slope/);
      if (ratio) {
        assert.equal(toNumber(ratio[1]), rise, `${label}: the rise is the move`);
        assert.equal(toNumber(ratio[2]), run, `${label}: the run is the move`);
        assert.ok(Math.abs(rise / run - evaluate(ratio[3])) < 1e-9, `${label}: ${ratio[0]}`);
      }
      checked += 1;
    }
  });
  return checked;
};

/*
 * The full contract for one question: text only, worked, plottable, and
 * graded correct and complete by the shared grader.
 */
const assertReviewAccepted = (question, { label, line }) => {
  const model = buildGraphing2Review(question);
  assertTextOnly(model, label);
  if (line) assert.equal(itemValue(model, 'Line'), line, `${label}: the target line`);

  const target = graphingTargetLine(question);
  const points = statedPoints(model);
  assert.equal(points.length, requiredConstructionPointCount(question), `${label}: as many points as the tool takes`);
  const step = resolveSnapStep(question, target);
  const bounds = boundsFor(question);
  points.forEach(([x, y]) => {
    assert.ok(onGrid(x, step) && onGrid(y, step), `${label}: (${x}, ${y}) is on the ${step} snap grid`);
    assert.ok(x >= bounds.xMin && x <= bounds.xMax && y >= bounds.yMin && y <= bounds.yMax, `${label}: (${x}, ${y}) is inside the graph`);
  });
  assert.equal(new Set(points.map((point) => point.join())).size, points.length, `${label}: different points`);

  // The grader's form-aware anchors are among the stated points.
  const mode = question.mode || 'slopeIntercept';
  if (resolveConstructionPolicy(question).strategy === 'formAware' && !['throughPoints', 'verticalHorizontal'].includes(mode)) {
    formAwareAnchorsForMode(mode, question, target).anchors.forEach((anchor) => {
      assert.ok(points.some(([x, y]) => Math.abs(x - anchor.point[0]) < 1e-9 && Math.abs(y - anchor.point[1]) < 1e-9),
        `${label}: the ${anchor.id} anchor is plotted`);
    });
  }

  const result = grade(question, points);
  assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  assert.equal(result.isCorrect, true, `${label}: the shared grader accepts the stated points`);
  assert.equal(result.isComplete, true, `${label}: the stated points complete the construction`);

  // A vertical or horizontal line is checked by its shared coordinate, not by
  // arithmetic; every other review writes out sums this file re-evaluates.
  const flat = target.kind === 'vertical' || Number(target.m) === 0;
  assert.ok(assertShownArithmetic(model, label) >= (flat ? 0 : 1), `${label}: the arithmetic is checked`);
  // The index picks the builder up, and the page sees exactly this model.
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: through the index`);
  return model;
};

/* ---------------------------------------------------------------------------
 * Realistic questions
 * ------------------------------------------------------------------------- */

const compiledV5 = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Graphing lines', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    title: 'Practice',
    questions: [
      { prompt: 'Graph y = -3x + 4.', studentActions: ['constructLine'], lineIntent: { m: -3, b: 4 } },
      { prompt: 'Graph the line through (2, 3) with slope -1.', studentActions: ['constructLine'], lineIntent: { point: [2, 3], slope: -1 }, constructionPolicy: FORM_AWARE },
      { prompt: 'Graph 3x - 2y = 6.', studentActions: ['constructLine'], standardForm: { A: 3, B: -2, C: 6 } },
      { prompt: 'Graph the line through (-2, 1) and (2, 3).', studentActions: ['constructLine'], lineIntent: { givenPoints: [[-2, 1], [2, 3]] } },
      { prompt: 'Graph x = 3.', studentActions: ['constructLine'], lineIntent: { orientation: 'vertical', value: 3 } },
      { prompt: 'Graph y = 2(x - 1).', studentActions: ['constructLine'], mode: 'factoredLinear', lineIntent: { factored: { a: 2, c: 1 } }, constructionPolicy: FORM_AWARE },
    ],
  }],
}).package.sections.flatMap((section) => section.questions);

const CASES = {
  slopeIntercept: [
    { label: 'Path fixture y = 2x + 1', question: PATH_TOOL_QUESTIONS.graphing2, line: 'y = 2x + 1' },
    { label: 'V5 y = −3x + 4', question: compiledV5[0], line: 'y = −3x + 4' },
    { label: 'fractional slope with a y-intercept between gridlines', question: graphing2({ mode: 'slopeIntercept', line: { m: 2 / 3, b: 1 / 3 } }), line: 'y = (2/3)x + 1/3' },
    { label: 'half-grid line y = 0.5x + 0.5', question: graphing2({ mode: 'slopeIntercept', line: { m: 0.5, b: 0.5 } }), line: 'y = (1/2)x + 1/2' },
    // The tool snaps to 0.5 here, so (0, 0.25) cannot be plotted; every
    // plottable point of the line has a half-integer x.
    { label: 'y-intercept a quarter off the half grid', question: graphing2({ mode: 'slopeIntercept', line: { m: 0.5, b: 0.25 } }), line: 'y = (1/2)x + 1/4' },
    { label: 'steep line that must step left inside the graph', question: graphing2({ mode: 'slopeIntercept', line: { m: 3, b: 5 } }), line: 'y = 3x + 5' },
    { label: 'formAware y-intercept, three points', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), line: 'y = 2x − 1' },
    { label: 'formAware negative fractional slope', question: graphing2({ mode: 'slopeIntercept', line: { m: -0.75, b: 2 }, constructionPolicy: FORM_AWARE }), line: 'y = (−3/4)x + 2' },
    { label: 'horizontal y = 4', question: graphing2({ mode: 'slopeIntercept', line: { m: 0, b: 4 } }), line: 'y = 4' },
    { label: 'authored vertical line x = 3', question: graphing2({ mode: 'slopeIntercept', line: { x: 3 } }), line: 'x = 3' },
    { label: 'seed-bank template values as text', question: graphing2({ mode: 'slopeIntercept', line: { m: '-2', b: '3' }, prompt: 'Graph $y=-2x+3$ by constructing the line from two accurate points.' }), line: 'y = −2x + 3' },
  ],
  pointSlope: [
    { label: 'V5 formAware through (2, 3), slope −1', question: compiledV5[1], line: 'y = −x + 5' },
    { label: 'slope 3/4 from (−1, 2)', question: graphing2({ mode: 'pointSlope', point: [-1, 2], slope: 0.75 }), line: 'y = (3/4)x + 11/4' },
    { label: 'seed-bank template values as text', question: graphing2({ mode: 'pointSlope', point: ['1', '-3'], slope: '-2' }), line: 'y = −2x − 1' },
    // targetLineFromQuestion rounds b to 0.66666667; the review states 2/3.
    { label: 'slope 1/3 from (1, 1)', question: graphing2({ mode: 'pointSlope', point: [1, 1], slope: 1 / 3 }), line: 'y = (1/3)x + 2/3' },
    { label: 'formAware slope −3/4 from (14, 5) on a wide graph', question: graphing2({ mode: 'pointSlope', point: [14, 5], slope: -0.75, graphBounds: { xMin: 0, xMax: 20, yMin: -5, yMax: 10 }, constructionPolicy: FORM_AWARE }), line: 'y = (−3/4)x + 31/2' },
  ],
  factoredLinear: [
    { label: 'V5 formAware y = 2(x − 1)', question: compiledV5[5], line: 'y = 2x − 2' },
    { label: 'y = 3(x + 1), three points', question: graphing2({ mode: 'factoredLinear', factored: { a: 3, c: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), line: 'y = 3x + 3' },
    { label: 'formAware y = −0.5(x + 2)', question: graphing2({ mode: 'factoredLinear', factored: { a: -0.5, c: -2 }, constructionPolicy: FORM_AWARE }), line: 'y = (−1/2)x − 1' },
    { label: 'zero at the origin y = −2x', question: graphing2({ mode: 'factoredLinear', factored: { a: -2, c: 0 } }), line: 'y = −2x' },
  ],
  throughPoints: [
    { label: 'V5 through (−2, 1) and (2, 3)', question: compiledV5[3], line: 'y = (1/2)x + 2' },
    { label: 'through (1, −2) and (4, 4)', question: graphing2({ mode: 'throughPoints', givenPoints: [[1, -2], [4, 4]] }), line: 'y = 2x − 4' },
    { label: 'slope 1/3 through (0, 0) and (3, 1)', question: graphing2({ mode: 'throughPoints', givenPoints: [[0, 0], [3, 1]] }), line: 'y = (1/3)x' },
    { label: 'slope 2/13 across the whole graph', question: graphing2({ mode: 'throughPoints', givenPoints: [[-6, 1], [7, 3]] }), line: 'y = (2/13)x + 25/13' },
    { label: 'vertical through (2, −1) and (2, 3)', question: graphing2({ mode: 'throughPoints', givenPoints: [[2, -1], [2, 3]] }), line: 'x = 2' },
    { label: 'formAware minimum 3 (graded as the given points)', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]], constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), line: 'y = (1/2)x + 2' },
  ],
  standardForm: [
    { label: 'formAware both intercepts of 2x + y = 4', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), line: 'y = −2x + 4' },
    { label: 'V5 3x − 2y = 6', question: compiledV5[2], line: 'y = (3/2)x − 3' },
    { label: 'x-intercept between gridlines, 3x + 2y = 7', question: graphing2({ mode: 'standardForm', standard: { A: 3, B: 2, C: 7 } }), line: 'y = (−3/2)x + 7/2' },
    { label: 'intercepts and a third point', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts', minimumPoints: 3 } }), line: 'y = −2x + 4' },
    { label: 'only the y-intercept required', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'yIntercept' } }), line: 'y = −2x + 4' },
    { label: 'horizontal 2y = 8, three points', question: graphing2({ mode: 'standardForm', standard: { A: 0, B: 2, C: 8 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), line: 'y = 4' },
    { label: 'vertical 2x = 6', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: FORM_AWARE }), line: 'x = 3' },
    { label: 'through the origin x − y = 0', question: graphing2({ mode: 'standardForm', standard: { A: 1, B: -1, C: 0 }, constructionPolicy: FORM_AWARE }), line: 'y = x' },
    { label: 'seed-bank template values as text', question: graphing2({ mode: 'standardForm', standard: { A: '4', B: '2', C: '8' } }), line: 'y = −2x + 4' },
  ],
  verticalHorizontal: [
    { label: 'V5 vertical x = 3', question: compiledV5[4], line: 'x = 3' },
    { label: 'horizontal y = −2', question: graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: -2 }), line: 'y = −2' },
    { label: 'vertical between gridlines x = −4.5', question: graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: -4.5 }), line: 'x = −9/2' },
    { label: 'formAware minimum 3, value as text', question: graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: '5', constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), line: 'y = 5' },
  ],
};

test('the graphing2 builder is implemented and the index uses it', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS.graphing2, buildGraphing2Review);
  assert.equal(buildGraphing2ReviewDefault, buildGraphing2Review);
});

test('the V5 fixtures compile to the graphing2 shapes this file assumes', () => {
  assert.deepEqual(compiledV5.map((question) => [question.type, question.mode]), [
    ['graphing2', 'slopeIntercept'], ['graphing2', 'pointSlope'], ['graphing2', 'standardForm'],
    ['graphing2', 'throughPoints'], ['graphing2', 'verticalHorizontal'], ['graphing2', 'factoredLinear'],
  ]);
});

Object.entries(CASES).forEach(([mode, cases]) => {
  test(`${mode}: every review states points the shared grader marks correct and complete`, () => {
    cases.forEach((entry) => {
      assert.equal(entry.question.mode || 'slopeIntercept', mode, `${entry.label}: fixture mode`);
      assertReviewAccepted(entry.question, entry);
    });
  });
});

test('the worked steps start from what the form gives and show this question\'s numbers', () => {
  const slope = assertReviewAccepted(graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), { label: 'y = 2x − 1' });
  assert.equal(itemValue(slope, 'Points to plot'), '(0, −1) and (1, 1)');
  assert.ok(slope.steps.includes('Plot the y-intercept (0, −1), where the line crosses the y-axis.'));
  assert.ok(slope.steps.includes('From (0, −1), move right 1 and up 2 to (1, 1): a rise of 2 over a run of 1 is 2, the slope. Plot (1, 1).'));
  assert.match(slope.why, /\(0, −1\): 2\(0\) − 1 = −1; \(1, 1\): 2\(1\) − 1 = 1\./);
  assert.match(slope.note, /^Any 2 different points on this line are marked correct/);

  const standard = assertReviewAccepted(graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), { label: '2x + y = 4' });
  assert.equal(itemValue(standard, 'Points to plot'), '(2, 0) and (0, 4)');
  assert.ok(standard.steps.some((step) => step.includes('For the x-intercept set y = 0: 2x = 4 and x = 2')));
  assert.match(standard.why, /\(2, 0\): 2\(2\) \+ 0 = 4; \(0, 4\): 2\(0\) \+ 4 = 4/);
  assert.match(standard.note, /as long as the x-intercept \(2, 0\) and the y-intercept \(0, 4\) are among them/);

  // The y-intercept (0, 1/3) cannot be plotted on the half grid: the review
  // says so and builds the line from points that can.
  const between = buildGraphing2Review(graphing2({ mode: 'slopeIntercept', line: { m: 2 / 3, b: 1 / 3 } }));
  assert.ok(between.steps.some((step) => /The y-intercept \(0, 1\/3\) falls between the gridlines/.test(step)));
  assert.equal(itemValue(between, 'Points to plot'), '(1, 1) and (4, 3)');

  const pointSlope = buildGraphing2Review(compiledV5[1]);
  assert.match(pointSlope.why, /\(3, 2\): 2 − 3 = −1 and −\(3 − 2\) = −1/);
});

test('the grading check is not vacuous: a point off the line is refused', () => {
  CASES.slopeIntercept.concat(CASES.standardForm, CASES.pointSlope).forEach(({ question, label }) => {
    const points = statedPoints(buildGraphing2Review(question));
    // Off the line: sideways for a vertical line, up for any other.
    const vertical = graphingTargetLine(question).kind === 'vertical';
    const moved = points.map(([x, y], index) => (index !== 1 ? [x, y] : vertical ? [x + 1, y] : [x, y + 1]));
    assert.equal(grade(question, moved).isCorrect, false, `${label}: moving one stated point is wrong`);
  });
});

test('no review where no honest construction exists', () => {
  const cases = [
    // Unauthored: the tool's demonstration line y = 1.5x − 2 is not a question.
    ['an unauthored question', graphing2({})],
    ['an unauthored slope-intercept mode', graphing2({ mode: 'slopeIntercept' })],
    ['a point-slope question with no point', graphing2({ mode: 'pointSlope', slope: 2 })],
    ['an empty line', graphing2({ mode: 'slopeIntercept', line: {} })],
    ['no slope', graphing2({ mode: 'pointSlope', point: [1, 1] })],
    ['an unknown mode', graphing2({ mode: 'parabola', line: { m: 1, b: 0 } })],
    ['identical given points', graphing2({ mode: 'throughPoints', givenPoints: [[1, 1], [1, 1]] })],
    ['one given point', graphing2({ mode: 'throughPoints', givenPoints: [[1, 1]] })],
    ['no orientation', graphing2({ mode: 'verticalHorizontal', value: 3 })],
    ['a curriculum code where the standard-form coefficients belong', graphing2({ mode: 'standardForm', standard: 'A.3C' })],
    ['A and B both zero', graphing2({ mode: 'standardForm', standard: { A: 0, B: 0, C: 4 } })],
    ['a non-numeric factored form', graphing2({ mode: 'factoredLinear', factored: { a: 'x', c: 1 } })],
    ['bounds that are not an object', graphing2({ mode: 'slopeIntercept', line: { m: 2, b: 1 }, graphBounds: 'big' })],
    ['inverted bounds', graphing2({ mode: 'slopeIntercept', line: { m: 2, b: 1 }, graphBounds: { xMin: 5, xMax: -5, yMin: -5, yMax: 5 } })],
    // No grid point inside the graph lies on y = 0.67x except the origin.
    ['a slope that crosses no second grid point', graphing2({ mode: 'slopeIntercept', line: { m: 0.67, b: 0 } })],
    // 0.333333 is not 1/3: (3, 1) is only near the line, and the review does
    // not pass a rounding off as exact.
    ['a six-place decimal slope', graphing2({ mode: 'slopeIntercept', line: { m: 0.333333, b: 0 } })],
    ['a standard-form line through no grid point', graphing2({ mode: 'standardForm', standard: { A: 3, B: 9, C: 7 } })],
    // The required anchor cannot be plotted.
    ['formAware x-intercept 7/3 between gridlines', graphing2({ mode: 'standardForm', standard: { A: 3, B: 2, C: 7 }, constructionPolicy: FORM_AWARE })],
    ['formAware y-intercept 1/3 between gridlines', graphing2({ mode: 'slopeIntercept', line: { m: 2 / 3, b: 1 / 3 }, constructionPolicy: FORM_AWARE })],
    ['formAware given point outside the graph', graphing2({ mode: 'pointSlope', point: [14, 5], slope: -0.75, constructionPolicy: FORM_AWARE })],
    // Form-aware anchors the grader can never find.
    ['formAware slope-intercept with a vertical line', graphing2({ mode: 'slopeIntercept', line: { x: 3 }, constructionPolicy: FORM_AWARE })],
    ['formAware y-intercept of a vertical standard-form line', graphing2({ mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'yIntercept' } })],
    // The grader can use no tolerance, so nothing can be correct.
    ['an unusable authored tolerance', graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, tolerance: 'wide' })],
  ];
  cases.forEach(([label, question]) => {
    assert.equal(buildGraphing2Review(question), null, label);
  });
  // The same lines are explained when nothing blocks them, so the nulls above
  // come from the blocking condition.
  assert.ok(buildGraphing2Review(graphing2({ mode: 'standardForm', standard: { A: 3, B: 2, C: 7 } })));
  assert.ok(buildGraphing2Review(graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } })));
  assert.ok(buildGraphing2Review(graphing2({ mode: 'pointSlope', point: [14, 5], slope: -0.75, graphBounds: { xMin: 0, xMax: 20, yMin: -5, yMax: 10 }, constructionPolicy: FORM_AWARE })));
});

test('never throws, and gives null for null, {} and malformed input', () => {
  [null, undefined, {}, [], 'graphing2', 42, true, () => null,
    { mode: 'throughPoints', givenPoints: 'nope' },
    { mode: 'pointSlope', point: { x: 1, y: 2 }, slope: 1 },
    { mode: 'standardForm', standard: null },
    { mode: 'slopeIntercept', line: { m: 2, b: 1 }, graphBounds: { xMin: null } },
    { mode: 'slopeIntercept', line: { m: 2, b: 1 }, snapStep: 0.0001, graphBounds: { xMin: -100, xMax: 100, yMin: -100, yMax: 100 } },
  ].forEach((input) => {
    assert.doesNotThrow(() => buildGraphing2Review(input));
    assert.equal(buildGraphing2Review(input), null, `null for ${String(JSON.stringify(input))}`);
  });
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
});
