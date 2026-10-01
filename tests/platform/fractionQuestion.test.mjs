/*
 * A FRACTION QUESTION GRADES THE ANSWER ITS AUTHOR WROTE.
 *
 * The defect: generation drew a random "a/b + c/d" for EVERY `fraction`
 * question and wrote it over n1/d1/n2/d2/ansNum/ansDen, even when the author
 * had written the question's own answer. V5 `studentActions:
 * ['fractionAnswer']` with `answer: '3/4'` compiles to exactly such a
 * question, and Create accepted it — so the student read the authored prompt
 * beside a random sum, and was graded on the random sum. The authored 3/4
 * could never be correct.
 *
 * What replaced it (functions/shared/fractionAnswer.mjs):
 *
 *   - three shapes: `operands` (the author's sum), `authored-answer`, `drill`;
 *   - only a drill draws, and it draws exactly the numbers it always drew, so
 *     a student part-way through an assignment keeps theirs;
 *   - an authored answer is graded against itself — in lowest terms when the
 *     author's own answer is (the type's catalog promise), and in any listed
 *     form;
 *   - the screen, the solution review, Create's validation, "New Question"
 *     and the support record all read the same shapes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FRACTION_QUESTION_SHAPES,
  fractionAnswerCandidates,
  fractionQuestionShape,
  isWrittenInLowestTerms,
  parseWrittenNumber,
  sameWrittenNumber,
} from '../../functions/shared/fractionAnswer.mjs';
import { compareMathAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeFractionResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { describeQuestionVariability, VARIABILITY } from '../../functions/shared/questionVariability.mjs';
import { generateQuestion, isPersonalizedBlueprint } from '../../src/problemGenerator.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { modificationsAppliedToQuestion } from '../../src/studentSupport.js';
import { fractionQuestionDisplay, fractionSolutionRepresentations } from '../../src/fractionQuestionDisplay.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const RANDOM_FIELDS = ['n1', 'd1', 'n2', 'd2', 'ansNum', 'ansDen'];
const KEY = 'asg-1|student-a|0|variant:0';
const KEYS = [
  'asg-1|student-a|0|variant:0',
  'asg-1|student-a|0|variant:1',
  'asg-1|student-b|0|variant:0',
  'asg-1|student-c|4|variant:0',
  'asg-2|shared|2|variant:0',
  'preview|teacher|7|variant:3',
  'demo-key',
];
const correct = (question, response) => gradeFractionResponse(question, response).isCorrect;

/* ---------------------------------------------------------------------------
 * Reading a written number.
 * ------------------------------------------------------------------------- */

test('parseWrittenNumber reads every spelling of one signed number', () => {
  // [written, value n/d, form, numerator as written, denominator as written]
  const rows = [
    ['3/4', [3, 4], 'fraction', 3, 4],
    ['-3/4', [-3, 4], 'fraction', -3, 4],
    ['(-3)/4', [-3, 4], 'fraction', -3, 4],
    [' 3 / 4 ', [3, 4], 'fraction', 3, 4],
    ['\\frac{3}{4}', [3, 4], 'fraction', 3, 4],
    ['\\dfrac{3}{4}', [3, 4], 'fraction', 3, 4],
    ['\\tfrac{3}{4}', [3, 4], 'fraction', 3, 4],
    ['\\frac34', [3, 4], 'fraction', 3, 4], // how MathLive writes single digits
    ['-\\frac{3}{4}', [-3, 4], 'fraction', -3, 4],
    ['\\frac{-3}{4}', [-3, 4], 'fraction', -3, 4],
    ['\\left(-3\\right)/4', [-3, 4], 'fraction', -3, 4],
    ['\\left(\\frac{3}{4}\\right)', [3, 4], 'fraction', 3, 4],
    ['−3/4', [-3, 4], 'fraction', -3, 4], // typographic minus
    ['6/8', [3, 4], 'fraction', 6, 8], // the value reduces; the written form does not
    ['3/-4', [-3, 4], 'fraction', 3, -4],
    ['3', [3, 1], 'integer', 3, 1],
    ['-3', [-3, 1], 'integer', -3, 1],
    ['0.75', [3, 4], 'decimal', 75, 100],
    ['-0.75', [-3, 4], 'decimal', -75, 100],
  ];
  for (const [written, [n, d], form, numerator, denominator] of rows) {
    const parsed = parseWrittenNumber(written);
    assert.ok(parsed, `${JSON.stringify(written)} must be read`);
    assert.deepEqual(
      { value: parsed.value, form: parsed.form, numerator: parsed.numerator, denominator: parsed.denominator },
      { value: { n, d }, form, numerator, denominator },
      JSON.stringify(written),
    );
  }
});

