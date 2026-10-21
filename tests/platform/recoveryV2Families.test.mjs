/*
 * RECOVERY V2 — THE FAMILIES BEHIND THE LIVE ALGEBRA I TRANSFORMATIONS LESSON.
 *
 * "Algebra I — Vertical and Horizontal Transformations of Linear Functions"
 * went live with three static Warm-Up and three static DOL questions. Its
 * Recovery comes from five new platform families, and a Recovery is only as
 * good as they are. These tests hold every family to what a student is owed:
 *
 *   every version it can generate builds a valid question;
 *   MathMaster grades every version on the server — its own key is marked
 *     right and a wrong answer is marked wrong (so a grader that accepts
 *     anything cannot pass);
 *   versions are genuinely different (distinct fingerprints) and plentiful;
 *   each family RECOGNIZES the live question it stands in for — same skill,
 *     same numbers kind, same DOK and difficulty band — and recognizes nothing
 *     it does not stand in for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 } from '../../functions/shared/recoveryMigrations.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON = 'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
const { questions: LIVE_QUESTIONS } = compileTeacherImport(readFileSync(new URL(`../../${LESSON}`, import.meta.url), 'utf8'));
const liveQuestion = (questionId) => LIVE_QUESTIONS.find((question) => question.questionId === questionId);

const NEW_FAMILIES = [
  'linear.graphFromSlopeIntercept',
  'linear.keyCharacteristics',
  'transformations.linearPlotImages',
  'transformations.linearHorizontalShiftAlgebra',
  'transformations.linearCompareEffects',
];

// Every constraint setting a live binding uses (and each family's defaults),
// which must also be plentiful; plus a narrow setting no binding uses, which
// must still be correct — and which certification refuses for Recovery
// because it has too few versions (recoveryV2Certification.test.mjs).
const SETTINGS = [
  ['linear.graphFromSlopeIntercept', {}, true],
  ['linear.graphFromSlopeIntercept', { slope: 'integer' }, true],
  ['linear.graphFromSlopeIntercept', { slope: 'fraction' }, true],
  ['linear.keyCharacteristics', {}, true],
  ['linear.keyCharacteristics', { slope: 'integer', xIntercept: 'fraction' }, true],
  ['linear.keyCharacteristics', { slope: 'fraction', xIntercept: 'fraction' }, true],
  ['transformations.linearPlotImages', {}, true],
  ['transformations.linearPlotImages', { transformation: 'horizontalShift' }, true],
  ['transformations.linearPlotImages', { transformation: 'verticalScale' }, false],
  ['transformations.linearHorizontalShiftAlgebra', {}, true],
  ['transformations.linearCompareEffects', {}, true],
];

const instancesOf = (family, values, limit = 400) => {
  const sequence = createFamilyInstanceSequence(family, values, 'recovery-v2-family-test');
  const instances = [];
  for (let index = 0; index < limit; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    instances.push(instance);
  }
  return instances;
};

const build = (family, values, instance) => buildFamilyQuestion({
  family,
  instance,
  constraintValues: values,
  authored: { questionId: 'recovery-v2-test' },
  tool: family.defaultTool,
});

test('the five families are registered, recognize static questions, and are Recovery-eligible', () => {
  NEW_FAMILIES.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(typeof family.recognize, 'function', `${id} can recognize a static question`);
    assert.ok(
      typeof family.difficultyFor === 'function' || (Number.isInteger(family.difficulty?.band) && Number.isInteger(family.difficulty?.dok)),
      `${id} says the difficulty each setting produces (or has one fixed difficulty)`,
    );
    assert.equal(family.recovery?.eligible, true, `${id} may serve Recovery`);
  });
});

for (const [id, overrides, plentiful] of SETTINGS) {
  test(`${id} ${JSON.stringify(overrides)}: every version builds, is valid, and is graded right and wrong by the server`, () => {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, overrides);
    const instances = instancesOf(family, values);
    assert.ok(instances.length > 0, `${id} produces versions`);
    if (plentiful) assert.ok(instances.length >= 12, `${id} produces at least 12 versions (got ${instances.length})`);
    const fingerprints = new Set();
    instances.forEach((instance) => {
      fingerprints.add(instance.fingerprint);
      const question = build(family, values, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: id }).errors, [], `${id} ${instance.fingerprint} is a valid question`);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${id} has a key response for its answer kind`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${id} ${instance.fingerprint}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong answer is not`);
    });
    assert.equal(fingerprints.size, instances.length, 'no two versions are the same problem');
  });
}

test('a multi-part version marks every wrong part wrong, and each choice has exactly one right option', () => {
  for (const [id, overrides] of SETTINGS) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, overrides);
    instancesOf(family, values, 40).forEach((instance) => {
      const question = build(family, values, instance);
      if (question.type !== 'multiAnswer') return;
      const key = instance.answer.value;
      question.answerFields.forEach((field) => {
        if (field.type === 'choice') {
          assert.equal(field.options.filter((option) => option === field.answer).length, 1, `${id} ${field.id}: one right option`);
          assert.equal(new Set(field.options).size, field.options.length, `${id} ${field.id}: no duplicate options`);
        }
        const wrongValue = field.type === 'choice'
          ? field.options.find((option) => option !== field.answer)
          : field.answerFormat === 'orderedPair' ? '(99, 99)' : field.answerFormat === 'expression' ? 'x+999' : '999';
        const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries({ ...key, [field.id]: wrongValue }).map(([fieldId, value]) => ({ id: fieldId, value: String(value), isComplete: true })) };
        assert.notEqual(gradeServerResponse({ question, response })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong ${field.id} is not accepted`);
      });
    });
  }
});

/* ---------------------------------------------------------------------------
 * Each family recognizes the live question it stands in for.
 * ------------------------------------------------------------------------- */

