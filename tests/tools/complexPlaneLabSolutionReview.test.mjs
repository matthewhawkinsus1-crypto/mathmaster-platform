import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComplexPlaneLabReview,
  implemented,
} from '../../src/tools/shared/reviews/complexPlaneLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { TOOLS_WITH_SOLUTION_REVIEW_BUILDER, buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  complexAdd,
  complexConjugateValue,
  complexDivide,
  complexMagnitudeValue,
  complexMultiplyValues,
  complexPower,
  complexSubtract,
  quadraticRootsComplex,
  rotateByPowerOfI,
} from '../../functions/shared/toolMath/complexPlane/complexMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';

/*
 * THE COMPLEX PLANE LAB REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Complex Plane Lab question is closed, its review lists the number for
 * every box the lab asked for, with the worked steps that reach them. Each
 * review here is read back the way a student would follow it — the number at
 * the end of every item typed into the box with the same label, the Net
 * rotation item picked from the lab's own select — and graded by the shared
 * grader the server records with (gradeToolWork). It must come back correct.
 * All six graded modes are covered: features, operations (add, subtract,
 * multiply), division, powers (positive, zero, negative), rotation and
 * quadraticRoots (complex, repeated and real roots).
 */

const TOOL_ID = 'complexPlaneLab';

// The lab's Net rotation <select>: option text → value.
const ROTATION_OPTIONS = { 'No net rotation': '0', '90° counterclockwise': '1', '180°': '2', '90° clockwise': '3' };

// Each mode's input boxes, by the label the lab gives them.
const BOXES = {
  features: { '|z|': 'magnitudeAnswer', 'Re(z̄)': 'conjugateRe', 'Im(z̄)': 'conjugateIm' },
  operations: { 'Real part': 'real', 'Imaginary part': 'imaginary' },
  division: { 'Re(w̄)': 'conjugateRe', 'Im(w̄)': 'conjugateIm', 'Quotient real part': 'real', 'Quotient imaginary part': 'imaginary' },
  powers: { 'Real part': 'real', 'Imaginary part': 'imaginary', magnitude: 'magnitude' },
  rotation: { 'Result real part': 'real', 'Result imaginary part': 'imaginary', 'Net rotation': 'rotation' },
  quadraticRoots: { 'Root 1 real': 'r1Re', 'Root 1 imaginary': 'r1Im', 'Root 2 real': 'r2Re', 'Root 2 imaginary': 'r2Im' },
};

// The number a student types from an item: the item itself ("-8"), or the
// decimal it ends with ("$\frac{11}{25} = 0.44$", "$\sqrt{13} \approx 3.61$").
const typedNumber = (value) => {
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\$?$/);
  assert.ok(match, `an enterable number at the end of "${value}"`);
  return match[1];
};

const boxFor = (mode, label) => (mode === 'powers' && label.startsWith('|z') ? BOXES.powers.magnitude : BOXES[mode][label]);

