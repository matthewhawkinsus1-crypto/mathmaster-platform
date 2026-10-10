import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFunctionOperationsLabReview,
  implemented,
} from '../../src/tools/shared/reviews/functionOperationsLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import {
  TOOLS_WITH_SOLUTION_REVIEW_BUILDER,
  buildToolSolutionReviewModel,
} from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  deriveFunctionOperations,
  normalizeComposeOrder,
  normalizeFunctionOperations,
} from '../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

/*
 * THE FUNCTION-OPERATIONS REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Function Operations Workbench question is closed, its review lists
 * each requested result — (f + g)(x), (f − g)(x), (fg)(x), (f / g)(x) with its
 * excluded x-values, and f∘g or g∘f — with the worked steps that reach them and
 * a numeric check. The lab has one graded view (every question resolves to
 * `functionOperations`), so every shape that view takes is covered: the default
 * four operations, any authored subset, both composition orders, quotients
 * that divide exactly (a cancelled factor stays excluded) or do not, constant,
 * linear, quadratic and authored-cubic denominators, and decimal coefficients.
 *
 * Every review is turned back into the work a student following it would type
 * (each $…$ answer into its box, the excluded values into theirs) and graded
 * by the shared grader the server records with: it must come back correct.
 * Shapes with no honest single answer to state give null.
 */

const TOOL_ID = 'functionOperationsLab';
const q = (fields = {}) => ({ type: TOOL_ID, questionId: 'fol-review', prompt: 'Find the requested operations for f and g.', ...fields });

const F = { type: 'linear', a: 2, h: 0, k: 1 }; // 2x + 1
const G = { type: 'linear', a: 1, h: 2, k: 0 }; // x − 2

const OPERATION_BY_LABEL = {
  '(f + g)(x)': 'sum',
  '(f − g)(x)': 'difference',
  '(fg)(x)': 'product',
  '(f / g)(x)': 'quotient',
  '(f ∘ g)(x)': 'composition',
  '(g ∘ f)(x)': 'composition',
};
const RESTRICTIONS_LABEL = 'Excluded x-value(s)';

const mathOf = (value) => {
  const match = /^\$([^$]+)\$$/.exec(value);
  return match ? match[1] : null;
};

