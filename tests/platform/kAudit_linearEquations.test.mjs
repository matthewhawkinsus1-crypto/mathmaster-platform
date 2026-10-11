/*
 * JOB K AUDIT — THE linearEquations SUPPORT FAMILY, SWEPT.
 *
 * supportFamily_linearEquations.test.mjs checks the family on a few dozen real
 * items. This file draws hundreds of instances of every shape the family
 * claims (linear.twoStepEquation v1/v2, linear.multiStepEquation v1/v2 in every
 * case × distribution × number form, the legacy stepLinearEquation, algebra
 * and literalLinear generators) plus hand-made edge cases, and recomputes
 * every number with mathjs in exact fraction arithmetic — never with the
 * family's own parser or helpers.
 *
 * Defects this file pins (each test failed on the code before its fix):
 *   - a NEGATIVE answer leaked where a positive one could not: 3x - 5 = -20
 *     (x = −5) was quoted as "Undo the $- 5$", because the platform guard does
 *     not read "- 5" as −5. 3x + 5 = 20 (x = 5) already lost those spellings;
 *   - a legacy one-step draw "1 * x + 10 = 3" was quoted as "$1x + 10 = 3$";
 *   - parentheses with nothing in front, (x + 3) + 2 = 7 or (6x − 24)/7 once 7
 *     has cleared it, were "distribute: multiply $1$ by each term", and the
 *     back-up step offered "Subtract $3$ from both sides" as the WRONG move
 *     when it is a correct one there;
 *   - a literal sibling with a negative coefficient ended on
 *     "z = \frac{C - 11}{-1}"; the back-up distractor read "Subtract $-1$".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const toMath = (side) => latexToExpression(String(side).trim()).replace(/([A-Za-z])(?=[A-Za-z])/g, '$1*');

/** One side as a·v + b, exactly; throws unless linear in v. */
const sideForm = (side, variable, scope = {}) => {
  const node = math.parse(toMath(side));
  const at = (value) => F(node.evaluate({ ...scope, [variable]: F(value) }));
  const b = at(0);
  const a = math.subtract(at(1), b);
  assert.ok(math.equal(at(7), math.add(math.multiply(a, 7), b)), `${side} is linear in ${variable}`);
  return { a, b };
};
const solve = (left, right, variable) => {
  const L = sideForm(left, variable);
  const R = sideForm(right, variable);
  const a = math.subtract(L.a, R.a);
  const b = math.subtract(R.b, L.b);
  if (math.equal(a, 0)) return { case: math.equal(b, 0) ? 'all' : 'none' };
  return { case: 'one', value: math.divide(b, a) };
};

/** Every number a text states, signed: "$- 5$", "-5", "\frac{3}{4}", "3/4", "2.5". */
const numbersIn = (value) => {
  const out = [];
  const pattern = /(-\s*)?(?:\\frac\{(\d+)\}\{(\d+)\}|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?|\.\d+))/g;
  for (const match of String(value).replace(/−/g, '-').matchAll(pattern)) {
    const magnitude = match[2] ? F(`${match[2]}/${match[3]}`) : match[4] ? F(`${match[4]}/${match[5]}`) : F(match[6]);
    out.push(match[1] ? math.unaryMinus(magnitude) : magnitude);
  }
  return out;
};

