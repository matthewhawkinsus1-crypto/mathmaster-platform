/*
 * JOB K AUDIT — THE systems SUPPORT FAMILY, SWEPT.
 *
 * supportFamily_systems.test.mjs checks the family on about a hundred real
 * items. This file draws many more instances of every shape it claims —
 * systems.elimination / systems.substitution on both tools,
 * systems.algebraic2x2 in every case, form and method, the legacy
 * linearSystem generator, Systems Workspace lines and matrices (parallel and
 * identical included) — plus hand-made edge systems (x = 3, y = 4, fractional
 * and decimal coefficients), and recomputes every number with mathjs in exact
 * fraction arithmetic, reading the equations without the family's parser.
 *
 * Defects this file pins (each test failed on the code before its fix):
 *   - a NEGATIVE coordinate leaked where a positive one could not: for
 *     -x + y = 3, -5x - 2y = 8 (solution (−2, 1)) the hints quoted "- 2y",
 *     because the platform guard does not read "- 2" as −2, while a
 *     coordinate of 2 already sent "2y" to the plain wording;
 *   - a worked sibling with a zero coordinate printed "x - 0 = 6" and
 *     "-0 + 4(-6) = -24".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import * as systems from '../../src/platform/supports/families/systems.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const toMath = (latex) => latexToExpression(String(latex).trim()).replace(/·/g, '*').replace(/([0-9)])\s*\(/g, '$1*(');

/** a·X + b·Y = c, read by evaluating the equation (no family code). */
const formOf = (equation, [X, Y] = ['x', 'y']) => {
  const [left, right] = equation.split('=');
  const node = math.parse(`(${toMath(left)}) - (${toMath(right)})`);
  const at = (x, y) => F(node.evaluate({ [X]: F(x), [Y]: F(y) }));
  const constant = at(0, 0);
  const form = { a: math.subtract(at(1, 0), constant), b: math.subtract(at(0, 1), constant), c: math.unaryMinus(constant) };
  assert.ok(math.equal(at(3, 5), math.add(math.add(math.multiply(form.a, 3), math.multiply(form.b, 5)), constant)), `${equation} is linear`);
  return form;
};
const solveRows = ([r1, r2]) => {
  const det = math.subtract(math.multiply(r1.a, r2.b), math.multiply(r1.b, r2.a));
  if (math.equal(det, 0)) return { outcome: 'not one' };
  return {
    outcome: 'point',
    x: math.divide(math.subtract(math.multiply(r1.c, r2.b), math.multiply(r1.b, r2.c)), det),
    y: math.divide(math.subtract(math.multiply(r1.a, r2.c), math.multiply(r1.c, r2.a)), det),
  };
};

/** Every number a text states, signed: "- 2y" is −2, "\frac{3}{4}" is 3/4. */
const numbersIn = (value) => [...String(value).replace(/−/g, '-')
  .matchAll(/(-\s*)?(?:\\frac\{(\d+)\}\{(\d+)\}|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?|\.\d+))/g)]
  .map((match) => {
    const magnitude = match[2] ? F(`${match[2]}/${match[3]}`) : match[4] ? F(`${match[4]}/${match[5]}`) : F(match[6]);
    return match[1] ? math.unaryMinus(magnitude) : magnitude;
  });

