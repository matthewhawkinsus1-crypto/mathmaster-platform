/*
 * ALGEBRA I MODULE 3 — THE QUESTION FAMILIES BEHIND ITS WARM-UPS AND DOLS.
 *
 * Four lessons (teacher-import-jsons/algebra1-module3/) reference a Question
 * Family on every Warm-Up and DOL question, so each Warm-Up can be shared in
 * class and still recovered, and each DOL gives every student their own
 * version and a fresh, server-graded Recovery. The families that did not
 * exist yet are here:
 *
 *   equations.verifySolution      Lesson 1 Warm-Up: substitute, compare, decide
 *   linear.contextFunction        Lesson 3 Warm-Up: write and interpret f(x)
 *   inequalities.translatePhrase  Lesson 3 Warm-Up: words to ≥, ≤, >, <
 *   inequalities.contextModel     Lesson 3 DOL: model, solve, interpret
 *   systems.classifyByStructure   Topic 2 Lesson 1 DOL: slopes, intercepts, cases
 *   systems.knownValue            Topic 2 Lesson 2 Warm-Up: substitute a value
 *   inequalities.solveLinear      Lesson 3 Warm-Up and DOL: Step Algebra's
 *                                 relation workspace, then the number line
 *   systems.graphical2x2          Topic 2 Lesson 1 DOL: graph both lines on the
 *                                 Systems Workspace's construct form
 *   systems.substitution v2       Topic 2 Lesson 2 DOL: the Systems Workspace's
 *                                 substitution workflow
 *   systems.contextModel          Topic 2 Lesson 2 DOL: write a system for a
 *                                 situation (any equivalent form), solve it,
 *                                 and use the solution
 *
 * These tests hold each family to what a student is owed: every version is a
 * valid question that its own key passes and a wrong answer fails ON THE
 * SERVER; versions are distinct and plentiful; a version carries no hint,
 * step or answer; and the mathematics is re-derived here from each version's
 * PROMPT, never read back from the family's own key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { relationWorkspaceWork, workspacePristineRelation } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import {
  applyBalancedOperationToRelation,
  relationSolutionSummary,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { correctAlgebraicSystemWork, wrongAlgebraicSystemWork } from './helpers/algebraicSystemWork.mjs';
import { gradeBothWays, systemOracle } from './helpers/questionFamilyCases.mjs';

const MULTI_ANSWER_FAMILIES = Object.freeze({
  'equations.verifySolution': { alignment: 'A.5A', minimum: 1000 },
  'linear.contextFunction': { alignment: 'A.3B', minimum: 120 },
  'inequalities.translatePhrase': { alignment: 'A.5B', minimum: 1000 },
  'inequalities.contextModel': { alignment: 'A.5B', minimum: 200 },
  'systems.classifyByStructure': { alignment: 'A.3F', minimum: 1000 },
  'systems.knownValue': { alignment: 'A.5C', minimum: 150 },
  'systems.contextModel': { alignment: 'A.2I', minimum: 1000 },
});

const instancesOf = (family, constraints = {}, limit = 300) => {
  const values = resolveFamilyConstraints(family, constraints).values;
  const sequence = createFamilyInstanceSequence(family, values, 'module3-family-test');
  const instances = [];
  for (let index = 0; index < limit; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    instances.push(instance);
  }
  return instances;
};
const build = (family, instance, constraints = {}) => buildFamilyQuestion({
  family,
  instance,
  constraintValues: resolveFamilyConstraints(family, constraints).values,
  authored: { questionId: 'module3-family-test' },
  tool: family.defaultTool,
});

const respond = (question, answers) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: question.answerFields.map((field) => ({ id: field.id, value: String(answers[field.id] ?? ''), isComplete: true })),
});
const keyOf = (question) => Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer]));
const grade = (question, answers) => gradeServerResponse({ question, response: respond(question, answers) });

const number = (text) => Number(String(text).replace(/[−–]/g, '-'));
const numbersIn = (text) => (String(text).match(/[−-]?\d+(?:\.\d+)?/g) || []).map(number);

/* ---------------------------------------------------------------------------
 * Every family: registered, Recovery-eligible, valid and graded on the server.
 * ------------------------------------------------------------------------- */

test('the Module 3 families are registered, Recovery-eligible and aligned to their lesson’s TEKS', () => {
  Object.entries(MULTI_ANSWER_FAMILIES).forEach(([id, { alignment }]) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(family.recovery.eligible, true, `${id} may serve Recovery`);
    assert.ok(family.skill.alignments.includes(alignment), `${id} assesses ${alignment}`);
  });
});

