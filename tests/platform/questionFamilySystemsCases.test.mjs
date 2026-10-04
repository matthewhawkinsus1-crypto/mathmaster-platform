/*
 * ALGEBRAIC 2×2 SYSTEMS — systems.algebraic2x2 v1, all three cases.
 *
 * Every system is judged by an oracle that shares no code with the family
 * (helpers/questionFamilyCases.mjs: mathjs fractions on the equations as the
 * student reads them — the determinant and the augmented minors). One
 * solution must be one intersection, at the key, exactly; no solution must be
 * parallel distinct lines; infinitely many must be one line written two ways.
 *
 * Grading is checked on the shared Systems Workspace grader the browser runs
 * and on the server dispatch, over the same bytes, for the outcomes the
 * request names: the correct ordered pair, the reversed pair, a point on only
 * one line, correct and incorrect "no solution" and "infinitely many", and an
 * exact fractional pair (whose decimal approximation is refused).
 *
 * The case constructors are mutation-tested through defineAlgebraicSystemFamily.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { FAMILY_ISSUE, resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  createFamilyInstanceSequence,
  evaluateFamilyCandidate,
  measureFamilyCapacity,
} from '../../functions/shared/questionFamilyEngine.mjs';
import { FAMILY_RESOLUTION_ERROR, resolveQuestionFamilyDefinition } from '../../functions/shared/questionFamilyInstance.mjs';
import { SYSTEM_CASE_CONSTRUCTORS, defineAlgebraicSystemFamily } from '../../functions/shared/questionFamiliesSystemsAlgebraic.mjs';
import { add, multiply, rational } from '../../functions/shared/questionFamilyExact.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { pointWork, specialWork } from './helpers/algebraicSystemWork.mjs';
import { KEY_CASE, gradeBothWays, systemOracle } from './helpers/questionFamilyCases.mjs';

const math = create(all, { number: 'Fraction' });
const SYSTEMS = getPlatformQuestionFamily('systems.algebraic2x2', 1);

const slot = (constraints = {}, extra = {}) => ({
  questionId: `sys-${JSON.stringify(constraints)}`,
  type: 'systemsWorkspace',
  prompt: '',
  questionFamily: { id: SYSTEMS.id, version: SYSTEMS.version, constraints },
  ...extra,
});

const instancesOf = (constraints = {}, count = 60, extra = {}) => {
  const { values, fatal, issues } = resolveFamilyConstraints(SYSTEMS, constraints);
  assert.equal(fatal, false, JSON.stringify(issues));
  const sequence = createFamilyInstanceSequence(SYSTEMS, values, `systems|${JSON.stringify(constraints)}`);
  return Array.from({ length: count }, (_, index) => {
    const instance = sequence.instanceAt(index);
    assert.ok(instance, `${JSON.stringify(constraints)}: instance ${index}`);
    return { instance, question: buildFamilyQuestion({ family: SYSTEMS, instance, constraintValues: values, authored: slot(constraints, extra), tool: 'systemsWorkspace' }) };
  });
};

const toNumber = (text) => Number(math.fraction(text).valueOf());
const NO_DECIMAL = /\d\.\d/;

/** The verdict both graders reach on this work — asserted identical. */
const verdict = (question, work) => {
  const { browser, server } = gradeBothWays(question, work);
  assert.equal(server.graded, true, server.reason);
  assert.equal(server.isCorrect, browser.isCorrect, 'browser and server agree');
  assert.deepEqual(server.parts, browser.parts, 'part for part');
  return browser.isCorrect;
};