const HYGIENE = [/\+\s*-/, /-\s*-/, /\+\s*\+/, /(^|[^\d.\\{])1(?=[a-z](?![a-z]))/, /NaN|undefined|Infinity|null|\[object/, /(^|[^\d.])-\s*0(?![.\d])/, /\{-/];

/* ------------------------------------------------------------ the instances */

const seat = (constraints, id, version, tool, index) => resolveFamilyQuestionInstance({
  question: { questionId: `k-${id}-${version}-${tool}-${JSON.stringify(constraints)}`, type: tool, prompt: 'Solve {{equation}}.', questionFamily: { id, version, tool, constraints } },
  assignmentId: 'k-audit-linear',
  storageIndex: 0,
  allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' },
}).question;

const PER_SHAPE = 24;
const range = (count) => Array.from({ length: count }, (_, index) => index);
const sweep = [];
for (const variable of ['x', 'n', 'm']) {
  for (const tool of ['stepAlgebra', 'multiAnswer']) {
    range(PER_SHAPE).forEach((index) => sweep.push({ label: `two v1 ${tool} ${variable}`, question: seat({ variable }, 'linear.twoStepEquation', 1, tool, index) }));
    range(PER_SHAPE).forEach((index) => sweep.push({ label: `multi v1 ${tool} ${variable}`, question: seat({ variable }, 'linear.multiStepEquation', 1, tool, index) }));
  }
}
for (const solutionCase of ['one', 'none', 'infinite', 'mixed']) {
  for (const distribute of [false, true]) {
    for (const coefficientForm of ['integer', 'fraction']) {
      const constraints = { solutionCase, distribute, coefficientForm, solutionForm: solutionCase === 'one' ? 'fraction' : 'integer' };
      range(PER_SHAPE / 2).forEach((index) => sweep.push({ label: `multi v2 ${JSON.stringify(constraints)}`, question: seat(constraints, 'linear.multiStepEquation', 2, 'stepAlgebra', index) }));
    }
  }
}
for (const distribute of [false, true]) {
  for (const coefficientForm of ['integer', 'fraction']) {
    for (const solutionForm of ['integer', 'fraction']) {
      range(PER_SHAPE / 2).forEach((index) => sweep.push({ label: `two v2 ${distribute} ${coefficientForm} ${solutionForm}`, question: seat({ distribute, coefficientForm, solutionForm }, 'linear.twoStepEquation', 2, 'stepAlgebra', index) }));
    }
  }
}
range(PER_SHAPE * 2).forEach((index) => {
  sweep.push({ label: 'legacy stepLinearEquation', question: generateQuestion({ type: 'stepAlgebra', prompt: 'Solve.', generator: { kind: 'stepLinearEquation' } }, `k${index}`) });
  sweep.push({ label: 'legacy one-step', question: generateQuestion({ type: 'stepAlgebra', prompt: 'Solve.', generator: { kind: 'stepLinearEquation', modifiedOneStep: true } }, `k${index}`) });
  sweep.push({ label: 'legacy algebra', question: generateQuestion({ type: 'algebra', prompt: 'Solve.', generator: {} }, `k${index}`) });
});
[
  '5 = 3x - 4', '-x + 4 = 9', '\\frac{x}{3} + 17 = 37', '1.2x + 6 = 30', '0.5x - 2.5 = 1', '-2(x - 3) + 5x = 4', '3x + 5 = 3x + 5',
  '2x + 1 = 2x + 7', '\\frac{2}{3}x - 4 = 6', '-\\frac{1}{2}x = 4', '4 = -x', '3x - 5 = -20', '-3x - 5 = 10', '2(x + 3) = 2',
  '\\frac{6x - 24}{7} = 12', '-4x + 2 = -2x - 8', '0 = 2x - 6', '3(x - 2) - (x + 4) = 0', '-(x - 5) = 8', '0.25x = 2',
  '2x - 3 = -3', '-x = -1', '\\frac{1}{2}(x + 4) = 3', '\\frac{x + 1}{2} = \\frac{x}{3}', '9 - x = 2x', '(x + 3) + 2 = 7', '5 + (2x - 1) = 10',
].forEach((equation) => sweep.push({ label: `hand ${equation}`, question: { type: 'stepAlgebra', equationLatex: equation, prompt: 'Solve the equation.' } }));

const equationOf = (question) => {
  if (question.leftExpression && question.rightExpression) return [question.leftExpression, question.rightExpression];
  if (typeof question.equationLatex === 'string') return question.equationLatex.split('=');
  if (typeof question.equation === 'string') return question.equation.split('=');
  if (question.type === 'algebra') return [`(${question.a})*x + (${question.b})`, `${question.c}`];
  return /\$([^$]*=[^$]*)\$/.exec(question.prompt)[1].split('=');
};
const variableOf = (question) => question.variable || /^([a-z]) =/.exec(question.answerFields?.[0]?.label || '')?.[1] || 'x';

/* ------------------------------------------------------------ the sibling, step by step */

/** Each worked step does exactly the move it names to the equation before it. */
const verifySiblingSteps = (label, sibling, variable) => {
  const prompt = /^Solve \$(.+)\$ for \$([A-Za-z])\$\.$/.exec(sibling.prompt);
  assert.ok(prompt, `${label}: ${sibling.prompt}`);
  assert.equal(prompt[2], variable, `${label}: the sibling solves for the same letter`);
  const answer = /^\$([A-Za-z]) = (.+)\$$/.exec(sibling.answer);
  const value = F(math.evaluate(toMath(answer[2])));
  const truth = solve(...prompt[1].split('='), variable);
  assert.ok(truth.case === 'one' && math.equal(truth.value, value), `${label}: ${sibling.answer} solves ${prompt[1]}`);
  let before = prompt[1].split('=');
  const term = (textValue) => {
    const isX = textValue.endsWith(variable);
    const coefficient = isX ? (textValue === variable ? F(1) : F(math.evaluate(toMath(textValue.slice(0, -1))))) : F(math.evaluate(toMath(textValue)));
    return { isX, coefficient };
  };
  sibling.steps.slice(0, -1).forEach((step) => {
    const shown = /\$([^$]*=[^$]*)\$\.?$/.exec(step);
    assert.ok(shown, `${label}: "${step}" shows the equation it reaches`);
    const after = shown[1].split('=');
    const P = before.map((side) => sideForm(side, variable));
    const C = after.map((side) => sideForm(side, variable));
    let expected;
    let match;
    if ((match = /^(Subtract|Add) \$(.+?)\$ (?:from|to) both sides/.exec(step))) {
      const { isX, coefficient } = term(match[2]);
      const signed = match[1] === 'Subtract' ? math.unaryMinus(coefficient) : coefficient;
      expected = P.map((side) => (isX ? { a: math.add(side.a, signed), b: side.b } : { a: side.a, b: math.add(side.b, signed) }));
    } else if ((match = /^Divide both sides by \$(.+?)\$/.exec(step))) {
      const by = F(math.evaluate(toMath(match[1])));
      expected = P.map((side) => ({ a: math.divide(side.a, by), b: math.divide(side.b, by) }));
    } else if ((match = /^Multiply every term on both sides by \$(.+?)\$/.exec(step))) {
      const by = F(math.evaluate(toMath(match[1])));
      expected = P.map((side) => ({ a: math.multiply(side.a, by), b: math.multiply(side.b, by) }));
    } else if (/^Switch the two sides/.test(step)) {
      expected = [P[1], P[0]];
    } else {
      assert.match(step, /^(Distribute|Combine)/, `${label}: a known move: ${step}`);
      expected = P;
    }
    expected.forEach((side, index) => assert.ok(math.equal(side.a, C[index].a) && math.equal(side.b, C[index].b), `${label}: "${step}" follows from ${before.join('=')}`));
    before = after;
  });
  const check = /^Check: with \$[a-z] = (.+?)\$, both sides of \$(.+)\$ equal \$(.+)\$\.$/.exec(sibling.steps.at(-1));
  assert.ok(check, `${label}: ends with a check: ${sibling.steps.at(-1)}`);
  assert.ok(math.equal(F(math.evaluate(toMath(check[2].split('=')[0]), { [variable]: value })), F(math.evaluate(toMath(check[3])))), `${label}: the check's value`);
  return value;
};

/* ------------------------------------------------------------ the sweep */

test('every swept instance: hints, back-up and sibling are true, clean, and never state the answer (sign included)', () => {
  const kinds = { one: 0, none: 0, all: 0 };
  for (const { label, question } of sweep) {
    assert.equal(linearEquations.matches(question) || (question.type === 'algebra' && question.a === 1 && question.b === 0), true, `${label}: matched`);
    if (!linearEquations.matches(question)) continue;
    const variable = variableOf(question);
    const truth = solve(...equationOf(question), variable);
    kinds[truth.case] += 1;
    const hints = linearEquations.hints(question);
    const backUp = linearEquations.backUpQuestion(question);
    assert.ok(hints.length >= 2, `${label}: hints`);
    assert.ok(backUp && backUp.options.includes(backUp.correct) && backUp.options[0] !== backUp.options[1], `${label}: back-up`);
    const told = [...hints, backUp.prompt, ...backUp.options];
    if (truth.case === 'one') {
      told.forEach((line) => assert.ok(!numbersIn(line).some((number) => math.equal(number, truth.value)), `${label}: "${line}" states ${truth.value.toFraction()}`));
    } else {
      told.forEach((line) => assert.doesNotMatch(line, /no solution|all real|infinitely|every real/i, `${label}: names the case`));
    }
    for (const seed of [0, 5]) {
      const sibling = linearEquations.similarProblem(question, { seed });
      if (!sibling) continue; // e.g. x - 3 + 14 = x - 15: no different draw keeps both ±1 coefficients
      const value = verifySiblingSteps(label, sibling, variable);
      if (truth.case === 'one') assert.ok(!math.equal(value, truth.value), `${label}: the sibling's answer differs`);
      [...sibling.steps, sibling.answer].forEach((line) => {
        if (truth.case === 'one') assert.ok(!numbersIn(line).some((number) => math.equal(number, truth.value)), `${label}: sibling "${line}" states ${truth.value.toFraction()}`);
      });
      assert.equal(similarExampleIsSafe(question, sibling), true, `${label}: similarExampleIsSafe`);
      told.push(sibling.prompt, ...sibling.steps, sibling.answer);
    }
    told.forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`)));
  }
  assert.ok(kinds.one > 500 && kinds.none > 30 && kinds.all > 30, JSON.stringify(kinds));
});

/* ------------------------------------------------------------ the defects, one by one */

test('a negative answer is guarded like a positive one: 3x - 5 = -20 never quotes "- 5"', () => {
  const question = { type: 'stepAlgebra', equationLatex: '3x - 5 = -20', prompt: 'Solve the equation.' };
  assert.ok(math.equal(solve('3x - 5', '-20', 'x').value, -5));
  const backUp = linearEquations.backUpQuestion(question);
  [...linearEquations.hints(question), backUp.prompt, ...backUp.options].forEach((line) => {
    assert.ok(!numbersIn(line).some((number) => math.equal(number, -5)), line);
  });
  // The numbers that are not the answer are still quoted.
  assert.ok(linearEquations.hints(question).some((hint) => /divide both sides by \$3\$/.test(hint)));
  assert.equal(backUp.correct, 'Add $5$ to both sides');
  // The positive twin, for symmetry: 3x + 5 = 20 has always been guarded.
  const positive = { type: 'stepAlgebra', equationLatex: '3x + 5 = 20', prompt: 'Solve the equation.' };
  linearEquations.hints(positive).forEach((hint) => assert.ok(!numbersIn(hint).some((number) => math.equal(math.abs(number), 5)), hint));
});

test('a legacy one-step draw "1 * x + 10 = 3" is quoted as x + 10 = 3', () => {
  const question = { type: 'stepAlgebra', leftExpression: '1 * x + 10', rightExpression: '3', equation: '1 * x + 10 = 3', prompt: 'Solve.' };
  const backUp = linearEquations.backUpQuestion(question);
  const lines = [...linearEquations.hints(question), backUp.prompt];
  assert.ok(lines.some((line) => line.includes('$x + 10 = 3$')), lines.join(' | '));
  lines.forEach((line) => assert.doesNotMatch(line, /1x/, line));
});

test('parentheses with nothing in front are removed, not "distributed by 1", and the back-up never calls a right move wrong', () => {
  for (const equation of ['(x + 3) + 2 = 7', '5 + (2x - 1) = 10', '\\frac{1}{2}(x + 4) = 3', '\\frac{6x - 24}{7} = 12']) {
    const question = { type: 'stepAlgebra', equationLatex: equation, prompt: 'Solve the equation.' };
    const hints = linearEquations.hints(question);
    hints.forEach((hint) => assert.doesNotMatch(hint, /multiply \$1\$|number in front of the parentheses/, `${equation}: ${hint}`));
    assert.ok(hints.some((hint) => /remove the parentheses/i.test(hint)), `${equation}: ${hints.join(' | ')}`);
    const backUp = linearEquations.backUpQuestion(question);
    backUp.options.forEach((option) => assert.doesNotMatch(option, /Distribute \$1\$/, `${equation}: ${option}`));
    // (x + 3) + 2 = 7: subtracting 3 from both sides is a correct move, so it may not be the wrong choice.
    if (equation === '(x + 3) + 2 = 7') {
      const wrong = backUp.options.find((option) => option !== backUp.correct);
      assert.doesNotMatch(wrong, /^(Subtract|Add) \$\d+\$/, wrong);
      assert.match(backUp.correct, /Remove the parentheses/);
    }
  }
});

test('a literal sibling with a negative coefficient ends on a clean, true formula', () => {
  const seen = [];
  for (const [formula, target] of [['T = 11 - 3k', 'k'], ['T = 4 - k', 'k'], ['P = -2ab + c', 'a']]) {
    const question = { type: 'literal', formulaLatex: formula, solveFor: target, prompt: `Solve $${formula}$ for $${target}$.` };
    for (const seed of range(8)) {
      const sibling = linearEquations.similarProblem(question, { seed });
      assert.ok(sibling, `${formula}: a sibling`);
      const prompt = /^Solve \$(.+) = (.+)\$ for \$([A-Za-z])\$\.$/.exec(sibling.prompt);
      const answer = /^\$([A-Za-z]) = (.+)\$$/.exec(sibling.answer);
      assert.equal(answer[1], prompt[3]);
      // No negative denominator, no "Subtract $-…$".
      [...sibling.steps.slice(-1), sibling.answer].forEach((line) => assert.doesNotMatch(line, /\{-|\/\s*\(?-/, line));
      // The answer satisfies the formula at several points.
      const letters = [...new Set(`${prompt[1]}${prompt[2]}`.match(/[A-Za-z]/g))].filter((letter) => letter !== prompt[3]);
      for (const salt of [1, 2, 3]) {
        const scope = Object.fromEntries(letters.map((letter, index) => [letter, F(`${index * 5 + salt * 3 + 2}/${(index % 3) + 2}`)]));
        const value = F(math.evaluate(toMath(answer[2]), scope));
        const left = F(math.evaluate(toMath(prompt[1]), { ...scope, [prompt[3]]: value }));
        const right = F(math.evaluate(toMath(prompt[2]), { ...scope, [prompt[3]]: value }));
        assert.ok(math.equal(left, right), `${sibling.answer} solves ${prompt[1]} = ${prompt[2]}`);
      }
      seen.push(sibling.answer);
    }
    const backUp = linearEquations.backUpQuestion(question);
    backUp.options.forEach((option) => assert.doesNotMatch(option, /Subtract \$-/, option));
  }
  assert.ok(seen.length >= 24);
  const tEqualsMinusK = linearEquations.backUpQuestion({ type: 'literal', formulaLatex: 'T = -k', solveFor: 'k', prompt: 'Solve $T = -k$ for $k$.' });
  tEqualsMinusK.options.forEach((option) => assert.doesNotMatch(option, /Subtract \$-/, option));
});