test('each Module 3 family module stays light: the registry loads in the browser, so it imports only the family contract (and the pure exact arithmetic)', () => {
  const allowed = {
    questionFamiliesSolvingEquations: ['./questionFamilyContract.mjs'],
    questionFamiliesInequalities: ['./questionFamilyContract.mjs'],
    questionFamiliesSystemsGraphing: ['./questionFamilyContract.mjs'],
    questionFamiliesSubstitution: ['./questionFamilyContract.mjs'],
    questionFamiliesInequalitySolving: ['./questionFamilyContract.mjs', './questionFamilyExact.mjs'],
    questionFamiliesSystemsContext: ['./questionFamilyContract.mjs'],
  };
  Object.entries(allowed).forEach(([name, expected]) => {
    const source = readFileSync(new URL(`../../functions/shared/${name}.mjs`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
    assert.deepEqual(imports, expected, `${name}: no tool math, no grader, no browser module`);
  });
});

for (const [id, { minimum }] of Object.entries(MULTI_ANSWER_FAMILIES)) {
  test(`${id}: plentiful, distinct versions, each valid and graded right and wrong by the server`, () => {
    const family = getPlatformQuestionFamily(id);
    const capacity = measureFamilyCapacity(family, resolveFamilyConstraints(family, {}).values);
    assert.ok(capacity.capacity >= minimum, `${id} has ${capacity.capacity} versions (at least ${minimum})`);
    const instances = instancesOf(family, {}, 150);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, instances.length, 'no two versions are the same problem');
    instances.forEach((instance) => {
      const question = build(family, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: id }).errors, [], `${id} ${instance.fingerprint} is a valid question`);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${id} has a key response for its answer kind`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${id} ${instance.fingerprint}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong answer is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], `${id} ${instance.fingerprint}: certification’s key check passes`);
    });
  });

  test(`${id}: every wrong part is marked wrong, and each choice has exactly one right option`, () => {
    const family = getPlatformQuestionFamily(id);
    instancesOf(family, {}, 60).forEach((instance) => {
      const question = build(family, instance);
      const key = keyOf(question);
      assert.equal(grade(question, key)?.isCorrect, true, `${id} ${instance.fingerprint}: the key is accepted`);
      question.answerFields.forEach((field) => {
        if (field.type === 'choice') {
          assert.equal(field.options.filter((option) => option === field.answer).length, 1, `${id} ${field.id}: one right option`);
          assert.equal(new Set(field.options).size, field.options.length, `${id} ${field.id}: no duplicate options`);
        }
        const wrongValue = field.type === 'choice'
          ? field.options.find((option) => option !== field.answer)
          : field.inputProfile === 'inequality' ? `${field.answer.replace(/[<>]=?/, (relation) => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[relation]))}` : '999';
        assert.notEqual(grade(question, { ...key, [field.id]: wrongValue })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong ${field.id} (${wrongValue}) is not accepted`);
      });
    });
  });

  test(`${id}: a version never carries a hint, a step, a worked solution or its own answer in the prompt`, () => {
    const family = getPlatformQuestionFamily(id);
    instancesOf(family, {}, 60).forEach((instance) => {
      const question = build(family, instance);
      ['hints', 'scaffold', 'steps', 'solution', 'workedSolution', 'guidedNotes'].forEach((name) => assert.equal(question[name], undefined, `${id}: no ${name}`));
      question.answerFields.forEach((field) => {
        if (!['orderedPair', 'equation', 'inequality'].includes(field.answerFormat)) return;
        assert.ok(!question.prompt.replace(/\s+/g, '').includes(field.answer.replace(/\s+/g, '')), `${id} ${instance.fingerprint}: the prompt does not contain the key ${field.answer}`);
      });
    });
  });
}

/* ---------------------------------------------------------------------------
 * The mathematics, re-derived from each version's own prompt.
 * ------------------------------------------------------------------------- */

/** Evaluate "−3x + 14", "18 − 5x", "x + 5" at a value of its one variable. */
const evaluateSide = (text, value) => {
  const expression = String(text).replace(/[−–]/g, '-').replace(/\s+/g, '');
  const terms = expression.match(/[+-]?[^+-]+/g) || [];
  return terms.reduce((sum, term) => {
    const match = /^([+-]?)(\d*)([a-z])?$/.exec(term);
    assert.ok(match, `readable term ${term}`);
    const sign = match[1] === '-' ? -1 : 1;
    if (match[3]) return sum + sign * (match[2] === '' ? 1 : Number(match[2])) * value;
    return sum + sign * Number(match[2]);
  }, 0);
};

