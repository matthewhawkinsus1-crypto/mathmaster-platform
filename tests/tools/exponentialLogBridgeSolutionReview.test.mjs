import test from 'node:test';
import assert from 'node:assert/strict';

import buildDefault, {
  buildExponentialLogBridgeReview,
  implemented,
} from '../../src/tools/shared/reviews/exponentialLogBridgeReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/exponentialLogBridge.mjs';
import {
  composeForwardAfterInverse,
  composeInverseAfterForward,
  equivalentExpLogValues,
  inversePairFeatures,
  normalizeExponentialSpec,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from '../../functions/shared/toolMath/exponentialLog/exponentialLogMath.mjs';

/*
 * THE EXPONENTIAL ↔ LOG BRIDGE REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a bridge question is closed, its review lists the numbers each box
 * needed — the logarithm and the power, the exponent and x, the required
 * argument and x, the inverse value with its asymptote and domain, both
 * compositions — with the worked steps that reach them. Every review here is
 * turned back into the work a student following it would type (the decimal at
 * the end of each stated value; the domain option it names) and graded by the
 * shared grader the server records with (gradeToolWork). It must come back
 * correct, and each stated number must agree with an answer key derived here,
 * independently, from the same exponential/log mathematics. Every graded view
 * is covered: equivalentForms, solveExponential, solveLogarithmic, inverse and
 * composition.
 *
 * A question no answer can be right for (base 1, a non-positive right side, a
 * y outside the logarithm's domain), or one the bridge would not draw as its
 * author wrote it, gets no review at all.
 */

const TOOL_ID = 'exponentialLogBridge';
const q = (fields = {}) => ({ type: TOOL_ID, ...fields });
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

/* ---------------------------------------------------- reading a review */

// What a student types for a stated value: the last number in it (the
// decimal after "≈" when the review gives a fraction).
const typedFrom = (value) => {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*\$\s*$/);
  assert.ok(match, `a stated value ends in a number a student can type: ${value}`);
  return match[1];
};

const WORK_FIELDS = Object.freeze({
  equivalentForms: { 'Logarithmic form': 'logAnswer', 'Exponential form': 'expAnswer' },
  solveExponential: { 'Exponent value': 'exponentAnswer', x: 'xAnswer' },
  solveLogarithmic: { 'Required argument value': 'argumentAnswer', x: 'xAnswer' },
});

// The bridge work a student who follows the review submits.
const workFromReview = (mode, model) => {
  const work = {};
  for (const { label, value } of model.items) {
    let field = WORK_FIELDS[mode]?.[label];
    if (mode === 'inverse') {
      if (label === 'Inverse domain') {
        const side = value.includes('>') ? 'greater' : value.includes('<') ? 'less' : null;
        assert.ok(side, `the domain names one of the bridge's options: ${value}`);
        work.domainSide = side;
        continue;
      }
      field = label === 'Inverse vertical asymptote' ? 'asymptote' : label.startsWith('f⁻¹(') ? 'inverseAnswer' : null;
    }
    if (mode === 'composition') {
      field = label.startsWith('f⁻¹(f(') ? 'inverseAfterForward' : label.startsWith('f(f⁻¹(') ? 'forwardAfterInverse' : null;
    }
    assert.ok(field, `unexpected item ${label} in ${mode}`);
    work[field] = typedFrom(value);
  }
  return work;
};

/* ------------------------------------------- the key, derived independently */

const specOf = (question) => normalizeExponentialSpec(question.function || question.exponential || {
  a: question.a ?? 1, base: question.base ?? 2, h: question.h ?? 0, k: question.k ?? 0,
});

const answerKey = (mode, question) => {
  const equation = question.equation || {};
  if (mode === 'solveExponential') {
    const solution = solveExponentialLinearExponent({ base: equation.base ?? question.base ?? 2, m: equation.m ?? 2, c: equation.c ?? -1, rhs: equation.rhs ?? 16 });
    return { exponentAnswer: solution.exponentValue, xAnswer: solution.x };
  }
  if (mode === 'solveLogarithmic') {
    const solution = solveLogLinearArgument({ base: equation.base ?? question.base ?? 3, m: equation.m ?? 2, c: equation.c ?? 1, result: equation.result ?? 2 });
    return { argumentAnswer: solution.argumentValue, xAnswer: solution.x };
  }
  if (mode === 'inverse') {
    const features = inversePairFeatures(specOf(question));
    return { inverseAnswer: Number(question.x ?? 2), asymptote: features.logarithmVerticalAsymptote, domainSide: features.logarithmDomainSide };
  }
  if (mode === 'composition') {
    const spec = specOf(question);
    const x = Number(question.x ?? 1);
    const y = Number(question.y ?? transformedExponentialValue(spec, Number(question.inverseSeedX ?? x + 1)));
    return { inverseAfterForward: composeInverseAfterForward(spec, x), forwardAfterInverse: composeForwardAfterInverse(spec, y) };
  }
  const values = equivalentExpLogValues({ base: question.base ?? 2, exponent: question.exponent ?? 3 });
  return { logAnswer: values.exponent, expAnswer: values.value };
};

