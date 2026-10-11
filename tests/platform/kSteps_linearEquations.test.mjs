/*
 * JOB K — THE linearEquations FAMILY'S WORKED SOLUTION OF THE QUESTION ITSELF.
 *
 * workedSolution(question) is what the closed-question review panel shows
 * when an item has no authored solution steps (closedQuestionReview.js): the
 * worked solution of THIS equation, not a sibling's. This file draws every
 * shape the family claims — linear.twoStepEquation / linear.multiStepEquation
 * v1 and v2 in every case, distribution and number form (Step Algebra and
 * multiAnswer tools), the legacy stepLinearEquation / algebra / literalLinear
 * generators, the sample assignments' templates, the Path Step Algebra
 * templates, Step Algebra 2, slope-intercept rewrites, literal formulas and
 * formulas applied to a given value — plus hand-made edge cases (zero,
 * negative and fractional answers, decimals, no solution, all real numbers,
 * a negative or factored literal coefficient).
 *
 * Every step is read back from its TEXT and recomputed with mathjs in exact
 * Fraction arithmetic, never with the family's helpers: the equation a step
 * shows is the equation before it with the named move applied (both sides as
 * functions of every letter, at several rational points), the last step is
 * the key, and the shared grader (gradeResponseField, or the tool's own work
 * grader) marks the stated answer right. A no-solution / all-real-numbers
 * item ends on that conclusion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';
import { gradeToolWork, gradeWorkWithGrader } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { equationWorkspaceWork, relationWorkspaceWork, workGraderForQuestion } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { legacySolverWork, rewriteLinearFormWork } from '../../functions/shared/serverGrading/tools/stepAlgebra2.mjs';
import { parseRelationSource } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
// A formula's letters stand together (bh, Prt): mathjs needs the product spelled out.
// "h(b + c)" is a product, not a call.
const toMath = (side) => latexToExpression(String(side).trim()).replace(/([A-Za-z])(?=[A-Za-z])/g, '$1*').replace(/([A-Za-z0-9)])\s*\(/g, '$1*(');
const lettersOf = (...sides) => [...new Set(sides.join(' ').replace(/\\[a-z]+/g, ' ').match(/[A-Za-z]/g) || [])];
const valueOf = (latex, scope = {}) => F(math.evaluate(toMath(latex), scope));

/** left = right solved for `variable`, exactly (other letters fixed by `scope`). */
const solveLinear = (left, right, variable, scope = {}) => {
  const node = math.parse(`(${toMath(left)}) - (${toMath(right)})`);
  const at = (value) => F(node.evaluate({ ...scope, [variable]: F(value) }));
  const b = at(0);
  const a = math.subtract(at(1), b);
  assert.ok(math.equal(at(-3), math.add(math.multiply(a, -3), b)), `${left} = ${right} is linear in ${variable}`);
  if (math.equal(a, 0)) return { case: math.equal(b, 0) ? 'all' : 'none' };
  return { case: 'one', value: math.divide(math.unaryMinus(b), a) };
};

// Positive, distinct rationals: a divisor like b + c never vanishes.
const scopesFor = (letters) => [0, 1, 2].map((salt) => Object.fromEntries(letters.map((letter, index) => [letter, F(`${3 * index + 5 + 2 * salt}/${(index % 3) + 2 + salt}`)])));

