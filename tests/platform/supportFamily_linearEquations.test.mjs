/*
 * THE linearEquations SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/linearEquations.js gives the platform Hint
 * control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for one-variable linear equations and literal equations. Every item
 * here is one a student can actually be given:
 *
 *   - platform Question Family instances (linear.twoStepEquation v1/v2,
 *     linear.multiStepEquation v1/v2, Step Algebra and multiAnswer tools),
 *     built by resolveFamilyQuestionInstance exactly as delivery builds them,
 *     including the authored slots of SAMPLE_QUESTION_FAMILY_RECOVERY.json;
 *   - the sample assignments' generator templates (SAMPLE_*.json), run through
 *     the real legacy generator (problemGenerator.generateQuestion), variants
 *     included — numeric equations, slope-intercept rewrites, literal formulas;
 *   - the Path banks' Step Algebra templates (seed/pathQuestionBank);
 *   - the demo bank's algebra and literal items;
 *   - the stepAlgebra2 item in SAMPLE_MISSING_MATH_TOOLS.json;
 *   - a V5 document compiled by compileAuthoringIntentV5.
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family: mathjs in exact fraction arithmetic, on the equation as the question
 * shows it (latexToExpression for the LaTeX), never with the family's parser.
 *
 * Mutation-checked (each went red, then restored):
 *   - hints(): the guard that swaps a numbered spelling for a plain one was
 *     bypassed (first spelling always) → 3x + 6 = 21-style items leak;
 *   - the closing self-check hint was made to state the value (both
 *     spellings) → the guard drops it and "every ladder ends with a check" fails;
 *   - the sibling's stated answer was moved off by one → the independent
 *     substitution fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { all, create } from 'mathjs';

import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const fractionText = (value) => {
  const fraction = F(value);
  const sign = Number(fraction.s) < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const fractionLatex = (value) => {
  const fraction = F(value);
  return Number(fraction.d) === 1 ? fractionText(value) : `${Number(fraction.s) < 0 ? '-' : ''}\\frac{${fraction.n}}{${fraction.d}}`;
};

// A formula's letters stand together (bh, Prt): mathjs needs the product spelled out.
const toMath = (side) => latexToExpression(String(side).trim()).replace(/([A-Za-z])(?=[A-Za-z])/g, '$1*');
const lettersOf = (expression) => [...new Set(String(expression).match(/[A-Za-z]/g) || [])];

/** left = right solved for `variable` (other letters fixed by `scope`), exactly; null unless linear in it. */
const solveLinear = (left, right, variable, scope = {}) => {
  try {
    const node = math.parse(`(${left}) - (${right})`);
    const at = (value) => F(node.evaluate({ ...scope, [variable]: F(value) }));
    const b = at(0);
    const a = math.subtract(at(1), b);
    if (!math.equal(at(2), math.add(math.multiply(a, 2), b)) || !math.equal(at(-3), math.add(math.multiply(a, -3), b))) return null;
    if (math.equal(a, 0)) return { case: math.equal(b, 0) ? 'infinite' : 'none' };
    return { case: 'one', value: math.divide(math.unaryMinus(b), a) };
  } catch {
    return null;
  }
};

const isStepAlgebra2 = (question) => question.type === 'stepAlgebra2' || question.toolId === 'stepAlgebra2';

/** Every place the question shows its equation, read without the family. */
const equationReadings = (question) => {
  const readings = [];
  const push = (left, right) => readings.push([toMath(left), toMath(right)]);
  if (typeof question.leftExpression === 'string' && typeof question.rightExpression === 'string') push(question.leftExpression, question.rightExpression);
  for (const field of ['equation', 'equationLatex', 'formula', 'formulaLatex']) {
    const value = question[field];
    if (typeof value === 'string' && value.split('=').length === 2) push(...value.split('='));
  }
  const abc = (source) => (source && typeof source === 'object' && ['a', 'b', 'c'].every((key) => Number.isFinite(Number(source[key]))) ? source : null);
  const model = abc(question.equation) || (question.type === 'algebra' ? abc(question) : null);
  if (model) push(`(${model.a})*x + (${model.b})`, `${model.c}`);
  if (isStepAlgebra2(question) && (question.equation === undefined || question.equation === null)) push('3*x + 6', '21');
  if (question.type === 'multiAnswer' || /\$[^$]*=[^$]*\$/.test(String(question.prompt ?? ''))) {
    for (const [, segment] of String(question.prompt ?? '').matchAll(/\$([^$]*=[^$]*)\$/g)) push(...segment.split('='));
  }
  return readings;
};

