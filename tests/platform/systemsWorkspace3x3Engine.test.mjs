/*
 * ISSUE #341: THE N-VARIABLE SYSTEMS ENGINE, AUTHORING GATE AND ROUTING.
 *
 * The 2×2 helpers speak `{ a, b, c }`; the 3×3 workflow speaks a form keyed by
 * the variable. These tests pin the mathematics (parsing, classroom
 * formatting, rank), the authoring gate that keeps unsupported 3×3 systems
 * away from students, and the routing that infers dimension from the plain
 * authored shape — without disturbing a single 2×2 contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  algebraicSystemDimension,
  classifyLinearSystem,
  classroomEquationText,
  equationMentionsVariable,
  exactNumberText,
  formatLinearForm,
  linearEquationCoefficients,
  linearEquationForm,
  linearFormsEquivalent,
  normalizeAlgebraicSystemConfig,
  presentableExpression,
  substituteIntoEquation,
  validateAlgebraicSystemAuthoring,
  variablesWithNonzeroCoefficient,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { detectDistributableGroup } from '../../src/algebraDistributionModel.js';
import { parseEquationInput, splitAdditiveTerms } from '../../src/algebraAstEngine.js';

const XYZ = ['x', 'y', 'z'];
const SYSTEM = ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'];

/* ---------------------------------------------------------------- parsing */

test('a linear equation is read against an arbitrary ordered variable list', () => {
  assert.deepEqual(linearEquationForm('2x - y + 3z = 9', XYZ), { coefficients: { x: 2, y: -1, z: 3 }, constant: 9 });
  // Terms on both sides, in any order, and a missing variable.
  assert.deepEqual(linearEquationForm('3z + 4 = 2y - x', XYZ), { coefficients: { x: 1, y: -2, z: 3 }, constant: -4 });
  assert.deepEqual(linearEquationForm('5y = 10', XYZ), { coefficients: { x: 0, y: 5, z: 0 }, constant: 10 });
  // Fractions and negatives survive exactly.
  assert.deepEqual(linearEquationForm('x/2 - (3/4)z = -1', XYZ), { coefficients: { x: 0.5, y: 0, z: -0.75 }, constant: -1 });
  // Grouped substitutions are still linear.
  assert.deepEqual(linearEquationForm('2 * (6 - y - z) - y + 3 * z = 9', XYZ), { coefficients: { x: 0, y: -3, z: 1 }, constant: -3 });
});

test('anything not linear in exactly those variables is refused, never approximated', () => {
  assert.equal(linearEquationForm('x*y + z = 1', XYZ), null);
  assert.equal(linearEquationForm('x^2 + y + z = 1', XYZ), null);
  assert.equal(linearEquationForm('x + y + w = 1', XYZ), null, 'an unknown symbol');
  assert.equal(linearEquationForm('x + y + z', XYZ), null, 'no equals sign');
  assert.equal(linearEquationForm('x = y = z', XYZ), null, 'two equals signs');
});

test('which variables remain after a substitution is read from the equation', () => {
  const reduced = substituteIntoEquation('2x - y + 3z = 9', 'x', '6 - y - z');
  assert.deepEqual(variablesWithNonzeroCoefficient(reduced, XYZ), ['y', 'z']);
  // z cancels here, so only y remains.
  const collapsed = substituteIntoEquation('-x + 4y - z = 4', 'x', '6 - y - z');
  assert.deepEqual(variablesWithNonzeroCoefficient(collapsed, XYZ), ['y']);
  assert.equal(equationMentionsVariable('x + y = 2', 'z'), false);
  assert.equal(equationMentionsVariable('x - x + z = 2', 'x'), true, 'written, even though its coefficient is zero');
});

/* ------------------------------------------------------------- formatting */

