/*
 * ALGEBRA I · MODULE 3 · TOPIC 1 — LESSONS 1 AND 3, REGULAR AND HONORS,
 * CHECKED THE WAY A STUDENT MEETS THEM (walkthrough 2026-11-06,
 * docs/qa/2026-11-06-a1-m3-t1-walkthrough/walkthrough.md).
 *
 * Every number here is worked out again from what the student reads — the
 * expression and the value in a box's label, the statements of a worked
 * solution — and never read back from the key, so a key that disagrees with
 * its own question fails here even when the grader accepts the key.
 *
 *   W1  L1 CW 5 keyed the check "the value of 24x + 7 when x = −1/4" as −1.
 *       It is 24(−1/4) + 7 = 1, as the item's own worked steps say: a student
 *       who checked correctly was marked wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, create } from 'mathjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module3');
const FILES = {
  'T1 L1': 'T1_L1_Solving_Linear_Equations.json',
  'T1 L1 Honors': 'T1_L1_Solving_Linear_Equations_Honors.json',
  'T1 L3': 'T1_L3_Modeling_and_Solving_Linear_Inequalities.json',
  'T1 L3 Honors': 'T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json',
};
const RAW = Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, fs.readFileSync(path.join(DIR, name), 'utf8')]));
const LESSONS = Object.fromEntries(Object.entries(RAW).map(([key, text]) => [key, JSON.parse(text)]));
const authoredQuestions = (key) => LESSONS[key].sections.flatMap((section) => section.questions);

const exact = create(all, { number: 'Fraction' });
// The lessons write mathematics as a student reads it: a true minus sign,
// a superscript square, implicit products such as 24x and (1/2)x.
const asMath = (text) => String(text).replace(/−/g, '-').replace(/²/g, '^2').replace(/·/g, '*').trim();
const valueAt = (expression, variable, value) => exact.fraction(exact.evaluate(asMath(expression), { [variable]: exact.fraction(exact.evaluate(asMath(value))) }));
const keyValue = (answer) => exact.fraction(exact.evaluate(asMath(answer)));
const shown = (fraction) => (Number(fraction.d) === 1 ? `${fraction.s < 0 ? '-' : ''}${fraction.n}` : `${fraction.s < 0 ? '-' : ''}${fraction.n}/${fraction.d}`);

/*
 * The boxes that ask for the value of an expression at a stated value:
 *   "Value of −2x + 28 when x = 2", "Check: the value of 24x + 7 when x = −1/4",
 *   "Check x = −1: the value of 4(3x + 2) — and of 8x + 4 — when x = −1",
 *   "Check x = 0: the value of 5x + 2", "Test x = −6 in the original inequality: the value of −3x + 4".
 */
const valueBoxes = (key) => authoredQuestions(key).flatMap((question) => (question.responses || []).flatMap((field) => {
  const label = String(field.label || '');
  // The value is a number as written (2, −1/4, 4.5); an intercept's "(the value
  // of h when m = 0)" is read from the function instead, and is not one of these.
  const when = /value of (.+?) when ([a-z]) = ([−-]?\d+(?:\.\d+)?(?:\/\d+)?)$/i.exec(label);
  const named = /^(?:Check|Test) ([a-z]) = ([−-]?\d+(?:\.\d+)?(?:\/\d+)?)(?: in the original inequality)?: the value of (.+)$/i.exec(label);
  if (when) {
    const expressions = when[1].split(/\s*—\s*(?:and of\s*)?/).map((part) => part.trim()).filter(Boolean);
    return [{ question: question.questionId, field, expressions, variable: when[2], value: when[3] }];
  }
  if (named) return [{ question: question.questionId, field, expressions: [named[3]], variable: named[1], value: named[2] }];
  return [];
}));

test('T1 L1 and L3, regular and Honors: every "value of … when x = …" box is keyed with the value its expression takes there', () => {
  const boxes = Object.keys(FILES).flatMap((key) => valueBoxes(key).map((box) => ({ key, ...box })));
  // The reader must find the lessons' check boxes, or this test passes by finding none.
  assert.ok(boxes.length >= 24, `${boxes.length} check boxes found`);
  boxes.forEach(({ key, question, field, expressions, variable, value }) => {
    expressions.forEach((expression) => {
      const worked = valueAt(expression, variable, value);
      assert.equal(shown(keyValue(field.answer)), shown(worked), `${key} ${question}.${field.id}: ${expression} at ${variable} = ${value} is ${shown(worked)}, keyed ${field.answer}`);
    });
  });
});

test('T1 L1 CW 5: the check takes 24(−1/4) + 7 = 1, the value the worked steps reach, and refuses −1, in the browser and on the server', () => {
  const question = compileTeacherImport(RAW['T1 L1']).questions.find((candidate) => candidate.questionId === 'm3l1-cw-5');
  assert.ok(question, 'm3l1-cw-5 survives the import');
  const right = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  const verdict = (answers) => {
    const browser = gradeMultiAnswerResponse(question, answers).isCorrect;
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } }).isCorrect;
    assert.equal(server, browser, 'browser and server agree');
    return browser;
  };
  assert.equal(shown(valueAt('24x + 7', 'x', '−1/4')), '1');
  assert.equal(verdict({ ...right, check: '1' }), true, '24(−1/4) + 7 = −6 + 7 = 1');
  assert.equal(verdict({ ...right, check: '−1' }), false, '−1 is not the value of 24x + 7 at x = −1/4');
});
