/*
 * matrixLab — SERVER-AUTHORITATIVE GRADING PARITY.
 *
 * The Matrix Lab's Check asks the shared grader
 * (functions/shared/serverGrading/tools/matrixLab.mjs), the same pure function
 * the server runs on the raw work. These tests pin, for every mode:
 *
 *   - the verdict, against keys DERIVED from the question's givens (the
 *     product from the matrices, A, B and X from the equations) — the
 *     question never carries an authored answer to disagree with;
 *   - that the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the serialized tool response) agree exactly;
 *   - that equivalent work counts (a row multiplied through by −1, the rows in
 *     another order, 14.75 for 59/4, 3.3333 for 10/3) and near misses do not
 *     (b₁₃ for b₃₁, 14.8 for 59/4, "many" for a contradictory system);
 *   - that tampered or malformed work never crashes and never earns credit;
 *   - that the component grades and reports through the grader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import matrixLabGrader, { matrixEquationDiagnostics, matrixLabWork } from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import matrixLabDeclaration from '../../functions/shared/serverGrading/declarations/matrixLab.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { boundToolWork } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource } from '../platform/helpers/sourceContract.mjs';

const TOOL_DIR = new URL('../../src/tools/matrixLab/', import.meta.url);
const COMPONENT_SOURCES = readdirSync(TOOL_DIR).filter((file) => file.endsWith('.jsx')).map((file) => readFileSync(new URL(file, TOOL_DIR), 'utf8'));

/** Grade through the browser path and the server path; they must agree exactly. */
const bothPaths = (question, work) => {
  const browser = gradeToolCheck(matrixLabGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces the tool response it would send');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return browser;
};
/** The lab's own state, as the work its Check submits. */
const grade = (question, state) => bothPaths(question, matrixLabWork(question, state));
const wrongParts = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

const typeTool = (question) => ({ type: 'matrixLab', ...question });

const SPRINTERS = typeTool({
  mode: 'operate',
  matrices: {
    A: { rows: [{ cells: [3, 1, 0, 0, 0] }, { cells: [0, 2, 0, 1, 2] }, { cells: [0, 1, 3, 1, 2] }, { cells: [2, 1, 0, 1, 1] }] },
    B: { rows: [[10], [8], [6], [4], [2]] },
  },
  left: 'A',
  right: 'B',
});
const SHOES_B = typeTool({
  mode: 'locate',
  matrices: { B: { rows: [[1, 1, 0, 0], [0, 4, 4, 6], [1, 5, 5, 7], [2, 3, 3, 5], [2, 2, 2, 6]] } },
  matrix: 'B',
  targets: [
    { id: 'size10E', kind: 'notation', row: 3, col: 1, description: 'size 10E' },
    { id: 'b42', kind: 'tap', row: 4, col: 2 },
  ],
});
const SEVEN_D = typeTool({ mode: 'solve', equations: ['2x - 3z = 4', '2x + y - 5z = -1', '3y - 4z = 2'] });
const SEVEN_D_A = [['2', '0', '-3'], ['2', '1', '-5'], ['0', '3', '-4']];
const SEVEN_D_B = ['4', '-1', '2'];

test('matrixLab is declared shared-server in all five modes, and the manifest and graders agree', () => {
  assert.equal(GRADING_MANIFEST.matrixLab, matrixLabDeclaration);
  assert.equal(TOOL_GRADERS.matrixLab, matrixLabGrader);
  assert.deepEqual(Object.keys(matrixLabDeclaration.modes).sort(), ['completeSystem', 'equation', 'locate', 'operate', 'solve']);
  for (const mode of Object.values(matrixLabDeclaration.modes)) assert.equal(mode.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.deepEqual(matrixLabGrader.problems, []);
  // The component renders operate for a missing or unknown mode; so does the grader.
  assert.equal(resolveToolMode(matrixLabDeclaration, {}), 'operate');
  assert.equal(resolveToolMode(matrixLabDeclaration, { mode: 'rref' }), 'operate');
});

test('locate: the dimensions and each element, row first; a transposed element is wrong', () => {
  const right = grade(SHOES_B, { dimensions: { rows: '5', cols: '4' }, targets: { size10E: { row: '3', col: '1' }, b42: { row: 4, col: 2 } } });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  const transposed = grade(SHOES_B, { dimensions: { rows: '4', cols: '5' }, targets: { size10E: { row: '1', col: '3' }, b42: { row: 2, col: 4 } } });
  assert.deepEqual(wrongParts(transposed), ['dimensions', 'size10E', 'b42']);
  assert.equal(transposed.score, 0);
});

test('operate: defined, dimensions and every entry of A·B; one wrong entry costs exactly that part', () => {
  const right = grade(SPRINTERS, { defined: 'yes', dimensions: { rows: '4', cols: '1' }, entries: [['38'], ['24'], ['34'], ['34']] });
  assert.equal(right.isCorrect, true);
  const oneOff = grade(SPRINTERS, { defined: 'yes', dimensions: { rows: '4', cols: '1' }, entries: [['38'], ['24'], ['34'], ['30']] });
  assert.deepEqual(wrongParts(oneOff), ['r4c1']);
  assert.equal(oneOff.score, 5 / 6);
  // Saying a defined product is undefined is wrong, and earns nothing for the cells it never filled.
  const refused = grade(SPRINTERS, { defined: 'no' });
  assert.equal(refused.isCorrect, false);
  assert.equal(refused.isComplete, false);
});

test('operate: an undefined product is right only when the student says so', () => {
  const question = typeTool({ mode: 'operate', matrices: { P: [[1, 2], [3, 4]], Q: [[1, 2, 3]] }, left: 'P', right: 'Q' });
  assert.equal(grade(question, { defined: 'no' }).isCorrect, true);
  assert.equal(grade(question, { defined: 'yes', dimensions: { rows: '2', cols: '3' } }).isCorrect, false);
});

test('operate: fractions in, exact fractions or decimals out, and the inverse judgement follows the product', () => {
  const jackson = typeTool({
    mode: 'operate', askDefined: false, judgeInverse: true,
    matrices: { R: [['2/3', 1], [6, -1]], S: [['3/2', 1], ['1/6', -1]] }, left: 'R', right: 'S',
  });
  const right = grade(jackson, { entries: [['7/6', '-1/3'], ['53/6', '7']], inverses: 'no' });
  assert.equal(right.isCorrect, true);
  assert.equal(grade(jackson, { entries: [['1.1667', '−0.3333'], ['\\frac{53}{6}', '7']], inverses: 'no' }).isCorrect, true, 'four-place decimals and LaTeX fractions');
  assert.deepEqual(wrongParts(grade(jackson, { entries: [['1.2', '-1/3'], ['53/6', '7']], inverses: 'no' })), ['r1c1'], '1.2 is not 7/6');
  assert.deepEqual(wrongParts(grade(jackson, { entries: [['7/6', '-1/3'], ['53/6', '7']], inverses: 'yes' })), ['inverses']);
  const inverses = typeTool({ mode: 'operate', askDefined: false, judgeInverse: true, matrices: { A: [[2, 3], [1, 2]], B: [[2, -3], [-1, 2]] }, left: 'A', right: 'B' });
  assert.equal(grade(inverses, { entries: [['1', '0'], ['0', '1']], inverses: 'yes' }).isCorrect, true);
});

test('operate: addition needs matching dimensions and adds position by position', () => {
  const total = typeTool({ mode: 'operate', operation: 'add', matrices: { Nov: [[230, 112], [110, 89], [550, 95]], Dec: [[496, 129], [850, 233], [348, 308]] }, left: 'Nov', right: 'Dec' });
  assert.equal(grade(total, { defined: 'yes', dimensions: { rows: '3', cols: '2' }, entries: [['726', '241'], ['960', '322'], ['898', '403']] }).isCorrect, true);
  assert.equal(grade(total, { defined: 'yes', dimensions: { rows: '3', cols: '2' }, entries: [['726', '241'], ['960', '322'], ['898', '400']] }).isCorrect, false);
});

test('equation: the standard-form rows, in any order and any nonzero multiple; a row copied as printed is wrong and named', () => {
  const question = typeTool({ mode: 'equation', equations: ['3x + 2y + 2z = 4', '5x = -4y', '-x + 2y = 12 + z'] });
  assert.equal(grade(question, { A: [['3', '2', '2'], ['5', '4', '0'], ['-1', '2', '-1']], B: ['4', '0', '12'] }).isCorrect, true);
  assert.equal(grade(question, { A: [['1', '-2', '1'], ['3', '2', '2'], ['10', '8', '0']], B: ['-12', '4', '0'] }).isCorrect, true, 'reordered, one row ×(−1), one row ×2');
  const nicky = typeTool({ mode: 'equation', equations: ['2x - 4y = 5z - 1', '-x = 5y - 3z', '3x - 5y - 3z = 14'] });
  const work = matrixLabWork(nicky, { A: [['2', '-4', '5'], ['-1', '5', '-3'], ['3', '-5', '-3']], B: ['-1', '0', '14'] });
  const result = bothPaths(nicky, work);
  assert.deepEqual(wrongParts(result), ['row1', 'row2']);
  assert.deepEqual(matrixEquationDiagnostics(nicky, work), ['asWritten', 'asWritten', null]);
  // A zero row is no equation at all, even though 0 is a multiple of anything.
  assert.equal(grade(question, { A: [['0', '0', '0'], ['5', '4', '0'], ['-1', '2', '-1']], B: ['0', '0', '12'] }).isCorrect, false);
});

test('solve: exact answers, their decimals, never a rounding that changes the value', () => {
  const state = (values) => ({ A: SEVEN_D_A, B: SEVEN_D_B, classification: 'one', values });
  assert.equal(grade(SEVEN_D, state(['59/4', '12', '17/2'])).isCorrect, true);
  assert.equal(grade(SEVEN_D, state(['14.75', '12', '8.5'])).isCorrect, true);
  assert.deepEqual(wrongParts(grade(SEVEN_D, state(['14.8', '12', '8.5']))), ['value-x']);
  // A wrong matrix equation is marked by row, even when the student copied the right answer.
  const wrongRow = grade(SEVEN_D, { A: [['2', '-3', '0'], ['2', '1', '-5'], ['0', '3', '-4']], B: SEVEN_D_B, classification: 'one', values: ['59/4', '12', '17/2'] });
  assert.deepEqual(wrongParts(wrongRow), ['row1']);
});

test('solve: a singular system is classified, none versus many, and asks for no values', () => {
  const none = typeTool({ mode: 'solve', equations: ['5x + y + 3z = 9', '-x - 2y - z = -16', '2x + 4y + 2z = -30'] });
  const A = [['5', '1', '3'], ['-1', '-2', '-1'], ['2', '4', '2']];
  const B = ['9', '-16', '-30'];
  assert.equal(grade(none, { A, B, classification: 'none' }).isCorrect, true);
  assert.deepEqual(wrongParts(grade(none, { A, B, classification: 'many' })), ['classification']);
  assert.ok(!grade(none, { A, B, classification: 'none' }).parts.some((part) => part.id.startsWith('value-')));
  const many = typeTool({ mode: 'solve', equations: ['x + 2y - z = 1', '2x - 2y - z = 2', '3x + 6y - 3z = 3'] });
  assert.equal(grade(many, { A: [['1', '2', '-1'], ['2', '-2', '-1'], ['3', '6', '-3']], B: ['1', '2', '3'], classification: 'many' }).isCorrect, true);
});

test('solve: A⁻¹ is graded exactly or to four places, with partial credit by cell', () => {
  const question = typeTool({ mode: 'solve', askInverse: true, equations: ['2x + 2z = 2', '5x + 3y = 4', '3y - 4z = 4'] });
  const base = { A: [['2', '0', '2'], ['5', '3', '0'], ['0', '3', '-4']], B: ['2', '4', '4'], classification: 'one', values: ['-4', '8', '5'] };
  assert.equal(grade(question, { ...base, inverse: [['-2', '1', '-1'], ['10/3', '-4/3', '5/3'], ['5/2', '-1', '1']] }).isCorrect, true);
  assert.equal(grade(question, { ...base, inverse: [['-2', '1', '-1'], ['3.3333', '-1.3333', '1.6667'], ['2.5', '-1', '1']] }).isCorrect, true);
  const rough = grade(question, { ...base, inverse: [['-2', '1', '-1'], ['3.3', '-1.3', '1.7'], ['2.5', '-1', '1']] });
  assert.deepEqual(wrongParts(rough), ['inverse']);
  assert.equal(rough.parts.find((part) => part.id === 'inverse').credit, 6 / 9);
});

test('solve, modeling: the hidden equations still decide which rows are right', () => {
  const baskets = typeTool({ mode: 'solve', showEquations: false, equations: ['x + y + z = 80', '15.75x + 25y + 32.5z = 2086.25', '2x = z'] });
  const right = grade(baskets, { A: [['-2', '0', '1'], ['1', '1', '1'], ['63', '100', '130']], B: ['0', '80', '8345'], classification: 'one', values: ['15', '35', '30'] });
  assert.equal(right.isCorrect, true, 'z − 2x = 0, the count, and the money equation ×4, in another order');
  const identity = grade(baskets, { A: [['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']], B: ['15', '35', '30'], classification: 'one', values: ['15', '35', '30'] });
  assert.deepEqual(wrongParts(identity), ['row1', 'row2', 'row3'], 'the answer written as x = 15, y = 35, z = 30 is not the model');
});

test('completeSystem: any third equation that makes the system dependent or contradictory', () => {
  const question = typeTool({ mode: 'completeSystem', equations: ['5x - 3y + z = -4', 'x + 2y - 3z = 0'], targets: [{ id: 'none', classification: 'none' }, { id: 'many', classification: 'many' }] });
  const rows = (none, many) => ({ rows: { none: { coefficients: none.slice(0, 3), constant: none[3] }, many: { coefficients: many.slice(0, 3), constant: many[3] } } });
  assert.equal(grade(question, rows(['10', '-6', '2', '1'], ['10', '-6', '2', '-8'])).isCorrect, true, 'the lesson\'s answers');
  assert.equal(grade(question, rows(['6', '-1', '-2', '5'], ['6', '-1', '-2', '-4'])).isCorrect, true, 'the SUM of the two equations works too');
  assert.deepEqual(wrongParts(grade(question, rows(['1', '0', '0', '1'], ['10', '-6', '2', '1']))), ['none', 'many'], 'a unique system, and a contradictory one in the "many" slot');
  assert.deepEqual(wrongParts(grade(question, rows(['10', '-6', '2', '1'], ['0', '0', '0', '0']))), ['many'], '0 = 0 is not an equation in x, y, z');
});

test('tampered and malformed work never crashes and never earns credit', () => {
  for (const question of [SPRINTERS, SHOES_B, SEVEN_D]) {
    for (const work of [{}, { entries: 'x' }, { A: [[{}]], B: null }, { targets: [{ id: '__proto__', row: 1, col: 1 }] }, { values: ['1e400', 'NaN', '99999999999999999999999'] }]) {
      const result = bothPaths(question, work);
      assert.equal(result.graded, true);
      assert.equal(result.isCorrect, false);
    }
  }
  assert.equal(matrixLabGrader.grade(SPRINTERS, null).graded, false);
});

test('the work never carries a key the response contract would drop', () => {
  for (const [question, state] of [
    [SEVEN_D, { A: SEVEN_D_A, B: SEVEN_D_B, classification: 'one', values: ['59/4', '12', '17/2'] }],
    [SPRINTERS, { defined: 'yes', dimensions: { rows: '4', cols: '1' }, entries: [['38'], ['24'], ['34'], ['34']] }],
    [SHOES_B, { dimensions: { rows: '5', cols: '4' }, targets: { size10E: { row: 3, col: 1 } } }],
  ]) {
    assert.deepEqual(boundToolWork(matrixLabWork(question, state)).dropped, []);
  }
});

test('the lab grades and reports through the shared grader, never a verdict of its own', () => {
  const executable = COMPONENT_SOURCES.map((source) => executableSource(source)).join('\n');
  assert.match(executable, /serverGrading\/tools\/matrixLab\.mjs/);
  assert.match(executable, /gradeToolCheck\(matrixLabGrader, questionData, work\)/);
  assert.match(executable, /useReportToolWork\(work\)/);
  assert.doesNotMatch(executable, /isCorrect:\s*(true|false)/, 'no hard-coded verdict');
});
