/*
 * THE TEACHER'S PATH PREVIEW GRADES A FIELD AS A STUDENT'S SESSION DOES (TT32).
 *
 * src/platform/simulation/teacherPathRuntime.js repeats production's field
 * grader (functions/lib/mathPath.js, CommonJS with Node crypto, which cannot be
 * bundled into the browser). These run both over the same questions and
 * answers: the Digital SAT number rules, field weights and a numeric set's
 * matched-elements credit are where the copy had drifted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { buildFieldGradingDefinition } from '../../functions/shared/legacyFieldGrading.mjs';
import { gradeFieldResponse, withDigitalSatNumberRules } from '../../src/platform/simulation/teacherPathRuntime.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const sat = (responseFields) => ({ assessmentContext: { framework: 'digitalSAT' }, responseFields });
const course = (responseFields) => ({ assessmentContext: { framework: 'course' }, responseFields });

const CASES = [
  // A Digital SAT student-produced response: the SAT's own truncated or rounded decimals.
  [sat([{ id: 'a', inputProfile: 'number', expected: '2/3' }]), [{ a: '.6666' }, { a: '.6667' }, { a: '0.666' }, { a: '.666' }, { a: '2/3' }, { a: '0.67' }]],
  // The same key on a course item takes no SAT decimals.
  [course([{ id: 'a', inputProfile: 'number', expected: '2/3' }]), [{ a: '.6666' }, { a: '2/3' }]],
  // A Digital SAT text field is not a number box: no SAT decimals.
  [sat([{ id: 'a', inputProfile: 'text', expected: '2/3' }]), [{ a: '.6666' }, { a: '2/3' }]],
  // Weights: one right, one wrong, weighted 3 to 1.
  [course([{ id: 'a', inputProfile: 'number', expected: '4', weight: 3 }, { id: 'b', inputProfile: 'number', expected: '5' }]), [{ a: '4', b: '6' }, { a: '1', b: '5' }, { a: '4', b: '5' }]],
  // A numeric set with matched-elements credit.
  [course([{ id: 'a', equivalence: 'numericSet', partialCredit: 'matchedElements', expected: '{1, 2, 3, 4}' }]), [{ a: '{1, 2}' }, { a: '{1, 2, 3, 4}' }, { a: '{9}' }]],
];

test('the preview stores the same Digital SAT number rule the server stores', () => {
  for (const [question] of CASES) {
    const server = mathPath.privateGradingDefinition(question).fields.map((field) => [field.id, field.numberRules || null]);
    const preview = withDigitalSatNumberRules(question, buildFieldGradingDefinition(question)).fields.map((field) => [field.id, field.numberRules || null]);
    assert.deepEqual(preview, server, JSON.stringify(question));
  }
});

test('every verdict and score in the preview is the server\'s', async () => {
  let satDecimalsAccepted = 0;
  for (const [question, answers] of CASES) {
    const serverDefinition = mathPath.privateGradingDefinition(question);
    const previewDefinition = withDigitalSatNumberRules(question, buildFieldGradingDefinition(question));
    for (const responses of answers) {
      // eslint-disable-next-line no-await-in-loop
      const server = await mathPath.gradeResponse(serverDefinition, { responses });
      const preview = gradeFieldResponse(previewDefinition, { responses });
      const label = `${JSON.stringify(question.responseFields)} ← ${JSON.stringify(responses)}`;
      assert.equal(preview.isCorrect, server.isCorrect, label);
      assert.equal(preview.score, server.score, label);
      assert.deepEqual(preview.parts, server.fieldResults, label);
      if (question.assessmentContext.framework === 'digitalSAT' && /^0?\.\d+$/.test(responses.a) && server.isCorrect) satDecimalsAccepted += 1;
    }
  }
  assert.equal(satDecimalsAccepted, 3, 'the three SAT decimals for 2/3 are right on both');
});
