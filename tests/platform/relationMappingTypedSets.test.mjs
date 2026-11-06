/*
 * THE MAPPING DIAGRAM READS A DOMAIN THE WAY THE LESSON WRITES ONE.
 *
 * The 2026-11-06 walkthrough of Algebra II Honors Lesson 1
 * (docs/qa/2026-11-06-a2h-module1-walkthrough/part1.md, F-MAP-BRACES) typed a
 * relation's domain and range the way the item's own worked steps write them,
 * "{-3, 0, 2, 5}" and "{-2, 1, 4}", and was told "Not quite. … The domain is
 * not right" with a try used. The box split on commas and dropped "{-3" and
 * "5}", which are not numbers, so the set read as {0, 2}. A minus pasted from a
 * prompt that writes its pairs "(−2, 5)" was dropped the same way.
 *
 * Braces and the minus sign are notation, as the composed stages' own set
 * reader has it (workflowGrading.mjs parseSetAnswer). The box reads them now
 * (relationSets.mjs parseList, which the lab's Check, its registry grader and
 * My Math Path all read), and a wrong set is still wrong.
 *
 * The items: every Mapping Diagram in the walked lessons that asks for the
 * domain or the range, as a student's device gets it after import (Pre-Flight,
 * the stored record, QuestionEngine's generation).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { parseList } from '../../functions/shared/toolMath/relationMapping/relationSets.mjs';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { correctFunctionChoice } from '../../functions/shared/relationFunctionChoice.mjs';

const LESSONS = [
  'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json',
  'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json',
];
const asDevice = (path) => {
  const parsed = parseAssignmentBlueprintText(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  return getStoredAssignmentQuestions({ id: 'relation-typed-sets', ...canonicalV5PersistencePatch(model.assignmentV5) })
    .map((stored) => normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null)));
};
const RELATIONS = LESSONS.flatMap((path) => asDevice(path)
  .filter((question) => question.type === 'relationMapping')
  .filter((question) => question.ask.includes('domain') || question.ask.includes('range'))
  .map((question) => ({ path, question })));

// The set as the worked steps write it: braces, least to greatest.
const asSet = (values) => `{${values.join(', ')}}`;
const trueMinus = (text) => text.replace(/-/g, '−');

const relationOf = (question) => {
  const pairs = question.pairs.map(({ x, y }) => [x, y]);
  const domain = [...new Set(pairs.map(([x]) => x))].sort((a, b) => a - b);
  const range = [...new Set(pairs.map(([, y]) => y))].sort((a, b) => a - b);
  return { pairs, domain, range, isFunction: domain.length === pairs.length };
};

const gradeTyped = (question, domainText, rangeText) => {
  const { pairs, isFunction } = relationOf(question);
  return gradeToolWork({
    toolId: 'relationMapping',
    question,
    work: { arrows: pairs, plottedPoints: pairs, domainText, rangeText, isFunction: correctFunctionChoice(isFunction) },
  });
};
const partOf = (result, id) => result.parts.find((part) => part.id === id);

test('the walked lessons still hold the Mapping Diagram items that ask for a domain or range, some with negative values', () => {
  // Day 1 CW 6, PR 5 and the exit ticket; Day 2 WU 3, CW 4, PR 3 and the exit ticket.
  assert.equal(RELATIONS.length, 7, RELATIONS.map(({ question }) => question.questionId).join(', '));
  assert.ok(RELATIONS.filter(({ question }) => relationOf(question).domain.some((x) => x < 0)).length >= 5);
});

test('a domain and range typed with set braces, or with the true minus sign, are the same sets as the plain list', () => {
  let spellings = 0;
  for (const { path, question } of RELATIONS) {
    const { domain, range } = relationOf(question);
    const label = `${path.split('/').pop()} ${question.questionId}`;
    assert.equal(gradeTyped(question, domain.join(', '), range.join(', ')).isCorrect, true, `${label}: the plain list`);
    for (const [name, write] of [
      ['in braces', asSet],
      ['in braces, no spaces', (values) => `{${values.join(',')}}`],
      ['with the true minus', (values) => trueMinus(values.join(', '))],
      ['in braces, with the true minus', (values) => trueMinus(asSet(values))],
      ['in braces, with a dash for the minus', (values) => asSet(values).replace(/-/g, '–')],
    ]) {
      spellings += 1;
      const result = gradeTyped(question, write(domain), write(range));
      if (question.ask.includes('domain')) assert.equal(partOf(result, 'domain').isCorrect, true, `${label}: the domain ${name}, "${write(domain)}"`);
      if (question.ask.includes('range')) assert.equal(partOf(result, 'range').isCorrect, true, `${label}: the range ${name}, "${write(range)}"`);
      assert.equal(result.isCorrect, true, `${label}: everything right, the sets ${name}`);
    }
  }
  assert.ok(spellings >= 35);
});

test('in braces, a set that misses a value, adds one or loses a sign is still wrong', () => {
  for (const { question } of RELATIONS) {
    const { domain, range } = relationOf(question);
    const label = question.questionId;
    const negative = domain.find((x) => x < 0);
    const wrongDomains = [
      asSet(domain.slice(1)),
      asSet([...domain, Math.max(...domain) + 7]),
      // The range typed as the domain (when they differ).
      ...(domain.join() === range.join() ? [] : [asSet(range)]),
      ...(negative === undefined ? [] : [asSet(domain.map((x) => (x === negative ? -x : x)))]),
    ];
    for (const typed of wrongDomains) {
      const result = gradeTyped(question, typed, range.join(', '));
      assert.equal(partOf(result, 'domain').isCorrect, false, `${label}: the domain typed "${typed}"`);
      assert.equal(result.isCorrect, false, `${label}: "${typed}" does not finish the item`);
    }
  }
});

test('My Math Path reads the same sets: the lab parses the boxes with the rule the contract compares', () => {
  for (const { question } of RELATIONS) {
    const { domain, range, isFunction } = relationOf(question);
    assert.deepEqual(parseList(trueMinus(asSet(domain))), domain, `${question.questionId}: the domain, parsed`);
    const definition = buildPrivateToolGrading(question);
    const raw = { arrows: relationOf(question).pairs, domain: parseList(asSet(domain)), range: parseList(trueMinus(asSet(range))), isFunction };
    assert.equal(gradePathResponse({ privateGrading: definition, raw }).isCorrect, true, `${question.questionId}: the Path, braces and the true minus`);
  }
  // Text that is not a number is still dropped, as before: a word is no value.
  assert.deepEqual(parseList('{1, two, 3}'), [1, 3]);
  assert.deepEqual(parseList(''), []);
});