// The work a student who follows the review submits.
const workFromReview = (mode, model) => Object.fromEntries(model.items.map((item) => {
  const box = boxFor(mode, item.label);
  assert.ok(box, `${mode}: "${item.label}" is one of the lab's boxes`);
  return [box, box === 'rotation' ? ROTATION_OPTIONS[item.value] : typedNumber(item.value)];
}));

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.title.length > 0);
  assert.ok(model.items.length >= 2, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value']);
    assert.equal(typeof item.label, 'string');
    assert.equal(typeof item.value, 'string');
    assert.ok(item.label && item.value, `${label}: no empty item`);
  });
  assert.ok(model.steps.length >= 3 && model.steps.length <= 12, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  const texts = [model.title, ...model.steps, model.why, model.note || '', ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((text) => {
    assert.doesNotMatch(text, /NaN|undefined|Infinity|\[object|\bnull\b/, `${label}: no broken value in "${text}"`);
    // Every $ opens and closes: MathText never sees a dangling delimiter.
    assert.equal((text.match(/\$/g) || []).length % 2, 0, `${label}: balanced $ in "${text}"`);
  });
};

// The full check for one question: text only, the index wiring, and the
// stated answers graded correct by the shared grader.
const assertReviewGradesCorrect = (question, mode, label) => {
  const model = buildComplexPlaneLabReview(question);
  assertTextOnly(model, label);
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the shared index returns this builder's model`);
  const work = workFromReview(mode, model);
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  assert.equal(result.mode, mode, `${label}: the grader grades the mode the review explains`);
  assert.equal(result.isCorrect, true, `${label}: the shared grader accepts the stated answer ${JSON.stringify(work)}`);
  return { model, work };
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/* ------------------------------------------------- realistic questions -- */

const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Complex numbers', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Multiply (2 + 3i)(1 - 4i).', studentActions: ['complexOperations'], complex: { z: { re: 2, im: 3 }, w: { re: 1, im: -4 }, operation: 'multiply' } },
      { prompt: 'Find |z| and the conjugate of z = -6 + 8i.', studentActions: ['analyzeComplex'], z: { re: -6, im: 8 } },
      { prompt: 'Divide (5 + i) by (2 - 3i).', studentActions: ['complexOperations'], complex: { mode: 'division', z: { re: 5, im: 1 }, w: { re: 2, im: -3 } } },
      { prompt: 'Compute (2 + i)^4 and its magnitude.', studentActions: ['complexOperations'], complex: { mode: 'powers', z: { re: 2, im: 1 }, exponent: 4 } },
      { prompt: 'Multiply -3 + 2i by i^3.', studentActions: ['complexOperations'], complex: { mode: 'rotation', z: { re: -3, im: 2 }, quarterTurns: 3 } },
      { prompt: 'Solve x^2 - 4x + 13 = 0.', studentActions: ['analyzeComplex'], complex: { mode: 'quadraticRoots', quadratic: { a: 1, b: -4, c: 13 } } },
    ],
  }],
}).package.sections[0].questions;

