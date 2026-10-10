/*
 * JOB K — THE systems FAMILY'S WORKED SOLUTION OF THE QUESTION ITSELF.
 *
 * workedSolution(question) is what the closed-question review panel shows
 * when a system has no authored solution steps (closedQuestionReview.js): the
 * question's OWN two equations worked by the method its hints already name
 * (substitution, setting two expressions equal, elimination, row operations,
 * graphing). This file draws every shape the family claims —
 * systems.elimination / systems.substitution on both tools,
 * systems.algebraic2x2 in every case, form and method, the legacy
 * linearSystem generator and sample items, Systems Workspace lines (parallel,
 * identical, horizontal) and matrices, the V5 fixture and the A.5C Path
 * templates — plus hand-made edges (x = 3, y = 4, a zero coordinate,
 * fractions, decimals, no solution, infinitely many).
 *
 * Each step is read back from its TEXT and recomputed with mathjs in exact
 * Fraction arithmetic, never with the family's helpers:
 *   - one solution: every step's stated move is redone on the equation it
 *     acts on (walkSystem: the stated multiplier, the stated add / subtract /
 *     divide on both sides, the stated combination, the substituted
 *     expression), every equation or chain a step writes is also true at the
 *     solution, and the last step is the key;
 *   - no solution / infinitely many: the multipliers and the add-or-subtract
 *     the steps name are redone, and both variables must cancel to the stated
 *     "0 = C"; the last step is the conclusion;
 *   - the shared grader (gradeResponseField, or gradeToolWork for the Systems
 *     Workspace) marks the stated answer right;
 *   - the text has no "+ -3", "1x", "--", "-0", NaN or undefined.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as systems from '../../src/platform/supports/families/systems.js';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileCapabilityFixture } from '../../src/platform/certification/capabilityFixtureRuntime.js';
import { INTERACTIVE_CAPABILITY_FIXTURES } from '../../src/platform/certification/interactiveCapabilityManifest.js';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const toMath = (latex) => latexToExpression(String(latex).trim()).replace(/·/g, '*').replace(/([0-9)])\s*\(/g, '$1*(');
const valueOf = (latex, scope = {}) => F(math.evaluate(toMath(latex), scope));

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
const sameForm = (p, q) => ['a', 'b', 'c'].every((key) => math.equal(p[key], q[key]));
const scaled = (row, k) => ({ a: math.multiply(row.a, k), b: math.multiply(row.b, k), c: math.multiply(row.c, k) });
const solveRows = ([r1, r2]) => {
  const det = math.subtract(math.multiply(r1.a, r2.b), math.multiply(r1.b, r2.a));
  if (math.equal(det, 0)) {
    // Dependent rows: one solution set (the same line) or none.
    const consistent = math.equal(math.subtract(math.multiply(r1.a, r2.c), math.multiply(r1.c, r2.a)), 0)
      && math.equal(math.subtract(math.multiply(r1.b, r2.c), math.multiply(r1.c, r2.b)), 0);
    return { outcome: consistent ? 'infinite' : 'none' };
  }
  return {
    outcome: 'point',
    x: math.divide(math.subtract(math.multiply(r1.c, r2.b), math.multiply(r1.b, r2.c)), det),
    y: math.divide(math.subtract(math.multiply(r1.a, r2.c), math.multiply(r1.c, r2.a)), det),
  };
};

// A stored sample item names its tool with toolId instead of type.
const typeOf = (question) => question.type || question.toolId;
const rowsOf = (question) => {
  if (typeOf(question) === 'systemsWorkspace' && question.system && (question.mode === 'linear' || !question.mode)) {
    return [[question.system.m1, question.system.b1], [question.system.m2, question.system.b2]].map(([m, b]) => ({ a: F(-m), b: F(1), c: F(b) }));
  }
  if (question.mode === 'matrix') return [[question.matrix.a11, question.matrix.a12, question.matrix.b1], [question.matrix.a21, question.matrix.a22, question.matrix.b2]].map(([a, b, c]) => ({ a: F(a), b: F(b), c: F(c) }));
  const equations = question.equationsLatex || question.equations || [...String(question.prompt).matchAll(/\$([^$]*=[^$]*)\$/g)].map((match) => match[1]);
  return equations.slice(0, 2).map((equation) => formOf(equation, question.variables || ['x', 'y']));
};

const HYGIENE = [/(^|[^\d.\\{}])1\(/, /\+\s*-/, /-\s*-(?!\))/, /\+\s*\+/, /(^|[^\d.\\{])1(?=[a-z](?![a-z]))/, /NaN|undefined|Infinity|null|\[object/, /(^|[^\d.(])-\s*0(?![.\d])/, /\{-/];

/*
 * Every one-solution step redone from its stated move, never from the truth
 * alone (an equation can be true at the solution and still not follow from the
 * step before it). `rows` are the two equations as a·X + b·Y = c; each move is
 * checked against the equation(s) it acts on:
 *   - "Multiply the first equation by $k$" is k times the current row (the
 *     stated k, not whatever ratio the shown row has);
 *   - "Add the equations" / "Subtract the second equation from the first" /
 *     "Replace the second row with …" is that combination of the current
 *     (multiplied) rows;
 *   - "Add / Subtract $N$ … both sides" and "Divide both sides by $A$" are the
 *     previous equation with N added to / subtracted from / A dividing BOTH
 *     sides, compared side by side as functions;
 *   - "Distribute" / "Combine" keep both sides the same functions;
 *   - "Substitute $E$ for $v$ in the … equation" is that row with v replaced by
 *     the expression the solve-for step isolated;
 *   - "Substitute $w = k$ into …" puts that value into what it names.
 * An unknown step fails: the vocabulary is the family's, closed.
 */
