/*
 * RECOVERY V2 — THE ALEKS BRIDGE LESSON: "x's LIE, y's TELL THE TRUTH"
 * (RC01's next shapes).
 *
 * Algebra II Honors Module 1's ALEKS bridge lesson ("Absolute Value") had no
 * Recovery. Its five Warm-Up and DOL questions, four families
 * (functions/shared/questionFamiliesTransformationLanguage.mjs):
 *
 *   q_warmup-transform-language_1_1  g(x)=f(x−4)+3: both translations      transformations.describeTranslations
 *   q_warmup-transform-language_1_2  g(x)=f(−2x): reflection, scale        transformations.describeScaleChange (inside)
 *   q_warmup-transform-language_1_3  g(x)=−(1/2)f(x)+2: the same, and up   transformations.describeScaleChange (outside)
 *   q_dol-absolute-value_4_1         y=−2|x+3|+1: vertex … range           absoluteValue.analyzeTransformed
 *   q_dol-absolute-value_4_2         match y=(1/2)|x−4|−2 in the lab       transformations.matchAbsoluteValue
 *
 * These tests hold the families to what a student is owed — every version is
 * valid, its key worked out here from the equation it states by the class
 * rule (never read from the family), marked right on the device and the
 * server, and every wrong choice refused — and the lesson to what the teacher
 * was promised: Prepare Recovery makes both sections ready.
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
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json', import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const TRANSLATIONS = getPlatformQuestionFamily('transformations.describeTranslations');
const SCALE = getPlatformQuestionFamily('transformations.describeScaleChange');
const ANALYZE = getPlatformQuestionFamily('absoluteValue.analyzeTransformed');
const MATCH = getPlatformQuestionFamily('transformations.matchAbsoluteValue');
const FAMILIES = [TRANSLATIONS, SCALE, ANALYZE, MATCH];

const LIVE = Object.freeze([
  { family: TRANSLATIONS, questionId: 'q_warmup-transform-language_1_1', params: { C: 4, D: 3 }, constraints: {}, rigor: [1, 2] },
  { family: SCALE, questionId: 'q_warmup-transform-language_1_2', params: { factor: '2' }, constraints: { side: 'inside' }, rigor: [2, 2] },
  { family: SCALE, questionId: 'q_warmup-transform-language_1_3', params: { factor: '1/2', D: 2 }, constraints: { side: 'outside' }, rigor: [2, 2] },
  { family: ANALYZE, questionId: 'q_dol-absolute-value_4_1', params: { a: 2, h: -3, k: 1 }, constraints: {}, rigor: [2, 3] },
  { family: MATCH, questionId: 'q_dol-absolute-value_4_2', params: { n: 2, h: 4, k: -2 }, constraints: {}, rigor: [3, 4] },
]);
// Worked by hand. Translations: C and D each ±1..±9, 18 × 18 = 324. The class
// rule's factor: 2..9 or its reciprocal, 16; inside f that is all, outside f
// with D ±1..±9, 16 × 18 = 288. The analysis: a 2..5, h and k ±1..±6,
// 4 × 12 × 12 = 576. The match: 1/2, 1/3, 1/4 with h and k ±1..±5, 3 × 10 × 10 = 300.
const COUNTS = Object.freeze({ translations: 324, inside: 16, outside: 288, analyze: 576, match: 300 });
const SETTINGS = Object.freeze([
  { name: 'translations', live: LIVE[0] },
  { name: 'inside', live: LIVE[1] },
  { name: 'outside', live: LIVE[2] },
  { name: 'analyze', live: LIVE[3] },
  { name: 'match', live: LIVE[4] },
]);

const valuesOf = (live) => resolveFamilyConstraints(live.family, live.constraints).values;
const everyInstance = (live) => {
  const walked = createFamilyInstanceSequence(live.family, valuesOf(live), 'transformation-language-test').exhaust(5000);
  assert.equal(walked.complete, true);
  return walked.instances;
};
const build = (live, instance) => buildFamilyQuestion({
  family: live.family,
  instance,
  constraintValues: valuesOf(live),
  authored: recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: live.family.id, version: 1, constraints: live.constraints } }),
});

/* ---------------------------------------------------------------------------
 * The key, by the class rule, from the equation the prompt states.
 * ------------------------------------------------------------------------- */

const ascii = (text) => String(text).replaceAll('−', '-');
const shift = (sign, size, [ifMinus, ifPlus]) => `${sign === '-' ? ifMinus : ifPlus} ${size}`;
/** "2" or "(1/2)": a factor n or 1/n. */
const factorIn = (text) => {
  const fraction = /^\(1\/(\d)\)$/.exec(text);
  return fraction ? { n: Number(fraction[1]), fraction: true } : { n: Number(text), fraction: false };
};
/** Inside f a factor works in reverse ("x's lie"); outside f it does what it says. */
const scaleKey = ({ n, fraction }, inside) => ((inside ? !fraction : fraction) ? `compression by 1/${n}` : `stretch by ${n}`);

