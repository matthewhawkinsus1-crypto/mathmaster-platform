/*
 * ALGEBRA II · MODULE 1 · TOPIC 2 · LESSON 3 — SOLVING SYSTEMS WITH MATRICES,
 * AS A TEACHER IMPORTS IT.
 *
 * One 90-minute lesson (A2.3B; the two modeling items A2.3A) in the four
 * sections, built from the district's lesson pages: Getting Started (Track
 * What Sold), Activity 3.1 (matrices and their inverses), Activity 3.2
 * (solving matrix equations), Talk the Talk and the Lesson 3 Assignment.
 *
 * Everything reads the file through the same chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the shared
 * graders the server runs. Two independent checks stand behind each key:
 *
 *   - the answers PRINTED in the lesson's teacher pages are pinned literally
 *     (38, 24, 34, 34 points; (5, 1, −6); (59/4, 12, 17/2); 15, 35, 30
 *     baskets …) and the grader must accept them;
 *   - each key is re-derived here with plain floating-point arithmetic and
 *     Cramer's rule — not with the lab's exact engine — so a key cannot pass
 *     by agreeing with itself.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { matrixLabWork } from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { answerLinesFromResolvedQuestion, printableQuestionFromResolved } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';

after(closeEngine);

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const LESSON = { raw: JSON.parse(TEXT), ...compileTeacherImport(TEXT) };
const compiled = (id) => {
  const question = LESSON.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the import compiles ${id}`);
  return question;
};
const grade = (question, state) => gradeToolWork({ toolId: 'matrixLab', question, work: matrixLabWork(question, state) });

/* -------------------------------------------- independent arithmetic */

// '−3/2', '2/3', 4 → a number.
const num = (value) => {
  const [n, d = '1'] = String(value).replace(/−/g, '-').split('/');
  return Number(n) / Number(d);
};
const cells = (matrix) => (matrix.rows || matrix).map((row) => (Array.isArray(row) ? row : row.cells).map(num));
const multiply = (A, B) => A.map((row) => B[0].map((_, q) => row.reduce((sum, value, k) => sum + value * B[k][q], 0)));
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
// Coefficients by hand from "ax + by + cz = d" text: substitute unit vectors.
const evaluateSide = (side, x, y, z) => Function('x', 'y', 'z', `return ${side.replace(/(\d)\s*([xyz])/g, '$1*$2')};`)(x, y, z);
const standardRow = (equation) => {
  const [left, right] = equation.split('=');
  const f = (x, y, z) => evaluateSide(left, x, y, z) - evaluateSide(right, x, y, z);
  const constant = -f(0, 0, 0) || 0; // never -0
  return [f(1, 0, 0) + constant, f(0, 1, 0) + constant, f(0, 0, 1) + constant, constant];
};
const cramer = (equations) => {
  const rows = equations.map(standardRow);
  const A = rows.map((row) => row.slice(0, 3));
  const b = rows.map((row) => row[3]);
  const D = det3(A);
  if (Math.abs(D) < 1e-12) return { singular: true, rows };
  const swap = (col) => A.map((row, i) => row.map((value, j) => (j === col ? b[i] : value)));
  return { singular: false, rows, solution: [0, 1, 2].map((col) => det3(swap(col)) / D) };
};
const close = (a, b) => Math.abs(a - b) < 1e-9;
const asText = (row) => row.map((value) => String(Math.round(value * 1e6) / 1e6));

/* ------------------------------------------------------------ shape */

test('the lesson passes the teacher import with no errors and one known, informational warning', () => {
  assert.deepEqual(LESSON.model.errors, []);
  assert.equal(LESSON.model.isValid, true);
  assert.deepEqual(LESSON.semantic.errors, []);
  // The one ACT-style item is authored, not drawn from the audited CCMR bank,
  // so Pre-Flight cannot label its provenance bank-backed. Nothing else.
  assert.deepEqual(LESSON.model.warnings, [
    'Question 25 is direct act practice but is not sourced from the audited CCMR V2.1 assignment bank. Its alignment can still validate, but MathMaster cannot label its provenance as bank-backed.',
  ]);
  assert.equal(compiled('l3m-pr-12-ccmr').assessmentContext.framework, 'act');
});