const CASES = [
  // features
  { label: 'features, the lab default z = 3 - 4i', mode: 'features', question: { type: TOOL_ID, mode: 'features' } },
  { label: 'features, V5 compiled', mode: 'features', question: compiled[1] },
  { label: 'features, irrational |z|', mode: 'features', question: { type: TOOL_ID, mode: 'features', z: { re: 2, im: 3 } } },
  { label: 'features, simplified surd', mode: 'features', question: { type: TOOL_ID, mode: 'features', z: { re: -2, im: 2 } } },
  { label: 'features, decimals', mode: 'features', question: { type: TOOL_ID, mode: 'features', z: { re: 0.5, im: -1.2 } } },
  { label: 'features, unknown mode renders Features', mode: 'features', question: { type: TOOL_ID, mode: 'polar', z: { re: 5, im: 12 } } },
  // operations
  { label: 'operations, multiply (lab default)', mode: 'operations', question: { type: TOOL_ID, mode: 'operations', operation: 'multiply', z: { re: 2, im: 3 }, w: { re: -1, im: 2 } } },
  { label: 'operations, V5 compiled multiply', mode: 'operations', question: compiled[0] },
  { label: 'operations, add', mode: 'operations', question: { type: TOOL_ID, mode: 'operations', operation: 'add', z: { re: 3, im: 1 }, w: { re: 2, im: -1 } } },
  { label: 'operations, subtract', mode: 'operations', question: { type: TOOL_ID, mode: 'operations', operation: 'subtract', z: { re: 3, im: 1 }, w: { re: -2, im: 4 } } },
  { label: 'operations, multiply by i', mode: 'operations', question: { type: TOOL_ID, mode: 'operations', operation: 'multiply', z: { re: 1, im: -1 }, w: { re: 0, im: 1 } } },
  { label: 'operations, conjugate product', mode: 'operations', question: { type: TOOL_ID, mode: 'operations', z: { re: 4, im: -3 }, w: { re: 4, im: 3 } } },
  // division
  { label: 'division, lab default', mode: 'division', question: { type: TOOL_ID, mode: 'division', z: { re: 4, im: 2 }, w: { re: 1, im: -1 } } },
  { label: 'division, V5 compiled (thirteenths)', mode: 'division', question: compiled[2] },
  { label: 'division, terminating fractions', mode: 'division', question: { type: TOOL_ID, mode: 'division', z: { re: 1, im: 2 }, w: { re: 3, im: 4 } } },
  { label: 'division, reciprocal', mode: 'division', question: { type: TOOL_ID, mode: 'division', z: { re: 1, im: 0 }, w: { re: 2, im: 3 } } },
  { label: 'division, by a pure imaginary', mode: 'division', question: { type: TOOL_ID, mode: 'division', z: { re: 6, im: -4 }, w: { re: 0, im: 2 } } },
  // powers
  { label: 'powers, lab default (1 + i)^3', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 1, im: 1 }, exponent: 3 } },
  { label: 'powers, V5 compiled (2 + i)^4', mode: 'powers', question: compiled[3] },
  { label: 'powers, square', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 2, im: -1 }, exponent: 2 } },
  { label: 'powers, by squaring (n = 11)', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 1, im: 2 }, exponent: 11 } },
  { label: 'powers, n = 12', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 1, im: -1 }, exponent: 12 } },
  { label: 'powers, zero exponent', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 3, im: 4 }, exponent: 0 } },
  { label: 'powers, negative exponent', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 1, im: 1 }, exponent: -3 } },
  { label: 'powers, reciprocal', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 1, im: 2 }, exponent: -1 } },
  { label: 'powers, decimal base', mode: 'powers', question: { type: TOOL_ID, mode: 'powers', z: { re: 0.5, im: 0.5 }, exponent: 4 } },
  // rotation
  { label: 'rotation, lab default', mode: 'rotation', question: { type: TOOL_ID, mode: 'rotation', z: { re: 3, im: 1 }, quarterTurns: 1 } },
  { label: 'rotation, V5 compiled i^3', mode: 'rotation', question: compiled[4] },
  { label: 'rotation, i^7', mode: 'rotation', question: { type: TOOL_ID, mode: 'rotation', z: { re: 2, im: -5 }, quarterTurns: 7 } },
  { label: 'rotation, i^-1', mode: 'rotation', question: { type: TOOL_ID, mode: 'rotation', z: { re: 2, im: -5 }, quarterTurns: -1 } },
  { label: 'rotation, half-turn', mode: 'rotation', question: { type: TOOL_ID, mode: 'rotation', z: { re: 2, im: -5 }, quarterTurns: 2 } },
  { label: 'rotation, full turns', mode: 'rotation', question: { type: TOOL_ID, mode: 'rotation', z: { re: 2, im: -5 }, quarterTurns: 8 } },
  // quadratic roots
  { label: 'quadratic, lab default x^2 + 2x + 5', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: 2, c: 5 } } },
  { label: 'quadratic, V5 compiled', mode: 'quadraticRoots', question: compiled[5] },
  { label: 'quadratic, pure imaginary roots', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: 0, c: 4 } } },
  { label: 'quadratic, surd imaginary part', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: -2, c: 3 } } },
  { label: 'quadratic, fractional parts', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 2, b: 2, c: 1 } } },
  { label: 'quadratic, sqrt(3)/2', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: 1, c: 1 } } },
  { label: 'quadratic, negative leading coefficient', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: -1, b: 2, c: -5 } } },
  { label: 'quadratic, real rational roots', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: -5, c: 6 } } },
  { label: 'quadratic, repeated root', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: -2, c: 1 } } },
  { label: 'quadratic, real irrational roots', mode: 'quadraticRoots', question: { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 2, b: -1, c: -2 } } },
];

test('the builder is implemented and the shared index serves it', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildComplexPlaneLabReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
});

test('every mode: the stated answers are what the shared grader accepts', () => {
  const modes = new Set();
  CASES.forEach(({ label, mode, question }) => {
    assertReviewGradesCorrect(question, mode, label);
    modes.add(mode);
  });
  assert.deepEqual([...modes].sort(), ['division', 'features', 'operations', 'powers', 'quadraticRoots', 'rotation']);
});

test('a compiled V5 question (type, no toolId) gets the same review through the index', () => {
  compiled.forEach((question) => {
    assert.equal(question.type, TOOL_ID);
    assert.equal(question.toolId, undefined);
    const model = buildToolSolutionReviewModel(question);
    assert.ok(model, `${question.mode}: reviewed`);
    assert.deepEqual(model, buildComplexPlaneLabReview(question));
  });
});