test('equations.verifySolution: each side’s value is the side in the prompt evaluated at the tested value; true and false are balanced', () => {
  const family = getPlatformQuestionFamily('equations.verifySolution');
  const verdicts = [];
  instancesOf(family, {}, 200).forEach((instance) => {
    const question = build(family, instance);
    const [, tested, equation] = question.prompt.match(/^Is [a-z] = ([−-]?\d+) a solution of (.*?)\?/);
    const value = number(tested);
    const [left, right] = equation.split(' = ');
    const key = keyOf(question);
    assert.equal(number(key.left), evaluateSide(left, value), `${equation} at ${value}: left`);
    assert.equal(number(key.right), evaluateSide(right, value), `${equation} at ${value}: right`);
    assert.equal(key.verdict.startsWith('Yes'), number(key.left) === number(key.right), 'the verdict follows the two values');
    verdicts.push(key.verdict.startsWith('Yes'));
  });
  // Each block of two seats gets one true and one false version.
  for (let index = 0; index + 1 < verdicts.length; index += 2) {
    assert.notEqual(verdicts[index], verdicts[index + 1], `seats ${index + 1} and ${index + 2} test one true and one false value`);
  }
});

test('linear.contextFunction: the function, slope and intercept come from the rate and the starting amount in the prompt', () => {
  const family = getPlatformQuestionFamily('linear.contextFunction');
  instancesOf(family, {}, 140).forEach((instance) => {
    const question = build(family, instance);
    const key = keyOf(question);
    const [, rule] = key.function.match(/=(.*)$/);
    const [, slope, intercept] = rule.match(/^(-?\d+(?:\.\d+)?)[a-z]([+-]\d+(?:\.\d+)?)$/);
    assert.equal(slope, key.slope, 'the function’s rate is the slope field');
    assert.equal(number(intercept), number(key.intercept), 'the function’s constant is the y-intercept field');
    const amounts = numbersIn(question.prompt.split(' Write')[0]);
    assert.ok(amounts.includes(Math.abs(number(key.slope))), `the rate ${key.slope} is in the situation`);
    assert.ok(amounts.includes(number(key.intercept)), `the starting amount ${key.intercept} is in the situation`);
    const decreasing = /down|drained/.test(question.prompt);
    assert.equal(number(key.slope) < 0, decreasing, 'a falling situation has a negative slope');
    assert.ok(key.slopeMeaning.includes(String(Math.abs(number(key.slope)))), 'the slope’s meaning names the rate');
    assert.notEqual(key.independent, key.dependent);
  });
});

test('inequalities.translatePhrase: each phrase means its symbol, and every version asks for all four symbols', () => {
  const family = getPlatformQuestionFamily('inequalities.translatePhrase');
  const meaning = [
    [/is at least|is no less than|is greater than or equal to/, '≥'],
    [/is at most|is no more than|cannot be more than/, '≤'],
    [/is more than|is greater than(?! or)|exceeds/, '>'],
    [/is less than|is fewer than|is under/, '<'],
  ];
  instancesOf(family, {}, 200).forEach((instance) => {
    const question = build(family, instance);
    const symbols = question.answerFields.map((field) => {
      const expected = meaning.find(([pattern]) => pattern.test(field.label))[1];
      const value = numbersIn(field.label).pop();
      assert.equal(field.answer.split(' ')[1], expected, `${field.label} → ${field.answer}`);
      assert.equal(number(field.answer.split(' ')[2]), value, 'the number in the statement');
      return expected;
    });
    assert.deepEqual([...symbols].sort(), ['<', '>', '≤', '≥'], 'one statement per symbol');
  });
});