test('forms are written in classroom notation: 5y, no zero terms, implied 1, subtraction for negatives', () => {
  assert.equal(formatLinearForm({ coefficients: { x: 2, y: -1, z: 3 }, constant: 9 }, XYZ), '2x - y + 3z = 9');
  assert.equal(formatLinearForm({ coefficients: { x: 0, y: 5, z: 0 }, constant: 10 }, XYZ), '5y = 10');
  assert.equal(formatLinearForm({ coefficients: { x: -1, y: 0, z: 1 }, constant: -4 }, XYZ), '-x + z = -4');
  assert.equal(formatLinearForm({ coefficients: { x: 0.5, y: -1.5, z: 0 }, constant: 1 / 3 }, XYZ), '(1/2)x - (3/2)y = 1/3');
  assert.equal(formatLinearForm({ coefficients: { x: 0, y: 0, z: 0 }, constant: 0 }, XYZ), '0 = 0');
  assert.doesNotMatch(formatLinearForm({ coefficients: { x: 1, y: 5, z: -3 }, constant: 2 }, XYZ), /·|\*|\+ -|1x/);
});

test('solved values are written exactly: 7/3, never 2.3333333333333335', () => {
  assert.equal(exactNumberText(7 / 3), '7/3');
  assert.equal(exactNumberText(-0.5), '-1/2');
  assert.equal(exactNumberText(4.000000000001), '4');
  assert.equal(exactNumberText(-0), '0');
});

test('display helpers change notation only — never a term, a sign or a needed group', () => {
  assert.equal(presentableExpression('-(y) - (z) + (6)'), '-y - z + 6');
  assert.equal(presentableExpression('-(3) + (2 y)'), '-3 + 2 y');
  assert.equal(classroomEquationText('2 * (-y - z + 6) - y + 3 * z = 9'), '2 (-y - z + 6) - y + 3 z = 9');
  for (const text of ['2 * (-y - z + 6) - y + 3 * z = 9', '2 * x - 1 * (-x - z + 6) + 3 * z = 9']) {
    assert.ok(linearFormsEquivalent(linearEquationForm(text, XYZ), linearEquationForm(classroomEquationText(text), XYZ), XYZ), text);
  }
});

/* ------------------------------------------------------------ substitution */

test('substituting into each of two target equations keeps the expression grouped', () => {
  const first = substituteIntoEquation('2x - y + 3z = 9', 'x', '6 - y - z');
  const second = substituteIntoEquation('3x + 2y - z = 4', 'x', '6 - y - z');
  assert.match(first, /^2 \* \(6 - y - z\) - y \+ 3 \* z = 9$/);
  assert.match(second, /^3 \* \(6 - y - z\) \+ 2 \* y - z = 4$/);
  assert.deepEqual(linearEquationForm(first, XYZ), { coefficients: { x: 0, y: -3, z: 1 }, constant: -3 });
  assert.deepEqual(linearEquationForm(second, XYZ), { coefficients: { x: 0, y: -1, z: -4 }, constant: -14 });
});

test('a group replacing a negated variable keeps an explicit -1 factor, so Step Algebra cannot flatten it', () => {
  // Step Algebra's term splitter reads -(6 - y - z) as -6 + y + z. As a
  // product the group stays one term and the -1 is the student's to distribute.
  const unary = substituteIntoEquation('-x + 4y - z = 4', 'x', '6 - y - z');
  assert.match(unary, /^-1 \* \(6 - y - z\) \+ 4 \* y - z = 4$/);
  const subtracted = substituteIntoEquation('2y - x = 1', 'x', '6 - y - z');
  assert.match(subtracted, /^2 \* y - 1 \* \(6 - y - z\) = 1$/);
  for (const text of [unary, subtracted]) {
    const equation = parseEquationInput({ equation: text, solveFor: 'y' });
    const group = detectDistributableGroup(equation);
    assert.ok(group, `no distribution offered for ${text}`);
    assert.equal(group.factorText, '-1');
    assert.ok(splitAdditiveTerms(equation.left).every((term) => !/^[+-]?\s*6$/.test(term.text)), 'the group was flattened');
  }
  // Numbers and single terms have nothing to distribute and are left alone.
  assert.equal(substituteIntoEquation('-x + y = 1', 'x', '5'), '-(5) + y = 1');
  assert.equal(substituteIntoEquation('x - y = 3', 'y', '2 z'), 'x - (2 * z) = 3');
  // The live 2×2 Classwork Q2 substitution is byte-for-byte unchanged.
  assert.equal(substituteIntoEquation('3x + 5y = 24', 'x', '-3 + 2y'), '3 * (-3 + 2 * y) + 5 * y = 24');
});

