/*
 * RECOVERY V2 — THE FAMILIES BEHIND ALGEBRA II HONORS "SOLVING SYSTEMS WITH
 * MATRICES".
 *
 * The lesson went live with three static Warm-Up and three static DOL
 * questions and no family a Recovery could draw on, so Prepare Recovery said
 * "no certified family" for all six. Six new platform families
 * (functions/shared/questionFamiliesMatrices.mjs) stand in for them:
 *
 *   l3m-wu-1   matrices.arrayRecordTotals       the sales records, read as arrays
 *   l3m-wu-2   matrices.addition                Nov + Dec in the Matrix Lab
 *   l3m-wu-3   numbers.multiplicativeInverse    inverses of a whole number and a fraction
 *   l3m-dol-1  matrices.multiplication          a 2×3 times a 3×2
 *   l3m-dol-2  matrices.solveSystem3x3          A · X = B, some terms on the right
 *   l3m-dol-3  matrices.singularSystem3x3       A has no inverse: none or infinitely many
 *
 * These tests hold each family to what a student is owed (every version is a
 * valid question its own key passes and a wrong answer fails, on the server;
 * versions are distinct and plentiful), and hold the lesson to what the
 * teacher was promised: Prepare Recovery makes both sections of the Standard
 * and the Honors copy ready, from these families, without touching a question.
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
import { RECOVERY_CERTIFICATION_ISSUE, certifyRecoveryBinding, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { readMatrixLabQuestion } from '../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { readLinearEquation3 } from '../../functions/shared/questionFamiliesMatrices.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON_FILE = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const liveQuestion = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const BINDINGS = Object.freeze({
  'l3m-wu-1': { id: 'matrices.arrayRecordTotals', constraints: {} },
  'l3m-wu-2': { id: 'matrices.addition', constraints: {} },
  'l3m-wu-3': { id: 'numbers.multiplicativeInverse', constraints: {} },
  'l3m-dol-1': { id: 'matrices.multiplication', constraints: { names: 'P/Q' } },
  'l3m-dol-2': { id: 'matrices.solveSystem3x3', constraints: {} },
  'l3m-dol-3': { id: 'matrices.singularSystem3x3', constraints: { singularCase: 'none' } },
});
const NEW_FAMILIES = [...new Set(Object.values(BINDINGS).map((binding) => binding.id))];

// Every setting a binding uses, plus the singular family's other case, which
// no live question uses but which must be just as correct.
const SETTINGS = [
  ['matrices.arrayRecordTotals', {}],
  ['matrices.addition', {}],
  ['numbers.multiplicativeInverse', {}],
  ['matrices.multiplication', {}],
  ['matrices.solveSystem3x3', {}],
  ['matrices.singularSystem3x3', { singularCase: 'none' }],
  ['matrices.singularSystem3x3', { singularCase: 'many' }],
];

const instancesOf = (family, values, limit = 400) => {
  const sequence = createFamilyInstanceSequence(family, values, 'recovery-matrices-family-test');
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
  authored: { questionId: 'recovery-matrices-test' },
  tool: family.defaultTool,
});

const asNumber = (rational) => Number(rational.n) / Number(rational.d);
const keySystem = (question) => {
  const model = readMatrixLabQuestion(question);
  return { A: model.keyA.map((row) => row.map(asNumber)), B: model.keyB.map((row) => asNumber(row[0])), classification: model.classification };
};

test('the six families are registered, recognize static questions, and are Recovery-eligible', () => {
  NEW_FAMILIES.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    assert.ok(family, `${id} is registered`);
    assert.equal(typeof family.recognize, 'function', `${id} can recognize a static question`);
    assert.equal(family.recovery?.eligible, true, `${id} may serve Recovery`);
    assert.ok(family.skill.alignments.includes('A2.3B'), `${id} is aligned to the lesson's TEKS`);
  });
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesMatrices.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs'], 'no tool math, no grader, no browser module');
});

for (const [id, overrides] of SETTINGS) {
  test(`${id} ${JSON.stringify(overrides)}: 400 versions build, are valid, distinct, and are graded right and wrong by the server`, () => {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, overrides);
    const instances = instancesOf(family, values);
    assert.equal(instances.length, 400, `${id} has at least 400 versions`);
    const fingerprints = new Set();
    instances.forEach((instance) => {
      fingerprints.add(instance.fingerprint);
      const question = build(family, values, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: id }).errors, [], `${id} ${instance.fingerprint} is a valid question`);
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

test('a multi-part version marks every wrong part wrong, and each choice has exactly one right option', () => {
  for (const id of ['matrices.arrayRecordTotals', 'numbers.multiplicativeInverse']) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, {});
    instancesOf(family, values, 60).forEach((instance) => {
      const question = build(family, values, instance);
      assert.equal(question.type, 'multiAnswer');
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

test('a solve version\'s equations, as the Matrix Lab reads them, are the family\'s A and B, and two are not yet in standard form', () => {
  for (const [id, overrides] of SETTINGS.filter(([familyId]) => familyId.endsWith('System3x3'))) {
    const family = getPlatformQuestionFamily(id);
    const { values } = resolveFamilyConstraints(family, overrides);
    instancesOf(family, values, 150).forEach((instance) => {
      const question = build(family, values, instance);
      const system = keySystem(question);
      assert.deepEqual(system.A, instance.values.A, `${id} ${question.equations.join('; ')}: A`);
      assert.deepEqual(system.B, instance.values.B, `${id} ${question.equations.join('; ')}: B`);
      assert.equal(system.classification.type, instance.answer.value.classification, `${id}: the Matrix Lab classifies it as the key does`);
      question.equations.forEach((equation, index) => {
        const read = readLinearEquation3(equation);
        assert.deepEqual([read.row, read.constant], [instance.values.A[index], instance.values.B[index]], `${id}: equation ${index + 1} reads back`);
      });
      if (id === 'matrices.solveSystem3x3') {
        const onTheRight = question.equations.filter((equation) => /[xyz]/.test(equation.split('=')[1]));
        assert.equal(onTheRight.length, 2, `${id}: equations 2 and 3 each have a variable term on the right (${question.equations.join('; ')})`);
      }
    });
  }
});

test('the singular family\'s two cases: "none" breaks the multiple in the constants, "many" keeps it, and the reason names the rows', () => {
  const family = getPlatformQuestionFamily('matrices.singularSystem3x3');
  for (const singularCase of ['none', 'many']) {
    const { values } = resolveFamilyConstraints(family, { singularCase });
    instancesOf(family, values, 150).forEach((instance) => {
      const { A, B } = instance.values;
      const { classification, singularReason } = instance.answer.value;
      assert.equal(classification, singularCase);
      assert.equal(singularReason.row, 3);
      const other = singularReason.otherRow - 1;
      assert.deepEqual(A[2], A[other].map((value) => singularReason.factor * value || 0), 'row 3 is a multiple of the row it names');
      assert.equal(B[2] === singularReason.factor * B[other], singularCase === 'many', 'the constants follow the multiple only when there are infinitely many solutions');
      assert.equal(singularReason.constant, singularCase === 'many' ? 'follows' : 'breaks');
    });
  }
});

/* ---------------------------------------------------------------------------
 * Each family recognizes the live question it stands in for.
 * ------------------------------------------------------------------------- */

