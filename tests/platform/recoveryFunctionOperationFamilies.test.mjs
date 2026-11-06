/*
 * RECOVERY V2 — ALGEBRA II HONORS LESSON 4'S EXIT TICKET Q1 AND Q2
 * (RC01's next shapes).
 *
 * Lesson 4's exit ticket had no Recovery for its first two questions, choice
 * boards (functions/shared/questionFamiliesFunctionOperations.mjs):
 *
 *   q_dol-4_4_1  f(x)=x²−2x+3, g(x)=2x+1: (f∘g)(x) and (g∘f)(x)    functions.composeQuadraticLinear
 *   q_dol-4_4_2  f(x)=x+4, g(x)=x−4: (f·g)(x), the input f/g excludes  functions.conjugateProductQuotient
 *
 * These tests hold the families to what a student is owed — every version is
 * valid, its key worked out here from the functions its prompt states (never
 * read from the family), marked right on the device and the server, every
 * wrong choice refused and each one the lesson's own mistake with the
 * version's numbers — and the lesson to what the teacher was promised:
 * Prepare Recovery adds both. The exit ticket is ready only when its Q3 ("are
 * these inverses?", always yes) has Recovery too, which waits on the owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import { RECOVERY_MINIMUM_FRESH_VERSIONS, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json', import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const COMPOSE = getPlatformQuestionFamily('functions.composeQuadraticLinear');
const CONJUGATE = getPlatformQuestionFamily('functions.conjugateProductQuotient');
const FAMILIES = [COMPOSE, CONJUGATE];
const LIVE = Object.freeze([
  { family: COMPOSE, questionId: 'q_dol-4_4_1', params: { b: -2, c: 3, m: 2, n: 1 }, rigor: [3, 4] },
  { family: CONJUGATE, questionId: 'q_dol-4_4_2', params: { p: 4, order: 'plusFirst', quotient: 'f/g' }, rigor: [2, 3] },
]);
// Worked by hand. Compositions: b ±1..±5, c 1..6, m 2 or 3, n ±1..±4:
// 10 × 6 × 2 × 8 = 960. Conjugates: p 2..11, either of x + p and x − p as f,
// and the quotient f/g or g/f: 10 × 2 × 2 = 40.
const COUNTS = Object.freeze({ 'functions.composeQuadraticLinear': 960, 'functions.conjugateProductQuotient': 40 });

const valuesOf = (family) => resolveFamilyConstraints(family, {}).values;
const everyInstance = (family) => {
  const walked = createFamilyInstanceSequence(family, valuesOf(family), 'function-operations-test').exhaust(5000);
  assert.equal(walked.complete, true);
  return walked.instances;
};
const build = (live, instance) => buildFamilyQuestion({
  family: live.family,
  instance,
  constraintValues: valuesOf(live.family),
  authored: recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: live.family.id, version: 1, constraints: {} } }),
});
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });

/* ---------------------------------------------------------------------------
 * Polynomials in x, worked here: [x², x, constant].
 * ------------------------------------------------------------------------- */

const ascii = (text) => String(text).replaceAll('−', '-');
/** "x²−2x+3", "2x+1", "x−4", "4x²+2" → coefficients. */
const parse = (text) => {
  const out = [0, 0, 0];
  for (const [, sign, size, x, square] of ascii(text).matchAll(/([+-]?)(\d*)(x?)(²?)/g)) {
    if (!size && !x) continue;
    const coefficient = (sign === '-' ? -1 : 1) * (size ? Number(size) : 1);
    out[x ? (square ? 0 : 1) : 2] += coefficient;
  }
  return out;
};
/** p(q(x)) for p of degree ≤ 2 and q of degree ≤ 1. */
const compose = ([a, b, c], [, m, n]) => [a * m * m, 2 * a * m * n + b * m, a * n * n + b * n + c];
const times = ([, m1, n1], [, m2, n2]) => [m1 * m2, m1 * n2 + n1 * m2, n1 * n2];
const same = (left, right) => left.every((value, index) => value === right[index]);
const asText = (coefficients) => {
  const terms = [[coefficients[0], 'x²'], [coefficients[1], 'x'], [coefficients[2], '']].filter(([value]) => value !== 0);
  return terms.map(([value, power], index) => `${value < 0 ? '−' : (index ? '+' : '')}${Math.abs(value) === 1 && power ? '' : Math.abs(value)}${power}`).join('') || '0';
};

