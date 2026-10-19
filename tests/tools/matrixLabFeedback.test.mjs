/*
 * MATRIX LAB — FEEDBACK THAT SAYS WHAT TO CHANGE, AND CREDIT FOR RIGHT WORK
 * (student pass 3, wave 5: PR-32, PR-33 and the matrices walkthrough's P2
 * cluster; handoff docs/handoffs/STUDENT_PASS3_MATRIX_LAB_FEEDBACK.md).
 *
 *   PR-33  a modeling item whose system is hidden accepts any system with the
 *          situation's solution set — a fact, or two facts combined — and
 *          never the answer written as rows; the browser and the server agree.
 *   P2-2   a singular system's "none or many" needs its reason (opt-in per
 *          question, so published items keep their grading).
 *   P2-3   one list of what to fix: a carried error is one line, each line
 *          names a row, a cell or a field, every wrong part is covered once.
 *   P2-5   A⁻¹ cells are named, "rounded too early" said, and the panel asks
 *          for what the grader accepts (3 places).
 *   P2-9   a third equation with no variables says why.
 *   P2-4   a figure sort names its wrong figures, by position.
 *   P2-6   a Pre-Flight hint lint, and the lesson's hints pass it.
 *   P2-10  a cell that is not a number keeps Check off before any try.
 *   P2-12  a press on the lab's calculator is recorded as calculatorUsed.
 *
 * No reason may reveal the key: the refusal reasons are computed from the
 * student's own work (a property test below), and the list renders only with
 * a verdict the activity shows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import matrixLabGrader, { matrixLabFixList, matrixLabWork, matrixLabWrongCells } from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { matchSituationRows, matrixLabHintLeaks, validateMatrixLabQuestion } from '../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { parseCell } from '../../functions/shared/toolMath/matrixLab/matrixMath.mjs';
import { figureMatchWrongItems } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { compileTemplates, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { supportChoices, supportSentences } from '../../src/platform/language/packs/esSupport.js';
import { auditAssignmentHintAnswers } from '../../src/platform/preflight/hintAnswerPreflight.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** Grade through the browser path and the server path; they must agree exactly. */
const bothPaths = (question, work) => {
  const browser = gradeToolCheck(matrixLabGrader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return browser;
};
const grade = (question, state) => {
  const work = matrixLabWork(question, state);
  const result = bothPaths(question, work);
  return { ...result, work, fixes: matrixLabFixList(question, work, result.parts) };
};
const rowVerdicts = (result) => result.parts.filter((part) => /^row\d$/.test(part.id)).map((part) => part.isCorrect);
// As CheckRow says a line (and hands it to Read aloud and Translate).
const fixText = (result) => result.fixes.map((line) => line.text || `Reconsider: ${line.labels.join(', ')}`.replace(/([^.?!])$/, '$1.'));

// The lesson's Talk the Talk (PR 10) and the theater (PR 11), as authored.
const BASKETS = {
  type: 'matrixLab', mode: 'solve', showEquations: false,
  equations: ['x + y + z = 80', '15.75x + 25y + 32.5z = 2086.25', '2x = z'],
};
const THEATER = {
  type: 'matrixLab', mode: 'solve', showEquations: false,
  equations: ['x + y + z = 82', 'y = z', '3.5x + 5y + 8.5z = 495'],
};
const SOLVED = { classification: 'one', values: ['15', '35', '30'] };
const CW7 = { type: 'matrixLab', mode: 'equation', equations: ['2x - y - 2z = 3', '3x + y - 2z = 11', '-2x - y + z = -8'] };
const CW9 = { type: 'matrixLab', mode: 'solve', equations: ['2x - 3y = 7', 'y + z = -5', 'x + 2y + 4z = -17'] };
const PR5 = { type: 'matrixLab', mode: 'solve', askInverse: true, equations: ['2x + 2z = 2', '5x + 3y = 4', '3y - 4z = 4'] };
const PR9 = {
  type: 'matrixLab', mode: 'completeSystem', equations: ['5x - 3y + z = -4', 'x + 2y - 3z = 0'],
  targets: [{ id: 'none', classification: 'none' }, { id: 'many', classification: 'many' }],
};
const CW10 = { type: 'matrixLab', mode: 'solve', justifySingular: true, equations: ['x + 2y - z = 1', '2x - 2y - z = 2', '3x + 6y - 3z = 3'] };
const CW10_A = [['1', '2', '-1'], ['2', '-2', '-1'], ['3', '6', '-3']];
const CW10_B = ['1', '2', '3'];

/* ------------------------------------------------------------------ PR-33 */

test('PR-33: a hidden-system item accepts the substitution model, a multiple, and any row order — on both paths', () => {
  // z = 2x substituted into the count: x + y + z = 80 → 3x + y = 80 (the walkthrough's refused model).
  const substituted = grade(BASKETS, { A: [['3', '1', '0'], ['63', '100', '130'], ['2', '0', '-1']], B: ['80', '8345', '0'], ...SOLVED });
  assert.equal(substituted.isCorrect, true, '3x + y = 80, money ×4 and 2x − z = 0 is a model of the baskets');
  const reordered = grade(BASKETS, { A: [['-2', '0', '1'], ['1', '1', '1'], ['15.75', '25', '32.5']], B: ['0', '80', '2,086.25'], ...SOLVED });
  assert.equal(reordered.isCorrect, true, 'rows in another order, one multiplied by −1, money with a comma');
  // The theater: y = z substituted into the count gives x + 2y = 82.
  const theater = grade(THEATER, { A: [['1', '2', '0'], ['0', '1', '-1'], ['3.5', '5', '8.5']], B: ['82', '0', '495'], classification: 'one', values: ['18', '32', '32'] });
  assert.equal(theater.isCorrect, true, 'x + 2y = 82 is a fact of the theater');
});

test('PR-33: the answer written as rows, a repeated fact and a row with no variable are still refused', () => {
  const answerAsModel = grade(BASKETS, { A: [['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']], B: ['15', '35', '30'], ...SOLVED });
  assert.deepEqual(rowVerdicts(answerAsModel), [false, false, false], 'x = 15 is true of the baskets but combines all three facts: not a model');
  const repeated = grade(BASKETS, { A: [['1', '1', '1'], ['2', '2', '2'], ['2', '0', '-1']], B: ['80', '160', '0'], ...SOLVED });
  assert.deepEqual(rowVerdicts(repeated), [true, false, true], 'the count twice is one fact');
  const zero = grade(BASKETS, { A: [['1', '1', '1'], ['15.75', '25', '32.5'], ['0', '0', '0']], B: ['80', '2086.25', '0'], ...SOLVED });
  assert.deepEqual(rowVerdicts(zero), [true, true, false], '0 = 0 says nothing');
  assert.deepEqual(matchSituationRows([null], [[parseCell('1'), parseCell('1')]]), [false], 'a row with a blank is never right');
});

test('PR-33: where the system is printed, a row is still one of its equations, and a combination says so', () => {
  const combined = grade(CW7, { A: [['5', '0', '-4'], ['3', '1', '-2'], ['-2', '-1', '1']], B: ['14', '11', '-8'] });
  assert.deepEqual(rowVerdicts(combined), [false, true, true], 'row 1 = equation 1 + equation 2 is refused on a printed system');
  assert.match(fixText(combined)[0], /^Row 1 combines two of the equations\./);
  const printedCopy = { ...CW7, showEquations: true };
  assert.deepEqual(rowVerdicts(grade(printedCopy, { A: [['2', '-1', '-2'], ['-3', '-1', '2'], ['-2', '-1', '1']], B: ['3', '-11', '-8'] })), [true, true, true], 'any nonzero multiple still counts');
});

test('PR-33: a refused row on a hidden system gives the same reason whether or not it is true — the reason reveals no key', () => {
  // Row 1 is "x = value": x = 15 is true of the baskets, x = 14 is not.
  const lineFor = (value) => fixText(grade(BASKETS, { A: [['1', '0', '0'], ['1', '1', '1'], ['2', '0', '-1']], B: [value, '80', '0'], ...SOLVED }))[0];
  const trueLine = lineFor('15');
  const falseLine = lineFor('14');
  assert.equal(trueLine, falseLine, 'x = 15 and x = 14 read the same');
  assert.match(trueLine, /not one of the situation's facts/);
  for (const value of ['15', '35', '30', '80', '2086']) assert.doesNotMatch(trueLine, new RegExp(`\\b${value}\\b`), `no key value (${value}) in the reason`);
});

test('S1: on a printed system a refused row reads the same whether or not it is true at the solution', () => {
  // CW 7's solution has x = 2. "1x + 0y + 0z = k" must not single out k = 2.
  const lineFor = (k) => fixText(grade(CW7, { A: [['1', '0', '0'], ['3', '1', '-2'], ['-2', '-1', '1']], B: [k, '11', '-8'] }))[0];
  const lines = ['1', '2', '3', '4'].map(lineFor);
  assert.equal(new Set(lines).size, 1, lines.join(' | '));
  // CW 9 (x, y, z = 1, −5/3, …): a value row reads the same too.
  const cw9Line = (k) => fixText(grade(CW9, { A: [['0', '1', '0'], ['0', '1', '1'], ['1', '2', '4']], B: [k, '-5', '-17'], classification: 'one', values: ['1', '1', '1'] }))[0];
  assert.equal(cw9Line('-3'), cw9Line('-4'));
  // A real combination of two printed equations still says so.
  assert.match(fixText(grade(CW7, { A: [['5', '0', '-4'], ['3', '1', '-2'], ['-2', '-1', '1']], B: ['14', '11', '-8'] }))[0], /combines two of the equations/);
});

test('S2: the hidden-system rule is "at most n − 1 facts" at every size', () => {
  const twoByTwo = { type: 'matrixLab', mode: 'solve', showEquations: false, variables: ['x', 'y'], equations: ['x + y = 30', 'y = 2x'] };
  const rows2 = (A, B) => rowVerdicts(grade(twoByTwo, { A, B, classification: 'one', values: ['10', '20'] }));
  assert.deepEqual(rows2([['1', '0'], ['0', '1']], ['10', '20']), [false, false], '2 × 2: the answer written as rows');
  assert.deepEqual(rows2([['2', '2'], ['-2', '1']], ['60', '0']), [true, true], '2 × 2: the facts, multiplied');
  const fourByFour = { type: 'matrixLab', mode: 'solve', showEquations: false, variables: ['w', 'x', 'y', 'z'], equations: ['w + x + y + z = 7', 'x = 2w', 'y = 3w', 'z - w = 0'] };
  const rows4 = (A, B) => rowVerdicts(grade(fourByFour, { A, B, classification: 'one', values: ['1', '2', '3', '1'] }));
  assert.deepEqual(rows4([['6', '0', '0', '1'], ['-2', '1', '0', '0'], ['-3', '0', '1', '0'], ['-1', '0', '0', '1']], ['7', '0', '0', '0']), [true, true, true, true], '4 × 4: 6w + z = 7 is x = 2w and y = 3w substituted into the count (three facts)');
  assert.equal(rows4([['7', '0', '0', '0'], ['-2', '1', '0', '0'], ['-3', '0', '1', '0'], ['-1', '0', '0', '1']], ['7', '0', '0', '0'])[0], false, '4 × 4: 7w = 7 needs all four facts — it is the value of w');
  assert.deepEqual(rows4([['1', '0', '0', '0'], ['0', '1', '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1']], ['1', '2', '3', '1']).filter(Boolean).length, 0, '4 × 4: the answer written as rows');
});

/* ------------------------------------------------------------------- P2-2 */

test('P2-2: a singular decision needs its reason, read from the student\'s own rows', () => {
  const base = { A: CW10_A, B: CW10_B, classification: 'many' };
  const reason = { row: '3', otherRow: '1', factor: '3', constant: 'follows' };
  assert.equal(grade(CW10, base).isCorrect, false, '"many" alone is a guess');
  assert.equal(grade(CW10, { ...base, singularReason: reason }).isCorrect, true, 'row 3 = 3 × row 1, constants follow: many');
  assert.equal(grade(CW10, { ...base, singularReason: { ...reason, factor: '2' } }).isCorrect, false, 'the wrong multiple');
  assert.equal(grade(CW10, { ...base, singularReason: { ...reason, otherRow: '2' } }).isCorrect, false, 'rows that are not multiples');
  assert.equal(grade(CW10, { ...base, classification: 'none', singularReason: { ...reason, constant: 'breaks' } }).isCorrect, false, '"breaks" is false of these constants');
  assert.equal(grade(CW10, { ...base, classification: 'none', singularReason: reason }).isCorrect, false, 'a reason that says "follows" does not support "none"');
  assert.equal(grade(CW10, { ...base, singularReason: { row: '1', otherRow: '3', factor: '1/3', constant: 'follows' } }).isCorrect, true, 'either direction, with its multiple');
  // Part level (S4): the reason part itself, not only the whole verdict.
  const reasonPart = (state) => grade(CW10, state).parts.find((part) => part.id === 'singularReason');
  assert.equal(reasonPart({ ...base, classification: 'none', singularReason: { ...reason, constant: 'breaks' } }).isCorrect, false, '"breaks" is false of these constants, whatever the decision');
  assert.equal(reasonPart({ ...base, classification: 'none', singularReason: reason }).isCorrect, false, 'a true reason that contradicts the decision chosen');
  assert.equal(reasonPart({ ...base, singularReason: reason }).isCorrect, true);
  // DOL 3's wrong read ("many" + a reason saying the constants follow) earns the
  // rows only: 3 of 5 parts.
  const dol3 = { type: 'matrixLab', mode: 'solve', justifySingular: true, equations: ['x - 2y + 3z = 4', '2x + y - z = 1', '-3x + 6y - 9z = 12'] };
  const misread = grade(dol3, { A: [['1', '-2', '3'], ['2', '1', '-1'], ['-3', '6', '-9']], B: ['4', '1', '12'], classification: 'many', singularReason: { row: '3', otherRow: '1', factor: '-3', constant: 'follows' } });
  assert.equal(misread.score, 3 / 5);
});

test('P2-2: a question that does not ask for the reason grades exactly as before, and its work carries no new field', () => {
  const { justifySingular, ...published } = CW10;
  assert.equal(justifySingular, true);
  const result = grade(published, { A: CW10_A, B: CW10_B, classification: 'many' });
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts.some((part) => part.id === 'singularReason'), false);
  assert.equal('singularReason' in result.work, false);
  assert.ok('singularReason' in matrixLabWork(CW10, {}), 'asked for: sent');
});

test('P2-2: Pre-Flight refuses justifySingular where no two rows of A are multiples', () => {
  assert.deepEqual(validateMatrixLabQuestion(CW10), []);
  const noPair = { ...CW10, equations: ['x + y + z = 1', 'x - y + z = 2', '2x + 0y + 2z = 3'] };
  assert.equal(validateMatrixLabQuestion(noPair).length, 1);
  assert.match(validateMatrixLabQuestion(noPair)[0], /no two rows of this A are/);
});

/* ------------------------------------------------- P2-3, P2-5, P2-9 lists */

const coversEachWrongPartOnce = (result) => {
  const wrong = result.parts.filter((part) => !part.isCorrect).map((part) => part.id).sort();
  const covered = result.fixes.flatMap((line) => line.ids).sort();
  assert.deepEqual(covered, wrong, 'every wrong part is on the list exactly once');
};

test('P2-3: a missing variable written as 1 is three lines, not five — the rows say why, x, y, z are one carried line', () => {
  const result = grade(CW9, { A: [['2', '-3', '1'], ['1', '1', '1'], ['1', '2', '4']], B: ['7', '-5', '-17'], classification: 'one', values: ['6/7', '-39/14', '-43/14'] });
  coversEachWrongPartOnce(result);
  assert.deepEqual(fixText(result), [
    'Row 1: equation 1 has no z term. A missing variable still has a place in A — what is its coefficient?',
    'Row 2: equation 2 has no x term. A missing variable still has a place in A — what is its coefficient?',
    'Your x, y and z are what your A and B give. Fix the rows above, then run the calculator again.',
  ]);
  // Values that do NOT follow from the student's rows are not called carried.
  const unrelated = grade(CW9, { A: [['2', '-3', '1'], ['1', '1', '1'], ['1', '2', '4']], B: ['7', '-5', '-17'], classification: 'one', values: ['1', '2', '3'] });
  assert.equal(fixText(unrelated)[2], 'Reconsider the values of x, y and z.');
});

test('P2-5: A⁻¹ is marked cell by cell, rounding too early is said, and the panel asks for what the grader accepts', () => {
  const state = { A: [['2', '0', '2'], ['5', '3', '0'], ['0', '3', '-4']], B: ['2', '4', '4'], inverse: [['-2', '1', '-1'], ['3.3', '-1.3', '1.7'], ['2.5', '-1', '5']], classification: 'one', values: ['-1', '3', '2'] };
  const result = grade(PR5, state);
  coversEachWrongPartOnce(result);
  assert.equal(fixText(result)[0], 'In the inverse matrix, row 3, column 3 is not right yet. In the inverse matrix, row 2, columns 1, 2 and 3 were rounded too early. Write the exact fraction, or keep at least 3 decimal places.');
  assert.deepEqual([...matrixLabWrongCells(PR5, result.work).inverse].sort(), ['1,0', '1,1', '1,2', '2,2']);
  // 3 places is accepted (cellMatches), so the panel must not ask for 4.
  assert.equal(grade(PR5, { ...state, inverse: [['-2', '1', '-1'], ['3.333', '-1.333', '1.667'], ['2.5', '-1', '1']] }).parts.find((part) => part.id === 'inverse').isCorrect, true);
  const lab = executableSource(read('src/tools/matrixLab/MatrixLab.jsx'));
  assert.match(lab, /Record A⁻¹ \(exact fractions, or decimals to at least 3 places\)/);
  assert.doesNotMatch(lab, /decimals to 4 places/);
});

test('P2-9: a third equation with every coefficient 0 says why it cannot complete the system', () => {
  const result = grade(PR9, { rows: { none: { coefficients: ['10', '-6', '2'], constant: '5' }, many: { coefficients: ['0', '0', '0'], constant: '0' } } });
  coversEachWrongPartOnce(result);
  assert.deepEqual(fixText(result), ['Your equation for infinitely many solutions: every coefficient is 0, so it is not an equation in x, y and z. It is true for every x, y and z, or for none, so it cannot complete the system. Give it at least one variable.']);
});

test('every sentence the list can say has its Spanish (Read aloud and Translate read it with the outcome)', () => {
  const pack = { language: 'es', sentences: compileTemplates(supportSentences), choices: compileTemplates(supportChoices) };
  const lines = [
    ...fixText(grade(CW9, { A: [['2', '-3', '1'], ['1', '1', '1'], ['1', '2', '4']], B: ['7', '-5', '-17'], classification: 'one', values: ['6/7', '-39/14', '-43/14'] })),
    ...fixText(grade(PR5, { A: [['2', '0', '2'], ['5', '3', '0'], ['0', '3', '-4']], B: ['2', '4', '4'], inverse: [['-2', '1', '-1'], ['3.3', '-1.3', '1.7'], ['2.5', '-1', '5']], classification: 'one', values: ['1.3', '1', '9'] })),
    ...fixText(grade(PR9, { rows: { none: { coefficients: ['0', '0', '0'], constant: '5' }, many: { coefficients: ['0', '0', '0'], constant: '0' } } })),
    ...fixText(grade(BASKETS, { A: [['1', '0', '0'], ['0', '0', '0'], ['2', '2', '2']], B: ['15', '80', '160'], classification: 'none' })),
    ...fixText(grade(BASKETS, { A: [['1', '1', '1'], ['2', '2', '2'], ['2', '0', '-1']], B: ['80', '160', '0'], ...SOLVED })),
    ...fixText(grade({ ...CW7, equations: ['2x - 4y = 5z - 1', '-x = 5y - 3z', '3x - 5y - 3z = 14'] }, { A: [['2', '-4', '5'], ['3', '1', '-2'], ['1', '-5', '-1']], B: ['-1', '11', '-8'] })),
    ...fixText(grade(CW7, { A: [['5', '0', '-4'], ['3', '1', '-2'], ['-2', '-1', '1']], B: ['14', '11', '-8'] })),
    ...fixText(grade(CW10, { A: CW10_A, B: CW10_B, classification: 'none', singularReason: { row: '3', otherRow: '1', factor: '3', constant: 'breaks' } })),
    'Not yet — see what to fix.',
  ];
  assert.ok(lines.length >= 15);
  for (const line of lines) {
    const translated = translateWithPack(line, pack, { language: 'es' });
    assert.equal(translated.coverage, 'full', `Spanish for: ${line}\n → ${translated.text}`);
  }
});

/* -------------------------------------------- the list never leaks, by wiring */

test('the list and the cell marks render only with a verdict the activity shows; the outcome is not said twice', () => {
  const ui = executableSource(read('src/tools/matrixLab/matrixLabUi.jsx'));
  const checkRow = region(ui, 'export function CheckRow', 'export const resizeCells', 'CheckRow');
  assert.match(checkRow, /const lines = feedback && !feedback\.isCorrect \? fixList : \[\]/, 'no verdict, no list');
  // The outcome comes after the list and does not repeat it as "Focus on".
  assert.ok(checkRow.indexOf('data-matrix-fix-list') < checkRow.indexOf('<AttemptOutcome'), 'list before the outcome box');
  assert.match(checkRow, /<AttemptOutcome showDetail=\{false\}/);
  assert.match(checkRow, /<ResultPill ok=\{feedback\.isCorrect\} stageCheck>/, 'the pill does not draw a second outcome');
  const lab = executableSource(read('src/tools/matrixLab/MatrixLab.jsx'));
  const submission = region(lab, 'function useLabSubmission', 'const reportCalculator', 'useLabSubmission');
  assert.match(submission, /const missed = feedback && !feedback\.isCorrect \? feedback : null;/);
  assert.match(submission, /missed \? matrixLabFixList\(/);
  assert.match(submission, /missed \? matrixLabWrongCells\(/);
  // useToolSubmission holds no feedback where the activity withholds it.
  assert.match(read('src/tools/shared/useToolSubmission.js'), /setFeedback\(showImmediateFeedback \? payload : null\)/);
});

/* ------------------------------------------------------------------ P2-10 */

test('P2-10: in every view Check waits for a readable cell and an edited start; a prefilled answer is refused at Pre-Flight', () => {
  const lab = executableSource(read('src/tools/matrixLab/MatrixLab.jsx'));
  const views = ['function LocateMode', 'function OperateMode', 'function EquationMode', 'function SolveMode', 'function CompleteSystemMode'];
  views.forEach((start, index) => {
    const body = region(lab, start, views[index + 1] || null, start);
    assert.match(body, /const blocker = formatProblem\(/, `${start} reads its cells`);
    assert.match(body, /const complete = !blocker && /, `${start}: Check is off while a cell is not a number`);
    assert.match(body, /blocker=\{blocker\}/, `${start} says why`);
  });
  // S3: an untouched start asks once, it never blocks — in both views that build A · X = B.
  for (const [start, end] of [['function EquationMode', 'function SolveMode'], ['function SolveMode', 'function CompleteSystemMode']]) {
    const view = region(lab, start, end);
    assert.match(view, /const confirm = (model\.buildEquation && )?untouchedStart\(model, initial, A, B\) \? UNTOUCHED_START : null;/, `${start} asks about an untouched start`);
    assert.match(view, /confirm=\{confirm\}/, `${start} hands it to Check`);
    assert.doesNotMatch(region(view, 'const blocker', ';'), /UNTOUCHED_START/, `${start}: an untouched start does not keep Check off`);
  }
  const ui = executableSource(read('src/tools/matrixLab/matrixLabUi.jsx'));
  // The prompt names the button as it reads (D9, wave 7): "press Submit
  // again" where the press spends a try, never "press Check" beside Submit.
  assert.match(lab, /const UNTOUCHED_START = \(actionName\) => `[^`]*press \$\{actionName\} again[^`]*`;/);
  assert.doesNotMatch(lab, /press Check again/);
  assert.match(region(ui, 'export function CheckRow', '\n}\n'), /const actionName = useSubmitActionName\('Check'\);[\s\S]*\{typeof confirm === 'function' \? confirm\(actionName\) : confirm\}/);
  const context = executableSource(read('src/tools/shared/ToolRuntimeContext.jsx'));
  assert.match(region(context, 'export const useSubmitActionName', '};'), /if \(submitLabel\) return submitLabel;\s*return submitCost \? 'Submit' : ownName;/, 'the host label, then Submit where it costs a try, then the tool\'s word');
  assert.match(region(ui, 'const press = ', '};'), /if \(confirm && !asking\) \{ (askedAt\.current = Date\.now\(\); )?setConfirmed\(confirm\); return; \}/, 'the first press asks; the second checks');
  assert.match(ui, /onClick=\{press\}/);
  // A second press within the settle time is the same gesture (a double-click).
  assert.match(region(ui, 'const press = ', '};'), /if \(asking && Date\.now\(\) - askedAt\.current < CONFIRM_SETTLE_MS\) return;/);
  assert.match(region(lab, 'const formatProblem', 'const gridFields'), /SIGN_ONLY\.test\(raw\)/);
  const start = { type: 'matrixLab', mode: 'equation', variables: ['x', 'y'], equations: ['x + y = 2', 'x - y = 0'] };
  assert.equal(validateMatrixLabQuestion({ ...start, startFrom: { A: [[1, 1], [1, -1]], B: [2, 0] } }).length, 1, 'a start that is already right');
  assert.deepEqual(validateMatrixLabQuestion({ ...start, startFrom: { A: [[1, 1], [1, 1]], B: [2, 0] } }), [], 'a start with a mistake');
  // A hidden system's start is judged by the hidden rule: a substituted model is already right.
  assert.equal(validateMatrixLabQuestion({ ...BASKETS, startFrom: { A: [[3, 1, 0], [63, 100, 130], [2, 0, -1]], B: [80, 8345, 0] } }).length, 1, 'a right model on a hidden system');
});

/* ------------------------------------------------------------------ P2-12 */

test('P2-12: every calculator in the lab reports its use, and QuestionEngine records it as the platform calculator', () => {
  const lab = executableSource(read('src/tools/matrixLab/MatrixLab.jsx'));
  assert.match(lab, /const reportCalculator = \(onAction\) => \(\) => onAction\?\.\('CALCULATOR_USED'\)/);
  const calculators = lab.match(/<MatrixCalculator[\s\S]*?\/>/g) || [];
  assert.equal(calculators.length, 3, 'operate, solve and completeSystem');
  calculators.forEach((element) => assert.match(element, /onRun=\{[\s\S]*reportCalculator\(onAction\)/, element.slice(0, 60)));
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const handler = region(engine, 'const handleMissingToolAction', "if (type !== 'ATTEMPT_SUBMITTED'", 'handleMissingToolAction');
  assert.match(handler, /if \(type === 'CALCULATOR_USED'\) \{\s*markCalculatorOpened\(\);\s*return;/);
  assert.match(region(engine, 'const markCalculatorOpened', '};'), /setCalculatorUsed\(true\)/);
});

/* ------------------------------------------------------------------- P2-4 */

test('P2-4: a sort names its wrong figures by position, and only from a shown verdict', () => {
  const stage = { items: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] };
  const key = { p1: 'a', p2: 'b', p3: 'a' };
  assert.deepEqual(figureMatchWrongItems(stage, { assignments: { p1: 'a', p2: 'a', p3: 'b' } }, key), [1, 2]);
  assert.deepEqual(figureMatchWrongItems(stage, { assignments: { p1: 'a', p2: 'b', p3: 'a' } }, key), []);
  assert.deepEqual(figureMatchWrongItems(stage, { assignments: { p1: 'b' } }, null), [], 'no key, nothing named');
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.match(runner, /const wrongItems = reviewStatus === 'incorrect' && stage\.kind === 'figureMatch'/);
  // The review exists only where QuestionEngine shows outcomes.
  assert.match(executableSource(read('src/QuestionEngine.jsx')), /submissionReview=\{showOutcomeFeedback \? workflowSubmissionReview : null\}/);
});

/* ------------------------------------------------------------------- P2-6 */

test('P2-6: the hint lint flags hints that state a row, a value or a place — and the lesson now passes it', () => {
  const lesson = compileTeacherImport(read('teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json'));
  assert.deepEqual(auditAssignmentHintAnswers(lesson.questions).warnings, [], 'the rewritten hints point at the move');
  const byId = (id) => lesson.questions.find((question) => question.questionId === id);
  // The walkthrough's hints, as they were (P2-6).
  const was = (id, hints) => matrixLabHintLeaks({ ...byId(id), hints }).map((leak) => leak.hint);
  assert.deepEqual(was('l3m-cw-8', ['Is each equation of the form Ax + By + Cz = D?', 'Move 5z to the left side: 2x − 4y − 5z = −1.', 'Equation 2 becomes −x − 5y + 3z = 0.']), [2, 3]);
  assert.deepEqual(was('l3m-pr-4', ['5x = −4y becomes 5x + 4y + 0z = 0.', '−x + 2y = 12 + z becomes −x + 2y − z = 12.']), [1, 2]);
  assert.deepEqual([...new Set(was('l3m-pr-10', ['One equation counts baskets…', '“Twice as many large as small”: z = 2x, which is 2x − z = 0 in standard form.']))], [2]);
  assert.deepEqual([...new Set(was('l3m-cw-2', ['B has a row for each width…', 'Size 10E: width E is row 3, size 10 is column 1.']))], [2]);
  assert.deepEqual(was('l3m-pr-10', ['A value: x = 15.']), [1], 'a value of the solution');
  assert.deepEqual(was('l3m-cw-9', ['Run [A]⁻¹·[B] on the calculator.']), [], 'a method hint is fine');
  const sort = { ...byId('l3m-cw-4'), hints: ['(4 × 1) · (1 × 4): the inner 1s match, so the product is 4 × 4.'] };
  assert.equal(auditAssignmentHintAnswers([sort]).warnings.length, 1, 'a hint that sorts a figure');
});
