/*
 * RECOVERY V2 — INVERSES OF RELATIONS AND LINEAR FUNCTIONS (RC01's next shapes).
 *
 * Algebra II Honors Module 1 Lesson 3 had no Recovery, and Lesson 4's Warm-Up
 * 1 reviews the same inverse. Five typed-and-chosen boards, four families
 * (functions/shared/questionFamiliesInverses.mjs):
 *
 *   L3 q_warmup-1_1_1  (−3, 7) swapped; f(4) for f(x)=2x−5       functions.swapPairAndEvaluate
 *   L3 q_dol-4_4_1     the inverse of {(−2, 5), (1, 7), (4, 0)}   relations.inverseOfSet
 *   L3 q_dol-4_4_2     f⁻¹ of f(x)=4x−9 and a check               functions.inverseOfLinear (find)
 *   L4 q_warmup-1_1_1  f⁻¹ of f(x)=2x+5 and a check               functions.inverseOfLinear (review)
 *   L3 q_dol-4_4_3     C⁻¹ for C(m)=15m+25; months for $115       functions.inverseInContext
 *
 * These tests hold the families to what a student is owed — every version is a
 * valid question graded right with its own key and wrong with any wrong part,
 * on the device and the server, its key worked out here from what the
 * question shows, and exactly one choice in each part true — and the lessons
 * to what the teacher was promised.
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
import { recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const compile = (name) => compileTeacherImport(readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-module1/${name}.json`, import.meta.url), 'utf8'));
const L3 = compile('L3_Inverse_Linear_Functions');
const L4 = compile('L4_Operations_on_Functions_Composition');
const questionIn = (lesson, questionId) => lesson.questions.find((question) => question.questionId === questionId);

const SWAP = getPlatformQuestionFamily('functions.swapPairAndEvaluate');
const SET = getPlatformQuestionFamily('relations.inverseOfSet');
const LINEAR = getPlatformQuestionFamily('functions.inverseOfLinear');
const CONTEXT = getPlatformQuestionFamily('functions.inverseInContext');
const FAMILIES = [SWAP, SET, LINEAR, CONTEXT];

const LIVE = Object.freeze([
  { lesson: L3, family: SWAP, questionId: 'q_warmup-1_1_1', params: { p: -3, q: 7, m: 2, b: -5, c: 4 }, constraints: {}, rigor: [1, 1], standard: 'A2.7I' },
  { lesson: L3, family: SET, questionId: 'q_dol-4_4_1', params: { x1: -2, g1: 3, g2: 3, y1: 5, y2: 7, y3: 0 }, constraints: {}, rigor: [2, 2], standard: 'A2.2B' },
  { lesson: L3, family: LINEAR, questionId: 'q_dol-4_4_2', params: { a: 4, b: -9, c: 6 }, constraints: { task: 'find' }, rigor: [2, 3], standard: 'A2.2B' },
  { lesson: L4, family: LINEAR, questionId: 'q_warmup-1_1_1', params: { a: 2, b: 5, c: 3 }, constraints: { task: 'review' }, rigor: [2, 2], standard: 'A2.2B' },
  { lesson: L3, family: CONTEXT, questionId: 'q_dol-4_4_3', params: { rate: 15, fee: 25, months: 6 }, constraints: {}, rigor: [3, 3], standard: 'A2.2B' },
]);

// Worked by hand: f(x) = ax + b, a 2..9, b ±1..±9, c 1..9, with f(c) ≥ 1 and f(c) ≠ c.
let LINEAR_COUNT = 0;
for (let a = 2; a <= 9; a += 1) for (let b = -9; b <= 9; b += 1) for (let c = 1; c <= 9; c += 1) {
  if (b !== 0 && a * c + b >= 1 && a * c + b !== c) LINEAR_COUNT += 1;
}
const SAMPLE = 400;

const valuesOf = (family, constraints = {}) => resolveFamilyConstraints(family, constraints).values;
const versionsOf = (family, constraints = {}) => {
  const sequence = createFamilyInstanceSequence(family, valuesOf(family, constraints), 'inverse-families-test');
  if (family === LINEAR) {
    const walked = sequence.exhaust(5000);
    assert.equal(walked.complete, true);
    return walked.instances;
  }
  return Array.from({ length: SAMPLE }, (_, index) => sequence.instanceAt(index));
};
/** A version as Recovery builds it: from a slot with the original's identity and none of its wording. */
const build = (live, instance) => buildFamilyQuestion({
  family: live.family,
  instance,
  constraintValues: valuesOf(live.family, live.constraints),
  authored: recoverySourceQuestion(questionIn(live.lesson, live.questionId), { questionFamily: { id: live.family.id, version: 1, constraints: live.constraints } }),
});