test('the review says the actual numbers of this question', () => {
  const features = buildComplexPlaneLabReview({ mode: 'features', z: { re: 3, im: -4 } });
  assert.equal(itemValue(features, '|z|'), '5');
  assert.equal(itemValue(features, 'Re(z̄)'), '3');
  assert.equal(itemValue(features, 'Im(z̄)'), '4');
  assert.ok(features.steps.some((step) => step.includes('\\sqrt{3^2 + (-4)^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5')));

  const product = buildComplexPlaneLabReview({ mode: 'operations', operation: 'multiply', z: { re: 2, im: 3 }, w: { re: -1, im: 2 } });
  assert.equal(itemValue(product, 'Real part'), '-8');
  assert.equal(itemValue(product, 'Imaginary part'), '1');
  assert.ok(product.steps.some((step) => step.includes('$3i \\cdot 2i = 6i^2$')));
  assert.match(product.why, /13 \\cdot 5 = 65/);

  const quotient = buildComplexPlaneLabReview({ mode: 'division', z: { re: 1, im: 2 }, w: { re: 3, im: 4 } });
  assert.equal(itemValue(quotient, 'Im(w̄)'), '-4');
  assert.equal(itemValue(quotient, 'Quotient real part'), '$\\frac{11}{25} = 0.44$');
  assert.equal(itemValue(quotient, 'Quotient imaginary part'), '$\\frac{2}{25} = 0.08$');
  assert.match(quotient.why, /= \\frac\{25 \+ 50i\}\{25\} = 1 \+ 2i\$, which is \$z\$/);

  const power = buildComplexPlaneLabReview({ mode: 'powers', z: { re: 1, im: 1 }, exponent: 3 });
  assert.deepEqual(power.items, [
    { label: 'Real part', value: '-2' },
    { label: 'Imaginary part', value: '2' },
    { label: '|z³|', value: '$\\sqrt{8} = 2\\sqrt{2} \\approx 2.83$' },
  ]);

  const turned = buildComplexPlaneLabReview({ mode: 'rotation', z: { re: 2, im: -5 }, quarterTurns: 7 });
  assert.equal(itemValue(turned, 'Net rotation'), '90° clockwise');
  assert.ok(turned.steps[0].includes('$7 = 4(1) + 3$'));

  const roots = buildComplexPlaneLabReview({ mode: 'quadraticRoots', quadratic: { a: 1, b: 2, c: 5 } });
  assert.deepEqual(roots.items.map((item) => item.value), ['-1', '2', '-1', '-2']);
  assert.ok(roots.steps.some((step) => step.includes('= 4 - 20 = -16')));
});

test('a fraction that does not terminate is never printed as an exact decimal', () => {
  // 3/13 = 0.230769230769… agrees with 0.23076923 to 1e-9; a float test called
  // it exact once. It must be shown as an approximation the grader accepts.
  const model = buildComplexPlaneLabReview({ mode: 'division', z: { re: 1, im: 0 }, w: { re: 2, im: 3 } });
  assert.equal(itemValue(model, 'Quotient real part'), '$\\frac{2}{13} \\approx 0.15$');
  assert.equal(itemValue(model, 'Quotient imaginary part'), '$-\\frac{3}{13} \\approx -0.23$');
  assert.ok(model.note.includes('rounded to two places'));
  assert.doesNotMatch(JSON.stringify(model), /\d\.\d{5,}/, 'no long decimal claimed exact');
});

test('quadratic roots are graded as a set: either order the review allows is correct', () => {
  [{ a: 1, b: 2, c: 5 }, { a: 1, b: 1, c: 1 }, { a: 2, b: -1, c: -2 }].forEach((quadratic) => {
    const question = { mode: 'quadraticRoots', quadratic };
    const work = workFromReview('quadraticRoots', buildComplexPlaneLabReview(question));
    const swapped = { r1Re: work.r2Re, r1Im: work.r2Im, r2Re: work.r1Re, r2Im: work.r1Im };
    assert.equal(grade(question, swapped).isCorrect, true, JSON.stringify(quadratic));
  });
});

test('the check is real: a review read back wrong is graded wrong', () => {
  // Guards the harness itself — workFromReview + gradeToolWork can say no.
  CASES.slice(0, 12).forEach(({ label, mode, question }) => {
    const model = buildComplexPlaneLabReview(question);
    const work = workFromReview(mode, model);
    const [box] = Object.keys(work).filter((key) => key !== 'rotation');
    const wrong = { ...work, [box]: String(Number(work[box]) + 1) };
    assert.equal(grade(question, wrong).isCorrect, false, `${label}: off by one is wrong`);
  });
});

