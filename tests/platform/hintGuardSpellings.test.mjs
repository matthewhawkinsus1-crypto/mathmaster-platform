/*
 * FB03: THE HINT GUARD READS THE SAME NUMBER IN ANOTHER SPELLING.
 *
 * The guard that hides a hint stating an answer read text: "The answer is 0.5."
 * for the answer 1/2, "The slope is 4 / 3." for 4/3, "\frac{4}{3}", and
 * "x = 6/3" for 2 all passed it (B-18, C2-29). A NUMBER answer is now also read
 * by value against every decimal, fraction and LaTeX fraction the hint writes —
 * and only when the hint states it: a number the problem shows quoted whole, a
 * spelling the problem already shows, a different number, a numerator over a
 * variable and a thousands comma are not statements of the answer.
 *
 * Over every lesson (39 files, three draws each) and every Path bank document
 * (10,773 as three draws), this hid two more teacher hints and no other: the
 * l3-pr-4 pair that wrote the slope 1/2 as 3/6 (reworded in the lesson). No
 * question-family hint was hidden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hintAnswerLeak, statedAnswers } from '../../src/platform/supports/hints/hintLeakGuard.js';
import { buildQuestionHints, questionAnswerValues, questionDisplayText, questionHintAudit, questionVisibleText } from '../../src/platform/supports/hints/questionHints.js';
import { auditAssignmentHiddenHints } from '../../src/platform/preflight/hintAnswerPreflight.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const stated = (hint, answer, visibleText = '') => statedAnswers(hint, { answers: [answer], visibleText });

test('a number written another way is stated: decimal for fraction, fraction for decimal, spaced, LaTeX, unreduced', () => {
  [
    // [hint, answer]
    ['The answer is 0.5.', '1/2'],
    ['It is .5 of the total.', '1/2'],
    ['The answer is 0.50.', '1/2'],
    ['The answer is 1/2.', '0.5'],
    ['The slope is −0.75.', '-3/4'],
    ['The slope is -3/4.', '-0.75'],
    ['The answer is 1.5', '3/2'],
    ['The answer is 3/2', '1.5'],
    ['The slope is 4 / 3.', '4/3'],
    ['The answer is \\frac{4}{3}.', '4/3'],
    ['The answer is $\\dfrac{1}{2}$.', '0.5'],
    ['It is -\\frac{3}{4}.', '-3/4'],
    ['It is \\frac{-3}{4}.', '-0.75'],
    ['The slope is 12/8.', '3/2'],
    ['Then x = 6/3.', '2'],
    ['Then x = 6 / 3.', '2'],
    ['The answer is 2.0.', '2'],
    ['The answer is 2.00.', '2'],
    ['Multiply by 0.25.', '1/4'],
    // An answer spelled as a decimal or a fraction is the whole number the hint writes.
    ['The answer is 2.', '2.0'],
    ['Then x = 3.', '6/2'],
    ['Then x = −4.', '-8/2'],
    // A number answer stored in LaTeX is read the same way.
    ['The slope is 3/4.', '\\frac{3}{4}'],
    ['The slope is 0.75.', '\\frac{3}{4}'],
  ].forEach(([hint, answer]) => assert.deepEqual(stated(hint, answer), [answer], `${hint} | ${answer}`));
});

test('a hint that writes a different number, or only quotes the problem, is not one that states the answer', () => {
  [
    // [hint, answer, what the student already reads]
    ['Add 12 to both sides.', '2', ''],
    ['Use 2.5 here.', '2', ''],
    ['It is 1/3.', '1/2', ''],
    ['It is 0.25.', '1/2', ''],
    ['Start at −0.5 on the axis.', '1/2', ''],
    ['The answer is 0.5.', '-1/2', ''],
    ['The answer is -0.5.', '1/2', ''],
    // A plain whole number is read as text only: nothing hides in a comma.
    ['The total is 1,000.5 km.', '0.5', ''],
    ['The total is 1,000.5 km.', '1/2', ''],
    ['The total is 1,000 km.', '0', ''],
    ['Add 2,000 to it.', '2.0', ''],
    ['Use 02 here.', '2.0', ''],
    ['Add 12 to both sides.', '6/3', ''],
    ['Start at −2 on the axis.', '4/2', ''],
    // A decimal glued to a letter is a name or a subscript, not a number.
    ['Compare v0.50 and v0.75.', '1/2', ''],
    // A numerator over a variable is not a number.
    ['Divide by 0.5/n.', '1/2', ''],
    // Quoted whole from the problem, in another spelling: g(x) = 0.5x − 8 shows 0.5.
    ['Solve 0 = 0.5x − 8.', '1/2', 'g(x) = 0.5x − 8'],
    ['Look at the point (0.5, 3).', '1/2', 'Plot (0.5, 3) and (2, 3).'],
    // The problem already shows this number as it writes it: the hint repeats the question.
    ['Write 0.5 as a fraction.', '1/2', 'Write 0.5 as a fraction.'],
    ['Think of 0.50 as the same decimal.', '1/2', 'Write 0.5 as a fraction.'],
    // The given fraction equals the answer in a "simplify" question and is not it,
    // plain or in LaTeX (the fractions family writes $\frac{2}{6}$ for "2/6").
    ['Divide the top and the bottom of $\\frac{2}{6}$ by the same number.', '1/3', 'Simplify 2/6.'],
    ['Divide the top and the bottom of 2 / 6 by the same number.', '1/3', 'Simplify $\\frac{2}{6}$.'],
    ['Think of 1/2 cup as a decimal.', '0.5', 'A recipe uses 1/2 cup of milk. Write 1/2 as a decimal.'],
  ].forEach(([hint, answer, visibleText]) => assert.deepEqual(stated(hint, answer, visibleText), [], `${hint} | ${answer}`));
  // …but a spelling the problem does not show is the answer.
  assert.deepEqual(stated('Think of 0.5 as 5/10.', '1/2', 'Write 0.5 as a fraction.'), ['1/2'], '5/10 is 1/2');
  assert.deepEqual(stated('Two sixths is $\\frac{4}{12}$ in twelfths.', '1/3', 'Simplify 2/6.'), ['1/3'], 'a form the problem does not show is the answer in another spelling');
  assert.deepEqual(stated('The answer is $\\frac{1}{3}$.', '1/3', 'Simplify 2/6.'), ['1/3']);
  assert.deepEqual(stated('Solve 0 = 0.5x − 9.', '1/2', 'g(x) = 0.5x − 8'), ['1/2'], 'an expression the problem does not show is not a quotation');
  assert.deepEqual(stated('Start at -0.5.', '-1/2', 'The slope is 0.5.'), ['-1/2'], 'a sign the problem does not show is new');
});

test('what the problem displays counts as shown: the given of a simplify question is not its answer', () => {
  const question = {
    activityRole: 'practice',
    prompt: 'Simplify.',
    expressionLatex: '\\frac{6}{8} =',
    answerFields: [{ id: 'a', label: 'Result', answer: '3/4' }],
    hints: [
      'Divide the top and the bottom of $\\frac{6}{8}$ by the same number.',
      'Three quarters is the same as $\\frac{9}{12}$.',
    ],
  };
  // The given is displayed, not in the prompt: it is read from what the problem shows.
  const options = { answers: ['3/4'], visibleText: questionVisibleText(question) };
  assert.deepEqual(statedAnswers(question.hints[0], options), ['3/4'], 'by the prompt alone, the given fraction would read as the answer');
  assert.deepEqual(statedAnswers(question.hints[0], { ...options, displayText: questionDisplayText(question) }), []);
  const audit = questionHintAudit(question).filter((hint) => hint.source === 'authored');
  assert.deepEqual(audit.map((hint) => hint.shown), [true, false], 'the given is shown; 9/12 is the answer written another way');
  assert.match(audit[1].reason, /^it names “3\/4” \(written “\\frac\{9\}\{12\}”\)/);
  // What counts as displayed, and what never does.
  const text = questionDisplayText({
    prompt: 'Solve the system.',
    equations: ['y = 0.5x + 1', '2x - y = 3'],
    inequalityText: '6x + 2 < -34',
    table: { columns: ['x', 'y'], rows: [{ x: 1, y: '' }, { x: 2, y: 5 }], answers: { 'r0.y': '0.75' } },
    n1: 3, d1: 4,
    answerFields: [{ id: 'a', label: 'Result', answer: '0.123' }],
    hints: ['hint 0.456'],
    choices: ['0.789'],
    solutionReview: { headline: 'review 0.321' },
  });
  ['Solve the system.', 'y = 0.5x + 1', '2x - y = 3', '6x + 2 < -34', '3/4'].forEach((shown) => assert.ok(text.includes(shown), shown));
  ['0.123', '0.456', '0.789', '0.321', '0.75'].forEach((private_) => assert.ok(!text.includes(private_), `${private_} is not shown`));
});

test('the shared text guard is untouched, so Path\'s own quality gate reads what it always read', async () => {
  const { hintRevealsAnswer } = await import('../../functions/shared/pathSolutionSupport.mjs');
  assert.equal(hintRevealsAnswer('The answer is 0.5.', ['1/2']), false);
  assert.equal(hintRevealsAnswer('The slope is 4 / 3.', ['4/3']), false);
  assert.equal(hintRevealsAnswer('The answer is 1/2.', ['1/2']), true);
});

test('the reason says how the number was written, so the author can find it', () => {
  const other = hintAnswerLeak('The answer is 0.5.', { answers: ['1/2'], visibleText: '' });
  assert.deepEqual(other.values, ['1/2']);
  assert.equal(other.reason, 'it names “1/2” (written “0.5”), which is an answer to this question or part of one');
  const slope = hintAnswerLeak('The slope is −0.75.', { answers: ['-3/4'], visibleText: '' });
  assert.equal(slope.reason, 'it names “−3/4” (written “−0.75”), which is an answer to this question or part of one');
  // Written as the answer is: the reason is the one it always was.
  assert.equal(hintAnswerLeak('The slope is 3.', { answers: ['3'], visibleText: '' }).reason, 'it names “3”, which is an answer to this question or part of one');
  assert.equal(hintAnswerLeak('Add 12 to both sides.', { answers: ['2'], visibleText: '' }), null);
  // Two values, one written another way.
  const both = hintAnswerLeak('The slope is 0.5 and the intercept is 7.', { answers: ['1/2', '7'], visibleText: '' });
  assert.equal(both.reason, 'it names “1/2” (written “0.5”), “7”, which are answers to this question or parts of them');
});

test('the ladder drops such a hint, shows the next, and Pre-Flight lists it', () => {
  const question = {
    activityRole: 'practice',
    prompt: 'What fraction of the pizza is one slice of two equal slices?',
    answerFields: [{ id: 'a', label: 'Fraction', answer: '1/2' }],
    hints: ['The answer is 0.5.', 'Split the whole into equal parts and count the parts you have.'],
  };
  const audit = questionHintAudit(question).filter((hint) => hint.source === 'authored');
  assert.deepEqual(audit.map((hint) => hint.shown), [false, true]);
  assert.equal(audit[0].reason, 'it names “1/2” (written “0.5”), which is an answer to this question or part of one');
  assert.deepEqual(buildQuestionHints(question).filter((hint) => hint.source === 'authored').map((hint) => hint.text), ['Split the whole into equal parts and count the parts you have.']);
  const [warning] = auditAssignmentHiddenHints([question]).warnings;
  assert.match(warning, /^Question 1, hint 1 \(“The answer is 0\.5\.”\) is never shown to students: it names “1\/2” \(written “0\.5”\), which is an answer to this question or part of one\./);
  // A DOL offers no hints, so nothing is listed there.
  assert.deepEqual(auditAssignmentHiddenHints([{ ...question, activityRole: 'dol' }]).warnings, []);
  // The answers the guard reads are the question's own.
  assert.ok(questionAnswerValues(question).includes('1/2'));
  assert.equal(questionVisibleText(question).includes('pizza'), true);
});

test('the one real lesson hint it hides is reworded, and the rest of that item\'s ladder is intact', () => {
  const lesson = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url), 'utf8'));
  const authored = lesson.sections.flatMap((section) => section.questions).find((question) => question.questionId === 'l3-pr-4');
  // As the lesson was before: the slope through the points written as 3/6.
  const before = { ...authored, hints: ['Slope through (−6, 1) and (0, 4) is 3/6.', 'Simplify 3/6 first. Then flip the fraction and change the sign.', authored.hints[2]] };
  const compile = (question) => compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'FB03', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [question] }],
  }).package.sections[0].questions[0];
  const shownOf = (question) => buildQuestionHints(compile(question)).filter((hint) => hint.source === 'authored').map((hint) => hint.text);
  assert.deepEqual(shownOf(before), [authored.hints[2]], 'the first two state the slope: 3/6 is 1/2');
  assert.deepEqual(shownOf(authored), authored.hints, 'the lesson as it is now shows all three');
  assert.doesNotMatch(authored.hints.join(' '), /3\/6/);
});