test('one 90-minute lesson in the four sections; Practice is the largest; the DOL is an exit ticket', () => {
  const sections = LESSON.raw.sections;
  assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.equal(sections.reduce((total, section) => total + section.recommendedMinutes, 0), 90);
  const counts = Object.fromEntries(sections.map((section) => [section.role, section.questions.length]));
  assert.ok(counts.practice >= counts.classwork, 'Practice gives at least as much work as Classwork');
  const dol = sections[3];
  assert.equal(dol.attemptsAllowed, 1);
  assert.equal(dol.hintsAllowed, false);
  assert.equal(dol.feedbackMode, 'afterAssignmentSubmit');
  for (const question of dol.questions) {
    assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
    assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
  }
  for (const question of sections.slice(0, 3).flatMap((section) => section.questions)) {
    assert.ok(question.hints?.length >= 2, `${question.questionId} offers hints`);
  }
  assert.equal(LESSON.questions.length, sections.reduce((total, section) => total + section.questions.length, 0), 'every question survives the import');
});

test('the lesson is done with the Matrix Lab, not typed boxes', () => {
  const types = LESSON.questions.map((question) => question.type);
  assert.ok(types.filter((type) => type === 'matrixLab').length >= 22, `${types.filter((type) => type === 'matrixLab').length} Matrix Lab items`);
  assert.ok(types.filter((type) => type === 'multiAnswer').length <= 3);
  const modes = new Set(LESSON.questions.filter((question) => question.type === 'matrixLab').map((question) => question.mode));
  assert.deepEqual([...modes].sort(), ['completeSystem', 'equation', 'locate', 'operate', 'solve']);
  for (const question of LESSON.questions.filter((candidate) => candidate.type === 'matrixLab')) {
    assert.deepEqual(validateToolQuestion(question).errors, [], `${question.questionId} is a valid Matrix Lab question`);
    assert.ok(buildToolSolutionReviewModel(question)?.steps?.length, `${question.questionId} has a worked solution once it closes`);
  }
});

test('every typed and chosen key is accepted by the shared grader, and a wrong answer is not', () => {
  for (const question of LESSON.questions.filter((candidate) => candidate.type === 'multiAnswer')) {
    const fields = question.answerFields;
    const right = Object.fromEntries(fields.map((field) => [field.id, String(field.answer)]));
    assert.equal(gradeMultiAnswerResponse(question, right).isCorrect, true, `${question.questionId}: its own key is correct`);
    for (const field of fields) {
      const wrong = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : '999';
      assert.equal(gradeMultiAnswerResponse(question, { ...right, [field.id]: wrong }).isCorrect, false, `${question.questionId}.${field.id}: "${wrong}" is wrong`);
    }
    for (const field of fields.filter((candidate) => candidate.type === 'choice')) assert.ok(field.options.length >= 3, `${question.questionId}.${field.id}: a real distractor`);
  }
});

/* ------------------------------------------------ Getting Started */

test('Getting Started: the money totals and the least-sold card come from the two months', () => {
  const question = compiled('l3m-wu-1');
  const nov = cells(question.matrices.Nov);
  const dec = cells(question.matrices.Dec);
  const keys = Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer]));
  assert.equal(num(keys.grocery25), (nov[1][1] + dec[1][1]) * 25, '(89 + 233)25 = 8050');
  assert.equal(num(keys.gas50), (nov[2][0] + dec[2][0]) * 50, '(550 + 348)50 = 44,900');
  const totals = { '$20 gas cards': nov[0][0] + dec[0][0], '$20 grocery cards': nov[0][1] + dec[0][1], '$25 grocery cards': nov[1][1] + dec[1][1], '$50 grocery cards': nov[2][1] + dec[2][1] };
  assert.equal(keys.least, Object.entries(totals).sort((a, b) => a[1] - b[1])[0][0]);
  const sum = compiled('l3m-wu-2');
  const total = nov.map((row, i) => row.map((value, j) => value + dec[i][j]));
  assert.equal(grade(sum, { defined: 'yes', dimensions: { rows: '3', cols: '2' }, entries: total.map(asText) }).isCorrect, true);
  assert.equal(grade(sum, { defined: 'yes', dimensions: { rows: '3', cols: '2' }, entries: nov.map(asText) }).isCorrect, false, 'November alone is not the total');
});

// The walkthrough's P0: the money totals written the way money is written.
test('Getting Started: a money total written with a thousands comma is accepted', () => {
  const question = compiled('l3m-wu-1');
  const answer = (overrides) => gradeMultiAnswerResponse(question, {
    same: 'Yes — the same numbers, organized in rows and columns', grocery25: '8050', gas50: '44900', least: '$20 grocery cards', ...overrides,
  });
  assert.equal(answer({ grocery25: '8,050', gas50: '44,900' }).isCorrect, true);
  assert.equal(answer({ grocery25: '$8,050', gas50: '$44,900' }).isCorrect, true);
  assert.equal(answer({ grocery25: '8,05' }).isCorrect, false);
  assert.equal(answer({ grocery25: '80,50' }).isCorrect, false);
});