// The work a student who follows the review submits: each stated answer typed
// into its box exactly as the review writes it.
const workFromReview = (model) => {
  const responses = {};
  let restrictions = '';
  for (const item of model.items) {
    if (item.label === RESTRICTIONS_LABEL) {
      restrictions = mathOf(item.value) ?? '';
      if (restrictions === '') assert.match(item.value, /^None/, 'a blank box is stated as "None"');
      continue;
    }
    const operation = OPERATION_BY_LABEL[item.label];
    assert.ok(operation, `item label ${item.label} names an operation box`);
    const typed = mathOf(item.value);
    assert.ok(typed, `${item.label}: the answer is written as math`);
    responses[operation] = typed;
  }
  return { responses, restrictions };
};

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

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
  assert.ok(model.why === null || typeof model.why === 'string', `${label}: why is text or null`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note is text or null`);
  // "undefined there" is the review's own words about the excluded values.
  assert.doesNotMatch(JSON.stringify(model), /undefined(?! there)|NaN|Infinity|\[object Object\]/, `${label}: nothing unrendered leaks into the text`);
};

// Builds the review, checks its shape, grades what it states, and checks that
// the platform's review index serves the same model.
const assertReviewGradesCorrect = (question, label) => {
  const model = buildFunctionOperationsLabReview(question);
  assertTextOnly(model, label);
  const operations = normalizeFunctionOperations(question.operations);
  const stated = model.items.filter((item) => item.label !== RESTRICTIONS_LABEL).map((item) => OPERATION_BY_LABEL[item.label]);
  assert.deepEqual(stated, operations, `${label}: one stated answer per graded box, in the lab's order`);
  assert.equal(model.items.some((item) => item.label === RESTRICTIONS_LABEL), operations.includes('quotient'), `${label}: excluded values exactly when a quotient is asked`);
  // Every stated answer is worked out in the steps.
  for (const item of model.items.filter((entry) => entry.label !== RESTRICTIONS_LABEL)) {
    assert.ok(model.steps.some((step) => step.includes(mathOf(item.value))), `${label}: the steps reach ${item.value}`);
  }
  const work = workFromReview(model);
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, true, `${label}: the shared grader accepts the stated answer ${JSON.stringify(work)}`);
  assert.equal(result.isComplete, true, `${label}: complete`);
  assert.equal(result.score, 1, `${label}: full score`);
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the review index serves this model`);
  return { model, work };
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

test('the builder is implemented and picked up by the review index', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildFunctionOperationsLabReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
});

/* ------------------------------------------------------------------ */
/* the default four operations                                         */
/* ------------------------------------------------------------------ */

test('default operations: the stated results, steps and check for f = 2x + 1, g = x − 2', () => {
  const { model, work } = assertReviewGradesCorrect(q({ f: F, g: G }), 'basic');
  assert.deepEqual(model.items, [
    { label: '(f + g)(x)', value: '$3x - 1$' },
    { label: '(f − g)(x)', value: '$x + 3$' },
    { label: '(fg)(x)', value: '$2x^{2} - 3x - 2$' },
    { label: '(f / g)(x)', value: '$\\frac{2x + 1}{x - 2}$' },
    { label: 'Excluded x-value(s)', value: '$2$' },
  ]);
  assert.equal(work.restrictions, '2');
  assert.match(model.steps[0], /f\(x\) = 2x \+ 1\$ and \$g\(x\) = x - 2\$/, 'the steps start from THIS question\'s functions');
  assert.ok(model.steps.some((step) => step.includes('2x + 1 - x + 2')), 'the difference distributes the minus sign');
  assert.ok(model.steps.some((step) => step.includes('2x(x - 2) + 1(x - 2) = 2x^{2} - 4x + x - 2')), 'the product distributes term by term');
  assert.ok(model.steps.some((step) => /\$x - 2 = 0\$ when \$x = 2\$/.test(step)), 'the exclusion comes from the original denominator');
  assert.match(model.why, /\$\(fg\)\(1\) = 3 \\cdot \(-1\) = -3\$/, 'the check multiplies f(1) and g(1)');
  assert.match(model.why, /\$g\(2\) = 0\$/, 'the check shows the denominator is 0 at the excluded value');
  // Wrong-answer control: the same work with one box changed is not accepted,
  // so the grade above is about the stated answers.
  assert.equal(grade(q({ f: F, g: G }), { ...work, responses: { ...work.responses, product: '2x^2 - 3x + 2' } }).isCorrect, false);
  assert.equal(grade(q({ f: F, g: G }), { ...work, restrictions: '-2' }).isCorrect, false);
});

test('default operations: the draft-persistence scene (slope/intercept specs) and decimal coefficients', () => {
  // f(x) = 2x + 3, g(x) = x − 4, written with m and b as authors do.
  const scene = q({ f: { type: 'linear', m: 2, b: 3 }, g: { type: 'linear', m: 1, b: -4 }, operations: ['sum', 'difference', 'product', 'quotient'] });
  const { model } = assertReviewGradesCorrect(scene, 'm/b scene');
  assert.equal(itemValue(model, '(f + g)(x)'), '$3x - 1$');
  assert.equal(itemValue(model, '(f − g)(x)'), '$x + 7$');
  assert.equal(itemValue(model, '(fg)(x)'), '$2x^{2} - 5x - 12$');
  assert.equal(itemValue(model, '(f / g)(x)'), '$\\frac{2x + 3}{x - 4}$');
  assert.equal(itemValue(model, RESTRICTIONS_LABEL), '$4$');

  // f(x) = 0.5x + 1.5, g(x) = 2x − 1: terminating decimals print exactly.
  const decimals = q({ f: { type: 'linear', a: 0.5, h: 0, k: 1.5 }, g: { type: 'linear', a: 2, h: 0, k: -1 } });
  const { model: decimalModel } = assertReviewGradesCorrect(decimals, 'decimals');
  assert.equal(itemValue(decimalModel, '(fg)(x)'), '$x^{2} + 2.5x - 1.5$');
  assert.equal(itemValue(decimalModel, RESTRICTIONS_LABEL), '$0.5$');
});

test('the mode field is ignored, exactly as the grader ignores it', () => {
  const plain = buildFunctionOperationsLabReview(q({ f: F, g: G }));
  for (const mode of ['functionOperations', 'quotient', 'sum', 'bogus']) {
    assert.deepEqual(buildFunctionOperationsLabReview(q({ f: F, g: G, mode })), plain, `mode ${mode}`);
    assertReviewGradesCorrect(q({ f: F, g: G, mode }), `mode ${mode}`);
  }
});

/* ------------------------------------------------------------------ */
/* composition, subsets, compiled authoring intent                     */
/* ------------------------------------------------------------------ */

test('composition follows composeOrder, and each order\'s review is wrong for the other order', () => {
  // f(x) = (x − 1)³ + 2 = x³ − 3x² + 3x + 1, g(x) = 2x.
  const f = { type: 'cubic', a: 1, h: 1, k: 2 };
  const g = { type: 'linear', a: 2, h: 0, k: 0 };
  const fOfG = q({ f, g, operations: ['composition'] });
  const gOfF = q({ f, g, operations: ['composition'], composeOrder: 'gOfF' });
  const { model: fg, work: fgWork } = assertReviewGradesCorrect(fOfG, 'f∘g');
  const { model: gf, work: gfWork } = assertReviewGradesCorrect(gOfF, 'g∘f');
  assert.equal(itemValue(fg, '(f ∘ g)(x)'), '$8x^{3} - 12x^{2} + 6x + 1$');
  assert.equal(itemValue(gf, '(g ∘ f)(x)'), '$2x^{3} - 6x^{2} + 6x + 2$');
  assert.match(fg.steps[1], /replace every x in \$f\(x\) = x\^\{3\} - 3x\^\{2\} \+ 3x \+ 1\$ with \$\(2x\)\$/);
  assert.match(gf.steps[1], /replace every x in \$g\(x\) = 2x\$ with \$\(x\^\{3\} - 3x\^\{2\} \+ 3x \+ 1\)\$/);
  assert.equal(grade(gOfF, fgWork).isCorrect, false, 'the f∘g answer is wrong for g∘f');
  assert.equal(grade(fOfG, gfWork).isCorrect, false, 'the g∘f answer is wrong for f∘g');
  // Anything but exactly gOfF is f∘g, for the review as for the grader.
  assert.deepEqual(buildFunctionOperationsLabReview(q({ f, g, operations: ['composition'], composeOrder: 'GOFF' })), fg);
});

test('all five operations with a vertex-form quadratic, in authored order', () => {
  // f(x) = (x − 2)² − 3 = x² − 4x + 1, g(x) = 2x − 6.
  const question = q({
    f: { type: 'quadratic', a: 1, h: 2, k: -3 },
    g: { type: 'linear', a: 2, h: 0, k: -6 },
    operations: ['composition', 'quotient', 'product', 'difference', 'sum'],
    composeOrder: 'gOfF',
  });
  const { model } = assertReviewGradesCorrect(question, 'all five');
  const answers = deriveFunctionOperations({ f: question.f, g: question.g, operations: normalizeFunctionOperations(question.operations), composeOrder: normalizeComposeOrder(question.composeOrder) });
  assert.equal(itemValue(model, '(g ∘ f)(x)'), `$${answers.composition.expression.replace(/\^(\d+)/g, '^{$1}')}$`);
  assert.equal(itemValue(model, RESTRICTIONS_LABEL), '$3$');
  assert.ok(model.why.startsWith('Check with $x = 1$'), 'the check uses a value where g(x) ≠ 0');
});

test('a V5 authoring intent, compiled, reviews and grades correct', () => {
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Function operations', courseId: 'algebra2', instructionalPurpose: 'review', gradingPurpose: 'classwork' },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A2.7B',
        prompt: 'Find the requested operations for f and g.',
        studentActions: ['functionOperations'],
        f: { type: 'polynomial', coefficients: [1, 0, -1] },
        g: { type: 'linear', a: 1, h: 1, k: 0 },
        operations: ['sum', 'divide', 'compose'],
        composeOrder: 'fOfG',
        dok: 2,
        difficultyBand: 2,
      }],
    }],
  };
  const compiled = compileAuthoringIntentV5(source).package.sections[0].questions[0];
  assert.equal(compiled.type, TOOL_ID);
  const { model } = assertReviewGradesCorrect(compiled, 'compiled V5');
  assert.deepEqual(model.items, [
    { label: '(f + g)(x)', value: '$x^{2} + x - 2$' },
    { label: '(f / g)(x)', value: '$x + 1$' },
    { label: 'Excluded x-value(s)', value: '$1$' },
    { label: '(f ∘ g)(x)', value: '$x^{2} - 2x$' },
  ]);
});

/* ------------------------------------------------------------------ */
/* quotients and their excluded values                                 */
/* ------------------------------------------------------------------ */

test('an exact quotient is the polynomial, and the cancelled factor stays excluded', () => {
  const question = q({ f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'linear', a: 1, h: 1, k: 0 }, operations: ['quotient'] });
  const { model, work } = assertReviewGradesCorrect(question, 'exact quotient');
  assert.deepEqual(work, { responses: { quotient: 'x + 1' }, restrictions: '1' });
  assert.ok(model.steps.some((step) => step.includes('$(x - 1)(x + 1) = x^{2} - 1$')), 'the division is shown as a product that rebuilds f');
  assert.ok(model.steps.some((step) => /stay excluded even though the factor cancelled/.test(step)));
  assert.equal(grade(question, { ...work, restrictions: '' }).isCorrect, false, 'dropping the cancelled zero is wrong');
});

test('quadratic denominators: two zeros, a repeated zero, and no real zeros', () => {
  const twoZeros = q({ f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'polynomial', coefficients: [1, 0, -1] }, operations: ['quotient'] });
  const { model: two, work: twoWork } = assertReviewGradesCorrect(twoZeros, 'x/(x² − 1)');
  assert.equal(twoWork.restrictions, '-1, 1');
  assert.ok(two.steps.some((step) => step.includes('$x^{2} - 1 = (x + 1)(x - 1) = 0$, so $x = -1$ or $x = 1$')));

  const repeated = q({ f: { type: 'linear', a: 1, h: 0, k: 1 }, g: { type: 'quadratic', a: 1, h: 2, k: 0 }, operations: ['quotient'] });
  const { model: rep, work: repWork } = assertReviewGradesCorrect(repeated, '(x + 1)/(x − 2)²');
  assert.equal(repWork.restrictions, '2');
  assert.ok(rep.steps.some((step) => step.includes('(x - 2)^{2}')), 'a repeated zero is shown squared');

  const noRealZeros = q({ f: { type: 'polynomial', coefficients: [1, 0, 1, 0] }, g: { type: 'quadratic', a: 1, h: 0, k: 1 }, operations: ['quotient'] });
  const { model: none, work: noneWork } = assertReviewGradesCorrect(noRealZeros, '(x³ + x)/(x² + 1)');
  assert.deepEqual(noneWork, { responses: { quotient: 'x' }, restrictions: '' });
  assert.equal(itemValue(none, RESTRICTIONS_LABEL), 'None — leave the box blank');
  assert.ok(none.steps.some((step) => step.includes('$0^{2} - 4(1)(1) = -4 < 0$')), 'the discriminant shows there is no real zero');
  assert.match(none.note, /typing 0/);
  assert.equal(grade(noRealZeros, { ...noneWork, restrictions: '0' }).isCorrect, false, 'the note is right: 0 is not excluded');
});

test('a constant denominator excludes nothing; an authored cubic denominator is factored', () => {
  const constant = q({ f: { type: 'linear', a: 3, h: 0, k: 6 }, g: { type: 'linear', a: 0, h: 0, k: 3 }, operations: ['quotient'] });
  const { work } = assertReviewGradesCorrect(constant, '(3x + 6)/3');
  assert.deepEqual(work, { responses: { quotient: 'x + 2' }, restrictions: '' });

  const cubic = q({ f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'polynomial', coefficients: [1, 0, 0, -1] }, operations: ['quotient'], restrictions: { excludedValues: [1] } });
  const { model, work: cubicWork } = assertReviewGradesCorrect(cubic, 'x/(x³ − 1)');
  assert.equal(cubicWork.restrictions, '1');
  assert.ok(model.steps.some((step) => step.includes('$x^{3} - 1 = (x - 1)(x^{2} + x + 1) = 0$')));
  assert.ok(model.steps.some((step) => step.includes('$1^{2} - 4(1)(1) = -3 < 0$')), 'the quadratic factor has no real zero');
});

/* ------------------------------------------------------------------ */
/* shapes with no honest single answer to state                        */
/* ------------------------------------------------------------------ */

test('a quotient whose terms share a factor without dividing exactly is null: the grader keeps the unreduced fraction', () => {
  // (x² − 1)/(x² + x) = (x − 1)/x after cancelling (x + 1) — but the grader's
  // key is the unreduced fraction, and it rejects the simplified one.
  const question = q({ f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, 1, 0] }, operations: ['quotient'] });
  assert.equal(grade(question, { responses: { quotient: '(x-1)/x' }, restrictions: '-1, 0' }).isCorrect, false);
  assert.equal(grade(question, { responses: { quotient: '(x^2-1)/(x^2+x)' }, restrictions: '-1, 0' }).isCorrect, true);
  assert.equal(buildFunctionOperationsLabReview(question), null);
});

test('numbers that cannot be stated exactly give null', () => {
  // x² − 2 = 0 at ±√2: the grader reads exclusions as decimals to 1e-9, so the
  // 8-place value is not accepted and there is no short exact answer to state.
  const irrational = q({ f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'polynomial', coefficients: [1, 0, -2] }, operations: ['quotient'] });
  assert.equal(grade(irrational, { responses: { quotient: 'x/(x^2-2)' }, restrictions: '-1.41421356, 1.41421356' }).isCorrect, false);
  assert.equal(buildFunctionOperationsLabReview(irrational), null);
  // (x + 1)/3 = x/3 + 1/3: a repeating decimal.
  assert.equal(buildFunctionOperationsLabReview(q({ f: { type: 'linear', a: 1, h: 0, k: 1 }, g: { type: 'linear', a: 0, h: 0, k: 3 }, operations: ['quotient'] })), null);
  // 3x − 1 = 0 at x = 1/3.
  assert.equal(buildFunctionOperationsLabReview(q({ f: F, g: { type: 'linear', a: 3, h: 0, k: -1 }, operations: ['quotient'] })), null);
  // The other operations of the same functions are exact and are reviewed.
  assertReviewGradesCorrect(q({ f: F, g: { type: 'linear', a: 3, h: 0, k: -1 }, operations: ['sum', 'product'] }), 'no quotient');
});

test('authored exclusions that are not zeros of g(x) give null; ones that are, change nothing', () => {
  assert.equal(buildFunctionOperationsLabReview(q({ f: F, g: G, restrictions: [5] })), null);
  assert.equal(buildFunctionOperationsLabReview(q({ f: F, g: { type: 'linear', a: 0, h: 0, k: 3 }, operations: ['quotient'], restrictions: [2] })), null);
  // An authored list the cubic cannot be checked against (a zero is missing).
  assert.equal(buildFunctionOperationsLabReview(q({ f: F, g: { type: 'polynomial', coefficients: [1, 0, -1, 0] }, operations: ['quotient'], restrictions: [1] })), null);
  assert.deepEqual(buildFunctionOperationsLabReview(q({ f: F, g: G, restrictions: { excludedValues: [2] } })), buildFunctionOperationsLabReview(q({ f: F, g: G })));
});

test('unrenderable, empty and malformed questions give null and never throw', () => {
  for (const question of [
    null, undefined, {}, [], 'functionOperationsLab', 42,
    q({}),
    q({ f: F }),
    q({ f: { type: 'exponential' }, g: G }),
    q({ f: F, g: { type: 'polynomial', coefficients: [1, 0, 0, -1] }, operations: ['quotient'] }),
    q({ f: F, g: { type: 'linear', a: 0, h: 0, k: 0 }, operations: ['quotient'] }),
    q({ f: F, g: G, operations: ['bogus'] }),
    q({ f: F, g: G, operations: ['toString', 'constructor'] }),
    q({ f: 'x', g: G }),
    q({ f: { type: 'polynomial', coefficients: ['a'] }, g: G }),
    q({ f: { type: 'linear', a: Infinity }, g: G }),
  ]) {
    assert.doesNotThrow(() => buildFunctionOperationsLabReview(question));
    assert.equal(buildFunctionOperationsLabReview(question), null, JSON.stringify(question));
  }
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel({ type: TOOL_ID, f: F }), null);
});
