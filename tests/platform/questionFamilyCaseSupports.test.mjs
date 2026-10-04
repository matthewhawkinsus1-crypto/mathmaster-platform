/*
 * REDUCED COMPLEXITY NEVER CHANGES THE CONCEPT.
 *
 * A student with the reduced-complexity support is given smaller numbers —
 * nothing else. The solution case, the distributive step and an exact
 * fraction answer are concept constraints (conceptConstraints): a support
 * cannot override them, and the contract refuses a family that tries.
 *
 *   target "no solution"           → the supported version has no solution
 *   target "infinitely many"       → the supported version is an identity
 *   target a fraction answer       → the supported answer is still a fraction
 *   target distribution            → the supported equation still distributes
 *   target a parallel 2×2 system   → still parallel; an equivalent one still equivalent
 *
 * Changing a complexity dimension that IS the lesson's objective (making a
 * fraction answer an integer) would need a support policy that explicitly
 * allows it for that dimension; no family declares one, so none happens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { defineQuestionFamily, intDomain, choiceKnob, rangeKnob } from '../../functions/shared/questionFamilyContract.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { KEY_CASE, STUDENTS, deliverTo, equationOracle, seatedAssignment, systemOracle } from './helpers/questionFamilyCases.mjs';

const SUPPORT = 'reduce-complexity';
const multi = (questionId, constraints) => ({ questionId, type: 'stepAlgebra', questionFamily: { id: 'linear.multiStepEquation', version: 2, constraints } });
const system = (questionId, constraints) => ({ questionId, type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints } });

const SLOTS = Object.freeze([
  multi('none', { solutionCase: 'none' }),
  multi('infinite', { solutionCase: 'infinite' }),
  multi('none-distribute', { solutionCase: 'none', distribute: true }),
  multi('infinite-distribute', { solutionCase: 'infinite', distribute: true }),
  multi('fraction', { solutionCase: 'one', solutionForm: 'fraction' }),
  multi('mixed', { solutionCase: 'mixed' }),
  { questionId: 'two-step-fraction', type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation', version: 2, constraints: { solutionForm: 'fraction', distribute: true } } },
  system('sys-none', { solutionCase: 'none' }),
  system('sys-infinite', { solutionCase: 'infinite' }),
  system('sys-fraction', { solutionCase: 'one', solutionForm: 'fraction' }),
]);
const assignment = seatedAssignment('qf-case-supports', SLOTS);

const caseOf = (question) => (question.type === 'systemsWorkspace' ? systemOracle(question) : equationOracle(question));
const numbersIn = (question) => (question.type === 'systemsWorkspace' ? question.equations.join(' ') : question.equation)
  .match(/\d+/g).map(Number);

test('the families declare which constraints are the concept, and the support narrows only numbers', () => {
  const multiStep = getPlatformQuestionFamily('linear.multiStepEquation', 2);
  const twoStep = getPlatformQuestionFamily('linear.twoStepEquation', 2);
  const systems = getPlatformQuestionFamily('systems.algebraic2x2', 1);
  assert.deepEqual([...multiStep.conceptConstraints].sort(), ['coefficientForm', 'distribute', 'solutionCase', 'solutionForm']);
  assert.deepEqual([...twoStep.conceptConstraints].sort(), ['coefficientForm', 'distribute', 'solutionForm']);
  assert.deepEqual([...systems.conceptConstraints].sort(), ['solutionCase', 'solutionForm']);
  for (const family of [multiStep, twoStep, systems]) {
    const overrides = Object.keys(family.supportConstraints[SUPPORT]);
    assert.ok(overrides.length > 0);
    overrides.forEach((name) => {
      assert.ok(!family.conceptConstraints.includes(name), `${family.id}: the support touches only number ranges (${name})`);
      assert.equal(family.constraints[name].kind, 'range', `${family.id}.${name} is a range`);
    });
  }
});

test('a family whose support would change a concept constraint is refused when it is defined', () => {
  const spec = {
    id: 'test.supportChangesConcept',
    version: 1,
    title: 'Support changes the case',
    skill: { objective: 'x' },
    difficulty: { band: 2, dok: 1 },
    constraints: { solutionCase: choiceKnob('none', ['one', 'none']), range: rangeKnob([1, 9]) },
    conceptConstraints: ['solutionCase'],
    supportConstraints: { [SUPPORT]: { solutionCase: 'one' } },
    tools: { multiAnswer: () => ({}) },
    parameters: () => ({ x: intDomain(1, 3) }),
    derive: () => ({}),
    rules: () => [],
    fingerprint: () => 'f',
    answer: () => ({ value: 1 }),
  };
  assert.throws(() => defineQuestionFamily(spec), /supportConstraints\.reduce-complexity\.solutionCase would change what is assessed/);
  // Narrowing a number range is allowed.
  assert.doesNotThrow(() => defineQuestionFamily({ ...spec, id: 'test.supportNarrows', supportConstraints: { [SUPPORT]: { range: [1, 3] } } }));
});

SLOTS.forEach((slot, storageIndex) => {
  test(`reduced complexity keeps the concept: ${slot.questionId}`, () => {
    const family = getPlatformQuestionFamily(slot.questionFamily.id, slot.questionFamily.version);
    const narrowed = family.supportConstraints[SUPPORT];
    const supported = STUDENTS.map((studentId) => deliverTo(assignment, storageIndex, studentId, { support: SUPPORT }));
    const ordinary = STUDENTS.map((studentId) => deliverTo(assignment, storageIndex, studentId));
    supported.forEach((result) => {
      assert.equal(result.error, null);
      assert.equal(result.delivery.support, SUPPORT, 'the delivery records the support');
      const requested = slot.questionFamily.constraints;
      const oracle = caseOf(result.question);
      // The case the slot asked for, from the question the student SEES.
      if (requested.solutionCase && requested.solutionCase !== 'mixed') assert.equal(oracle.case, requested.solutionCase, `${result.question.equation || result.question.equations}`);
      assert.equal(KEY_CASE[result.question.solutionKey.outcome], oracle.case, 'the key is the case shown');
      // A fraction answer stays a fraction.
      if (requested.solutionForm === 'fraction') {
        const answer = result.question.type === 'systemsWorkspace'
          ? `${result.question.solutionKey.x},${result.question.solutionKey.y}`
          : result.question.solutionKey.value;
        assert.match(answer, /\//, `${answer}: still a fraction`);
      }
      // Distribution stays distribution.
      if (requested.distribute === true) assert.match(result.question.leftExpression, /\(x/, 'still distributes');
      // Smaller numbers: a system's free coefficients come from the narrowed
      // range (a special system's second equation is a multiple of the first).
      if (result.question.type === 'systemsWorkspace') {
        const rows = systemOracle(result.question).rows;
        const bounded = oracle.case === 'one' ? rows : rows.slice(0, 1);
        bounded.forEach((row) => {
          assert.ok(Math.abs(Number(row.a)) <= narrowed.coefficientRange[1] && Math.abs(Number(row.b)) <= narrowed.coefficientRange[1], 'coefficients from the narrowed range');
        });
      }
    });
    // Across the class, the supported versions use smaller numbers than the ordinary ones.
    const mean = (results) => {
      const numbers = results.flatMap((result) => numbersIn(result.question));
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    };
    assert.ok(mean(supported) < mean(ordinary), `smaller numbers: ${mean(supported).toFixed(2)} vs ${mean(ordinary).toFixed(2)}`);
    // Supported students are still uniquely seated among themselves.
    assert.equal(new Set(supported.map((result) => result.instance.fingerprint)).size, supported.length, 'unique among supported students');
    // And the supported list is its own list, not the ordinary one with a filter.
    assert.notDeepEqual(supported.map((result) => result.instance.fingerprint), ordinary.map((result) => result.instance.fingerprint));
  });
});

test('a mixed slot keeps every case for supported students too', () => {
  const storageIndex = SLOTS.findIndex((slot) => slot.questionId === 'mixed');
  const cases = {};
  STUDENTS.forEach((studentId) => {
    const result = deliverTo(assignment, storageIndex, studentId, { support: SUPPORT });
    const shown = equationOracle(result.question).case;
    cases[shown] = (cases[shown] || 0) + 1;
  });
  assert.deepEqual(cases, { one: 10, none: 10, infinite: 10 });
});