/** The key from the prompt (and the quotient a label names), and each wrong choice as the slip that gives it. */
const workedFromPrompt = (familyId, prompt, quotientLabel = '') => {
  if (familyId === COMPOSE.id) {
    const [, fText, gText] = /^Given f\(x\)=(.+) and g\(x\)=(.+), find both compositions\.$/.exec(prompt);
    const f = parse(fText);
    const g = parse(gText);
    const [, m, n] = g;
    // (f∘g)(x) = f(g(x)); (g∘f)(x) = m·f(x) + n.
    const fog = compose(f, g);
    const gof = [m * f[0], m * f[1], m * f[2] + n];
    return {
      key: { fog: asText(fog), gof: asText(gof) },
      slips: {
        fog: [
          ['the other order, g∘f', gof],
          ['(mx + n)² with its middle term once', [m * m, m * n + f[1] * m, n * n + f[1] * n + f[2]]],
          ['x² kept, mx + n in place of the whole term bx', [1, m, n + f[2]]],
        ],
        gof: [
          ['the other order, f∘g', fog],
          ['only x² multiplied by m', [m, f[1], f[2] + n]],
          ['n added to f, never multiplied', [1, f[1], f[2] + n]],
        ],
      },
    };
  }
  const [, fText, gText] = /^Given f\(x\)=(.+) and g\(x\)=(.+), evaluate the product and quotient descriptions\.$/.exec(prompt);
  const f = parse(fText);
  const g = parse(gText);
  const zero = (line) => -line[2] / line[1];
  const shown = (value) => (value < 0 ? `−${-value}` : String(value));
  // The quotient excludes the zero of its denominator; its numerator's zero is the slip.
  const [, numerator, denominator] = /^For \(([fg])\/([fg])\)\(x\), which input is excluded\?$/.exec(quotientLabel);
  const of = { f, g };
  return {
    key: { product: asText(times(f, g)), restriction: shown(zero(of[denominator])) },
    slips: {
      product: [
        ['the constant\'s sign slipped', [1, 0, f[2] * f[2]]],
        ['f + g', [0, 2, 0]],
        ['g times itself', times(g, g)],
      ],
      restriction: [['the zero of the numerator', shown(zero(of[numerator]))], ['0', '0'], ['p², from the product', String(f[2] * f[2])]],
    },
  };
};

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('both families are registered, recognize static questions, may serve Recovery, at the exit ticket\'s rigor and standard', () => {
  FAMILIES.forEach((family) => {
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
    assert.deepEqual([...family.skill.alignments], ['A2.2D']);
  });
  LIVE.forEach((live) => {
    const { dok, band } = familyDifficultyFor(live.family, valuesOf(live.family));
    assert.deepEqual([dok, band], live.rigor, live.questionId);
  });
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesFunctionOperations.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], 'it imports only the family contract');
});

for (const family of FAMILIES) {
  test(`${family.id}: all ${COUNTS[family.id]} versions are valid and distinct, keyed from the functions the prompt states, marked right on the device and the server; every wrong choice is refused, and is the lesson's own slip`, () => {
    const live = LIVE.find((entry) => entry.family === family);
    const instances = everyInstance(family);
    assert.equal(instances.length, COUNTS[family.id]);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, COUNTS[family.id]);
    instances.forEach((instance) => {
      const question = build(live, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      const { key, slips } = workedFromPrompt(family.id, question.prompt, question.answerFields.find((field) => field.id === 'restriction')?.label);
      assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, question.prompt);
      assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
      assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
      question.answerFields.forEach((field) => {
        assert.equal(new Set(field.options).size, field.options.length, 'no repeated choice');
        assert.equal(field.options.filter((option) => option === field.answer).length, 1);
        // The wrong choices are exactly the slips, worked here.
        const expected = slips[field.id].map(([, worked]) => (Array.isArray(worked) ? asText(worked) : worked));
        assert.deepEqual(field.options.filter((option) => option !== field.answer).sort(), [...expected].sort(), `${question.prompt} ${field.id}`);
        field.options.filter((option) => option !== field.answer).forEach((wrong) => {
          if (family === COMPOSE) assert.ok(!same(parse(wrong), parse(field.answer)), `${wrong} is another polynomial`);
          const response = fieldsResponse({ ...key, [field.id]: wrong });
          assert.notEqual(gradeServerResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the server`);
          assert.notEqual(gradeOrdinaryResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the device`);
        });
      });
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((field) => assert.equal(question[field], undefined));
    });
  });
}

