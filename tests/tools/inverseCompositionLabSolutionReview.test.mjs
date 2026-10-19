import test from 'node:test';
import assert from 'node:assert/strict';

import buildDefault, {
  buildInverseCompositionLabReview,
  implemented,
} from '../../src/tools/shared/reviews/inverseCompositionLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  formatInverseDerivationRelation,
} from '../../functions/shared/toolMath/inverseComposition/inverseDerivationMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * THE INVERSE & COMPOSITION REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once an Inverse & Composition Lab question is closed, its review lists the
 * compositions, the inverse value, the domain restriction or the derived
 * inverse, with the worked steps that reach them. Every review here is turned
 * back into the work a student following it would submit — the numbers it
 * states, typed into the lab's boxes; the restriction option it names; the
 * balanced moves its steps list, applied with the lab's own state machine —
 * and graded by the shared grader the server records with (gradeToolWork). It
 * must come back correct. Every graded view is covered: full, composition,
 * inverse, restriction and deriveInverse.
 *
 * A question no answer can be right for (no inverse function, a value outside
 * a domain, a view the lab draws no boxes for) gets no review at all.
 */

const TOOL_ID = 'inverseCompositionLab';
const q = (fields) => ({ type: TOOL_ID, ...fields });

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

const RESTRICTION_CHOICES = Object.freeze({
  'No restriction needed': 'none',
  'Use the left branch (x ≤ vertex x)': 'left',
  'Use the right branch (x ≥ vertex x)': 'right',
});

// What a student types for a stated value: the decimal after "≈" when the
// review shows one (a fraction cannot be typed into a number box).
const typedFrom = (value) => value.split('≈').pop().trim().replace(/−/g, '-');

// The lab work a student who follows the review submits.
const labWorkFromReview = (question, model) => {
  const work = { x: question.x ?? 2, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: '' };
  for (const { label, value } of model.items) {
    if (label.startsWith('(f ∘ g)')) work.fogAnswer = typedFrom(value);
    else if (label.startsWith('(g ∘ f)')) work.gofAnswer = typedFrom(value);
    else if (label.startsWith('f⁻¹(')) work.inverseAnswer = typedFrom(value);
    else if (label === 'Domain restriction') {
      const option = Object.keys(RESTRICTION_CHOICES).find((text) => value.startsWith(text));
      assert.ok(option, `the restriction names one of the lab's options: ${value}`);
      work.restrictionChoice = RESTRICTION_CHOICES[option];
    } else assert.fail(`unexpected item ${label}`);
  }
  return work;
};

// The derivation a student who follows the review's steps builds, with the
// lab's own state machine.
const operand = (text) => Number(text.replace(/−/g, '-'));
const derivationFromReview = (question, model) => {
  let state = createLinearInverseDerivation(question.f);
  const applied = [];
  for (const step of model.steps) {
    let match;
    if (step.startsWith('Swap x and y')) state = applyInverseDerivationOperation(state, 'swapVariables');
    else if ((match = step.match(/^Subtract (\S+) from both sides/))) state = applyInverseDerivationOperation(state, 'subtract', operand(match[1]));
    else if ((match = step.match(/^Add (\S+) to both sides/))) state = applyInverseDerivationOperation(state, 'add', operand(match[1]));
    else if ((match = step.match(/^Divide both sides by (\S+) /))) state = applyInverseDerivationOperation(state, 'divide', operand(match[1]));
    else if ((match = step.match(/^Multiply both sides by ([^\s,]+),/))) state = applyInverseDerivationOperation(state, 'multiply', operand(match[1]));
    else continue;
    applied.push(step);
  }
  return { state, applied };
};
const derivationWork = (state) => ({
  equation: { left: state.left, right: state.right },
  relation: formatInverseDerivationRelation(state),
  steps: state.history?.length || 0,
});
const item = (model, label) => model.items.find((entry) => entry.label === label)?.value;

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 1, `${label}: items`);
  model.items.forEach((entry) => {
    assert.equal(typeof entry.label, 'string');
    assert.equal(typeof entry.value, 'string');
    assert.ok(entry.label && entry.value, `${label}: no empty item`);
  });
  assert.ok(model.steps.length >= 2 && model.steps.length <= 12, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
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
  assignment: { title: 'Inverse and composite functions', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Find (f ∘ g)(3) and (g ∘ f)(3).', studentActions: ['composeFunctions'], f: { family: 'linear', m: 2, b: -1 }, g: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 3 },
      { prompt: 'Use the inverse to undo f.', studentActions: ['findInverse'], f: { type: 'exponential', a: 2, base: 3, h: 0, k: 1 }, x: 2 },
      { prompt: 'Restrict the domain so f has an inverse, then undo f.', studentActions: ['findInverse'], mode: 'restriction', f: { type: 'quadratic', a: 1, h: 2, k: -1, domain: { min: 2 } }, x: 5 },
      { prompt: 'Derive the inverse of f(x) = 4x − 8.', studentActions: ['findInverse'], mode: 'deriveInverse', f: { family: 'linear', m: 4, b: -8 } },
    ],
  }],
}).package.sections[0].questions;

