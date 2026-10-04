/*
 * EVERY SEAT CAN FINISH: THE WORKSPACES' OWN ENGINES, ALL THIRTY STUDENTS.
 *
 * The browser journeys (tests/browser/questionFamilyCases.mjs) drive the real
 * controls for a student of each case. This suite walks EVERY seated
 * student's version through the same engines those controls call, with each
 * step checked by the engine's own validator, and grades the finished work on
 * the browser's grader and the server's:
 *
 *   Step Algebra, equation workspace (a one-solution slot): rewrite each side
 *     to a·x + b (an equivalent rewrite, as Rewrite / Simplify checks it),
 *     then balanced moves to x = value.
 *   Step Algebra, relation workspace (a special-case or mixed slot): the same
 *     rewrite and balanced moves, validated by validateRelationTransition; a
 *     statement with no variable left is concluded "No solution" / "All real
 *     numbers" exactly when the engine accepts that claim — and the opposite
 *     claim is refused.
 *   Systems Workspace, algebraic: elimination (scale, combine, the variable
 *     cancels) and substitution (isolate, substitute, reduce), then either the
 *     statement with no variable read true or false, or the remaining variable
 *     solved, back-substituted and both equations verified.
 *
 * The family's key is used only to judge the outcome the walk reached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { applyBalancedOperation, expressionsEquivalent, isSolvedEquation, parseEquationInput } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import {
  applyBalancedOperationToRelation,
  constantRelationTruth,
  obviousSpecialClaim,
  parseRelationSource,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  applyEquationMultiplier,
  combineCoefficients,
  degenerateStatementTruth,
  eliminatesVariable,
  isDegenerateStatement,
  linearEquationCoefficients,
  substituteIntoEquation,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { equationWorkspaceWork, relationWorkspaceWork } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { pointWork, specialWork } from './helpers/algebraicSystemWork.mjs';
import { STUDENTS, deliverTo, gradeBothWays, seatedAssignment, systemRow } from './helpers/questionFamilyCases.mjs';

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const fractionText = (value) => {
  const fraction = F(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const asNumber = (value) => Number(F(value).valueOf());

/** a·x + b of one side, exactly. */
const linearOf = (expression, variable) => {
  const node = math.parse(String(expression));
  const at = (value) => F(node.evaluate({ [variable]: F(value) }));
  const b = at(0);
  return { a: math.subtract(at(1), b), b };
};
/** "(5/4) * x - 21": a·x + b as the student types it. */
const linearText = ({ a, b }, variable) => {
  const terms = [];
  if (!math.equal(a, 0)) terms.push(`(${fractionText(a)}) * ${variable}`);
  if (!math.equal(b, 0) || !terms.length) terms.push(`(${fractionText(b)})`);
  return terms.join(' + ');
};

/* ------------------------------------------------------------- Step Algebra */

/** Rewrite, move the variable, move the constant, divide — on the equation workspace's engine. */
const walkEquationWorkspace = (question) => {
  const variable = question.variable;
  const left = linearOf(question.leftExpression, variable);
  const right = linearOf(question.rightExpression, variable);
  // Rewrite / Simplify accepts each side's simplified form as equivalent.
  const rewrittenLeft = linearText(left, variable);
  const rewrittenRight = linearText(right, variable);
  assert.equal(expressionsEquivalent(question.leftExpression, rewrittenLeft, variable), true, `${question.equation}: left rewrite`);
  assert.equal(expressionsEquivalent(question.rightExpression, rewrittenRight, variable), true, `${question.equation}: right rewrite`);
  let state = parseEquationInput({ ...question, equation: `${rewrittenLeft} = ${rewrittenRight}`, leftExpression: rewrittenLeft, rightExpression: rewrittenRight });
  const moves = [];
  if (!math.equal(right.a, 0)) moves.push(['subtract', `(${fractionText(right.a)}) * ${variable}`]);
  if (!math.equal(left.b, 0)) moves.push(['subtract', `(${fractionText(left.b)})`]);
  const coefficient = math.subtract(left.a, right.a);
  if (!math.equal(coefficient, 1)) moves.push(['divide', `(${fractionText(coefficient)})`]);
  moves.forEach(([operation, operand]) => { state = applyBalancedOperation({ equationState: state, operation, operand }).simplified; });
  assert.equal(isSolvedEquation(state), true, `${question.equation}: isolated (${state.left} = ${state.right})`);
  return equationWorkspaceWork({ equation: { left: state.left, right: state.right } });
};