/* ---------------------------------------------------------------------------
 * The live questions.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId}: recognized by ${live.family.id} at the same rigor, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: {} });
    assert.deepEqual([Number(question.dok), Number(question.difficultyBand)], live.rigor);
    const evaluated = evaluateFamilyCandidate(live.family, valuesOf(live.family), recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt);
    assert.deepEqual(rebuilt.answerFields.map((field) => field.id), question.answerFields.map((field) => field.id), 'the parts in the lesson\'s order');
    rebuilt.answerFields.forEach((field) => {
      const own = question.answerFields.find((entry) => entry.id === field.id);
      assert.deepEqual([field.label, field.answer, [...field.options].sort()], [own.label, own.answer, [...own.options].sort()], `${field.id}: the lesson's own choices`);
    });
    assert.ok(measureFamilyCapacity(live.family, valuesOf(live.family)).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a question that is not exactly one of these, and every other question of the lesson', () => {
  const [composed, conjugate] = LIVE.map((live) => questionIn(live.questionId));
  const refused = [
    [COMPOSE, 'a leading coefficient on f', mutate(composed, (q) => { q.prompt = q.prompt.replace('f(x)=x²', 'f(x)=2x²'); })],
    [COMPOSE, 'the swap as the key', mutate(composed, (q) => { q.answerFields[0].answer = '2x²−4x+7'; })],
    [COMPOSE, 'another wrong choice', mutate(composed, (q) => { q.answerFields[0].options[2] = '4x²+4x+2'; })],
    [COMPOSE, 'a g it cannot write', mutate(composed, (q) => { q.prompt = q.prompt.replace('g(x)=2x+1', 'g(x)=5x+1'); })],
    [CONJUGATE, 'not a conjugate pair', mutate(conjugate, (q) => { q.prompt = q.prompt.replace('g(x)=x−4', 'g(x)=x−3'); })],
    [CONJUGATE, 'the zero of f as the key', mutate(conjugate, (q) => { q.answerFields[1].answer = '−4'; })],
    [CONJUGATE, 'another quotient named, the key unchanged', mutate(conjugate, (q) => { q.answerFields[1].label = 'For (g/f)(x), which input is excluded?'; })],
    [CONJUGATE, 'another product choice', mutate(conjugate, (q) => { q.answerFields[0].options[3] = 'x²+8x+16'; })],
  ];
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
  LESSON.questions.forEach((question) => {
    FAMILIES.forEach((family) => {
      const own = LIVE.some((live) => live.questionId === question.questionId && live.family === family);
      if (!own) assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId}`);
    });
  });
});

/* ---------------------------------------------------------------------------
 * What the teacher sees.
 * ------------------------------------------------------------------------- */

test('Prepare Recovery on Lesson 4: the exit ticket\'s Q1 and Q2 are added; the ticket waits on Q3, and no question changes', () => {
  const assignment = {
    ...structuredClone(LESSON.model.assignmentV5),
    id: 'live-a2h-l4',
    title: LESSON.model.assignmentV5.assignment.title,
    courseId: 'algebra2',
    assignedClassIds: ['class-a2h'],
    assignmentRevision: 2,
  };
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-06T15:00:00.000Z' });
  const added = report.changes.map((change) => `${change.label}:${change.family.id}`);
  assert.ok(added.includes('DOL Q1:functions.composeQuadraticLinear'), added.join('\n'));
  assert.ok(added.includes('DOL Q2:functions.conjugateProductQuotient'), added.join('\n'));
  assert.ok(!added.some((entry) => entry.startsWith('DOL Q3:')), 'Q3 ("are these inverses?") has no family: its answer is always yes');
  assert.notEqual(report.readiness.dol.after, 'ready', 'an exit ticket is ready only when every question is');
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});
