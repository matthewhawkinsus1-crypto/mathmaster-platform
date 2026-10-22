/*
 * RECOVERY V2 — THE FAMILIES BEHIND ALGEBRA II HONORS "OPERATIONS ON
 * POLYNOMIALS".
 *
 * The lesson's three Warm-Up and three DOL questions each stand on a platform
 * family (functions/shared/questionFamiliesPolynomials.mjs), so the lesson is
 * Recovery-ready from the day it is created:
 *
 *   opp-wu-1   polynomials.multiplyMonomials         (3x²)(−4x⁵), (−2a³b)(5ab²)
 *   opp-wu-2   polynomials.oppositeAndLikeTerms      −(a³ − 3a + 2); combine like terms
 *   opp-wu-3   polynomials.likeTermPairs             like terms, or not and why
 *   opp-dol-1  polynomials.subtractMissingTerm       cubic minus cubic, Workshop add & subtract
 *   opp-dol-2  polynomials.multiplyTrinomialBinomial  trinomial × binomial, Workshop area model
 *   opp-dol-3  polynomials.profitModel               profit = revenue − cost
 *
 * These tests hold each family to what a student is owed (every version is a
 * valid question its own key passes and a wrong answer fails, on the server;
 * versions are distinct and plentiful), and hold the lesson to what the
 * teacher was promised: both sections of the Standard and the Honors copy are
 * Recovery-ready from these families, without touching a question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { simplifiedPolynomialProblem } from '../../functions/shared/simplifiedPolynomialForm.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const LESSON_FILE = 'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const liveQuestion = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const BINDINGS = Object.freeze({
  'opp-wu-1': 'polynomials.multiplyMonomials',
  'opp-wu-2': 'polynomials.oppositeAndLikeTerms',
  'opp-wu-3': 'polynomials.likeTermPairs',
  'opp-dol-1': 'polynomials.subtractMissingTerm',
  'opp-dol-2': 'polynomials.multiplyTrinomialBinomial',
  'opp-dol-3': 'polynomials.profitModel',
});
const NEW_FAMILIES = Object.values(BINDINGS);

const instancesOf = (family, values, limit = 400) => {
  const sequence = createFamilyInstanceSequence(family, values, 'recovery-polynomials-family-test');
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
  authored: { questionId: 'recovery-polynomials-test' },
  tool: family.defaultTool,
});

test('the six families are registered, recognize static questions, and are Recovery-eligible', () => {
  NEW_FAMILIES.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(typeof family.recognize, 'function', `${id} can recognize a static question`);
    assert.equal(family.recovery?.eligible, true, `${id} may serve Recovery`);
    assert.ok(family.skill.alignments.includes('A2.7B'), `${id} is aligned to the lesson's TEKS`);
  });
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract and the simplest-form reader', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesPolynomials.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  // The reader is what the typed-answer grader already loads (answerUtils.mjs).
  assert.deepEqual(imports, ['./questionFamilyContract.mjs', './simplifiedPolynomialForm.mjs'], 'no tool math, no grader, no browser module');
});

for (const id of NEW_FAMILIES) {
  test(`${id}: 400 versions build, are valid, distinct, and are graded right and wrong by the server`, () => {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    const instances = instancesOf(family, values);
    assert.equal(instances.length, 400, `${id} has at least 400 versions`);
    const fingerprints = new Set();
    instances.forEach((instance) => {
      fingerprints.add(instance.fingerprint);
      const question = build(family, values, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: id }).errors, [], `${id} ${instance.fingerprint} is a valid question`);
      if (question.type === 'polynomialWorkshop') assert.deepEqual(validateToolQuestion(question).errors, [], `${id} ${instance.fingerprint}: the workshop can draw it`);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${id} has a key response for its answer kind`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${id} ${instance.fingerprint}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong answer is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], `${id} ${instance.fingerprint}: certification's key check passes`);
    });
    assert.equal(fingerprints.size, instances.length, 'no two versions are the same problem');
  });
}

test('every typed polynomial key is in simplest form, asks for it, and never passes degree 8', () => {
  for (const id of ['polynomials.multiplyMonomials', 'polynomials.oppositeAndLikeTerms', 'polynomials.profitModel']) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    instancesOf(family, values, 200).forEach((instance) => {
      build(family, values, instance).answerFields.filter((field) => field.answerForm).forEach((field) => {
        assert.equal(field.answerForm, 'simplifiedPolynomial');
        assert.equal(simplifiedPolynomialProblem(field.answer), null, `${id} ${field.id}: ${field.answer} is simplified`);
        const degree = Math.max(...[...String(field.answer).matchAll(/[a-z](?:\^(\d+))?/g)].map((match) => Number(match[1] || 1)));
        assert.ok(degree <= 8, `${id}: ${field.answer}`);
      });
    });
  }
});

test('a multi-part version marks every wrong part wrong, and each choice has exactly one right option', () => {
  for (const id of ['polynomials.multiplyMonomials', 'polynomials.oppositeAndLikeTerms', 'polynomials.likeTermPairs', 'polynomials.profitModel']) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    instancesOf(family, values, 60).forEach((instance) => {
      const question = build(family, values, instance);
      const key = instance.answer.value;
      question.answerFields.forEach((field) => {
        if (field.type === 'choice') {
          assert.equal(field.options.filter((option) => option === field.answer).length, 1, `${id} ${field.id}: one right option`);
          assert.equal(new Set(field.options).size, field.options.length, `${id} ${field.id}: no duplicate options`);
        }
        const wrongValue = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : '999';
        const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries({ ...key, [field.id]: wrongValue }).map(([fieldId, value]) => ({ id: fieldId, value: String(value), isComplete: true })) };
        assert.notEqual(gradeServerResponse({ question, response })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong ${field.id} is not accepted`);
      });
    });
  }
});

test('the profit family\'s wrong setups are the mistakes the lesson teaches against', () => {
  const family = getPlatformQuestionFamily('polynomials.profitModel');
  const { values } = resolveFamilyConstraints(family, {});
  instancesOf(family, values, 40).forEach((instance) => {
    const setup = build(family, values, instance).answerFields.find((field) => field.id === 'setup');
    const { r } = instance.values;
    // Subtracting only the first term of the cost: no parentheses after the minus.
    assert.ok(setup.options.some((option) => option.startsWith(`${r}x − 0.00`)), setup.options.join(' | '));
    assert.ok(setup.options.some((option) => option.endsWith(`− ${r}x`)), 'cost minus revenue');
  });
});

/* ---------------------------------------------------------------------------
 * Each family recognizes the live question it stands in for.
 * ------------------------------------------------------------------------- */