test('parseWrittenNumber refuses anything that is not exactly one number', () => {
  const refused = [
    '', '   ', 'x', '3x/4', '3+4', '3*4', '3/4/5', '3/0', '\\frac{3}{0}', '0/0',
    '1 2/3', // a mixed number is not read as 12/3
    '3.0/4', '3/4.0', '{3/4}', '\\frac{3}{4}x', '--3/4', '-(-3)/4', '\\frac345', '3÷4', '3:4',
    '\\sqrt{4}', 'three quarters', null, undefined, ['3/4'], {},
  ];
  for (const written of refused) {
    assert.equal(parseWrittenNumber(written), null, `${JSON.stringify(written)} must not be read as a number`);
  }
});

test('lowest terms: integers and reduced fractions with the sign in front or on top', () => {
  const rows = [
    ['3/4', true], ['-3/4', true], ['(-3)/4', true], ['\\frac34', true], ['\\frac{-3}{4}', true],
    ['-\\frac{3}{4}', true], ['3', true], ['-3', true], ['0', true], ['1/2', true],
    ['6/8', false], // reducible
    ['4/1', false], // a whole number over one
    ['3/-4', false], // the sign belongs in front or on the numerator
    ['0/5', false],
    ['0.75', false], ['-0.75', false], // a decimal is not a fraction
    ['x', false], ['', false],
  ];
  for (const [written, expected] of rows) {
    assert.equal(isWrittenInLowestTerms(written), expected, JSON.stringify(written));
  }
});

test('the same written number, whatever the editor spelled it', () => {
  assert.equal(sameWrittenNumber('6/8', '\\frac{6}{8}'), true);
  assert.equal(sameWrittenNumber('6/8', '\\frac68'), true);
  assert.equal(sameWrittenNumber('-3/4', '\\frac{-3}{4}'), true);
  assert.equal(sameWrittenNumber('6/8', '3/4'), false, 'same value, different written form');
  assert.equal(sameWrittenNumber('3/-4', '-3/4'), false, 'a signed denominator is a different form');
  assert.equal(sameWrittenNumber('0.75', '3/4'), false);
});

/* ---------------------------------------------------------------------------
 * The three shapes.
 * ------------------------------------------------------------------------- */

test('fractionQuestionShape: the author\'s sum, the author\'s answer, or a drill', () => {
  const { OPERANDS, AUTHORED_ANSWER, DRILL } = FRACTION_QUESTION_SHAPES;
  const rows = [
    [{ type: 'fraction', n1: 1, d1: 2, n2: 1, d2: 3 }, OPERANDS],
    [{ type: 'fraction', n1: -1, d1: 2, n2: 1, d2: 3, answer: '-1/6' }, OPERANDS],
    [{ type: 'fraction', answer: '3/4' }, AUTHORED_ANSWER],
    [{ type: 'fraction', answer: 0.75 }, AUTHORED_ANSWER],
    [{ type: 'fraction', acceptedAnswers: ['3/4'] }, AUTHORED_ANSWER],
    [{ type: 'fraction', ansNum: 3, ansDen: 4 }, AUTHORED_ANSWER],
    [{ type: 'fraction', n1: 1, d1: 2, answer: '3/4' }, AUTHORED_ANSWER], // half a sum is not a sum
    [{ type: 'fraction', prompt: 'Add the fractions.' }, DRILL],
    [{ type: 'fraction', answer: '   ', acceptedAnswers: [] }, DRILL],
    [{ type: 'fraction', n1: 1, d1: 0, n2: 1, d2: 3 }, DRILL], // a zero denominator is not an operand
    [{ type: 'fraction', n1: '1', d1: '2', n2: '1', d2: '3' }, DRILL], // operands are numbers
    [{ type: 'fraction', ansNum: 3, ansDen: 0 }, DRILL],
    [{ type: 'fraction', ansNum: 3 }, DRILL],
  ];
  for (const [question, shape] of rows) {
    assert.equal(fractionQuestionShape(question), shape, JSON.stringify(question));
  }
  assert.deepEqual(
    fractionAnswerCandidates({ answer: '3/4', acceptedAnswers: ['6/8', ''], ansNum: 9, ansDen: 12 }),
    ['3/4', '6/8', '\\frac{9}{12}'],
    'every authored answer, primary first',
  );
});