test('a Question Family template has no review; the instance a student saw does', () => {
  const template = {
    questionId: 'cpl-family', type: TOOL_ID, toolId: TOOL_ID, mode: 'operations', operation: 'add',
    prompt: 'Add ({{a}} + {{b}}i) and (2 - i).', z: { re: '{{a}}', im: '{{b}}' }, w: { re: 2, im: -1 }, activityRole: 'dol',
    questionFamily: { scope: 'assignment' },
    generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } } },
  };
  assert.equal(buildComplexPlaneLabReview(template), null, 'the placeholders are not numbers');
  [3, 7].forEach((seat) => {
    const instance = resolveFamilyQuestionInstance({ question: template, assignmentId: 'A1', storageIndex: 0, allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' } }).question;
    const { work } = assertReviewGradesCorrect(instance, 'operations', `family seat ${seat}`);
    assert.equal(work.real, String(Number(instance.z.re) + 2));
    assert.equal(work.imaginary, String(Number(instance.z.im) - 1));
  });
});

test('every integer question of every mode is explained, and every explanation grades correct', () => {
  // Wide sweep over the shapes a teacher writes: the builder may only refuse
  // what the grader cannot answer (0 to a power ≤ 0, division by 0).
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const grid = range(-3, 3).flatMap((re) => range(-3, 3).map((im) => ({ re, im })));
  let checked = 0;
  const check = (question, mode) => {
    const model = buildComplexPlaneLabReview(question);
    assert.ok(model, `${JSON.stringify(question)}: explained`);
    const result = grade(question, workFromReview(mode, model));
    assert.equal(result.isCorrect, true, `${JSON.stringify(question)}: graded correct`);
    checked += 1;
  };
  grid.forEach((z) => {
    check({ mode: 'features', z }, 'features');
    range(-5, 9).forEach((quarterTurns) => check({ mode: 'rotation', z, quarterTurns }, 'rotation'));
    grid.forEach((w) => {
      ['add', 'subtract', 'multiply'].forEach((operation) => check({ mode: 'operations', operation, z, w }, 'operations'));
      if (w.re !== 0 || w.im !== 0) check({ mode: 'division', z, w }, 'division');
    });
  });
  range(-2, 2).flatMap((re) => range(-2, 2).map((im) => ({ re, im }))).forEach((z) => {
    range(-6, 12).forEach((exponent) => {
      if (z.re === 0 && z.im === 0 && exponent <= 0) {
        assert.equal(buildComplexPlaneLabReview({ mode: 'powers', z, exponent }), null, '0 to a power ≤ 0 has no answer');
        return;
      }
      check({ mode: 'powers', z, exponent }, 'powers');
    });
  });
  [-2, -1, 1, 2, 3].forEach((a) => range(-6, 6).forEach((b) => range(-6, 6).forEach((c) => {
    check({ mode: 'quadraticRoots', quadratic: { a, b, c } }, 'quadraticRoots');
  })));
  assert.ok(checked > 8000, `${checked} questions checked`);
});

test('the stated answers agree with the lab math, independently of the review text', () => {
  // The same helpers the grader uses, recomputed here: each stated number is
  // within the grader's tolerance of the value it must be.
  const near = (stated, expected, tolerance = 0.01) => Math.abs(Number(stated) - expected) <= tolerance;
  const z = { re: 5, im: -2 };
  const w = { re: -1, im: 3 };
  const add = workFromReview('operations', buildComplexPlaneLabReview({ mode: 'operations', operation: 'add', z, w }));
  assert.ok(near(add.real, complexAdd(z, w).re) && near(add.imaginary, complexAdd(z, w).im));
  const subtract = workFromReview('operations', buildComplexPlaneLabReview({ mode: 'operations', operation: 'subtract', z, w }));
  assert.ok(near(subtract.real, complexSubtract(z, w).re) && near(subtract.imaginary, complexSubtract(z, w).im));
  const multiply = workFromReview('operations', buildComplexPlaneLabReview({ mode: 'operations', operation: 'multiply', z, w }));
  assert.ok(near(multiply.real, complexMultiplyValues(z, w).re) && near(multiply.imaginary, complexMultiplyValues(z, w).im));
  const divide = workFromReview('division', buildComplexPlaneLabReview({ mode: 'division', z, w }));
  assert.ok(near(divide.real, complexDivide(z, w).re) && near(divide.imaginary, complexDivide(z, w).im));
  assert.ok(near(divide.conjugateRe, complexConjugateValue(w).re) && near(divide.conjugateIm, complexConjugateValue(w).im));
  const features = workFromReview('features', buildComplexPlaneLabReview({ mode: 'features', z }));
  assert.ok(near(features.magnitudeAnswer, complexMagnitudeValue(z)));
  const power = workFromReview('powers', buildComplexPlaneLabReview({ mode: 'powers', z: w, exponent: -2 }));
  assert.ok(near(power.real, complexPower(w, -2).re) && near(power.imaginary, complexPower(w, -2).im));
  assert.ok(near(power.magnitude, complexMagnitudeValue(complexPower(w, -2)), 0.02));
  const rotated = workFromReview('rotation', buildComplexPlaneLabReview({ mode: 'rotation', z, quarterTurns: 6 }));
  assert.ok(near(rotated.real, rotateByPowerOfI(z, 6).re) && near(rotated.imaginary, rotateByPowerOfI(z, 6).im));
  assert.equal(rotated.rotation, '2');
  const roots = workFromReview('quadraticRoots', buildComplexPlaneLabReview({ mode: 'quadraticRoots', quadratic: { a: 3, b: 2, c: 1 } }));
  const expected = quadraticRootsComplex({ a: 3, b: 2, c: 1 });
  assert.ok(near(roots.r1Re, expected[0].re) && near(roots.r1Im, expected[0].im));
  assert.ok(near(roots.r2Re, expected[1].re) && near(roots.r2Im, expected[1].im));
});

