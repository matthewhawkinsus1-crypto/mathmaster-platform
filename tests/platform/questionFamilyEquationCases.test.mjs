/*
 * LINEAR EQUATION SPECIAL CASES — linear.multiStepEquation v2, linear.twoStepEquation v2.
 *
 * Every instance is judged by an oracle that shares no code with the family
 * (helpers/questionFamilyCases.mjs: mathjs fractions on the sides the
 * workspace opens with, the `equation` text and the LaTeX the prompt shows).
 * A family that says "no solution" must show an equation that has none; "one"
 * must have exactly one, the one in its key, written exactly.
 *
 * The case constructors are mutation-tested: the family is rebuilt from a
 * broken constructor table (defineMultiStepEquationV2) and the classification
 * inside the family's rules must refuse every instance the broken constructor
 * makes — and the independent oracle must see what each one really built.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FAMILY_ISSUE, resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  createFamilyInstanceSequence,
  evaluateFamilyCandidate,
  measureFamilyCapacity,
} from '../../functions/shared/questionFamilyEngine.mjs';
import {
  FAMILY_RESOLUTION_ERROR,
  resolveFamilyPreviewInstance,
  resolveQuestionFamilyDefinition,
} from '../../functions/shared/questionFamilyInstance.mjs';
import {
  MAX_ANSWER_DENOMINATOR,
  MULTI_STEP_CASE_CONSTRUCTORS,
  defineMultiStepEquationV2,
} from '../../functions/shared/questionFamiliesLinearCases.mjs';
import { add, rational } from '../../functions/shared/questionFamilyExact.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { KEY_CASE, equationOracle } from './helpers/questionFamilyCases.mjs';

const MULTI = getPlatformQuestionFamily('linear.multiStepEquation', 2);
const TWO = getPlatformQuestionFamily('linear.twoStepEquation', 2);

const slot = (family, constraints = {}, extra = {}) => ({
  questionId: `q-${family.id}-${JSON.stringify(constraints)}`,
  type: 'stepAlgebra',
  // The prompt shows the equation, so the oracle also reads the LaTeX a student sees.
  prompt: 'Solve {{equation}}.',
  questionFamily: { id: family.id, version: family.version, constraints },
  ...extra,
});

/** `count` instances of a slot, built as students receive them. */
const instancesOf = (family, constraints = {}, count = 60) => {
  const { values, fatal, issues } = resolveFamilyConstraints(family, constraints);
  assert.equal(fatal, false, JSON.stringify(issues));
  const sequence = createFamilyInstanceSequence(family, values, `cases|${JSON.stringify(constraints)}`);
  const list = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    assert.ok(instance, `${family.id} v${family.version} ${JSON.stringify(constraints)}: instance ${index} exists`);
    list.push({ instance, question: buildFamilyQuestion({ family, instance, constraintValues: values, authored: slot(family, constraints), tool: 'stepAlgebra' }) });
  }
  return list;
};

const NO_DECIMAL = /\d\.\d/;
const EXACT_FRACTION = /^-?\d+\/\d+$/;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const squeeze = (text) => String(text).replace(/\s+/g, '');

test('the oracle reads the equation from every place it is shown', () => {
  const [{ question }] = instancesOf(MULTI, { solutionCase: 'one' }, 1);
  assert.equal(equationOracle(question).readings, 3, 'the workspace sides, the equation text and the prompt LaTeX');
  // A key that disagrees with what is displayed is caught.
  assert.equal(equationOracle({ ...question, rightExpression: `${question.rightExpression} + 1` }).case, 'display-mismatch');
});

test('one solution: exactly one, and it is the key — integer answers stay integers', () => {
  for (const constraints of [{}, { solutionCase: 'one' }, { solutionCase: 'one', distribute: true }, { distribute: 'mixed' }]) {
    for (const { question } of instancesOf(MULTI, constraints)) {
      const oracle = equationOracle(question);
      assert.equal(oracle.case, 'one', `${question.equation}: ${oracle.case}`);
      assert.equal(question.solutionKey.outcome, 'value');
      assert.equal(oracle.value, question.solutionKey.value, `${question.equation}: the key is the solution`);
      assert.match(oracle.value, /^-?\d+$/, `${question.equation}: an integer answer by default`);
      assert.equal(question.generatedAnswer, Number(oracle.value), 'the numeric key every older grader reads');
      assert.notEqual(question.relationWorkspace, true, 'a one-solution slot opens the equation workspace');
    }
  }
  for (const constraints of [{}, { distribute: true }, { distribute: 'mixed' }]) {
    for (const { question } of instancesOf(TWO, constraints)) {
      const oracle = equationOracle(question);
      assert.equal(oracle.case, 'one', question.equation);
      assert.equal(oracle.value, question.solutionKey.value);
    }
  }
});