/* --------------------------------------------------------------- rank */

test('rank analysis tells unique, inconsistent and dependent systems apart', () => {
  const forms = (equations) => equations.map((equation) => linearEquationForm(equation, XYZ));
  const unique = classifyLinearSystem(forms(SYSTEM), XYZ);
  assert.equal(unique.type, 'unique');
  assert.deepEqual(unique.solution, { x: 1, y: 2, z: 3 });
  assert.equal(classifyLinearSystem(forms(['x + y + z = 1', 'x + y + z = 2', 'x - y = 0']), XYZ).type, 'none');
  assert.equal(classifyLinearSystem(forms(['x + y + z = 1', '2x + 2y + 2z = 2', 'x - y = 0']), XYZ).type, 'infinite');
  // Zero coefficients and fractions.
  const sparse = classifyLinearSystem(forms(['2x = 3', 'y - z = 1/2', 'z = -1']), XYZ);
  assert.equal(sparse.type, 'unique');
  assert.deepEqual(sparse.solution, { x: 1.5, y: -0.5, z: -1 });
  assert.equal(classifyLinearSystem([null, null, null], XYZ).type, 'invalid');
});

test('two forms are the same equation when one is a nonzero multiple of the other', () => {
  const raw = linearEquationForm('2 * (6 - y - z) - y + 3 * z = 9', XYZ);
  assert.equal(linearFormsEquivalent(raw, linearEquationForm('-3y + z = -3', XYZ), XYZ), true);
  assert.equal(linearFormsEquivalent(raw, linearEquationForm('3y - z = 3', XYZ), XYZ), true);
  assert.equal(linearFormsEquivalent(raw, linearEquationForm('-3y + z = 3', XYZ), XYZ), false);
});

/* --------------------------------------------------- authoring + routing */

test('dimension is inferred from the authored equations and variables', () => {
  assert.equal(algebraicSystemDimension({ equations: SYSTEM, variables: XYZ }), 3);
  assert.equal(algebraicSystemDimension({ equations: SYSTEM }), 3, 'x, y, z are the default for three equations');
  assert.equal(algebraicSystemDimension({ equations: ['x + y = 2', 'x - y = 0'] }), 2);
  assert.equal(algebraicSystemDimension({ equations: SYSTEM, variables: ['x', 'y'] }), 2, 'mismatched counts never route to 3×3');
});

test('the 2×2 config keeps its exact shape; a 3×3 config adds forms and honours every authored method (#359)', () => {
  const twoByTwo = normalizeAlgebraicSystemConfig({ equations: ['x - 2y = -3', '3x + 5y = 24'], variables: ['x', 'y'], method: 'elimination' });
  assert.equal(twoByTwo.dimension, 2);
  assert.equal(twoByTwo.method, 'elimination');
  assert.deepEqual(twoByTwo.coefficients, [{ a: 1, b: -2, c: -3 }, { a: 3, b: 5, c: 24 }]);
  assert.deepEqual(twoByTwo.coefficients, ['x - 2y = -3', '3x + 5y = 24'].map((equation) => linearEquationCoefficients(equation, ['x', 'y'])));

  const threeByThree = normalizeAlgebraicSystemConfig({ equations: SYSTEM, variables: XYZ, method: 'studentChoice' });
  assert.equal(threeByThree.dimension, 3);
  assert.equal(threeByThree.method, 'studentChoice', '3×3 elimination is a real workflow now, so studentChoice is honoured (#359)');
  assert.equal(threeByThree.authoredMethod, 'studentChoice');
  assert.equal(threeByThree.coefficients, null);
  assert.deepEqual(threeByThree.forms[1], { coefficients: { x: 2, y: -1, z: 3 }, constant: 9 });

  const threeByThreeElimination = normalizeAlgebraicSystemConfig({ equations: SYSTEM, variables: XYZ, method: 'elimination' });
  assert.equal(threeByThreeElimination.method, 'elimination');
});