/* ---------------------------------------------------- the model's shape */

const assertMathRenders = (text, label) => {
  // Every $…$ span is mathematics to MathText — never a currency amount
  // left in the prose with its LaTeX showing.
  const prose = splitMathSegments(text).filter((segment) => !isMathSegment(segment)).join(' ');
  assert.doesNotMatch(prose, /\$|\\[a-z]/i, `${label}: no raw LaTeX in the prose of "${text}"`);
};

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 2, `${label}: items`);
  model.items.forEach((entry) => {
    assert.equal(typeof entry.label, 'string');
    assert.equal(typeof entry.value, 'string');
    assert.ok(entry.label && entry.value, `${label}: no empty item`);
    // The panel prints labels as they are: no LaTeX in them.
    assert.doesNotMatch(entry.label, /\$|\\/, `${label}: plain label ${entry.label}`);
    assertMathRenders(entry.value, label);
  });
  assert.ok(model.steps.length >= 3 && model.steps.length <= 12, `${label}: steps`);
  model.steps.forEach((step) => {
    assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`);
    assertMathRenders(step, label);
  });
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assertMathRenders(model.why, label);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify(model), /NaN|undefined|Infinity|\[object|null\)/, `${label}: no broken value`);
};

// The index picks the builder up, and the platform's entry point returns
// exactly this model, by `toolId` and by `type`.
const assertWired = (question, model, label) => {
  const { type: _type, ...rest } = question;
  assert.deepEqual(buildToolSolutionReviewModel({ ...rest, toolId: TOOL_ID }), model, `${label}: by toolId`);
  assert.deepEqual(buildToolSolutionReviewModel({ ...rest, type: TOOL_ID }), model, `${label}: by type`);
};

/* ------------------------------------------------------------ fixtures */

// Teacher-import V5 intents, compiled the way the platform compiles them.
const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Exponential and logarithmic functions', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Rewrite 5^3 = 125 as a logarithm.', studentActions: ['exponentialLogBridge'], base: 5, exponent: 3 },
      { prompt: 'Solve 3^(x + 2) = 81.', studentActions: ['solveExponential'], equation: { base: 3, m: 1, c: 2, rhs: 81 } },
      { prompt: 'Solve log_2(x − 3) = 4.', studentActions: ['solveLogarithmic'], equation: { base: 2, m: 1, c: -3, result: 4 } },
      { prompt: 'Describe the inverse of f(x) = 3 · 2^(x − 2) + 1.', studentActions: ['exponentialLogBridge'], mode: 'inverse', function: { type: 'exponential', a: 3, base: 2, h: 2, k: 1 }, x: 4 },
      { prompt: 'Compose f(x) = 2^x − 1 with its inverse.', studentActions: ['exponentialLogBridge'], mode: 'composition', function: { type: 'exponential', a: 1, base: 2, h: 0, k: -1 }, x: 2, y: 7 },
    ],
  }],
}).package.sections[0].questions;

// expect: the number each box takes, as a teacher would work it.
const QUESTIONS = [
  // equivalentForms
  { label: 'sample 3⁴ (SAMPLE_BATCH_C)', mode: 'equivalentForms', question: q({ mode: 'equivalentForms', base: 3, exponent: 4 }), expect: { logAnswer: 4, expAnswer: 81 } },
  { label: 'sample with no mode (SAMPLE_MISSING_MATH_TOOLS)', mode: 'equivalentForms', question: q({ base: 2, exponent: 3 }), expect: { logAnswer: 3, expAnswer: 8 } },
  { label: 'unauthored: the bridge draws 2³', mode: 'equivalentForms', question: q({}), expect: { logAnswer: 3, expAnswer: 8 } },
  { label: 'negative exponent, decimal result', mode: 'equivalentForms', question: q({ mode: 'equivalentForms', base: 10, exponent: -2 }), expect: { logAnswer: -2, expAnswer: 0.01 } },
  { label: 'negative exponent, fraction result', mode: 'equivalentForms', question: q({ base: 3, exponent: -2 }), expect: { logAnswer: -2, expAnswer: 1 / 9 }, note: true },
  { label: 'irrational result', mode: 'equivalentForms', question: q({ base: 2, exponent: 0.5 }), expect: { logAnswer: 0.5, expAnswer: Math.SQRT2 }, note: true },
  { label: 'fractional base', mode: 'equivalentForms', question: q({ base: 0.5, exponent: 3 }), expect: { logAnswer: 3, expAnswer: 0.125 } },
  { label: 'unknown mode reads as Equivalent Forms', mode: 'equivalentForms', question: q({ mode: 'Inverse', base: 4, exponent: 2 }), expect: { logAnswer: 2, expAnswer: 16 } },
  { label: 'V5 5³', mode: 'equivalentForms', question: compiled[0], expect: { logAnswer: 3, expAnswer: 125 } },
  // solveExponential
  { label: 'sample 2^(2x − 1) = 32 (SAMPLE_BATCH_C)', mode: 'solveExponential', question: q({ mode: 'solveExponential', equation: { base: 2, m: 2, c: -1, rhs: 32 } }), expect: { exponentAnswer: 5, xAnswer: 3 } },
  { label: 'unauthored: the bridge draws 2^(2x − 1) = 16', mode: 'solveExponential', question: q({ mode: 'solveExponential' }), expect: { exponentAnswer: 4, xAnswer: 2.5 } },
  { label: 'negative coefficient', mode: 'solveExponential', question: q({ mode: 'solveExponential', equation: { base: 5, m: -1, c: 4, rhs: 25 } }), expect: { exponentAnswer: 2, xAnswer: 2 } },
  { label: 'fraction x', mode: 'solveExponential', question: q({ mode: 'solveExponential', equation: { base: 2, m: 3, c: 1, rhs: 8 } }), expect: { exponentAnswer: 3, xAnswer: 2 / 3 }, note: true },
  { label: 'irrational exponent', mode: 'solveExponential', question: q({ mode: 'solveExponential', equation: { base: 2, m: 3, c: 0, rhs: 20 } }), expect: { exponentAnswer: Math.log2(20), xAnswer: Math.log2(20) / 3 }, note: true },
  { label: 'exponent is just x', mode: 'solveExponential', question: q({ mode: 'solveExponential', equation: { base: 10, m: 1, c: 0, rhs: 1000 } }), expect: { exponentAnswer: 3, xAnswer: 3 } },
  { label: 'base from the question', mode: 'solveExponential', question: q({ mode: 'solveExponential', base: 3, equation: { m: 2, c: 0, rhs: 9 } }), expect: { exponentAnswer: 2, xAnswer: 1 } },
  { label: 'V5 3^(x + 2) = 81', mode: 'solveExponential', question: compiled[1], expect: { exponentAnswer: 4, xAnswer: 2 } },
  // solveLogarithmic
  { label: 'sample log₃(2x + 1) = 2 (SAMPLE_BATCH_C)', mode: 'solveLogarithmic', question: q({ mode: 'solveLogarithmic', equation: { base: 3, m: 2, c: 1, result: 2 } }), expect: { argumentAnswer: 9, xAnswer: 4 } },
  { label: 'unauthored: base 3, not 2', mode: 'solveLogarithmic', question: q({ mode: 'solveLogarithmic' }), expect: { argumentAnswer: 9, xAnswer: 4 } },
  { label: 'base 10', mode: 'solveLogarithmic', question: q({ mode: 'solveLogarithmic', equation: { base: 10, m: 5, c: 0, result: 2 } }), expect: { argumentAnswer: 100, xAnswer: 20 } },
  { label: 'negative result, fraction x', mode: 'solveLogarithmic', question: q({ mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: 1, result: -1 } }), expect: { argumentAnswer: 0.5, xAnswer: -1 / 6 }, note: true },
  { label: 'irrational argument', mode: 'solveLogarithmic', question: q({ mode: 'solveLogarithmic', equation: { base: 2, m: 1, c: 0, result: 0.5 } }), expect: { argumentAnswer: Math.SQRT2, xAnswer: Math.SQRT2 }, note: true },
  { label: 'V5 log₂(x − 3) = 4', mode: 'solveLogarithmic', question: compiled[2], expect: { argumentAnswer: 16, xAnswer: 19 } },
  // inverse
  { label: 'sample 2·2^(x − 1) − 3 at x = 3 (SAMPLE_BATCH_C)', mode: 'inverse', question: q({ mode: 'inverse', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3 }), expect: { inverseAnswer: 3, asymptote: -3, domainSide: 'greater' } },
  { label: 'unauthored: 2^x at x = 2', mode: 'inverse', question: q({ mode: 'inverse' }), expect: { inverseAnswer: 2, asymptote: 0, domainSide: 'greater' } },
  { label: 'reflected: a = −1', mode: 'inverse', question: q({ mode: 'inverse', function: { a: -1, base: 3, h: 0, k: 4 }, x: 1 }), expect: { inverseAnswer: 1, asymptote: 4, domainSide: 'less' } },
  { label: '`exponential` with a left shift', mode: 'inverse', question: q({ mode: 'inverse', exponential: { a: 0.5, base: 4, h: -1, k: 2 }, x: 0.5 }), expect: { inverseAnswer: 0.5, asymptote: 2, domainSide: 'greater' } },
  { label: 'flat fields, decay base, a < 0', mode: 'inverse', question: q({ mode: 'inverse', a: -2, base: 0.5, h: 2, k: 1, x: 0 }), expect: { inverseAnswer: 0, asymptote: 1, domainSide: 'less' } },
  { label: 'f(x) a fraction', mode: 'inverse', question: q({ mode: 'inverse', function: { type: 'exponential', a: 1, base: 3, h: 0, k: 0 }, x: -1 }), expect: { inverseAnswer: -1, asymptote: 0, domainSide: 'greater' }, note: true },
  { label: 'V5 3·2^(x − 2) + 1', mode: 'inverse', question: compiled[3], expect: { inverseAnswer: 4, asymptote: 1, domainSide: 'greater' } },
  // composition
  { label: 'sample y = 13 (SAMPLE_BATCH_C)', mode: 'composition', question: q({ mode: 'composition', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3, y: 13 }), expect: { inverseAfterForward: 3, forwardAfterInverse: 13 } },
  { label: 'unauthored: 2^x, x = 1, y = f(2)', mode: 'composition', question: q({ mode: 'composition' }), expect: { inverseAfterForward: 1, forwardAfterInverse: 4 } },
  { label: 'irrational f⁻¹(y)', mode: 'composition', question: q({ mode: 'composition', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3, y: 10 }), expect: { inverseAfterForward: 3, forwardAfterInverse: 10 } },
  { label: 'a < 0, y below k', mode: 'composition', question: q({ mode: 'composition', function: { a: -2, base: 3, h: 0, k: 1 }, x: 1, y: -5 }), expect: { inverseAfterForward: 1, forwardAfterInverse: -5 } },
  { label: 'default y irrational: the screen value', mode: 'composition', question: q({ mode: 'composition', function: { a: 1, base: 2, h: 0, k: 0 }, x: 0.5 }), expect: { inverseAfterForward: 0.5, forwardAfterInverse: 2 ** 1.5 } },
  { label: 'inverseSeedX: y a fraction', mode: 'composition', question: q({ mode: 'composition', function: { a: 1, base: 3, h: 0, k: 0 }, x: 2, inverseSeedX: -1 }), expect: { inverseAfterForward: 2, forwardAfterInverse: 1 / 3 } },
  { label: 'V5 2^x − 1', mode: 'composition', question: compiled[4], expect: { inverseAfterForward: 2, forwardAfterInverse: 7 } },
];

/* --------------------------------------------------------------- tests */

test('the builder is implemented and the index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildExponentialLogBridgeReview);
  assert.equal(buildDefault, buildExponentialLogBridgeReview);
});

test('every view: the stated answers are what the shared grader accepts, and match the key', () => {
  for (const { label, mode, question, expect, note } of QUESTIONS) {
    const model = buildExponentialLogBridgeReview(question);
    assertTextOnly(model, label);
    assertWired(question, model, label);

    const work = workFromReview(mode, model);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.mode, mode, `${label}: graded as ${mode}`);
    assert.equal(result.parts.length, model.items.length, `${label}: one item per marked part`);
    assert.equal(result.isCorrect, true, `${label}: the review's answer is correct (${JSON.stringify(work)})`);
    assert.equal(result.score, 1, `${label}: full credit`);

    // The independent key and the teacher's numbers agree with what is stated.
    const key = answerKey(mode, question);
    assert.deepEqual(Object.keys(work).sort(), Object.keys(key).sort(), `${label}: a value for every box`);
    for (const [field, expected] of Object.entries(expect)) {
      if (typeof expected === 'string') {
        assert.equal(work[field], expected, `${label}: ${field}`);
        assert.equal(key[field], expected, `${label}: key ${field}`);
      } else {
        assert.ok(Math.abs(Number(work[field]) - expected) <= 0.0005, `${label}: ${field} is ${expected}, not ${work[field]}`);
        assert.ok(Math.abs(key[field] - expected) <= 1e-9, `${label}: key ${field} is ${expected}, not ${key[field]}`);
      }
    }
    assert.equal(model.note !== null, Boolean(note), `${label}: a decimals note only when a value is a fraction or rounded`);
  }
});

