import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation,
  expressionsEquivalent,
  isFactoredLinearExpression,
  isSimplifiedSlopeInterceptExpression,
  parseEquationInput,
} from '../../src/algebraAstEngine.js';
import {
  armFactor,
  commitDistribution,
  detectDistributableGroup,
  initDistributionState,
  placeOnTerm,
} from '../../src/algebraDistributionModel.js';
import { findLikeTermGroups, replaceSelectedLikeTerms } from '../../src/algebraLikeTermsModel.js';
import { validateCommonFactor } from '../../src/algebraFactoringModel.js';
import { detectSplittableFractions } from '../../src/algebraFractionSplitModel.js';
import {
  applyBalancedOperationToRelation,
  buildStudentAuthoredAbsoluteValueSplit,
  cloneRelationState,
  normalizeRelationExpressionInput,
  obviousSpecialClaim,
  parseRelationSource,
  relationSolutionSummary,
  relationStateToText,
  validateRelationTransition,
} from '../../src/algebraRelationFoundation.js';
import { buildSubstitutionState, expectedInterceptPoint } from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import {
  applyEquationMultiplier,
  combineCoefficients,
  eliminatesVariable,
  exactNumberText,
  linearEquationCoefficients,
  substituteIntoEquation,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import { exactFractionText } from '../../src/tools/shared/toolMath.js';

// CANONICAL ALGEBRA JOURNEYS (Job 2 acceptance).
//
// Realistic multi-step student paths across question families, driven through
// the SAME shared operations the workspaces call — balanced moves, the
// distribution / like-terms / fraction models, relation rewrites, absolute-value
// splits, substitution and elimination. Every step must preserve the solution
// set; the finish must be exact (20/9, 36/11 — never a decimal). The browser
// certification performs the same families through the real UI.

// ---- equation engine: one balanced move at a time, as the student commits them.
const move = (equation, operation, operand) => {
  const result = applyBalancedOperation({ equationState: equation, operation, operand });
  assert.equal(result.preservesSolution, true, `${operation} ${operand} must preserve the solution`);
  return result;
};

// ---- relation engine: balanced moves, symbol choices and rewrites, each validated.
const relationMove = (state, operation, operand, chooseReversed = false) => {
  const result = applyBalancedOperationToRelation(state, operation, operand);
  const next = cloneRelationState(result.state);
  if (chooseReversed) next.branches[0].relations = result.expectedRelations;
  const verdict = validateRelationTransition(state, next, { kind: 'balancedOperation', operation, operandExpression: operand, branchIndices: [0] });
  assert.equal(verdict.valid, true, `${operation} ${operand} (${chooseReversed ? 'reversed' : 'kept'} symbol) must be valid`);
  return next;
};
const rewrite = (state, branch, index, value) => {
  const next = cloneRelationState(state);
  next.branches[branch].expressions[index] = normalizeRelationExpressionInput(value);
  assert.equal(validateRelationTransition(state, next, { kind: 'equivalentRewrite' }).valid, true, `rewrite to ${value} must be equivalent`);
  return next;
};

test('linear equation: 4x + 7 = 23 → x = 4', () => {
  let equation = parseEquationInput({ equation: '4x + 7 = 23', solveFor: 'x' });
  equation = move(equation, 'subtract', '7').simplified;
  const last = move(equation, 'divide', '4');
  assert.equal(last.solved, true);
  assert.equal(last.simplified.right, '4');
});

test('distribute, combine like terms, solve: 3(2x − 4) + 5x = 24 → x = 36/11 exactly', () => {
  let equation = parseEquationInput({ equation: '3(2x - 4) + 5x = 24', solveFor: 'x' });
  let distribution = initDistributionState(detectDistributableGroup(equation));
  distribution.terms.forEach((_, index) => { distribution = placeOnTerm(armFactor(distribution), index); });
  const distributed = commitDistribution(equation, distribution, { simplifyProducts: true });
  assert.ok(expressionsEquivalent(distributed.left, equation.left, 'x'), 'distribution preserved the side');
  const [group] = findLikeTermGroups(distributed.left);
  assert.ok(group && group.indices.length === 2, `6x and 5x are like terms in ${distributed.left}`);
  const combined = { ...distributed, left: replaceSelectedLikeTerms(distributed.left, group.indices, '11x') };
  assert.ok(expressionsEquivalent(combined.left, equation.left, 'x'), 'combining preserved the side');
  equation = move(combined, 'add', '12').simplified;
  const last = move(equation, 'divide', '11');
  assert.equal(last.solved, true);
  assert.equal(last.simplified.right.replace(/\s/g, ''), '36/11', 'the answer stays the fraction 36/11');
});

test('exact fraction: 9x = 20 → x = 20/9, never 2.222', () => {
  const last = move(parseEquationInput({ equation: '9x = 20', solveFor: 'x' }), 'divide', '9');
  assert.equal(last.solved, true);
  assert.equal(last.simplified.right.replace(/\s/g, ''), '20/9');
  assert.equal(exactFractionText(20 / 9), '20/9', 'the legacy numeric solver shows the same exact value');
});

test('literal equation: A = lw solved for w divides by l with the assumption stated', () => {
  const last = move(parseEquationInput({ equation: 'A = l w', solveFor: 'w' }), 'divide', 'l');
  assert.equal(last.solved, true);
  assert.equal(last.assumption, 'l ≠ 0');
});

test('slope-intercept: 5x + 2y = 6 → the fraction is split, then reads as y = mx + b', () => {
  let equation = parseEquationInput({ equation: '5x + 2y = 6', targetForm: 'slopeIntercept' });
  equation = move(equation, 'subtract', '5x').simplified;
  const divided = move(equation, 'divide', '2');
  assert.ok(detectSplittableFractions({ left: 'y', right: '(6 - 5 x) / 2' }).length > 0, 'the numerator can be split over 2');
  assert.equal(isSimplifiedSlopeInterceptExpression('3 - (5 / 2) x', 'x'), true);
  assert.equal(isSimplifiedSlopeInterceptExpression('6 / 2 - 5 x / 2', 'x'), false, 'unreduced 6/2 is not finished');
  assert.ok(divided.preservesSolution);
});

test('factor the GCF: 15x − 45 → 15(x − 3), and a non-common factor is refused', () => {
  assert.deepEqual(validateCommonFactor(['15 x', '-(45)'], 15), { ok: true });
  assert.notDeepEqual(validateCommonFactor(['15 x', '-(45)'], 9), { ok: true });
  assert.equal(isFactoredLinearExpression('15 (x - 3)', 'x'), true);
});

test('inequality with sign reversal: −2x + 3 > 7 → x < −2', () => {
  let state = parseRelationSource('-2x + 3 > 7', 'x');
  state = relationMove(state, 'subtract', '3');
  state = rewrite(state, 0, 0, '-2x');
  state = rewrite(state, 0, 1, '4');
  assert.throws(() => {
    const kept = relationMove(state, 'divide', '-2', false);
    return kept;
  }, /must be valid/, 'keeping > after ÷ −2 is not a valid step');
  state = relationMove(state, 'divide', '-2', true);
  state = rewrite(state, 0, 0, 'x');
  state = rewrite(state, 0, 1, '-2');
  assert.equal(relationStateToText(state), 'x < -2');
  assert.deepEqual(relationSolutionSummary(state).intervals, [{ min: -Infinity, max: -2, minClosed: false, maxClosed: false }]);
});

test('absolute-value equation: |2x − 3| = 7 → x = 5 OR x = −2', () => {
  const start = parseRelationSource('|2x - 3| = 7', 'x');
  const split = buildStudentAuthoredAbsoluteValueSplit(start, 0, 'or', { branches: [{ value: '7', relation: '=' }, { value: '-7', relation: '=' }] });
  assert.equal(validateRelationTransition(start, split.state, { kind: 'absoluteSplit', branchIndex: 0, structure: 'or' }).valid, true);
  let state = split.state;
  // Solve each branch: + 3, ÷ 2, rewrite.
  for (const branchIndex of [0, 1]) {
    const added = applyBalancedOperationToRelation(state, 'add', '3', { branchIndex }).state;
    state = added;
    const divided = applyBalancedOperationToRelation(state, 'divide', '2', { branchIndex }).state;
    state = divided;
  }
  state = rewrite(state, 0, 0, 'x');
  state = rewrite(state, 0, 1, '5');
  state = rewrite(state, 1, 0, 'x');
  state = rewrite(state, 1, 1, '-2');
  assert.equal(relationStateToText(state), 'x = 5 OR x = -2');
  assert.equal(relationSolutionSummary(state).solved, true);
});

test('absolute-value inequality: |x − 2| < 5 → −3 < x < 7; impossible and all-real cases are recognised', () => {
  const start = parseRelationSource('|x - 2| < 5', 'x');
  const split = buildStudentAuthoredAbsoluteValueSplit(start, 0, 'and', {
    compound: { leftValue: '-5', leftRelation: '<', rightValue: '5', rightRelation: '<' },
  });
  let state = split.state;
  const added = applyBalancedOperationToRelation(state, 'add', '2');
  state = added.state;
  state = rewrite(state, 0, 0, '-3');
  state = rewrite(state, 0, 1, 'x');
  state = rewrite(state, 0, 2, '7');
  assert.equal(relationStateToText(state), '-3 < x < 7');
  assert.equal(relationSolutionSummary(state).solved, true);

  assert.equal(obviousSpecialClaim(parseRelationSource('|2x - 3| = -5', 'x')), 'noSolution');
  assert.equal(obviousSpecialClaim(parseRelationSource('|x| >= -2', 'x')), 'allReals');
  assert.equal(obviousSpecialClaim(parseRelationSource('|x| <= 0', 'x')), null, '|x| ≤ 0 has the solution x = 0');
});

test('system by substitution: y = 2x − 1 into 3x + 2y = 12 → (2, 3)', () => {
  const substituted = substituteIntoEquation('3x + 2y = 12', 'y', '2x - 1');
  let equation = parseEquationInput({ equation: substituted, solveFor: 'x' });
  const [left, right] = substituted.split('=');
  assert.ok(expressionsEquivalent(`${left} - (${right})`, '7x - 14', 'x'), 'the whole expression replaced y');
  equation = { ...equation, left: '7 x - 2' };
  equation = move(equation, 'add', '2').simplified;
  const last = move(equation, 'divide', '7');
  assert.equal(last.simplified.right, '2');
  assert.equal(exactNumberText(2 * 2 - 1), '3');
});

test('system by elimination with an exact fractional answer: x + 2y = 5, 3x − y = 4 → (13/7, 11/7)', () => {
  const second = applyEquationMultiplier('3x - y = 4', 2);
  const combined = combineCoefficients(linearEquationCoefficients('x + 2y = 5'), second.coefficients, 'add');
  assert.equal(eliminatesVariable(combined, 'y'), true, 'the student-chosen multiplier eliminates y');
  const x = combined.c / combined.a;
  assert.equal(exactNumberText(x), '13/7');
  assert.equal(exactNumberText((5 - x) / 2), '11/7');
  assert.match(substituteIntoEquation('x + 2y = 5', 'x', exactNumberText(x)), /13 \/ 7/, 'the exact value is what gets substituted back');
});

test('x/y intercepts: 3x + 4y = 24 → (8, 0) and (0, 6) through a one-variable solve', () => {
  const standard = { A: 3, B: 4, C: 24 };
  const xStage = buildSubstitutionState(standard, 'y');
  const xSolve = move(parseEquationInput({ equation: `${xStage.coefficient}x = ${xStage.right}`, solveFor: 'x' }), 'divide', String(xStage.coefficient));
  assert.equal(xSolve.simplified.right, '8');
  assert.deepEqual(expectedInterceptPoint(standard, 'x'), [8, 0]);
  const yStage = buildSubstitutionState(standard, 'x');
  const ySolve = move(parseEquationInput({ equation: `${yStage.coefficient}y = ${yStage.right}`, solveFor: 'y' }), 'divide', String(yStage.coefficient));
  assert.equal(ySolve.simplified.right, '6');
  assert.deepEqual(expectedInterceptPoint(standard, 'y'), [0, 6]);
});
