/*
 * "PRACTISE ONE LIKE THIS" CHECKS THE ANSWERS THAT HAVE A FIXED SHAPE (CT13).
 *
 * After #520 made "the line through two points" checkable, 5 (counted again on
 * the lessons as they are now: 6) sibling answers could still not be checked,
 * so a student who typed the right answer got "compare it with the worked
 * solution" and no mark. Five of the six are closed lists of numbers and
 * directions, so a COMPLETE reading of the key and of what the student typed
 * is a certain one:
 *
 *   a mapping       "-5 → 7, 2 → -6, 9 → 7, 9 → 4"                      DOL #1 (Technology Graph Analysis) Practice
 *   solutions       "x = -5 or x = -3"                                  DOL #2 review Classwork 6
 *   asymptotes      "g: asymptotes vertical x = -3, horizontal y = 2"   Honors M1 L2 Day 1 Classwork
 *   a shift         "4 units to the right"                              Honors M1 L2 Day 2 Classwork and Practice
 *   a graph         "The graph through (0, -12), (1, -8), (2, -4)"      the sample lesson
 *
 * Whatever the reader cannot take apart completely is COMPARE, never INCORRECT.
 * The one part left in words is the function-test sentence of the DOL #1 item
 * ("fails the function test"): a free sentence, so a verdict would be a guess
 * (the owner's FB07 decision stands for it).
 *
 * The typed strings below are what a real MathLive box held after the keys
 * were pressed (captured in Chromium): spaces are dropped, "or" and "and"
 * become \lor and \land, and "the" and "shifts" become \operatorname{\mathrm{th}}e
 * and \operatorname{\mathrm{sh}}ifts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
  checkPracticePart,
  readPracticeAnswer,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';

const { CORRECT, INCORRECT, COMPARE, BLANK } = PRACTICE_VERDICT;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const part = (line, index = 0) => readPracticeAnswer(line).parts[index];
const verdict = (line, typed, index = 0) => checkPracticePart(part(line, index), typed);
const all = (line, typed, want, index = 0) => typed.forEach((entry) => assert.equal(verdict(line, entry, index), want, `${JSON.stringify(entry)} for "${line}"`));

test('a mapping is read as a set of arrows, and checked as one', () => {
  const key = 'arrows -5 → 7, 2 → -6, 9 → 7, 9 → 4';
  const read = part(key);
  assert.equal(read.kind, 'mapping');
  assert.equal(read.checkable, true);
  assert.equal(read.label, 'Arrows, input → output');
  all(key, [
    '-5 → 7, 2 → -6, 9 → 7, 9 → 4',
    '9 → 4, 9 → 7, 2 → -6, -5 → 7',
    '-5->7, 2->-6, 9->7, 9->4',
    '−5 → 7, 2 → −6, 9 → 7, 9 → 4',
    '-5\\to7,2\\to-6,9\\to7,9\\to4',
    '-5\\rightarrow7,2\\rightarrow-6,9\\rightarrow7,9\\rightarrow4',
    '-5 → 7, 2 → -6, 9 → 7, 9 → 4, 9 → 4',
    // The same relation written as ordered pairs is the same arrows.
    '(-5, 7), (2, -6), (9, 7), (9, 4)',
    '\\left(-5,7\\right),\\left(2,-6\\right),\\left(9,7\\right),\\left(9,4\\right)',
  ], CORRECT);
  all(key, [
    '-5 → 7, 2 → -6, 9 → 7',
    '-5 → 7, 2 → -6, 9 → 7, 9 → 4, 9 → 5',
    '7 → -5, -6 → 2, 7 → 9, 4 → 9',
    '-5 → 7, 2 → -6, 9 → 7, 9 → 3',
    '(-5, 7), (2, -6), (9, 7)',
  ], INCORRECT);
  // Not completely read: left to the student, never called wrong.
  all(key, ['five goes to seven', '-5 → seven, 2 → -6', '-5 → 7 → 9', 'x → 7, 2 → -6', '(-5, 7', '-5 →, 2 → -6', 'anything'], COMPARE);
  assert.equal(verdict(key, ''), BLANK);
  // Rosters with an ellipsis stay words: no complete reading exists.
  assert.equal(part('domain {0, 1, 2, ..., 40}').checkable, false);
});

test('several solutions are a set of numbers: any order, any of the ways a student writes them', () => {
  const key = 'x = -5 or x = -3';
  const read = part(key);
  assert.equal(read.kind, 'solutions');
  assert.equal(read.checkable, true);
  assert.equal(read.label, 'Solutions');
  all(key, [
    'x = -5 or x = -3', '-3 or -5', 'x=-3, x=-5', '-5, -3', 'x=-5; x=-3', 'x = -5 and x = -3', '-5 and -3',
    '\\{-5,-3\\}', '{-5,-3}', 'x=-5\\text{ or }x=-3',
    // What a math box holds after "x=-5 or x=-3", "x=-5 and x=-3" and "-5 or -3" are typed.
    'x=-5\\lor x=-3', 'x=-3\\lor x=-5', 'x=-5\\land x=-3', '-5\\lor-3', 'x=-5orx=-3',
    'x=-5, x=-5, x=-3',
  ], CORRECT);
  all(key, ['x=-5', '-5', 'x=5 or x=3', 'x=-5 or x=-4', '-5, -3, 2', 'x=-3'], INCORRECT);
  all(key, ['no solution', 'x=-5 or x=', 'x^2=25', 'y=-5 or y=-3', 'x<-3', 'five or three'], COMPARE);
  assert.equal(verdict(key, ''), BLANK);
  // Fractions and decimals are numbers.
  const halves = 'x = -1/2 or x = 3/2';
  assert.equal(part(halves).kind, 'solutions');
  all(halves, ['x=\\frac{3}{2}\\lor x=-\\frac{1}{2}', '1.5, -0.5', '-1/2 or 3/2'], CORRECT);
  all(halves, ['x=\\frac{3}{2}', '1.5, 0.5'], INCORRECT);
  // One solution is an ordinary value, as before; an inequality joined by "or" is not read as solutions.
  assert.equal(part('x = 4').kind, 'value');
  assert.equal(part('x < 2 or x > 5').kind, 'words');
});

test('asymptotes are a set of lines: x = a number is vertical, y = a number is horizontal', () => {
  const key = 'g: asymptotes vertical x = -3, horizontal y = 2';
  const read = part(key);
  assert.equal(read.kind, 'asymptotes');
  assert.equal(read.checkable, true);
  assert.equal(read.label, 'Asymptotes of g, as equations');
  all(key, [
    'x=-3, y=2', 'y=2, x=-3', 'x = -3 and y = 2', 'vertical x = -3, horizontal y = 2', 'g: x=-3, y=2', 'g(x): x=-3, y=2',
    'vertical asymptote x = -3 and horizontal asymptote y = 2', 'x=-3\\text{ and }y=2', 'x=-3;y=2', 'x=-3,y=2.0',
    // A math box turns the "or" inside "horizontal" into \lor.
    'verticalx=-3,h\\lor izontaly=2', 'x=-3\\land y=2', 'x=-3,y=2,y=2',
  ], CORRECT);
  all(key, ['x=-3', 'y=2', 'x=3, y=2', 'x=-3, y=-2', 'x=2, y=-3', 'x=-3, y=2, y=0', 'x=-3, x=-2, y=2'], INCORRECT);
  // A word that contradicts its equation, an equation of another shape, or words with no equation.
  all(key, ['horizontal x = -3, vertical y = 2', 'x+3=0, y=2', 'x=-3 and the y-axis', 'none', 'x=-3, y=2 and more'], COMPARE);
  // One asymptote, or a different name.
  const single = 'h: asymptotes horizontal y = -1';
  assert.equal(part(single).label, 'Asymptotes of h, as equations');
  all(single, ['y=-1', 'horizontal y = -1', 'h: y=-1'], CORRECT);
  all(single, ['y=1', 'x=-1', 'y=-1, x=0'], INCORRECT);
  // An asymptote named beside others in one answer line is a part of its own.
  assert.deepEqual(readPracticeAnswer('g: asymptotes vertical x = -3, horizontal y = 2; h: asymptotes horizontal y = -1; p: asymptotes vertical x = 4').parts.map((entry) => entry.label), ['Asymptotes of g, as equations', 'Asymptotes of h, as equations', 'Asymptotes of p, as equations']);
});

test('a shift is a distance and a direction: both must agree', () => {
  const key = 'Horizontal: 4 units to the right; Vertical: 1 unit down';
  const horizontal = part(key, 0);
  const vertical = part(key, 1);
  assert.deepEqual([horizontal.kind, horizontal.label, horizontal.checkable], ['shift', 'Horizontal', true]);
  assert.deepEqual([vertical.kind, vertical.label, vertical.checkable], ['shift', 'Vertical', true]);
  all(key, [
    '4 units to the right', '4 units right', '4 right', 'right 4', 'right by 4 units', 'to the right 4 units', '4 units rightward',
    'shifts 4 units to the right', 'the graph moves 4 units to the right', 'Horizontal: 4 units right', 'four units right', '4.0 units right',
    '\\text{4 units to the right}', '\\text{4 units right.}',
    // What a math box holds after those words are typed.
    '4unitsto\\operatorname{\\mathrm{th}}eright', 'right4', '\\operatorname{\\mathrm{sh}}ifts4unitsright', '\\operatorname{\\mathrm{th}}egraphmoves4unitsright',
  ], CORRECT, 0);
  all(key, ['4 units left', '5 units right', 'right 3', '4 units up', 'left 4', 'three units right', '4 units to the left'], INCORRECT, 0);
  all(key, [
    '4', 'right', '4 units', '-4 units right', '+4 right', '4 units right and 2 up', '4 units to the right or left', 'a few units right',
    'x+4', '4 units horizontally', '4 units, right', 'not 4 units right', '4 units right of the y-axis', 'f(x-4)',
  ], COMPARE, 0);
  all(key, ['1 unit down', 'down 1', '1 down', 'down by one unit', '\\operatorname{\\mathrm{th}}egraphmovesdown1'], CORRECT, 1);
  all(key, ['1 unit up', '2 units down', 'up 1'], INCORRECT, 1);
  assert.equal(verdict(key, '', 0), BLANK);
  // A bare "6 units to the left" with no label is a shift too, and the plural reads the same.
  assert.equal(part('6 units to the left').kind, 'shift');
  assert.equal(part('1 unit to the left').shift.amount, 1);
  // Words that are not a distance and a direction stay words.
  assert.equal(part('rises, then falls').checkable, false);
  assert.equal(part('Horizontal: a little to the right').checkable, false);
});

test('the graph of a linear function, named by its points, is checked as that line', () => {
  const key = 'The graph through (-2, -20), (-1, -16), (0, -12), (1, -8), (2, -4)';
  const read = part(key);
  assert.equal(read.kind, 'line');
  assert.equal(read.checkable, true);
  assert.equal(read.expected, '(-2, -20), (-1, -16), (0, -12), (1, -8), (2, -4)', 'all five are shown as the answer');
  all(key, [
    'y=4x-12', 'f(x)=4x-12', 'f\\left(x\\right)=4x-12', '4x-y=12', 'y-4x=-12', 'x=\\frac{y+12}{4}',
    '(0,-12),(1,-8)', '(3, 0), (-5, -32)', '(-2, -20), (-1, -16), (0, -12), (1, -8), (2, -4)', '(0, -12), (3, 0), (4, 4)',
  ], CORRECT);
  all(key, ['y=4x-11', 'y=4x', 'y=-4x-12', '(0,-12),(1,-7)', '(0,-12),(0,-12)', '(0, -12)', 'y=x^2-12', '(0,-12),(1,-8),(2,-3)'], INCORRECT);
  // Points that are not on one line name a curve, and a curve is words. Two points are not enough to say a line.
  assert.equal(part('The graph through (-2, 3), (-1, 0), (0, -1), (1, 0), (2, 3)').checkable, false);
  assert.equal(part('The graph through (0, 1) and (1, 3)').checkable, false);
  assert.equal(part('The curve through (0, 1), (1, 3), (2, 5)').checkable, false);
  assert.equal(part('The graph through (0, 1), (1, 3), (2, 5)').kind, 'line');
  // A line named by two points keeps its rule: exactly the two it names, not three.
  assert.equal(part('The line through (0, 2), (1, 3), (2, 4)').checkable, false);
  assert.equal(verdict('The line through (0, 2) and (-4, 0)', '(0, 2), (-4, 0), (4, 4)'), CORRECT, 'more points of the line are fine');
  assert.equal(verdict('The line through (0, 2) and (-4, 0)', '(0, 2), (-4, 0), (4, 5)'), INCORRECT, 'but each must be on it');
});

test('a part written in words is still never judged', () => {
  const answer = 'passes the function test';
  const read = part(answer);
  assert.equal(read.kind, 'words');
  assert.equal(read.checkable, false);
  ['passes the function test', 'it is a function', 'no', 'anything'].forEach((typed) => assert.equal(checkPracticePart(read, typed), COMPARE, typed));
  // A sibling with a mapping and a sentence: the mapping gets its box and mark, the sentence is compared.
  const practice = readPracticeAnswer('arrows -5 → 7, 2 → -6, 9 → 7, 9 → 4; fails the function test');
  assert.deepEqual(practice.parts.map((entry) => [entry.kind, entry.checkable]), [['mapping', true], ['words', false]]);
  assert.equal(practice.checkable, true);
  assert.equal(practice.wordsOnly.length, 1);
  const checked = checkPracticeAnswers(practice, { 'part-1': '-5\\to7,2\\to-6,9\\to7,9\\to4' });
  assert.equal(checked.allCorrect, true);
  assert.deepEqual(checked.parts.map((entry) => entry.verdict), [CORRECT, COMPARE]);
});

/* ------------------------------------------------- the six real items */