test('a wrong box makes the grader reject the work: the check above can fail', () => {
  for (const { label, mode, question } of QUESTIONS) {
    const work = workFromReview(mode, buildExponentialLogBridgeReview(question));
    for (const field of Object.keys(work)) {
      const wrong = { ...work, [field]: field === 'domainSide' ? (work.domainSide === 'greater' ? 'less' : 'greater') : String(Number(work[field]) + 1) };
      assert.equal(grade(question, wrong).isCorrect, false, `${label}: ${field} off by one is wrong`);
    }
  }
});

test('the steps work this question, in its own numbers', () => {
  const steps = (question) => {
    const model = buildExponentialLogBridgeReview(question);
    return `${model.steps.join(' ')} ${model.why}`;
  };
  const exponential = steps(q({ mode: 'solveExponential', equation: { base: 2, m: 2, c: -1, rhs: 32 } }));
  assert.match(exponential, /2\^\{2x - 1\} = 32/, 'the equation as written');
  assert.match(exponential, /2x - 1 = \\log_\{2\}\\left\(32\\right\)/, 'rewritten in logarithmic form');
  assert.match(exponential, /\\log_\{2\}\\left\(32\\right\) = 5\$, because \$2\^\{5\} = 32/, 'the logarithm evaluated, with its reason');
  assert.match(exponential, /\$2x = 6\$.*\$x = 3\$/, 'the linear equation solved move by move');
  assert.match(exponential, /2\(3\) - 1 = 5/, 'the check substitutes x back in');

  const logarithmic = steps(q({ mode: 'solveLogarithmic', equation: { base: 3, m: 2, c: 1, result: 2 } }));
  assert.match(logarithmic, /2x \+ 1 = 3\^\{2\}/, 'rewritten in exponential form');
  assert.match(logarithmic, /3\^\{2\} = 3 \\cdot 3 = 9/, 'the power evaluated');
  assert.match(logarithmic, /positive/, 'the domain is checked');
  assert.match(logarithmic, /\\log_\{3\}\\left\(2\(4\) \+ 1\\right\) = \\log_\{3\}\\left\(9\\right\) = 2/, 'the check substitutes x back in');

  const inverse = steps(q({ mode: 'inverse', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3 }));
  assert.match(inverse, /f\(3\) = 2 \\cdot 2\^\{3 - 1\} - 3 = 2 \\cdot 2\^\{2\} - 3 = 2 \\cdot 4 - 3 = 5/, 'f evaluated at the input');
  assert.match(inverse, /f\^\{-1\}\(x\) = \\log_\{2\}\\left\(\\frac\{x \+ 3\}\{2\}\\right\) \+ 1/, 'the inverse derived');
  assert.match(inverse, /horizontal asymptote \$y = -3\$/, 'the asymptote reflected');
  assert.match(inverse, /range of f is \$y > -3\$/, 'the range becomes the domain');

  const composition = steps(q({ mode: 'composition', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3, y: 10 }));
  assert.match(composition, /\\log_\{2\}\\left\(6\.5\\right\) \+ 1 \\approx 2\.7004 \+ 1 \\approx 3\.7004/, 'a rounded value is marked ≈');
  assert.match(composition, /2 \\cdot 2\^\{\\log_\{2\}\\left\(6\.5\\right\)\} - 3 = 2 \\cdot 6\.5 - 3 = 10/, 'f undoes the logarithm exactly');
});

