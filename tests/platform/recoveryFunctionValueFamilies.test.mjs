/*
 * RECOVERY V2 — OPERATIONS ON FUNCTIONS FROM THEIR VALUES (RC01).
 *
 * Algebra II Honors Module 1 Lesson 4's Warm-Up had no Recovery. Two of its
 * questions are numbers computed from given function values
 * (functions/shared/questionFamiliesFunctionValues.mjs):
 *
 *   q_warmup-1_1_2   If f(2)=7 and g(2)=−3: (f+g)(2), (f−g)(2)    functions.pointwiseFromValues
 *   q_warmup-1_1_3   If g(4)=2 and f(2)=9: g(4), f(g(4))           functions.compositionFromValues
 *
 * These tests hold the families to what a student is owed — every version is
 * a valid question graded right with its own key and wrong with a wrong
 * number, its key re-derived here from the values its prompt states — and the
 * lesson to what the teacher was promised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import { RECOVERY_MINIMUM_FRESH_VERSIONS, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryExclusionFingerprints, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json', import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);
const POINTWISE = getPlatformQuestionFamily('functions.pointwiseFromValues');
const COMPOSITION = getPlatformQuestionFamily('functions.compositionFromValues');

const LIVE = Object.freeze([
  { family: POINTWISE, questionId: 'q_warmup-1_1_2', params: { x: 2, p: 7, q: -3 } },
  { family: COMPOSITION, questionId: 'q_warmup-1_1_3', params: { a: 4, b: 2, c: 9 } },
]);
// Worked by hand: pointwise x 1..6, f's value 2..9, g's −9..−1, never summing
// to 0: 6 × (8 × 9 − 8) = 384. Composition: three different numbers 1..9:
// 9 × 8 × 7 = 504.
const VERSIONS = Object.freeze([[POINTWISE, 384], [COMPOSITION, 504]]);

const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });
const everyInstance = (family) => {
  const walked = createFamilyInstanceSequence(family, resolveFamilyConstraints(family, {}).values, 'function-values-test').exhaust(5000);
  assert.equal(walked.complete, true);
  return walked.instances;
};
const build = (family, instance) => {
  const live = LIVE.find((entry) => entry.family === family);
  return buildFamilyQuestion({
    family,
    instance,
    constraintValues: resolveFamilyConstraints(family, {}).values,
    authored: recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: family.id, version: 1, constraints: {} } }),
  });
};
/** The key, from the values the prompt states. */
const keyFromPrompt = (prompt) => {
  const text = prompt.replaceAll('−', '-');
  const pointwise = /^If f\((\d)\)=(-?\d) and g\(\1\)=(-?\d), evaluate two pointwise operations\.$/.exec(text);
  if (pointwise) return { sum: Number(pointwise[2]) + Number(pointwise[3]), difference: Number(pointwise[2]) - Number(pointwise[3]) };
  const composition = /^If g\((\d)\)=(\d) and f\(\2\)=(\d), evaluate the composition f\(g\(\1\)\)\.$/.exec(text);
  assert.ok(composition, prompt);
  return { inside: Number(composition[2]), composition: Number(composition[3]) };
};

test('both families are registered, recognize static questions, may serve Recovery, at the lesson\'s rigor and standard', () => {
  [POINTWISE, COMPOSITION].forEach((family) => {
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
    assert.deepEqual([...family.skill.alignments], ['A2.2D']);
    assert.deepEqual(familyDifficultyFor(family, {}), { band: 1, dok: 1 });
  });
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesFunctionValues.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], 'it imports only the family contract');
});

for (const [family, count] of VERSIONS) {
  test(`${family.id}: all ${count} versions are valid and distinct, their keys are what the prompt's values give, marked right on the device and the server, and a wrong number is wrong`, () => {
    const instances = everyInstance(family);
    assert.equal(instances.length, count);
    assert.equal(measureFamilyCapacity(family, resolveFamilyConstraints(family, {}).values, { budget: 2048 }).capacity, count);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, count);
    instances.forEach((instance) => {
      const question = build(family, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      const key = keyFromPrompt(question.prompt);
      assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, question.prompt);
      if (family === POINTWISE) assert.ok(key.difference > key.sum, 'the difference subtracts a negative value');
      assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
      assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
      const [first] = question.answerFields;
      assert.notEqual(gradeServerResponse({ question, response: fieldsResponse({ ...key, [first.id]: key[first.id] + 1 }) }).isCorrect, true);
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
      assert.ok(recoveryKeyResponses(question, instance));
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
    });
  });
}