for (const [questionId, familyId] of Object.entries(BINDINGS)) {
  test(`${questionId}: ${familyId} recognizes the live question with the same rigor and its own key, and leaves 12+ fresh versions`, () => {
    const question = liveQuestion(questionId);
    assert.ok(question, `${questionId} is in the lesson`);
    const family = getPlatformQuestionFamily(familyId);
    const recognized = family.recognize(question);
    assert.ok(recognized, `${familyId} recognizes ${questionId}`);

    const { values } = resolveFamilyConstraints(family, recognized.constraints);
    const rigor = familyDifficultyFor(family, values);
    assert.equal(Number(rigor.dok), Number(question.dok), `${questionId}: DOK`);
    assert.equal(Number(rigor.band), Number(question.difficultyBand), `${questionId}: difficulty band`);

    // The live problem is one of the family's own versions, written the same
    // way and with the live key — which is how Recovery knows never to hand
    // it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${questionId} is a valid ${family.id} problem (${evaluated.issues})`);
    const rebuilt = build(family, values, evaluated.instance);
    if (rebuilt.type === 'multiAnswer') {
      const fieldsOf = (entry) => entry.answerFields.map((field) => [field.label, String(field.answer)]);
      assert.deepEqual(fieldsOf(rebuilt), fieldsOf(question), `${questionId}: the family writes the live labels and keys`);
    } else {
      for (const field of ['mode', 'operation', 'firstPolynomial', 'secondPolynomial', 'leftFactor', 'rightFactor']) {
        assert.equal(rebuilt[field], question[field], `${questionId}: the same ${field}`);
      }
    }
    const capacity = measureFamilyCapacity(family, values);
    assert.ok(capacity.capacity - 1 >= 12, `${questionId}: at least 12 fresh versions (capacity ${capacity.capacity})`);
  });
}