test('inequalities.contextModel: the solved boundary and the whole-number answer follow from the prompt’s numbers; decreasing situations reverse the symbol', () => {
  const family = getPlatformQuestionFamily('inequalities.contextModel');
  let reversed = 0;
  instancesOf(family, {}, 200).forEach((instance) => {
    const question = build(family, instance);
    const key = keyOf(question);
    const [, start, operation, rate, variable, relation, goal] = key.model.match(/^(\d+(?:\.\d+)?) ([+−]) (\d+(?:\.\d+)?)([a-z]) (≥|≤|>|<) (\d+(?:\.\d+)?)$/);
    const sign = operation === '+' ? 1 : -1;
    const boundary = (number(goal) - number(start)) / (sign * number(rate));
    const solvedRelation = sign > 0 ? relation : ({ '≥': '≤', '≤': '≥', '>': '<', '<': '>' })[relation];
    const [, keyVariable, keyRelation, keyBoundary] = key.solution.match(/^([a-z])(<=|>=|<|>)(-?\d+(?:\.\d+)?)$/);
    assert.equal(keyVariable, variable);
    assert.equal(keyRelation.replace('>=', '≥').replace('<=', '≤'), solvedRelation, `${key.model} solves with ${solvedRelation}`);
    assert.ok(Math.abs(number(keyBoundary) - boundary) < 1e-9, `${key.model}: boundary ${boundary}`);
    assert.ok(/^\d+(\.\d{1,2})?$/.test(keyBoundary), 'the boundary terminates within two decimal places');
    const whole = number(key.whole);
    const satisfies = (x) => ({ '≥': x >= boundary, '≤': x <= boundary, '>': x > boundary, '<': x < boundary })[solvedRelation];
    assert.ok(satisfies(whole), `${whole} satisfies ${variable} ${solvedRelation} ${boundary}`);
    const wantsLeast = /least/.test(question.answerFields.find((field) => field.id === 'whole').label);
    assert.equal(satisfies(wantsLeast ? whole - 1 : whole + 1), false, `${whole} is the ${wantsLeast ? 'least' : 'greatest'} whole number that works`);
    [number(start), number(rate), number(goal)].forEach((value) => assert.ok(question.prompt.includes(String(value)), `the prompt states ${value}`));
    if (sign < 0) reversed += 1;
  });
  assert.ok(reversed >= 80, `half the mixed slot reverses the symbol (${reversed} of 200)`);
});

test('inequalities.contextModel: every model choice is a different inequality, and only the key is right', () => {
  const family = getPlatformQuestionFamily('inequalities.contextModel');
  instancesOf(family, {}, 100).forEach((instance) => {
    const question = build(family, instance);
    const field = question.answerFields.find((entry) => entry.id === 'model');
    assert.equal(field.options.length, 4);
    assert.equal(new Set(field.options).size, 4);
  });
});

