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
import * as followThroughRules from '../../functions/shared/followThrough.mjs';
import { gradeOrdinaryResponse, normalizeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import { followThroughLabel as neutralLabel, loadFollowThrough } from '../../functions/shared/followThroughNames.mjs';
import { readFileSync } from 'node:fs';
import { followThroughPlaceholders } from '../../src/platform/contract/lessonSupportsV5.js';
import { questionReadingParts, questionReadingText } from '../../src/platform/language/questionReading.js';
import { mergeQuestion, splitQuestion } from '../../functions/shared/assignmentKeySplit.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { fieldItem, inequalityQuestion, lineQuestion, mathPath } from './helpers/followThroughFixtures.mjs';

const fields = inequalityQuestion.answerFields;
const later = fields[1];
const keyFor = (slope) => followThroughKeys(fields, { slope }).get('inequality');

// ------------------------------------------------------------------ 1. the value

test('a signed value, a typed fraction and a sum go into the key in brackets; one unsigned term does not', () => {
  assert.equal(keyFor('-3'), 'y > (-3)x + 3');
  assert.equal(keyFor('−3'), 'y > (−3)x + 3');
  // One \\frac or one \\sqrt, unsigned, is already one term.
  assert.equal(keyFor('\\frac{1}{2}'), 'y > \\frac{1}{2}x + 3');
  assert.equal(keyFor('\\dfrac{1}{2}'), 'y > \\dfrac{1}{2}x + 3');
  assert.equal(keyFor('\\sqrt{2}'), 'y > \\sqrt{2}x + 3');
  assert.equal(keyFor('2\\sqrt{3}'), 'y > (2\\sqrt{3})x + 3');
  assert.equal(keyFor('\\frac{1}{2}+1'), 'y > (\\frac{1}{2}+1)x + 3');
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
  assert.deepEqual(followThroughValue('\\sqrt{2}'), { shown: '\\sqrt{2}', keyed: '\\sqrt{2}' });
  assert.deepEqual(followThroughValue('-\\sqrt{2}'), { shown: '-\\sqrt{2}', keyed: '(-\\sqrt{2})' });
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
  assert.match(source, /import \{[^}]*followThroughPlaceholders[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/followThroughNames\.mjs'/);
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
  const parts = gradeMultiAnswerResponse(inequalityQuestion, { slope: '-3' }, { followThrough: followThroughRules }).parts;
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
  const reading = (answers) => questionReadingParts(inequalityQuestion, { answers, followThrough: followThroughRules });
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

test('every screen that draws a part\'s label draws it with the student\'s values, read by the rules it loads', () => {
  const readsValues = /value:\s*followThrough(?:Rules|\.rules)\?\.followThroughValue/;
  // MultiAnswerGrader: its boxes, its answered lines and Review all parts
  // draw the fields with their labels written in.
  const grader = executableSource(componentSource('src/MultiAnswerGrader.jsx'));
  assert.match(region(grader, 'const labelledFields = useMemo(', '[safeFields, answers', 'the labels'), /withFollowThroughLabels\(\s*safeFields\s*,\s*answers/);
  assert.match(region(grader, 'const labelledFields = useMemo(', '[safeFields, answers', 'the labels'), readsValues);
  const drawn = region(grader, 'const fieldBox = (field) =>', 'export default memo', 'the parts as drawn');
  assert.match(drawn, /fieldLabelContent\(shown\(field\)\)/);
  assert.doesNotMatch(drawn, /fieldLabelContent\(field\)|accessibleFieldLabel\(field\)/, 'no label is drawn from the authored field');
  // RichQuestionRuntime's FieldItem (a secure Test's field item): its boxes and lines.
  const runtime = executableSource(componentSource('src/components/question/RichQuestionRuntime.jsx'));
  const fieldLabels = region(runtime, 'const fields = useMemo(', '[authoredFields, responses', 'the field labels');
  assert.match(fieldLabels, /withFollowThroughLabels\(\s*authoredFields\s*,\s*responses/);
  assert.match(fieldLabels, readsValues);
  // Read aloud and the "Read a part" tray: QuestionEngine hands the reader the answers and the rules.
  const engine = executableSource(componentSource('src/QuestionEngine.jsx'));
  const reader = region(engine, 'questionReadingParts(processedQuestion, {', '}),', 'the reading parts');
  assert.match(reader, /answers:\s*readingAnswers/);
  assert.match(reader, /followThrough:\s*followThrough\.rules/);
  // My Math Path's fields, graded by the same server field grader.
  const pathFields = executableSource(componentSource('src/components/student/PathResponseFields.jsx'));
  assert.match(region(pathFields, 'const resolved = withFollowThroughLabels(', '});', 'the Path labels'), readsValues);
  // The released secure review lists each answer under the label the student read.
  const review = executableSource(componentSource('src/components/assessment/SecureExamReview.jsx'));
  const rows = region(review, 'const responseRows = (item, followThrough = null) =>', 'const STATUS_TONE', 'the answer rows');
  assert.match(rows, /withFollowThroughLabels\(\s*snapshotFields\s*,\s*responses,\s*\{\s*value:\s*followThrough\?\.followThroughValue/);
  assert.match(review, /responseRows\(item,\s*followThrough\.rules\)/);
});

test('before the rules arrive a label says "your slope …", never a raw {slope} and never the key', () => {
  assert.equal(neutralLabel(later, fields, { slope: '-3' }), 'Using your slope of your slope of the boundary line, write the inequality');
  assert.equal(questionReadingParts(inequalityQuestion, { answers: { slope: '-3' } }).find((part) => part.id === 'part-inequality').text,
    'Answer box: Using your slope of your slope of the boundary line, write the inequality.');
});

// ------------------------------------------------------------------ the rules load only where they are needed

// The screens a student meets, and the light graders and readers on their way.
const CLIENT_SOURCES = [
  'functions/shared/ordinaryResponseGrading.mjs', 'functions/shared/followThroughNames.mjs', 'functions/shared/legacyFieldGrading.mjs',
  'src/MultiAnswerGrader.jsx', 'src/QuestionEngine.jsx', 'src/components/question/RichQuestionRuntime.jsx',
  'src/components/student/PathResponseFields.jsx', 'src/components/assessment/SecureExamReview.jsx',
  'src/platform/language/questionReading.js', 'src/platform/interaction/useFollowThroughRules.js', 'src/platform/contract/lessonSupportsV5.js',
];

test('a question with no followThrough never imports the rules: no screen imports them, and the loader does not', async () => {
  for (const file of CLIENT_SOURCES) {
    const source = executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.doesNotMatch(source, /from\s+['"][^'"]*\/followThrough\.mjs['"]|import\s+['"][^'"]*\/followThrough\.mjs['"]/, `${file} imports the rules statically`);
  }
  // The one place they are loaded, behind the check.
  const names = executableSource(componentSource('functions/shared/followThroughNames.mjs'));
  const loader = region(names, 'export const loadFollowThrough =', '};', 'the loader');
  assert.match(loader, /if \(!hasFollowThrough\(fields\)\) return null;[\s\S]*load\(\)/);
  assert.equal((names.match(/import\(/g) || []).length, 1);
  // Run: a question with no followThrough calls no loader at all.
  let loads = 0;
  const load = async () => { loads += 1; return followThroughRules; };
  const plain = inequalityQuestion.answerFields.map(({ followThrough: _builds, ...own }) => own);
  assert.equal(loadFollowThrough(plain, load), null);
  assert.equal(loadFollowThrough([], load), null);
  assert.equal(loadFollowThrough(undefined, load), null);
  assert.equal(loads, 0);
  // One that has one loads the rules.
  assert.equal(await loadFollowThrough(fields, load), followThroughRules);
  // Every screen that needs them asks for them through the hook.
  for (const file of ['src/MultiAnswerGrader.jsx', 'src/QuestionEngine.jsx', 'src/components/question/RichQuestionRuntime.jsx',
    'src/components/student/PathResponseFields.jsx', 'src/components/assessment/SecureExamReview.jsx']) {
    assert.match(executableSource(componentSource(file)), /useFollowThroughRules\(/, file);
  }
});

test('a followThrough question is never marked without the rules, and its submit waits for them', () => {
  const answers = { slope: '-3', inequality: 'y > -3x + 3' };
  // The screen's grader before the rules arrive: not complete, so not submittable, and no verdict on the part.
  const before = gradeMultiAnswerResponse(inequalityQuestion, answers);
  assert.equal(before.isComplete, false);
  assert.equal(before.parts.find((part) => part.id === 'inequality').isCorrect, false);
  // Each part still says it has an answer, so part by part reopens where the student was.
  assert.deepEqual(before.parts.map((part) => part.isComplete), [true, true]);
  const after = gradeMultiAnswerResponse(inequalityQuestion, answers, { followThrough: followThroughRules });
  assert.equal(after.isComplete, true);
  assert.equal(after.parts.find((part) => part.id === 'inequality').isCorrect, true);
  // The ordinary entry point refuses to mark it without them rather than guess.
  const response = normalizeOrdinaryResponse({ question: inequalityQuestion, answerState: { parts: after.parts } });
  const refused = gradeOrdinaryResponse({ question: inequalityQuestion, response });
  assert.equal(refused.graded, false);
  assert.equal(refused.reason, 'incomplete-response');
  // Pre-Flight's light key check, which loads no rules, calls such a question unchecked, never passed.
  assert.deepEqual(lightRecoveryKeyCheck(inequalityQuestion, { answer: { kind: 'fields', value: { slope: '-2', inequality: 'y > -2x + 3' } } }), { checked: false });
  assert.equal(gradeOrdinaryResponse({ question: inequalityQuestion, response, followThrough: followThroughRules }).graded, true);
  // A question with no followThrough is marked without them, as always.
  const plain = { ...inequalityQuestion, answerFields: inequalityQuestion.answerFields.map(({ followThrough: _builds, ...own }) => own) };
  assert.equal(gradeMultiAnswerResponse(plain, answers).isComplete, true);

  // The hosts: MultiAnswerGrader grades with the rules it loaded; QuestionEngine
  // holds Submit (disabled and busy) while they load, and will not submit.
  const grader = executableSource(componentSource('src/MultiAnswerGrader.jsx'));
  assert.match(grader, /const followThrough = useFollowThroughRules\(safeFields\)/);
  assert.match(grader, /gradeMultiAnswerResponse\(\{ \.\.\.question, answerFields: safeFields \}, answers, \{ followThrough: followThroughRules \}\)/);
  const engine = executableSource(componentSource('src/QuestionEngine.jsx'));
  assert.match(engine, /const followThroughLoading = followThrough\.pending;/);
  assert.match(region(engine, 'const performSubmit = async () => {', 'submissionInFlightRef.current = true;', 'performSubmit'), /if \(!answerState\.isComplete \|\| followThroughLoading \|\|/);
  assert.match(engine, /const submitDisabled = !answerState\.isComplete \|\| followThroughLoading \|\|/);
  assert.match(engine, /submitDisabled: !answerState\.isComplete \|\| followThroughLoading \|\|/);
  assert.match(engine, /aria-busy=\{followThroughLoading \|\| undefined\}/);
  // A secure field item's action waits too.
  const runtime = executableSource(componentSource('src/components/question/RichQuestionRuntime.jsx'));
  assert.match(runtime, /const enabled = complete && !locked && !followThrough\.pending;/);
  assert.match(runtime, /if \(navigationMode \|\| !complete \|\| locked\) return;\s*(?:\/\/[^\n]*\n\s*)?if \(followThrough\.pending\) return;/);
  // The server's graders always hand them in.
  const dispatch = executableSource(componentSource('functions/shared/serverGrading/questionResponseGrading.mjs'));
  assert.match(dispatch, /import \* as followThrough from '\.\.\/followThrough\.mjs';/);
  assert.match(dispatch, /gradeOrdinaryResponse\(\{ question, response, followThrough \}\)/);
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
