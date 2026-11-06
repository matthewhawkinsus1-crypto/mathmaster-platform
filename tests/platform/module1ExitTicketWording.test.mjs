/*
 * EXIT TICKETS, WORDING ONLY, AND A PRACTICE UNION WITH A BOUNDED PIECE
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 1, "Exit
 * tickets and Warm-Ups").
 *
 *   - L1 Day 1 exit ticket 3 asked to "state the domain and range and decide
 *     whether it is a function"; its tool also asks for the mapping. It now
 *     says "Build the mapping for the relation …", as CW 6 does.
 *   - The ALEKS bridge's exit ticket 1 (y = −2|x + 3| + 1) gave the reason
 *     "This treats a factor outside f like one inside" on an item with bars and
 *     no f. It says "outside the bars".
 *   - L1 Day 1 exit ticket 1 (x < −1 or 2 ≤ x ≤ 5) was the first union with a
 *     bounded piece. Practice 2 now has one: x ≤ −4 or 1 ≤ x < 6, keyed
 *     (−∞, −4] ∪ [1, 6) by hand and graded here by the shared grader.
 *
 * Recovery binds to exit-ticket items: their keys do not change, and the family
 * bound to each still recognizes it with the same constraints (its
 * certification runs in recoveryRelationFamilies.test.mjs and
 * recoveryTransformationLanguageFamilies.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';

const lesson = (path) => parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-module1/${path}`, import.meta.url), 'utf8')).questions;
const DAY1 = lesson('L1_Day1_Interval_Domain_Range.json');
const ALEKS = lesson('L1_Absolute_Value_ALEKS_Bridge_20260828.json');
const questionIn = (questions, id) => {
  const found = questions.find((question) => question.questionId === id);
  assert.ok(found, id);
  return found;
};

test('L1 Day 1 exit ticket 3 names the mapping its tool asks for; its relation, its parts and its Recovery are unchanged', () => {
  const ticket = questionIn(DAY1, 'q_dol-4_4_3');
  assert.equal(ticket.prompt, 'Build the mapping for the relation {(−1, 3), (2, 0), (4, 3), (7, −2)}. Then state the domain and range and decide whether the relation is a function.');
  assert.match(questionIn(DAY1, 'q_classwork-2_2_6').prompt, /^Build the mapping for the relation \{.*\}\. Then state the domain and range and decide whether the relation is a function\.$/, 'worded as CW 6');
  const pairs = ticket.pairs.map((pair) => (Array.isArray(pair) ? pair : [pair.x, pair.y]));
  assert.deepEqual(pairs, [[-1, 3], [2, 0], [4, 3], [7, -2]]);
  assert.deepEqual([...ticket.ask].sort(), ['domain', 'isFunction', 'mapping', 'range']);
  const recognized = getPlatformQuestionFamily('relations.mappingDiagram').recognize(ticket);
  assert.deepEqual(recognized?.constraints, { ask: 'mappingDomainRangeFunction', relation: 'sharedOutput', pairCount: 4 });
});

test('the ALEKS bridge exit ticket 1 gives its scale reason in terms of the bars; options, key and Recovery unchanged', () => {
  const ticket = questionIn(ALEKS, 'q_dol-absolute-value_4_1');
  const scale = ticket.answerFields.find((field) => field.id === 'scale');
  assert.deepEqual([scale.options, scale.answer], [['stretch by 2', 'compression by 1/2', 'unchanged'], 'stretch by 2']);
  assert.match(scale.optionRationales['compression by 1/2'], /outside the bars like one inside/);
  // The item has bars and no f: no reason on it speaks of f.
  ticket.answerFields.forEach((field) => Object.values(field.optionRationales || {})
    .forEach((reason) => assert.doesNotMatch(reason, /\bf\b/, `${field.id}: ${reason}`)));
  const recognized = getPlatformQuestionFamily('absoluteValue.analyzeTransformed').recognize(ticket);
  assert.deepEqual(recognized?.params, { a: 2, h: -3, k: 1 });
});

// The work the Interval Number Line sends for these pieces, with the notation typed.
const NEG_INF = -Infinity;
const notationOf = (pieces) => pieces.map(({ min, max, minClosed, maxClosed }) => (
  `${Number.isFinite(min) && minClosed ? '[' : '('}${Number.isFinite(min) ? min : '-∞'}, ${Number.isFinite(max) ? max : '∞'}${Number.isFinite(max) && maxClosed ? ']' : ')'}`
)).join(' ∪ ');
const graded = (question, pieces) => gradeServerResponse({
  question,
  response: buildToolResponse({ question, toolId: 'intervalNumberLine', work: { intervals: pieces, notation: notationOf(pieces) } }),
});

test('L1 Day 1 practice 2 has a bounded piece, keyed (−∞, −4] ∪ [1, 6) and graded so by the shared grader', () => {
  const practice = questionIn(DAY1, 'q_practice-3_3_2');
  assert.equal(practice.prompt, 'Graph x ≤ −4 or 1 ≤ x < 6 and write the compound interval in interval notation.');
  // Worked by hand: x ≤ −4 includes −4 (closed, unbounded to the left); 1 ≤ x < 6 includes 1 and not 6.
  const key = [
    { min: NEG_INF, max: -4, minClosed: false, maxClosed: true },
    { min: 1, max: 6, minClosed: true, maxClosed: false },
  ];
  assert.deepEqual(practice.intervals.map(({ min, max, minClosed, maxClosed }) => ({ min: min ?? NEG_INF, max, minClosed, maxClosed })), key);
  assert.equal(notationOf(key), '(-∞, -4] ∪ [1, 6)');
  const right = graded(practice, key);
  assert.equal(right.isCorrect, true, JSON.stringify(right).slice(0, 300));
  // Each end the other way, and the old unbounded second piece, are refused.
  [
    [{ ...key[0], maxClosed: false }, key[1]],
    [key[0], { ...key[1], minClosed: false }],
    [key[0], { ...key[1], maxClosed: true }],
    [key[0], { min: 3, max: Infinity, minClosed: true, maxClosed: false }],
  ].forEach((wrong) => assert.notEqual(graded(practice, wrong).isCorrect, true, notationOf(wrong)));
  // Before the exit ticket, a Classwork or Practice union has a bounded piece.
  const bounded = DAY1.filter((question) => /^q_(classwork|practice)/.test(question.questionId))
    .filter((question) => (question.intervals || []).length === 2 && question.intervals.some(({ min, max }) => Number.isFinite(min) && Number.isFinite(max)));
  assert.deepEqual(bounded.map((question) => question.questionId), ['q_practice-3_3_2']);
});