for (const live of LIVE) {
  test(`${live.questionId}: recognized by ${live.family.id} at the same rigor, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: {} });
    assert.deepEqual([familyDifficultyFor(live.family, {}).dok, familyDifficultyFor(live.family, {}).band], [Number(question.dok), Number(question.difficultyBand)]);
    const evaluated = evaluateFamilyCandidate(live.family, resolveFamilyConstraints(live.family, {}).values, recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live.family, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt);
    assert.deepEqual(rebuilt.answerFields, question.answerFields, 'the same boxes, labels and keys');
    assert.ok(measureFamilyCapacity(live.family, resolveFamilyConstraints(live.family, {}).values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a board that is not exactly one of these, and every other question of the lesson', () => {
  const pointwise = questionIn('q_warmup-1_1_2');
  const composition = questionIn('q_warmup-1_1_3');
  const refused = [
    [POINTWISE, 'a wrong key', mutate(pointwise, (q) => { q.answerFields[1].answer = 4; })],
    [POINTWISE, 'a product as well', mutate(pointwise, (q) => { q.answerFields.push({ id: 'product', label: '(fg)(2)', answer: -21, answerFormat: 'number', inputProfile: 'number' }); })],
    [POINTWISE, 'two inputs', mutate(pointwise, (q) => { q.prompt = 'If f(2)=7 and g(3)=−3, evaluate two pointwise operations.'; })],
    [POINTWISE, 'g positive', mutate(pointwise, (q) => { q.prompt = 'If f(2)=7 and g(2)=3, evaluate two pointwise operations.'; q.answerFields[0].answer = 10; q.answerFields[1].answer = 4; })],
    [POINTWISE, 'a choice box', mutate(pointwise, (q) => { q.answerFields[0] = { ...q.answerFields[0], type: 'choice', options: ['4', '10'] }; })],
    [COMPOSITION, 'a value that does not chain', mutate(composition, (q) => { q.prompt = 'If g(4)=2 and f(3)=9, evaluate the composition f(g(4)).'; })],
    [COMPOSITION, 'a wrong inside value', mutate(composition, (q) => { q.answerFields[0].answer = 4; })],
    [COMPOSITION, 'a repeated number', mutate(composition, (q) => { q.prompt = 'If g(4)=2 and f(2)=4, evaluate the composition f(g(4)).'; q.answerFields[1].answer = 4; })],
    [COMPOSITION, 'another label', mutate(composition, (q) => { q.answerFields[1].label = '(f∘g)(4)'; })],
  ];
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
  LESSON.questions.filter((question) => !LIVE.some((live) => live.questionId === question.questionId)).forEach((question) => {
    [POINTWISE, COMPOSITION].forEach((family) => assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId}`));
  });
  assert.deepEqual(recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(LESSON.model.assignmentV5), families: [POINTWISE, COMPOSITION] }).sort(), [
    'functions.compositionFromValues:4|2|9',
    'functions.pointwiseFromValues:2|7|-3',
  ]);
});

test('Prepare Recovery on Lesson 4: the two numeric Warm-Up questions are added and the Warm-Up becomes ready; the rest wait; no question changes', () => {
  const assignment = { ...structuredClone(LESSON.model.assignmentV5), id: 'live-l4', title: LESSON.model.assignmentV5.assignment.title, courseId: 'algebra2', assignedClassIds: ['class-a2h'], assignmentRevision: 2 };
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-05T15:00:00.000Z' });
  // (Warm-Up Q1, the inverse review, is the inverse family's: recoveryInverseFamilies.test.mjs.)
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.family.id}`), [
    'Warm-Up Q1:functions.inverseOfLinear',
    'Warm-Up Q2:functions.pointwiseFromValues',
    'Warm-Up Q3:functions.compositionFromValues',
  ]);
  assert.deepEqual(report.readiness.warmup, { before: 'unavailable', after: 'ready', message: null });
  assert.equal(report.readiness.dol.after, 'unavailable');
  assert.deepEqual(report.notReady.map((row) => row.label), ['DOL Q1', 'DOL Q2', 'DOL Q3']);
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});