test('one solution: exactly one intersection, at the key, in integers by default', () => {
  for (const extra of [{}, { method: 'substitution' }, { method: 'elimination' }]) {
    for (const { question } of instancesOf({ solutionCase: 'one' }, 60, extra)) {
      const oracle = systemOracle(question);
      assert.equal(oracle.case, 'one', question.equations.join(' ; '));
      assert.equal(question.solutionKey.outcome, 'point');
      assert.equal(oracle.x, question.solutionKey.x);
      assert.equal(oracle.y, question.solutionKey.y);
      assert.match(`${oracle.x},${oracle.y}`, /^-?\d+,-?\d+$/, 'integer intersection by default');
      assert.equal(question.exactSolution, true);
      // The rows are not multiples of each other: not two equations that merely look different.
      const [first, second] = oracle.rows;
      assert.ok(!math.equal(math.multiply(first.a, second.b), math.multiply(first.b, second.a)));
    }
  }
});

test('no solution: genuinely parallel, distinct lines', () => {
  for (const { question } of instancesOf({ solutionCase: 'none' })) {
    const oracle = systemOracle(question);
    assert.equal(oracle.case, 'none', question.equations.join(' ; '));
    assert.deepEqual(question.solutionKey, { outcome: 'noSolution', classification: 'inconsistent', display: 'No solution' });
    const [first, second] = oracle.rows;
    // Same left side up to a multiple k (never ±1), a different constant.
    const k = math.divide(second.a, first.a);
    assert.ok(math.equal(second.b, math.multiply(k, first.b)), 'parallel');
    assert.ok(!math.equal(second.c, math.multiply(k, first.c)), 'distinct');
    assert.ok(!math.equal(math.abs(k), 1), `the second equation is scaled (${k}), not a sign flip of the first`);
    if (!math.equal(first.b, 0)) {
      const slope = (row) => math.divide(math.unaryMinus(row.a), row.b);
      const intercept = (row) => math.divide(row.c, row.b);
      assert.ok(math.equal(slope(first), slope(second)), 'equal slopes');
      assert.ok(!math.equal(intercept(first), intercept(second)), 'different intercepts');
    }
  }
});

test('infinitely many: one line, genuinely written two different ways', () => {
  for (const { question } of instancesOf({ solutionCase: 'infinite' })) {
    const oracle = systemOracle(question);
    assert.equal(oracle.case, 'infinite', question.equations.join(' ; '));
    assert.deepEqual(question.solutionKey, { outcome: 'infinite', classification: 'consistent-dependent', display: 'Infinitely many solutions' });
    const [first, second] = oracle.rows;
    const k = math.divide(second.a, first.a);
    ['a', 'b', 'c'].forEach((part) => assert.ok(math.equal(second[part], math.multiply(k, first[part])), `${part}: the whole equation scaled`));
    assert.ok(!math.equal(math.abs(k), 1), 'not merely the same equation, or its negation');
    assert.notEqual(question.equations[0].replace(/\s+/g, ''), question.equations[1].replace(/\s+/g, ''));
  }
});

test('fraction solution: the intersection is exact — fractions, never decimals — and graded exactly', () => {
  let fractional = 0;
  for (const { question } of instancesOf({ solutionCase: 'one', solutionForm: 'fraction' }, 80)) {
    const oracle = systemOracle(question);
    assert.equal(oracle.case, 'one');
    assert.equal(oracle.x, question.solutionKey.x);
    assert.equal(oracle.y, question.solutionKey.y);
    assert.doesNotMatch(JSON.stringify([question.prompt, question.equations, question.solutionKey]), NO_DECIMAL);
    const coordinates = [oracle.x, oracle.y].filter((value) => value.includes('/'));
    assert.ok(coordinates.length >= 1, `${question.equations.join(' ; ')}: a genuinely fractional intersection`);
    coordinates.forEach((value) => assert.ok([2, 3, 4].includes(Number(value.split('/')[1])), `${value}: halves, thirds or quarters`));
    fractional += 1;
  }
  assert.equal(fractional, 80);
});

