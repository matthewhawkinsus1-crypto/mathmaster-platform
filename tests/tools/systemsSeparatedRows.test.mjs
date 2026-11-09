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
 * 4z = 12, or x = 1, y = 2, z = 3) stranded the student whichever variable or
 * method they chose, and the workspace could only say so. It is now solved
 * the same way, equation by equation, with no method to choose
 * (EquationByEquationMode): each equation for its own variable, then the three
 * values checked in all three original equations. The grader is unchanged: it
 * marks the values and the checks, as for any 3×3 with one solution, and the
 * route reports its own method, 'byEquation'. Pre-Flight still advises the
 * teacher, since such an item practises no elimination or substitution.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { verificationSidesWork } from '../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  eachEquationHoldsOneVariable,
  separatedRows,
  separatedTwoByTwo,
  twoByTwoVerificationSides,
  validateAlgebraicSystemAuthoring,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import {
  buildReductionSystem,
  checkVerification,
  placeVerificationValue,
  setVerificationAnswer,
} from '../../functions/shared/toolMath/systemsWorkspace/substitutionReduction.mjs';
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

test('a 3×3 whose equations each hold a different single variable is read equation by equation, and the teacher is advised', () => {
  const variables = ['x', 'y', 'z'];
  assert.equal(eachEquationHoldsOneVariable(['2x = 2', '3y = 6', '4z = 12'], variables), true);
  assert.equal(eachEquationHoldsOneVariable(['y = 2', 'z = 3', 'x = 1'], variables), true);
  // Shared variables, or two equations on one variable: elimination reaches
  // something there (x = 1, x = 3 cancel to 0 = −2).
  assert.equal(eachEquationHoldsOneVariable(['x + y + z = 6', 'y = 2', 'z = 3'], variables), false);
  assert.equal(eachEquationHoldsOneVariable(['x = 1', 'y = 2', 'x = 3'], variables), false);
  assert.equal(eachEquationHoldsOneVariable(['x = 1', 'y = 2', 'z^2 = 4'], variables), false);

  // The rows the board solves: a row already reading `variable = number` is
  // read as written; any other is the student's to solve.
  assert.deepEqual(separatedRows(['2x = 2', '3y = 6', 'z = 3'], variables), { rows: [{ index: 0, variable: 'x', given: null }, { index: 1, variable: 'y', given: null }, { index: 2, variable: 'z', given: 3 }] });
  assert.deepEqual(separatedRows(['y = 2', 'z = -1/2', 'x = 1'], variables).rows.map((row) => [row.variable, row.given]), [['y', 2], ['z', -0.5], ['x', 1]]);
  assert.equal(separatedRows(['x + y + z = 6', 'y = 2', 'z = 3'], variables), null);
  assert.equal(separatedRows(['x = 1', 'y = 2', 'x = 3'], variables), null);
  assert.equal(separatedRows(['2x = 2', '3y = 6'], variables), null, 'as many equations as variables');

  // Pre-Flight advice for the teacher (TT04's panel), never an error: the item
  // can be finished now, but it practises no elimination or substitution.
  const diagonal = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', variables, equations: ['2x = 2', '3y = 6', '4z = 12'] };
  const checked = validateAlgebraicSystemAuthoring(diagonal);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.warnings.length, 1);
  assert.match(checked.warnings[0], /every equation holds just one variable/);
  assert.match(checked.warnings[0], /Students solve each equation on its own and check the three values/);
  assert.doesNotMatch(checked.warnings[0], /cannot finish/);
  assert.match(auditAssignmentImpossibleItems([diagonal]).warnings.join(' '), /^Question 1: systemsWorkspace 3×3 algebraic system: every equation holds just one variable/);
  assert.deepEqual(validateAlgebraicSystemAuthoring({ ...diagonal, equations: ['x + y + z = 6', '2y = 4', 'z = 3'] }).warnings, []);
});