/** The solution set of a one-variable equation, from every reading — which must agree. */
const numericOracle = (question) => {
  const variable = question.variable || question.solveFor || 'x';
  const solutions = equationReadings(question).map(([left, right]) => solveLinear(left, right, variable)).filter(Boolean);
  assert.ok(solutions.length, `the oracle reads the equation of ${question.prompt}`);
  solutions.forEach((solution) => {
    assert.equal(solution.case, solutions[0].case, 'every reading of the equation agrees');
    if (solution.case === 'one') assert.ok(math.equal(solution.value, solutions[0].value), 'every reading agrees on the value');
  });
  return { variable, ...solutions[0] };
};

const independentTexts = (solution) => {
  if (solution.case === 'none') return ['No solution', 'no solution'];
  if (solution.case === 'infinite') return ['All real numbers', 'infinitely many solutions'];
  const plain = fractionText(solution.value);
  const decimal = Number(F(solution.value).d) === 1 ? [] : [String(math.number(solution.value))].filter((text) => text.length < 8);
  return [plain, fractionLatex(solution.value), ...decimal, `${solution.variable} = ${plain}`, `${solution.variable}=${plain}`];
};

/** The formula and the letter it is solved for, read without the family. */
const formulaOf = (question) => {
  const readings = equationReadings(question);
  assert.ok(readings.length, `a formula is readable on ${question.prompt}`);
  const target = question.solveFor || question.objective?.variable || question.variable
    || (question.targetForm === 'slopeIntercept' || question.objective?.kind === 'slopeIntercept' ? 'y' : '');
  assert.ok(target, 'the letter solved for is named');
  return { left: readings[0][0], right: readings[0][1], target };
};

/** Positive rationals for every other letter, so a formula can be checked at a point. */
const pointFor = (letters, salt = 0) => Object.fromEntries(letters.map((letter, index) => [letter, F(`${(index * 7 + salt * 3) % 11 + 2}/${(index % 3) + 2}`)]));

/* ------------------------------------------------------------ the real items */

const familySlot = (id, version, tool, constraints = {}, authored = {}) => ({
  questionId: `q-${id}-v${version}-${tool}-${JSON.stringify(constraints)}-${authored.prompt ?? 'tokens'}`,
  type: tool,
  prompt: 'Solve {{equation}}.',
  questionFamily: { id, version, tool, constraints },
  ...authored,
});
const delivered = (slot, seat) => {
  const result = resolveFamilyQuestionInstance({
    question: slot,
    assignmentId: 'support-family-linear-equations',
    storageIndex: 0,
    allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' },
  });
  assert.equal(result.error, null, `${slot.questionId} resolves`);
  return result.question;
};
const seats = (slot, count) => Array.from({ length: count }, (_, seat) => delivered(slot, seat));

const variantsOf = (template) => (Array.isArray(template.variants) && template.variants.length
  ? template.variants.map((variant) => { const { variants: _variants, ...base } = template; return { ...base, ...variant }; })
  : [template]);
const generated = (template, keys) => variantsOf(template).flatMap((variant) => keys.map((key) => generateQuestion(variant, key)));

const recovery = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json');
const recoverySlots = recovery.sections.flatMap((section) => section.questions)
  .filter((question) => linearEquations.LINEAR_EQUATION_FAMILY_IDS.includes(question.questionFamily?.id));
