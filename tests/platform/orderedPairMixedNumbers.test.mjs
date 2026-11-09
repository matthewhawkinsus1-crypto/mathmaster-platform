// A MIXED NUMBER IN A COORDINATE (platform-polish-3; F-PAIR-MIXED in the
// 2026-11-06 Algebra I M3 T2 walkthrough).
//
// A number box takes 1⅓ written `1 1/3` (or with the editor's fraction
// template, `1\frac{1}{3}`) for 4/3 (GR13). An ordered pair refused the same
// number in a coordinate on every surface: "(1 1/3, 1 2/3)" for (4/3, 5/3),
// "(−5 1/3, 2 1/3)" for (−16/3, 7/3) and "(1 2/5, 2/5)" for (7/5, 2/5) were
// wrong in the lessons, on Path and on tests. A pair box now reads each
// coordinate as a lone number box reads it:
//
//   - a proper mixed number is whole + fraction, its sign covering both;
//   - never the product reading (review B2: (1½, 4) is not (½, 4));
//   - a key coordinate written as a mixed number asks for one (GR13);
//   - only in a pair: an interval keeps wave 7's reading (decision 4).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fieldValueOptions, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { compareOrderedPair, matchesFieldAnswer, parseOrderedPair } from '../../functions/shared/answerUtils.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { checkLinearIntercept } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { parsePointList } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

/**
 * Every surface's verdict on one pair field, as
 * [secure test, Path and Live Challenge, teacher's Path simulation,
 *  lesson field (answerFormat), bank field in an assignment (inputProfile),
 *  orderedPair question with its two coordinate marks].
 */