/** "Every number a text states" is not enough here: the step's move is redone. */
const HYGIENE = [/\+\s*-/, /-\s*-/, /\+\s*\+/, /(^|[^\d.\\{])1(?=[a-z](?![a-z]))/, /NaN|undefined|Infinity|null|\[object/, /(^|[^\d.])-\s*0(?![.\d])/, /\{-/];

/** The equation a step reaches: the last $…=…$ in it. */
const shownEquation = (step) => {
  const match = /\$([^$]*=[^$]*)\$\.$/.exec(step);
  return match ? match[1].split('=').map((side) => side.trim()) : null;
};

/**
 * Walk the steps from the question's equation. Each step's equation must be
 * the one before it with the named move applied — compared as functions of
 * every letter at three rational points. Returns the last equation, or the
 * conclusion of a no-solution / all-real-numbers step.
 */
const walkSteps = (label, steps, start, letters, variable) => {
  const scopes = scopesFor(letters);
  const sides = (equation, scope) => equation.map((side) => valueOf(side, scope));
  const same = (one, two) => scopes.every((scope) => {
    const [p, q] = [sides(one.equation, scope), two(scope)];
    return math.equal(p[0], q[0]) && math.equal(p[1], q[1]);
  });
  let before = start;
  let conclusion = null;
  steps.forEach((step, index) => {
    const cancel = /^The \$([A-Za-z])\$-terms cancel, leaving \$(.+) = (.+)\$, which is (always|never) true: .*?(all real numbers|has no solution)\.$/.exec(step);
    if (cancel) {
      assert.equal(index, steps.length - 1, `${label}: the cancel step is the last one`);
      assert.equal(cancel[1], variable, label);
      // The equation before it has no variable left, and its sides are the two numbers quoted.
      scopes.forEach((scope) => {
        const moved = { ...scope, [variable]: math.add(scope[variable], 7) };
        const [p, q] = sides(before, scope);
        const [p2, q2] = sides(before, moved);
        assert.ok(math.equal(p, p2) && math.equal(q, q2), `${label}: "${before.join(' = ')}" still has ${variable}`);
        assert.ok(math.equal(p, valueOf(cancel[2])) && math.equal(q, valueOf(cancel[3])), `${label}: "${step}" quotes ${before.join(' = ')}`);
      });
      const always = math.equal(valueOf(cancel[2]), valueOf(cancel[3]));
      assert.equal(cancel[4], always ? 'always' : 'never', `${label}: ${step}`);
      assert.equal(cancel[5], always ? 'all real numbers' : 'has no solution', `${label}: ${step}`);
      conclusion = always ? 'all' : 'none';
      return;
    }
    const after = shownEquation(step);
    assert.ok(after && after.length === 2, `${label}: "${step}" shows the equation it reaches`);
    const current = { equation: after };
    const was = (scope) => sides(before, scope);
    let match;
    let ok;
    if ((match = /^Substitute \$([A-Za-z]) = (.+?)\$ into /.exec(step))) {
      const given = valueOf(match[2]);
      ok = same(current, (scope) => sides(before, { ...scope, [match[1]]: given }));
    } else if ((match = /^(Subtract|Add) \$(.+?)\$ (?:from|to) both sides/.exec(step))) {
      const term = (scope) => {
        const value = valueOf(match[2], scope);
        return match[1] === 'Subtract' ? math.unaryMinus(value) : value;
      };
      ok = same(current, (scope) => was(scope).map((side) => math.add(side, term(scope))));
    } else if ((match = /^(?:Divide both sides|Divide every term on both sides) by \$(.+?)\$/.exec(step))) {
      const by = (scope) => valueOf(match[1], scope);
      const divided = (scope) => was(scope).map((side) => math.divide(side, by(scope)));
      ok = same(current, divided) || same(current, (scope) => divided(scope).reverse());
    } else if ((match = /^Multiply (?:every term on )?both sides by \$(.+?)\$/.exec(step))) {
      const by = valueOf(match[1]);
      ok = same(current, (scope) => was(scope).map((side) => math.multiply(side, by)));
    } else if (/^(Switch the two sides|Write it with)/.test(step)) {
      ok = same(current, (scope) => was(scope).reverse());
    } else {
      assert.match(step, /^(Distribute|Combine|Factor)/, `${label}: a known move: ${step}`);
      ok = same(current, was);
    }
    assert.ok(ok, `${label}: "${step}" follows from $${before.join(' = ')}$`);
    before = after;
  });
  return { last: before, conclusion };
};

/* ------------------------------------------------------------ grading the stated answer */

const plain = (latex) => latexToExpression(String(latex).trim());

/** The shared grader marks the stated answer right, on the question's own grading path. */
const assertGraded = (label, question, { variable, answer, special, steps }) => {
  const isStepAlgebra2 = question.type === 'stepAlgebra2' || question.toolId === 'stepAlgebra2';
  let result;
  if (isStepAlgebra2 && question.mode === 'rewriteLinearForm') {
    const finished = { left: variable, right: plain(answer) };
    result = gradeToolWork({ toolId: 'stepAlgebra2', question, work: rewriteLinearFormWork(finished, [{ after: finished }]) });
  } else if (isStepAlgebra2) {
    // The legacy solver replays the balanced moves the steps name.
    const moves = steps.map((step) => {
      const move = /^(Subtract|Add) \$(.+?)\$ (?:from|to)|^Divide both sides by \$(.+?)\$|^Multiply every term on both sides by \$(.+?)\$/.exec(step);
      assert.ok(move, `${label}: a solver move: ${step}`);
      if (move[1]) return { operation: move[1].toLowerCase(), operand: Number(valueOf(move[2]).valueOf()) };
      if (move[3]) return { operation: 'divide', operand: Number(valueOf(move[3]).valueOf()) };
      return { operation: 'multiply', operand: Number(valueOf(move[4]).valueOf()) };
    });
    result = gradeToolWork({ toolId: 'stepAlgebra2', question, work: legacySolverWork(moves) });
  } else if (question.type === 'stepAlgebra') {
    const work = question.relationWorkspace
      ? relationWorkspaceWork({ relationState: special ? { special: special === 'all' ? 'allReals' : 'noSolution', branches: [] } : parseRelationSource(`${variable} = ${plain(answer)}`, variable) })
      : equationWorkspaceWork({ equation: { left: variable, right: plain(answer) } });
    result = gradeWorkWithGrader({ grader: workGraderForQuestion(question), question, work });
    // An item that also carries side micro-questions (algebraPrompts: "Expand
    // b(h + 2)") grades them as their own parts: the equation is the objective part.
    const objective = (result.parts || []).find((part) => part.id === 'algebra-objective');
    if (question.algebraPrompts?.length && objective) result = objective;
  } else if (question.type === 'multiAnswer') {
    const [field] = question.answerFields;
    result = gradeResponseField({ expected: field.answer, accepted: field.acceptedAnswers }, plain(answer));
  } else if (question.type === 'algebra') {
    result = gradeResponseField({ expected: String(question.generatedAnswer) }, plain(answer));
  } else {
    assert.equal(question.type, 'literal', label);
    result = gradeResponseField({ expected: question.acceptedAnswers[0], accepted: question.acceptedAnswers }, answer);
  }
  assert.equal(result.isCorrect, true, `${label}: the grader accepts ${answer || special} (${JSON.stringify(result.reason ?? result.parts ?? '')})`);
};

/** The key the question holds, read without the family. */
const keyOf = (question) => {
  if (question.solutionKey?.outcome && question.solutionKey.outcome !== 'value') return { special: question.solutionKey.outcome === 'allReals' ? 'all' : 'none' };
  const raw = question.answerFields?.[0]?.answer ?? question.solutionKey?.value ?? question.generatedAnswer ?? question.acceptedAnswers?.[0];
  return raw === undefined ? null : { raw: String(raw) };
};

/* ------------------------------------------------------------ the instances */

const isStepAlgebra2 = (question) => question.type === 'stepAlgebra2' || question.toolId === 'stepAlgebra2';
/** The equation the question shows, read without the family. */
const equationOf = (question) => {
  if (typeof question.leftExpression === 'string' && typeof question.rightExpression === 'string') return [question.leftExpression, question.rightExpression];
  for (const field of ['equationLatex', 'formulaLatex', 'formula']) if (typeof question[field] === 'string') return question[field].split('=');
  if (typeof question.equation === 'string') return question.equation.split('=');
  const abc = question.type === 'algebra' ? question : isStepAlgebra2(question) ? (question.equation || { a: 3, b: 6, c: 21 }) : null;
  if (abc) return [`(${abc.a})*x + (${abc.b})`, `${abc.c}`];
  return /\$([^$]*=[^$]*)\$/.exec(question.prompt)[1].split('=');
};

const seat = (constraints, id, version, tool, index) => resolveFamilyQuestionInstance({
  question: { questionId: `k-steps-${id}-${version}-${tool}-${JSON.stringify(constraints)}`, type: tool, prompt: 'Solve {{equation}}.', questionFamily: { id, version, tool, constraints } },
  assignmentId: 'k-steps-linear',
  storageIndex: 0,
  allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' },
}).question;

const PER_SHAPE = 10;
const range = (count) => Array.from({ length: count }, (_, index) => index);
const ITEMS = [];
const push = (label, question, kind = 'numeric') => ITEMS.push({ label, question, kind });
for (const variable of ['x', 'n']) {
  for (const tool of ['stepAlgebra', 'multiAnswer']) {
    range(PER_SHAPE).forEach((index) => push(`two v1 ${tool} ${variable}`, seat({ variable }, 'linear.twoStepEquation', 1, tool, index)));
    range(PER_SHAPE).forEach((index) => push(`multi v1 ${tool} ${variable}`, seat({ variable }, 'linear.multiStepEquation', 1, tool, index)));
  }
}
for (const solutionCase of ['one', 'none', 'infinite', 'mixed']) {
  for (const distribute of [false, true]) {
    for (const coefficientForm of ['integer', 'fraction']) {
      const constraints = { solutionCase, distribute, coefficientForm, solutionForm: solutionCase === 'one' ? 'fraction' : 'integer' };
      range(PER_SHAPE / 2).forEach((index) => push(`multi v2 ${JSON.stringify(constraints)}`, seat(constraints, 'linear.multiStepEquation', 2, 'stepAlgebra', index)));
    }
  }
}
for (const distribute of [false, true]) {
  for (const coefficientForm of ['integer', 'fraction']) {
    for (const solutionForm of ['integer', 'fraction']) {
      range(PER_SHAPE / 2).forEach((index) => push(`two v2 ${distribute} ${coefficientForm} ${solutionForm}`, seat({ distribute, coefficientForm, solutionForm }, 'linear.twoStepEquation', 2, 'stepAlgebra', index)));
    }
  }
}
range(PER_SHAPE).forEach((index) => {
  push('legacy stepLinearEquation', generateQuestion({ type: 'stepAlgebra', prompt: 'Solve.', generator: { kind: 'stepLinearEquation' } }, `ks${index}`));
  push('legacy one-step', generateQuestion({ type: 'stepAlgebra', prompt: 'Solve.', generator: { kind: 'stepLinearEquation', modifiedOneStep: true } }, `ks${index}`));
  push('legacy algebra', generateQuestion({ type: 'algebra', prompt: 'Solve.', generator: {} }, `ks${index}`));
  push('legacy literalLinear', generateQuestion({ type: 'literal', prompt: 'Solve the formula for the indicated variable.', generator: { kind: 'literalLinear' } }, `ks${index}`), 'literal');
});

// The real sample, Path, demo and V5 items supportFamily_linearEquations reads.
const variantsOf = (template) => (Array.isArray(template.variants) && template.variants.length
  ? template.variants.map((variant) => { const { variants: _variants, ...base } = template; return { ...base, ...variant }; })
  : [template]);
const generated = (template, keys) => variantsOf(template).flatMap((variant) => keys.map((key) => generateQuestion(variant, key)));
const KEYS = ['seat-1', 'seat-2'];
const recovery = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json').sections.flatMap((section) => section.questions)
  .filter((question) => linearEquations.LINEAR_EQUATION_FAMILY_IDS.includes(question.questionFamily?.id));
recovery.forEach((slot) => range(3).forEach((index) => push(`recovery ${slot.questionId}`, resolveFamilyQuestionInstance({
  question: slot, assignmentId: 'k-steps-recovery', storageIndex: 0, allocation: { seat: index, variant: 0, stride: 40, index, basis: 'seated' },
}).question)));
const guidedNotes = readJson('SAMPLE_GUIDED_NOTES_CLASSWORK.json');
const merged = readJson('SAMPLE_MERGED_FUNCTION_INVESTIGATION_ALGEBRA_QA.json');
generated(guidedNotes[0], KEYS).forEach((question) => push('guided notes balance', question));
generated(readJson('SAMPLE_PRACTICE_WITH_DOL.json')[0], KEYS).forEach((question) => push('practice with DOL', question));
generated(merged[6], KEYS).forEach((question) => push('numeric balance QA', question));
generated(guidedNotes[1], ['k']).forEach((question) => push('guided notes slope-intercept', question, 'line'));
generated(merged[4], ['k']).forEach((question) => push('slope-intercept QA', question, 'line'));
generated(merged[5], ['k']).forEach((question) => push('literal formula QA', question, 'literal'));
['algebra1', 'grade7', 'grade8'].flatMap((course) => readJson(`seed/pathQuestionBank/${course}_pathQuestionBank_seed.json`).documents)
  .filter((document) => document.type === 'stepAlgebra')
  .forEach((document) => KEYS.forEach((key) => push(`path ${document.id}`, generatePathInstanceWithRetries(document, key).question)));
const demo = readJson('src/demo/demoAssignmentBank.json').flatMap((assignment) => assignment.questions);
demo.filter((question) => question.type === 'algebra').forEach((question) => push(`demo ${question.questionId}`, question));
['phone-modeling-q4', 'college-readiness-q1', 'college-readiness-q2', 'college-readiness-q5', 'ccmr-practice-q2', 'ccmr-practice-q3']
  .forEach((questionId) => push(`demo ${questionId}`, demo.find((question) => question.questionId === questionId), 'applied'));
push('stepAlgebra2 sample', readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions[13]);
const v5 = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Linear equations (k steps)', courseId: 'algebra1', folder: 'Algebra I/Equations', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
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
}).package.sections[0].questions;
push('V5 stepAlgebra', v5[0]);
push('V5 literal', v5[1], 'literal');
push('V5 slope-intercept', v5[2], 'line');
push('V5 stepAlgebra2', v5[3]);

// Hand-made edges: a zero, negative and fractional answer, decimals, both special cases.
const EDGE_NUMERIC = [
  ['2x - 3 = -3', 'zero answer'], ['0 = 2x - 6', 'x on the right'], ['-x = -1', 'unit negative'], ['4 = -x', 'negative, swapped'],
  ['3x - 5 = -20', 'negative answer'], ['-2(x - 3) + 5x = 4', 'fraction answer'], ['\\frac{x + 1}{2} = \\frac{x}{3}', 'fractions both sides'],
  ['1.2x + 6 = 30', 'decimal'], ['0.5x - 2.5 = 1', 'decimal answer'], ['-\\frac{1}{2}x = 4', 'fraction coefficient'], ['9 - x = 2x', 'x both sides'],
  ['\\frac{6x - 24}{7} = 12', 'fraction bar'], ['3(x - 2) - (x + 4) = 0', 'negative group'], ['(x + 3) + 2 = 7', 'bare group'],
  ['2x + 1 = 2x + 7', 'no solution'], ['3x + 5 = 3x + 5', 'all real numbers'], ['2(x + 3) = 2x + 6', 'all reals, distributed'], ['-4x + 2 = -4x - 8', 'no solution, negative'],
];
EDGE_NUMERIC.forEach(([equation, name]) => push(`edge ${name}: ${equation}`, { type: 'stepAlgebra', equationLatex: equation, prompt: 'Solve the equation.', relationWorkspace: true }));
const EDGE_LITERAL = [
  ['T = 11 - 3k', 'k', 'negative coefficient'], ['T = 4 - k', 'k', 'unit negative coefficient'], ['A = \\frac{1}{2}bh', 'h', 'fraction to clear'],
  ['I = Prt', 't', 'a product of letters'], ['A = bh + ch', 'h', 'a coefficient to factor'], ['P = 2l + 2w', 'w', 'two terms'], ['y = mx + b', 'x', 'slope form for x'],
  ['ax + b = cx', 'x', 'letter on both sides'], ['S = 6x - 6', 'x', 'same numbers'],
];
EDGE_LITERAL.forEach(([formula, target, name]) => push(`edge literal ${name}: ${formula}`, { type: 'literal', formulaLatex: formula, solveFor: target, prompt: `Solve $${formula}$ for $${target}$.` }, 'literal'));
[['2x + 3y = 12', 'positive'], ['-4x + 2y = 10', 'negative x'], ['x - y = 3', 'negative unit y'], ['3x + 4y = 0', 'through the origin'], ['\\frac{1}{2}x + y = 3', 'fraction'], ['0.5x + 2y = 3', 'decimal']]
  .forEach(([equation, name]) => push(`edge line ${name}: ${equation}`, { type: 'stepAlgebra', equationLatex: equation, prompt: 'Rewrite in slope-intercept form.', variable: 'y', objective: { kind: 'slopeIntercept', variable: 'y' } }, 'line'));

/* ------------------------------------------------------------ the sweep */

const answerIn = (summary) => /\$([A-Za-z]) = (.+)\$\.$/.exec(summary);

test('every shape the family claims: the steps are this equation\'s, each follows, the last is the key, and the grader accepts it', () => {
  const kinds = {};
  for (const { label, question, kind } of ITEMS) {
    assert.ok(question, `${label}: generated`);
    assert.equal(linearEquations.matches(question), true, `${label}: matched`);
    const worked = linearEquations.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    assert.ok(worked.steps.length >= 1 && worked.headline && worked.answerSummary, label);
    [worked.headline, ...worked.steps, worked.answerSummary].forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`)));
    const [left, right] = equationOf(question);
    const key = keyOf(question);

    if (kind === 'numeric') {
      const variable = question.variable || /^\$?([a-z])\s*\$?\s*=/.exec(question.answerFields?.[0]?.label || '')?.[1] || lettersOf(left, right)[0] || 'x';
      const truth = solveLinear(left, right, variable);
      const { last, conclusion } = walkSteps(label, worked.steps, [left, right], [variable], variable);
      if (truth.case !== 'one') {
        assert.equal(conclusion, truth.case, `${label}: ends on the ${truth.case} conclusion`);
        if (key) assert.equal(key.special, truth.case, `${label}: the key's case`);
        assert.match(worked.answerSummary, truth.case === 'all' ? /^All real numbers/ : /^No solution/, label);
        assertGraded(label, question, { variable, special: truth.case, steps: worked.steps });
      } else {
        assert.equal(conclusion, null, label);
        assert.equal(last[0], variable, `${label}: the last step isolates ${variable}`);
        assert.ok(math.equal(valueOf(last[1]), truth.value), `${label}: the last step is ${variable} = ${truth.value.toFraction()}`);
        const stated = answerIn(worked.answerSummary);
        assert.ok(stated && stated[1] === variable && math.equal(valueOf(stated[2]), truth.value), `${label}: ${worked.answerSummary}`);
        if (key?.raw) assert.ok(math.equal(valueOf(key.raw), truth.value), `${label}: the key is the last step`);
        assertGraded(label, question, { variable, answer: stated[2], steps: worked.steps });
      }
    } else {
      const target = question.solveFor || question.objective?.variable || question.variable || 'y';
      const letters = lettersOf(left, right);
      const { last, conclusion } = walkSteps(label, worked.steps, [left, right], letters, target);
      assert.equal(conclusion, null, label);
      assert.equal(last[0], target, `${label}: the last step isolates ${target}`);
      assert.doesNotMatch(last[1], new RegExp(`(^|[^a-z])${target}([^a-z]|$)`), `${label}: ${target} is not in its own answer`);
      const stated = answerIn(worked.answerSummary);
      assert.ok(stated && stated[1] === target && stated[2] === last[1], `${label}: the summary states the last step: ${worked.answerSummary}`);
      // The answer makes the original formula true at every point.
      const others = letters.filter((letter) => letter !== target);
      if (kind === 'applied') {
        assert.ok(math.equal(valueOf(last[1]), valueOf(key.raw)), `${label}: ${last[1]} is the key ${key.raw}`);
      } else {
        scopesFor(others).forEach((scope) => {
          const value = valueOf(last[1], scope);
          assert.ok(math.equal(valueOf(left, { ...scope, [target]: value }), valueOf(right, { ...scope, [target]: value })), `${label}: ${target} = ${last[1]} solves ${left} = ${right}`);
          if (key?.raw) assert.ok(math.equal(valueOf(key.raw.replace(/^[a-z]\s*=/, ''), scope), value), `${label}: the key ${key.raw} is the last step`);
        });
      }
      if (kind === 'line') {
        assert.match(worked.steps.at(-1), /^Divide every term on both sides by|^(Subtract|Add) /, label);
        // y = mx + b: the x-term first, then the constant.
        assert.match(last[1], /^-?(\\frac\{\d+\}\{\d+\}|[\d.]+)?x( [+-] (\\frac\{\d+\}\{\d+\}|[\d.]+))?$/, `${label}: slope-intercept form: ${last[1]}`);
      }
      if (!(question.type === 'literal' && !question.acceptedAnswers)) assertGraded(label, question, { variable: target, answer: last[1], steps: worked.steps });
    }
    kinds[kind] = (kinds[kind] || 0) + 1;
  }
  assert.ok(kinds.numeric > 250 && kinds.literal >= 15 && kinds.line >= 8 && kinds.applied >= 6, JSON.stringify(kinds));
});