const guidedNotes = readJson('SAMPLE_GUIDED_NOTES_CLASSWORK.json');
const practiceWithDol = readJson('SAMPLE_PRACTICE_WITH_DOL.json');
const persistence = readJson('SAMPLE_LOCAL_PERSISTENCE_RESUME_SOLUTION_QA.json');
const merged = readJson('SAMPLE_MERGED_FUNCTION_INVESTIGATION_ALGEBRA_QA.json');
const missingTools = readJson('SAMPLE_MISSING_MATH_TOOLS.json');
const demo = readJson('src/demo/demoAssignmentBank.json');
const demoQuestion = (questionId) => demo.flatMap((assignment) => assignment.questions).find((question) => question.questionId === questionId);
const pathStepAlgebra = ['algebra1', 'grade7', 'grade8']
  .flatMap((course) => readJson(`seed/pathQuestionBank/${course}_pathQuestionBank_seed.json`).documents)
  .filter((document) => document.type === 'stepAlgebra');
const KEYS = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];

const V5_DOCUMENT = {
  schemaVersion: 5,
  assignment: { title: 'Linear equations (synthetic)', courseId: 'algebra1', folder: 'Algebra I/Equations', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  variantPolicy: { mode: 'shared' },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Equations',
    questions: [
      { standard: 'A.5A', prompt: 'Solve $4x - 7 = 2x + 9$ in the balance workspace.', studentActions: ['solveEquation'], equation: '4x - 7 = 2x + 9', answer: '8' },
      { standard: 'A.12E', prompt: 'Solve $A = bh + c$ for $h$.', studentActions: ['solveLiteral'], equation: 'A = bh + c', solveFor: 'h', answer: '(A-c)/b' },
      { standard: 'A.3B', prompt: 'Rewrite $3x + 4y = 8$ in slope-intercept form.', studentActions: ['stepAlgebra2'], mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation: '3x + 4y = 8' },
      { standard: 'A.5A', prompt: 'Solve the equation on the balance.', studentActions: ['stepAlgebra2'], equationModel: { a: 5, b: -4, c: 26 } },
    ],
  }],
};
const v5 = compileAuthoringIntentV5(V5_DOCUMENT).package.sections[0].questions;

/** Every owned item, tagged with the kind the test checks it as. */
const ITEMS = [
  ...recoverySlots.flatMap((slot) => seats(slot, 4).map((question) => ({ label: `recovery ${slot.questionId}`, question, kind: 'numeric' }))),
  ...seats(familySlot('linear.twoStepEquation', 1, 'multiAnswer'), 4).map((question) => ({ label: 'two-step v1 multiAnswer', question, kind: 'numeric' })),
  ...seats(familySlot('linear.twoStepEquation', 1, 'multiAnswer', {}, { prompt: '' }), 3).map((question) => ({ label: 'two-step v1 multiAnswer (family prompt)', question, kind: 'numeric' })),
  ...seats(familySlot('linear.multiStepEquation', 1, 'multiAnswer'), 4).map((question) => ({ label: 'multi-step v1 multiAnswer', question, kind: 'numeric' })),
  ...seats(familySlot('linear.multiStepEquation', 2, 'stepAlgebra', { solutionCase: 'mixed', distribute: 'mixed' }), 12).map((question) => ({ label: 'multi-step v2 mixed', question, kind: 'numeric' })),
  ...seats(familySlot('linear.multiStepEquation', 2, 'stepAlgebra', { coefficientForm: 'fraction' }), 4).map((question) => ({ label: 'multi-step v2 fraction coefficients', question, kind: 'numeric' })),
  ...seats(familySlot('linear.twoStepEquation', 2, 'stepAlgebra', { distribute: true }), 4).map((question) => ({ label: 'two-step v2 distribute', question, kind: 'numeric' })),
  ...seats(familySlot('linear.twoStepEquation', 2, 'stepAlgebra', { solutionForm: 'fraction' }), 4).map((question) => ({ label: 'two-step v2 fraction answer', question, kind: 'numeric' })),
  ...seats(familySlot('linear.twoStepEquation', 2, 'stepAlgebra', { coefficientForm: 'fraction', distribute: 'mixed' }), 4).map((question) => ({ label: 'two-step v2 fraction coefficients', question, kind: 'numeric' })),
  ...generated(guidedNotes[0], KEYS).map((question) => ({ label: 'guided notes balance', question, kind: 'numeric' })),
  ...generated(practiceWithDol[0], KEYS).map((question) => ({ label: 'practice with DOL', question, kind: 'numeric' })),
  ...generated(persistence[5], KEYS.slice(0, 2)).map((question) => ({ label: 'persistence QA', question, kind: 'numeric' })),
  ...generated(merged[6], KEYS.slice(0, 2)).map((question) => ({ label: 'numeric balance QA', question, kind: 'numeric' })),
  ...pathStepAlgebra.flatMap((document) => KEYS.map((key) => ({ label: `path ${document.id}`, question: generatePathInstanceWithRetries(document, key).question, kind: 'numeric' }))),
  ...demo.flatMap((assignment) => assignment.questions).filter((question) => question.type === 'algebra').map((question) => ({ label: `demo ${question.questionId}`, question, kind: 'numeric' })),
  { label: 'stepAlgebra2 sample', question: missingTools.questions[13], kind: 'numeric' },
  { label: 'V5 stepAlgebra', question: v5[0], kind: 'numeric' },
  { label: 'V5 stepAlgebra2', question: v5[3], kind: 'numeric' },
  ...generated(guidedNotes[1], ['k']).map((question) => ({ label: 'guided notes slope-intercept', question, kind: 'line' })),
  ...generated(merged[4], ['k']).map((question) => ({ label: 'slope-intercept QA', question, kind: 'line' })),
  { label: 'V5 slope-intercept', question: v5[2], kind: 'line' },
  ...generated(merged[5], ['k']).map((question) => ({ label: 'literal formula QA', question, kind: 'literal' })),
  ...KEYS.map((key) => ({ label: 'legacy literalLinear', question: generateQuestion({ type: 'literal', prompt: 'Solve the formula for the indicated variable.', generator: { kind: 'literalLinear' } }, key), kind: 'literal' })),
  { label: 'V5 literal', question: v5[1], kind: 'literal' },
  ...['phone-modeling-q4', 'college-readiness-q1', 'college-readiness-q2', 'college-readiness-q5', 'ccmr-practice-q2', 'ccmr-practice-q3']
    .map((questionId) => ({ label: `demo ${questionId}`, question: demoQuestion(questionId), kind: 'applied' })),
];