test('classroom bounds: whole-number coefficients within ±12, constants within ±60, nothing that collapses into another case', () => {
  for (const { instance, question } of instancesOf({ solutionCase: 'mixed' }, 120)) {
    const oracle = systemOracle(question);
    assert.equal(oracle.case, instance.params.case, `${question.equations.join(' ; ')}: generated as ${instance.params.case}`);
    assert.equal(oracle.case, KEY_CASE[question.solutionKey.outcome], 'the key is the system\'s case');
    oracle.rows.forEach((row) => {
      ['a', 'b', 'c'].forEach((part) => assert.equal(Number(row[part].d), 1, `${part} is a whole number`));
      assert.ok(Math.abs(row.a.valueOf()) <= 12 && Math.abs(row.b.valueOf()) <= 12, 'coefficients within ±12');
      assert.ok(!math.equal(row.a, 0) && !math.equal(row.b, 0), 'both variables in both equations');
      assert.ok(Math.abs(row.c.valueOf()) <= 60, 'constants within ±60');
    });
  }
});

test('method freedom: the student chooses unless the slot authors substitution or elimination', () => {
  const [{ question: open }] = instancesOf({ solutionCase: 'mixed' }, 1);
  assert.equal(open.method, 'studentChoice');
  assert.equal(open.mode, 'algebraic');
  assert.equal(instancesOf({}, 1, { method: 'substitution' })[0].question.method, 'substitution');
  assert.equal(instancesOf({}, 1, { method: 'elimination' })[0].question.method, 'elimination');
  assert.equal(instancesOf({}, 1, { method: 'graphing' })[0].question.method, 'studentChoice', 'a method the workspace does not have is not forced');
  // The grade is the mathematics: the same correct work is credited whichever method it reports.
  const [{ question }] = instancesOf({ solutionCase: 'one' }, 1);
  const point = { x: toNumber(question.solutionKey.x), y: toNumber(question.solutionKey.y) };
  for (const method of ['substitution', 'elimination']) {
    assert.equal(verdict(question, pointWork(question, point, { method })), true, method);
    assert.equal(verdict({ ...question, method }, pointWork(question, point, { method: method === 'substitution' ? 'elimination' : 'substitution' })), true, `${method} authored, the other reported`);
  }
});

test('server grading: ordered pair, reversed pair, a point on only one line', () => {
  const pick = instancesOf({ solutionCase: 'one' }, 60).map(({ question }) => question)
    .find((candidate) => candidate.solutionKey.x !== candidate.solutionKey.y);
  const x = toNumber(pick.solutionKey.x);
  const y = toNumber(pick.solutionKey.y);
  assert.equal(verdict(pick, pointWork(pick, { x, y })), true, 'the correct ordered pair');
  assert.equal(verdict(pick, pointWork(pick, { x: y, y: x })), false, 'the reversed pair');
  // On the first line, off the second: move along the first line's direction.
  const [first] = systemOracle(pick).rows;
  const onFirst = { x: x + Number(first.b.valueOf()), y: y - Number(first.a.valueOf()) };
  assert.equal(verdict(pick, pointWork(pick, onFirst)), false, 'a point that satisfies only one equation');
  // And the unverified pair is not the complete work.
  assert.equal(verdict(pick, pointWork(pick, { x, y }, { verify: false })), false, 'verification is part of the work');
});

test('server grading: no solution and infinitely many, correct and incorrect', () => {
  const [{ question: none }] = instancesOf({ solutionCase: 'none' }, 1);
  const [{ question: infinite }] = instancesOf({ solutionCase: 'infinite' }, 1);
  const [{ question: one }] = instancesOf({ solutionCase: 'one' }, 1);
  const readings = {
    none: { truth: 'false', count: 'none', classification: 'inconsistent', statement: '0 = 7' },
    infinite: { truth: 'true', count: 'infinite', classification: 'consistent-dependent', statement: '0 = 0' },
  };
  assert.equal(verdict(none, specialWork(none, readings.none)), true, 'correct No Solution');
  assert.equal(verdict(none, specialWork(none, readings.infinite)), false, 'No Solution system read as infinite');
  assert.equal(verdict(none, specialWork(none, { ...readings.none, classification: 'consistent-dependent' })), false, 'right count, wrong classification');
  assert.equal(verdict(infinite, specialWork(infinite, readings.infinite)), true, 'correct Infinite Solutions');
  assert.equal(verdict(infinite, specialWork(infinite, readings.none)), false, 'Infinite system read as no solution');
  assert.equal(verdict(infinite, specialWork(infinite, { ...readings.infinite, truth: 'false' })), false, '0 = 0 called false');
  // "No solution" or "infinitely many" for a system with one intersection is wrong, and is not offered a special rubric.
  assert.equal(verdict(one, specialWork(one, readings.none)), false, 'incorrect No Solution');
  assert.equal(verdict(one, specialWork(one, readings.infinite)), false, 'incorrect Infinite Solutions');
  // And an ordered pair for a special system is never credited.
  assert.equal(verdict(none, pointWork(none, { x: 1, y: 1 })), false);
});