test('systems.classifyByStructure: slopes and intercepts are read from the two equations in the prompt, and the case follows from them', () => {
  const family = getPlatformQuestionFamily('systems.classifyByStructure');
  const cases = { one: 0, none: 0, infinite: 0 };
  instancesOf(family, {}, 210).forEach((instance) => {
    const question = build(family, instance);
    const [, first, second] = question.prompt.match(/equations (y = .*?) and (.*? = [−-]?\d+)\./);
    const key = keyOf(question);
    // y = m1·x + b1
    const m1 = number((first.match(/y = ([−-]?\d*)x/) || ['', '0'])[1].replace(/^([−-]?)$/, '$11'));
    const b1 = first.includes('x') ? number((first.match(/x ([+−] \d+)$/) || ['', '0'])[1].replace(' ', '')) : number(first.split('= ')[1]);
    assert.equal(number(key.m1), m1);
    assert.equal(number(key.b1), b1);
    // A·x + B·y = C  →  y = −A/B·x + C/B
    const [, aText, bSign, bText, cText] = second.match(/^([−-]?\d*)x ([+−]) (\d*)y = ([−-]?\d+)$/);
    const A = number(aText.replace(/^([−-]?)$/, '$11'));
    const B = (bSign === '−' ? -1 : 1) * number(bText === '' ? '1' : bText);
    const C = number(cText);
    assert.equal(number(key.m2), -A / B);
    assert.equal(number(key.b2), C / B);
    const expected = number(key.m1) !== number(key.m2) ? 'one' : number(key.b1) === number(key.b2) ? 'infinite' : 'none';
    assert.equal(key.count, { one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' }[expected]);
    assert.match(key.consistency, expected === 'none' ? /^Inconsistent, because it has no solution$/ : /^Consistent, because it has at least one solution$/);
    const consistency = question.answerFields.find((field) => field.id === 'consistency');
    assert.equal(new Set(consistency.options).size, 4, 'the term comes with its reason: never a two-way coin toss');
    assert.ok(consistency.options.includes(key.consistency));
    assert.ok(Math.abs(B) > 1, 'the second equation is never already solved for y');
    cases[expected] += 1;
  });
  assert.deepEqual(cases, { one: 70, none: 70, infinite: 70 }, 'one, none and infinitely many in equal shares');
});

test('systems.knownValue: substituting the first equation into the second gives the key, and the key satisfies both', () => {
  const family = getPlatformQuestionFamily('systems.knownValue');
  instancesOf(family, {}, 150).forEach((instance) => {
    const question = build(family, instance);
    const [, first, second] = question.prompt.match(/equations (x = .*?) and (y = .*?)\. /);
    const key = keyOf(question);
    const [x, y] = numbersIn(key.solution);
    assert.equal(number(key.y), y);
    const firstRight = first.slice(4);
    const expectedX = firstRight.includes('y') ? evaluateSide(firstRight.replace('y', 'x'), y) : number(firstRight);
    assert.equal(x, expectedX, `${first} holds at ${key.solution}`);
    assert.equal(evaluateSide(second.slice(4), x), y, `${second} holds at ${key.solution}`);
  });
});

/* ---------------------------------------------------------------------------
 * inequalities.solveLinear — solved, graphed and graded on the real engine.
 * ------------------------------------------------------------------------- */

const REVERSED = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
/** a·x + b of an engine-text side ("-2 * (x - 11)"), from three evaluations. */
const linearSide = (text, variable) => {
  const evaluate = (value) => Function(`"use strict"; return (${String(text).replace(new RegExp(`\\b${variable}\\b`, 'g'), `(${value})`)});`)();
  const b = evaluate(0);
  const a = evaluate(1) - b;
  assert.ok(Math.abs(evaluate(5) - (5 * a + b)) < 1e-9, `${text} is linear`);
  return { a, b };
};

test('inequalities.solveLinear: the displayed inequality solves to its key; half a class reverses the symbol', () => {
  const family = getPlatformQuestionFamily('inequalities.solveLinear');
  assert.equal(family.recovery.eligible, true);
  assert.ok(family.skill.alignments.includes('A.5B'));
  assert.ok(measureFamilyCapacity(family, resolveFamilyConstraints(family, {}).values).capacity >= 1000);
  const instances = instancesOf(family, {}, 64);
  assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, instances.length);
  let reversals = 0;
  instances.forEach((instance) => {
    const question = build(family, instance);
    assert.equal(question.type, 'stepAlgebra');
    assert.equal(resolveStepAlgebraMode(question), 'relation', 'the relation workspace, where the symbol is checked');
    assert.deepEqual(validateQuestionSemantics(question, { label: 'solveLinear' }).errors, []);
    const [, left, shown, right] = question.equation.match(/^(.*?) (<=|>=|<|>) (.*)$/);
    const L = linearSide(left, question.variable);
    const R = linearSide(right, question.variable);
    const coefficient = L.a - R.a;
    const boundary = (R.b - L.b) / coefficient;
    const solved = coefficient < 0 ? REVERSED[shown] : shown;
    assert.equal(instance.answer.relation, solved, `${question.equation}`);
    assert.equal(instance.answer.boundary, boundary);
    assert.ok(Number.isInteger(boundary), 'a whole-number boundary a student can place on the number line');
    assert.ok(!question.prompt.includes(instance.answer.display), 'the prompt never states the solution');
    if (coefficient < 0) reversals += 1;
  });
  assert.equal(reversals, instances.length / 2, 'the mixed slot alternates: reverse, keep');
});

test('inequalities.solveLinear: every version, solved step by step and graphed, is right on the browser and the server; a wrong boundary, graph or symbol is not', () => {
  const family = getPlatformQuestionFamily('inequalities.solveLinear');
  instancesOf(family, {}, 48).forEach((instance) => {
    const question = { ...build(family, instance), alignments: [{ framework: 'teks', code: 'A.5B', role: 'primary' }] };
    const variable = question.variable;
    const step = (state, next, context) => {
      assert.equal(validateRelationTransition(state, next, context).valid, true, `${question.equation}: ${JSON.stringify(context)}`);
      return next;
    };
    const sideText = ({ a, b }) => [a ? `${a}*${variable}` : '', b || !a ? `(${b})` : ''].filter(Boolean).join(' + ');
    let state = workspacePristineRelation(question);
    const [first, second] = state.branches[0].expressions;
    const L = linearSide(first.replace(/\*/g, '*'), variable);
    const R = linearSide(second, variable);
    state = step(state, { ...state, branches: [{ expressions: [sideText(L), sideText(R)], relations: state.branches[0].relations }] }, { kind: 'equivalentRewrite' });
    if (R.a) {
      state = step(state, applyBalancedOperationToRelation(state, 'subtract', `(${R.a}) * ${variable}`, { branchIndex: 0 }).state, { kind: 'balancedOperation', operation: 'subtract', operandExpression: `(${R.a}) * ${variable}`, branchIndices: [0] });
    }
    const coefficient = L.a - R.a;
    state = step(state, { ...state, branches: [{ expressions: [sideText({ a: coefficient, b: L.b }), String(R.b)], relations: state.branches[0].relations }] }, { kind: 'equivalentRewrite' });
    if (L.b) {
      state = step(state, applyBalancedOperationToRelation(state, 'subtract', `(${L.b})`, { branchIndex: 0 }).state, { kind: 'balancedOperation', operation: 'subtract', operandExpression: `(${L.b})`, branchIndices: [0] });
      state = step(state, { ...state, branches: [{ expressions: [sideText({ a: coefficient, b: 0 }), String(R.b - L.b)], relations: state.branches[0].relations }] }, { kind: 'equivalentRewrite' });
    }
    const division = applyBalancedOperationToRelation(state, 'divide', `(${coefficient})`, { branchIndex: 0 });
    const context = { kind: 'balancedOperation', operation: 'divide', operandExpression: `(${coefficient})`, branchIndices: [0] };
    if (division.requiresInequalityFlip) {
      assert.equal(validateRelationTransition(state, division.state, context).valid, false, `${question.equation}: keeping the symbol after dividing by ${coefficient} is refused`);
      division.state.branches[0].relations = division.expectedRelations;
    }
    state = step(state, division.state, context);
    state = step(state, { ...state, branches: [{ expressions: [variable, String(instance.answer.boundary)], relations: state.branches[0].relations }] }, { kind: 'equivalentRewrite' });
    const summary = relationSolutionSummary(state);
    const right = gradeBothWays(question, relationWorkspaceWork({ relationState: state, representation: { intervals: summary.intervals, notation: '', inequality: '' } }));
    assert.equal(right.browser.isCorrect, true, `${question.equation}: browser`);
    assert.equal(right.server.isCorrect, true, `${question.equation}: server`);
    const off = { ...state, branches: [{ expressions: [variable, String(instance.answer.boundary + 1)], relations: state.branches[0].relations }] };
    assert.equal(gradeBothWays(question, relationWorkspaceWork({ relationState: off, representation: { intervals: relationSolutionSummary(off).intervals, notation: '', inequality: '' } })).server.isCorrect, false, 'a wrong boundary');
    const wrongDots = summary.intervals.map((piece) => ({ ...piece, minClosed: !piece.minClosed, maxClosed: !piece.maxClosed }));
    assert.equal(gradeBothWays(question, relationWorkspaceWork({ relationState: state, representation: { intervals: wrongDots, notation: '', inequality: '' } })).server.isCorrect, false, 'open and closed dots swapped');
  });
});

/* ---------------------------------------------------------------------------
 * systems.graphical2x2 — the student graphs both lines.
 * ------------------------------------------------------------------------- */

test('systems.graphical2x2: every shown equation is the line it is graded as, and the cases and forms are balanced', () => {
  const family = getPlatformQuestionFamily('systems.graphical2x2');
  assert.equal(family.recovery.eligible, true);
  assert.ok(family.skill.alignments.includes('A.3F'));
  const instances = instancesOf(family, {}, 60);
  const counts = {};
  instances.forEach((instance) => {
    const question = build(family, instance);
    assert.equal(question.interaction, 'construct', 'nothing is drawn for the student');
    assert.deepEqual(validateToolQuestion(question).errors, [], `${question.prompt}: Pre-Flight re-reads each equation as its graded line`);
    assert.deepEqual(validateQuestionSemantics(question, { label: 'graphical2x2' }).errors, []);
    const [first, second] = question.equationLabels;
    assert.notEqual(first.replace(/\s+/g, ''), second.replace(/\s+/g, ''), 'never the same text twice, even for one line');
    const { m1, b1, m2, b2 } = question.system;
    const made = m1 !== m2 ? 'one' : b1 !== b2 ? 'none' : 'infinite';
    assert.equal(instance.answer.value.outcome, made);
    if (made === 'one') assert.ok(m1 * instance.answer.value.x + b1 === instance.answer.value.y && m2 * instance.answer.value.x + b2 === instance.answer.value.y, 'the key is on both lines');
    counts[`${made}/${instance.values.form}`] = (counts[`${made}/${instance.values.form}`] || 0) + 1;
  });
  assert.deepEqual(Object.values(counts), Array(6).fill(10), JSON.stringify(counts));
});

test('systems.graphical2x2: two points on each line and the right reading are correct; a wrong reading or the lines swapped are not', () => {
  const family = getPlatformQuestionFamily('systems.graphical2x2');
  instancesOf(family, {}, 48).forEach((instance) => {
    const question = build(family, instance);
    const { m1, b1, m2, b2 } = question.system;
    const pointsOn = (m, b) => [-2, -1, 0, 1, 2].map((x) => ({ x, y: m * x + b })).filter((point) => Math.abs(point.y) <= 10).slice(0, 2);
    const key = instance.answer.value;
    const right = {
      construction: [{ points: pointsOn(m1, b1) }, { points: pointsOn(m2, b2) }],
      classification: key.outcome,
      x: key.outcome === 'one' ? String(key.x) : '',
      y: key.outcome === 'one' ? String(key.y) : '',
    };
    const graded = (work) => {
      const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
      const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
      assert.equal(server.isCorrect, browser.isCorrect);
      return server.isCorrect;
    };
    assert.equal(graded(right), true, question.prompt);
    assert.equal(graded({ ...right, classification: key.outcome === 'one' ? 'none' : 'one', x: '1', y: '1' }), false);
    if (key.outcome !== 'infinite') assert.equal(graded({ ...right, construction: [right.construction[1], right.construction[0]] }), false, 'each line is graded as its own equation');
  });
});

/* ---------------------------------------------------------------------------
 * systems.substitution v2 — the Systems Workspace's substitution workflow.
 * ------------------------------------------------------------------------- */

test('systems.substitution v2: a substitution-ready system in the Systems Workspace, graded right and wrong on both sides', () => {
  const family = getPlatformQuestionFamily('systems.substitution', 2);
  assert.equal(family.recovery.eligible, true);
  const cases = { one: 0, none: 0, infinite: 0 };
  const wordings = new Set();
  instancesOf(family, { solutionCase: 'mixed', form: 'mixed' }, 60).forEach((instance) => {
    const question = buildFamilyQuestion({
      family,
      instance,
      constraintValues: resolveFamilyConstraints(family, { solutionCase: 'mixed', form: 'mixed' }).values,
      authored: { questionId: 'substitution-v2' },
      tool: 'systemsWorkspace',
    });
    assert.equal(question.type, 'systemsWorkspace');
    assert.equal(question.mode, 'algebraic');
    assert.equal(question.method, 'substitution', 'substitution unless the slot says otherwise');
    assert.deepEqual(validateToolQuestion(question).errors, []);
    // One equation is solved for a variable, or has a variable with coefficient ±1.
    const ready = question.equations.some((equation) => /^[xy] = /.test(equation) || /(^|[\s(=+-])[xy](?![\w^])/.test(equation));
    assert.ok(ready, `${question.equations.join(' ; ')} has a variable ready to isolate`);
    const oracle = systemOracle(question);
    cases[oracle.case] += 1;
    const right = gradeBothWays(question, correctAlgebraicSystemWork(question, { method: 'substitution' }));
    assert.equal(right.browser.isCorrect, true, question.equations.join(' ; '));
    assert.equal(right.server.isCorrect, true, question.equations.join(' ; '));
    assert.equal(gradeBothWays(question, wrongAlgebraicSystemWork(question, { method: 'substitution' })).server.isCorrect, false);
    wordings.add(question.prompt.replace(/\$[^$]*\$/g, '$…$'));
  });
  assert.deepEqual(cases, { one: 20, none: 20, infinite: 20 }, 'one, none and infinitely many in equal shares');
  assert.equal(wordings.size, 1, `a mixed slot words every case the same way: ${[...wordings].join(' | ')}`);
});

/* ---------------------------------------------------------------------------
 * systems.contextModel — the situation re-read from its own words.
 * ------------------------------------------------------------------------- */

const money = (text) => Number(String(text).replace(/,/g, ''));

/*
 * The system each situation's sentences state, solved here from the PROMPT:
 * the two facts as rows a·u + b·v = c, and the follow-up the last field asks.
 */
const CONTEXT_ORACLES = [
  {
    pattern: /sold (\d+) tickets.*Adult tickets cost \$(\d+) and student tickets cost \$(\d+)\. Ticket sales totaled \$([\d,]+)\./,
    read: ([, n, a, s, m]) => ({ rows: [[1, 1, Number(n)], [Number(a), Number(s), money(m)]], followUp: (x) => Number(a) * x }),
  },
  {
    pattern: /hot dogs for \$(\d+) each and bottles of water for \$(\d+) each\. A team bought (\d+) items and paid \$([\d,]+)\./,
    read: ([, h, d, n, m]) => ({ rows: [[1, 1, Number(n)], [Number(h), Number(d), money(m)]], followUp: (x) => Number(h) * x }),
  },
  {
    pattern: /all (\d+) main-floor seats and all (\d+) balcony seats for one show and collected \$([\d,]+)\. A main-floor seat costs \$(\d+) more/,
    read: ([, p, q, m, k]) => ({ rows: [[1, -1, Number(k)], [Number(p), Number(q), money(m)]], followUp: (x, y) => 2 * x + 3 * y }),
  },
  {
    pattern: /Jordan is (\d+) years older than Riley\. The sum of their ages is (\d+)\./,
    read: ([, k, sum]) => ({ rows: [[1, -1, Number(k)], [1, 1, Number(sum)]], followUp: (x) => x + Number(k) }),
  },
  {
    pattern: /Shop A rents bikes for (?:\$(\d+) plus )?\$(\d+) per hour\. Shop B rents bikes for \$(\d+) plus \$(\d+) per hour\./,
    // c = r·h + F, as −r·h + c = F; ten hours at whichever shop is cheaper then.
    read: ([, f1 = '0', r1, f2, r2]) => ({
      rows: [[-Number(r1), 1, Number(f1)], [-Number(r2), 1, Number(f2)]],
      followUp: () => Math.min(10 * Number(r1) + Number(f1), 10 * Number(r2) + Number(f2)),
    }),
  },
  {
    pattern: /Gym A charges (?:a \$(\d+) joining fee plus )?\$(\d+) per month\. Gym B charges a \$(\d+) joining fee plus \$(\d+) per month\./,
    read: ([, f1 = '0', r1, f2, r2]) => ({
      rows: [[-Number(r1), 1, Number(f1)], [-Number(r2), 1, Number(f2)]],
      followUp: () => Math.min(Number(r1) + Number(f1), Number(r2) + Number(f2)),
    }),
  },
];

const solveRows = ([[a1, b1, c1], [a2, b2, c2]]) => {
  const determinant = a1 * b2 - a2 * b1;
  return determinant === 0 ? null : { x: (c1 * b2 - c2 * b1) / determinant, y: (a1 * c2 - a2 * c1) / determinant };
};

test('systems.contextModel: the system the situation states, solved from its words, is the key; the shapes are balanced', () => {
  const family = getPlatformQuestionFamily('systems.contextModel');
  const shapes = { sumAndTotal: 0, oneDefined: 0, equalCost: 0 };
  instancesOf(family, {}, 120).forEach((instance) => {
    const question = build(family, instance);
    const oracle = CONTEXT_ORACLES.find((entry) => entry.pattern.test(question.prompt));
    assert.ok(oracle, `a situation this test can read: ${question.prompt}`);
    const { rows, followUp } = oracle.read(oracle.pattern.exec(question.prompt));
    const solved = solveRows(rows);
    assert.ok(solved && Number.isInteger(solved.x) && Number.isInteger(solved.y) && solved.x > 0 && solved.y > 0, `${question.prompt}: one whole-number solution`);
    const key = keyOf(question);
    assert.deepEqual([number(key.x), number(key.y)], [solved.x, solved.y], question.prompt);
    assert.equal(number(key.followUp), followUp(solved.x, solved.y), `${question.prompt}: the follow-up`);
    shapes[instance.values.shape] += 1;
  });
  assert.deepEqual(shapes, { sumAndTotal: 40, oneDefined: 40, equalCost: 40 });
});

test('systems.contextModel: each equation is right in any equivalent form and wrong as a different relation, on the server', () => {
  const family = getPlatformQuestionFamily('systems.contextModel');
  const swapSides = (equation) => equation.split('=').map((side) => side.trim()).reverse().join(' = ');
  const tripled = (equation) => equation.split('=').map((side) => `3(${side.trim()})`).join(' = ');
  instancesOf(family, {}, 60).forEach((instance) => {
    const question = build(family, instance);
    const key = keyOf(question);
    ['first', 'second'].forEach((id) => {
      assert.equal(question.answerFields.find((field) => field.id === id).equivalence, 'polynomialRelation');
      [swapSides(key[id]), tripled(key[id])].forEach((form) => assert.equal(grade(question, { ...key, [id]: form })?.isCorrect, true, `${key[id]} written ${form}`));
      // The same relation with its constant changed is a different line.
      assert.notEqual(grade(question, { ...key, [id]: `${key[id]} + 1` })?.isCorrect, true, `${key[id]} + 1`);
    });
    assert.notEqual(grade(question, { ...key, x: key.y, y: key.x })?.isCorrect, true, 'the two quantities swapped');
  });
});
