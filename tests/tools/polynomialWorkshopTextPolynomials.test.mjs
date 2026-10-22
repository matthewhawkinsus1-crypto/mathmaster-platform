import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import polynomialGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/polynomialWorkshop.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  addSubtractKey,
  areaModelKey,
  polynomialTermsPlainText,
  termPlainText,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * POLYNOMIAL WORKSHOP: POLYNOMIALS WRITTEN AS TEXT (Algebra II Honors,
 * operations on polynomials).
 *
 * The area model was 2 × 2, in x, with the answer typed as a coefficient list.
 * A question written with `leftFactor` / `rightFactor` now draws any size in
 * any letters — −y(4y² + 2y − 3) is 1 × 3, (a² + 3a − 4)(a + 2) is 3 × 2 — and
 * the student types every cell's product as a term and the product in simplest
 * form. `addSubtract` lines like terms up in columns: subtracting, the student
 * writes the opposite of EVERY term of the second polynomial, combines each
 * column, and writes the result. Every step is a graded part, on the browser
 * and the server alike, so the work on the screen is the answer: a final
 * answer typed without it earns only its own share.
 */

const TYPE = 'polynomialWorkshop';

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(polynomialGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path produces a tool response');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  for (const field of ['graded', 'isCorrect', 'isComplete', 'score']) assert.equal(server[field], browser[field], field);
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return server;
};
const wrongIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

const AREA_3X2 = { type: TYPE, mode: 'multiplyArea', leftFactor: 'a^2+3a-4', rightFactor: 'a+2' };
const AREA_1X3 = { type: TYPE, mode: 'multiplyArea', leftFactor: '-y', rightFactor: '4y^2+2y-3' };
const RIGHT_3X2 = { terms: ['a^3', '2a^2', '3a^2', '6a', '-4a', '-8'], product: 'a^3+5a^2+2a-8' };

test('the any-size area model: rows, columns, cells and product come from the factor text', () => {
  const key = areaModelKey(AREA_3X2);
  assert.deepEqual(key.cells.map(termPlainText), ['a³', '2a²', '3a²', '6a', '−4a', '−8']);
  assert.equal(polynomialTermsPlainText(key.product), 'a³ + 5a² + 2a − 8');
  assert.equal(polynomialTermsPlainText(areaModelKey(AREA_1X3).product), '−4y³ − 2y² + 3y');
  // Several letters, ordered x³, x²y, xy², y³.
  assert.equal(polynomialTermsPlainText(areaModelKey({ leftFactor: 'x-y', rightFactor: 'x^2+2xy+y^2' }).product), 'x³ + x²y − xy² − y³');
  assert.equal(resolveToolMode(declaration, AREA_3X2), 'multiplyArea');
});

test('every cell is graded, and the product only in simplest form', () => {
  const right = grade(AREA_3X2, RIGHT_3X2);
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  assert.equal(right.parts.length, 7, 'six cells and the product');

  // One sign slip in one cell is that cell, not the whole model.
  const slip = grade(AREA_3X2, { ...RIGHT_3X2, terms: ['a^3', '2a^2', '3a^2', '6a', '-4a', '8'] });
  assert.deepEqual(wrongIds(slip), ['term-3-2']);

  // An answer typed without the model earns only its own share.
  const finalOnly = grade(AREA_3X2, { terms: [], product: 'a^3+5a^2+2a-8' });
  assert.equal(finalOnly.isComplete, false);
  assert.equal(finalOnly.score, 1 / 7);

  // Like terms not combined is not the product.
  const uncombined = grade(AREA_3X2, { ...RIGHT_3X2, product: 'a^3+2a^2+3a^2+6a-4a-8' });
  assert.deepEqual(wrongIds(uncombined), ['product']);

  // A cell is ONE term: the product written as a product is work left to do.
  const unmultiplied = grade(AREA_1X3, { terms: ['-y\\cdot4y^2', '-2y^2', '3y'], product: '-4y^3-2y^2+3y' });
  assert.deepEqual(wrongIds(unmultiplied), ['term-1-1']);
  assert.equal(grade(AREA_1X3, { terms: ['-4y^3', '-2y^2', '3y'], product: '3y-2y^2-4y^3' }).isCorrect, true, 'term order is free');
});