test('server grading: an exact fractional pair is credited exactly; its decimal approximation is not', () => {
  const [{ question }] = instancesOf({ solutionCase: 'one', solutionForm: 'fraction' }, 1);
  const x = toNumber(question.solutionKey.x);
  const y = toNumber(question.solutionKey.y);
  assert.equal(verdict(question, pointWork(question, { x, y })), true, `(${question.solutionKey.x}, ${question.solutionKey.y}) exactly`);
  const rounded = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  assert.ok(rounded.x !== x || rounded.y !== y, 'the approximation differs');
  // The values alone (verification off, so only the values are judged):
  // a generated system matches them exactly…
  const valuesOnly = { ...question, requireVerification: false };
  assert.equal(verdict(valuesOnly, pointWork(valuesOnly, { x, y }, { verify: false })), true);
  assert.equal(verdict(valuesOnly, pointWork(valuesOnly, rounded, { verify: false })), false, `(${rounded.x}, ${rounded.y}) is not the exact intersection`);
  // …while a hand-authored 2×2 keeps the 0.05 tolerance it has always had.
  const authored = { ...valuesOnly, exactSolution: undefined, familyInstance: undefined };
  assert.equal(verdict(authored, pointWork(authored, rounded, { verify: false })), true, 'hand-authored content is graded as before');
  // With verification on, a rounded point fails anyway: the equations do not hold there.
  assert.equal(verdict(question, { ...pointWork(question, { x, y }), values: rounded }), false);
});

test('an invalid constraint is rejected, never defaulted', () => {
  const refused = (constraints) => {
    const definition = resolveQuestionFamilyDefinition(slot(constraints));
    assert.equal(definition.error, FAMILY_RESOLUTION_ERROR.CONSTRAINT_INVALID, JSON.stringify(constraints));
    return definition.issues.join(' ');
  };
  assert.match(refused({ solutionCase: 'parallel' }), /use one of "one", "none", "infinite", "mixed"/);
  assert.match(refused({ solutionForm: 'decimal' }), /use one of "integer", "fraction"/);
  assert.match(refused({ SolutionCase: 'none' }), /did you mean "solutionCase"/);
  // The method is the question's instructional choice, not a family constraint.
  assert.match(refused({ method: 'substitution' }), /"method" is not a constraint of systems\.algebraic2x2 v1/);
});

/* ------------------------------------------------------------- mutation tests */