const SCOPES = [[F('2/3'), F('-5/7')], [F(3), F('11/2')], [F(-4), F('1/3')]];
const walkSystem = (label, rows, worked, variables) => {
  const [X, Y] = variables;
  const scopeOf = ([x, y]) => ({ [X]: x, [Y]: y });
  const residual = (form, scope) => math.subtract(math.add(math.multiply(form.a, scope[X]), math.multiply(form.b, scope[Y])), form.c);
  const sidesOf = (equation) => {
    const parts = equation.split('=');
    assert.equal(parts.length, 2, `${label}: "${equation}" is one equation`);
    return parts;
  };
  const sideValues = (sides, scope) => sides.map((side) => valueOf(side, scope));
  const sameSides = (after, expected) => SCOPES.every((point) => {
    const scope = scopeOf(point);
    const [p, q] = sideValues(after, scope);
    const [r, s] = expected(scope);
    return math.equal(p, r) && math.equal(q, s);
  });
  const sameResidual = (equation, expected) => SCOPES.every((point) => {
    const scope = scopeOf(point);
    const [p, q] = sideValues(sidesOf(equation), scope);
    return math.equal(math.subtract(p, q), expected(scope));
  });
  const proportional = (equation, form) => {
    const shown = formOf(equation, variables);
    const ratio = math.equal(form.a, 0) ? math.divide(shown.b, form.b) : math.divide(shown.a, form.a);
    return !math.equal(ratio, 0) && sameForm(shown, scaled(form, ratio));
  };
  const index = (word) => (word === 'first' ? 0 : 1);
  const lastEquation = (step) => [...step.matchAll(/\$([^$]+)\$/g)].map((match) => match[1]).filter((segment) => segment.split('=').length === 2).at(-1);
  const current = [...rows];
  const multiplier = [F(1), F(1)];
  let previous = null;
  let isolated = null;
  let graphed = 0;
  worked.steps.forEach((step, at) => {
    let match;
    const after = lastEquation(step);
    const ok = (condition) => assert.ok(condition, `${label}: "${step}" does not follow (step ${at + 1})`);
    if ((match = /^Write the (first|second) equation with the variables on the left: \$(.+)\$\.$/.exec(step))) {
      ok(sameForm(formOf(match[2], variables), current[index(match[1])]));
    } else if ((match = /^Multiply the (first|second) equation by \$(.+?)\$ to clear the fractions: \$(.+)\$\.$/.exec(step))) {
      const row = index(match[1]);
      const shown = formOf(match[3], variables);
      ok(sameForm(shown, scaled(current[row], valueOf(match[2]))));
      current[row] = shown;
    } else if ((match = /^(?:Line up the equations|Read each row as an equation): \$(.+)\$ and \$(.+)\$\.$/.exec(step))) {
      ok(sameForm(formOf(match[1], variables), current[0]) && sameForm(formOf(match[2], variables), current[1]));
    } else if ((match = /^Multiply the (first|second) equation by \$(.+?)\$: \$(.+)\$\.$/.exec(step))) {
      const row = index(match[1]);
      multiplier[row] = valueOf(match[2]);
      ok(sameForm(formOf(match[3], variables), scaled(current[row], multiplier[row])));
    } else if (/^(?:The \$\w\$-terms.*(?:Add the equations|Subtract the second equation from the first)|Add the equations|Subtract the second equation from the first)/.test(step)) {
      const sign = /Add the equations/.test(step) ? 1 : -1;
      const combined = ['a', 'b', 'c'].reduce((out, key) => ({ ...out, [key]: math.add(math.multiply(current[0][key], multiplier[0]), math.multiply(math.multiply(current[1][key], multiplier[1]), sign)) }), {});
      ok(sameForm(formOf(after, variables), combined));
      previous = sidesOf(after);
    } else if ((match = /^Replace the second row with (?:(\S+)·)?\(first row\) ([+-]) (?:(\S+)·)?\(second row\)\./.exec(step))) {
      const [k1, k2] = [match[1] ? valueOf(match[1]) : F(1), match[3] ? valueOf(match[3]) : F(1)];
      const sign = match[2] === '+' ? 1 : -1;
      const combined = ['a', 'b', 'c'].reduce((out, key) => ({ ...out, [key]: math.add(math.multiply(current[0][key], k1), math.multiply(math.multiply(current[1][key], k2), sign)) }), {});
      ok(sameForm(formOf(after, variables), combined));
      previous = sidesOf(after);
    } else if ((match = /^(Add|Subtract) \$(.+?)\$ (?:to|from) both sides: \$(.+)\$\.$/.exec(step))) {
      ok(previous);
      const term = (scope) => (match[1] === 'Add' ? valueOf(match[2], scope) : math.unaryMinus(valueOf(match[2], scope)));
      const before = previous;
      ok(sameSides(sidesOf(match[3]), (scope) => sideValues(before, scope).map((side) => math.add(side, term(scope)))));
      previous = sidesOf(match[3]);
    } else if ((match = /^Divide both sides by \$(.+?)\$: \$(.+)\$\.$/.exec(step))) {
      ok(previous);
      const by = valueOf(match[1]);
      const before = previous;
      ok(sameSides(sidesOf(match[2]), (scope) => sideValues(before, scope).map((side) => math.divide(side, by))));
      previous = sidesOf(match[2]);
    } else if ((match = /^(?:Distribute|Combine the \$\w\$-terms): \$(.+)\$\.$/.exec(step))) {
      ok(previous);
      const before = previous;
      ok(sameSides(sidesOf(match[1]), (scope) => sideValues(before, scope)));
      previous = sidesOf(match[1]);
    } else if ((match = /^(?:Solve the (first|second) equation for \$\w\$: |The (first|second) equation already gives )\$[^$]+\$\.$/.exec(step))) {
      const row = index(match[1] || match[2]);
      const equation = lastEquation(step);
      const [v, expression] = sidesOf(equation).map((side) => side.trim());
      ok(v.length === 1 && variables.includes(v) && !new RegExp(`(^|[^a-z])${v}([^a-z]|$)`).test(expression));
      ok(proportional(equation, current[row]));
      isolated = { v, expression };
    } else if ((match = /^Substitute \$(.+?)\$ for \$(\w)\$ in the (first|second) equation: \$(.+)\$\.$/.exec(step))) {
      ok(isolated && isolated.v === match[2]);
      const w = variables.find((name) => name !== match[2]);
      // The quoted expression is the isolated one…
      ok(SCOPES.every((point) => math.equal(valueOf(match[1], scopeOf(point)), valueOf(isolated.expression, scopeOf(point)))));
      // …and the result is that row with v replaced by it.
      const row = current[index(match[3])];
      ok(sameResidual(match[4], (scope) => residual(row, { ...scope, [match[2]]: valueOf(match[1], scope) })));
      ok(!new RegExp(`(^|[^a-z])${match[2]}([^a-z]|$)`).test(match[4]) && w);
      previous = sidesOf(match[4]);
    } else if ((match = /^Substitute \$(\w) = (.+?)\$ into \$(\w) = (.+?)\$: \$(\w) = (.+?) = (.+)\$\.$/.exec(step))) {
      // w = value into v = expression: the middle is the expression at that value.
      const scope = { [match[1]]: valueOf(match[2]) };
      ok(math.equal(valueOf(match[6], scope), valueOf(match[4], { ...scope, [match[3]]: F(0) })) && match[5] === match[3]);
      ok(!isolated || SCOPES.every((point) => math.equal(valueOf(match[4], scopeOf(point)), valueOf(isolated.expression, scopeOf(point)))) || /set the right sides equal|Graph/.test(worked.steps.join(' ')));
      if (/set the right sides equal/.test(worked.steps.join(' '))) {
        // A set-equal / graph solution substitutes into the first line.
        ok(SCOPES.every((point) => {
          const s = scopeOf(point);
          return math.equal(residual(rows[0], { ...s, [match[3]]: valueOf(match[4], s) }), 0);
        }));
      }
    } else if ((match = /^Substitute \$(\w) = (.+?)\$ into the first (?:equation|row's equation): \$(.+?)\$, so \$(.+?)\$(?:, and \$(.+?)\$)?\.$/.exec(step))) {
      const known = { [match[1]]: valueOf(match[2]) };
      const v = variables.find((name) => name !== match[1]);
      const atV = (scope) => ({ ...scope, ...known });
      ok(sameResidual(match[3], (scope) => residual(current[0], atV(scope))));
      ok(sameResidual(match[4], (scope) => residual(current[0], atV(scope))));
      ok(!new RegExp(`(^|[^a-z])${match[1]}([^a-z]|$)`).test(match[3]) && v);
    } else if ((match = /^The (first|second) (?:equation|row's equation) has (?:no \$\w\$-term|only \$\w\$ in it): \$(.+?)\$/.exec(step))) {
      ok(sameForm(formOf(match[2], variables), current[index(match[1])]));
    } else if ((match = /^The (first|second) equation gives \$(.+?)\$ directly\.$/.exec(step))) {
      ok(proportional(match[2], rows[index(match[1])]));
    } else if ((match = /^Both equations give \$\w\$, so set the right sides equal: \$(.+)\$\.$/.exec(step))
      || (match = /set the right sides equal: \$(.+)\$\.$/.exec(step))) {
      const v = /^Both equations give \$(\w)\$/.exec(step)?.[1] || Y;
      const [e1, e2] = sidesOf(match[1]);
      // Each side is its own equation solved for v.
      [[e1, rows[0]], [e2, rows[1]]].forEach(([expression, row]) => ok(SCOPES.every((point) => {
        const scope = scopeOf(point);
        return math.equal(residual(row, { ...scope, [v]: valueOf(expression, scope) }), 0);
      })));
      previous = [e1, e2];
    } else if ((match = /^Graph \$y = (.+?)\$: start at its y-intercept, \$(.+?)\$, and use the slope \$(.+?)\$\.$/.exec(step))) {
      const row = rows[graphed];
      graphed += 1;
      const at = (x) => valueOf(match[1], { x: F(x) });
      ok(math.equal(at(0), valueOf(match[2])) && math.equal(math.subtract(at(1), at(0)), valueOf(match[3])));
      ok(SCOPES.every((point) => math.equal(residual(row, { x: point[0], y: at(point[0]) }), 0)));
    } else {
      assert.match(step, /^(Check in the (first|second|other) equation|So the solution of the system is)/, `${label}: a known move: ${step}`);
    }
  });
};

/* ------------------------------------------------------------ the instances */

const seat = (familyId, tool, constraints, authored, index) => {
  const resolved = resolveFamilyQuestionInstance({
    question: { questionId: `k-steps-${familyId}-${tool}-${JSON.stringify(constraints)}-${JSON.stringify(authored)}`, type: tool, ...authored, questionFamily: { id: familyId, version: 1, tool, constraints } },
    assignmentId: 'k-steps-systems',
    storageIndex: 0,
    allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' },
  });
  assert.equal(resolved.error, null);
  return resolved.question;
};

const PER_SHAPE = 10;
const ITEMS = [];
const push = (label, question) => ITEMS.push({ label, question });
for (let index = 0; index < PER_SHAPE; index += 1) {
  for (const tool of ['system', 'multiAnswer']) {
    push(`elimination ${tool}`, seat('systems.elimination', tool, {}, {}, index));
    push(`elimination ${tool} matching`, seat('systems.elimination', tool, { requireMatchingCoefficient: true }, {}, index));
    push(`substitution ${tool}`, seat('systems.substitution', tool, {}, {}, index));
  }
  for (const solutionCase of ['one', 'none', 'infinite', 'mixed']) {
    for (const method of [undefined, 'substitution', 'elimination']) {
      const solutionForm = index % 2 && ['one', 'mixed'].includes(solutionCase) ? 'fraction' : 'integer';
      push(`algebraic2x2 ${solutionCase} ${solutionForm} ${method || 'any'}`, seat('systems.algebraic2x2', 'systemsWorkspace', { solutionCase, solutionForm }, method ? { method } : {}, index));
    }
  }
  push('legacy linearSystem', generateQuestion({ type: 'system', prompt: 'Solve the system.', generator: { kind: 'linearSystem' } }, `ks${index}`));
}
// The sample assignments, the V5 fixture and the A.5C Path templates supportFamily_systems reads.
{
  const slot = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json').sections.flatMap((section) => section.questions).find((question) => question.questionId === 'dol-system');
  for (let index = 0; index < 3; index += 1) {
    push(`sample recovery dol-system #${index}`, resolveFamilyQuestionInstance({
      question: { ...slot, questionFamily: { ...slot.questionFamily, tool: 'system' } }, assignmentId: 'k-steps-recovery', storageIndex: 0,
      allocation: { seat: index, variant: 0, stride: 40, index, basis: 'seated' },
    }).question);
  }
  for (const [file, pick] of [['SAMPLE_PRACTICE_WITH_DOL.json', (json) => json[1]], ['SAMPLE_LOCAL_PERSISTENCE_RESUME_SOLUTION_QA.json', (json) => json[4]]]) {
    for (let variant = 0; variant < 3; variant += 1) push(`${file} variant ${variant}`, generateQuestion(pick(readJson(file)), `${file}|variant:${variant}`));
  }
  const batchA = readJson('SAMPLE_BATCH_A_DEEP_DIVE.json').questions;
  const missing = readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions;
  push('batch A linear', batchA[3]);
  push('missing tools linear (no mode)', missing[2]);
  push('batch A matrix', batchA[6]);
  push('V5 systems-substitution fixture', compileCapabilityFixture(INTERACTIVE_CAPABILITY_FIXTURES.find((fixture) => fixture.id === 'systems-substitution')));
  const documents = readJson('drafts/fidelity-v2/algebra1/A.5C.json').documents;
  const fill = (template, values) => JSON.parse(JSON.stringify(template).replace(/\{\{(\w+)(\|signed)?\}\}/g, (match, name, signed) => {
    const value = values[name];
    return signed ? (value < 0 ? `- ${-value}` : `+ ${value}`) : String(value);
  }));
  const asNumbers = (question) => ({ ...question, system: Object.fromEntries(Object.entries(question.system).map(([key, value]) => [key, Number(value)])) });
  const workspace = documents.find((document) => document.id === 'mm_A_5C_v2_systems-workspace');
  [[1, -2, 3, 4], [4, -1, -3, -6], [2, -5, 0, 7]].forEach(([m1, m2, x, b1]) => {
    const y = m1 * x + b1;
    push(`A.5C systems-workspace m1=${m1} m2=${m2}`, asNumbers(fill(workspace, { m1, m2, x, b1, y, b2: y - m2 * x })));
  });
  const identical = documents.find((document) => document.id === 'mm_A_5C_v2_classify-identical');
  [[3, -2], [-1, 5]].forEach(([m, b]) => push(`A.5C classify-identical m=${m} b=${b}`, asNumbers(fill(identical, { m, b }))));
}
// Workspace lines (parallel, identical, horizontal, through the origin) and matrices (a zero coordinate included).
[[2, -3, 2, -3], [2, 1, 2, 5], [1, 4, -1, 2], [-3, 0, 2, 5], [0.5, -3, -0.5, -3], [4, -2, -1, 8], [-2, 6, 3, -4], [1, 0, -1, 0], [5, -8, -5, 2], [0, 4, 2, -2], [3, 1, 0, -5], [0, 2, 0, 7], [1.5, 2, -0.25, -5]]
  .forEach(([m1, b1, m2, b2]) => push(`workspace lines ${m1},${b1},${m2},${b2}`, { type: 'systemsWorkspace', mode: 'linear', prompt: 'Graph both lines and find the solution.', system: { m1, b1, m2, b2 } }));
[[2, 1, 3, -4, 3, 4], [1, -1, 2, 5, -2, 0], [-3, 2, 4, -1, 0, -5], [6, 3, -2, 5, -1, -6], [1, 2, 3, 4, 5, -2], [-5, 4, 2, -3, -4, 3], [2, 3, 4, 6, null, null], [1, 2, 2, 4, null, 'none']]
  .forEach(([a11, a12, a21, a22, x, y], index) => {
    const matrix = x === null
      ? { a11, a12, b1: 6, a21, a22, b2: y === 'none' ? 7 : 6 * (a21 / a11) }
      : { a11, a12, b1: a11 * x + a12 * y, a21, a22, b2: a21 * x + a22 * y };
    push(`workspace matrix ${index}`, { type: 'systemsWorkspace', mode: 'matrix', prompt: 'Solve with the matrix.', matrix });
  });
// Hand-made systems, each as a legacy `system` item and as a workspace item.
[
  ['x = 3', 'y = 2x - 1'], ['y = 4', 'x + y = 10'], ['2x + 3y = 12', '4x + 6y = 24'], ['2x + 3y = 12', '4x + 6y = 20'], ['y = 2x + 1', 'y = 2x - 3'],
  ['x + y = 5', 'x - y = 1'], ['3x - 2y = 4', 'x + 4y = -8'], ['\\frac{1}{2}x + y = 3', 'x - y = 0'], ['0.5x + y = 2', 'x - 2y = 4'], ['y = -x', 'y = x + 4'],
  ['x = 2y + 1', '3x - y = 8'], ['2x = y', 'x + y = 9'], ['5x + 2y = 3', '3x + 7y = -13'], ['y = \\frac{1}{2}x + 1', 'y = -x + 4'], ['-x + y = 3', '-5x - 2y = 8'],
  ['x = 3', 'x + y = 1'], ['y = 3', 'y = 2x - 1'], ['y = 2x - 1', 'y = 3'], ['x = 2y + 1', '3x = 9'], ['x + y = 0', 'x - y = 0'], ['2x + 4y = 6', 'x + 2y = 3'],
  // Thirds and sevenths: cleared (or carried) exactly, never "-1x" or "-1(…)".
  ['6x - \\frac{1}{4}y = 3', '-\\frac{1}{3}x + 2y = 0'], ['\\frac{1}{3}x + 2y = 5', 'x + y = 5'], ['\\frac{1}{7}x + y = 2', 'x + y = 8'],
  ['\\frac{1}{3}x + y = 2', 'x - \\frac{1}{3}y = 4'], ['\\frac{1}{3}x - y = 2', '-x + 3y = 4'], ['-\\frac{1}{3}x + y = 2', 'x - 3y = -6'],
  // Each equation in one variable: nothing to eliminate.
  ['-5y = 10', 'x = 9'], ['6x = -6', 'y = -3'],
].forEach(([e1, e2]) => {
  push(`system ${e1} ; ${e2}`, { type: 'system', prompt: `Solve the system: $${e1}$ and $${e2}$.`, equationsLatex: [e1, e2] });
  push(`system by substitution ${e1} ; ${e2}`, { type: 'system', prompt: `Solve the system by substitution: $${e1}$ and $${e2}$.`, equationsLatex: [e1, e2] });
  // The workspace stores its equations as typed text: 1/2 x, not \frac{1}{2}x.
  const typed = [e1, e2].map((equation) => equation.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '($1/$2)'));
  push(`workspace ${e1} ; ${e2}`, { type: 'systemsWorkspace', mode: 'algebraic', prompt: 'Solve the system.', equations: typed, variables: ['x', 'y'] });
  push(`workspace by elimination ${e1} ; ${e2}`, { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', prompt: 'Solve the system.', equations: typed, variables: ['x', 'y'] });
});
// Seeded systems with fraction coefficients (thirds, quarters, sevenths) and a
// whole-number or fraction solution, by every method the family picks.
{
  let state = 20261010;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const pick = (values) => values[Math.floor(next() * values.length)];
  const coefficients = ['1', '2', '-3', '\\frac{1}{3}', '-\\frac{1}{3}', '\\frac{2}{3}', '\\frac{1}{4}', '-\\frac{3}{4}', '\\frac{1}{7}', '-1', '5'];
  const term = (coefficient, letter, first) => {
    const negative = coefficient.startsWith('-');
    const magnitude = negative ? coefficient.slice(1) : coefficient;
    const body = `${magnitude === '1' ? '' : magnitude}${letter}`;
    return first ? `${negative ? '-' : ''}${body}` : `${negative ? ' - ' : ' + '}${body}`;
  };
  let made = 0;
  while (made < 40) {
    const [a1, b1, a2, b2] = [pick(coefficients), pick(coefficients), pick(coefficients), pick(coefficients)];
    const [x, y] = [pick(['3', '-2', '0', '7', '\\frac{1}{2}']), pick(['1', '-6', '4', '\\frac{3}{5}'])];
    const rows = [[a1, b1], [a2, b2]].map(([a, b]) => ({ a: valueOf(a), b: valueOf(b) }));
    if (math.equal(math.subtract(math.multiply(rows[0].a, rows[1].b), math.multiply(rows[0].b, rows[1].a)), 0)) continue;
    const equations = [[a1, b1], [a2, b2]].map(([a, b]) => `${term(a, 'x', true)}${term(b, 'y', false)} = ${math.add(math.multiply(valueOf(a), valueOf(x)), math.multiply(valueOf(b), valueOf(y))).toLatex().replace(/^\\frac\{-/, '-\\frac{')}`);
    if (equations.some((equation) => !/^[^=]+ = -?(\d+|\\frac\{\d+\}\{\d+\})$/.test(equation))) continue;
    const method = pick(['', ' by substitution', ' by elimination']);
    push(`fraction sweep ${equations.join(' ; ')}${method}`, { type: 'system', prompt: `Solve the system${method}: $${equations[0]}$ and $${equations[1]}$.`, equationsLatex: equations });
    made += 1;
  }
}
// Other letters.
push('system in a, b', { type: 'system', prompt: 'Solve the system: $a + b = 7$ and $a - b = 3$.', equationsLatex: ['a + b = 7', 'a - b = 3'], variables: ['a', 'b'] });

/* ------------------------------------------------------------ grading the stated answer */

const pairIn = (text) => {
  const match = /\$\((.+), (.+)\)\$\.$/.exec(text);
  return match ? [match[1], match[2]] : null;
};

const assertGraded = (label, question, rows, truth, worked) => {
  const variables = question.variables || ['x', 'y'];
  let result;
  if (typeOf(question) === 'systemsWorkspace') {
    const mode = question.mode || 'linear';
    if (mode === 'linear' || mode === 'matrix') {
      const classification = truth.outcome === 'point' ? 'one' : truth.outcome;
      const [x, y] = truth.outcome === 'point' ? pairIn(worked.steps.at(-1)).map((part) => String(Number(valueOf(part).valueOf()))) : ['', ''];
      result = gradeToolWork({ toolId: 'systemsWorkspace', question, work: { classification, x, y } });
    } else if (truth.outcome === 'point') {
      const [x, y] = pairIn(worked.steps.at(-1)).map((part) => valueOf(part));
      const scope = { [variables[0]]: x, [variables[1]]: y };
      const verification = {};
      question.equations.forEach((equation, index) => {
        const [left, right] = equation.split('=');
        verification[`E${index + 1}`] = { left: valueOf(left, scope).toFraction(), right: valueOf(right, scope).toFraction() };
      });
      result = gradeToolWork({
        toolId: 'systemsWorkspace',
        question,
        work: {
          dimension: 2, method: question.method === 'studentChoice' ? '' : (question.method || ''), values: { [variables[0]]: Number(x.valueOf()), [variables[1]]: Number(y.valueOf()) }, verification,
          reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' },
        },
      });
    } else {
      const statement = /leaving \$(0 = [^$]+)\$/.exec(worked.steps.join(' '))[1];
      result = gradeToolWork({
        toolId: 'systemsWorkspace',
        question,
        work: {
          dimension: 2, method: '', values: {}, verification: {}, reducedStatement: statement,
          specialCase: {
            statementTruth: truth.outcome === 'infinite' ? 'true' : 'false',
            solutionCount: truth.outcome,
            classification: truth.outcome === 'infinite' ? 'consistent-dependent' : 'inconsistent',
          },
        },
      });
    }
    assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  } else if (truth.outcome === 'point') {
    // Typed as a student types it: 47/29, not \frac{47}{29}.
    const typed = pairIn(worked.steps.at(-1)).map((part) => part.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')).join(', ');
    const expected = question.type === 'multiAnswer'
      ? question.answerFields[0].answer
      : Array.isArray(question.solution) ? `(${question.solution.join(', ')})` : `(${truth.x.toFraction()}, ${truth.y.toFraction()})`;
    result = gradeResponseField({ expected, accepted: question.answerFields?.[0]?.acceptedAnswers }, `(${typed})`);
  } else {
    return; // A legacy item with no single answer has no field to grade; its steps end on the conclusion.
  }
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated answer (${JSON.stringify(result.parts ?? result.reason ?? '')})`);
};

/* ------------------------------------------------------------ the sweep */

test('every shape the family claims: the steps work THIS system, each is true, the last is the key, and the grader accepts it', () => {
  const outcomes = { point: 0, none: 0, infinite: 0 };
  for (const { label, question } of ITEMS) {
    assert.equal(systems.matches(question), true, `${label}: matched`);
    const variables = question.variables || ['x', 'y'];
    const rows = rowsOf(question);
    const truth = solveRows(rows);
    const worked = systems.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    outcomes[truth.outcome] += 1;
    const lines = [worked.headline, ...worked.steps, worked.answerSummary];
    lines.forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`)));
    // Line-up, rewrite and multiply steps are the rows themselves (times the multiplier).
    worked.steps.forEach((step) => {
      const lineUp = /^(?:Line up the equations|Read each row as an equation): \$(.+)\$ and \$(.+)\$\.$/.exec(step);
      const multiplied = /^Multiply the (first|second) equation by \$(.+?)\$(?: to clear the fractions)?: \$(.+)\$\.$/.exec(step);
      const rewrite = /^Write the (first|second) equation with the variables on the left: \$(.+)\$\.$/.exec(step);
      if (multiplied) {
        // After clearing fractions the multiplied row is the cleared one: compare with any multiple k of the original.
        const shown = formOf(multiplied[3], variables);
        const row = rows[multiplied[1] === 'first' ? 0 : 1];
        const k = valueOf(multiplied[2]);
        const cleared = /to clear the fractions/.test(step);
        const ratio = math.equal(row.a, 0) ? math.divide(shown.b, row.b) : math.divide(shown.a, row.a);
        assert.ok(sameForm(shown, scaled(row, cleared ? k : ratio)), `${label}: ${step} is a multiple of row ${multiplied[1]}`);
      }
      if (rewrite) assert.ok(sameForm(formOf(rewrite[2], variables), rows[rewrite[1] === 'first' ? 0 : 1]), `${label}: ${step}`);
      if (lineUp) {
        const [p, q] = [formOf(lineUp[1], variables), formOf(lineUp[2], variables)];
        // The rows, or the rows with their fractions cleared by an earlier step.
        [[p, rows[0]], [q, rows[1]]].forEach(([shown, row]) => {
          const ratio = math.equal(row.a, 0) ? math.divide(shown.b, row.b) : math.divide(shown.a, row.a);
          assert.ok(sameForm(shown, scaled(row, ratio)) && math.compare(ratio, 0) > 0, `${label}: ${step}`);
          if (!worked.steps.some((other) => /to clear the fractions/.test(other))) assert.ok(math.equal(ratio, 1), `${label}: ${step} lines up the rows themselves`);
        });
      }
    });
    if (truth.outcome === 'point') {
      walkSystem(label, rows, worked, variables);
      // Every equation or chain is true at the solution: for two independent rows, a consequence of the system.
      const scope = { [variables[0]]: truth.x, [variables[1]]: truth.y };
      let checked = 0;
      worked.steps.forEach((step) => [...step.matchAll(/\$([^$]+)\$/g)].forEach(([, segment]) => {
        const parts = segment.split('=');
        if (parts.length < 2) return;
        const values = parts.map((part) => valueOf(part, scope));
        values.forEach((value) => assert.ok(math.equal(value, values[0]), `${label}: "${segment}" is false at the solution, in "${step}"`));
        checked += 1;
      }));
      assert.ok(checked >= 3, `${label}: the steps show their equations`);
      const stated = pairIn(worked.steps.at(-1));
      assert.ok(stated && math.equal(valueOf(stated[0]), truth.x) && math.equal(valueOf(stated[1]), truth.y), `${label}: the last step is the solution: ${worked.steps.at(-1)}`);
      assert.match(worked.steps.at(-1), /^So the solution of the system is/, label);
      assert.ok(worked.answerSummary.endsWith(`$(${stated[0]}, ${stated[1]})$.`), `${label}: ${worked.answerSummary}`);
      const key = question.solutionKey?.x !== undefined ? [question.solutionKey.x, question.solutionKey.y]
        : Array.isArray(question.solution) ? question.solution
          : question.answerFields?.[0]?.answer ? /^\((.+),(.+)\)$/.exec(question.answerFields[0].answer.replace(/\s+/g, '')).slice(1) : null;
      if (key) assert.ok(math.equal(F(key[0]), truth.x) && math.equal(F(key[1]), truth.y), `${label}: the key is the last step`);
    } else {
      const last = worked.steps.at(-1);
      assert.match(last, truth.outcome === 'none' ? /the system has no solution\.$/ : /the system has infinitely many solutions\.$/, `${label}: ends on the conclusion`);
      assert.match(worked.answerSummary, truth.outcome === 'none' ? /^No solution/ : /^Infinitely many solutions/, label);
      if (question.solutionKey?.outcome) assert.equal({ noSolution: 'none', none: 'none', infinite: 'infinite' }[question.solutionKey.outcome] ?? question.solutionKey.outcome, truth.outcome, label);
      const slopes = /has slope \$(.+?)\$ and y-intercept \$(.+?)\$; .* has slope \$(.+?)\$ and y-intercept \$(.+?)\$\.$/.exec(worked.steps[0]);
      if (slopes) {
        // Lines: the slopes and intercepts quoted are the lines'.
        const [m1, b1, m2, b2] = slopes.slice(1).map((part) => valueOf(part));
        assert.ok(math.equal(m1, math.unaryMinus(rows[0].a)) && math.equal(b1, rows[0].c) && math.equal(m2, math.unaryMinus(rows[1].a)) && math.equal(b2, rows[1].c), `${label}: ${worked.steps[0]}`);
      } else {
        // Redo the combination the steps name: both variables cancel to the stated 0 = C.
        const cleared = rows.map((row, index) => {
          const step = worked.steps.find((one) => new RegExp(`^Multiply the ${['first', 'second'][index]} equation by \\$(.+?)\\$ to clear`).test(one));
          return step ? scaled(row, valueOf(/by \$(.+?)\$/.exec(step)[1])) : row;
        });
        const multiplier = (index) => {
          const step = worked.steps.find((one) => new RegExp(`^Multiply the ${['first', 'second'][index]} equation by \\$(.+?)\\$: `).test(one));
          return step ? valueOf(/by \$(.+?)\$/.exec(step)[1]) : F(1);
        };
        const combine = worked.steps.find((one) => /both variables cancel, leaving \$0 = (.+?)\$\.$/.test(one));
        assert.ok(combine, `${label}: a combining step`);
        const sign = /Add the equations/.test(combine) ? 1 : -1;
        assert.match(combine, sign > 0 ? /Add the equations/ : /Subtract the second equation from the first/, label);
        const combined = ['a', 'b', 'c'].map((key) => math.add(math.multiply(cleared[0][key], multiplier(0)), math.multiply(cleared[1][key], math.multiply(multiplier(1), sign))));
        const C = valueOf(/leaving \$0 = (.+?)\$\.$/.exec(combine)[1]);
        assert.ok(math.equal(combined[0], 0) && math.equal(combined[1], 0) && math.equal(combined[2], C), `${label}: ${combine}`);
        assert.equal(math.equal(C, 0), truth.outcome === 'infinite', `${label}: 0 = ${C.toFraction()} for ${truth.outcome}`);
        assert.match(last, math.equal(C, 0) ? /is always true/ : /is never true/, label);
      }
    }
    assertGraded(label, question, rows, truth, worked);
  }
  assert.ok(outcomes.point > 150 && outcomes.none >= 20 && outcomes.infinite >= 20, JSON.stringify(outcomes));
});

test('edges read the way a student works them: a variable already alone, a zero coordinate, horizontal lines', () => {
  const ws = (equations, prompt = 'Solve the system.') => systems.workedSolution({ type: 'system', prompt, equationsLatex: equations });
  // x = 3 is substituted as the number it is: "3 + y = 1", never "(3) + y" or "1(3)".
  assert.deepEqual(ws(['x = 3', 'x + y = 1']).steps.slice(0, 3), [
    'The first equation already gives $x = 3$.',
    'Substitute $3$ for $x$ in the second equation: $3 + y = 1$.',
    'Subtract $3$ from both sides: $y = -2$.',
  ]);
  const zero = ws(['x + y = 0', 'x - y = 0']);
  assert.equal(zero.steps.at(-1), 'So the solution of the system is $(0, 0)$.');
  const horizontal = ws(['y = 2x - 1', 'y = 3']);
  horizontal.steps.forEach((step) => assert.doesNotMatch(step, /Add \$0|Subtract \$0|0x|(^|[^\d.])0\(/, step));
  const noTerm = ws(['x = 2y + 1', '3x = 9'], 'Solve the system by substitution.');
  noTerm.steps.forEach((step) => assert.doesNotMatch(step, /\+ 0|0y|Combine/, step));
});

test('it returns null — never a wrong step — when the key disagrees with the equations shown', () => {
  const ws = systems.workedSolution;
  assert.ok(ws({ type: 'system', prompt: 'Solve.', equationsLatex: ['4x + y = 34', '-x + 2y = 5'], solution: [7, 6] }));
  assert.equal(ws({ type: 'system', prompt: 'Solve.', equationsLatex: ['4x + y = 34', '-x + 2y = 5'], solution: [6, 7] }), null);
  assert.equal(ws({ type: 'multiAnswer', familyId: 'systems.elimination', prompt: 'Solve the system $-x + 2y = 17$ and $-2x + 5y = 40$.', answerFields: [{ id: 'solution', answer: '(-5, 7)' }] }), null);
  assert.equal(ws({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['x', 'y'], equations: ['3x - 3y = 4', '9x - 9y = 42'], solutionKey: { outcome: 'infinite' } }), null);
  assert.equal(ws({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['x', 'y'], equations: ['3x - 3y = 4', '9x - 9y = 12'], solutionKey: { outcome: 'noSolution' } }), null);
  // An unreadable system: nothing, not a guess.
  assert.equal(ws({ type: 'system', prompt: 'Solve the system in the picture.' }), null);
  assert.equal(ws(null), null);
});

test('it is reachable only from the closed review: no hint, back-up or sibling path calls it', () => {
  const source = executableSource(readFileSync(new URL('src/platform/supports/families/systems.js', ROOT), 'utf8'));
  const sectionStart = source.indexOf('const sameNumber =');
  assert.ok(sectionStart > 0, 'the worked-solution section');
  for (const name of ['export const hints', 'export const backUpQuestion', 'export const similarProblem', 'export const expectedValues', 'export const matches']) {
    const at = source.indexOf(name);
    assert.ok(at > 0 && at < sectionStart, `${name} comes before the worked solution`);
  }
  assert.doesNotMatch(source.slice(0, sectionStart), /workedSolution|pointWorked|specialWorked/, 'an open-item path calls the worked solution');
  assert.deepEqual([...source.slice(sectionStart).matchAll(/export const (\w+)/g)].map((match) => match[1]), ['workedSolution']);
});