// Every lab view, across the function families the lab inverts and composes.
const LAB_QUESTIONS = [
  // SAMPLE_BATCH_A_DEEP_DIVE.json (texas:2A.2A, 2A.2B, 2A.2C).
  { label: 'sample full, linear', view: 'full', question: q({ mode: 'full', f: { type: 'linear', a: 2, h: 0, k: 3 }, g: { type: 'linear', a: -1, h: 0, k: 4 }, x: 2 }), expect: { '(f ∘ g)(2)': '7', '(g ∘ f)(2)': '−3', 'f⁻¹(7)': '2' } },
  { label: 'sample restriction, right branch', view: 'restriction', question: q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 2, k: -1, inverseBranch: 'right', domain: { min: 2 } }, g: { type: 'linear', a: 1, h: 0, k: -2 }, x: 5 }), expect: { 'f⁻¹(8)': '5' } },
  { label: 'sample inverse, exponential', view: 'inverse', question: q({ mode: 'inverse', f: { type: 'exponential', a: 3, base: 2, h: 1, k: -4 }, g: { type: 'logarithmic', a: 1, base: 2, h: 0, k: 0 }, x: 4 }), expect: { 'f⁻¹(20)': '4' } },
  // SAMPLE_MISSING_MATH_TOOLS.json: no mode, so the full lab.
  { label: 'sample without a mode', view: 'full', question: q({ f: { type: 'linear', a: 2, k: 3 }, g: { type: 'linear', a: -1, k: 4 }, x: 2 }), expect: { '(f ∘ g)(2)': '7', '(g ∘ f)(2)': '−3' } },
  { label: 'V5 composition', view: 'composition', question: compiled[0], expect: { '(f ∘ g)(3)': '17', '(g ∘ f)(3)': '25' } },
  { label: 'V5 inverse, exponential base 3', view: 'inverse', question: compiled[1], expect: { 'f⁻¹(19)': '2' } },
  { label: 'V5 restriction, one-sided domain', view: 'restriction', question: compiled[2], expect: { 'f⁻¹(8)': '5' } },
  { label: 'full, quadratic left branch', view: 'full', question: q({ f: { type: 'quadratic', a: 1, h: 1, k: -2, inverseBranch: 'left' }, g: { type: 'linear', a: -1, k: 4 }, x: -1 }), expect: { '(f ∘ g)(−1)': '14', '(g ∘ f)(−1)': '2', 'f⁻¹(2)': '−1' } },
  { label: 'full, an exponential and its log', view: 'full', question: q({ f: { type: 'exponential', a: 1, base: 2, h: 0, k: 0 }, g: { type: 'logarithmic', a: 1, base: 2, h: 0, k: 0 }, x: 3 }), expect: { '(f ∘ g)(3)': '3', '(g ∘ f)(3)': '3', 'f⁻¹(8)': '3' } },
  { label: 'inverse, log base 10', view: 'inverse', question: q({ mode: 'inverse', f: { type: 'logarithmic', a: 1, base: 10, h: 0, k: 0 }, x: 100 }), expect: { 'f⁻¹(2)': '100' } },
  { label: 'inverse, square root', view: 'inverse', question: q({ mode: 'inverse', f: { type: 'squareRoot', a: 2, h: 1, k: 0 }, x: 5 }), expect: { 'f⁻¹(4)': '5' } },
  { label: 'inverse, parabola right branch', view: 'inverse', question: q({ mode: 'inverse', f: { type: 'quadratic', a: 1, h: 0, k: 0, inverseBranch: 'right' }, x: 3 }), expect: { 'f⁻¹(9)': '3' } },
  { label: 'inverse, parabola left branch by domain', view: 'inverse', question: q({ mode: 'inverse', f: { type: 'quadratic', a: -2, h: 3, k: 1, domain: { max: 3 } }, x: 1 }), expect: { 'f⁻¹(−7)': '1' } },
  { label: 'restriction, decreasing line', view: 'restriction', question: q({ mode: 'restriction', f: { type: 'linear', a: -3, h: 0, k: 9 }, x: 2 }), expect: { 'Domain restriction': 'No restriction needed', 'f⁻¹(3)': '2' } },
  { label: 'composition, irrational values', view: 'composition', question: q({ mode: 'composition', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, g: { type: 'linear', a: 1, h: 0, k: 1 }, x: 2 }), expect: { '(f ∘ g)(2)': '≈ 1.732', '(g ∘ f)(2)': '≈ 2.414' } },
  { label: 'composition, a fraction', view: 'composition', question: q({ mode: 'composition', f: { type: 'rational', a: 1, h: 0, k: 0 }, g: { type: 'linear', a: 1, h: 0, k: 1 }, x: 2 }), expect: { '(f ∘ g)(2)': '1/3 ≈ 0.333', '(g ∘ f)(2)': '1.5' } },
  { label: 'composition, absolute value and cubic', view: 'composition', question: q({ mode: 'composition', f: { type: 'absolute', a: 2, h: 1, k: -3 }, g: { type: 'cubic', a: 1, h: 0, k: -1 }, x: -2 }), expect: { '(f ∘ g)(−2)': '17', '(g ∘ f)(−2)': '26' } },
];