/* ------------------------------------------------- Activity 3.1 */

test('3.1 Q1–2: the shoe matrices — 4 × 5, a₃₄ = 7, b₃₁ for size 10E, and b₄₂ is not b₂₄', () => {
  const a = compiled('l3m-cw-1');
  const shoesA = cells(a.matrices.A);
  assert.equal(shoesA[2][3], 7, 'a₃₄: 7 pairs of 12E');
  assert.equal(shoesA[3][4], 2, 'a₄₅: 2 pairs of 13EE');
  assert.equal(shoesA[1][0], 5, 'a₂₁: 5 pairs of 9D');
  const tapped = { a34: { row: 3, col: 4 }, a45: { row: 4, col: 5 }, a21: { row: 2, col: 1 } };
  assert.equal(grade(a, { dimensions: { rows: '4', cols: '5' }, targets: tapped }).isCorrect, true);
  assert.equal(grade(a, { dimensions: { rows: '5', cols: '4' }, targets: tapped }).isCorrect, false, 'columns × rows is not the dimension');
  const b = compiled('l3m-cw-2');
  const named = Object.fromEntries(b.targets.map((target) => [target.id, { row: target.row, col: target.col }]));
  // Width labels down the side, sizes across the top: 10E is row E, column 10.
  const at = (width, size) => ({ row: b.matrices.B.rowLabels.indexOf(width) + 1, col: b.matrices.B.colLabels.indexOf(size) + 1 });
  assert.deepEqual(named, { size10E: at('E', '10'), size11EE: at('EE', '11'), size13D: at('D', '13') });
  assert.equal(grade(b, { dimensions: { rows: '5', cols: '4' }, targets: named }).isCorrect, true);
  assert.equal(grade(b, { dimensions: { rows: '5', cols: '4' }, targets: { ...named, size11EE: { row: 2, col: 4 } } }).isCorrect, false, 'b₂₄ for b₄₂');
});

test('3.1 Q3: the sprinters score 38, 24, 34 and 34 — A·B row by column', () => {
  const question = compiled('l3m-cw-3');
  const product = multiply(cells(question.matrices.A), cells(question.matrices.B));
  assert.deepEqual(product.flat(), [38, 24, 34, 34]);
  assert.equal(grade(question, { defined: 'yes', dimensions: { rows: '4', cols: '1' }, entries: product.map(asText) }).isCorrect, true);
  assert.equal(grade(question, { defined: 'yes', dimensions: { rows: '4', cols: '1' }, entries: [['16'], ['7'], ['9'], ['5']] }).isCorrect, false, 'row sums are not scores');
});

test('3.1 Joey: each product card is sorted by its inner and outer dimensions', () => {
  const question = compiled('l3m-cw-4');
  const raw = LESSON.raw.sections[1].questions.find((candidate) => candidate.questionId === 'l3m-cw-4');
  for (const figure of raw.figures) {
    const [[m, n], [p, q]] = [...figure.text.matchAll(/\((\d) × (\d)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    const expected = n !== p ? 'undefined' : `${['', 'one', 'two', 'three', 'four'][m]}By${['', 'One', 'Two', 'Three', 'Four'][q]}`;
    assert.equal(figure.category, expected, figure.text);
  }
  const [stage] = question.workflow;
  assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { sort: buildFigureMatchResponse(stage, question.grading.sort.match) } }).isCorrect, true);
});

test('3.1 Q8: A (2 × 4) · B (4 × 2) is a defined 2 × 2 product', () => {
  const question = compiled('l3m-pr-1');
  const product = multiply(cells(question.matrices.A), cells(question.matrices.B));
  assert.deepEqual(product, [[8, -23], [16, 17]]);
  assert.equal(grade(question, { defined: 'yes', dimensions: { rows: '2', cols: '2' }, entries: product.map(asText) }).isCorrect, true);
});

test('3.1 Q9: Jackson\'s reciprocals multiply to [7/6, −1/3; 53/6, 7], not I', () => {
  const question = compiled('l3m-cw-5');
  const product = multiply(cells(question.matrices.R), cells(question.matrices.S));
  [[7 / 6, -1 / 3], [53 / 6, 7]].flat().forEach((value, index) => assert.ok(close(product.flat()[index], value)));
  assert.equal(grade(question, { entries: [['7/6', '-1/3'], ['53/6', '7']], inverses: 'no' }).isCorrect, true);
  assert.equal(grade(question, { entries: [['7/6', '-1/3'], ['53/6', '7']], inverses: 'yes' }).isCorrect, false);
});