const answersFor = ({ question, kind }) => {
  const own = [...linearEquations.expectedValues(question), ...questionAnswerValues(question)];
  if (kind === 'numeric') return [...own, ...independentTexts(numericOracle(question))];
  if (kind === 'line') {
    const { left, right } = formulaOf(question);
    const at = (x) => solveLinear(left, right, 'y', { x: F(x) }).value;
    const intercept = at(0);
    const slope = math.subtract(at(1), intercept);
    return [...own, fractionText(slope), fractionLatex(slope), fractionText(intercept), fractionLatex(intercept)];
  }
  return own;
};

/* ------------------------------------------------------------ ownership */

test('the family owns every real linear-equation item, ahead of every later family', () => {
  const kinds = {};
  for (const item of ITEMS) {
    assert.ok(item.question, `${item.label} was generated`);
    assert.equal(linearEquations.matches(item.question), true, `${item.label}: matches`);
    assert.equal(familyFor(item.question), linearEquations, `${item.label}: owned by linearEquations`);
    kinds[item.kind] = (kinds[item.kind] || 0) + 1;
  }
  // Several real items of every sub-kind the family claims.
  assert.ok(kinds.numeric >= 40, JSON.stringify(kinds));
  assert.ok(kinds.line >= 4 && kinds.literal >= 4 && kinds.applied >= 4, JSON.stringify(kinds));
  // The v2 mixed slot really did deliver all three cases.
  const outcomes = new Set(ITEMS.filter((item) => item.label === 'multi-step v2 mixed').map((item) => item.question.solutionKey.outcome));
  assert.deepEqual([...outcomes].sort(), ['allReals', 'noSolution', 'value']);
});

