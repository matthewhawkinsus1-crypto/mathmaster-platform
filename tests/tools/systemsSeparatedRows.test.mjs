/*
 * SYSTEMS WHOSE EQUATIONS EACH HOLD ONE VARIABLE (TL43; findings C2-135, C2-138).
 *
 * A 2×2 like x = 1, y = 2 (or 2x = 6, y = 4) has nothing to substitute or
 * eliminate between its rows. The 2×2 workspace offered only substitution and
 * elimination, and neither could do anything: a standalone 2×2 written this way
 * could not be finished. It is now solved row by row — a row that already reads
 * `variable = number` as written (nothing computed for the student), any other
 * row with Step Algebra — and then verified in both equations, as before. The
 * grader is unchanged: it marks the values and the verification.
 *
 * A 3×3 whose equations each hold a different single variable (2x = 2, 3y = 6,
 * 4z = 12, or x = 1, y = 2, z = 3) strands the student whichever variable or
 * method they choose, and "Undo and eliminate a different variable" cannot
 * help. Making it finishable would take a reduced 2×2 that solves scaled rows
 * inside the 3×3 and a back-substitution into an equation with nothing to
 * place; instead the student is told at the start (as for a system that cannot
 * be read) and Pre-Flight advises the teacher.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { verificationSidesWork } from '../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  NO_SHARED_VARIABLE_TEXT,
  eachEquationHoldsOneVariable,
  separatedTwoByTwo,
  twoByTwoVerificationSides,
  validateAlgebraicSystemAuthoring,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { auditAssignmentImpossibleItems } from '../../src/platform/preflight/impossibleItemsPreflight.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const source = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('a 2×2 whose rows each hold one different variable is read row by row', () => {
  assert.deepEqual(separatedTwoByTwo(['x = 1', 'y = 2'], ['x', 'y']), { rows: [{ index: 0, variable: 'x', given: 1 }, { index: 1, variable: 'y', given: 2 }] });
  assert.deepEqual(separatedTwoByTwo(['y = 2', 'x = -1/2'], ['x', 'y']), { rows: [{ index: 0, variable: 'y', given: 2 }, { index: 1, variable: 'x', given: -0.5 }] });
  assert.deepEqual(separatedTwoByTwo(['1 = x', 'y = 0.5'], ['x', 'y']).rows.map((row) => row.given), [1, 0.5]);
  // Anything but `variable = number` is the student's to solve: nothing is computed for them.
  assert.deepEqual(separatedTwoByTwo(['2x = 6', 'y = 4'], ['x', 'y']).rows.map((row) => row.given), [null, 4]);
  assert.deepEqual(separatedTwoByTwo(['x = 3 - 1', '3y = 9'], ['x', 'y']).rows.map((row) => row.given), [null, null]);
  // Not separated: a row with both variables, or two rows with the same one.
  assert.equal(separatedTwoByTwo(['x + y = 3', 'y = 2'], ['x', 'y']), null);
  assert.equal(separatedTwoByTwo(['x = 1', 'x = 2'], ['x', 'y']), null);
  assert.equal(separatedTwoByTwo(['x = 1', 'y = 2x'], ['x', 'y']), null);
  assert.equal(separatedTwoByTwo(['x = 1', 'y = 2', 'z = 3'], ['x', 'y', 'z']), null, 'a 2×2 only');
});

test('the work the row-by-row route ends with is graded right, and a wrong value is not', () => {
  const question = { type: 'systemsWorkspace', mode: 'algebraic', method: 'studentChoice', equations: ['x = 1', 'y = 2'], variables: ['x', 'y'] };
  // Each equation's sides as the verification fills them: x = 1 has the
  // number 1 on its right, so that side is given (TL50).
  const sides = (equation, left) => twoByTwoVerificationSides(equation, { placed: { x: true, y: true }, leftAnswer: left, rightAnswer: '', checked: false, valid: false });
  const work = (values, E1, E2) => ({ dimension: 2, method: '', values, verification: verificationSidesWork({ E1, E2 }), reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' } });
  const grade = (studentWork) => {
    const browser = gradeToolCheck(systemsWorkspaceGrader, question, studentWork);
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    assert.equal(server.isCorrect, browser.isCorrect);
    return browser;
  };
  assert.equal(grade(work({ x: 1, y: 2 }, sides('x = 1', '1'), sides('y = 2', '2'))).isCorrect, true);
  assert.equal(grade(work({ x: 1, y: 3 }, sides('x = 1', '1'), sides('y = 2', '3'))).isCorrect, false);
});

test('the 2×2 screen solves separated rows on their own, with no method route, and only then forms the pair', () => {
  const mode = source('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  // Standalone only: a 3×3 never hands its reduced 2×2 such rows.
  assert.match(mode, /const separated = useMemo\(\(\) => \(subsystem \? null : separatedTwoByTwo\(equations, variables\)\), \[subsystem, equations, variables\]\);/);
  // A row's value: as written, or the student's own solve of THAT row.
  const values = region(mode, 'const separatedValues = separated ?', 'const separatedPending', 'separated values');
  assert.match(values, /if \(row\.given !== null\) return \{ row, value: row\.given/);
  assert.match(values, /const record = separatedSolved\?\.\[row\.index\];/);
  assert.match(values, /record\?\.variable === row\.variable && Number\.isFinite\(Number\(record\.value\)\)/);
  // The board, and Step Algebra on the first row still to solve.
  const board = region(mode, '{separated ? (', '{!separated ? (<>', 'separated board');
  assert.match(board, /\{separatedPending \? \(\s*<EmbeddedStepAlgebra/);
  assert.match(board, /equationText=\{equations\[separatedPending\.index\]\}/);
  assert.match(board, /onSolved=\{\(latexResponse\) => handleSeparatedSolved\(separatedPending, latexResponse\)\}/);
  // Every method route — choice, stages, reduced solve, back-substitution — sits behind !separated.
  const route = region(mode, '{!separated ? (<>', '</>) : null}', 'method route');
  ['Choose the method you will use to solve this system.', "effectiveMethod === 'substitution'", "effectiveMethod === 'elimination'", 'reduceInputText && !isDegenerate && !firstSolvedDone', 'firstSolvedDone && !isDegenerate']
    .forEach((piece) => assert.ok(route.includes(piece), `${piece} is part of the method route`));
  // The student's solves are part of Undo.
  assert.match(region(mode, 'const mathState = useMemo(() => ({', '}), [', 'math state'), /separatedSolved,/);
  assert.match(mode, /setSeparatedSolved\(value\?\.separatedSolved \|\| \{\}\);/);
});

test('a 3×3 whose equations each hold a different single variable is named, to the student and to the teacher', () => {
  const variables = ['x', 'y', 'z'];
  assert.equal(eachEquationHoldsOneVariable(['2x = 2', '3y = 6', '4z = 12'], variables), true);
  assert.equal(eachEquationHoldsOneVariable(['y = 2', 'z = 3', 'x = 1'], variables), true);
  // Shared variables, or two equations on one variable: elimination reaches
  // something there (x = 1, x = 3 cancel to 0 = −2).
  assert.equal(eachEquationHoldsOneVariable(['x + y + z = 6', 'y = 2', 'z = 3'], variables), false);
  assert.equal(eachEquationHoldsOneVariable(['x = 1', 'y = 2', 'x = 3'], variables), false);
  assert.equal(eachEquationHoldsOneVariable(['x = 1', 'y = 2', 'z^2 = 4'], variables), false);

  // Pre-Flight advice for the teacher (TT04's panel), never an error.
  const diagonal = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', variables, equations: ['2x = 2', '3y = 6', '4z = 12'] };
  const checked = validateAlgebraicSystemAuthoring(diagonal);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.warnings.length, 1);
  assert.match(checked.warnings[0], /every equation holds just one variable/);
  assert.match(auditAssignmentImpossibleItems([diagonal]).warnings.join(' '), /^Question 1: systemsWorkspace 3×3 algebraic system: every equation holds just one variable/);
  assert.deepEqual(validateAlgebraicSystemAuthoring({ ...diagonal, equations: ['x + y + z = 6', '2y = 4', 'z = 3'] }).warnings, []);

  // On screen, in both methods, at the start: the same box as a system that
  // cannot be read, in place of a workflow that cannot finish.
  ['EliminationReductionMode', 'SubstitutionReductionMode'].forEach((name) => {
    const mode = source(`src/tools/systemsWorkspace/${name}.jsx`);
    assert.match(mode, /const noSharedVariable = useMemo\(\(\) => eachEquationHoldsOneVariable\(system\.equations\.map\(\(equation\) => equation\.text\), system\.variables\), \[system\]\);/, name);
    assert.match(mode, /\) : noSharedVariable \? \(\s*<div className="mathmaster-reduction-unsupported" role="alert" data-no-shared-variable="">\s*<strong>This system cannot be finished in this workspace\.<\/strong>\s*<p>\{NO_SHARED_VARIABLE_TEXT\}<\/p>/, name);
  });
  assert.doesNotMatch(NO_SHARED_VARIABLE_TEXT, /Undo/, 'no advice that cannot help');
});