/* ---------------------------------------------------------------------------
 * What a version shows, read without the family.
 * ------------------------------------------------------------------------- */

const ascii = (text) => String(text).replaceAll('−', '-');
/** "(x+9)/4", "4x+9", "9−4x" as a function of x. */
const expression = (text) => {
  const t = ascii(text);
  let match = /^\(x([+-])(\d+)\)\/(\d+)$/.exec(t);
  if (match) return (x) => (x + (match[1] === '+' ? 1 : -1) * Number(match[2])) / Number(match[3]);
  match = /^(\d+)x([+-])(\d+)$/.exec(t);
  if (match) return (x) => Number(match[1]) * x + (match[2] === '+' ? 1 : -1) * Number(match[3]);
  match = /^(\d+)-(\d+)x$/.exec(t);
  if (match) return (x) => Number(match[1]) - Number(match[2]) * x;
  throw new Error(`not read: ${text}`);
};
/** Is `option` the inverse of f? It undoes f at several inputs. */
const undoes = (f, option) => [-3, 0, 2, 7].every((x) => Math.abs(expression(option)(f(x)) - x) < 1e-9);
const linearFrom = (text) => {
  const [, a, sign, b] = /f\(x\)=(\d+)x([+-])(\d+)/.exec(ascii(text));
  return (x) => Number(a) * x + (sign === '+' ? 1 : -1) * Number(b);
};
const pairsIn = (text) => [...ascii(text).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
const fieldOf = (question, id) => question.answerFields.find((field) => field.id === id);

/** Every part's key, worked out from the question, and the choices that are true. */
const keyFromQuestion = (family, question) => {
  if (family === LINEAR || family === CONTEXT) {
    const f = family === LINEAR ? linearFrom(question.prompt) : (() => {
      const [, rate, fee] = /C\(m\)=(\d+)m\+(\d+)/.exec(question.prompt);
      return (m) => Number(rate) * m + Number(fee);
    })();
    const inverse = fieldOf(question, 'inverse');
    const trueInverses = inverse.options.filter((option) => undoes(f, option));
    assert.equal(trueInverses.length, 1, `${question.prompt}: exactly one choice is the inverse`);
    if (family === CONTEXT) {
      const [, total] = /\$(\d+)$/.exec(fieldOf(question, 'months').label);
      return { inverse: trueInverses[0], months: expression(trueInverses[0])(Number(total)) };
    }
    const [, input, output] = /^If f\((\d+)\)=(-?\d+), then$/.exec(ascii(fieldOf(question, 'check').label));
    assert.equal(f(Number(input)), Number(output), 'the check states a true value of f');
    // "f⁻¹(15)=6" is true when f(6) = 15.
    const trueChecks = fieldOf(question, 'check').options.filter((option) => {
      const [, at, value] = /^f⁻¹\((-?\d+)\)=(-?\d+)$/.exec(ascii(option));
      return f(Number(value)) === Number(at);
    });
    assert.equal(trueChecks.length, 1, 'exactly one check is true');
    return { inverse: trueInverses[0], check: trueChecks[0] };
  }
  if (family === SET) {
    const relation = pairsIn(question.prompt);
    const inverse = relation.map(([x, y]) => [y, x]);
    const trueSets = fieldOf(question, 'inverse').options.filter((option) => JSON.stringify(pairsIn(option)) === JSON.stringify(inverse));
    assert.equal(trueSets.length, 1, `${question.prompt}: exactly one choice swaps every pair`);
    return { inverse: trueSets[0], rule: 'swapping x and y' };
  }
  const [[p, q]] = pairsIn(fieldOf(question, 'swap').label);
  const swapped = fieldOf(question, 'swap').options.filter((option) => JSON.stringify(pairsIn(option)) === JSON.stringify([[q, p]]));
  assert.equal(swapped.length, 1, 'exactly one choice is the swapped pair');
  const [, rule, at] = /^If (f\(x\)=.*), then f\((\d+)\)=$/.exec(ascii(fieldOf(question, 'eval').label));
  return { swap: swapped[0], eval: linearFrom(rule)(Number(at)) };
};
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('the four families are registered, recognize static questions, may serve Recovery, at the lessons\' rigor and standards', () => {
  FAMILIES.forEach((family) => {
    assert.ok(family, 'registered');
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
  });
  LIVE.forEach((live) => {
    assert.ok(live.family.skill.alignments.includes(live.standard), `${live.questionId}: ${live.standard}`);
    const rigor = familyDifficultyFor(live.family, valuesOf(live.family, live.constraints));
    assert.deepEqual([rigor.dok, rigor.band], live.rigor, `${live.questionId}: DOK and band`);
  });
  assert.deepEqual(LINEAR.conceptConstraints, ['task'], 'find or review is a strict concept, each at its lesson\'s rigor');
  assert.equal(LINEAR.constraintPolicy, 'strict');
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesInverses.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], 'it imports only the family contract');
});