test('3.1 Q10 and Assignment Q1: which pairs are inverses (their product is I)', () => {
  const identity = (m) => m.every((row, i) => row.every((value, j) => close(value, i === j ? 1 : 0)));
  const cases = [['l3m-cw-6', 'G', 'H', false], ['l3m-pr-2', 'A', 'B', true], ['l3m-pr-3', 'M', 'N', false]];
  for (const [id, left, right, inverses] of cases) {
    const question = compiled(id);
    const product = multiply(cells(question.matrices[left]), cells(question.matrices[right]));
    assert.equal(identity(product), inverses, `${id}: ${left}${right} ${inverses ? 'is' : 'is not'} I`);
    assert.equal(grade(question, { entries: product.map(asText), inverses: inverses ? 'yes' : 'no' }).isCorrect, true, id);
    assert.equal(grade(question, { entries: product.map(asText), inverses: inverses ? 'no' : 'yes' }).isCorrect, false, id);
  }
  assert.deepEqual(multiply(cells(compiled('l3m-cw-6').matrices.G), cells(compiled('l3m-cw-6').matrices.H))[2], [0, -3, -3], 'GH row 3, as printed');
});

/* ------------------------------------------------- Activity 3.2 */

const matrixEquation = (equations) => {
  const rows = equations.map(standardRow);
  return { A: rows.map((row) => asText(row.slice(0, 3))), B: rows.map((row) => asText([row[3]])[0]) };
};

test('3.2 Q1–3: the matrix equations, and Nicky\'s copied rows are refused', () => {
  for (const id of ['l3m-cw-7', 'l3m-cw-8', 'l3m-pr-4']) {
    const question = compiled(id);
    assert.equal(grade(question, matrixEquation(question.equations)).isCorrect, true, id);
  }
  assert.deepEqual(matrixEquation(compiled('l3m-pr-4').equations), { A: [['3', '2', '2'], ['5', '4', '0'], ['-1', '2', '-1']], B: ['4', '0', '12'] }, 'as printed in 2b');
  const nicky = compiled('l3m-cw-8');
  const start = { A: nicky.startFrom.A.map((row) => (Array.isArray(row) ? row : row.cells).map(String)), B: nicky.startFrom.B.map(String) };
  assert.equal(grade(nicky, start).isCorrect, false, 'Nicky\'s own matrix equation is the error to fix');
  assert.deepEqual(matrixEquation(nicky.equations).A, [['2', '-4', '-5'], ['-1', '-5', '3'], ['3', '-5', '-3']]);
});

// Every solve item: the printed answer, Cramer's rule, and the grader agree.
const PRINTED = {
  'l3m-cw-9': [5, 1, -6],
  'l3m-cw-10': 'many',
  'l3m-pr-5': [-4, 8, 5],
  'l3m-pr-6': [3.5, 1.5, -1.5],
  'l3m-pr-7': [59 / 4, 12, 17 / 2],
  'l3m-pr-8': 'none',
  'l3m-pr-10': [15, 35, 30],
  'l3m-pr-11': [18, 32, 32],
  'l3m-dol-2': [2, -1, 3],
  'l3m-dol-3': 'none',
};

