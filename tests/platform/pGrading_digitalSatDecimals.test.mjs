import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';

import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { sameDigitalSatStudentProducedResponse } from '../../functions/shared/answerEquivalence.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');
const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');

/*
 * JOB P, ITEM 3 — the decimals the Digital SAT itself accepts.
 *
 * College Board, student-produced responses: a positive answer fits in 5
 * characters, a negative one in 6; a decimal that does not fit is entered
 * "by truncating or rounding at the fourth digit". For 2/3 the SAT accepts
 * .6666, .6667, 0.666 and 0.667 and rejects 0.66, .66, 0.67 and .67; for −1/3
 * it accepts −.3333 and −0.333.
 */
test('the College Board examples, exactly', () => {
  for (const typed of ['.6666', '.6667', '0.666', '0.667']) assert.equal(sameDigitalSatStudentProducedResponse(typed, '2/3'), true, typed);
  for (const typed of ['0.66', '.66', '0.67', '.67', '0.6', '.666', '0.668', '.6668']) assert.equal(sameDigitalSatStudentProducedResponse(typed, '2/3'), false, typed);
  for (const typed of ['-.3333', '-0.333', '−0.333']) assert.equal(sameDigitalSatStudentProducedResponse(typed, '-1/3'), true, typed);
  for (const typed of ['-.33', '-0.33', '.3333', '-.3334']) assert.equal(sameDigitalSatStudentProducedResponse(typed, '-1/3'), false, typed);
  // A value of 10 or more fills the space with fewer decimal places.
  assert.equal(sameDigitalSatStudentProducedResponse('41.66', '125/3'), true);
  assert.equal(sameDigitalSatStudentProducedResponse('41.67', '125/3'), true);
  assert.equal(sameDigitalSatStudentProducedResponse('41.68', '125/3'), false);
  assert.equal(sameDigitalSatStudentProducedResponse('41.7', '125/3'), false);
  // The verifier's counterexamples: padding is not truncating or rounding,
  // zero is never right for a nonzero answer, and a key whose decimal fits
  // exactly is graded as itself.
  for (const [typed, key] of [['00.67', '2/3'], ['000.7', '2/3'], ['-00.33', '-1/3'], ['00.78', '57/73'], ['0.000', '0.00004'], ['.0000', '0.00004'], ['1.000', '0.9999']]) {
    assert.equal(sameDigitalSatStudentProducedResponse(typed, key), false, `${typed} for ${key}`);
  }
});

const BANK = (framework) => JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`, import.meta.url), 'utf8')).documents;
const unionOverlap = BANK('digitalSAT').find((item) => item.id === 'mm_sat_native_prob_ch1_union-overlap_v21');

const issueAndGrade = async (item, seed, responses) => {
  const question = generatePathInstanceWithRetries(compilePathRecordForStorage({ ...item, active: true }).document, seed, 4).question;
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true);
  const verdicts = [];
  for (const response of responses(question)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await mathPath.gradePathToolResponse(plan.privateGrading, { responses: { answer: response } });
    verdicts.push([response, result.fieldResults[0].isCorrect]);
  }
  return { question, verdicts };
};

// Three-place decimals with the leading zero, as the SAT accepts them. The
// item already lists the four-place ones (Job K); a three-place decimal ending
// in 0 is still right only when typed in full (0.780, not 0.78).
const threePlace = (key) => {
  const value = new Fraction(key);
  return [...new Set(['floor', 'round'].map((how) => value.mul(1000)[how]().div(1000).valueOf().toFixed(3)))];
};

test('My Math Path: a Digital SAT number box takes the three-place decimal the SAT accepts', async () => {
  let draws = 0;
  for (let draw = 0; draw < 12; draw += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { question, verdicts } = await issueAndGrade(unionOverlap, `p-sat-${draw}`, (q) => {
      const key = String(q.responseFields[0].expected);
      const value = new Fraction(key);
      if (value.d === 1n || value.d === 1) return [];
      const right = threePlace(key);
      const wrong = [value.valueOf().toFixed(2), (Math.floor(value.valueOf() * 1000) / 1000 - 0.001).toFixed(3)];
      return [...right, ...wrong.filter((miss) => !right.includes(miss) && !new Fraction(miss).equals(value))];
    });
    if (!verdicts.length) continue;
    draws += 1;
    const key = new Fraction(String(question.responseFields[0].expected));
    for (const [response, verdict] of verdicts) {
      assert.equal(verdict, threePlace(key).includes(response), `${key.toFraction()} → ${response}`);
    }
  }
  assert.ok(draws >= 6, `only ${draws} fraction draws`);
});

test('only Digital SAT items follow the SAT rules: the same item under ACT keeps the old verdicts', async () => {
  const act = { ...unionOverlap, assessmentContext: { ...unionOverlap.assessmentContext, framework: 'act' } };
  const sat = await issueAndGrade(unionOverlap, 'p-sat-0', (q) => threePlace(String(q.responseFields[0].expected)));
  const other = await issueAndGrade(act, 'p-sat-0', (q) => threePlace(String(q.responseFields[0].expected)));
  assert.ok(sat.verdicts.every(([, verdict]) => verdict === true));
  assert.ok(other.verdicts.length && other.verdicts.every(([, verdict]) => verdict === false));
});

test('Assignments: a hydrated Digital SAT number box takes the SAT decimals; other frameworks do not', () => {
  const gradeAs = (document, seed) => {
    const template = compileAuthoringIntentV5({
      schemaVersion: 5,
      assignment: { title: 'P SAT', courseId: 'algebra1', instructionalPurpose: 'review', gradingPurpose: 'practice' },
      sections: [{ role: 'practice', title: 'Practice', questions: [bankDocumentToV5Intent(document)] }],
    }).package.sections[0].questions[0];
    const question = generateQuestion(template, seed);
    const field = question.answerFields[0];
    return { field, grade: (value) => gradeServerResponse({ question, response: { kind: 'fields', fields: [{ id: field.id, value }] } }).isCorrect };
  };
  let checked = 0;
  for (let draw = 0; draw < 12; draw += 1) {
    const { field, grade } = gradeAs(unionOverlap, `p-sat-assign-${draw}`);
    const value = new Fraction(String(field.answer));
    if (value.d === 1n || value.d === 1) continue;
    checked += 1;
    for (const typed of threePlace(String(field.answer))) assert.equal(grade(typed), true, `${value.toFraction()} → ${typed}`);
    const fourPlace = value.mul(10000).floor().div(10000).valueOf().toFixed(4).replace(/^0/, '');
    assert.equal(grade(fourPlace), true, `${value.toFraction()} → ${fourPlace}`);
    assert.equal(grade(value.valueOf().toFixed(2)), new Fraction(value.valueOf().toFixed(2)).equals(value));
    const act = gradeAs({ ...unionOverlap, assessmentContext: { ...unionOverlap.assessmentContext, framework: 'act' } }, `p-sat-assign-${draw}`);
    assert.equal(act.field.numberRules, undefined);
    // A key whose decimal ends within four places (3/8 = .3750) is exact anywhere.
    assert.equal(act.grade(fourPlace), new Fraction(fourPlace).equals(value));
  }
  assert.ok(checked >= 6, `only ${checked} fraction draws`);
});