for (const live of LIVE) {
  const setting = live.constraints.task ? ` (${live.constraints.task})` : '';
  test(`${live.family.id}${setting}: every version is valid and distinct, its key is what the question shows, marked right on the device and the server, and a wrong part is refused`, () => {
    const instances = versionsOf(live.family, live.constraints);
    if (live.family === LINEAR) {
      assert.equal(instances.length, LINEAR_COUNT);
      assert.equal(measureFamilyCapacity(LINEAR, valuesOf(LINEAR, live.constraints), { budget: 2048 }).capacity, LINEAR_COUNT);
    } else {
      assert.equal(instances.filter(Boolean).length, SAMPLE);
    }
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, instances.length, 'no two versions are the same problem');
    instances.forEach((instance) => {
      const question = build(live, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      const key = keyFromQuestion(live.family, question);
      assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, question.prompt);
      assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
      assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
      question.answerFields.forEach((field) => {
        assert.equal(new Set(field.options || []).size, (field.options || []).length, 'no repeated choice');
        const wrongs = field.type === 'choice' ? field.options.filter((option) => option !== field.answer) : [Number(field.answer) + 1];
        wrongs.forEach((wrong) => {
          const response = fieldsResponse({ ...key, [field.id]: wrong });
          assert.notEqual(gradeServerResponse({ question, response }).isCorrect, true, `${instance.fingerprint}: ${field.id} = ${wrong} on the server`);
          assert.notEqual(gradeOrdinaryResponse({ question, response }).isCorrect, true, `${instance.fingerprint}: ${field.id} = ${wrong} on the device`);
        });
      });
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
      assert.ok(recoveryKeyResponses(question, instance));
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
    });
  });
}

