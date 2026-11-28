/*
 * A TYPED ², · OR × IN A BOX GRADED BY equivalentExpression OR
 * simplestRadicalForm (the real-item grading audit, 2026-11-28).
 *
 * The math editor writes x^{2}, 2\cdot x and 2\times x; a student typing into
 * a plain-text box or a phone keyboard can type the characters themselves.
 * Every reader of the mathematics reads them as the editor writes them
 * (answerEquivalence.mjs typedAsEditorSpelling, GR35c), but these two grading
 * modes did not: on real lesson items `2·x+3` was marked wrong for 2x+3,
 * `x²-64` for x^2-64 and `2·|x|y^2` for 2|x|y^2, on the screen and on the
 * server alike, while the editor's spelling of the same answer was right.
 *
 * A wrong answer stays wrong in any spelling, and a form the mode refuses is
 * still refused: the change is to the characters read, not the form.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import '../../functions/shared/formSpecificFieldGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse, normalizeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const field = (gradingMode, answer) => ({ id: 'answer', answer, gradingMode, inputProfile: 'expression', answerFormat: 'expression' });
const marks = (gradingMode, answer, typed) => matchesFieldAnswer(typed, field(gradingMode, answer));

test('equivalentExpression reads a typed ², · and × as the editor writes them', () => {
  for (const typed of ['2·x+3', '2×x+3', '2⋅x+3', '2\\cdot x+3', '3+2·x']) assert.equal(marks('equivalentExpression', '2x+3', typed), true, typed);
  for (const typed of ['x²-64', 'x²−64', 'x^{2}-64']) assert.equal(marks('equivalentExpression', 'x^2-64', typed), true, typed);
  assert.equal(marks('equivalentExpression', 'n^2-2n-63', 'n²−2·n−63'), true);
});

test('equivalentExpression: a wrong answer typed with those characters is still wrong', () => {
  for (const typed of ['2·x+4', '2×x-3', '3·x+3', '-2·x+3']) assert.equal(marks('equivalentExpression', '2x+3', typed), false, typed);
  for (const typed of ['x³-64', 'x²+64', 'x²-8']) assert.equal(marks('equivalentExpression', 'x^2-64', typed), false, typed);
});

test('simplestRadicalForm reads a typed · and × as the editor writes them, and still asks for the form', () => {
  for (const typed of ['2·|x|y^2', '2×|x|y^2', '2|x|y²', '2\\cdot|x|y^{2}']) assert.equal(marks('simplestRadicalForm', '2|x|y^2', typed), true, typed);
  for (const typed of ['2·|x|y^3', '3·|x|y^2', '2·x·y^2']) assert.equal(marks('simplestRadicalForm', '2|x|y^2', typed), false, typed);
  // Not simplified, in any characters.
  for (const typed of ['√98', '1·√98', '7·√2·1·1+0']) assert.equal(marks('simplestRadicalForm', '7√2', typed), false, typed);
  assert.equal(marks('simplestRadicalForm', '7√2', '7·√2'), true);
});

test('the screen and the server give a typed · the same verdict', () => {
  const question = { questionId: 'typed-dot', type: 'multiAnswer', prompt: 'Simplify.', answerFields: [field('equivalentExpression', '2x+3')] };
  for (const [typed, right] of [['2·x+3', true], ['2·x+4', false]]) {
    const screen = gradeMultiAnswerResponse(question, { answer: typed });
    const response = JSON.parse(JSON.stringify(normalizeOrdinaryResponse({ question, answerState: { parts: screen.parts } })));
    const server = gradeServerResponse({ question, response });
    assert.equal(screen.isCorrect, right, `screen, ${typed}`);
    assert.equal(server.graded, true);
    assert.equal(server.isCorrect, right, `server, ${typed}`);
  }
});