test('no solution: the variable terms cancel and the constants conflict, in what the student sees', () => {
  for (const constraints of [{ solutionCase: 'none' }, { solutionCase: 'none', distribute: true }, { solutionCase: 'none', coefficientForm: 'fraction' }]) {
    for (const { question } of instancesOf(MULTI, constraints)) {
      assert.equal(equationOracle(question).case, 'none', `${question.equation} must have no solution`);
      assert.deepEqual(question.solutionKey, { outcome: 'noSolution', display: 'No solution' });
      assert.equal(question.relationWorkspace, true, 'answered "No solution" in the relation workspace');
      assert.equal(question.generatedAnswer, undefined, 'never a numeric key for a special case');
      // Variables on both sides: neither side is a bare constant.
      assert.match(question.leftExpression, /x/);
      assert.match(question.rightExpression, /x/);
    }
  }
});

test('infinitely many: both sides simplify to the same expression, but are not written the same', () => {
  for (const constraints of [{ solutionCase: 'infinite' }, { solutionCase: 'infinite', distribute: true }, { solutionCase: 'infinite', coefficientForm: 'fraction' }]) {
    for (const { question } of instancesOf(MULTI, constraints)) {
      assert.equal(equationOracle(question).case, 'infinite', `${question.equation} must be an identity`);
      assert.deepEqual(question.solutionKey, { outcome: 'allReals', display: 'All real numbers' });
      assert.equal(question.relationWorkspace, true);
      assert.notEqual(squeeze(question.leftExpression), squeeze(question.rightExpression), `${question.equation}: not trivially identical sides`);
      const [left, right] = /\$([^$]*)\$/.exec(question.prompt)[1].split('=').map(squeeze);
      assert.notEqual(left, right, `${question.prompt}: not written the same on screen either`);
    }
  }
});

test('distribution: a no-solution equation can carry the a(x + b) + c = ax + d structure', () => {
  const seen = new Set();
  for (const { instance, question } of instancesOf(MULTI, { solutionCase: 'none', distribute: true }, 80)) {
    seen.add(instance.params.shape);
    assert.match(question.leftExpression, /\(x [+-] \d+\)|\(x\)/, `${question.equation}: a group to distribute on the left`);
    assert.equal(equationOracle(question).case, 'none');
  }
  assert.deepEqual([...seen].sort(), ['distributeConstant', 'distributeLikeTerms'], 'both distribution shapes appear');
  const plain = new Set(instancesOf(MULTI, { solutionCase: 'none', distribute: false }, 80).map(({ instance }) => instance.params.shape));
  assert.deepEqual([...plain].sort(), ['constants', 'likeTerms'], 'distribute: false never distributes');
});

test('fractions stay exact: a fraction is keyed as a fraction in lowest terms, never a decimal', () => {
  for (const [family, constraints] of [
    [MULTI, { solutionForm: 'fraction' }],
    [MULTI, { coefficientForm: 'fraction' }],
    [MULTI, { solutionCase: 'mixed', coefficientForm: 'fraction' }],
    [TWO, { solutionForm: 'fraction' }],
    [TWO, { coefficientForm: 'fraction', distribute: true }],
  ]) {
    let fractions = 0;
    for (const { question } of instancesOf(family, constraints)) {
      const visible = JSON.stringify([question.prompt, question.equation, question.leftExpression, question.rightExpression, question.solutionKey]);
      assert.doesNotMatch(visible, NO_DECIMAL, `${question.equation}: no decimal anywhere`);
      if (question.solutionKey.outcome !== 'value') continue;
      assert.equal(equationOracle(question).value, question.solutionKey.value, `${question.equation}: the exact solution is the key`);
      if (!EXACT_FRACTION.test(question.solutionKey.value)) continue;
      fractions += 1;
      const [numerator, denominator] = question.solutionKey.value.split('/').map(Number);
      assert.equal(gcd(numerator, denominator), 1, 'lowest terms');
      assert.ok(denominator > 1 && denominator <= MAX_ANSWER_DENOMINATOR, `a classroom denominator: ${denominator}`);
      assert.equal(question.generatedAnswer, undefined, 'a fraction is never stored as a float key');
      assert.match(question.solutionKey.latex, /^-?\\frac\{\d+\}\{\d+\}$/);
    }
    if (constraints.solutionForm === 'fraction') assert.ok(fractions >= 50, `${family.id} ${JSON.stringify(constraints)}: fraction answers (${fractions})`);
  }
  // A fraction coefficient is shown as a fraction, on screen and in the workspace.
  const [{ question }] = instancesOf(MULTI, { coefficientForm: 'fraction' }, 1);
  assert.match(question.prompt, /\\frac\{\d+\}\{\d+\}/);
  assert.match(question.equation, /\(\d+\/\d+\)/);
});