test('both special cases and every edge are covered by the sweep, ending on the conclusion', () => {
  const ends = ITEMS.filter(({ kind }) => kind === 'numeric').map(({ question }) => linearEquations.workedSolution(question).steps.at(-1));
  assert.ok(ends.filter((step) => step.endsWith('so the equation has no solution.')).length >= 20, 'no-solution items');
  assert.ok(ends.filter((step) => step.endsWith('so the solution is all real numbers.')).length >= 20, 'all-real-numbers items');
  const ws = (equation) => linearEquations.workedSolution({ type: 'stepAlgebra', equationLatex: equation, prompt: 'Solve.' });
  assert.equal(ws('2x - 3 = -3').steps.at(-1), 'Divide both sides by $2$: $x = 0$.');
  assert.equal(ws('2x + 1 = 2x + 7').steps.at(-1), 'The $x$-terms cancel, leaving $1 = 7$, which is never true: no value of $x$ makes the equation true, so the equation has no solution.');
  assert.equal(ws('-2(x - 3) + 5x = 4').answerSummary, 'The solution is $x = -\\frac{2}{3}$.');
  assert.equal(ws('1.2x + 6 = 30').steps.at(-1), 'Divide both sides by $1.2$: $x = 20$.');
  const literal = (formula, target) => linearEquations.workedSolution({ type: 'literal', formulaLatex: formula, solveFor: target, prompt: `Solve $${formula}$ for $${target}$.` });
  assert.equal(literal('T = 11 - 3k', 'k').steps.at(-1), 'Divide both sides by $-3$: $k = \\frac{11 - T}{3}$.');
  assert.equal(literal('A = bh + ch', 'h').steps.at(-1), 'Divide both sides by $\\left(b + c\\right)$: $h = \\frac{A}{b + c}$.');
  // Written as a student writes it: mx not xm, y - b not -b + y, Bh not hB.
  assert.deepEqual(literal('y = mx + b', 'm').steps, ['Subtract $b$ from both sides: $y - b = mx$.', 'Divide both sides by $x$: $m = \\frac{y - b}{x}$.']);
  assert.equal(literal('V = \\frac{1}{3}Bh', 'B').steps[0], 'Multiply both sides by $3$ to clear the fraction: $3V = Bh$.');
  // A group is distributed as its own step, never inside another move.
  assert.deepEqual(literal('P = 2(l + w)', 'l').steps.slice(0, 2), ['Distribute: $P = 2l + 2w$.', 'Subtract $2w$ from both sides: $P - 2w = 2l$.']);
  assert.deepEqual(literal('C = \\frac{5}{9}(F - 32)', 'F').steps.slice(0, 2), ['Distribute: $C = \\frac{5}{9}F - \\frac{160}{9}$.', 'Multiply both sides by $9$ to clear the fraction: $9C = 5F - 160$.']);
  const line = linearEquations.workedSolution({ type: 'stepAlgebra', equationLatex: 'y - 3 = 2(x - 1)', prompt: 'Rewrite in slope-intercept form.', variable: 'y', objective: { kind: 'slopeIntercept', variable: 'y' } });
  assert.deepEqual(line.steps, ['Distribute: $y - 3 = 2x - 2$.', 'Add $3$ to both sides: $y = 2x + 1$.']);
});