test('3.2 Q4–7, Talk the Talk, the Assignment and the DOL: every system solves to its printed answer', () => {
  for (const [id, printed] of Object.entries(PRINTED)) {
    const question = compiled(id);
    const derived = cramer(question.equations);
    const equation = matrixEquation(question.equations);
    if (Array.isArray(printed)) {
      assert.equal(derived.singular, false, `${id} has one solution`);
      derived.solution.forEach((value, index) => assert.ok(close(value, printed[index]), `${id}: ${question.variables?.[index] || 'xyz'[index]} = ${printed[index]}`));
      const values = printed.map((value) => String(value));
      assert.equal(grade(question, { ...equation, classification: 'one', values, inverse: question.askInverse ? [['-2', '1', '-1'], ['10/3', '-4/3', '5/3'], ['5/2', '-1', '1']] : [] }).isCorrect, true, `${id}: the printed answer is accepted`);
      assert.equal(grade(question, { ...equation, classification: 'one', values: [values[1], values[0], values[2]] }).isCorrect, false, `${id}: x and y swapped`);
    } else {
      assert.equal(derived.singular, true, `${id} is singular`);
      // None or many: is the constants column consistent with the dependent rows?
      const pairs = [[0, 2], [1, 2], [0, 1]];
      const dependentPair = pairs.find(([a, b]) => {
        const [p, q] = [derived.rows[a], derived.rows[b]];
        const k = q.slice(0, 3).find((value) => value !== 0) / p.slice(0, 3).find((value) => value !== 0);
        return p.slice(0, 3).every((value, i) => close(value * k, q[i]));
      });
      assert.ok(dependentPair, `${id}: two coefficient rows are proportional`);
      const [a, b] = dependentPair;
      const [p, q] = [derived.rows[a], derived.rows[b]];
      const k = q.slice(0, 3).find((value) => value !== 0) / p.slice(0, 3).find((value) => value !== 0);
      assert.equal(close(p[3] * k, q[3]) ? 'many' : 'none', printed, `${id}: the constants decide`);
      // P2-2: the decision comes with its reason — row b is k times row a, and
      // whether the constants follow — read from the independent arithmetic.
      const reason = { row: String(b + 1), otherRow: String(a + 1), factor: String(k), constant: printed === 'many' ? 'follows' : 'breaks' };
      assert.equal(question.justifySingular, true, `${id} asks for the reason`);
      assert.equal(grade(question, { ...equation, classification: printed, singularReason: reason }).isCorrect, true, `${id}: ${printed}, with its reason`);
      assert.equal(grade(question, { ...equation, classification: printed }).isCorrect, false, `${id}: ${printed} alone is a guess, not a decision`);
      assert.equal(grade(question, { ...equation, classification: printed === 'many' ? 'none' : 'many', singularReason: { ...reason, constant: printed === 'many' ? 'breaks' : 'follows' } }).isCorrect, false, `${id}: the other answer, even with a matching reason`);
    }
  }
});

test('Assignment Q2: A⁻¹ is [−2, 1, −1; 10/3, −4/3, 5/3; 5/2, −1, 1], as printed', () => {
  const question = compiled('l3m-pr-5');
  const A = question.equations.map(standardRow).map((row) => row.slice(0, 3));
  const printedInverse = [[-2, 1, -1], [10 / 3, -4 / 3, 5 / 3], [5 / 2, -1, 1]];
  const product = multiply(A, printedInverse);
  product.forEach((row, i) => row.forEach((value, j) => assert.ok(close(value, i === j ? 1 : 0))));
});

test('Talk the Talk and the theater: the hidden model is the one in the words', () => {
  const baskets = compiled('l3m-pr-10');
  assert.equal(baskets.showEquations, false);
  const [count, money, twice] = baskets.equations.map(standardRow);
  assert.deepEqual(count, [1, 1, 1, 80], '80 baskets');
  assert.deepEqual(money, [15.75, 25, 32.5, 2086.25], 'the three prices and the total');
  assert.deepEqual(twice, [2, 0, -1, 0], 'twice as many large as small');
  assert.deepEqual(Object.values(baskets.variableMeanings), ['small baskets', 'medium baskets', 'large baskets']);
  const theater = compiled('l3m-pr-11');
  assert.deepEqual(theater.equations.map(standardRow), [[1, 1, 1, 82], [0, 1, -1, 0], [3.5, 5, 8.5, 495]]);
});

test('Q6: a third equation for no solution and for infinitely many — the lesson\'s own and others', () => {
  const question = compiled('l3m-pr-9');
  const rows = (none, many) => ({ rows: { none: { coefficients: none.slice(0, 3), constant: none[3] }, many: { coefficients: many.slice(0, 3), constant: many[3] } } });
  assert.equal(grade(question, rows(['10', '-6', '2', '1'], ['10', '-6', '2', '-8'])).isCorrect, true, 'the printed sample answers');
  assert.equal(grade(question, rows(['10', '-6', '2', '-8'], ['10', '-6', '2', '1'])).isCorrect, false, 'swapped');
});

test('the DOL product is computed, not printed', () => {
  const question = compiled('l3m-dol-1');
  const product = multiply(cells(question.matrices.P), cells(question.matrices.Q));
  assert.deepEqual(product, [[2, 7], [2, -5]]);
  assert.equal(grade(question, { defined: 'yes', dimensions: { rows: '2', cols: '2' }, entries: product.map(asText) }).isCorrect, true);
  for (const id of ['l3m-dol-1', 'l3m-dol-2', 'l3m-dol-3']) {
    const prompt = compiled(id).prompt.replace(/\s/g, '');
    assert.doesNotMatch(prompt, /\(2,-1,3\)|x=2|nosolution|[2][7][2]-5/i, `${id} does not print what it grades`);
  }
});