/* ---------------------------------------------------------------------------
 * The live questions.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.lesson === L3 ? 'L3' : 'L4'} ${live.questionId}: recognized by ${live.family.id} at the same rigor, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.lesson, live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: live.constraints });
    assert.deepEqual([question.dok, question.difficultyBand].map(Number), live.rigor);
    const values = valuesOf(live.family, recognized.constraints);
    const evaluated = evaluateFamilyCandidate(live.family, values, recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt);
    question.answerFields.forEach((field, index) => {
      const written = rebuilt.answerFields.find((entry) => entry.id === field.id);
      assert.ok(written, field.id);
      assert.equal(written.label, field.label);
      assert.equal(String(written.answer), String(field.answer));
      assert.deepEqual([...(written.options || [])].sort(), [...(field.options || [])].sort(), `${field.id}: the lesson's own choices`);
      assert.equal(rebuilt.answerFields.indexOf(written), index, 'the parts in the lesson\'s order');
    });
    assert.ok(measureFamilyCapacity(live.family, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a board that is not exactly one of these, and every other question of both lessons', () => {
  const swap = questionIn(L3, 'q_warmup-1_1_1');
  const set = questionIn(L3, 'q_dol-4_4_1');
  const find = questionIn(L3, 'q_dol-4_4_2');
  const review = questionIn(L4, 'q_warmup-1_1_1');
  const context = questionIn(L3, 'q_dol-4_4_3');
  const refused = [
    [SWAP, 'a wrong value of f', mutate(swap, (q) => { q.answerFields[1].answer = 4; })],
    [SWAP, 'a pair that negates back to itself', mutate(swap, (q) => { q.answerFields[0].label = 'If (−3, 3) is in a relation, the swapped ordered pair is'; q.answerFields[0].options = ['(3, −3)', '(−3, 3)', '(−3, 3)']; q.answerFields[0].answer = '(3, −3)'; })],
    [SWAP, 'another choice', mutate(swap, (q) => { q.answerFields[0].options[2] = '(3, 7)'; })],
    [SET, 'a pair that swaps to itself', mutate(set, (q) => { q.prompt = 'Find the inverse relation of {(−2, 5), (1, 1), (4, 0)}.'; })],
    [SET, 'the key unswapped', mutate(set, (q) => { q.answerFields[0].answer = '{(−2, 5), (1, 7), (4, 0)}'; })],
    [SET, 'four pairs', mutate(set, (q) => { q.prompt = 'Find the inverse relation of {(−2, 5), (1, 7), (4, 0), (6, 2)}.'; })],
    [LINEAR, 'a wrong key', mutate(find, (q) => { q.answerFields[0].answer = '(x−9)/4'; })],
    [LINEAR, 'a check that is not a value of f', mutate(find, (q) => { q.answerFields[1].label = 'If f(6)=14, then'; })],
    [LINEAR, 'a fraction coefficient', mutate(find, (q) => { q.prompt = 'Find the inverse of f(x)=(1/2)x−9.'; })],
    [LINEAR, 'another prompt', mutate(review, (q) => { q.prompt = 'For f(x)=2x+5, identify f⁻¹(x).'; })],
    [LINEAR, 'a third part', mutate(review, (q) => { q.answerFields.push({ id: 'graph', label: 'Graph', type: 'choice', options: ['a', 'b'], answer: 'a' }); })],
    [CONTEXT, 'a total that is not a whole number of months', mutate(context, (q) => { q.answerFields[1].label = 'Months represented by a total cost of $116'; })],
    [CONTEXT, 'a typed inverse', mutate(context, (q) => { q.answerFields[0] = { id: 'inverse', label: 'm=C⁻¹(x)', answer: '(x−25)/15', answerFormat: 'expression' }; })],
  ];
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
  [L3, L4].forEach((lesson) => lesson.questions.forEach((question) => {
    FAMILIES.forEach((family) => {
      const own = LIVE.some((live) => live.lesson === lesson && live.questionId === question.questionId && live.family === family);
      if (!own) assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId}`);
    });
  }));
});

/* ---------------------------------------------------------------------------
 * What the teacher sees.
 * ------------------------------------------------------------------------- */

const liveCopy = (lesson, id) => ({
  ...structuredClone(lesson.model.assignmentV5),
  id,
  title: lesson.model.assignmentV5.assignment.title,
  courseId: 'algebra2',
  assignedClassIds: ['class-a2h'],
  assignmentRevision: 2,
});
const preview = (assignment) => buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-06T15:00:00.000Z' }).report;

test('Prepare Recovery on Lesson 3: its Warm-Up review and all three exit-ticket questions are added, both sections become ready, and no question changes', () => {
  const assignment = liveCopy(L3, 'live-l3');
  const report = preview(assignment);
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.family.id}`), [
    'Warm-Up Q1:functions.swapPairAndEvaluate',
    'DOL Q1:relations.inverseOfSet',
    'DOL Q2:functions.inverseOfLinear',
    'DOL Q3:functions.inverseInContext',
  ]);
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  // Warm-Up Q2 and Q3 have the same answer in every version of them: the owner's decision.
  assert.deepEqual(report.notReady.map((row) => row.label), ['Warm-Up Q2', 'Warm-Up Q3']);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

test('Prepare Recovery on Lesson 4: its Warm-Up becomes 3 of 3, and the exit ticket still waits', () => {
  const assignment = liveCopy(L4, 'live-l4');
  const report = preview(assignment);
  // The exit ticket's Q1 and Q2 have the function-operation families; its Q3 waits on the owner.
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.family.id}`), [
    'Warm-Up Q1:functions.inverseOfLinear',
    'Warm-Up Q2:functions.pointwiseFromValues',
    'Warm-Up Q3:functions.compositionFromValues',
    'DOL Q1:functions.composeQuadraticLinear',
    'DOL Q2:functions.conjugateProductQuotient',
  ]);
  assert.deepEqual(report.changes[0].constraints, { task: 'review' });
  assert.deepEqual(report.readiness.warmup, { before: 'unavailable', after: 'ready', message: null });
  assert.equal(report.readiness.dol.after, 'unavailable');
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});