const keyFromPrompt = (name, prompt) => {
  const text = ascii(prompt);
  if (name === 'translations') {
    const [, hSign, h, vSign, v] = /^For g\(x\)=f\(x([+-])(\d)\)([+-])(\d), describe/.exec(text);
    // x − 4 inside f moves right; + 3 outside f moves up.
    return { horizontal: shift(hSign, h, ['right', 'left']), vertical: shift(vSign, v, ['down', 'up']) };
  }
  if (name === 'inside') {
    const [, factor] = /Describe g\(x\)=f\(-(\(1\/\d\)|\d)x\)\.$/.exec(text);
    return { reflection: 'across the y-axis', scale: scaleKey(factorIn(factor), true) };
  }
  if (name === 'outside') {
    const [, factor, sign, size] = /Describe g\(x\)=-(\(1\/\d\)|\d)f\(x\)([+-])(\d)\.$/.exec(text);
    return { reflection: 'across the x-axis', scale: scaleKey(factorIn(factor), false), shift: shift(sign, size, ['down', 'up']) };
  }
  const [, a, hSign, h, kSign, k] = /^Analyze y=-(\d)\|x([+-])(\d)\|([+-])(\d)\.$/.exec(text);
  const vertexX = hSign === '+' ? -Number(h) : Number(h);
  const vertexY = kSign === '+' ? Number(k) : -Number(k);
  const signed = (value) => (value < 0 ? `−${-value}` : String(value));
  return {
    vertex: `(${signed(vertexX)}, ${signed(vertexY)})`,
    reflection: 'across the x-axis',
    scale: `stretch by ${a}`,
    horizontal: shift(hSign, h, ['right', 'left']),
    vertical: shift(kSign, k, ['down', 'up']),
    // Opening down from the vertex.
    range: `(−∞, ${signed(vertexY)}]`,
  };
};
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('the four families are registered, recognize static questions, may serve Recovery, at the lesson\'s rigor and standard', () => {
  FAMILIES.forEach((family) => {
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
    assert.deepEqual([...family.skill.alignments], ['A2.6C']);
  });
  LIVE.forEach((live) => {
    const { dok, band } = familyDifficultyFor(live.family, valuesOf(live));
    assert.deepEqual([dok, band], live.rigor, live.questionId);
  });
  assert.deepEqual([SCALE.constraintPolicy, [...SCALE.conceptConstraints]], ['strict', ['side']], 'inside or outside f is a strict concept');
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesTransformationLanguage.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], 'it imports only the family contract');
});

for (const { name, live } of SETTINGS.filter((setting) => setting.name !== 'match')) {
  test(`${live.family.id}${live.constraints.side ? ` (${live.constraints.side})` : ''}: all ${COUNTS[name]} versions are valid and distinct, their keys are the class rule's, marked right on the device and the server, and every wrong choice is refused`, () => {
    const instances = everyInstance(live);
    assert.equal(instances.length, COUNTS[name]);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, COUNTS[name]);
    instances.forEach((instance) => {
      const question = build(live, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      const key = keyFromPrompt(name, question.prompt);
      assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, question.prompt);
      assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
      assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
      question.answerFields.forEach((field) => {
        assert.equal(new Set(field.options).size, field.options.length, 'no repeated choice');
        assert.equal(field.options.filter((option) => option === field.answer).length, 1);
        field.options.filter((option) => option !== field.answer).forEach((wrong) => {
          const response = fieldsResponse({ ...key, [field.id]: wrong });
          assert.notEqual(gradeServerResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the server`);
          assert.notEqual(gradeOrdinaryResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the device`);
        });
      });
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((field) => assert.equal(question[field], undefined));
    });
  });
}

test(`transformations.matchAbsoluteValue: all ${COUNTS.match} versions draw the target the prompt states; the lab marks it matched on the device and the server, and another a, h or k not`, () => {
  const live = LIVE[4];
  const instances = everyInstance(live);
  assert.equal(instances.length, COUNTS.match);
  assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, COUNTS.match);
  instances.forEach((instance) => {
    const question = build(live, instance);
    assert.deepEqual([question.type, question.mode, question.family], ['transformationsLab', 'match', 'absolute']);
    assert.deepEqual([question.graphBounds, question.initial], [{ xMin: -8, xMax: 8, yMin: -8, yMax: 8 }, { a: 1, h: 0, k: 0 }], 'the lesson\'s window and start');
    assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
    // The target is the function the prompt states.
    const [, n, hSign, h, kSign, k] = /^Transform y=\|x\| to y=\(1\/(\d)\)\|x([+-])(\d)\|([+-])(\d)\. Match the target graph, then use the vertex and width to verify your work\.$/.exec(ascii(question.prompt));
    const stated = { a: 1 / Number(n), h: hSign === '-' ? Number(h) : -Number(h), k: kSign === '+' ? Number(k) : -Number(k) };
    assert.deepEqual(question.target, stated, question.prompt);
    const boxes = (values) => ({ a: String(values.a), h: String(values.h), k: String(values.k) });
    const browser = gradeToolWork({ toolId: 'transformationsLab', question, work: boxes(stated) });
    assert.equal(browser.isCorrect, true, `${question.prompt}: the stated function matches`);
    assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true, 'the server agrees');
    [{ ...stated, a: Number(n) }, { ...stated, h: -stated.h }, { ...stated, k: stated.k + 1 }].forEach((wrong) => {
      assert.notEqual(gradeToolWork({ toolId: 'transformationsLab', question, work: boxes(wrong) }).isCorrect, true, `${question.prompt}: ${JSON.stringify(wrong)}`);
    });
    const responses = recoveryKeyResponses(question, instance);
    assert.equal(gradeServerResponse({ question, response: responses.right }).isCorrect, true, 'its own key');
    assert.notEqual(gradeServerResponse({ question, response: responses.wrong }).isCorrect, true, 'another a');
    assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
    ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((field) => assert.equal(question[field], undefined));
  });
});