test('an invalid solutionCase is rejected — by value, by name, and on a family that has none — never defaulted', () => {
  const refused = (question) => {
    const definition = resolveQuestionFamilyDefinition(question);
    assert.equal(definition.error, FAMILY_RESOLUTION_ERROR.CONSTRAINT_INVALID, JSON.stringify(question.questionFamily));
    const preview = resolveFamilyPreviewInstance(question);
    assert.equal(preview.question, undefined, 'nothing is generated');
    assert.equal(preview.error, FAMILY_RESOLUTION_ERROR.CONSTRAINT_INVALID);
    return definition.issues.join(' ');
  };
  assert.match(refused(slot(MULTI, { solutionCase: 'two' })), /"solutionCase": "two" is not allowed by linear\.multiStepEquation v2; use one of "one", "none", "infinite", "mixed"/);
  assert.match(refused(slot(MULTI, { solutionCase: 'None' })), /not allowed/, 'case matters: "None" is not "none"');
  assert.match(refused(slot(MULTI, { solutioncase: 'none' })), /"solutioncase" is not a constraint of linear\.multiStepEquation v2 \(did you mean "solutionCase"\?/);
  assert.match(refused(slot(MULTI, { solution_case: 'none' })), /did you mean "solutionCase"/);
  assert.match(refused(slot(MULTI, { distribute: 'sometimes' })), /use one of false, true, "mixed"/);
  assert.match(refused(slot(MULTI, { coefficientForm: 'decimal' })), /use one of "integer", "fraction"/);
  assert.match(refused(slot(MULTI, { coefficientRange: [-100, 100] })), /whole-number range inside \[-15, 15\]/);
  // a·x + b = c has exactly one solution: v2 of the two-step family has no solutionCase.
  assert.match(refused(slot(TWO, { solutionCase: 'none' })), /"solutionCase" is not a constraint of linear\.twoStepEquation v2/);
  // A tool the family cannot fill is refused too, not opened in its default.
  assert.match(
    refused(slot(MULTI, { solutionCase: 'none' }, { questionFamily: { id: MULTI.id, version: 2, tool: 'multiAnswer', constraints: { solutionCase: 'none' } } })),
    /cannot be answered in the "multiAnswer" tool; use one of "stepAlgebra"/,
  );
  // Version 1 is untouched: it reports and keeps its defaults (Pre-Flight
  // blocks such a slot — see questionFamilyCasePreflight.test.mjs).
  const v1 = resolveQuestionFamilyDefinition(slot(getPlatformQuestionFamily('linear.multiStepEquation', 1), { solutionCase: 'none' }));
  assert.equal(v1.error, null);
  assert.equal(v1.constraintIssues[0].code, 'constraint_unknown');
});

test('generation safety: no division by zero, no one-solution case that collapses, nothing the workspace cannot read', () => {
  for (const constraints of [{ solutionCase: 'mixed', distribute: 'mixed' }, { solutionCase: 'mixed', coefficientForm: 'fraction' }]) {
    for (const { instance, question } of instancesOf(MULTI, constraints, 90)) {
      const oracle = equationOracle(question);
      assert.notEqual(oracle.case, 'unreadable', question.equation);
      assert.notEqual(oracle.case, 'display-mismatch', `${question.equation}: the prompt shows the graded equation`);
      assert.equal(oracle.case, KEY_CASE[question.solutionKey.outcome], `${question.equation}: the key's case is the equation's`);
      assert.equal(instance.params.case, oracle.case, 'the stratum is the case the student gets');
      // A slot that mixes cases opens the relation workspace for every case,
      // so the workspace never reveals which case a student drew.
      assert.equal(question.relationWorkspace, true);
      assert.doesNotMatch(question.equation, /\/\s*\(?0\)?(?!\d)/, 'no division by zero');
    }
  }
  // The rules refuse a "one solution" candidate whose variable terms cancel.
  const { values } = resolveFamilyConstraints(MULTI, {});
  const [{ instance }] = instancesOf(MULTI, {}, 1);
  const collapsed = evaluateFamilyCandidate(MULTI, values, { ...instance.params, s: instance.values.A });
  assert.equal(collapsed.valid, false);
  assert.ok(collapsed.issues.includes(FAMILY_ISSUE.CASE_MISMATCH), JSON.stringify(collapsed.issues));
});

/* ------------------------------------------------------------- mutation tests */

const MUTATIONS = Object.freeze({
  // A "no solution" constructor that writes an identity, or a solvable equation.
  'none writes an identity': { case: 'none', table: { ...MULTI_STEP_CASE_CONSTRUCTORS, none: ({ A, B }) => ({ s: A, t: B }) } },
  'none writes one solution': { case: 'none', table: { ...MULTI_STEP_CASE_CONSTRUCTORS, none: ({ A, t }) => ({ s: add(A, rational(1)), t }) } },
  // An "infinitely many" constructor that writes a contradiction, or one solution.
  'infinite writes a contradiction': { case: 'infinite', table: { ...MULTI_STEP_CASE_CONSTRUCTORS, infinite: ({ A, B }) => ({ s: A, t: add(B, rational(1)) }) } },
  'infinite writes one solution': { case: 'infinite', table: { ...MULTI_STEP_CASE_CONSTRUCTORS, infinite: ({ A, B }) => ({ s: add(A, rational(1)), t: B }) } },
  // A "one solution" constructor whose variable terms cancel, or whose key is off by one.
  'one collapses': { case: 'one', table: { ...MULTI_STEP_CASE_CONSTRUCTORS, one: ({ A, B }) => ({ s: A, t: B }) } },
  'one solves for the wrong value': {
    case: 'one',
    table: {
      ...MULTI_STEP_CASE_CONSTRUCTORS,
      one: ({ A, B, s, t, x }) => MULTI_STEP_CASE_CONSTRUCTORS.one({ A, B, s, t, x: x === null ? null : add(x, rational(1)) }),
    },
  },
});

test('mutation: every broken case constructor is refused by the family\'s own verification', () => {
  for (const [name, mutation] of Object.entries(MUTATIONS)) {
    const mutant = defineMultiStepEquationV2({ constructors: mutation.table });
    for (const distribute of [false, true]) {
      const constraints = { solutionCase: mutation.case, distribute };
      const { values } = resolveFamilyConstraints(MULTI, constraints);
      // Every parameter tuple the real family accepts…
      instancesOf(MULTI, constraints, 40).forEach(({ instance }) => {
        assert.equal(evaluateFamilyCandidate(MULTI, values, instance.params).valid, true);
        // …the broken constructor turns into an equation the rules refuse.
        const verdict = evaluateFamilyCandidate(mutant, values, instance.params);
        assert.equal(verdict.valid, false, `${name} (distribute ${distribute}): ${JSON.stringify(instance.params)} slipped through`);
        assert.ok(verdict.issues.includes(FAMILY_ISSUE.CASE_MISMATCH), `${name}: refused as a case mismatch (${verdict.issues})`);
      });
      // And a slot on the mutant generates nothing for that case.
      assert.equal(measureFamilyCapacity(mutant, values, { budget: 3000 }).capacity, 0, `${name} (distribute ${distribute}): the mutant generates nothing`);
    }
  }
});

test('mutation: the independent oracle sees what each broken constructor really built', () => {
  for (const [name, mutation] of Object.entries(MUTATIONS)) {
    const mutant = defineMultiStepEquationV2({ constructors: mutation.table });
    const constraints = { solutionCase: mutation.case };
    const { values: constraintValues } = resolveFamilyConstraints(MULTI, constraints);
    instancesOf(MULTI, constraints, 15).forEach(({ instance }) => {
      // The mutant's equation as a student would be shown it, built by the
      // family's own tool from the mutant's numbers (its rules bypassed).
      const values = Object.freeze({ ...instance.params, ...mutant.derive(instance.params, constraintValues) });
      const shown = mutant.tools.stepAlgebra(values, { constraints: constraintValues, authored: { prompt: 'Solve {{equation}}.' } });
      const oracle = equationOracle(shown);
      const intended = mutation.case === 'one' ? `one:${instance.params.x}` : mutation.case;
      const seen = oracle.case === 'one' && mutation.case === 'one' ? `one:${oracle.value}` : oracle.case;
      assert.notEqual(seen, intended, `${name}: ${shown.equation} reads as ${seen}`);
    });
  }
});

test('capacity: every case setting gives a class of 30 its own question many times over', () => {
  for (const [family, constraints] of [
    [MULTI, { solutionCase: 'one' }],
    [MULTI, { solutionCase: 'none' }],
    [MULTI, { solutionCase: 'infinite' }],
    [MULTI, { solutionCase: 'mixed' }],
    [MULTI, { solutionCase: 'none', distribute: true }],
    [MULTI, { solutionCase: 'infinite', distribute: true }],
    [MULTI, { solutionForm: 'fraction' }],
    [TWO, {}],
    [TWO, { distribute: true }],
    [TWO, { coefficientForm: 'fraction' }],
  ]) {
    const { values } = resolveFamilyConstraints(family, constraints);
    const { capacity } = measureFamilyCapacity(family, values, { budget: 2048 });
    assert.ok(capacity >= 1000, `${family.id} v${family.version} ${JSON.stringify(constraints)}: ${capacity}`);
  }
});