// Questions whose input x the student may change: the review works the lab's
// starting x and says so.
const UNLOCKED_QUESTIONS = [
  { label: 'no authored x', question: q({ mode: 'composition', f: { type: 'linear', a: 2, h: 0, k: 3 }, g: { type: 'linear', a: -1, h: 0, k: 4 } }), x: '2' },
  { label: 'allowInputChange', question: q({ mode: 'composition', allowInputChange: true, f: { type: 'linear', a: 2, h: 0, k: 3 }, g: { type: 'linear', a: -1, h: 0, k: 4 }, x: 3 }), x: '3' },
];

const DERIVE_QUESTIONS = [
  { label: 'V5 4x − 8', question: compiled[3], inverse: '(1/4)x + 2' },
  { label: 'negative slope', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: -3, h: 0, k: 9 } }), inverse: '(−1/3)x + 3' },
  { label: 'the lab default, authored', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: 2, h: 0, k: 3 } }), inverse: '(1/2)x − 3/2' },
  { label: 'shifted form a(x − h) + k', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: 2, h: 1, k: 3 } }), inverse: '(1/2)x − 1/2' },
  { label: 'decimal slope', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: 0.5, h: 0, k: -2 } }), inverse: '2x + 4' },
  { label: 'slope one third: multiply by 3', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: 1 / 3, h: 0, k: 2 } }), inverse: '3x − 6' },
  { label: 'slope 1: subtract only', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: 1, h: 0, k: 5 } }), inverse: 'x − 5' },
  { label: 'no constant: divide only', question: q({ mode: 'deriveInverse', f: { type: 'linear', a: -1, h: 0, k: 0 } }), inverse: '−x' },
];