const verdicts = async (response, key) => {
  const definition = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', inputProfile: 'orderedPair', expected: key }] });
  const secure = (await secureItems.gradeItem(definition, { responses: { answer: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { answer: response } })).isCorrect === true;
  // The teacher's Path simulation asks sameValue with the stored field's options.
  const stored = definition.fields[0];
  const simulation = sameValue(response, stored.expected, stored.numericTolerance, fieldValueOptions(stored));
  const lesson = matchesFieldAnswer(response, { id: 'answer', answer: key, answerFormat: 'orderedPair' });
  const bank = matchesFieldAnswer(response, { id: 'answer', answer: key, inputProfile: 'orderedPair' });
  const question = gradeOrdinaryResponse({ question: { type: 'orderedPair', answer: key }, response: { kind: 'value', value: response } });
  return [secure, path, simulation, lesson, bank, question.isCorrect === true];
};
const ALL_RIGHT = [true, true, true, true, true, true];
const ALL_WRONG = [false, false, false, false, false, false];

test('the walkthrough\'s pairs, written with mixed numbers, are right on every surface', async () => {
  for (const [response, key] of [
    ['(1 1/3, 1 2/3)', '(4/3,5/3)'],
    ['(1\\frac{1}{3},1\\frac{2}{3})', '(4/3,5/3)'],
    ['\\left(1\\frac13,1\\frac23\\right)', '(4/3,5/3)'],
    ['(1 1/3, 5/3)', '(4/3,5/3)'],
    ['(−5 1/3, 2 1/3)', '(-16/3, 7/3)'],
    ['(-5\\frac{1}{3},2\\frac{1}{3})', '(-16/3, 7/3)'],
    ['(1 2/5, 2/5)', '(7/5,2/5)'],
    ['(1 2/5, 0.4)', '(7/5,2/5)'],
    ['(2 1/2, -3)', '(2.5,-3)'],
  ]) {
    assert.deepEqual(await verdicts(response, key), ALL_RIGHT, `${response} for ${key}`);
  }
});

test('a near miss written with mixed numbers stays wrong, and the product reading never returns', async () => {
  for (const [response, key] of [
    // The coordinates swapped; the numerator taken for the whole part.
    ['(1 2/3, 1 1/3)', '(4/3,5/3)'],
    ['(4 1/3, 5 1/3)', '(4/3,5/3)'],
    // The sign on the whole part only: −5 + ⅓ is −4⅔, not −16/3.
    ['(-4 2/3, 2 1/3)', '(-16/3, 7/3)'],
    ['(5 1/3, 2 1/3)', '(-16/3, 7/3)'],
    // Review B2's product readings: 1·½ and 2·½.
    ['(1\\frac{1}{2},4)', '(\\frac{1}{2},4)'],
    ['(2 1/2,4)', '(1,4)'],
    // A whole number with an improper fraction is no mixed number.
    ['(1 4/3, 2)', '(7/3,2)'],
  ]) {
    assert.deepEqual(await verdicts(response, key), ALL_WRONG, `${response} for ${key}`);
  }
});

test('each coordinate is marked on its own: a right mixed x beside a wrong y', () => {
  const graded = gradeOrdinaryResponse({ question: { type: 'orderedPair', answer: [4 / 3, 5 / 3] }, response: { kind: 'value', value: '(1 1/3, 1 1/3)' } });
  assert.equal(graded.graded, true, 'a pair with mixed numbers is a complete answer');
  assert.deepEqual(graded.parts.map((part) => part.isCorrect), [true, false]);
  assert.equal(graded.isCorrect, false);
  const system = gradeOrdinaryResponse({ question: { type: 'system', solution: [-16 / 3, 7 / 3] }, response: { kind: 'value', value: '(-5 1/3, 2 1/3)' } });
  assert.equal(system.isCorrect, true);
});

test('the tools that read a typed point read a mixed coordinate too', () => {
  assert.deepEqual(parseOrderedPair('(1 1/2, -2 1/4)'), [1.5, -2.25]);
  // Step Algebra's intercept check: 3x + 2y = 7 crosses the x-axis at (7/3, 0).
  assert.equal(checkLinearIntercept({ A: 3, B: 2, C: 7 }, 'x', '(2 1/3, 0)'), true);
  assert.equal(checkLinearIntercept({ A: 3, B: 2, C: 7 }, 'x', '(3 1/3, 0)'), false);
  // The workflow's point lists.
  assert.deepEqual(parsePointList('(1 1/2, 0), (-2 1/2, 0)'), [[1.5, 0], [-2.5, 0]]);
});

test('a key coordinate written as a mixed number asks for a mixed number, as a lone key does (GR13)', async () => {
  for (const response of ['(1 1/3, 2)', '(1\\frac{1}{3},2)']) {
    assert.deepEqual(await verdicts(response, '(1 1/3, 2)'), [true, true, true, true, true, false], response);
  }
  for (const response of ['(4/3, 2)', '(1.3333333, 2)']) {
    assert.deepEqual((await verdicts(response, '(1 1/3, 2)')).slice(0, 5), [false, false, false, false, false], response);
  }
  // (An orderedPair question cannot be keyed so: Pre-Flight refuses a key it
  // cannot read as two numbers, and orderedPairKey reads no mixed number.)
});

test('only a pair: an interval keeps wave 7\'s reading, and the field\'s declared kind decides', async () => {
  // An interval box keeps decision 4's refusal, on Path and in an assignment.
  const definition = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', inputProfile: 'interval', expected: '(3/2, 4)' }] });
  assert.equal((await mathPath.gradeResponse(definition, { responses: { answer: '(1 1/2, 4)' } })).isCorrect, false);
  assert.equal(matchesFieldAnswer('(1 1/2, 4)', { answer: '(3/2, 4)', inputProfile: 'interval' }), false);
  assert.equal(fieldValueOptions({ inputProfile: 'interval' }).orderedPair, undefined);
  // The field's declared kind decides, read as a number box's is (the first
  // stored kind), on every surface that keeps it.
  assert.equal(fieldValueOptions({ inputProfile: 'orderedPair' }).orderedPair, true);
  assert.equal(fieldValueOptions({ answerFormat: 'orderedPair' }).orderedPair, true);
  assert.equal(fieldValueOptions({ inputProfile: 'expression', answerFormat: 'orderedPair' }).orderedPair, undefined);
  assert.equal(compareOrderedPair('(1 1/3, 1 2/3)', ['4/3', '5/3']), true);
});

test('every lesson pair whose key has an improper fraction takes its mixed-number spelling, through the import and the server\'s grader', () => {
  const files = [
    'T2_L1_Solving_Systems_by_Graphing.json',
    'T2_L1_Solving_Systems_by_Graphing_Honors.json',
    'T2_L2_Solving_Systems_by_Substitution.json',
    'T2_L2_Solving_Systems_by_Substitution_Honors.json',
  ];
  const mixedOf = (coordinate) => {
    const fraction = /^(-?)(\d+)\/(\d+)$/.exec(coordinate.trim());
    if (!fraction || Number(fraction[2]) <= Number(fraction[3])) return null;
    const [sign, numerator, denominator] = [fraction[1], Number(fraction[2]), Number(fraction[3])];
    return `${sign}${Math.floor(numerator / denominator)} ${numerator % denominator}/${denominator}`;
  };
  let checked = 0;
  for (const name of files) {
    const lesson = parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/algebra1-module3/${name}`, import.meta.url), 'utf8'));
    for (const question of lesson.questions) {
      for (const field of question.answerFields || []) {
        if (field.answerFormat !== 'orderedPair' || typeof field.answer !== 'string') continue;
        const coordinates = field.answer.replace(/^\(|\)$/g, '').split(',');
        const mixed = coordinates.map(mixedOf);
        if (!mixed.some(Boolean)) continue;
        const written = `(${coordinates.map((coordinate, index) => mixed[index] || coordinate.trim()).join(', ')})`;
        const grade = (value) => gradeOrdinaryResponse({ question, response: { kind: 'fields', fields: [{ id: field.id, value }] } })
          .parts.find((part) => part.id === field.id)?.isCorrect;
        assert.equal(grade(written), true, `${name} ${question.id}: ${written} for ${field.answer}`);
        assert.equal(grade(`(${[...coordinates].reverse().map((coordinate, index) => mixed[1 - index] || coordinate.trim()).join(', ')})`), false, `${name} ${question.id}: swapped`);
        checked += 1;
      }
    }
  }
  // L1 Honors PR 7, L2 CW 13, L2 Honors CW 13 and PR 9.
  assert.ok(checked >= 4, `${checked} lesson pairs checked`);
});