const HYGIENE = [/\+\s*-/, /-\s*-(?!\))/, /\+\s*\+/, /(^|[^\d.\\{])1(?=[a-z](?![a-z]))/, /NaN|undefined|Infinity|null|\[object/, /(^|[^\d.(])-\s*0(?![.\d])/, /\{-/];

/* ------------------------------------------------------------ the instances */

const seat = (familyId, tool, constraints, authored, index) => {
  const resolved = resolveFamilyQuestionInstance({
    question: { questionId: `k-${familyId}-${tool}-${JSON.stringify(constraints)}-${JSON.stringify(authored)}`, type: tool, ...authored, questionFamily: { id: familyId, version: 1, tool, constraints } },
    assignmentId: 'k-audit-systems',
    storageIndex: 0,
    allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' },
  });
  assert.equal(resolved.error, null);
  return resolved.question;
};

const PER_SHAPE = 16;
const sweep = [];
for (let index = 0; index < PER_SHAPE; index += 1) {
  for (const tool of ['system', 'multiAnswer']) {
    sweep.push({ label: `elimination ${tool}`, question: seat('systems.elimination', tool, {}, {}, index) });
    sweep.push({ label: `elimination ${tool} matching`, question: seat('systems.elimination', tool, { requireMatchingCoefficient: true }, {}, index) });
    sweep.push({ label: `substitution ${tool}`, question: seat('systems.substitution', tool, {}, {}, index) });
  }
  for (const solutionCase of ['one', 'none', 'infinite', 'mixed']) {
    for (const method of [undefined, 'substitution', 'elimination']) {
      const solutionForm = index % 2 && ['one', 'mixed'].includes(solutionCase) ? 'fraction' : 'integer';
      sweep.push({ label: `algebraic2x2 ${solutionCase} ${solutionForm} ${method || 'any'}`, question: seat('systems.algebraic2x2', 'systemsWorkspace', { solutionCase, solutionForm }, method ? { method } : {}, index) });
    }
  }
  sweep.push({ label: 'legacy linearSystem', question: generateQuestion({ type: 'system', prompt: 'Solve the system.', generator: { kind: 'linearSystem' } }, `k${index}`) });
}
// Workspace lines and matrices from a fixed sequence: parallel and identical lines included.
const lines = [[2, -3, 2, -3], [2, 1, 2, 5], [1, 4, -1, 2], [-3, 0, 2, 5], [0.5, -3, -0.5, -3], [4, -2, -1, 8], [-2, 6, 3, -4], [1, 0, -1, 0], [5, -8, -5, 2]];
lines.forEach(([m1, b1, m2, b2]) => sweep.push({ label: `workspace lines ${m1},${b1},${m2},${b2}`, question: { type: 'systemsWorkspace', mode: 'linear', prompt: 'Graph both lines and find the solution.', system: { m1, b1, m2, b2 } } }));
const matrices = [[2, 1, 3, -4], [1, -1, 2, 5], [-3, 2, 4, -1], [6, 3, -2, 5], [1, 2, 3, 4], [-5, 4, 2, -3]];
matrices.forEach(([a11, a12, a21, a22], index) => {
  const [x, y] = [[3, 4], [-2, 0], [0, -5], [-1, -6], [5, -2], [-4, 3]][index];
  sweep.push({ label: `workspace matrix ${index}`, question: { type: 'systemsWorkspace', mode: 'matrix', prompt: 'Solve with the matrix.', matrix: { a11, a12, b1: a11 * x + a12 * y, a21, a22, b2: a21 * x + a22 * y } } });
});
[
  ['x = 3', 'y = 2x - 1'], ['y = 4', 'x + y = 10'], ['2x + 3y = 12', '4x + 6y = 24'], ['2x + 3y = 12', '4x + 6y = 20'], ['y = 2x + 1', 'y = 2x - 3'],
  ['x + y = 5', 'x - y = 1'], ['3x - 2y = 4', 'x + 4y = -8'], ['\\frac{1}{2}x + y = 3', 'x - y = 0'], ['0.5x + y = 2', 'x - 2y = 4'], ['y = -x', 'y = x + 4'],
  ['x = 2y + 1', '3x - y = 8'], ['2x = y', 'x + y = 9'], ['5x + 2y = 3', '3x + 7y = -13'], ['y = \\frac{1}{2}x + 1', 'y = -x + 4'], ['-x + y = 3', '-5x - 2y = 8'],
].forEach(([e1, e2]) => {
  sweep.push({ label: `system ${e1} ; ${e2}`, question: { type: 'system', prompt: `Solve the system: $${e1}$ and $${e2}$.`, equationsLatex: [e1, e2] } });
  sweep.push({ label: `workspace ${e1} ; ${e2}`, question: { type: 'systemsWorkspace', mode: 'algebraic', prompt: 'Solve the system.', equations: [e1, e2], variables: ['x', 'y'] } });
});

const rowsOf = (question) => {
  if (question.mode === 'linear') return [[question.system.m1, question.system.b1], [question.system.m2, question.system.b2]].map(([m, b]) => ({ a: F(-m), b: F(1), c: F(b) }));
  if (question.mode === 'matrix') return [[question.matrix.a11, question.matrix.a12, question.matrix.b1], [question.matrix.a21, question.matrix.a22, question.matrix.b2]].map(([a, b, c]) => ({ a: F(a), b: F(b), c: F(c) }));
  const equations = question.equationsLatex || question.equations || [...String(question.prompt).matchAll(/\$([^$]*=[^$]*)\$/g)].map((match) => match[1]);
  return equations.slice(0, 2).map((equation) => formOf(equation, question.variables || ['x', 'y']));
};

/* ------------------------------------------------------------ the sibling */

const verifySibling = (label, sibling, variables) => {
  const answer = /^\((.+), (.+)\)$/.exec(sibling.answer);
  assert.ok(answer, `${label}: ${sibling.answer}`);
  const point = { x: F(math.evaluate(toMath(answer[1]))), y: F(math.evaluate(toMath(answer[2]))) };
  const matrixRows = [...sibling.prompt.matchAll(/\[(-?\d+)\s+(-?\d+)\s*\|\s*(-?\d+)\]/g)];
  const rows = matrixRows.length === 2
    ? matrixRows.map((match) => ({ a: F(match[1]), b: F(match[2]), c: F(match[3]) }))
    : [...sibling.prompt.matchAll(/\$([^$]*=[^$]*)\$/g)].map((match) => formOf(match[1], variables));
  const truth = solveRows(rows);
  assert.ok(truth.outcome === 'point' && math.equal(truth.x, point.x) && math.equal(truth.y, point.y), `${label}: ${sibling.answer} solves ${sibling.prompt}`);
  // Every equation (or chain) a step writes is true at the sibling's solution.
  const scope = { [variables[0]]: point.x, [variables[1]]: point.y };
  sibling.steps.forEach((step) => [...step.matchAll(/\$([^$]+)\$/g)].forEach((match) => {
    const parts = match[1].split('=');
    if (parts.length < 2) return;
    const values = parts.map((part) => F(math.evaluate(toMath(part), scope)));
    values.forEach((value) => assert.ok(math.equal(value, values[0]), `${label}: "${step}" is true at the answer`));
  }));
  // A multiplied equation is that equation, times the multiplier.
  sibling.steps.forEach((step) => {
    const multiplied = /^Multiply the (first|second) equation by \$(.+?)\$: \$(.+)\$\.$/.exec(step);
    if (!multiplied) return;
    const by = F(math.evaluate(toMath(multiplied[2])));
    const shown = formOf(multiplied[3], variables);
    const row = rows[multiplied[1] === 'first' ? 0 : 1];
    ['a', 'b', 'c'].forEach((key) => assert.ok(math.equal(math.multiply(row[key], by), shown[key]), `${label}: ${step}`));
  });
  return point;
};

/* ------------------------------------------------------------ the sweep */

test('every swept system: hints, back-up and sibling are true, clean, and never state a coordinate (sign included)', () => {
  let points = 0;
  for (const { label, question } of sweep) {
    assert.equal(systems.matches(question), true, `${label}: matched`);
    const rows = rowsOf(question);
    const truth = solveRows(rows);
    const variables = question.variables || ['x', 'y'];
    const hints = systems.hints(question);
    const backUp = systems.backUpQuestion(question);
    assert.ok(hints.length >= 2, `${label}: hints`);
    assert.ok(backUp.options.includes(backUp.correct) && backUp.options[0] !== backUp.options[1], `${label}: back-up`);
    const told = [...hints, backUp.prompt, ...backUp.options];
    if (truth.outcome === 'point') {
      points += 1;
      told.forEach((line) => assert.ok(!numbersIn(line).some((number) => math.equal(number, truth.x) || math.equal(number, truth.y)),
        `${label}: "${line}" states a coordinate of (${truth.x.toFraction()}, ${truth.y.toFraction()})`));
    }
    if (question.type === 'systemsWorkspace' || truth.outcome !== 'point') {
      told.forEach((line) => assert.doesNotMatch(line.replace('a single point, never meet, or lie on top of each other', ''), /one solution|no solution|infinitely many|never meet|parallel|same line/i, `${label}: names an outcome`));
    }
    // An "add / subtract the equations" back-up step is right about THIS system.
    if (/^(Add the two|Subtract the second)/.test(backUp.correct)) {
      const add = backUp.correct.startsWith('Add');
      assert.ok(['a', 'b'].some((key) => !math.equal(rows[0][key], 0)
        && (add ? math.equal(math.add(rows[0][key], rows[1][key]), 0) : math.equal(rows[0][key], rows[1][key]))), `${label}: ${backUp.correct}`);
    }
    for (const seed of [0, 3]) {
      const sibling = systems.similarProblem(question, { seed });
      assert.ok(sibling, `${label}: a sibling`);
      const point = verifySibling(label, sibling, variables);
      if (truth.outcome === 'point') {
        assert.ok(!(math.equal(point.x, truth.x) && math.equal(point.y, truth.y)), `${label}: a different answer`);
        [sibling.prompt, ...sibling.steps, sibling.answer].forEach((line) => assert.ok(!numbersIn(line).some((number) => math.equal(number, truth.x) || math.equal(number, truth.y)), `${label}: sibling "${line}"`));
      }
      assert.equal(similarExampleIsSafe(question, sibling), true, `${label}: similarExampleIsSafe`);
      told.push(sibling.prompt, ...sibling.steps, sibling.answer);
    }
    told.forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`)));
  }
  assert.ok(points > 180, `${points} one-solution systems`);
});

/* ------------------------------------------------------------ the defects, one by one */

test('a negative coordinate is guarded like a positive one: (−2, 1) never quotes "- 2y"', () => {
  const question = { type: 'system', prompt: 'Solve the system: $-x + y = 3$ and $-5x - 2y = 8$.', equationsLatex: ['-x + y = 3', '-5x - 2y = 8'] };
  const truth = solveRows(rowsOf(question));
  assert.ok(math.equal(truth.x, -2) && math.equal(truth.y, 1));
  const backUp = systems.backUpQuestion(question);
  [...systems.hints(question), backUp.prompt, ...backUp.options].forEach((line) => {
    assert.ok(!numbersIn(line).some((number) => math.equal(number, -2)), line);
  });
  // A family instance of the same kind: the guard reads the key, not only the prompt.
  const instance = seat('systems.elimination', 'system', {}, {}, 0);
  assert.ok(systems.hints(instance).length >= 3);
});

test('a worked sibling with a zero coordinate writes (0), never "- 0" or "-0"', () => {
  const zeros = [];
  const questions = [
    { type: 'system', prompt: 'Solve the system: $x + y = 5$ and $x - y = 1$.', equationsLatex: ['x + y = 5', 'x - y = 1'] },
    { type: 'system', prompt: 'Solve the system by elimination: $3x - 2y = 4$ and $x + 4y = -8$.', equationsLatex: ['3x - 2y = 4', 'x + 4y = -8'] },
    { type: 'system', prompt: 'Solve the system: $y = 2x + 1$ and $3x + 2y = 9$.', equationsLatex: ['y = 2x + 1', '3x + 2y = 9'] },
  ];
  for (const question of questions) {
    for (let seed = 0; seed < 80; seed += 1) {
      const sibling = systems.similarProblem(question, { seed });
      if (!/\(0,|, 0\)/.test(sibling.answer)) continue;
      verifySibling('zero coordinate', sibling, ['x', 'y']);
      zeros.push(sibling);
      sibling.steps.forEach((step) => assert.doesNotMatch(step, /(^|[^\d.(])-\s*0(?![.\d])/, step));
    }
  }
  assert.ok(zeros.length >= 5, `${zeros.length} siblings with a zero coordinate`);
});