/* --------------------------------------------------------------- tests */

test('the builder is implemented and the index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildInverseCompositionLabReview);
  assert.equal(buildDefault, buildInverseCompositionLabReview);
});

test('lab views: the stated compositions, inverse and restriction are what the shared grader accepts', () => {
  for (const { label, view, question, expect } of LAB_QUESTIONS) {
    const model = buildInverseCompositionLabReview(question);
    assertTextOnly(model, label);
    assertWired(question, model, label);
    // The view the grader marks, and the parts it marks there.
    const work = labWorkFromReview(question, model);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.mode, view, `${label}: graded as ${view}`);
    assert.equal(result.parts.length, model.items.length, `${label}: one item per marked part`);
    assert.equal(result.isCorrect, true, `${label}: the review's answer is correct (${JSON.stringify(work)})`);
    assert.equal(result.score, 1, `${label}: full credit`);
    // The values a teacher would expect for this question.
    for (const [itemLabel, value] of Object.entries(expect)) {
      const stated = item(model, itemLabel);
      assert.ok(stated !== undefined, `${label}: states ${itemLabel}`);
      assert.ok(stated.startsWith(value), `${label}: ${itemLabel} is ${value}, not ${stated}`);
    }
    assert.equal(model.note, null, `${label}: a given x needs no note`);
  }
});

test('lab views: the grader check above can fail — a wrong value or the wrong branch is rejected', () => {
  // Composition order swapped.
  const full = LAB_QUESTIONS[0].question;
  const right = labWorkFromReview(full, buildInverseCompositionLabReview(full));
  assert.equal(grade(full, right).isCorrect, true);
  assert.equal(grade(full, { ...right, fogAnswer: right.gofAnswer, gofAnswer: right.fogAnswer }).isCorrect, false);
  // f(x) typed where f⁻¹(f(x)) = x belongs.
  assert.equal(grade(full, { ...right, inverseAnswer: '7' }).isCorrect, false);
  // The other branch of the parabola.
  const parabola = LAB_QUESTIONS[7].question;
  const branch = labWorkFromReview(parabola, buildInverseCompositionLabReview(parabola));
  assert.equal(branch.restrictionChoice, 'left');
  assert.equal(grade(parabola, branch).isCorrect, true);
  assert.equal(grade(parabola, { ...branch, restrictionChoice: 'right' }).isCorrect, false);
});

test('lab views: the steps show this question\'s own numbers, in the order the functions act', () => {
  const model = buildInverseCompositionLabReview(LAB_QUESTIONS[0].question);
  assert.deepEqual(model.steps.slice(0, 4), [
    'For (f ∘ g)(2), g is written closest to x, so g acts first: g(2) = −(2) + 4 = 2.',
    'Then f acts on that output: f(2) = 2(2) + 3 = 7, so (f ∘ g)(2) = 7.',
    'For (g ∘ f)(2), f is written closest to x, so f acts first: f(2) = 2(2) + 3 = 7.',
    'Then g acts on that output: g(7) = −(7) + 4 = −3, so (g ∘ f)(2) = −3.',
  ]);
  assert.match(model.steps[5], /undo the \+ 3: 7 − 3 = 4; undo the × 2: 4 ÷ 2 = 2\. So f⁻¹\(7\) = 2/);
  // The check composes the formulas, independently of the machine trace.
  assert.match(model.why, /\(f ∘ g\)\(x\) = f\(−x \+ 4\) = −2x \+ 11, and at x = 2 it gives 7 again/);
  assert.match(model.why, /\(g ∘ f\)\(x\) = g\(2x \+ 3\) = −2x \+ 1, and at x = 2 it gives −3 again/);

  // A parabola's inverse takes the root on the kept branch.
  const left = buildInverseCompositionLabReview(LAB_QUESTIONS[7].question);
  assert.ok(left.steps.some((step) => /x = 0 and x = 2 both give y = −1/.test(step)), 'shows the parabola is not one-to-one');
  assert.ok(left.steps.some((step) => /negative square root \(the left branch\): −√4 = −2/.test(step)), 'takes the negative root');
  assert.equal(item(left, 'Domain restriction'), 'Use the left branch (x ≤ vertex x): x ≤ 1');
});