test('the binomial area model is untouched: same work, same verdict', () => {
  const legacy = { type: TYPE, mode: 'multiplyArea', leftBinomial: [2, 3], rightBinomial: [1, -4] };
  const result = grade(legacy, { cells: ['2', '-8', '3', '-12'], expanded: '2, -5, -12' });
  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.parts.map((part) => part.id), ['cell-1', 'cell-2', 'cell-3', 'cell-4', 'expanded']);
  // Factor text is what switches the model; binomial work is never read as terms.
  assert.equal(grade(legacy, { terms: ['2x^2', '-8x', '3x', '-12'], product: '2x^2-5x-12' }).isCorrect, false);
});

const SUBTRACT = { type: TYPE, mode: 'addSubtract', operation: 'subtract', firstPolynomial: '2a^3+5a-7', secondPolynomial: 'a^3-3a+2' };

test('subtracting: the opposite of every term, each column, then the result', () => {
  const key = addSubtractKey(SUBTRACT);
  assert.deepEqual(key.added.map(termPlainText), ['−a³', '3a', '−2']);
  const right = grade(SUBTRACT, { opposites: ['-a^3', '3a', '-2'], sums: ['a^3', '8a', '-9'], result: 'a^3+8a-9' });
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.map((part) => part.id), ['opposite-1', 'opposite-2', 'opposite-3', 'sum-1', 'sum-2', 'sum-3', 'result']);

  // The textbook's error: "subtracted only the first term". It shows exactly
  // where it happened.
  const firstOnly = grade(SUBTRACT, { opposites: ['-a^3', '-3a', '2'], sums: ['a^3', '2a', '-5'], result: 'a^3+2a-5' });
  assert.deepEqual(wrongIds(firstOnly), ['opposite-2', 'opposite-3', 'sum-2', 'sum-3', 'result']);
});

test('a missing term asks nothing to subtract; a column that cancels is a typed 0', () => {
  // (7b² + 6b − 7) − (4b² − 2): the second polynomial has no b term.
  const missing = { type: TYPE, mode: 'addSubtract', operation: 'subtract', firstPolynomial: '7b^2+6b-7', secondPolynomial: '4b^2-2' };
  const right = grade(missing, { opposites: ['-4b^2', '', '2'], sums: ['3b^2', '6b', '-5'], result: '3b^2+6b-5' });
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.filter((part) => part.id.startsWith('opposite')).map((part) => part.id), ['opposite-1', 'opposite-3'], 'no free part for the empty column');

  // (2 + 40t − 16t²) − (2 + 35t − 16t²) = 5t: two columns cancel.
  const heights = { type: TYPE, mode: 'addSubtract', operation: 'subtract', firstPolynomial: '2+40t-16t^2', secondPolynomial: '2+35t-16t^2' };
  const cancels = { opposites: ['16t^2', '-35t', '-2'], sums: ['0', '5t', '0'], result: '5t' };
  assert.equal(grade(heights, cancels).isCorrect, true);
  const blank = grade(heights, { ...cancels, sums: ['', '5t', ''] });
  assert.equal(blank.isComplete, false, 'cancelling is a step the student shows');
  assert.equal(blank.isCorrect, false);
});

test('adding lines the second polynomial up as written: no opposites to type', () => {
  const add = { type: TYPE, mode: 'addSubtract', operation: 'add', firstPolynomial: '4x^2-9x+3', secondPolynomial: '-2x^2-5x-6' };
  const right = grade(add, { sums: ['2x^2', '-14x', '-3'], result: '2x^2-14x-3' });
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.map((part) => part.id), ['sum-1', 'sum-2', 'sum-3', 'result']);
  // Several letters: (3a + 4b) + (6a − 6b).
  assert.equal(grade({ type: TYPE, mode: 'addSubtract', operation: 'add', firstPolynomial: '3a+4b', secondPolynomial: '6a-6b' }, { sums: ['9a', '-2b'], result: '9a-2b' }).isCorrect, true);
});

