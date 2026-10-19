import test from 'node:test';
import assert from 'node:assert/strict';

import buildStepAlgebra2ReviewDefault, {
  buildStepAlgebra2Review,
  implemented,
} from '../../src/tools/shared/reviews/stepAlgebra2Review.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  LEGACY_SOLVER_DEFAULT_EQUATION,
  legacySolverWork,
  rewriteLinearFormWork,
} from '../../functions/shared/serverGrading/tools/stepAlgebra2.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

/*
 * THE STEP ALGEBRA 2 REVIEW STATES WORK THE SHARED GRADER MARKS CORRECT.
 *
 * Once a stepAlgebra2 question is closed, its review shows the worked
 * solution. Each review here is read back AS TEXT — the balanced moves its
 * steps tell the student to make, or the equation its answer item writes — and
 * turned into the work a student following it submits, then marked by the
 * grader the server records with (gradeToolWork). It must come back correct
 * and complete, and the value it names must be the one the grader records.
 *
 * Both views the grader marks are covered (the ax + b = c balance solver and
 * the rewrite to y = a(x − c) or y = mx + b), with questions shaped the way
 * the platform stores them: the V5 compiler's output, the sample tool bank,
 * the grader's own fixtures. Every one is checked to still reach this tool
 * after runtime repair, so this is the review those students are shown.
 */

const TOOL_ID = 'stepAlgebra2';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const compileV5 = (questions) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Step Algebra 2 review', courseId: 'algebra1' },
  sections: [{ role: 'classwork', questions }],
}).package.sections[0].questions;

/* ---------------------------------------------------------------------------
 * Reading a review back
 * ------------------------------------------------------------------------- */