test('lab views with a changeable x: worked at the lab\'s starting x, and the note says so', () => {
  for (const { label, question, x } of UNLOCKED_QUESTIONS) {
    const model = buildInverseCompositionLabReview(question);
    assertTextOnly(model, label);
    assertWired(question, model, label);
    assert.match(model.note, new RegExp(`for x = ${x}, where the lab starts`), `${label}: the note names x`);
    const work = { ...labWorkFromReview(question, model), x: question.x ?? 2 };
    assert.equal(grade(question, work).isCorrect, true, `${label}: correct at the lab's starting x`);
    assert.ok(model.items.every((entry) => entry.label.endsWith(`(${x})`)), `${label}: items at x = ${x}`);
  }
});

test('deriveInverse: following the review\'s balanced moves in the lab reaches the inverse the grader accepts', () => {
  for (const { label, question, inverse } of DERIVE_QUESTIONS) {
    const model = buildInverseCompositionLabReview(question);
    assertTextOnly(model, label);
    assertWired(question, model, label);
    assert.equal(item(model, 'f⁻¹(x)'), inverse, `${label}: the inverse`);
    const { state, applied } = derivationFromReview(question, model);
    assert.ok(applied.length >= 2 || question.f.a === 1 || question.f.k === 0, `${label}: the steps name the moves`);
    // The equation the review's moves reach is the one it states.
    assert.equal(formatInverseDerivationRelation(state).replace(/-/g, '−'), `${inverse} = y`, `${label}: final equation`);
    const swapped = applyInverseDerivationOperation(createLinearInverseDerivation(question.f), 'swapVariables');
    assert.equal(item(model, 'After swapping x and y'), formatInverseDerivationRelation(swapped).replace(/-/g, '−'), `${label}: the swap`);
    const result = grade(question, derivationWork(state));
    assert.equal(result.mode, 'deriveInverse', `${label}: graded as the derivation`);
    assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: true, isComplete: true, score: 1 }, `${label}: the review's derivation is correct`);
    assert.match(model.why, /f⁻¹\(\S+\) = .* = 1 — f⁻¹ sends f's output back to its input\./, `${label}: a point check`);
  }
});

test('deriveInverse: the grader check above can fail — skipping a move or the swap is not the inverse', () => {
  const question = DERIVE_QUESTIONS[1].question;
  const model = buildInverseCompositionLabReview(question);
  const withoutDivide = { ...model, steps: model.steps.filter((step) => !step.startsWith('Divide')) };
  assert.equal(grade(question, derivationWork(derivationFromReview(question, withoutDivide).state)).isCorrect, false);
  const withoutSwap = { ...model, steps: model.steps.filter((step) => !step.startsWith('Swap') && !step.startsWith('Subtract') && !step.startsWith('Divide')) };
  assert.equal(grade(question, derivationWork(derivationFromReview(question, withoutSwap).state)).score, 0);
});

