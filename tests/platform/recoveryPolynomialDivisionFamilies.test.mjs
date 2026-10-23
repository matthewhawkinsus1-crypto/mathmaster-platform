/*
 * RECOVERY V2 — THE FAMILIES BEHIND ALGEBRA II HONORS "DIVIDING POLYNOMIALS".
 *
 * The lesson's three Warm-Up and three DOL questions each stand on a platform
 * family (functions/shared/questionFamiliesPolynomialDivision.mjs), so the
 * lesson is Recovery-ready from the day it is created:
 *
 *   dp-wu-1   polynomials.divideMonomials      18x⁵ ÷ 3x², −20m⁴n³ ÷ 5m²n
 *   dp-wu-2   polynomials.distributeMonomial   7w(2w² + 8w − 5), −3x(x + 3)
 *   dp-wu-3   polynomials.subtractForDivision  (10a² − 6ab + b²) − (5a² − 2b²), (−3x² − 4x) − (−3x² − 9x)
 *   dp-dol-1  polynomials.divideByMonomial     (12x⁴y² − 18x³y + 6x²y) ÷ 6x²y as a sum of quotients
 *   dp-dol-2  polynomials.longDivisionLinear   (2x³ − 5x² + 7) ÷ (x − 3), Workshop long division
 *   dp-dol-3  polynomials.syntheticDivision    (x⁴ − 5x² + 3x − 4) ÷ (x + 2), Workshop synthetic division
 *
 * These tests hold each family to what a student is owed (every version is a
 * valid question its own key passes and a wrong answer fails, on the server;
 * the Workshop versions' key work is exactly the work the shared grader's own
 * key accepts; versions are distinct and plentiful), and hold the lesson to
 * what the teacher was promised: both sections of the Standard and the Honors
 * copy are Recovery-ready from these families, without touching a question.
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
import { divisionKeyWork } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const LESSON_FILE = 'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const liveQuestion = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const BINDINGS = Object.freeze({
  'dp-wu-1': 'polynomials.divideMonomials',
  'dp-wu-2': 'polynomials.distributeMonomial',
  'dp-wu-3': 'polynomials.subtractForDivision',
  'dp-dol-1': 'polynomials.divideByMonomial',
  'dp-dol-2': 'polynomials.longDivisionLinear',
  'dp-dol-3': 'polynomials.syntheticDivision',
});
const NEW_FAMILIES = Object.values(BINDINGS);
const WORKSHOP_FAMILIES = ['polynomials.longDivisionLinear', 'polynomials.syntheticDivision'];

const instancesOf = (family, values, limit = 400) => {
  const sequence = createFamilyInstanceSequence(family, values, 'recovery-polynomial-division-family-test');
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
  authored: { questionId: 'recovery-polynomial-division-test' },
  tool: family.defaultTool,
});

test('the six families are registered, recognize static questions, and are Recovery-eligible', () => {
  NEW_FAMILIES.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(typeof family.recognize, 'function', `${id} can recognize a static question`);
    assert.equal(family.recovery?.eligible, true, `${id} may serve Recovery`);
    assert.deepEqual([...family.skill.alignments], ['A2.7C'], `${id} is aligned to the lesson's TEKS`);
  });
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract and the simplest-form reader', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesPolynomialDivision.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
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
      if (question.type === 'polynomialWorkshop') {
        assert.deepEqual(validateToolQuestion(question).errors, [], `${id} ${instance.fingerprint}: the workshop can draw it`);
        // The family's key work is the shared grader's own key, box for box.
        assert.deepEqual(instance.answer.value, divisionKeyWork(question), `${id} ${instance.fingerprint}: the key work is the grader's`);
      }
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

test('every typed polynomial key is in simplest form and asks for it', () => {
  for (const id of NEW_FAMILIES.filter((familyId) => !WORKSHOP_FAMILIES.includes(familyId))) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    instancesOf(family, values, 200).forEach((instance) => {
      build(family, values, instance).answerFields.forEach((field) => {
        assert.equal(field.answerForm, 'simplifiedPolynomial', `${id} ${field.id}`);
        assert.equal(simplifiedPolynomialProblem(field.answer), null, `${id} ${field.id}: ${field.answer} is simplified`);
      });
    });
  }
});

test('a multi-part version marks every wrong part wrong', () => {
  for (const id of NEW_FAMILIES.filter((familyId) => !WORKSHOP_FAMILIES.includes(familyId))) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    instancesOf(family, values, 60).forEach((instance) => {
      const question = build(family, values, instance);
      const key = instance.answer.value;
      question.answerFields.forEach((field) => {
        const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries({ ...key, [field.id]: '999' }).map(([fieldId, value]) => ({ id: fieldId, value: String(value), isComplete: true })) };
        assert.notEqual(gradeServerResponse({ question, response })?.isCorrect, true, `${id} ${instance.fingerprint}: a wrong ${field.id} is not accepted`);
      });
    });
  }
});

test('every Workshop version keeps the lesson\'s shape: one missing power, three rounds or a full table, and a remainder', () => {
  const long = getPlatformQuestionFamily('polynomials.longDivisionLinear');
  const longValues = resolveFamilyConstraints(long, {}).values;
  instancesOf(long, longValues, 200).forEach((instance) => {
    const work = instance.answer.value;
    assert.equal(work.terms.length, 3, `${instance.fingerprint}: three rounds`);
    assert.notEqual(work.remainder, '0', `${instance.fingerprint}: a remainder to write`);
  });
  const synthetic = getPlatformQuestionFamily('polynomials.syntheticDivision');
  const syntheticValues = resolveFamilyConstraints(synthetic, {}).values;
  instancesOf(synthetic, syntheticValues, 200).forEach((instance) => {
    const work = instance.answer.value;
    assert.equal(work.coefficients.filter((value) => value === '0').length, 1, `${instance.fingerprint}: one 0 placeholder`);
    assert.equal(work.coefficients.length, 5);
    assert.notEqual(work.sums.at(-1), '0', `${instance.fingerprint}: a remainder to read`);
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
      for (const field of ['mode', 'dividend', 'divisor']) assert.equal(rebuilt[field], question[field], `${questionId}: the same ${field}`);
      assert.deepEqual(evaluated.instance.answer.value, divisionKeyWork(question), `${questionId}: the live key work`);
    }
    const capacity = measureFamilyCapacity(family, values);
    assert.ok(capacity.capacity - 1 >= 12, `${questionId}: at least 12 fresh versions (capacity ${capacity.capacity})`);
  });
}

test('a family recognizes only what it stands in for: the other Warm-Up and DOL questions, and unrelated mathematics, are refused', () => {
  const unrelated = [
    { questionId: 'num', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] },
    { questionId: 'quadratic-divisor', type: 'polynomialWorkshop', mode: 'longDivision', dividend: 'y^4-3y^3+2y^2-20', divisor: 'y^2+y-5' },
    { questionId: 'scaled', type: 'polynomialWorkshop', mode: 'syntheticDivision', dividend: '4y^3-6y^2+4y-1', divisor: '2y-1' },
    { questionId: 'full-cubic', type: 'polynomialWorkshop', mode: 'longDivision', dividend: 'x^3-4x^2+6x-4', divisor: 'x-2' },
    { questionId: 'old-division', type: 'polynomialWorkshop', mode: 'division', dividend: [1, -4, -7, 10], divisor: [1, -2] },
    { questionId: 'area', type: 'polynomialWorkshop', mode: 'multiplyArea', leftFactor: 'x^2-3x+4', rightFactor: 'x-5' },
  ];
  NEW_FAMILIES.forEach((familyId) => {
    const family = getPlatformQuestionFamily(familyId);
    // A family recognizes only its own versions: a full cubic is not the
    // missing-term family's, and x − r is not 2y − 1.
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
  id: `dividing-polynomials-${variant}`,
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
      at: '2026-10-22T19:00:00.000Z',
    });
    assert.equal(TITLE, 'Algebra II Honors — Dividing Polynomials');
    assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
      'Warm-Up Q1:dp-wu-1:add:polynomials.divideMonomials',
      'Warm-Up Q2:dp-wu-2:add:polynomials.distributeMonomial',
      'Warm-Up Q3:dp-wu-3:add:polynomials.subtractForDivision',
      'DOL Q1:dp-dol-1:add:polynomials.divideByMonomial',
      'DOL Q2:dp-dol-2:add:polynomials.longDivisionLinear',
      'DOL Q3:dp-dol-3:add:polynomials.syntheticDivision',
    ]);
    assert.deepEqual(report.readiness.warmup.after, 'ready');
    assert.deepEqual(report.readiness.dol.after, 'ready');
    assert.equal(JSON.stringify(assignment.sections), before, 'the preview changes no question');
  });
}