// Where each one lives, and what is left in words in it (the record of why).
const ITEMS = [
  { file: 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json', id: 'q_section-3_3_9', kinds: ['mapping'], inWords: ['fails the function test', 'passes the function test'] },
  { file: 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json', id: 'dol2r-cw-6', kinds: ['solutions'], inWords: [] },
  { file: 'teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json', id: 'q_classwork-2_2_8', kinds: ['asymptotes'], inWords: [] },
  { file: 'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json', id: 'q_classwork-2_2_5', kinds: ['shift'], inWords: [] },
  { file: 'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json', id: 'q_practice-3_3_4', kinds: ['shift'], inWords: [] },
  { file: 'SAMPLE_AUTHORING_INTENT_V5.json', id: 'q_classwork-2_2_2', kinds: ['line'], inWords: [] },
];
const SEEDS = 60;

const lessonItem = ({ file, id }) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(`${ROOT}${file}`, 'utf8')));
  const question = compiled.package.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === id);
  assert.ok(question, `${id} is in ${file}`);
  return question;
};

test('the six items that could not be checked are checked: every sibling part with a fixed shape has a box and a mark', () => {
  ITEMS.forEach((item) => {
    const question = lessonItem(item);
    const kinds = new Set();
    const leftInWords = new Set();
    let siblings = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const practice = buildPracticeLikeThis(question, { seed });
      assert.ok(practice, `${item.id} seed ${seed}: a sibling is offered`);
      siblings += 1;
      assert.equal(practice.checkable, true, `${item.id}: ${practice.prompt} has a part that can be checked`);
      // The sibling's own answer, typed part by part, is right where it can be judged and never wrong anywhere.
      const result = checkPracticeAnswers(practice, Object.fromEntries(practice.parts.map((entry) => [entry.id, entry.expected])));
      practice.parts.forEach((entry, index) => {
        const mark = result.parts[index].verdict;
        if (entry.checkable) {
          kinds.add(entry.kind);
          assert.equal(mark, CORRECT, `${item.id}: its own answer "${entry.expected}" is right`);
        } else {
          leftInWords.add(entry.expected);
          assert.equal(mark, COMPARE, `${item.id}: "${entry.expected}" is compared, not judged`);
        }
      });
    }
    assert.equal(siblings, SEEDS);
    assert.deepEqual([...kinds].sort(), item.kinds, `${item.id}: the parts checked`);
    assert.deepEqual([...leftInWords].sort(), item.inWords, `${item.id}: what is left in words`);
  });
});