test('no review when no answer can be right, or the lab and the grader disagree about the question', () => {
  const nulls = [
    // Nothing the lab can explain.
    ['no authored f (the lab\'s demonstration is not a question)', q({ mode: 'composition', x: 2 })],
    ['composition without an authored g', q({ mode: 'composition', f: { type: 'linear', a: 2, k: 3 }, x: 2 })],
    ['f is not a function spec', q({ mode: 'inverse', f: 'linear', x: 2 })],
    ['an unknown family', q({ mode: 'inverse', f: { type: 'sine', a: 1 }, x: 2 })],
    ['a horizontal scale the lab ignores', q({ mode: 'inverse', f: { type: 'linear', a: 2, b: 3, k: 1 }, x: 2 })],
    ['a slope the lab ignores', q({ mode: 'deriveInverse', f: { type: 'linear', m: 2, k: 1 } })],
    ['a view the lab draws no composition boxes for', q({ mode: 'banana', f: { type: 'linear', a: 2, k: 3 }, g: { type: 'linear', a: -1, k: 4 }, x: 2 })],
    ['a padded mode', q({ mode: ' composition ', f: { type: 'linear', a: 2, k: 3 }, g: { type: 'linear', a: -1, k: 4 }, x: 2 })],
    ['a non-numeric x', q({ mode: 'inverse', f: { type: 'linear', a: 2, k: 3 }, x: 'two' })],
    ['a blank x', q({ mode: 'inverse', f: { type: 'linear', a: 2, k: 3 }, x: ' ' })],
    // No answer is ever correct.
    ['an unrestricted parabola has no inverse', q({ mode: 'inverse', f: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 2 })],
    ['restriction view, unrestricted parabola', q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 2 })],
    ['|x| has no inverse function', q({ f: { type: 'absolute', a: 1, h: 0, k: 0 }, g: { type: 'linear', a: 1, k: 1 }, x: 2 })],
    ['g(x) outside f\'s domain', q({ mode: 'composition', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, g: { type: 'linear', a: 1, h: 0, k: -10 }, x: 2 })],
    ['x outside f\'s domain', q({ mode: 'inverse', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, x: -4 })],
    ['deriveInverse with a quadratic', q({ mode: 'deriveInverse', f: { type: 'quadratic', a: 1, h: 0, k: 0 } })],
    ['deriveInverse with a slope no number box can hold exactly', q({ mode: 'deriveInverse', f: { type: 'linear', a: 3 / 7, h: 0, k: 1 } })],
  ];
  for (const [label, question] of nulls) {
    assert.equal(buildInverseCompositionLabReview(question), null, label);
    assert.equal(buildToolSolutionReviewModel(question), null, `${label}: through the platform entry point`);
  }

  // Off the kept branch f⁻¹(f(x)) is the mirror input, not x. The grader
  // marks the mirror; the review, written for "f⁻¹ undoes f", gives none.
  const offBranch = q({ mode: 'inverse', f: { type: 'quadratic', a: 1, h: 2, k: 0, inverseBranch: 'right' }, x: 0 });
  // f(0) = 4, and on x ≥ 2, f⁻¹(4) = 2 + 2 = 4 = 2h − x: the grader marks that, not x.
  assert.equal(grade(offBranch, { x: 0, inverseAnswer: '0' }).isCorrect, false, 'x itself is not f⁻¹(f(x)) here');
  assert.equal(grade(offBranch, { x: 0, inverseAnswer: '4' }).isCorrect, true, 'the mirror input is');
  assert.equal(buildInverseCompositionLabReview(offBranch), null, 'but f⁻¹(4) on the right branch is 4, not 0');
});

test('never throws: null, {}, and malformed input give null', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'mode', { get() { throw new Error('boom'); }, enumerable: true });
  const inputs = [null, undefined, {}, [], 'inverseCompositionLab', 42, { toolId: TOOL_ID }, { f: null, g: null }, { f: [], x: [] }, hostile];
  inputs.forEach((input, index) => {
    assert.doesNotThrow(() => buildInverseCompositionLabReview(input), `input ${index}`);
    assert.equal(buildInverseCompositionLabReview(input), null, `input ${index}`);
  });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
});
