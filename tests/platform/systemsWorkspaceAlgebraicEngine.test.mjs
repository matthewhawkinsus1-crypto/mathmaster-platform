import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from 'mathjs';
import {
  normalizeAlgebraicSystemConfig,
  linearEquationCoefficients,
  formatLinearEquation,
  variableIsIsolated,
  isolatedExpressionFor,
  substituteVariable,
  substituteIntoEquation,
  applyEquationMultiplier,
  combineCoefficients,
  eliminatesVariable,
  isDegenerateStatement,
  degenerateStatementTruth,
  solveAlgebraicSystem,
  evaluateEquationSides,
  normalizeEquationForStepAlgebra,
  rationalExpressionFromNumber,
  normalizeStudentExpressionForDisplay,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

// ---------------------------------------------------------------------------
// Authoring config
// ---------------------------------------------------------------------------

test('normalizeAlgebraicSystemConfig reads the authoring contract and defaults sensibly', () => {
  const config = normalizeAlgebraicSystemConfig({
    toolId: 'systemsWorkspace',
    mode: 'algebraic',
    method: 'substitution',
    equations: ['x - 2y = -3', '3x + 5y = 24'],
    variables: ['x', 'y'],
    requireVerification: true,
  });
  assert.equal(config.method, 'substitution');
  assert.deepEqual(config.equations, ['x - 2y = -3', '3x + 5y = 24']);
  assert.deepEqual(config.variables, ['x', 'y']);
  assert.equal(config.requireVerification, true);
  assert.deepEqual(config.coefficients[0], { a: 1, b: -2, c: -3 });
  assert.deepEqual(config.coefficients[1], { a: 3, b: 5, c: 24 });
});

test('an unrecognized method falls back to studentChoice rather than silently forcing one', () => {
  const config = normalizeAlgebraicSystemConfig({ method: 'not-a-real-method' });
  assert.equal(config.method, 'studentChoice');
});

test('requireVerification defaults true and askEfficiency defaults false, matching "core workspace does not depend on that field"', () => {
  const config = normalizeAlgebraicSystemConfig({});
  assert.equal(config.requireVerification, true);
  assert.equal(config.askEfficiency, false);
});

// ---------------------------------------------------------------------------
// Isolation detection (substitution stage 1/2)
// ---------------------------------------------------------------------------

test('an equation is only "already isolated" when the bare variable is alone on one side', () => {
  assert.equal(variableIsIsolated('x - 2y = -3', 'x'), false);
  assert.equal(variableIsIsolated('x = -3 + 2y', 'x'), true);
  assert.equal(variableIsIsolated('-3 + 2y = x', 'x'), true);
  assert.equal(variableIsIsolated('2x = -3 + 2y', 'x'), false, 'a coefficient of 2 is not isolation');
});

test('isolatedExpressionFor reads the non-bare side, whichever side the bare variable is on', () => {
  assert.equal(isolatedExpressionFor('x = -3 + 2*y', 'x'), '-3 + 2*y');
  assert.equal(isolatedExpressionFor('-3 + 2*y = x', 'x'), '-3 + 2*y');
});

// ---------------------------------------------------------------------------
// Substitution (stages 2-3): grouping/parentheses preserved
// ---------------------------------------------------------------------------

test('substituting a non-atomic isolated expression preserves grouping with parentheses', () => {
  const result = substituteIntoEquation('3x + 5y = 24', 'x', '-3 + 2*y');
  // The student must see the substituted expression grouped, not distributed —
  // distribution is Step Algebra's job, not this engine's.
  assert.match(result, /3\s*(?:\*\s*)?\(\s*-3\s*\+\s*2\s*\*?\s*y\s*\)/);
  assert.match(result, /=\s*24$/);
});

test('substituting a bare/atomic replacement evaluates to the same number the algebra does', () => {
  const result = substituteVariable('x - 2y', 'y', '3');
  const evaluated = evaluateEquationSides(`${result} = -3`, { x: 0 });
  assert.equal(evaluated.left, -6);
});

test('substitution only replaces the named variable, never the other one', () => {
  const result = substituteIntoEquation('x + y = 10', 'x', '2*y');
  assert.doesNotMatch(result.split('=')[0], /^\s*2\s*y\s*\+\s*y\s*$/); // sanity: still contains the untouched y term
  assert.match(result, /y/);
  const coeffs = linearEquationCoefficients(result, ['x', 'y']);
  assert.equal(coeffs.a, 0); // x has been fully replaced
});


test('question 2 accepts a larger isolated expression token and still produces a valid one-variable equation', () => {
  const result = substituteIntoEquation('3x + 5y = 24', 'x', '2*y - 3');
  const coeffs = linearEquationCoefficients(result, ['x', 'y']);
  assert.ok(coeffs, result);
  assert.equal(coeffs.a, 0);
  assert.notEqual(coeffs.b, 0);
});


test('question 2 accepts the exact parenthesized token form shown by Systems Workspace', () => {
  for (const token of ['-(3) + (2 y)', '-(3)+(2y)', '-3 + 2y', '(-3) + (2*y)']) {
    const result = substituteIntoEquation('3x + 5y = 24', 'x', token);
    assert.match(result, /\*/);
    const coeffs = linearEquationCoefficients(result, ['x', 'y']);
    assert.ok(coeffs, `${token} -> ${result}`);
    assert.equal(coeffs.a, 0);
    assert.equal(coeffs.b, 11);
    assert.equal(coeffs.c, 33);
  }
});

test('substitution boundary repairs persisted display syntax before MathJS parses the token', () => {
  const staleTokens = [
    '−(3) + (2\u00a0y)',
    '\\left(-(3)\\right) + (2y)',
    '−3 + 2×y',
    '−(3) + (2\u200by)',
  ];
  for (const token of staleTokens) {
    const result = substituteIntoEquation('3x + 5y = 24', 'x', token);
    const coeffs = linearEquationCoefficients(result, ['x', 'y']);
    assert.ok(coeffs, `${JSON.stringify(token)} -> ${result}`);
    assert.equal(coeffs.a, 0);
    assert.equal(coeffs.b, 11);
    assert.equal(coeffs.c, 33);
  }
});

test('an unsimplified isolation token with division by negative one remains valid after substitution', () => {
  const result = substituteIntoEquation('-3x - 3y = 1', 'y', '((7) - (2*x))/(-1)');
  const coeffs = linearEquationCoefficients(result, ['x', 'y']);
  assert.ok(coeffs, result);
  assert.equal(coeffs.b, 0);
  assert.notEqual(coeffs.a, 0);
});


test('Step Algebra import normalization removes redundant token wrappers without doing algebra for the student', () => {
  const q1 = normalizeEquationForStepAlgebra('3 * x + 4 * ((2 * x)) = 11');
  assert.doesNotMatch(q1, /\(\(/);
  assert.match(q1, /3 \* x/);
  assert.match(q1, /= 11$/);

  const q6 = normalizeEquationForStepAlgebra('0.25 * (((200) - s)) + 0.75 * s = 120');
  assert.doesNotMatch(q6, /\(\(/);
  assert.match(q6, /0\.25 \* \(200 - s\)/);
  assert.match(q6, /0\.75 \* s/);
  assert.match(q6, /= 120$/);
});

test('Step Algebra import normalization preserves the distributive group in the alloy problem', () => {
  const normalized = normalizeEquationForStepAlgebra('0.25 * (((200) - s)) + 0.75 * s = 120');
  assert.match(normalized, /0\.25 \* \(200 - s\)/);
  assert.doesNotMatch(normalized, /50/);
  assert.doesNotMatch(normalized, /0\.5 \* s/);
});


test('legacy repeating-decimal solved values recover the exact rational form for student display', () => {
  assert.equal(rationalExpressionFromNumber(2.2222222222222223), '20/9');
  assert.equal(rationalExpressionFromNumber(-2.2222222222222223), '-20/9');
  assert.equal(rationalExpressionFromNumber(3), '3');
});

test('student expression display cleanup removes serialization wrappers without doing algebra', () => {
  const unsimplified = normalizeStudentExpressionForDisplay('((((7)-(2*x)))/((-1)))');
  assert.doesNotMatch(unsimplified, /\(\(\(/);
  assert.ok(
    Math.abs(Number(evaluate(unsimplified, { x: 4 })) - 1) < 1e-9,
    unsimplified,
  );
  const studentSimplified = normalizeStudentExpressionForDisplay('2*x - 7');
  assert.match(studentSimplified, /2\s*\*\s*x\s*-\s*7/);
  assert.doesNotMatch(studentSimplified, /^\(+/);
});

// ---------------------------------------------------------------------------
// Elimination: multipliers, combination, cancellation
// ---------------------------------------------------------------------------

test('direct opposite coefficients need no multiplier and simply add away', () => {
  const eq1 = linearEquationCoefficients('x + y = 5');
  const eq2 = linearEquationCoefficients('-x + 2y = 1');
  const combined = combineCoefficients(eq1, eq2, 'add');
  assert.ok(eliminatesVariable(combined, 'x', ['x', 'y']));
  assert.equal(formatLinearEquation(combined, ['x', 'y']), '3y = 6');
});

test('same coefficients require subtraction, not addition, to cancel', () => {
  const eq1 = linearEquationCoefficients('2x + 3y = 11');
  const eq2 = linearEquationCoefficients('2x + y = 5');
  assert.equal(eliminatesVariable(combineCoefficients(eq1, eq2, 'add'), 'x', ['x', 'y']), false);
  const combined = combineCoefficients(eq1, eq2, 'subtract');
  assert.ok(eliminatesVariable(combined, 'x', ['x', 'y']));
});

test('multiplying one equation creates opposite coefficients for elimination', () => {
  const eq1 = linearEquationCoefficients('2x + 3y = 11');
  const multiplied = applyEquationMultiplier('x + 5y = 9', -2, ['x', 'y']);
  assert.equal(multiplied.text, '-2x - 10y = -18');
  const combined = combineCoefficients(eq1, multiplied.coefficients, 'add');
  assert.ok(eliminatesVariable(combined, 'x', ['x', 'y']));
  assert.equal(formatLinearEquation(combined, ['x', 'y']), '-7y = -7');
});

test('a multiplier applies to every term on both sides, including the constant', () => {
  const multiplied = applyEquationMultiplier('x - 4y = 6', 3, ['x', 'y']);
  assert.deepEqual(multiplied.coefficients, { a: 3, b: -12, c: 18 });
  assert.equal(multiplied.text, '3x - 12y = 18');
});

test('exact fractional multiplier expressions are evaluated instead of coerced with Number()', () => {
  const multiplied = applyEquationMultiplier('2x + 4y = 6', '1/2', ['x', 'y']);
  assert.deepEqual(multiplied.coefficients, { a: 1, b: 2, c: 3 });
  assert.equal(multiplied.text, 'x + 2y = 3');
});

test('both equations may need a multiplier at once', () => {
  const m1 = applyEquationMultiplier('3x + 2y = 16', 2, ['x', 'y']);
  const m2 = applyEquationMultiplier('2x + 5y = 21', -3, ['x', 'y']);
  assert.equal(m1.text, '6x + 4y = 32');
  assert.equal(m2.text, '-6x - 15y = -63');
  const combined = combineCoefficients(m1.coefficients, m2.coefficients, 'add');
  assert.ok(eliminatesVariable(combined, 'x', ['x', 'y']));
});

test('a combination that does not cancel the targeted variable is detectable without mutating anything', () => {
  const eq1 = linearEquationCoefficients('2x + 3y = 11');
  const eq2 = linearEquationCoefficients('x + 5y = 9');
  const wrongCombination = combineCoefficients(eq1, eq2, 'add');
  assert.equal(eliminatesVariable(wrongCombination, 'x', ['x', 'y']), false);
  // The engine only reports the fact; it is the caller's job (AlgebraicSystemMode)
  // to refuse to lock this combination in, which is covered by the source
  // contract test asserting the "does not corrupt work" feedback path.
});

// ---------------------------------------------------------------------------
// Special cases: contradiction / identity
// ---------------------------------------------------------------------------

test('a dependent system collapses to a true statement with no variable', () => {
  const eq1 = linearEquationCoefficients('x + y = 2');
  const eq2 = applyEquationMultiplier('2x + 2y = 4', -0.5, ['x', 'y']).coefficients;
  const combined = combineCoefficients(eq1, eq2, 'add');
  assert.ok(isDegenerateStatement(combined));
  assert.deepEqual(degenerateStatementTruth(combined), { leftValue: 0, rightValue: 0, isTrue: true });
  assert.equal(solveAlgebraicSystem([linearEquationCoefficients('x + y = 2'), linearEquationCoefficients('2x + 2y = 4')]).type, 'infinite');
});

test('an inconsistent system collapses to a false statement with no variable', () => {
  const eq1 = linearEquationCoefficients('x + y = 2');
  const eq2 = applyEquationMultiplier('2x + 2y = 10', -0.5, ['x', 'y']).coefficients;
  const combined = combineCoefficients(eq1, eq2, 'add');
  assert.ok(isDegenerateStatement(combined));
  const truth = degenerateStatementTruth(combined);
  assert.equal(truth.isTrue, false);
  assert.notEqual(truth.rightValue, 0);
  assert.equal(solveAlgebraicSystem([linearEquationCoefficients('x + y = 2'), linearEquationCoefficients('2x + 2y = 10')]).type, 'none');
});

test('a normal one-solution reduction is never mistaken for a degenerate statement', () => {
  const combined = combineCoefficients(linearEquationCoefficients('2x + 3y = 11'), applyEquationMultiplier('x + 5y = 9', -2).coefficients, 'add');
  assert.equal(isDegenerateStatement(combined), false);
});

// ---------------------------------------------------------------------------
// Ground truth / verification support
// ---------------------------------------------------------------------------

test('solveAlgebraicSystem finds the unique intersection used to grade the ordered pair', () => {
  const solution = solveAlgebraicSystem([
    linearEquationCoefficients('x - 2y = -3'),
    linearEquationCoefficients('3x + 5y = 24'),
  ]);
  assert.equal(solution.type, 'one');
  assert.equal(solution.x, 3);
  assert.equal(solution.y, 3);
});

test('evaluateEquationSides evaluates both sides at a candidate solution for verification', () => {
  const sides = evaluateEquationSides('x - 2y = -3', { x: 3, y: 3 });
  assert.equal(sides.left, -3);
  assert.equal(sides.right, -3);
});