const MUTATIONS = Object.freeze({
  'none writes the same line': { case: 'none', table: { ...SYSTEM_CASE_CONSTRUCTORS, none: ({ a1, b1, c1, k }) => SYSTEM_CASE_CONSTRUCTORS.infinite({ a1, b1, c1, k }) } },
  'none writes crossing lines': {
    case: 'none',
    table: { ...SYSTEM_CASE_CONSTRUCTORS, none: (numbers) => { const [first, second] = SYSTEM_CASE_CONSTRUCTORS.none(numbers); return [first, { ...second, b: add(second.b, rational(1)) }]; } },
  },
  'infinite writes parallel lines': {
    case: 'infinite',
    table: { ...SYSTEM_CASE_CONSTRUCTORS, infinite: (numbers) => { const [first, second] = SYSTEM_CASE_CONSTRUCTORS.infinite(numbers); return [first, { ...second, c: add(second.c, rational(1)) }]; } },
  },
  'infinite writes crossing lines': {
    case: 'infinite',
    table: { ...SYSTEM_CASE_CONSTRUCTORS, infinite: (numbers) => { const [first, second] = SYSTEM_CASE_CONSTRUCTORS.infinite(numbers); return [first, { ...second, a: add(second.a, rational(1)) }]; } },
  },
  'one writes parallel lines': {
    case: 'one',
    table: { ...SYSTEM_CASE_CONSTRUCTORS, one: ({ a1, b1, x0, y0 }) => SYSTEM_CASE_CONSTRUCTORS.one({ a1, b1, a2: multiply(a1, rational(2)), b2: multiply(b1, rational(2)), x0, y0 }) },
  },
  'one misses its point': {
    case: 'one',
    table: { ...SYSTEM_CASE_CONSTRUCTORS, one: (numbers) => { const [first, second] = SYSTEM_CASE_CONSTRUCTORS.one(numbers); return [first, { ...second, c: add(second.c, numbers.a2) }]; } },
  },
});

test('mutation: every broken case constructor is refused by the family\'s own classification', () => {
  for (const [name, mutation] of Object.entries(MUTATIONS)) {
    const mutant = defineAlgebraicSystemFamily({ constructors: mutation.table });
    const constraints = { solutionCase: mutation.case };
    const { values } = resolveFamilyConstraints(SYSTEMS, constraints);
    instancesOf(constraints, 40).forEach(({ instance }) => {
      assert.equal(evaluateFamilyCandidate(SYSTEMS, values, instance.params).valid, true);
      const result = evaluateFamilyCandidate(mutant, values, instance.params);
      assert.equal(result.valid, false, `${name}: ${JSON.stringify(instance.params)} slipped through`);
      assert.ok(result.issues.includes(FAMILY_ISSUE.CASE_MISMATCH), `${name}: ${result.issues}`);
    });
    assert.equal(measureFamilyCapacity(mutant, values, { budget: 3000 }).capacity, 0, `${name}: the mutant generates nothing`);
  }
});

test('mutation: the independent oracle sees what each broken constructor really built', () => {
  for (const [name, mutation] of Object.entries(MUTATIONS)) {
    const mutant = defineAlgebraicSystemFamily({ constructors: mutation.table });
    const constraints = { solutionCase: mutation.case };
    const { values: constraintValues } = resolveFamilyConstraints(SYSTEMS, constraints);
    instancesOf(constraints, 15).forEach(({ instance }) => {
      const values = Object.freeze({ ...instance.params, ...mutant.derive(instance.params, constraintValues) });
      const shown = mutant.tools.systemsWorkspace(values, { constraints: constraintValues, authored: {} });
      const oracle = systemOracle(shown);
      const intended = mutation.case === 'one' ? `one:${instance.params.x0},${instance.params.y0}` : mutation.case;
      const seen = oracle.case === 'one' && mutation.case === 'one' ? `one:${oracle.x},${oracle.y}` : oracle.case;
      assert.notEqual(seen, intended, `${name}: ${shown.equations.join(' ; ')} reads as ${seen}`);
    });
  }
});

test('capacity: every case gives a class of 30 its own system many times over', () => {
  for (const constraints of [{ solutionCase: 'one' }, { solutionCase: 'none' }, { solutionCase: 'infinite' }, { solutionCase: 'mixed' }, { solutionForm: 'fraction' }]) {
    const { values } = resolveFamilyConstraints(SYSTEMS, constraints);
    const { capacity } = measureFamilyCapacity(SYSTEMS, values, { budget: 2048 });
    assert.ok(capacity >= 1000, `${JSON.stringify(constraints)}: ${capacity}`);
  }
});