test('the authoring gate accepts 2×2 and 3×3 substitution and elimination, and names every unsupported case', () => {
  assert.deepEqual(validateAlgebraicSystemAuthoring({ equations: ['x - 2y = -3', '3x + 5y = 24'], variables: ['x', 'y'], method: 'elimination' }).errors, []);
  assert.deepEqual(validateAlgebraicSystemAuthoring({ equations: SYSTEM, variables: XYZ, method: 'substitution' }).errors, []);

  const mismatch = validateAlgebraicSystemAuthoring({ equations: SYSTEM, variables: ['x', 'y'] });
  assert.ok(mismatch.errors.some((message) => /same number of equations and variables \(got 3 equations and 2 variables\)/.test(message)), mismatch.errors.join(' | '));
  const tooMany = validateAlgebraicSystemAuthoring({ equations: [...SYSTEM, 'x = 1'], variables: ['x', 'y', 'z', 'w'] });
  assert.ok(tooMany.errors.some((message) => /2×2 or 3×3 only; got 4/.test(message)), tooMany.errors.join(' | '));
  const nonlinear = validateAlgebraicSystemAuthoring({ equations: ['x*y + z = 1', SYSTEM[1], SYSTEM[2]], variables: XYZ });
  assert.ok(nonlinear.errors.some((message) => /equation 1 must be linear in the three authored variables/.test(message)));

  // #359: 3×3 elimination is a real, student-driven workflow now — both
  // elimination and studentChoice are accepted without error or warning.
  const elimination = validateAlgebraicSystemAuthoring({ equations: SYSTEM, variables: XYZ, method: 'elimination' });
  assert.deepEqual(elimination.errors, []);
  const choice = validateAlgebraicSystemAuthoring({ equations: SYSTEM, variables: XYZ, method: 'studentChoice' });
  assert.deepEqual(choice.errors, []);
  assert.deepEqual(choice.warnings, []);

  const dependent = validateAlgebraicSystemAuthoring({ equations: ['x + y + z = 1', '2x + 2y + 2z = 2', 'x - y = 0'], variables: XYZ });
  assert.ok(dependent.errors.some((message) => /exactly one solution; this system is dependent/.test(message)));
  const inconsistent = validateAlgebraicSystemAuthoring({ equations: ['x + y + z = 1', 'x + y + z = 2', 'x - y = 0'], variables: XYZ });
  assert.ok(inconsistent.errors.some((message) => /this system is inconsistent/.test(message)));
  // 2×2 special cases stay authorable: the 2×2 workflow interprets them.
  assert.deepEqual(validateAlgebraicSystemAuthoring({ equations: ['x + y = 1', 'x + y = 2'], variables: ['x', 'y'] }).errors, []);
});

test('the plain authored shape from #341 routes to the algebraic workspace and validates there', () => {
  const plain = {
    type: 'systemsWorkspace',
    method: 'substitution',
    variables: XYZ,
    equations: SYSTEM,
    requireVerification: true,
  };
  assert.equal(resolveSystemsWorkspaceMode(plain), 'algebraic');
  assert.equal(validateToolQuestion({ ...plain, toolId: 'systemsWorkspace' }).isValid, true);
  // The same shape with a dependent system is caught before a student sees it.
  const dependent = validateToolQuestion({ ...plain, toolId: 'systemsWorkspace', equations: ['x + y + z = 1', '2x + 2y + 2z = 2', 'x - y = 0'] });
  assert.equal(dependent.isValid, false);
  // Graph content is untouched.
  assert.equal(resolveSystemsWorkspaceMode({ type: 'systemsWorkspace', system: { m1: 1, b1: 2, m2: -1, b2: 6 } }), 'linear');
  assert.equal(resolveSystemsWorkspaceMode({ type: 'systemsWorkspace', equations: ['y = x', 'y = 2'], studentActions: ['graphSystem'] }), 'linear');
});

test('V5 authoring carries a 3×3 algebraic system through unchanged', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: '3×3 substitution V5 compile', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A2.3B',
        prompt: 'Use substitution to solve the system.',
        studentActions: ['solveSystem'],
        mode: 'algebraic',
        method: 'substitution',
        equations: SYSTEM,
        variables: XYZ,
        requireVerification: true,
      }],
    }],
  });
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'systemsWorkspace');
  assert.deepEqual(question.equations, SYSTEM);
  assert.deepEqual(question.variables, XYZ);
  assert.equal(validateToolQuestion(question).isValid, true);
});