const assertTextOnly = (model, label) => {
  assert.ok(model && typeof model === 'object', `${label}: a review`);
  assert.equal(typeof model.title, 'string', `${label}: title`);
  assert.ok(model.title.trim(), `${label}: title text`);
  assert.ok(Array.isArray(model.items) && model.items.length > 0, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: item shape`);
    assert.equal(typeof item.label, 'string');
    assert.equal(typeof item.value, 'string');
    assert.ok(item.label.trim() && item.value.trim(), `${label}: item text`);
  });
  assert.ok(Array.isArray(model.steps) && model.steps.length > 0, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.trim(), `${label}: step text`));
  assert.ok(model.why === null || (typeof model.why === 'string' && model.why.trim()), `${label}: why`);
  assert.ok(model.note === null || (typeof model.note === 'string' && model.note.trim()), `${label}: note`);
  const texts = [model.title, ...model.items.flatMap((item) => [item.label, item.value]), ...model.steps, model.why, model.note].filter(Boolean);
  texts.forEach((text) => assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object Object\]|\bnull\b/, `${label}: no leaked non-text in "${text}"`));
  // Exactly what textOnlyReview keeps: nothing else rides along.
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why']);
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;
const plainNumber = (text) => String(text).replace(/−/g, '-').trim();
const numberValue = (text) => {
  const [numerator, denominator = '1'] = plainNumber(text).replace(/[()]/g, '').split('/');
  return Number(numerator) / Number(denominator);
};

// The balanced moves the review's steps tell the student to make, in order.
const MOVE_PATTERNS = [
  [/\bsubtract ([\d.]+) from both sides\b/, 'subtract', 1],
  [/\badd ([\d.]+) to both sides\b/, 'add', 1],
  [/\bdivide both sides by (−?[\d.]+)\b/, 'divide', 1],
];
const statedMoves = (model) => model.steps.flatMap((step) => MOVE_PATTERNS
  .map(([pattern, operation]) => {
    const match = step.match(pattern);
    return match ? [{ operation, operand: Number(plainNumber(match[1])) }] : [];
  })
  .flat());

// The answer item's LaTeX ("$y = -\frac{5}{2}\left(x - \frac{6}{5}\right)$")
// as the plain equation the workspace holds, through a strict whitelist.
const latexToPlain = (latex) => {
  const text = String(latex).replace(/^\$|\$$/g, '')
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '($1/$2)')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .trim();
  assert.match(text, /^[xy\d\s.+\-*/()=]+$/, `not a plain equation: ${latex}`);
  const [left, right] = text.split('=').map((side) => side.trim());
  return { left, right };
};

/* ---------------------------------------------------------------------------
 * Fixtures: questions shaped the way the platform stores them
 * ------------------------------------------------------------------------- */

const [v5Solver, v5Factored, v5AlreadyFactored] = compileV5([
  { studentActions: ['interactiveAlgebra'], equationModel: { a: 4, b: -7, c: 9 }, prompt: 'Solve 4x − 7 = 9 one balanced move at a time.' },
  { studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: '2y = 10x - 40', prompt: 'Rewrite in factored form.' },
  { studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 2(x - 3)' },
]);

const SOLVER_QUESTIONS = [
  // [question, expected x, expected moves]
  [{ type: TOOL_ID, toolId: TOOL_ID, equation: { a: 3, b: 6, c: 21 } }, 5, [['subtract', 6], ['divide', 3]]],
  [v5Solver, 4, [['add', 7], ['divide', 4]]],
  // The sample tool bank's question (toolId only, no type).
  [{ toolId: TOOL_ID, masteryEvidenceKeys: [], dok: 2, difficultyBand: 3, equation: { a: 3, b: 6, c: 21 } }, 5, [['subtract', 6], ['divide', 3]]],
  // No equation authored: the screen and the grader open 3x + 6 = 21.
  [{ type: TOOL_ID }, 5, [['subtract', 6], ['divide', 3]]],
  [{ type: TOOL_ID, equation: { a: 9, b: 0, c: 20 } }, 20 / 9, [['divide', 9]]],
  [{ type: TOOL_ID, equation: { a: -2, b: 4, c: 10 } }, -3, [['subtract', 4], ['divide', -2]]],
  [{ type: TOOL_ID, equation: { a: 2.5, b: -1.5, c: 6 } }, 3, [['add', 1.5], ['divide', 2.5]]],
  [{ type: TOOL_ID, equation: { a: -1, b: -3, c: 2 } }, -5, [['add', 3], ['divide', -1]]],
  [{ type: TOOL_ID, equation: { a: 1, b: 8, c: 3 } }, -5, [['subtract', 8]]],
  [{ type: TOOL_ID, equation: { a: 1, b: 0, c: 7 } }, 7, []],
];

const FACTORED = (equation) => ({ type: TOOL_ID, toolId: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation });
const FACTORED_QUESTIONS = [
  // [question, a, c]
  [FACTORED('y = 5x - 20'), 5, 4],
  [v5Factored, 5, 4],
  [v5AlreadyFactored, 2, 3],
  [FACTORED('y = -3x - 12'), -3, -4],
  [FACTORED('5x + 2y = 6'), -5 / 2, 6 / 5],
  [FACTORED('-3x - 6y = 12'), -1 / 2, -4],
  [FACTORED('y = 2x'), 2, 0],
  [FACTORED('y = x - 4'), 1, 4],
  [FACTORED('6x - 3y = 18'), 2, 3],
  [{ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'factoredLinear', leftExpression: '4y', rightExpression: '-8x + 12' }, -2, 1.5],
];

// A target the screen does not recognise opens (and is graded as) slope-intercept;
// the runtime repair leaves a mis-cased "FactoredLinear" on this tool.
const SLOPE = (equation) => ({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'FactoredLinear', equation });
const SLOPE_INTERCEPT_QUESTIONS = [
  // [question, m, b]
  [SLOPE('5x + 2y = 6'), -5 / 2, 3],
  [SLOPE('y - 7 = -(2/3)(x + 3)'), -2 / 3, 5],
  [SLOPE('y = (6 - 5x)/2'), -5 / 2, 3],
  [SLOPE('-3x - 6y = 12'), -1 / 2, -2],
  [SLOPE('2y = 6'), 0, 3],
  [SLOPE('3x - 7y = 2'), 3 / 7, -2 / 7],
];

test('every fixture is a question this tool still grades after runtime repair', () => {
  for (const [question] of [...SOLVER_QUESTIONS, ...FACTORED_QUESTIONS, ...SLOPE_INTERCEPT_QUESTIONS]) {
    const delivered = deliveredQuestionForGrading({ type: TOOL_ID, ...question });
    assert.equal(resolveGradingSurfaceId(delivered), TOOL_ID, JSON.stringify(question));
  }
});

/* ---------------------------------------------------------------------------
 * default: the ax + b = c balance solver
 * ------------------------------------------------------------------------- */

test('solver: the moves the review states are graded correct, and its x is the value the grader records', () => {
  for (const [question, expected, expectedMoves] of SOLVER_QUESTIONS) {
    const label = JSON.stringify(question.equation ?? 'default');
    const model = buildStepAlgebra2Review(question);
    assertTextOnly(model, label);

    const moves = statedMoves(model);
    assert.deepEqual(moves.map(({ operation, operand }) => [operation, operand]), expectedMoves, `${label}: the stated moves`);
    const result = grade(question, legacySolverWork(moves));
    assert.equal(result.graded, true, label);
    assert.equal(result.mode, 'default', label);
    assert.equal(result.isCorrect, true, `${label}: a student following the review is marked correct`);
    assert.equal(result.isComplete, true, label);
    assert.equal(result.score, 1, label);

    // The stated solution is the value the grader records for x, and solves ax + b = c.
    const stated = itemValue(model, 'Solution');
    assert.match(stated, /^x = /, label);
    const recorded = result.parts.find((part) => part.id === 'x-value').response;
    assert.equal(plainNumber(stated.slice(4)), recorded, `${label}: x as the grader records it`);
    const { a, b, c } = question.equation || LEGACY_SOLVER_DEFAULT_EQUATION;
    assert.ok(Math.abs(a * numberValue(stated.slice(4)) + b - c) < 1e-9, `${label}: x solves the equation`);
    assert.ok(Math.abs(numberValue(stated.slice(4)) - expected) < 1e-9, `${label}: x = ${expected}`);

    // The check substitutes the same x back into the equation the screen showed.
    assert.ok(model.why.includes(`x = ${stated.slice(4)}`), `${label}: why substitutes x`);
    const checked = model.why.match(/^Substitute x = \S+ into (.+?): /);
    if (checked) assert.ok(model.steps[0].includes(checked[1]), `${label}: why checks the equation the steps start from`);
  }
});

test('solver: the review shows the equation the screen shows, with exact fractions', () => {
  const review = (equation) => buildStepAlgebra2Review({ type: TOOL_ID, equation });
  assert.match(review({ a: 3, b: 6, c: 21 }).steps[0], /^Start with 3x \+ 6 = 21\./);
  assert.match(review({ a: -2, b: 4, c: 10 }).steps[0], /^Start with −2x \+ 4 = 10\./);
  const fractional = review({ a: 2.5, b: -1.5, c: 6 });
  assert.match(fractional.steps[0], /^Start with \(5\/2\)x − 3\/2 = 6\./);
  assert.match(fractional.steps.at(-1), /divide both sides by 2\.5: x = 3\.$/, 'the operand is the number the student types');
  assert.equal(itemValue(review({ a: 9, b: 0, c: 20 }), 'Solution'), 'x = 20/9', 'never 2.222');
});

test('solver discrimination: a review whose move went the wrong way would be marked wrong', () => {
  // The grading above can fail: the same review with its constant move
  // flipped is not credited by the grader.
  const question = SOLVER_QUESTIONS[0][0];
  const moves = statedMoves(buildStepAlgebra2Review(question));
  const flipped = moves.map((move) => (move.operation === 'subtract' ? { ...move, operation: 'add' } : move));
  assert.equal(grade(question, legacySolverWork(flipped)).isCorrect, false);
  assert.equal(grade(question, legacySolverWork(moves.slice(0, 1))).isCorrect, false, 'stopping early is not credited');
});

/* ---------------------------------------------------------------------------
 * rewriteLinearForm
 * ------------------------------------------------------------------------- */

const gradeStatedEquation = (question, model, itemLabel) => {
  const finished = latexToPlain(itemValue(model, itemLabel));
  assert.equal(finished.left, 'y', 'the answer has y alone on the left');
  // As the rewrite screen submits it: the equation on screen and the step that reached it.
  return grade(question, rewriteLinearFormWork(finished, [{ after: finished }]));
};

test('factored target: the equation the review states is graded correct, with the a and c it names', () => {
  for (const [question, a, c] of FACTORED_QUESTIONS) {
    const label = question.equation || `${question.leftExpression} = ${question.rightExpression}`;
    const model = buildStepAlgebra2Review(question);
    assertTextOnly(model, label);
    const result = gradeStatedEquation(question, model, 'Factored linear form');
    assert.equal(result.graded, true, label);
    assert.equal(result.mode, 'rewriteLinearForm', label);
    assert.equal(result.isCorrect, true, `${label}: the stated factored form is correct`);
    assert.equal(result.isComplete, true, label);
    assert.equal(result.score, 1, label);
    assert.equal(result.parts.at(-1).label, 'Written as y = a(x − c)', label);

    assert.ok(Math.abs(numberValue(latexToPlain(`y = ${itemValue(model, 'a (the slope)').replace(/\$/g, '')}`).right) - a) < 1e-9, `${label}: a`);
    assert.ok(Math.abs(numberValue(latexToPlain(`y = ${itemValue(model, 'c (the x-intercept)').replace(/\$/g, '')}`).right) - c) < 1e-9, `${label}: c`);
    // The worked steps start from the question's own equation and end on the answer.
    assert.ok(model.steps.at(-1).includes(itemValue(model, 'Factored linear form').replace(/\$/g, '')), `${label}: steps reach the answer`);
    assert.match(model.why, /Distribute to check/, label);
  }
});

test('factored target: a line through the origin and a slope of 1 keep the form the grader requires', () => {
  const origin = buildStepAlgebra2Review(FACTORED('y = 2x'));
  assert.equal(itemValue(origin, 'Factored linear form'), '$y = 2\\left(x - 0\\right)$');
  const unit = buildStepAlgebra2Review(FACTORED('y = x - 4'));
  assert.equal(itemValue(unit, 'Factored linear form'), '$y = 1\\left(x - 4\\right)$');
  assert.match(unit.note, /1 in front of the parentheses/);
  // Without the written-out 1 the grader does not finish the form.
  assert.equal(grade(FACTORED('y = x - 4'), rewriteLinearFormWork({ left: 'y', right: '(x - 4)' }, [])).isCorrect, false);
});

test('slope-intercept target: the equation the review states is graded correct, with the m and b it names', () => {
  for (const [question, m, b] of SLOPE_INTERCEPT_QUESTIONS) {
    const label = question.equation;
    const model = buildStepAlgebra2Review(question);
    assertTextOnly(model, label);
    const result = gradeStatedEquation(question, model, 'Slope-intercept form');
    assert.equal(result.isCorrect, true, `${label}: the stated slope-intercept form is correct`);
    assert.equal(result.isComplete, true, label);
    assert.equal(result.score, 1, label);
    assert.equal(result.parts.at(-1).label, 'Written as y = mx + b', label);
    assert.ok(Math.abs(numberValue(latexToPlain(`y = ${itemValue(model, 'Slope m').replace(/\$/g, '')}`).right) - m) < 1e-9, `${label}: m`);
    assert.ok(Math.abs(numberValue(latexToPlain(`y = ${itemValue(model, 'y-intercept b').replace(/\$/g, '')}`).right) - b) < 1e-9, `${label}: b`);
  }
});

test('rewrite discrimination: the stated equation with a different c or slope is marked wrong', () => {
  // The grading above can fail: the review's own equation, altered, is not credited.
  const question = FACTORED('5x + 2y = 6');
  const model = buildStepAlgebra2Review(question);
  const finished = latexToPlain(itemValue(model, 'Factored linear form'));
  assert.equal(finished.right, '-(5/2)(x - (6/5))');
  for (const right of ['-(5/2)(x + (6/5))', '(5/2)(x - (6/5))', '-(5/2)x + 3']) {
    assert.equal(grade(question, rewriteLinearFormWork({ left: 'y', right }, [])).isCorrect, false, right);
  }
});

/* ---------------------------------------------------------------------------
 * The index, and what has no review
 * ------------------------------------------------------------------------- */

test('the index serves this builder, and buildToolSolutionReviewModel returns its model unchanged', () => {
  assert.equal(implemented, true);
  assert.equal(buildStepAlgebra2ReviewDefault, buildStepAlgebra2Review);
  assert.equal(TOOL_REVIEW_BUILDERS.stepAlgebra2, buildStepAlgebra2Review);
  for (const [question] of [...SOLVER_QUESTIONS, ...FACTORED_QUESTIONS, ...SLOPE_INTERCEPT_QUESTIONS]) {
    const viaIndex = buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID });
    assert.ok(viaIndex, JSON.stringify(question));
    assert.deepEqual(viaIndex, buildStepAlgebra2Review({ ...question, toolId: TOOL_ID }), JSON.stringify(question));
  }
});

test('null, empty, malformed and ungraded questions have no review, and nothing throws', () => {
  const throwing = Object.defineProperty({ type: TOOL_ID }, 'equation', { enumerable: true, get() { throw new Error('boom'); } });
  const cases = [
    null, undefined, {}, [], 'stepAlgebra2', 42,
    throwing,
    // Not a stepAlgebra2 question: no default equation is invented for it.
    { equation: null },
    // No unique solution (a = 0), or an equation the solver cannot open.
    { type: TOOL_ID, equation: { a: 0, b: 2, c: 5 } },
    { type: TOOL_ID, equation: { a: '3', b: 6, c: 21 } },
    { type: TOOL_ID, equation: { a: 3, c: 21 } },
    { type: TOOL_ID, equation: [3, 6, 21] },
    { type: TOOL_ID, equation: '3x + 6 = 21' },
    { type: TOOL_ID, equation: { a: 3, b: 6, c: Number.NaN } },
    // An operand the student could not type into the number box.
    { type: TOOL_ID, equation: { a: 3, b: 1 / 3, c: 7 } },
    // linearIntercepts is not graded by this tool.
    { type: TOOL_ID, mode: 'linearIntercepts', equation: '3x + 4y = 24' },
    // Rewrites with no line, a vertical line, no factored form (slope 0), or an unreadable equation.
    { type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'factoredLinear' },
    FACTORED('x = 7'),
    FACTORED('y = 7'),
    FACTORED('y = x^2 - 4'),
    FACTORED('y = mx + 3'),
    FACTORED({ a: 2, b: 3, c: 7 }),
    FACTORED('y = 5x - 20 = 3'),
  ];
  cases.forEach((question, index) => {
    assert.doesNotThrow(() => buildStepAlgebra2Review(question), `case ${index}`);
    assert.equal(buildStepAlgebra2Review(question), null, `case ${index}`);
  });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID, mode: 'linearIntercepts', equation: '3x + 4y = 24' }), null);
});