test('the inverse view: the domain option follows the sign of a, the asymptote follows k', () => {
  const side = (fn) => workFromReview('inverse', buildExponentialLogBridgeReview(q({ mode: 'inverse', function: fn, x: 1 })));
  assert.deepEqual(side({ a: 3, base: 2, h: 0, k: 5 }), { inverseAnswer: '1', asymptote: '5', domainSide: 'greater' });
  assert.deepEqual(side({ a: -3, base: 2, h: 0, k: 5 }), { inverseAnswer: '1', asymptote: '5', domainSide: 'less' });
  // A decay base does not flip the side: only a does.
  assert.deepEqual(side({ a: 3, base: 0.25, h: 0, k: -2 }), { inverseAnswer: '1', asymptote: '-2', domainSide: 'greater' });
});

test('no answer can be right, or the bridge would not draw what the author wrote: no review', () => {
  const nulls = [
    // The grader cannot mark these at all.
    ['base 1', q({ base: 1, exponent: 3 }), 'invalid'],
    ['m = 0', q({ mode: 'solveExponential', equation: { base: 2, m: 0, c: 1, rhs: 8 } }), 'invalid'],
    ['log base 1', q({ mode: 'solveLogarithmic', equation: { base: 1, m: 2, c: 1, result: 2 } }), 'invalid'],
    ['a = 0', q({ mode: 'inverse', function: { a: 0, base: 2, h: 0, k: 0 } }), 'invalid'],
    // No real answer.
    ['non-positive right side', q({ mode: 'solveExponential', equation: { base: 2, m: 1, c: 0, rhs: -8 } }), 'none'],
    ['y outside the inverse domain', q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 2 }), 'none'],
    ['f(x) overflows', q({ mode: 'inverse', function: { a: 1, base: 10, h: 0, k: 0 }, x: 400 }), null],
    // Not the function or equation the author wrote.
    ['a V5 function with no family compiles to linear', q({ mode: 'inverse', function: { type: 'linear', a: 2, h: 0, k: -3 }, x: 3 }), null],
    ['a horizontal scale', q({ mode: 'inverse', function: { type: 'exponential', a: 1, b: 2, base: 2, h: 0, k: 0 }, x: 1 }), null],
    ['an equation as text', q({ mode: 'solveExponential', equation: '2^x = 8' }), null],
    ['a function as text', q({ mode: 'composition', function: 'f(x) = 2^x', x: 1 }), null],
    // Nothing honest to print.
    ['a result too large to write', q({ base: 10, exponent: 20 }), null],
    ['a result that rounds to 0', q({ base: 10, exponent: -6 }), null],
  ];
  for (const [label, question, why] of nulls) {
    assert.equal(buildExponentialLogBridgeReview(question), null, label);
    assert.equal(buildToolSolutionReviewModel(question), null, `${label}: through the platform entry point`);
    if (why === 'invalid') {
      const result = grade(question, { logAnswer: '0', expAnswer: '0', xAnswer: '0', exponentAnswer: '0', argumentAnswer: '0', inverseAnswer: '0', asymptote: '0', domainSide: 'greater' });
      assert.equal(result.graded, false, `${label}: the grader cannot mark it`);
      assert.equal(result.reason, 'invalid-question', `${label}: the grader's reason`);
    }
  }
  // No real answer: the key itself is not a number.
  assert.equal(solveExponentialLinearExponent({ base: 2, m: 1, c: 0, rhs: -8 }).hasRealSolution, false);
  assert.ok(Number.isNaN(composeForwardAfterInverse({ a: 2, base: 2, h: 0, k: 3 }, 2)));
});

test('every graded view has a review', () => {
  const covered = new Set(QUESTIONS.map(({ mode }) => mode));
  assert.deepEqual([...covered].sort(), Object.keys(declaration.modes).sort());
});

test('never throws: null, {}, and malformed input give null', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'toolId', { get() { throw new Error('boom'); }, enumerable: true });
  const hostileMode = { type: TOOL_ID };
  Object.defineProperty(hostileMode, 'mode', { get() { throw new Error('boom'); }, enumerable: true });
  const inputs = [
    null, undefined, {}, [], 'exponentialLogBridge', 42, true, hostile, hostileMode,
    // Not a question of this tool: an empty object is not the bridge's 2³.
    { mode: 'inverse', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3 },
    { type: 'sequenceExplorer', base: 3, exponent: 4 },
    q({ mode: 'inverse', function: [], x: [] }),
    q({ mode: 'solveLogarithmic', equation: [] }),
    q({ mode: 'composition', function: { a: 'two' } }),
    q({ base: 'ten', exponent: {} }),
  ];
  inputs.forEach((input, index) => {
    assert.doesNotThrow(() => buildExponentialLogBridgeReview(input), `input ${index}`);
    assert.equal(buildExponentialLogBridgeReview(input), null, `input ${index}`);
  });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
});
