/*
 * THE PLATFORM PIECES THE MATRIX LAB NEEDS, EACH PINNED TO ITS BEHAVIOUR.
 *
 *   - exact matrix arithmetic: a singular matrix is singular exactly, an
 *     inverse is exact, a typed cell is read the platform's one way;
 *   - authoring: matrix actions compile to the lab (and to the right view)
 *     before the systems rules can claim them, without taking ordinary
 *     `solveSystem` questions away from the Systems Workspace;
 *   - storage: a matrix row becomes { cells } because Firestore holds no array
 *     inside an array — only where the Matrix Lab's contract puts a matrix;
 *   - display: QuestionVisual imports and draws named matrices in the authored
 *     layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifySystem,
  determinant,
  formatDecimal,
  formatRational,
  inverseMatrix,
  multiplyMatrices,
  parseCell,
  parseLinearEquation,
  parseMatrix,
  rational,
  systemMatrices,
} from '../../functions/shared/toolMath/matrixLab/matrixMath.mjs';
import { cellMatches, runCalculator, validateMatrixLabQuestion } from '../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { findFirestoreUnsafeNestedArrays, repairKnownFirestoreNestedArrays } from '../../src/platform/persistence/firestoreAssignmentSafety.js';
import { readDisplayMatrices } from '../../src/platform/math/displayMatrices.js';
import { executableSource } from './helpers/sourceContract.mjs';

const text = (matrix) => matrix.map((row) => row.map(formatRational));

test('a typed cell is one signed number, read exactly; anything else is not a number', () => {
  const read = (value) => formatRational(parseCell(value));
  assert.equal(read('59/4'), '59/4');
  assert.equal(read('\\frac{10}{3}'), '10/3');
  assert.equal(read('−0.5'), '-1/2');
  assert.equal(read('+4'), '4');
  assert.equal(read('2,086.25'), '8345/4');
  assert.equal(read(15.75), '63/4');
  for (const junk of ['', ' ', 'x', '1/0', '2 3', '1,2', '3x']) assert.equal(parseCell(junk), null, JSON.stringify(junk));
});

test('a singular matrix is singular exactly, and an inverse is exact', () => {
  const singular = parseMatrix([[1, 2, -1], [2, -2, -1], [3, 6, -3]]);
  assert.equal(formatRational(determinant(singular)), '0');
  assert.deepEqual(inverseMatrix(singular), { error: 'singular' });
  // A floating-point elimination would call this matrix invertible: its
  // determinant is a rounding error, not zero, in doubles.
  const nearlyFloat = parseMatrix([['0.1', '0.2', '0.3'], ['0.4', '0.5', '0.6'], ['0.7', '0.8', '0.9']]);
  assert.deepEqual(inverseMatrix(nearlyFloat), { error: 'singular' });
  const A = parseMatrix([[2, 0, 2], [5, 3, 0], [0, 3, -4]]);
  assert.deepEqual(text(inverseMatrix(A).value), [['-2', '1', '-1'], ['10/3', '-4/3', '5/3'], ['5/2', '-1', '1']]);
  assert.deepEqual(text(multiplyMatrices(A, inverseMatrix(A).value).value), [['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']]);
  assert.deepEqual(inverseMatrix(parseMatrix([[1, 2, 3]])), { error: 'notSquare' });
  assert.deepEqual(multiplyMatrices(parseMatrix([[1, 2]]), parseMatrix([[1, 2]])), { error: 'dimension' });
});

test('a system is read into standard form, and classified one / none / many', () => {
  assert.deepEqual(text([parseLinearEquation('-x + 2y = 12 + z').row]), [['-1', '2', '-1']]);
  assert.equal(formatRational(parseLinearEquation('-x + 2y = 12 + z').constant), '12');
  assert.equal(parseLinearEquation('xy = 3'), null);
  assert.equal(parseLinearEquation('x + y'), null);
  const solve = (equations) => {
    const { A, B } = systemMatrices(equations);
    const result = classifySystem(A, B);
    return result.solution ? result.solution.map(formatRational) : result.type;
  };
  assert.deepEqual(solve(['2x - 3z = 4', '2x + y - 5z = -1', '3y - 4z = 2']), ['59/4', '12', '17/2']);
  assert.equal(solve(['x + 5y - 2z = 3', '2x + 10y - 4z = 6', 'x + y + 3z = -1']), 'many');
  assert.equal(solve(['x + 5y - 2z = 3', '2x + 10y - 4z = 7', 'x + y + 3z = -1']), 'none');
});

test('the calculator prints exact results and the calculator\'s own errors', () => {
  assert.deepEqual(text(runCalculator('inverseTimes', [['2', '-3', '0'], ['0', '1', '1'], ['1', '2', '4']], [['7'], ['-5'], ['-17']]).value), [['5'], ['1'], ['-6']]);
  assert.equal(runCalculator('inverseTimes', [['1', '2', '-1'], ['2', '-2', '-1'], ['3', '6', '-3']], [['1'], ['2'], ['3']]).error, 'singular');
  assert.equal(runCalculator('multiply', [['1', '']], [['1'], ['2']]).error, 'invalid', 'a blank cell is not zero');
  assert.equal(formatDecimal(rational(10n, 3n)), '3.3333');
  assert.equal(formatDecimal(rational(-2n, 3n)), '-0.6667');
});

test('a long decimal counts only as a correct rounding with three or more places', () => {
  const tenThirds = rational(10n, 3n);
  assert.equal(cellMatches('3.3333', tenThirds), true);
  assert.equal(cellMatches('3.333', tenThirds), true);
  assert.equal(cellMatches('3.33', tenThirds), false);
  assert.equal(cellMatches('3.3334', tenThirds), false);
  assert.equal(cellMatches('14.75', rational(59n, 4n)), true);
  assert.equal(cellMatches('14.8', rational(59n, 4n)), false);
});

test('Pre-Flight refuses a Matrix Lab question it cannot give a student, and says why', () => {
  assert.deepEqual(validateMatrixLabQuestion({ mode: 'solve', equations: ['x + y + z = 1', 'x - y = 2', 'z = 3'] }), []);
  assert.match(validateMatrixLabQuestion({ mode: 'solve', askInverse: true, equations: ['x + 2y - z = 1', '2x - 2y - z = 2', '3x + 6y - 3z = 3'] }).join(' '), /singular/);
  assert.match(validateMatrixLabQuestion({ mode: 'equation', equations: ['x^2 + y = 3', 'x - y = 1'] }).join(' '), /could not read/);
  assert.match(validateMatrixLabQuestion({ mode: 'operate', matrices: { A: [[1, 'x']], B: [[1], [2]] } }).join(' '), /grid of numbers/);
  assert.match(validateMatrixLabQuestion({ mode: 'locate', matrices: { A: [[1, 2]] }, targets: [{ id: 't', row: 2, col: 1 }] }).join(' '), /inside matrix A/);
});

const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'T', courseId: 'algebra2' },
  sections: [{ id: 'classwork', role: 'classwork', questions: [{ questionId: 'q1', standard: 'A2.3B', prompt: 'P', ...question }] }],
}).package.sections[0].questions[0];

test('matrix actions compile to the Matrix Lab view they name, before the systems rules', () => {
  const cases = [
    [['locateMatrixElements'], 'locate'],
    [['multiplyMatrices'], 'operate'],
    [['checkInverseMatrices'], 'operate'],
    [['writeMatrixEquation'], 'equation'],
    [['solveWithMatrices'], 'solve'],
    [['writeThirdEquation'], 'completeSystem'],
  ];
  for (const [studentActions, mode] of cases) {
    const compiled = compileOne({ studentActions, equations: ['x + y + z = 1', 'x - y = 2', 'z = 3'], matrices: { A: [[1, 2], [3, 4]], B: [[1], [2]] } });
    assert.equal(compiled.type, 'matrixLab', studentActions[0]);
    assert.equal(compiled.mode, mode, studentActions[0]);
  }
  const modeling = compileOne({ studentActions: ['solveMatrixEquation'], equations: ['x + y + z = 80', 'y = z', '2x = z'], showEquations: false, variableMeanings: { x: 'small' } });
  assert.equal(modeling.showEquations, false, 'the hidden-system flag survives the compiler');
  assert.deepEqual(modeling.variableMeanings, { x: 'small' });
  // An ordinary 3 × 3 solve is still the Systems Workspace's.
  assert.equal(compileOne({ studentActions: ['solveSystem'], equations: ['x + y + z = 1', 'x - y = 2', 'z = 3'] }).type, 'systemsWorkspace');
  // Named matrices survive on an ordinary question, to be shown in its prompt.
  const shown = compileOne({ studentActions: ['multipleResponses'], matrices: { N: [[1, 2]] }, matrixLayout: ['N'], responses: [{ id: 'a', label: 'a', answer: '1' }] });
  assert.equal(shown.type, 'multiAnswer');
  assert.deepEqual(shown.matrixLayout, ['N']);
  assert.ok(shown.matrices.N);
});

test('a matrix row is stored as { cells } — only where the Matrix Lab contract puts a matrix', () => {
  const question = {
    matrices: { A: { rows: [[1, 2], [3, 4]] } },
    startFrom: { A: [[1, 2], [3, 4]], B: [1, 2] },
    grid: { rows: [[1, 2], [3, 4]] },
  };
  const repaired = repairKnownFirestoreNestedArrays(question);
  assert.deepEqual(repaired.value.matrices.A.rows, [{ cells: [1, 2] }, { cells: [3, 4] }]);
  assert.deepEqual(repaired.value.startFrom.A, [{ cells: [1, 2] }, { cells: [3, 4] }]);
  assert.equal(repaired.matrixRowPaths.length, 4);
  assert.equal(repaired.repairCount, 0, 'matrix rows are storage, not a coordinate-pair repair to warn about');
  // A `rows` that is not a Matrix Lab matrix is not guessed at: Pre-Flight still blocks it.
  assert.deepEqual(findFirestoreUnsafeNestedArrays(repaired.value), ['$.grid.rows[0]', '$.grid.rows[1]']);
  // And every reader takes the stored shape back.
  assert.deepEqual(text(parseMatrix(repaired.value.matrices.A)), [['1', '2'], ['3', '4']]);
  assert.deepEqual(readDisplayMatrices(repaired.value)[0].matrix.rows, [['1', '2'], ['3', '4']]);
});

test('QuestionVisual imports what it draws, and draws matrices in the authored layout', () => {
  const layout = readDisplayMatrices({ matrices: { Nov: [[1, 2]], Dec: [[3, 4]], Unused: [[5]] }, matrixLayout: ['Nov', '+', 'Dec', 'Missing'] });
  assert.deepEqual(layout.map((entry) => entry.name || entry.text), ['Nov', '+', 'Dec']);
  assert.deepEqual(readDisplayMatrices({ matrices: { A: [[1, 2], [3]] } }), [], 'a ragged matrix is never drawn');
  const source = executableSource(readFileSync(new URL('../../src/QuestionVisual.jsx', import.meta.url), 'utf8'));
  assert.match(source, /import MatrixGrid from '\.\/components\/common\/MatrixGrid\.jsx';/);
  assert.match(source, /import \{ readDisplayMatrices \} from '\.\/platform\/math\/displayMatrices\.js';/);
  assert.match(source, /const matrixLayout = readDisplayMatrices\(question\);/);
  assert.match(source, /<MatrixGrid key=\{`\$\{entry\.name\}-\$\{index\}`\} \{\.\.\.entry\.matrix\} \/>/);
});