test('it claims nothing that is not a linear equation: the whole teacher-import corpus, the district DOL, and the other families\' shapes', () => {
  const corpus = [];
  const walk = (directory) => readdirSync(directory).forEach((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.json')) corpus.push(path);
  });
  walk(new URL('teacher-import-jsons', ROOT).pathname);
  const questions = corpus.flatMap((path) => compileAuthoringIntentV5(JSON.parse(readFileSync(path, 'utf8'))).package.sections.flatMap((section) => section.questions));
  assert.ok(questions.length > 150);
  questions.forEach((question) => assert.equal(linearEquations.matches(question), false, `corpus: ${question.type} ${String(question.prompt).slice(0, 80)}`));
  readJson('drafts/district-dol2/assignment.json').sections.flatMap((section) => section.questions)
    .forEach((question) => assert.equal(linearEquations.matches(question), false, `district DOL: ${question.heading}`));

  // Demo "literal" items that are really systems, exponents, inverses, two
  // formulas, or a formula already solved for the letter asked.
  ['systems-dol-q1', 'systems-quiz-q3', 'exponents-adaptive-q1', 'exponents-adaptive-q4', 'a2-inverse-q1', 'phone-modeling-q1', 'phone-modeling-q2', 'honors-modeling-q1']
    .forEach((questionId) => assert.equal(linearEquations.matches(demoQuestion(questionId)), false, questionId));

  const others = {
    intercepts: { type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y = 12' },
    inequality: { type: 'stepAlgebra', equation: '2x + 3 < 9', inequalityText: '2x + 3 < 9' },
    inequalityLatex: { type: 'stepAlgebra', equationLatex: '2x + 3 \\le 9' },
    absoluteValue: { type: 'stepAlgebra', equationLatex: '\\left|x - 3\\right| = 5', variable: 'x' },
    quadratic: { type: 'stepAlgebra', equation: 'x^2 + 3 = 12', variable: 'x' },
    variableDenominator: { type: 'stepAlgebra', equation: '6/x = 3', variable: 'x' },
    radical: { type: 'stepAlgebra', equationLatex: '\\sqrt{x} = 3' },
    factoredRewrite: { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 2x + 6' },
    system: { type: 'system', equations: ['y = 2x + 1', 'y = -x + 4'], solution: [1, 3] },
    alreadySolved: { type: 'stepAlgebra', equation: 'x = 7' },
    functionNotation: { type: 'stepAlgebra', equation: 'f(x) = 2x + 3' },
    fractionArithmetic: { type: 'multiAnswer', prompt: 'Solve $x = \\frac{2}{3} + \\frac{1}{4}$.', answerFields: [{ id: 'x', label: 'x =', answer: '11/12' }] },
    keyIsNotTheSolution: { type: 'multiAnswer', prompt: 'Solve $3x + 5 = 20$.', answerFields: [{ id: 'answer', label: 'Answer', answer: '7' }] },
    twoFields: { type: 'multiAnswer', prompt: 'Solve $3x + 5 = 20$.', answerFields: [{ id: 'a', answer: '5' }, { id: 'b', answer: '6' }] },
  };
  Object.entries(others).forEach(([name, question]) => assert.equal(linearEquations.matches(question), false, name));
});

/* ------------------------------------------------------------ hints */

test('hints: two to four, built from the problem, and none contains an answer — the family\'s or the oracle\'s', () => {
  for (const item of ITEMS) {
    const { question, label } = item;
    const hints = linearEquations.hints(question);
    assert.ok(hints.length >= 2 && hints.length <= 4, `${label}: ${hints.length} hints`);
    const answers = answersFor(item);
    hints.forEach((hint) => assert.equal(hintRevealsAnswer(hint, answers), false, `${label}: "${hint}" leaks one of ${JSON.stringify(answers)}`));
    // Every hint reaches the student: the runtime guard drops none of them.
    const platform = buildQuestionHints(question);
    const shown = platform.map((hint) => hint.text);
    if (platform.length < 6) hints.forEach((hint) => assert.ok(shown.includes(hint), `${label}: "${hint}" is in the platform ladder`));
    assert.ok(platform.some((hint) => hint.source === 'family'), `${label}: the ladder carries family hints`);
  }
});

test('the expected values ARE this question\'s answers: checked against the oracle, not the family', () => {
  for (const item of ITEMS) {
    const { question, label, kind } = item;
    const expected = linearEquations.expectedValues(question);
    assert.ok(expected.length, `${label}: expected values`);
    if (kind === 'numeric') {
      const solution = numericOracle(question);
      if (solution.case === 'one') {
        assert.ok(expected.includes(fractionText(solution.value)), `${label}: ${fractionText(solution.value)} in ${JSON.stringify(expected)}`);
        // Every bare number the family lists is the solution.
        expected.map((value) => value.replace(/^[a-z]\s*=\s*/, '').replace('−', '-'))
          .filter((value) => /^-?\d+(?:\.\d+)?$|^-?\d+\/\d+$/.test(value))
          .forEach((value) => assert.ok(math.equal(F(value), solution.value), `${label}: ${value} is the solution`));
      } else {
        assert.ok(expected.includes(solution.case === 'none' ? 'No solution' : 'All real numbers'), `${label}: ${solution.case}`);
      }
    } else if (kind === 'literal' || kind === 'line') {
      // Every "letter = expression" form evaluates to the formula's own solution at a point.
      const { left, right, target } = formulaOf(question);
      const others = lettersOf(`${left} ${right}`).filter((letter) => letter !== target);
      const scope = pointFor(others);
      const truth = solveLinear(left, right, target, scope);
      assert.equal(truth.case, 'one', `${label}: the formula is solvable for ${target}`);
      // The LaTeX forms, and the plain ones whose division is unambiguous: (A - c)/b, (d)/(3r).
      const unambiguous = (value) => value.includes('\\frac') || !value.includes('/') || /^\(.+\)\/(\(.+\)|[A-Za-z0-9]+)$/.test(value);
      const forms = expected.filter((value) => value.startsWith(`${target} = `) && unambiguous(value.slice(target.length + 3)));
      assert.ok(forms.length >= 2, `${label}: ${JSON.stringify(expected)}`);
      forms.forEach((form) => assert.ok(math.equal(F(math.evaluate(toMath(form.slice(target.length + 3)), scope)), truth.value), `${label}: ${form}`));
    } else {
      // An applied formula: the number in its key is listed.
      list(question.acceptedAnswers).forEach((answer) => assert.ok(expected.includes(String(answer)), `${label}: ${answer}`));
    }
  }
});

function list(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

test('the ladder: least to most specific — it starts from this problem and ends with a check', () => {
  for (const { question, label, kind } of ITEMS) {
    const hints = linearEquations.hints(question);
    assert.match(hints[0], /^(Start from|Look at|You are solving|Use the formula|To write the equation)/, `${label}: orientation first`);
    const last = hints[hints.length - 1];
    if (kind === 'line') assert.match(last, /y = mx \+ b/, label);
    else if (question.relationWorkspace === true) assert.match(last, /always true or never true/, label);
    else assert.match(last, /^Check/, `${label}: ends with a self-check: ${last}`);
  }
});

test('3x + 6 = 21 (the stepAlgebra2 sample): hints quote its own numbers and never its answer', () => {
  const question = missingTools.questions[13];
  assert.equal(numericOracle(question).value.valueOf(), 5);
  const hints = linearEquations.hints(question);
  assert.match(hints[0], /^Start from \$3x \+ 6 = 21\$/);
  assert.match(hints[1], /subtract \$6\$ from both sides/);
  assert.match(hints[2], /divide both sides by \$3\$/);
  hints.forEach((hint) => assert.doesNotMatch(hint, /(^|[^\d])5(?!\d)/, hint));
  // 3x + 5 = 20 has its own answer on the screen: "+ 5" may not be quoted.
  const coincidence = { type: 'multiAnswer', prompt: 'Solve $3x + 5 = 20$.', answerFields: [{ id: 'answer', label: '$x$ =', answer: '5' }] };
  assert.equal(linearEquations.matches(coincidence), true, 'a single field whose key is the solution');
  const safe = linearEquations.hints(coincidence);
  assert.ok(safe.length >= 3);
  safe.forEach((hint) => assert.equal(hintRevealsAnswer(hint, ['5']), false, hint));
  assert.ok(safe.some((hint) => /divide both sides by \$3\$/.test(hint)), 'the numbers that are not the answer are still quoted');
});

test('a slot that can be a special case: the hints never say which case it is', () => {
  const mixed = ITEMS.filter((item) => item.label === 'multi-step v2 mixed');
  const counts = new Set(mixed.map(({ question }) => linearEquations.hints(question).length));
  assert.equal(counts.size, 1, 'the same number of hints in every case');
  const finals = new Set(mixed.map(({ question }) => linearEquations.hints(question).at(-1)));
  assert.equal(finals.size, 1, 'the same closing hint in every case');
  for (const { question } of mixed) {
    linearEquations.hints(question).forEach((hint) => assert.doesNotMatch(hint, /no solution|all real|infinitely|every real|identity|varnothing|mathbb|∅/i, hint));
  }
});

/* ------------------------------------------------------------ the worked sibling */

const SIBLING_STEP_EQUATION = /\$([^$]*=[^$]*)\$\.?$/;

const verifyNumericSibling = (item, sibling) => {
  const original = numericOracle(item.question);
  const prompt = /^Solve \$(.+)\$ for \$([A-Za-z])\$\.$/.exec(sibling.prompt);
  assert.ok(prompt, `${item.label}: ${sibling.prompt}`);
  const variable = prompt[2];
  assert.equal(variable, original.variable);
  const [left, right] = prompt[1].split('=').map(toMath);
  const solution = solveLinear(left, right, variable);
  assert.equal(solution.case, 'one', `${item.label}: the sibling has one solution`);
  const answer = /^\$([A-Za-z]) = (.+)\$$/.exec(sibling.answer);
  assert.ok(answer && answer[1] === variable, sibling.answer);
  const value = F(math.evaluate(toMath(answer[2])));
  assert.ok(math.equal(value, solution.value), `${item.label}: the stated answer solves ${prompt[1]}`);
  if (original.case === 'one') assert.ok(!math.equal(value, original.value), `${item.label}: a different answer`);
  // Every worked step is an equation with the same solution, and the last one checks it.
  sibling.steps.slice(0, -1).forEach((step) => {
    const shown = SIBLING_STEP_EQUATION.exec(step);
    assert.ok(shown, `${item.label}: "${step}" shows the equation it reaches`);
    const [stepLeft, stepRight] = shown[1].split('=').map(toMath);
    const reached = solveLinear(stepLeft, stepRight, variable);
    assert.ok(reached?.case === 'one' && math.equal(reached.value, value), `${item.label}: "${step}" keeps the solution`);
  });
  assert.match(sibling.steps.at(-1), /^Check/);
};

const verifyLiteralSibling = (item, sibling) => {
  const prompt = /^Solve \$(.+)\$ for \$([A-Za-z])\$\.$/.exec(sibling.prompt);
  assert.ok(prompt, `${item.label}: ${sibling.prompt}`);
  const target = prompt[2];
  const [left, right] = prompt[1].split('=').map(toMath);
  const answer = /^\$([A-Za-z]) = (.+)\$$/.exec(sibling.answer);
  assert.ok(answer && answer[1] === target, sibling.answer);
  const others = lettersOf(`${left} ${right}`).filter((letter) => letter !== target);
  for (const salt of [0, 1, 2]) {
    const scope = pointFor(others, salt);
    const value = F(math.evaluate(toMath(answer[2]), scope));
    assert.ok(math.equal(F(math.evaluate(left, { ...scope, [target]: value })), F(math.evaluate(right, { ...scope, [target]: value }))), `${item.label}: ${sibling.answer} satisfies ${prompt[1]}`);
  }
  const original = formulaOf(item.question);
  assert.notEqual(prompt[1].replace(/\s+/g, ''), `${original.left}=${original.right}`.replace(/\s+/g, ''));
};

const verifyLineSibling = (item, sibling) => {
  const prompt = /^Write \$(.+)\$ in slope-intercept form\.$/.exec(sibling.prompt);
  assert.ok(prompt, `${item.label}: ${sibling.prompt}`);
  const [left, right] = prompt[1].split('=').map(toMath);
  const answer = /^\$y = (.+)\$$/.exec(sibling.answer);
  assert.ok(answer, sibling.answer);
  for (const x of [0, 1, 3]) {
    const y = F(math.evaluate(toMath(answer[1]), { x: F(x) }));
    assert.ok(math.equal(F(math.evaluate(left, { x: F(x), y })), F(math.evaluate(right, { x: F(x), y }))), `${item.label}: ${sibling.answer} is the line ${prompt[1]}`);
  }
  // Not this question's line: a different slope or intercept.
  const original = formulaOf(item.question);
  const originalAt = (x) => solveLinear(original.left, original.right, 'y', { x: F(x) }).value;
  const siblingAt = (x) => F(math.evaluate(toMath(answer[1]), { x: F(x) }));
  assert.ok(!(math.equal(originalAt(0), siblingAt(0)) && math.equal(originalAt(1), siblingAt(1))), `${item.label}: a different line`);
};

test('"Try a similar one": a different problem of the same kind, worked in full, with a different answer', () => {
  for (const item of ITEMS) {
    const sibling = linearEquations.similarProblem(item.question, { seed: 0 });
    if (item.kind === 'applied') {
      // A formula applied to a value given in words: the given value is not
      // read from prose, so no sibling is offered rather than a wrong-kind one.
      assert.equal(sibling, null, item.label);
      continue;
    }
    assert.ok(sibling, `${item.label}: a sibling`);
    assert.ok(sibling.steps.length >= 2, `${item.label}: worked step by step`);
    if (item.kind === 'numeric') verifyNumericSibling(item, sibling);
    if (item.kind === 'literal') verifyLiteralSibling(item, sibling);
    if (item.kind === 'line') verifyLineSibling(item, sibling);
    // It never shows this question's answer, in any line.
    const answers = answersFor(item);
    [...sibling.steps, sibling.answer].forEach((line) => assert.equal(hintRevealsAnswer(line, answers), false, `${item.label}: "${line}"`));
    assert.notEqual(sibling.prompt, item.question.prompt);
    // The platform takes it: its own safety rules pass.
    assert.equal(similarExampleIsSafe(item.question, sibling), true, `${item.label}: similarExampleIsSafe`);
    assert.ok(buildSimilarWorkedExample(item.question), `${item.label}: buildSimilarWorkedExample`);
    // Deterministic from the seed.
    assert.deepEqual(linearEquations.similarProblem(item.question, { seed: 0 }), sibling);
  }
});

test('different seeds give different siblings, each still verified', () => {
  const item = { label: 'stepAlgebra2 sample', question: missingTools.questions[13], kind: 'numeric' };
  const prompts = new Set([0, 1, 2, 3, 4].map((seed) => {
    const sibling = linearEquations.similarProblem(item.question, { seed });
    verifyNumericSibling(item, sibling);
    return sibling.prompt;
  }));
  assert.ok(prompts.size >= 3, [...prompts].join(' | '));
});

/* ------------------------------------------------------------ "Let's back up" */

test('"Let\'s back up": two choices about this problem\'s first move, the right one among them, no answer in it', () => {
  for (const item of ITEMS) {
    const step = linearEquations.backUpQuestion(item.question);
    assert.ok(step, `${item.label}: a back-up question`);
    assert.equal(step.options.length, 2);
    assert.notEqual(step.options[0], step.options[1]);
    assert.ok(step.options.includes(step.correct), `${item.label}: the correct move is a choice`);
    const answers = answersFor(item);
    [step.prompt, ...step.options].forEach((line) => assert.equal(hintRevealsAnswer(line, answers), false, `${item.label}: "${line}"`));
    assert.equal(backUpStepFor(item.question).source, 'family', `${item.label}: the platform uses it`);
  }
  // 3x + 6 = 21: undo the + 6 before the × 3.
  const step = linearEquations.backUpQuestion(missingTools.questions[13]);
  assert.equal(step.prompt, 'Let’s back up. In $3x + 6 = 21$, which move comes first?');
  assert.deepEqual([...step.options].sort(), ['Divide both sides by $3$', 'Subtract $6$ from both sides']);
  assert.equal(step.correct, 'Subtract $6$ from both sides');
  // A formula: undo the added term before the multiplication.
  const literal = linearEquations.backUpQuestion(v5[1]);
  assert.equal(literal.correct, 'Subtract $c$ from both sides');
  assert.ok(literal.options.includes('Divide both sides by $b$'));
});