/** The same walk on the relation workspace's engine, ending on a claim when no variable is left. */
const walkRelationWorkspace = (question) => {
  const variable = question.variable;
  const source = parseRelationSource(question.equation, variable);
  const left = linearOf(question.leftExpression, variable);
  const right = linearOf(question.rightExpression, variable);
  const rewrite = (state, expressions) => {
    const next = { ...state, branches: [{ expressions, relations: ['='] }] };
    assert.equal(validateRelationTransition(state, next, { kind: 'equivalentRewrite' }).valid, true, `${question.equation}: rewrite to ${expressions.join(' = ')}`);
    return next;
  };
  let state = rewrite(source, [linearText(left, variable), linearText(right, variable)]);
  // Move the right side's variable term.
  if (!math.equal(right.a, 0)) {
    state = applyBalancedOperationToRelation(state, 'subtract', `(${fractionText(right.a)}) * ${variable}`).state;
    state = rewrite(state, [linearText({ a: math.subtract(left.a, right.a), b: left.b }, variable), linearText({ a: F(0), b: right.b }, variable)]);
  }
  const coefficient = math.subtract(left.a, right.a);
  if (math.equal(coefficient, 0)) {
    // No variable left: the statement decides.
    const truth = constantRelationTruth(state.branches[0]);
    const claim = obviousSpecialClaim(state);
    assert.equal(claim, truth ? 'allReals' : 'noSolution', `${question.equation}: ${state.branches[0].expressions.join(' = ')}`);
    const final = { ...state, branches: [], connective: null, special: claim };
    assert.equal(validateRelationTransition(state, final, { kind: 'solutionClaim', claim }).valid, true, 'the workspace accepts the justified conclusion');
    const opposite = claim === 'allReals' ? 'noSolution' : 'allReals';
    assert.equal(validateRelationTransition(state, { ...final, special: opposite }, { kind: 'solutionClaim', claim: opposite }).valid, false, 'and refuses the other');
    return { work: relationWorkspaceWork({ relationState: final }), outcome: claim };
  }
  // One solution: move the constant, divide, and the relation reads x = value.
  const value = math.divide(math.subtract(right.b, left.b), coefficient);
  state = applyBalancedOperationToRelation(state, 'subtract', `(${fractionText(left.b)})`).state;
  state = applyBalancedOperationToRelation(state, 'divide', `(${fractionText(coefficient)})`).state;
  state = rewrite(state, [variable, fractionText(value)]);
  return { work: relationWorkspaceWork({ relationState: state }), outcome: 'value', value: fractionText(value) };
};

/* --------------------------------------------------------------- Systems */

const reading = (isTrue) => (isTrue
  ? { truth: 'true', count: 'infinite', classification: 'consistent-dependent' }
  : { truth: 'false', count: 'none', classification: 'inconsistent' });

/** Finish from a one-variable reduction: solve it, back-substitute, verify both equations. */
const finishFromReduction = (question, reduced, surviving, removed, method) => {
  const coefficient = surviving === 'x' ? reduced.a : reduced.b;
  const value = math.divide(F(reduced.c), F(coefficient));
  // Back-substitute into the first equation and solve for the other variable.
  const substituted = substituteIntoEquation(question.equations[0], surviving, `(${fractionText(value)})`);
  const rest = linearEquationCoefficients(substituted, ['x', 'y']);
  const other = math.divide(F(rest.c), F(removed === 'x' ? rest.a : rest.b));
  const point = { [surviving]: asNumber(value), [removed]: asNumber(other) };
  return { work: pointWork(question, point, { method }), point: { [surviving]: fractionText(value), [removed]: fractionText(other) } };
};

/** Elimination: scale by the other equation's x coefficient, subtract, x cancels. */
const walkElimination = (question) => {
  const [first, second] = question.equations;
  const rowA = linearEquationCoefficients(first);
  const rowB = linearEquationCoefficients(second);
  const scaledA = applyEquationMultiplier(first, String(rowB.a)).coefficients;
  const scaledB = applyEquationMultiplier(second, String(rowA.a)).coefficients;
  const combined = combineCoefficients(scaledA, scaledB, 'subtract');
  assert.equal(eliminatesVariable(combined, 'x'), true, `${question.equations.join(' ; ')}: x cancels`);
  if (isDegenerateStatement(combined)) {
    const { isTrue } = degenerateStatementTruth(combined);
    return { work: specialWork(question, { ...reading(isTrue), statement: `0 = ${combined.c}`, method: 'elimination' }), outcome: isTrue ? 'infinite' : 'noSolution' };
  }
  const exact = { a: F(0), b: math.subtract(math.multiply(systemRow(first).b, systemRow(second).a), math.multiply(systemRow(second).b, systemRow(first).a)), c: math.subtract(math.multiply(systemRow(first).c, systemRow(second).a), math.multiply(systemRow(second).c, systemRow(first).a)) };
  return { ...finishFromReduction(question, exact, 'y', 'x', 'elimination'), outcome: 'point' };
};