// The stored lesson keeps matrix rows as { cells } (Firestore holds no nested
// arrays); an authored file writes plain arrays. A family reads both.
const withArrayRows = (question) => {
  if (!question.matrices) return question;
  const matrices = Object.fromEntries(Object.entries(question.matrices).map(([name, matrix]) => [name, { ...matrix, rows: matrix.rows.map((row) => (Array.isArray(row) ? row : row.cells)) }]));
  return { ...question, matrices };
};

for (const [questionId, binding] of Object.entries(BINDINGS)) {
  test(`${questionId}: ${binding.id} recognizes the live question with the same rigor and its own key, and leaves 12+ fresh versions`, () => {
    const question = liveQuestion(questionId);
    assert.ok(question, `${questionId} is in the lesson`);
    const family = getPlatformQuestionFamily(binding.id);
    const recognized = family.recognize(question);
    assert.ok(recognized, `${binding.id} recognizes ${questionId}`);
    assert.deepEqual(family.recognize(withArrayRows(question)), recognized, 'the authored (array) form reads the same');
    Object.entries(binding.constraints).forEach(([name, value]) => assert.equal(recognized.constraints[name], value, `${questionId}: ${name}`));

    const { values } = resolveFamilyConstraints(family, recognized.constraints);
    const rigor = familyDifficultyFor(family, values);
    assert.equal(Number(rigor.dok), Number(question.dok), `${questionId}: DOK`);
    assert.equal(Number(rigor.band), Number(question.difficultyBand), `${questionId}: difficulty band`);

    // The live problem is one of the family's own versions, with the live key —
    // which is how Recovery knows never to hand it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${questionId} is a valid ${family.id} problem (${evaluated.issues})`);
    const rebuilt = build(family, values, evaluated.instance);
    if (rebuilt.type === 'multiAnswer') {
      const keyOf = (entry) => entry.answerFields.map((field) => String(field.answer));
      assert.deepEqual(keyOf(rebuilt), keyOf(question), `${questionId}: the family's key for it is the live key`);
    } else if (rebuilt.mode === 'solve') {
      assert.deepEqual(rebuilt.equations, question.equations, `${questionId}: the same system, written the same way`);
      assert.deepEqual(keySystem(rebuilt), keySystem(question), `${questionId}: the same A, B and classification`);
    } else {
      const live = readMatrixLabQuestion(question);
      assert.equal(rebuilt.operation, live.operation, `${questionId}: the same operation, written out`);
      const entries = (model) => model.result.map((row) => row.map(asNumber));
      assert.deepEqual(entries(readMatrixLabQuestion(rebuilt)), entries(live), `${questionId}: the same result matrix`);
      assert.deepEqual(evaluated.instance.answer.value.entries, entries(live), `${questionId}: the family's key is the live result`);
    }
    const capacity = measureFamilyCapacity(family, values);
    assert.ok(capacity.capacity - 1 >= 12, `${questionId}: at least 12 fresh versions (capacity ${capacity.capacity})`);
  });
}