test('on paper: the matrices print with their brackets, a modeling system stays hidden, and the key is derived', () => {
  const printed = (id) => printableQuestionFromResolved(compiled(id));
  const kinds = (id) => printed(id).visuals.map((visual) => visual.kind);
  assert.ok(kinds('l3m-wu-1').includes('matrices'), 'Getting Started prints November + December');
  assert.deepEqual(printed('l3m-wu-1').visuals.find((visual) => visual.kind === 'matrices').items.map((item) => item.name || item.text), ['Nov', '+', 'Dec']);
  assert.ok(kinds('l3m-cw-3').includes('matrices'), 'the sprinter matrices print');
  for (const id of ['l3m-pr-10', 'l3m-pr-11']) assert.deepEqual(printed(id).givens, [], `${id}: writing the system is the task, so it is not printed`);
  assert.equal(printed('l3m-dol-2').givens.length, 3, 'a system the student is given does print');
  for (const question of LESSON.questions.filter((candidate) => candidate.type === 'matrixLab')) {
    assert.ok(answerLinesFromResolvedQuestion(question).length >= 1, `${question.questionId} has answer-key lines`);
  }
  assert.ok(answerLinesFromResolvedQuestion(compiled('l3m-pr-7')).includes('Solution: x = 59/4, y = 12, z = 17/2'));
});

/* ------------------------------------------------------------ Guided Notes */

// The words of a line, as a student reads them: lower case, no markup or punctuation.
const wordsOf = (value) => String(value).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  .toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim().split(/\s+/).filter(Boolean);
// The longest run of words two lines have in common, in the same order.
const longestSharedRun = (a, b) => {
  let best = 0;
  const run = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        run[i][j] = run[i - 1][j - 1] + 1;
        best = Math.max(best, run[i][j]);
      }
    }
  }
  return best;
};
// What the tool's "How to do this" card says, as a student who has it open reads it
// (QuietDisclosure keeps the open or folded choice in storage): the real Matrix Lab.
const openCardLines = async (question) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const tool = registry.getToolDefinition(question.type).component;
  const markup = await withBrowser(() => {
    const { localStorage } = globalThis.window;
    const stored = localStorage.getItem.bind(localStorage);
    localStorage.getItem = (key) => (String(key).startsWith('mm.tool.steps.') ? 'open' : stored(key));
    return render(React.createElement(ToolRuntimeProvider, { submitCost: null }, React.createElement(tool, { questionData: question, onAction() {}, attemptRecord: null })));
  });
  const from = markup.indexOf('How to do this');
  assert.ok(from >= 0, `${question.questionId} has a "How to do this" card`);
  const card = markup.slice(from, markup.indexOf('</ol>', from) + 5);
  return [...card.matchAll(/<(?:li|p)\b[^>]*>([\s\S]*?)<\/(?:li|p)>/g)].map((match) => wordsOf(match[1]));
};

test('a Guided Note says something its tool\'s "How to do this" card does not: none repeats a card line for ten words in a row (CT04 / A2-41)', async () => {
  // CW 3's notes were the card's three steps over again, almost word for word
  // ("A·B is defined only when the number of columns of A equals the number of
  // rows of B": nineteen words in a row), so a student read the same rule twice.
  const noted = LESSON.questions.filter((question) => question.type === 'matrixLab' && question.guidedNotes?.steps?.length);
  assert.ok(noted.length >= 6, `${noted.length} questions carry Guided Notes`);
  for (const question of noted) {
    const card = await openCardLines(question);
    assert.ok(card.length >= 4, `${question.questionId}: the card's lines were read (${card.length})`);
    question.guidedNotes.steps.forEach((note, index) => {
      const said = wordsOf(`${note.title} ${note.instruction}`);
      const shared = Math.max(...card.map((line) => longestSharedRun(said, line)));
      assert.ok(shared < 10, `${question.questionId} note ${index + 1} repeats the card for ${shared} words in a row`);
    });
  }
  // The sprinters' notes now tie the rules to the sprinters, not to the rule's letters.
  const cw3 = compiled('l3m-cw-3');
  assert.ok(cw3.guidedNotes.steps.every((note) => /sprinter|place|finish|score|point/i.test(note.instruction)), 'each CW 3 note is about the sprinters');
});