/* ---------------------------------------------------------------------------
 * Generation.
 * ------------------------------------------------------------------------- */

/*
 * Captured from src/problemGenerator.js BEFORE this change (cc58b181), one
 * row per generation key: [n1, d1, n2, d2, ansNum, ansDen]. A student
 * mid-assignment is looking at these numbers; a drill must keep drawing them.
 */
const PINNED_DRILLS = [
  {
    blueprint: { type: 'fraction', prompt: 'Add the fractions.' },
    draws: {
      'asg-1|student-a|0|variant:0': [2, 6, 3, 12, 42, 72],
      'asg-1|student-a|0|variant:1': [3, 12, 3, 6, 54, 72],
      'asg-1|student-b|0|variant:0': [1, 4, 3, 4, 16, 16],
      'asg-1|student-c|4|variant:0': [5, 10, 1, 10, 60, 100],
      'asg-2|shared|2|variant:0': [1, 2, 5, 6, 16, 12],
      'preview|teacher|7|variant:3': [1, 8, 1, 2, 10, 16],
      'demo-key': [5, 6, 3, 5, 43, 30],
    },
  },
  {
    blueprint: { type: 'fraction', prompt: 'Add the fractions.', generator: { denominators: [2, 3, 4] } },
    draws: {
      'asg-1|student-a|0|variant:0': [1, 3, 1, 4, 7, 12],
      'asg-1|student-a|0|variant:1': [1, 4, 1, 3, 7, 12],
      'asg-1|student-b|0|variant:0': [1, 2, 2, 3, 7, 6],
      'asg-1|student-c|4|variant:0': [2, 4, 1, 4, 12, 16],
      'asg-2|shared|2|variant:0': [1, 2, 2, 3, 7, 6],
      'preview|teacher|7|variant:3': [1, 4, 1, 2, 6, 8],
      'demo-key': [2, 3, 2, 3, 12, 9],
    },
  },
];

test('a fraction drill draws exactly the numbers it drew before the fix', () => {
  for (const { blueprint, draws } of PINNED_DRILLS) {
    for (const [key, expected] of Object.entries(draws)) {
      const delivered = generateQuestion(blueprint, key);
      assert.deepEqual(RANDOM_FIELDS.map((field) => delivered[field]), expected, `${JSON.stringify(blueprint)} @ ${key}`);
      // Appended last, in the same order: the delivered JSON is byte-identical.
      assert.deepEqual(Object.keys(delivered).slice(-RANDOM_FIELDS.length), RANDOM_FIELDS);
      for (const [field, value] of Object.entries(blueprint)) assert.deepEqual(delivered[field], value, field);
    }
  }
});

test('authored operands are kept, and their key is their sum', () => {
  const blueprint = { type: 'fraction', prompt: 'Add.', n1: 1, d1: 2, n2: 1, d2: 3 };
  for (const key of KEYS) {
    const delivered = generateQuestion(blueprint, key);
    assert.deepEqual(RANDOM_FIELDS.map((field) => delivered[field]), [1, 2, 1, 3, 5, 6], key);
  }
  // A key the author gave is theirs, not recomputed.
  const keyed = generateQuestion({ ...blueprint, ansNum: 10, ansDen: 12 }, KEY);
  assert.deepEqual([keyed.ansNum, keyed.ansDen], [10, 12]);
});