for (const [questionId, binding] of Object.entries(ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings)) {
  test(`${questionId}: ${binding.questionFamily.id} recognizes the live question with the reviewed settings, the same rigor, and its own answer`, () => {
    const question = liveQuestion(questionId);
    assert.ok(question, `${questionId} is in the lesson`);
    const family = getPlatformQuestionFamily(binding.questionFamily.id, binding.questionFamily.version);
    const recognized = family.recognize(question);
    assert.ok(recognized, `${binding.questionFamily.id} recognizes ${questionId}`);
    // The settings the migration was reviewed with are what the family reads off the question.
    Object.entries(binding.questionFamily.constraints).forEach(([name, value]) => {
      assert.equal(recognized.constraints[name], value, `${questionId}: ${name}`);
    });
    // Same DOK and difficulty band as the live question.
    const { values } = resolveFamilyConstraints(family, recognized.constraints);
    const rigor = familyDifficultyFor(family, values);
    assert.equal(Number(rigor.dok), Number(question.dok), `${questionId}: DOK`);
    assert.equal(Number(rigor.band), Number(question.difficultyBand), `${questionId}: difficulty band`);
    // The live problem is one of the family's own versions, with the same key —
    // which is how Recovery knows never to hand it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${questionId} is a valid ${family.id} problem`);
    const rebuilt = build(family, values, evaluated.instance);
    if (rebuilt.type === 'multiAnswer') {
      const keyOf = (entry) => entry.answerFields.map((field) => String(field.answer));
      assert.deepEqual(keyOf(rebuilt), keyOf(question), `${questionId}: the family's key for it is the live key`);
    } else if (rebuilt.type === 'graphing2') {
      assert.deepEqual([rebuilt.line.m, rebuilt.line.b], [question.line.m, question.line.b]);
    }
    // And plenty of fresh versions remain once it is set aside.
    const capacity = measureFamilyCapacity(family, values);
    assert.ok(capacity.capacity - 1 >= 12, `${questionId}: at least 12 fresh versions (capacity ${capacity.capacity})`);
  });
}

test('a family recognizes only what it stands in for: the other live questions, and unrelated mathematics, are refused', () => {
  const bound = ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2.bindings;
  const unrelated = [
    { questionId: 'quad', type: 'multiAnswer', prompt: 'Find the vertex of y = x² − 4x + 1.', answerFields: [{ id: 'vertex', type: 'text', answerFormat: 'orderedPair', answer: '(2, -3)' }] },
    { questionId: 'num', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] },
    { questionId: 'graph-quad', type: 'graphing2', mode: 'parabola', prompt: 'Graph y = x².' },
  ];
  NEW_FAMILIES.forEach((familyId) => {
    const family = getPlatformQuestionFamily(familyId);
    unrelated.forEach((question) => assert.equal(family.recognize(question), null, `${familyId} does not recognize ${question.questionId}`));
    // Among the live Warm-Up and DOL, a family recognizes only questions of its own kind.
    Object.entries(bound).forEach(([questionId, binding]) => {
      const recognized = family.recognize(liveQuestion(questionId));
      if (binding.questionFamily.id === familyId) assert.ok(recognized, `${familyId} recognizes ${questionId}`);
    });
  });
  // The DOL plot family names the move it saw: a horizontal shift, not any transformation.
  const plot = getPlatformQuestionFamily('transformations.linearPlotImages');
  assert.equal(plot.recognize(liveQuestion('l2-dol-1')).constraints.transformation, 'horizontalShift');
  assert.equal(getPlatformQuestionFamily('linear.graphFromSlopeIntercept').recognize(liveQuestion('l2-wu-2')), null, 'a typed key-characteristics board is not a graph');
});