/** Substitution: isolate x from the first equation, substitute into the second. */
const walkSubstitution = (question) => {
  const [first, second] = question.equations;
  const row = systemRow(first);
  const isolated = `((${fractionText(row.c)}) - (${fractionText(row.b)}) * y) / (${fractionText(row.a)})`;
  const substituted = substituteIntoEquation(second, 'x', isolated);
  const reduced = linearEquationCoefficients(substituted);
  assert.ok(reduced && Math.abs(reduced.a) < 1e-9, `${question.equations.join(' ; ')}: x is gone after substituting`);
  if (isDegenerateStatement(reduced)) {
    const { isTrue } = degenerateStatementTruth(reduced);
    return { work: specialWork(question, { ...reading(isTrue), statement: `0 = ${fractionText(reduced.c)}`, method: 'substitution' }), outcome: isTrue ? 'infinite' : 'noSolution' };
  }
  // The reduced equation's exact coefficients, from the rows.
  const rowB = systemRow(second);
  const b = math.subtract(rowB.b, math.divide(math.multiply(rowB.a, row.b), row.a));
  const c = math.subtract(rowB.c, math.divide(math.multiply(rowB.a, row.c), row.a));
  return { ...finishFromReduction(question, { a: F(0), b, c }, 'y', 'x', 'substitution'), outcome: 'point' };
};

/* ------------------------------------------------------------------ suites */

const equationSlot = (questionId, family, constraints) => ({ questionId, type: 'stepAlgebra', questionFamily: { ...family, constraints } });
const V2 = { id: 'linear.multiStepEquation', version: 2 };
const TWO = { id: 'linear.twoStepEquation', version: 2 };
const SLOTS = Object.freeze([
  equationSlot('one', V2, { solutionCase: 'one' }),
  equationSlot('one-distribute', V2, { solutionCase: 'one', distribute: true }),
  equationSlot('one-fraction', V2, { solutionForm: 'fraction', coefficientForm: 'fraction' }),
  equationSlot('none', V2, { solutionCase: 'none' }),
  equationSlot('none-distribute', V2, { solutionCase: 'none', distribute: true }),
  equationSlot('infinite', V2, { solutionCase: 'infinite' }),
  equationSlot('infinite-distribute', V2, { solutionCase: 'infinite', distribute: true }),
  equationSlot('mixed', V2, { solutionCase: 'mixed', distribute: 'mixed', coefficientForm: 'fraction' }),
  equationSlot('two-step-distribute', TWO, { distribute: true, coefficientForm: 'fraction' }),
  { questionId: 'sys-mixed', type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'mixed' } } },
  { questionId: 'sys-fraction', type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'one', solutionForm: 'fraction' } } },
]);
const assignment = seatedAssignment('qf-case-workflows', SLOTS);

const judge = (question, work) => {
  const { browser, server } = gradeBothWays(question, work);
  assert.equal(browser.isCorrect, true, `${question.equation || question.equations}: the workspace credits the finished work (${JSON.stringify(browser.parts)})`);
  assert.equal(server.isCorrect, true, 'and so does the server');
};

SLOTS.forEach((slot, storageIndex) => {
  test(`every seat finishes: ${slot.questionId}`, () => {
    const outcomes = {};
    STUDENTS.forEach((studentId) => {
      const { question } = deliverTo(assignment, storageIndex, studentId);
      const key = question.solutionKey;
      if (question.type === 'systemsWorkspace') {
        for (const walk of [walkElimination, walkSubstitution]) {
          const result = walk(question);
          assert.equal(result.outcome, key.outcome, `${question.equations.join(' ; ')}: ${walk.name} reached ${result.outcome}`);
          if (result.point) assert.deepEqual(result.point, { x: key.x, y: key.y }, 'the exact intersection');
          judge(question, result.work);
        }
        outcomes[key.outcome] = (outcomes[key.outcome] || 0) + 1;
        return;
      }
      if (question.relationWorkspace === true) {
        const result = walkRelationWorkspace(question);
        assert.equal(result.outcome, key.outcome, question.equation);
        if (result.outcome === 'value') assert.equal(result.value, key.value);
        judge(question, result.work);
      } else {
        judge(question, walkEquationWorkspace(question));
      }
      outcomes[key.outcome] = (outcomes[key.outcome] || 0) + 1;
    });
    assert.equal(Object.values(outcomes).reduce((sum, count) => sum + count, 0), 30);
  });
});

test('Step Algebra accepts "No solution" / "All real numbers" only from a statement with no variable', () => {
  const statement = (expressions) => ({ kind: 'relation', variable: 'x', branches: [{ expressions, relations: ['='] }], connective: null, special: null });
  assert.equal(obviousSpecialClaim(statement(['7', '2'])), 'noSolution');
  assert.equal(obviousSpecialClaim(statement(['-12', '-12'])), 'allReals');
  assert.equal(obviousSpecialClaim(statement(['1/3 + 2/3', '1'])), 'allReals', 'exactly, not to a tolerance');
  assert.equal(obviousSpecialClaim(statement(['3 * x + 5', '3 * x + 2'])), null, 'the variable terms must be gone first');
  assert.equal(obviousSpecialClaim(statement(['x', '4'])), null);
});