/* ---------------------------------------------------------------------------
 * The live questions.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId}: recognized by ${live.family.id} at the same rigor, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: live.constraints });
    assert.deepEqual([Number(question.dok), Number(question.difficultyBand)], live.rigor);
    const evaluated = evaluateFamilyCandidate(live.family, valuesOf(live), recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt);
    if (live.family === MATCH) {
      assert.deepEqual([rebuilt.target, rebuilt.graphBounds, rebuilt.initial], [question.target, question.graphBounds, question.initial]);
    } else {
      assert.deepEqual(rebuilt.answerFields.map((field) => field.id), question.answerFields.map((field) => field.id), 'the parts in the lesson\'s order');
      rebuilt.answerFields.forEach((field) => {
        const own = question.answerFields.find((entry) => entry.id === field.id);
        assert.deepEqual([field.label, field.answer, [...field.options].sort()], [own.label, own.answer, [...own.options].sort()], `${field.id}: the lesson's own choices`);
      });
    }
    assert.ok(measureFamilyCapacity(live.family, valuesOf(live)).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a question that is not exactly one of these, and every other question of the lesson', () => {
  const [translations, inside, outside, analyze, match] = LIVE.map((live) => questionIn(live.questionId));
  const refused = [
    [TRANSLATIONS, 'the shift read at face value as the key', mutate(translations, (q) => { q.answerFields[0].answer = 'left 4'; })],
    [TRANSLATIONS, 'a scale as well', mutate(translations, (q) => { q.prompt = 'For g(x)=2f(x−4)+3, describe the horizontal and vertical translations.'; })],
    [SCALE, 'no reflection', mutate(inside, (q) => { q.prompt = q.prompt.replace('f(−2x)', 'f(2x)'); })],
    [SCALE, 'a factor outside f read in reverse as the key', mutate(outside, (q) => { q.answerFields[1].answer = 'stretch by 2'; })],
    [SCALE, 'another class rule', mutate(outside, (q) => { q.prompt = q.prompt.replace('the class rule', 'the rule'); })],
    [ANALYZE, 'a V opening up', mutate(analyze, (q) => { q.prompt = 'Analyze y=2|x+3|+1.'; })],
    [ANALYZE, 'another vertex choice', mutate(analyze, (q) => { q.answerFields[0].options[2] = '(3, −1)'; })],
    [ANALYZE, 'a range without its vertex', mutate(analyze, (q) => { q.answerFields[5].answer = '(−∞, 3]'; })],
    [MATCH, 'a stretch', mutate(match, (q) => { q.target.a = 2; q.prompt = q.prompt.replace('(1/2)', '2'); })],
    [MATCH, 'another window', mutate(match, (q) => { q.graphBounds.xMax = 10; })],
    [MATCH, 'a prompt that names another target', mutate(match, (q) => { q.prompt = q.prompt.replace('|x−4|', '|x−3|'); })],
    [MATCH, 'identify mode', mutate(match, (q) => { q.mode = 'identify'; })],
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

test('Prepare Recovery on the ALEKS bridge lesson: all five questions are added, both sections become ready, and no question changes', () => {
  const assignment = {
    ...structuredClone(LESSON.model.assignmentV5),
    id: 'live-aleks-bridge',
    title: LESSON.model.assignmentV5.assignment.title,
    courseId: 'algebra2',
    assignedClassIds: ['class-a2h'],
    assignmentRevision: 2,
  };
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-06T15:00:00.000Z' });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.family.id}:${JSON.stringify(change.constraints)}`), [
    'Warm-Up Q1:transformations.describeTranslations:{}',
    'Warm-Up Q2:transformations.describeScaleChange:{"side":"inside"}',
    'Warm-Up Q3:transformations.describeScaleChange:{"side":"outside"}',
    'DOL Q1:absoluteValue.analyzeTransformed:{}',
    'DOL Q2:transformations.matchAbsoluteValue:{}',
  ]);
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  assert.equal(report.fullyReadyAfter, true);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});