test('the sibling of each item is checked part by part: a wrong box gets a mark, a right one gets a mark', () => {
  const dol1 = buildPracticeLikeThis(lessonItem(ITEMS[0]), { seed: 0 });
  const arrows = dol1.parts[0].expected;
  assert.equal(checkPracticeAnswers(dol1, { 'part-1': arrows }).parts[0].verdict, CORRECT);
  assert.equal(checkPracticeAnswers(dol1, { 'part-1': '1 → 1' }).parts[0].verdict, INCORRECT);

  const shifts = buildPracticeLikeThis(lessonItem(ITEMS[3]), { seed: 0 });
  assert.equal(shifts.prompt, 'Describe the horizontal and vertical translations of g(x) = f(x - 4) - 2 from y = f(x).');
  const wrongWay = checkPracticeAnswers(shifts, { 'part-1': '4 units left', 'part-2': '2 units down' });
  assert.deepEqual(wrongWay.parts.map((entry) => entry.verdict), [INCORRECT, CORRECT]);
  assert.equal(wrongWay.allCorrect, false);
  const right = checkPracticeAnswers(shifts, { 'part-1': '4unitsto\\operatorname{\\mathrm{th}}eright', 'part-2': 'down2' });
  assert.deepEqual(right.parts.map((entry) => entry.verdict), [CORRECT, CORRECT]);
  assert.equal(right.allCorrect, true);

  const absolute = buildPracticeLikeThis(lessonItem(ITEMS[1]), { seed: 0 });
  assert.equal(absolute.prompt, 'Solve 3|3x + 12| + 2 = 11.');
  assert.equal(checkPracticeAnswers(absolute, { 'part-1': 'x=-3\\lor x=-5' }).allCorrect, true);
  assert.equal(checkPracticeAnswers(absolute, { 'part-1': 'x=3\\lor x=5' }).parts[0].verdict, INCORRECT);
});
