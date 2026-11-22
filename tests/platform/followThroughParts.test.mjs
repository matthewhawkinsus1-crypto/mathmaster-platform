/*
 * FOLLOW-THROUGH PARTS: THE VALUE AND THE LABEL (SP-3;
 * docs/platform/SHOWING_THE_PROCESS.md section 4; functions/shared/followThrough.mjs).
 *
 * What these tests hold:
 *   1. THE VALUE is student input. It goes into a key only as mathematics, in
 *      brackets unless it is a plain unsigned number, and only when it is a
 *      short, finished piece of mathematics: anything else is no value, and
 *      the part falls back to its own answer.
 *   2. THE LABEL shows the student's value, or "your slope …" before there is
 *      one: never a raw {slope} and never the key. Read aloud and the "Read a
 *      part" tray read the same label, and every screen that draws a part's
 *      label draws it that way.
 *   3. A SECURE ITEM'S PUBLIC COPY names the parts a label builds on, never
 *      the follow-through answer, which is a key.
 *
 * The verdicts are in followThroughGrading.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { followThroughKeys, followThroughLabel, followThroughValue, withFollowThroughLabels } from '../../functions/shared/followThrough.mjs';
import { followThroughPlaceholders } from '../../src/platform/contract/lessonSupportsV5.js';
import { questionReadingParts, questionReadingText } from '../../src/platform/language/questionReading.js';
import { mergeQuestion, splitQuestion } from '../../functions/shared/assignmentKeySplit.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { fieldItem, inequalityQuestion, lineQuestion, mathPath } from './helpers/followThroughFixtures.mjs';

const fields = inequalityQuestion.answerFields;
const later = fields[1];
const keyFor = (slope) => followThroughKeys(fields, { slope }).get('inequality');

// ------------------------------------------------------------------ 1. the value

test('a negative, a fraction and a sum go into the key in brackets; a plain unsigned number does not', () => {
  assert.equal(keyFor('-3'), 'y > (-3)x + 3');
  assert.equal(keyFor('−3'), 'y > (−3)x + 3');
  assert.equal(keyFor('\\frac{1}{2}'), 'y > (\\frac{1}{2})x + 3');
  assert.equal(keyFor('1/2'), 'y > (1/2)x + 3');
  assert.equal(keyFor('-\\frac{1}{2}'), 'y > (-\\frac{1}{2})x + 3');
  assert.equal(keyFor('a+b'), 'y > (a+b)x + 3');
  assert.equal(keyFor('+3'), 'y > (+3)x + 3');
  assert.equal(keyFor('3'), 'y > 3x + 3');
  assert.equal(keyFor('2.5'), 'y > 2.5x + 3');
  assert.equal(keyFor('0'), 'y > 0x + 3');
});

test('a blank, a relation, words, an unfinished entry or anything but mathematics is no value, and builds no key', () => {
  const none = [
    undefined, null, '', '   ', 'x = 2', 'y > 3', 'm=-2', 'hello', 'abc', '\\text{-3}', '\\mathrm{x}', '2 +', '-', '*3',
    '{slope}', '{inequality}', '(1', '1)', '1,000', '\\placeholder{}', '$-2$', '<b>2</b>', '2; 3', '"2"', '\\href{x}{2}',
    '\\pi', `${'1'.repeat(41)}`, 'x^99',
  ];
  none.forEach((slope) => {
    assert.equal(followThroughValue(slope), null, JSON.stringify(slope));
    assert.equal(keyFor(slope), undefined, JSON.stringify(slope));
  });
  // A number written as a number is one.
  assert.deepEqual(followThroughValue(' -2 '), { shown: '-2', keyed: '(-2)' });
  assert.deepEqual(followThroughValue(4), { shown: '4', keyed: '4' });
  assert.deepEqual(followThroughValue('\\sqrt{2}'), { shown: '\\sqrt{2}', keyed: '(\\sqrt{2})' });
});

test('a choice part is never a value', () => {
  assert.equal(followThroughValue('2', { id: 'pick', type: 'choice', options: ['2', '3'] }), null);
  assert.equal(followThroughValue('2', { id: 'pick', choices: [{ id: '2', label: '2' }] }), null);
  assert.equal(followThroughValue('2', { id: 'pick', inputProfile: 'multipleChoice' }), null);
});

test('a key is built only from the parts the follow-through names, before it, and never longer than a typed answer', () => {
  // A later part's value, or one `from` does not list, is never read.
  const rogue = [
    { id: 'slope', label: 'Slope', answer: '-2' },
    { id: 'inequality', label: 'Using {late}', answer: 'y > -2x + 3', followThrough: { from: ['slope', 'late'], answer: 'y > {late}x + 3' } },
    { id: 'late', label: 'Later', answer: '1' },
  ];
  assert.equal(followThroughKeys(rogue, { slope: '-3', late: '-3' }).has('inequality'), false);
  const unlisted = [
    { id: 'slope', label: 'Slope', answer: '-2' },
    { id: 'inequality', label: 'Using {slope}', answer: 'y > -2x + 3', followThrough: { from: ['other'], answer: 'y > {slope}x + 3' } },
  ];
  assert.equal(followThroughKeys(unlisted, { slope: '-3' }).has('inequality'), false);
  const long = [
    { id: 'a', label: 'A', answer: '1' },
    { id: 'b', label: 'B', answer: 'x', followThrough: { from: ['a'], answer: `${'{a}x+'.repeat(7)}${'1'.repeat(200)}` } },
  ];
  assert.equal(followThroughKeys(long, { a: '-1234567890123456789012345678901234567' }).has('b'), false);
  // No followThrough, no key.
  assert.equal(followThroughKeys([{ id: 'a', answer: '1' }, { id: 'b', answer: '2' }], { a: '3' }).size, 0);
});

test('the placeholders the validator checks are the ones replaced: one definition', () => {
  assert.deepEqual(followThroughPlaceholders('Using your slope of {slope} and {b-value}, write it'), ['slope', 'b-value']);
  assert.deepEqual(followThroughPlaceholders('\\sqrt{x} + \\frac{a}{b} + x^{2} + x_{n} + {{k}} + ${x}$'), []);
  const source = executableSource(componentSource('src/platform/contract/lessonSupportsV5.js'));
  assert.match(source, /import \{[^}]*followThroughPlaceholders[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/followThrough\.mjs'/);
  assert.doesNotMatch(source, /const PLACEHOLDER\s*=/, 'the validator keeps no pattern of its own');
});

// ------------------------------------------------------------------ 2. the label

test('the label shows the student\'s value, and "your slope …" before there is one', () => {
  assert.equal(followThroughLabel(later, fields, { slope: '-3' }), 'Using your slope of $-3$, write the inequality');
  assert.equal(followThroughLabel(later, fields, { slope: '\\frac{1}{2}' }), 'Using your slope of $\\frac{1}{2}$, write the inequality');
  for (const slope of [undefined, '', 'hello', 'x=2']) {
    const label = followThroughLabel(later, fields, slope === undefined ? {} : { slope });
    assert.equal(label, 'Using your slope of your slope of the boundary line, write the inequality', JSON.stringify(slope));
  }
  // Never a raw {name}, never the key (-2).
  assert.doesNotMatch(followThroughLabel(later, fields, {}), /\{slope\}|-2/);
  // A label drawn as LaTeX gets the value bare and the phrase as text.
  assert.equal(followThroughLabel(later, fields, { slope: '-3' }, { latex: true }), 'Using your slope of -3, write the inequality');
  assert.match(followThroughLabel(later, fields, {}, { latex: true }), /\\text\{your slope of the boundary line\}/);
  // Two names, each from its own part.
  assert.equal(
    followThroughLabel(lineQuestion.answerFields[2], lineQuestion.answerFields, { slope: '4' }),
    'Using your slope of $4$ and y-intercept of your y-intercept, write the equation of the line',
  );
  assert.equal(
    followThroughLabel(lineQuestion.answerFields[2], lineQuestion.answerFields, { slope: '4', intercept: '-2' }),
    'Using your slope of $4$ and y-intercept of $-2$, write the equation of the line',
  );
});

test('the graded part carries the label the student read; a part with no followThrough keeps its own', () => {
  const parts = gradeMultiAnswerResponse(inequalityQuestion, { slope: '-3' }).parts;
  assert.equal(parts[1].label, 'Using your slope of $-3$, write the inequality');
  assert.equal(parts[0].label, 'Slope of the boundary line');
  // No followThrough on any part: the very same fields come back to draw.
  const plain = [{ id: 'a', label: 'A {b}' }, { id: 'b', label: 'B' }];
  assert.equal(withFollowThroughLabels(plain, { a: '1' }), plain);
  const plainQuestion = structuredClone(inequalityQuestion);
  plainQuestion.answerFields.forEach((field) => { delete field.followThrough; });
  assert.equal(gradeMultiAnswerResponse(plainQuestion, { slope: '-3' }).parts[1].label, 'Using your slope of {slope}, write the inequality');
});

test('Read aloud reads the label with the student\'s value, and never the answer', () => {
  const reading = (answers) => questionReadingParts(inequalityQuestion, { answers });
  const after = questionReadingText(reading({ slope: '-3' }));
  assert.match(after, /Using your slope of \$-3\$, write the inequality/);
  const before = questionReadingText(reading({}));
  assert.match(before, /Using your slope of your slope of the boundary line, write the inequality/);
  for (const text of [after, before]) {
    assert.doesNotMatch(text, /\{slope\}/);
    assert.doesNotMatch(text, /-2|\(-3\)x|3x \+ 3/, 'neither the key nor the keyed answer');
  }
  // The "Read a part" tray reads the same part.
  const part = reading({ slope: '-3' }).find((entry) => entry.id === 'part-inequality');
  assert.match(part.text, /Using your slope of \$-3\$/);
  // A question with no followThrough reads as it did, answers or none.
  const plain = structuredClone(inequalityQuestion);
  plain.answerFields.forEach((field) => { delete field.followThrough; });
  assert.deepEqual(questionReadingParts(plain, { answers: { slope: '-3' } }), questionReadingParts(plain));
});

test('every screen that draws a part\'s label draws it with the student\'s values', () => {
  // MultiAnswerGrader: its boxes, its answered lines and Review all parts
  // draw the fields with their labels written in.
  const grader = executableSource(componentSource('src/MultiAnswerGrader.jsx'));
  assert.match(grader, /withFollowThroughLabels\(\s*safeFields\s*,\s*answers/);
  const drawn = region(grader, 'const fieldBox = (field) =>', 'export default memo', 'the parts as drawn');
  assert.match(drawn, /fieldLabelContent\(shown\(field\)\)/);
  assert.doesNotMatch(drawn, /fieldLabelContent\(field\)|accessibleFieldLabel\(field\)/, 'no label is drawn from the authored field');
  // RichQuestionRuntime's FieldItem (a secure Test's field item): its boxes and lines.
  const runtime = executableSource(componentSource('src/components/question/RichQuestionRuntime.jsx'));
  assert.match(runtime, /const fields = useMemo\(\(\) => withFollowThroughLabels\(\s*authoredFields\s*,\s*responses/);
  // Read aloud and the "Read a part" tray: QuestionEngine hands the reader the answers.
  const engine = executableSource(componentSource('src/QuestionEngine.jsx'));
  const reader = region(engine, 'questionReadingParts(processedQuestion, {', '}),', 'the reading parts');
  assert.match(reader, /answers:\s*readingAnswers/);
  // My Math Path's fields, graded by the same server field grader.
  const pathFields = executableSource(componentSource('src/components/student/PathResponseFields.jsx'));
  assert.match(pathFields, /const resolved = withFollowThroughLabels\(/);
  // The released secure review lists each answer under the label the student read.
  const review = executableSource(componentSource('src/components/assessment/SecureExamReview.jsx'));
  const rows = region(review, 'const responseRows = (item) =>', 'const STATUS_TONE', 'the answer rows');
  assert.match(rows, /withFollowThroughLabels\(\s*snapshotFields\s*,\s*responses/);
});

// ------------------------------------------------------------------ 3. a secure item's public copy

test('a secure item\'s public copy names the parts a label builds on, and never its answer', async () => {
  const plan = await mathPath.buildIssuePlan(fieldItem);
  const sanitized = mathPath.buildSanitizedQuestion(fieldItem, { questionInstanceId: 'q-1' });
  const publicField = sanitized.responseFields.find((field) => field.id === 'inequality');
  assert.deepEqual(publicField.followThrough, { from: ['slope'] });
  assert.equal(publicField.label, 'Using your slope of {slope}, write the inequality', 'the screen writes the value in');
  assert.equal(JSON.stringify(sanitized).includes('{slope}x'), false, 'the follow-through answer is a key');
  assert.deepEqual(plan.privateGrading.fields[1].followThrough, { from: ['slope'], answer: 'y > {slope}x + 3' });
  // A field with no followThrough issues exactly as before.
  assert.equal('followThrough' in plan.privateGrading.fields[0], false);
  assert.equal('followThrough' in sanitized.responseFields[0], false);
});

test('an assignment\'s answer-key split moves the follow-through answer and keeps which parts it names', () => {
  const { publicQuestion, privatePart } = splitQuestion(inequalityQuestion);
  const publicField = publicQuestion.answerFields.find((field) => field.id === 'inequality');
  assert.deepEqual(publicField.followThrough, { from: ['slope'] });
  assert.equal(JSON.stringify(publicQuestion).includes('{slope}x'), false);
  assert.deepEqual(mergeQuestion(publicQuestion, privatePart), inequalityQuestion, 'the round trip is exact');
});