test('a family recognizes only what it stands in for: the other Warm-Up and DOL questions, and unrelated mathematics, are refused', () => {
  const unrelated = [
    { questionId: 'quad', type: 'multiAnswer', prompt: 'Find the vertex of y = x² − 4x + 1.', answerFields: [{ id: 'vertex', type: 'text', answerFormat: 'orderedPair', answer: '(2, -3)' }] },
    { questionId: 'num', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] },
    { questionId: 'mx-sub', type: 'matrixLab', mode: 'operate', operation: 'subtract', left: 'A', right: 'B', matrices: { A: { rows: [[1, 2], [3, 4]] }, B: { rows: [[0, 1], [1, 0]] } } },
    { questionId: 'two-var', type: 'matrixLab', mode: 'solve', equations: ['x + y = 3', '2x - y = 0'] },
  ];
  NEW_FAMILIES.forEach((familyId) => {
    const family = getPlatformQuestionFamily(familyId);
    unrelated.forEach((question) => assert.equal(family.recognize(question), null, `${familyId} does not recognize ${question.questionId}`));
    // (A Classwork question of the same kind may well be recognized: it is the
    // same skill. Only the Warm-Up and DOL are bound.)
    Object.entries(BINDINGS).forEach(([questionId, binding]) => {
      if (binding.id === familyId) return;
      assert.equal(family.recognize(liveQuestion(questionId)), null, `${familyId} does not recognize ${questionId}`);
    });
  });
});

