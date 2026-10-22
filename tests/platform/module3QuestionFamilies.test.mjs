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

const MULTI_ANSWER_FAMILIES = Object.freeze({
  'equations.verifySolution': { alignment: 'A.5A', minimum: 1000 },
  'linear.contextFunction': { alignment: 'A.3B', minimum: 120 },
  'inequalities.translatePhrase': { alignment: 'A.5B', minimum: 1000 },
  'inequalities.contextModel': { alignment: 'A.5B', minimum: 200 },
  'systems.classifyByStructure': { alignment: 'A.3F', minimum: 1000 },
  'systems.knownValue': { alignment: 'A.5C', minimum: 150 },
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

test('each Module 3 family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  ['questionFamiliesSolvingEquations', 'questionFamiliesInequalities', 'questionFamiliesSystemsGraphing', 'questionFamiliesSubstitution'].forEach((name) => {
    const source = readFileSync(new URL(`../../functions/shared/${name}.mjs`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
    assert.deepEqual(imports, ['./questionFamilyContract.mjs'], `${name}: no tool math, no grader, no browser module`);
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
    assert.equal(key.consistency, expected === 'none' ? 'Inconsistent' : 'Consistent');
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