test('the work the equation-by-equation route ends with is graded right, under any method setting, and a wrong value or a missing check is not', () => {
  const equations = ['2x = 2', '3y = 6', '4z = 12'];
  const system = buildReductionSystem({ variables: ['x', 'y', 'z'], equations });
  const solution = { x: 1, y: 2, z: 3 };
  // The checks as OriginalEquationsVerification builds them: each value placed
  // once, each left side typed (each right side is a number, shown as given).
  let state = { verification: {} };
  ['x', 'y', 'z'].forEach((name, index) => { state = placeVerificationValue(state, system, `E${index + 1}`, name, name).state; });
  [['E1', '2'], ['E2', '6'], ['E3', '12']].forEach(([id, left]) => {
    state = setVerificationAnswer(state, id, 'leftAnswer', left).state;
    state = checkVerification(state, system, solution, id).state;
  });
  assert.ok(['E1', 'E2', 'E3'].every((id) => state.verification[id].valid), 'the premise: every check passes');
  const work = (values, verification = state.verification, method = 'byEquation') => ({ dimension: 3, method, values, verification: verificationSidesWork(verification) });
  const grade = (question, studentWork) => {
    const browser = gradeToolCheck(systemsWorkspaceGrader, question, studentWork);
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    assert.equal(server.isCorrect, browser.isCorrect);
    return browser;
  };
  for (const method of ['studentChoice', 'elimination', 'substitution']) {
    const question = { type: 'systemsWorkspace', mode: 'algebraic', method, equations, variables: ['x', 'y', 'z'] };
    assert.equal(grade(question, work(solution)).isCorrect, true, `${method}: the solved, checked triple`);
    assert.equal(grade(question, work({ ...solution, z: 4 })).isCorrect, false, `${method}: a wrong value`);
    assert.equal(grade(question, work(solution, {})).isCorrect, false, `${method}: values with no checks`);
  }
  // Under studentChoice the route's own method is what makes it gradable: with
  // no method the grader reads the choice screen.
  const choice = { type: 'systemsWorkspace', mode: 'algebraic', method: 'studentChoice', equations, variables: ['x', 'y', 'z'] };
  assert.equal(grade(choice, work(solution, state.verification, '')).isCorrect, false);
});

test('a 3×3 of such equations opens the equation-by-equation board, before any method choice, and the methods no longer refuse it', () => {
  const dispatch = source('src/tools/systemsWorkspace/Algebraic3SystemMode.jsx');
  assert.match(dispatch, /const separated = useMemo\(\(\) => separatedRows\(config\.equations, config\.variables\), \[config\.equations, config\.variables\]\);/);
  // No method to choose, and so no method-choice Undo.
  assert.match(dispatch, /const isStudentChoice = config\.method === 'studentChoice' && !separated;/);
  const board = dispatch.indexOf('if (separated) {');
  const choiceScreen = dispatch.indexOf('if (isStudentChoice && !effectiveMethod) {');
  assert.ok(board > 0 && board < choiceScreen, 'the board comes before the choice screen and the methods');
  assert.match(region(dispatch, 'if (separated) {', 'if (isStudentChoice && !effectiveMethod) {', 'board route'), /return <EquationByEquationMode questionData=\{questionData\} config=\{config\} rows=\{separated\.rows\}/);
  ['EliminationReductionMode', 'SubstitutionReductionMode'].forEach((name) => {
    assert.doesNotMatch(source(`src/tools/systemsWorkspace/${name}.jsx`), /data-no-shared-variable|cannot be finished in this workspace/, name);
  });

  const mode = source('src/tools/systemsWorkspace/EquationByEquationMode.jsx');
  // Each row: its value as written, or the student's own solve of THAT row.
  const entries = region(mode, 'const entries = rows.map((row) => {', 'const pending', 'row values');
  assert.match(entries, /if \(row\.given !== null\) return \{ row, value: row\.given/);
  assert.match(entries, /const record = solved\?\.\[row\.index\];/);
  assert.match(entries, /record\?\.variable === row\.variable && Number\.isFinite\(Number\(record\.value\)\)/);
  // Step Algebra on the first row still to solve, and nothing else until every value is known.
  assert.match(mode, /\{pending \? \(\s*<EmbeddedStepAlgebra[\s\S]*?equationText=\{system\.equations\[pending\.index\]\.text\}[\s\S]*?solveFor=\{pending\.variable\}[\s\S]*?onSolved=\{\(latexResponse\) => handleSolved\(pending, latexResponse\)\}/);
  assert.match(mode, /const solution = pending \? null : /);
  // The 3×3's own checks, in all three equations, before Check.
  assert.match(mode, /\{solution && config\.requireVerification \? \(\s*<OriginalEquationsVerification\s+state=\{check\}/);
  assert.match(mode, /const verified = Boolean\(solution\) && \(!config\.requireVerification \|\| allOriginalsVerified\(check, system\)\);/);
  assert.match(mode, /\{readyToSubmit \? <button type="button" onClick=\{checkWork\}/);
  // The work the grader reads, with the route's own method.
  const work = region(mode, 'const work = {', '};', 'work');
  assert.match(work, /method: BY_EQUATION_METHOD,/);
  assert.match(work, /values: solvedValuesWork\(/);
  assert.match(work, /verification: verificationSidesWork\(check\.verification\),/);
  assert.match(mode, /export const BY_EQUATION_METHOD = 'byEquation';/);
  // The student's solves and checks are part of Undo.
  assert.match(mode, /const historyState = useMemo\(\(\) => \(\{ solved, verification: check\.verification \}\)/);
});