test('a question the workshop cannot draw is not graded against the student', () => {
  for (const question of [
    { type: TYPE, mode: 'multiplyArea', leftFactor: '2x+3x', rightFactor: 'x' },
    { type: TYPE, mode: 'multiplyArea', leftFactor: 'x+1' },
    { type: TYPE, mode: 'addSubtract', operation: 'times', firstPolynomial: 'x', secondPolynomial: 'x' },
    { type: TYPE, mode: 'addSubtract', operation: 'add', firstPolynomial: 'x' },
  ]) {
    const result = polynomialGrader.grade(question, {});
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(validateToolQuestion(question).isValid, false, `Pre-Flight refuses ${JSON.stringify(question)}`);
  }
});

test('Pre-Flight accepts the new shapes', () => {
  const errors = (question) => validateToolQuestion(question).errors;
  assert.deepEqual(errors({ type: TYPE, toolId: TYPE, mode: 'multiplyArea', leftFactor: '-y', rightFactor: '4y^2+2y-3' }), []);
  assert.deepEqual(errors({ type: TYPE, toolId: TYPE, mode: 'addSubtract', operation: 'subtract', firstPolynomial: '2a^3+5a-7', secondPolynomial: 'a^3-3a+2' }), []);
  assert.deepEqual(errors({ type: TYPE, toolId: TYPE, mode: 'multiplyArea', leftBinomial: [2, 3], rightBinomial: [1, -4] }), []);
});

test('a V5 lesson compiles the new shapes with their fields, and invents none', () => {
  const doc = {
    schemaVersion: 5,
    assignment: { title: 'Operations on polynomials', courseId: 'algebra2', folder: 'Algebra II', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: [
      { questionId: 'area', standard: 'A2.7B', studentActions: ['multiplyPolynomials'], dok: 2, difficultyBand: 2, prompt: 'Find (a² + 3a − 4)(a + 2).', polynomial: { leftFactor: 'a^2+3a-4', rightFactor: 'a+2' } },
      { questionId: 'subtract', standard: 'A2.7B', studentActions: ['subtractPolynomials'], dok: 2, difficultyBand: 2, prompt: 'Simplify.', polynomial: { operation: 'subtract', firstPolynomial: '2a^3+5a-7', secondPolynomial: 'a^3-3a+2' } },
      { questionId: 'binomials', standard: 'A2.7B', studentActions: ['multiplyPolynomials'], dok: 2, difficultyBand: 2, prompt: 'Find (2x + 3)(x − 4).', polynomial: { leftBinomial: [2, 3], rightBinomial: [1, -4] } },
    ] }],
  };
  const compiled = compileTeacherImport(JSON.stringify(doc));
  const [area, subtract, binomials] = compiled.questions;
  assert.equal(area.type, TYPE);
  assert.equal(area.mode, 'multiplyArea');
  assert.equal(area.leftFactor, 'a^2+3a-4');
  assert.equal(area.rightFactor, 'a+2');
  assert.equal(subtract.mode, 'addSubtract');
  assert.deepEqual([subtract.operation, subtract.firstPolynomial, subtract.secondPolynomial], ['subtract', '2a^3+5a-7', 'a^3-3a+2']);
  for (const field of ['leftFactor', 'rightFactor', 'operation', 'firstPolynomial', 'secondPolynomial']) {
    assert.equal(Object.prototype.hasOwnProperty.call(binomials, field), false, `${field} is not invented`);
  }
});

test('the screen routes factor text to the any-size model, ahead of the binomial one', () => {
  const code = executableSource(fs.readFileSync('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', 'utf8'));
  const router = region(code, 'export default function PolynomialWorkshop', '\nfunction ', 'router');
  const anySize = router.indexOf("if (mode === 'multiplyArea' && writesFactors(questionData)) return <MultiplyFactors ");
  const binomial = router.indexOf("if (mode === 'multiplyArea') return <MultiplyArea ");
  assert.ok(anySize >= 0, 'the any-size model is routed');
  assert.ok(binomial > anySize, 'before the binomial model, which would draw the default problem');
  assert.match(router, /if \(mode === 'addSubtract'\) return <AddSubtract /);
  // The work a view reports is the work the grader reads.
  assert.match(region(code, 'function MultiplyFactors(', '\n}', 'MultiplyFactors'), /const work=\{terms,product\};/);
  assert.match(region(code, 'function AddSubtract(', '\n}', 'AddSubtract'), /const work=\{opposites,sums,result:answer\};/);
});