test('an authored answer is delivered as written: no random numbers are added', () => {
  const blueprints = [
    { type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4' },
    { type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4', generator: { denominators: [2, 3, 4] } },
    { type: 'fraction', prompt: 'Simplify 9/12.', acceptedAnswers: ['3/4'] },
  ];
  for (const blueprint of blueprints) {
    for (const key of KEYS) {
      const delivered = generateQuestion(blueprint, key);
      for (const field of RANDOM_FIELDS) assert.equal(field in delivered, false, `${field} @ ${key}: ${JSON.stringify(blueprint)}`);
      for (const [field, value] of Object.entries(blueprint)) assert.deepEqual(delivered[field], value, field);
    }
  }
  const keyOnly = generateQuestion({ type: 'fraction', prompt: 'Simplify 9/12.', ansNum: 3, ansDen: 4 }, KEY);
  assert.deepEqual(RANDOM_FIELDS.map((field) => keyOnly[field]), [undefined, undefined, undefined, undefined, 3, 4]);
});

/* ---------------------------------------------------------------------------
 * Grading.
 * ------------------------------------------------------------------------- */

test('an authored 3/4 is graded against 3/4, in lowest terms', () => {
  const question = generateQuestion({ type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4' }, KEY);
  assert.equal(correct(question, '3/4'), true);
  assert.equal(correct(question, '\\frac34'), true, 'MathLive writes single digits as \\frac34');
  assert.equal(correct(question, '\\frac{3}{4}'), true);
  assert.equal(correct(question, '6/8'), false, 'worth 3/4, but not in lowest terms');
  assert.equal(correct(question, '0.75'), false, 'worth 3/4, but not a fraction');
  assert.equal(correct(question, '-3/4'), false, 'the sign is part of the answer');
  assert.deepEqual(gradeFractionResponse(question, '3/4'), {
    isComplete: true,
    isCorrect: true,
    parts: [{ id: 'fraction', label: 'Fraction answer', isComplete: true, isCorrect: true, response: '3/4' }],
  });
  assert.deepEqual(gradeFractionResponse(question, ''), {
    isComplete: false,
    isCorrect: false,
    parts: [{ id: 'fraction', label: 'Fraction answer', isComplete: false, isCorrect: false, response: '' }],
  });
});

test('a negative authored answer keeps its sign, in front or on the numerator', () => {
  const question = { type: 'fraction', prompt: 'Simplify -6/8.', answer: '-3/4' };
  assert.equal(correct(question, '-\\frac{3}{4}'), true);
  assert.equal(correct(question, '\\frac{-3}{4}'), true);
  assert.equal(correct(question, '(-3)/4'), true);
  assert.equal(correct(question, '3/-4'), false, 'a signed denominator is not lowest terms');
  assert.equal(correct(question, '3/4'), false);
});

test('an author who did not ask for lowest terms is not held to them', () => {
  const unreduced = { type: 'fraction', prompt: 'Add 3/8 + 3/8.', answer: '6/8' };
  assert.equal(correct(unreduced, '3/4'), true);
  assert.equal(correct(unreduced, '6/8'), true);
  assert.equal(correct(unreduced, '0.75'), true, 'value equality is enough');
  assert.equal(correct(unreduced, '5/8'), false);

  const decimalKey = { type: 'fraction', prompt: 'Write 0.75 another way.', answer: '0.75' };
  assert.equal(correct(decimalKey, '3/4'), true);
});

test('a form the author listed is accepted even when it is not reduced', () => {
  const question = { type: 'fraction', prompt: 'Simplify.', answer: '3/4', acceptedAnswers: ['6/8'] };
  assert.equal(correct(question, '6/8'), true);
  assert.equal(correct(question, '\\frac{6}{8}'), true);
  assert.equal(correct(question, '\\frac68'), true);
  assert.equal(correct(question, '3/4'), true);
  assert.equal(correct(question, '12/16'), false, 'an unlisted unreduced form is still not lowest terms');

  // A reduced response is right whichever listed answer it is worth.
  const twoValues = { type: 'fraction', prompt: 'Name either fraction.', answer: '1/2', acceptedAnswers: ['0.75'] };
  assert.equal(correct(twoValues, '3/4'), true);
  assert.equal(correct(twoValues, '6/8'), false);
});

test('a drill is graded exactly as before: any answer worth its sum', () => {
  for (const { blueprint, draws } of PINNED_DRILLS) {
    for (const key of Object.keys(draws)) {
      const question = generateQuestion(blueprint, key);
      const expectedLatex = `\\frac{${question.ansNum}}{${question.ansDen}}`;
      const responses = [
        expectedLatex,
        `${question.ansNum}/${question.ansDen}`,
        `${question.ansNum + 1}/${question.ansDen}`,
        `-${question.ansNum}/${question.ansDen}`,
        String(question.ansNum / question.ansDen),
        (question.ansNum / question.ansDen).toFixed(2),
        'x',
        '',
      ];
      for (const response of responses) {
        // The pre-fix definition, verbatim.
        const before = response !== '' && compareMathAnswer(response, expectedLatex);
        assert.equal(correct(question, response), before, `${JSON.stringify(response)} @ ${key}`);
      }
    }
  }
  const drill = generateQuestion(PINNED_DRILLS[0].blueprint, KEY); // 2/6 + 3/12 = 42/72
  assert.equal(correct(drill, '7/12'), true);
  assert.equal(correct(drill, '42/72'), true, 'a drill never required lowest terms');
  assert.equal(correct(drill, '0.5833333333'), true);
  assert.equal(correct(drill, '0.58'), false);
});

test('authored operands are graded against their sum, even before generation fills the key', () => {
  const question = { type: 'fraction', prompt: 'Add.', n1: 1, d1: 2, n2: 1, d2: 3 };
  assert.equal(correct(question, '5/6'), true);
  assert.equal(correct(question, '10/12'), true);
  assert.equal(correct(question, '1/2'), false);
});

/* ---------------------------------------------------------------------------
 * Authoring.
 * ------------------------------------------------------------------------- */

test('Create refuses a fraction answer MathMaster could never match', () => {
  assert.throws(
    () => validateAssignmentQuestions([
      { type: 'fraction', prompt: 'Add the fractions.' },
      { type: 'fraction', prompt: 'Simplify 6/8.', answer: 'three quarters' },
    ]),
    { message: 'Question 2 fraction answer "three quarters" is not a number MathMaster can grade (write it like 3/4).' },
  );
  for (const answer of ['3:4', 'x/4', '3/0', '1 1/2']) {
    assert.throws(
      () => validateAssignmentQuestions([{ type: 'fraction', prompt: 'Simplify.', answer }]),
      /fraction answer .* is not a number MathMaster can grade \(write it like 3\/4\)\./,
      answer,
    );
  }
  for (const answer of ['3/4', '-3/4', '\\frac{3}{4}', '\\frac34', '6/8', '2', 0.75]) {
    assert.doesNotThrow(() => validateAssignmentQuestions([{ type: 'fraction', prompt: 'Simplify.', answer }]), String(answer));
  }
});

test('a prompt-only fraction drill is still a valid question, so library assignments stay reusable', () => {
  assert.doesNotThrow(() => validateAssignmentQuestions([
    { type: 'fraction', prompt: 'Add the fractions.' },
    { type: 'fraction', prompt: 'Add the fractions.', answer: '' },
    { type: 'fraction', prompt: 'Add the fractions.', generator: { denominators: [2, 3, 4] } },
  ]));
});

test('end to end: a V5 fractionAnswer question is delivered and graded as authored', () => {
  const payload = {
    schemaVersion: 5,
    assignment: { title: 'Fraction answers', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [
        { standard: 'A.3C', prompt: 'Simplify 6/8.', studentActions: ['fractionAnswer'], answer: '3/4' },
        { standard: 'A.3C', prompt: 'Add the fractions.', studentActions: ['fractionAnswer'] },
      ],
    }],
  };
  const parsed = parseAssignmentBlueprintText(JSON.stringify(payload));
  const [authored, drill] = parsed.questions;
  assert.equal(authored.type, 'fraction');
  assert.equal(authored.answer, '3/4');
  validateAssignmentQuestions(parsed.questions);

  const key = 'asg-v5|student-a|0|variant:0';
  const delivered = generateQuestion(authored, key);
  assert.equal(delivered.type, 'fraction');
  assert.equal(delivered.answer, '3/4');
  assert.equal(delivered.prompt, 'Simplify 6/8.');
  for (const field of RANDOM_FIELDS) assert.equal(field in delivered, false, `no random ${field}`);
  assert.equal(correct(delivered, '3/4'), true, 'the authored answer is correct');

  // What the old generator drew for this student: the same question without
  // its answer is a drill, and draws the sum the student used to be graded on.
  const { answer: _answer, ...withoutAnswer } = authored;
  const randomSum = generateQuestion(withoutAnswer, key);
  assert.ok(Number.isFinite(randomSum.ansNum) && Number.isFinite(randomSum.ansDen));
  assert.notEqual(randomSum.ansNum * 4, randomSum.ansDen * 3, 'precondition: the random sum is not worth 3/4');
  assert.equal(correct(delivered, `\\frac{${randomSum.ansNum}}{${randomSum.ansDen}}`), false, 'the random sum is not the answer');
  assert.equal(correct(delivered, `${randomSum.ansNum}/${randomSum.ansDen}`), false);

  // The prompt-only intent is still a drill, and still draws.
  const deliveredDrill = generateQuestion(drill, key);
  assert.deepEqual(RANDOM_FIELDS.map((field) => Number.isFinite(deliveredDrill[field])), RANDOM_FIELDS.map(() => true));
  assert.equal(correct(deliveredDrill, `\\frac{${deliveredDrill.ansNum}}{${deliveredDrill.ansDen}}`), true);
});

test('end to end: a V5 fractionAnswer keeps the other forms, the math line and the sum its author wrote', () => {
  // The V5 compiler used to keep only `answer` and `generator`, so these three
  // authored questions reached the student as something else: 6/8 graded
  // wrong, the line under the prompt gone, and the author's sum replaced by a
  // random drill.
  const payload = {
    schemaVersion: 5,
    assignment: { title: 'Fraction answers', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [
        { standard: 'A.3C', prompt: 'Write the part shaded.', studentActions: ['fractionAnswer'], answer: '3/4', acceptedAnswers: ['6/8'] },
        { standard: 'A.3C', prompt: 'Simplify.', studentActions: ['fractionAnswer'], answer: '3/4', expressionLatex: '\\frac{6}{8} =' },
        { standard: 'A.3C', prompt: 'Add.', studentActions: ['fractionAnswer'], n1: 1, d1: 2, n2: 1, d2: 3 },
      ],
    }],
  };
  const parsed = parseAssignmentBlueprintText(JSON.stringify(payload));
  validateAssignmentQuestions(parsed.questions);
  const [forms, line, sum] = parsed.questions.map((question) => generateQuestion(question, KEY));

  assert.deepEqual(forms.acceptedAnswers, ['6/8']);
  assert.equal(correct(forms, '6/8'), true, 'a form the author listed is correct');
  assert.equal(correct(forms, '3/4'), true);

  assert.equal(fractionQuestionDisplay(line).expressionLatex, '\\frac{6}{8} =');

  assert.equal(fractionQuestionShape(sum), FRACTION_QUESTION_SHAPES.OPERANDS, 'the author\'s sum, not a drill');
  assert.deepEqual([sum.n1, sum.d1, sum.n2, sum.d2], [1, 2, 1, 3]);
  assert.equal(fractionQuestionDisplay(sum).expressionLatex, '\\frac{1}{2} + \\frac{1}{3} =');
  assert.equal(correct(sum, '5/6'), true);
});

/* ---------------------------------------------------------------------------
 * What the student sees.
 * ------------------------------------------------------------------------- */

test('the fraction screen shows a sum only when there is a sum to add', () => {
  const drill = generateQuestion({ type: 'fraction' }, KEY); // 2/6 + 3/12
  assert.deepEqual(
    (({ prompt, expressionLatex, questionText }) => ({ prompt, expressionLatex, questionText }))(fractionQuestionDisplay(drill)),
    { prompt: 'Add the fractions.', expressionLatex: '\\frac{2}{6} + \\frac{3}{12} =', questionText: 'Solve: 2/6 + 3/12' },
  );
  const operands = generateQuestion({ type: 'fraction', prompt: 'Add.', n1: 1, d1: 2, n2: 1, d2: 3 }, KEY);
  assert.equal(fractionQuestionDisplay(operands).expressionLatex, '\\frac{1}{2} + \\frac{1}{3} =');

  const authored = generateQuestion({ type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4' }, KEY);
  const shown = fractionQuestionDisplay(authored);
  assert.equal(shown.prompt, 'Simplify 6/8.');
  assert.equal(shown.expressionLatex, '', 'no generated sum beside an authored question');
  assert.equal(shown.questionText, 'Simplify 6/8.');
  assert.equal(fractionQuestionDisplay({ ...authored, expressionLatex: '\\frac{6}{8}' }).expressionLatex, '\\frac{6}{8}');

  const bare = fractionQuestionDisplay({ type: 'fraction', answer: '3/4' });
  assert.equal(bare.prompt, '', 'an authored question never borrows the drill prompt');
  assert.equal(bare.expressionLatex, '');
  assert.doesNotMatch(bare.questionText, /Solve:|undefined/, 'the response details must not describe a sum that was never shown');
});

test('the solution review shows the authored answer, stacked, and nothing the author did not write', () => {
  assert.deepEqual(fractionSolutionRepresentations({ type: 'fraction', answer: '3/4' }), ['\\frac{3}{4}']);
  assert.deepEqual(fractionSolutionRepresentations({ type: 'fraction', answer: '-3/4' }), ['-\\frac{3}{4}']);
  assert.deepEqual(
    fractionSolutionRepresentations({ type: 'fraction', answer: '3/4', acceptedAnswers: ['6/8', '\\frac{3}{4}'] }),
    ['\\frac{3}{4}', '\\frac{6}{8}'],
  );
  for (const line of fractionSolutionRepresentations({ type: 'fraction', answer: '3/4', acceptedAnswers: ['6/8'] })) {
    assert.doesNotMatch(line, /Decimal/i);
  }
  // A drill keeps its three lines.
  assert.deepEqual(
    fractionSolutionRepresentations(generateQuestion(PINNED_DRILLS[0].blueprint, KEY)),
    ['\\frac{42}{72}', 'Decimal: 0.583333', '42/72'],
  );
});

/*
 * Node cannot import a .jsx component, so these read the two screens' source
 * to assert they are wired to the logic tested above (the playbook:
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md). Each is anchored to the
 * statement that does the work.
 */
test('the fraction screen grades the whole question and draws what fractionQuestionDisplay decides', () => {
  const source = executableSource(read('src/FractionGrader.jsx'));
  assert.match(source, /^import \{ fractionQuestionDisplay \} from '\.\/fractionQuestionDisplay\.js';$/m, 'a call with no import is a runtime ReferenceError');
  assert.match(source, /\n\s*const display = fractionQuestionDisplay\(question\);/);
  assert.match(source, /gradeFractionResponse\(question, answer\)/, 'the grader needs the authored answer, not just ansNum/ansDen');
  assert.match(source, /\{display\.prompt && <QuestionPrompt>\{display\.prompt\}<\/QuestionPrompt>\}/);
  assert.match(
    source,
    /\{display\.expressionLatex && \(\s*<div[^>]*>\s*<MathDisplay value=\{display\.expressionLatex\}/,
    'the expression line is the display decision, and absent when there is none',
  );
  assert.match(source, /Type \/ to create a stacked fraction, or open the focused math tools\./);

  const effect = region(source, 'useEffect(', ']);', 'the fraction screen state effect');
  assert.match(effect, /questionDetails: `\$\{questionText\} Response: /);
  const dependencies = effect.slice(effect.lastIndexOf('[') + 1).split(/[\s,]+/).filter(Boolean);
  for (const name of ['answer', 'isComplete', 'isCorrect', 'questionText', 'onStateChange']) {
    assert.ok(dependencies.includes(name), `the state effect must re-run when ${name} changes (deps: ${dependencies.join(', ')})`);
  }
});

test('the solution review takes its fraction lines from fractionSolutionRepresentations', () => {
  const source = executableSource(read('src/SolutionReview.jsx'));
  assert.match(source, /^import \{ fractionSolutionRepresentations \} from '\.\/fractionQuestionDisplay\.js';$/m);
  const fractionCase = region(source, "case 'fraction':", "case 'literal':", 'the fraction solution case');
  assert.match(fractionCase, /^case 'fraction':\s*return fractionSolutionRepresentations\(question\);\s*$/);
});

/* ---------------------------------------------------------------------------
 * The rules that mirror generation.
 * ------------------------------------------------------------------------- */

test('"New Question" and Pre-Flight see that an authored fraction question does not vary', () => {
  const drill = { type: 'fraction', prompt: 'Add the fractions.' };
  const authored = { type: 'fraction', prompt: 'Simplify 6/8.', answer: '3/4' };
  const authoredWithGenerator = { ...authored, generator: { denominators: [2, 3, 4] } };
  const operands = { type: 'fraction', prompt: 'Add.', n1: 1, d1: 2, n2: 1, d2: 3 };

  assert.equal(describeQuestionVariability(drill).mode, VARIABILITY.LEGACY_SELF_GENERATING);
  for (const question of [authored, authoredWithGenerator, operands]) {
    assert.deepEqual(
      describeQuestionVariability(question),
      { mode: VARIABILITY.STATIC, canVary: false, uniquenessManaged: false, reason: 'authored_fraction' },
      JSON.stringify(question),
    );
  }
  // The same rules as generation: what isPersonalizedBlueprint promises,
  // generation does.
  for (const question of [drill, authored, authoredWithGenerator, operands]) {
    const first = JSON.stringify(generateQuestion(question, 'asg-1|student-a|0|variant:0'));
    const second = JSON.stringify(generateQuestion(question, 'asg-1|student-b|0|variant:0'));
    assert.equal(first !== second, isPersonalizedBlueprint(question), JSON.stringify(question));
  }

  assert.equal(describeQuestionVariability({ type: 'fraction', prompt: 'Simplify.', variants: [{ answer: '1/2' }, { answer: '3/4' }] }).mode, VARIABILITY.VARIANTS);
  assert.equal(isPersonalizedBlueprint({ type: 'fraction', prompt: 'Simplify.', variants: [{ answer: '3/4' }] }), false);
  assert.equal(isPersonalizedBlueprint({ type: 'fraction', prompt: 'Simplify.', variants: [{ answer: '3/4' }, { prompt: 'Add the fractions.' }] }), true, 'a variant that is still a drill varies');
});

test('reduce-complexity is recorded as a modification only where it changed the fraction question', () => {
  const configured = ['reduce-complexity'];
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'fraction', generator: { kind: 'fraction' } }, configured), ['reduce-complexity']);
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'fraction', answer: '3/4', generator: { kind: 'fraction' } }, configured), [], 'an authored answer is delivered at grade level');
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'fraction', n1: 1, d1: 2, n2: 1, d2: 3, generator: { kind: 'fraction' } }, configured), []);

  const profile = { modifications: ['reduce-complexity'] };
  for (const key of KEYS) {
    const drill = generateQuestion({ type: 'fraction', generator: { kind: 'fraction' } }, key, profile);
    assert.ok([2, 4, 5, 10].includes(drill.d1) && [2, 4, 5, 10].includes(drill.d2), `a modified drill still draws narrower denominators @ ${key}`);
    const authored = generateQuestion({ type: 'fraction', answer: '3/4', generator: { kind: 'fraction' } }, key, profile);
    assert.equal(authored.answer, '3/4');
    assert.equal('n1' in authored, false);
  }
});