test('it returns null — never a wrong step — when the key disagrees with the equation shown, or the given value is not in the prompt', () => {
  const ws = linearEquations.workedSolution;
  // The right equation and key: a worked solution.
  assert.ok(ws({ type: 'stepAlgebra', equationLatex: '3x + 5 = 20', generatedAnswer: 5, prompt: 'Solve.' }));
  assert.equal(ws({ type: 'stepAlgebra', equationLatex: '3x + 5 = 20', generatedAnswer: 7, prompt: 'Solve.' }), null);
  assert.equal(ws({ type: 'stepAlgebra', equationLatex: '3x + 5 = 20', solutionKey: { outcome: 'noSolution' }, prompt: 'Solve.' }), null);
  assert.equal(ws({ type: 'stepAlgebra', equationLatex: '2x + 1 = 2x + 7', solutionKey: { outcome: 'allReals' }, prompt: 'Solve.' }), null);
  assert.equal(ws({ type: 'multiAnswer', prompt: 'Solve $-8x - 12 = -4$.', familyId: 'linear.twoStepEquation', answerFields: [{ id: 'solution', label: 'x =', answer: '1' }] }), null);
  assert.ok(ws({ type: 'literal', formulaLatex: 'C = 2n + 15', solveFor: 'n', acceptedAnswers: ['\\frac{C-15}{2}'] }));
  assert.equal(ws({ type: 'literal', formulaLatex: 'C = 2n + 15', solveFor: 'n', acceptedAnswers: ['\\frac{C+15}{2}'] }), null);
  assert.ok(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['5'], prompt: 'A bill is $50. How many GB were used?' }));
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['5'], prompt: 'A bill is $60. How many GB were used?' }), null);
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['6'], prompt: 'A bill is $50. How many GB were used?' }), null);
  // A prompt that quotes the formula: its constants are not a given value. Key 0
  // would imply C = 15, which only the formula says; key 5 implies the bill, $50.
  const quoting = 'A phone plan costs C = 15 + 7g dollars. A bill is $50. How many GB were used?';
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['0'], prompt: quoting }), null);
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['0'], prompt: 'A plan costs $C = 15 + 7 g$ dollars. A bill is $50.' }), null);
  // …however the prompt spells it.
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['0'], prompt: 'A plan costs C = 7g + 15 dollars. A bill is $50.' }), null);
  assert.equal(ws({ type: 'literal', formula: 'C=15+7g', solveFor: 'g', acceptedAnswers: ['5'], prompt: quoting }).steps[0], 'Substitute $C = 50$ into $C = 15 + 7g$: $50 = 15 + 7g$.');
  // A given equation that does not mention the unknown stays a given value.
  assert.equal(ws({ type: 'literal', formula: 'y=18+4x', solveFor: 'x', acceptedAnswers: ['8'], prompt: 'A fee model y = 18 + 4x gives y=50. How many units x were used?' }).steps.at(-1), 'Divide both sides by $4$: $x = 8$.');
  // Not this family's: nothing.
  assert.equal(ws({ type: 'system', equations: ['y = 2x + 1', 'y = -x + 4'], solution: [1, 3] }), null);
  assert.equal(ws(null), null);
});

test('it is reachable only from the closed review: no hint, back-up or sibling path calls it', () => {
  const source = executableSource(readFileSync(new URL('src/platform/supports/families/linearEquations.js', ROOT), 'utf8'));
  const sectionStart = source.indexOf('const nodeValue =');
  assert.ok(sectionStart > 0, 'the worked-solution section');
  // Everything shown while the item is open is defined before the section…
  for (const name of ['export const hints', 'export const backUpQuestion', 'export const similarProblem', 'export const expectedValues', 'export const matches']) {
    const at = source.indexOf(name);
    assert.ok(at > 0 && at < sectionStart, `${name} comes before the worked solution`);
  }
  // …and nothing before the section names a worked-solution function.
  const before = source.slice(0, sectionStart);
  assert.doesNotMatch(before, /workedSolution|numericWorked|literalWorked|appliedWorked|numericWorkedSteps/, 'an open-item path calls the worked solution');
  // The section adds exactly one export.
  assert.deepEqual([...source.slice(sectionStart).matchAll(/export const (\w+)/g)].map((match) => match[1]), ['workedSolution']);
});