test('a singular system is never "solved", and the singular family never stands in for the wrong case', () => {
  const solve = getPlatformQuestionFamily('matrices.solveSystem3x3');
  assert.equal(solve.recognize(liveQuestion('l3m-dol-3')), null, 'a singular system is not a one-solution system');
  const singular = getPlatformQuestionFamily('matrices.singularSystem3x3');
  assert.equal(singular.recognize(liveQuestion('l3m-dol-2')), null, 'a one-solution system is not singular');
  // The live DOL has no solution; a binding that asked for "infinitely many"
  // versions is a different concept, and certification refuses it.
  const assignment = { ...structuredClone(LESSON.model.assignmentV5), id: 'live-matrices' };
  const questions = flattenAssignmentQuestions(assignment);
  const question = questions.find((entry) => entry.questionId === 'l3m-dol-3');
  const certify = (constraints) => certifyRecoveryBinding({
    assignmentId: assignment.id,
    question,
    storageIndex: questions.indexOf(question),
    section: 'dol',
    questionFamily: { id: 'matrices.singularSystem3x3', version: 1, constraints },
    questions,
    label: 'DOL Q3',
    gradeSample: serverRecoveryKeyCheck,
  });
  assert.equal(certify({ singularCase: 'none' }).ok, true, 'the reviewed setting certifies');
  const refused = certify({ singularCase: 'many' });
  assert.equal(refused.ok, false);
  assert.ok(refused.issues.some((issue) => issue.code === RECOVERY_CERTIFICATION_ISSUE.CONCEPT_MISMATCH), JSON.stringify(refused.issues));
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on the live Standard and Honors copies.
 * ------------------------------------------------------------------------- */

const TITLE = LESSON.model.assignmentV5.assignment.title;
const liveCopy = (variant) => ({
  ...structuredClone(LESSON.model.assignmentV5),
  id: `live-matrices-${variant}`,
  title: TITLE,
  courseId: 'algebra2',
  courseProfile: { course: 'algebra2', courseLevel: variant },
  rigorVariant: variant,
  assignedClassIds: [`class-${variant}`],
  assignmentRevision: 2,
});

for (const variant of ['standard', 'honors']) {
  test(`Prepare Recovery on the ${variant} copy: both sections become ready from the six families, and no question changes`, () => {
    const assignment = liveCopy(variant);
    const { report } = buildRecoveryUpgradePreview({
      assignment,
      manifest: null,
      gradeSample: serverRecoveryKeyCheck,
      trackers: [],
      at: '2026-10-21T15:00:00.000Z',
    });
    assert.equal(TITLE, 'Algebra II Honors — Solving Systems with Matrices');
    assert.equal(report.migrationId, null, 'no prepared migration: the platform proposes the bindings itself');
    assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
      'Warm-Up Q1:l3m-wu-1:add:matrices.arrayRecordTotals',
      'Warm-Up Q2:l3m-wu-2:add:matrices.addition',
      'Warm-Up Q3:l3m-wu-3:add:numbers.multiplicativeInverse',
      'DOL Q1:l3m-dol-1:add:matrices.multiplication',
      'DOL Q2:l3m-dol-2:add:matrices.solveSystem3x3',
      'DOL Q3:l3m-dol-3:add:matrices.singularSystem3x3',
    ]);
    report.changes.forEach((change) => {
      assert.ok(change.freshVersions >= 12, `${change.label}: ${change.freshVersions} fresh versions`);
      assert.ok(change.standards.includes('A2.3B') && change.rigor?.dok, `${change.label} reports its TEKS and rigor`);
      assert.deepEqual(change.constraints, BINDINGS[change.questionId].constraints, `${change.label}: the setting it was recognized with`);
    });
    assert.deepEqual(report.readiness, {
      warmup: { before: 'unavailable', after: 'ready', message: null },
      dol: { before: 'unavailable', after: 'ready', message: null },
    });
    assert.equal(report.fullyReadyAfter, true);
    assert.deepEqual(report.notReady, []);
    assert.deepEqual(report.recoveryContent, { versionBefore: 0, versionAfter: 1, bindingsBefore: 0, bindingsAfter: 6 });
    assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
    assert.deepEqual(report.writes, [
      `assignments/live-matrices-${variant}: the recoveryContent field only (version 0 → 1)`,
      'assignmentVersionEvents/<new>: one recoveryUpgrade audit event',
    ]);
  });
}

// RC11 (Codex on #511): the singular-system recognizer read the case from the
// first pair of proportional rows only. When every row is a multiple of the
// first, the first pair can keep its constants while another pair breaks
// them: that system has no solution, and is now recognized as "none".
test('a singular system is classified by all its proportional rows, not the first pair', () => {
  const singular = getPlatformQuestionFamily('matrices.singularSystem3x3');
  const system = (equations) => ({ type: 'matrixLab', mode: 'solve', justifySingular: true, equations });
  // Row 3 = 2 · row 1 with its constant following (2 · 3 = 6), but row 2 =
  // −1 · row 1 with its constant broken (−3 ≠ 5): no solution.
  const broken = singular.recognize(system(['x + y + z = 3', '-x - y - z = 5', '2x + 2y + 2z = 6']));
  assert.equal(broken.constraints.singularCase, 'none');
  const { row, otherRow, factor } = broken.params.multiple;
  assert.notEqual(broken.params.B[row - 1], factor * broken.params.B[otherRow - 1], 'the pair named is one that breaks');
  // Every pair follows: infinitely many.
  const kept = singular.recognize(system(['x + y + z = 3', '-x - y - z = -3', '2x + 2y + 2z = 6']));
  assert.equal(kept.constraints.singularCase, 'many');
  // One proportional pair, as the family writes them, reads as before.
  assert.equal(singular.recognize(system(['x + 2y - z = 4', '3x - y + 2z = 1', '2x + 4y - 2z = 8'])).constraints.singularCase, 'many');
  assert.equal(singular.recognize(system(['x + 2y - z = 4', '3x - y + 2z = 1', '2x + 4y - 2z = 9'])).constraints.singularCase, 'none');
});