test('no review — and no throw — for anything it cannot explain correctly', () => {
  const refused = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['an array', []],
    ['a string', 'complexPlaneLab'],
    ['only the tool id', { toolId: TOOL_ID }],
    ['only the type', { type: TOOL_ID, prompt: 'Find |z|.' }],
    ['a mode the lab would not render (stray space)', { mode: ' powers', z: { re: 1, im: 1 }, exponent: 2 }],
    ['a non-string mode', { mode: ['powers'], z: { re: 1, im: 1 }, exponent: 2 }],
    ['an operation the lab does not offer', { mode: 'operations', operation: 'divide', z: { re: 1, im: 1 }, w: { re: 1, im: -1 } }],
    ['division by 0 + 0i', { mode: 'division', z: { re: 1, im: 2 }, w: { re: 0, im: 0 } }],
    ['a non-integer exponent', { mode: 'powers', z: { re: 1, im: 1 }, exponent: 1.5 }],
    ['an exponent beyond the schema', { mode: 'powers', z: { re: 1, im: 1 }, exponent: 13 }],
    ['0 to a negative power', { mode: 'powers', z: { re: 0, im: 0 }, exponent: -2 }],
    ['0 to the power 0', { mode: 'powers', z: { re: 0, im: 0 }, exponent: 0 }],
    ['a non-integer quarter-turn count', { mode: 'rotation', z: { re: 1, im: 1 }, quarterTurns: 1.5 }],
    ['a = 0', { mode: 'quadraticRoots', quadratic: { a: 0, b: 2, c: 1 } }],
    ['a non-numeric coefficient', { mode: 'quadraticRoots', quadratic: { a: 1, b: 'two', c: 1 } }],
    ['a template placeholder', { mode: 'features', z: { re: '{{a}}', im: 2 } }],
    ['a component the lab prints rounded', { mode: 'features', z: { re: 0.125, im: 1 } }],
    ['z given as an array', { mode: 'features', z: [3, 4] }],
    ['z given as a string', { mode: 'features', z: '3+4i' }],
    ['a component beyond ±1000', { mode: 'operations', operation: 'add', z: { re: 5000, im: 1 }, w: { re: 1, im: 1 } }],
    ['an infinite component', { mode: 'operations', operation: 'add', z: { re: Infinity, im: 1 }, w: { re: 1, im: 1 } }],
  ];
  refused.forEach(([label, question]) => {
    assert.doesNotThrow(() => buildComplexPlaneLabReview(question), label);
    assert.equal(buildComplexPlaneLabReview(question), null, label);
  });
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID, mode: 'division', w: { re: 0, im: 0 } }), null);
});

test('the builder is pure: it never changes the question it reads', () => {
  const question = { type: TOOL_ID, mode: 'quadraticRoots', quadratic: { a: 1, b: 2, c: 5 }, z: { re: 1, im: 1 } };
  const before = JSON.stringify(question);
  const first = buildComplexPlaneLabReview(question);
  assert.equal(JSON.stringify(question), before);
  assert.deepEqual(buildComplexPlaneLabReview(question), first, 'same question, same review');
});