test('a family recognizes only what it stands in for: the other Warm-Up and DOL questions, and unrelated mathematics, are refused', () => {
  const unrelated = [
    { questionId: 'num', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] },
    { questionId: 'add', type: 'polynomialWorkshop', mode: 'addSubtract', operation: 'add', firstPolynomial: '5x^3-2x^2+7', secondPolynomial: '2x^3+4x^2-3x+1' },
    { questionId: 'binomials', type: 'polynomialWorkshop', mode: 'multiplyArea', leftBinomial: [2, 3], rightBinomial: [1, -4] },
    { questionId: 'two-letters', type: 'polynomialWorkshop', mode: 'multiplyArea', leftFactor: 'x-y', rightFactor: 'x^2+2xy+y^2' },
    { questionId: 'matrix', type: 'matrixLab', mode: 'operate', operation: 'add', left: 'A', right: 'B', matrices: { A: { rows: [[1, 2]] }, B: { rows: [[3, 4]] } } },
  ];
  NEW_FAMILIES.forEach((familyId) => {
    const family = getPlatformQuestionFamily(familyId);
    unrelated.forEach((question) => assert.equal(family.recognize(question), null, `${familyId} does not recognize ${question.questionId}`));
    Object.entries(BINDINGS).forEach(([questionId, boundId]) => {
      if (boundId === familyId) return;
      assert.equal(family.recognize(liveQuestion(questionId)), null, `${familyId} does not recognize ${questionId}`);
    });
  });
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on the Standard and Honors copies.
 * ------------------------------------------------------------------------- */

const TITLE = LESSON.model.assignmentV5.assignment.title;
const copy = (variant) => ({
  ...structuredClone(LESSON.model.assignmentV5),
  id: `operations-on-polynomials-${variant}`,
  title: TITLE,
  courseId: 'algebra2',
  courseProfile: { course: 'algebra2', courseLevel: variant },
  rigorVariant: variant,
  assignedClassIds: [`class-${variant}`],
  assignmentRevision: 2,
});

for (const variant of ['standard', 'honors']) {
  test(`Recovery on the ${variant} copy: both sections become ready from the six families, and no question changes`, () => {
    const assignment = copy(variant);
    const before = JSON.stringify(assignment.sections);
    const { report } = buildRecoveryUpgradePreview({
      assignment,
      manifest: null,
      gradeSample: serverRecoveryKeyCheck,
      trackers: [],
      at: '2026-10-22T15:00:00.000Z',
    });
    assert.equal(TITLE, 'Algebra II Honors — Operations on Polynomials');
    assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
      'Warm-Up Q1:opp-wu-1:add:polynomials.multiplyMonomials',
      'Warm-Up Q2:opp-wu-2:add:polynomials.oppositeAndLikeTerms',
      'Warm-Up Q3:opp-wu-3:add:polynomials.likeTermPairs',
      'DOL Q1:opp-dol-1:add:polynomials.subtractMissingTerm',
      'DOL Q2:opp-dol-2:add:polynomials.multiplyTrinomialBinomial',
      'DOL Q3:opp-dol-3:add:polynomials.profitModel',
    ]);
    assert.deepEqual(report.readiness.warmup.after, 'ready');
    assert.deepEqual(report.readiness.dol.after, 'ready');
    assert.equal(JSON.stringify(assignment.sections), before, 'the preview changes no question');
  });
}
