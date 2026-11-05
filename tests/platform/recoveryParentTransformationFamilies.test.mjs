/*
 * RECOVERY V2 — THE TRANSFORMATIONS EXIT TICKET OF ALGEBRA II HONORS MODULE 1,
 * LESSON 2 DAY 2 (RC01).
 *
 * The lesson's DOL is three static questions no family recognized, so its DOL
 * had no Recovery. One family each now recognizes them
 * (functions/shared/questionFamiliesParentTransformations.mjs):
 *
 *   q_dol-4_4_1   read y = −2∛(x − 1) − 3 off its graph       transformations.identifyCubeRoot
 *   q_dol-4_4_2   describe g(x) = −f(3(x + 2)) + 4            transformations.describeEveryChange
 *   q_dol-4_4_3   map (0, 1) through y = −3·2^(x − 2) + 1     transformations.mapExponentialPoint
 *
 * The Warm-Up is three reviews of parent functions (|x|, √x, 2ˣ): every fresh
 * version of one would have the same answer, which needs the owner's
 * decision, so they stay without Recovery and the Warm-Up "not ready".
 *
 * These tests hold the families to what a student is owed — every version is
 * a valid question the server marks right with its own key and wrong with one
 * part wrong; versions are distinct and plentiful; the key is re-derived here
 * from what the student READS (the lab's own reading of the graph, the
 * function in the prompt), never from the family's key — and hold the lesson
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
import { RECOVERY_MINIMUM_FRESH_VERSIONS, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions, recoveryPreparationAvailable } from '../../functions/shared/recoveryContentPlan.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryExclusionFingerprints, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { evaluateTransformedFunction, mapParentPoint, resolveTransformationsQuestion } from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const LESSON_FILE = 'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const IDENTIFY = getPlatformQuestionFamily('transformations.identifyCubeRoot');
const DESCRIBE = getPlatformQuestionFamily('transformations.describeEveryChange');
const MAP = getPlatformQuestionFamily('transformations.mapExponentialPoint');

const LIVE = Object.freeze([
  { questionId: 'q_dol-4_4_1', family: IDENTIFY, params: { a: -2, h: 1, k: -3 }, constraints: { reflected: true } },
  { questionId: 'q_dol-4_4_2', family: DESCRIBE, params: { B: 3, C: -2, D: 4 }, constraints: { reflections: 'vertical' } },
  { questionId: 'q_dol-4_4_3', family: MAP, params: { a: -3, h: 2, k: 1 }, constraints: { reflected: true } },
]);
const LESSON_FINGERPRINTS = Object.freeze([
  'transformations.identifyCubeRoot:-2|1|-3',
  'transformations.describeEveryChange:vertical|3|-2|4',
  'transformations.mapExponentialPoint:-3|2|1',
]);

// Worked by hand from the parameter domains and rules, for the live slots:
//   identify   a −2 or −3, h and k ±1..4: 2 × 8 × 8 = 128, less the 8 with
//              a = −3 and k = −4, whose point (h − 1, k − a)… (h + 1, −7)
//              sits on the window's edge: 120
//   describe   B 2..5, C and D ±1..6: 4 × 12 × 12 = 576
//   map        a −2..−4, h and k ±1..5: 3 × 10 × 10 = 300, less the 30
//              whose image lands on the x-axis (k = −a): 270
const VERSIONS = Object.freeze([[IDENTIFY, 120], [DESCRIBE, 576], [MAP, 270]]);

const valuesFor = (family) => resolveFamilyConstraints(family, LIVE.find((live) => live.family === family).constraints).values;
const everyInstance = (family) => {
  const walked = createFamilyInstanceSequence(family, valuesFor(family), 'parent-transformations-test').exhaust(5000);
  assert.equal(walked.complete, true, `${family.id}: the whole list was walked`);
  return walked.instances;
};
/** A version as Recovery builds it: from a slot that carries the original's identity and none of its wording. */
const build = (family, instance) => {
  const live = LIVE.find((entry) => entry.family === family);
  const slot = recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: family.id, version: 1, constraints: live.constraints } });
  return buildFamilyQuestion({ family, instance, constraintValues: valuesFor(family), authored: slot });
};

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('the three families are registered, recognize static questions, may serve Recovery, and keep the move the question is about', () => {
  for (const [family, concept, rigor] of [[IDENTIFY, 'reflected', [2, 3]], [DESCRIBE, 'reflections', [3, 4]], [MAP, 'reflected', [3, 4]]]) {
    assert.ok(family, 'registered');
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
    assert.deepEqual([...family.skill.alignments], ['A2.2A']);
    assert.equal(family.constraintPolicy, 'strict');
    assert.deepEqual([...family.conceptConstraints], [concept]);
    const { dok, band } = familyDifficultyFor(family, valuesFor(family));
    assert.deepEqual([dok, band], rigor, `${family.id}: the lesson's rigor`);
  }
  assert.equal(resolveFamilyConstraints(DESCRIBE, { reflections: 'diagonal' }).fatal, true);
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesParentTransformations.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs']);
});

for (const [family, count] of VERSIONS) {
  test(`${family.id}: all ${count} versions build in the original's tool, are valid and distinct, and the server marks each one's key right and one part wrong wrong`, () => {
    const instances = everyInstance(family);
    assert.equal(instances.length, count);
    assert.equal(measureFamilyCapacity(family, valuesFor(family), { budget: 2048 }).capacity, count, 'the capacity certification reads');
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, count, 'no two versions are the same');
    instances.forEach((instance) => {
      const question = build(family, instance);
      const label = `${instance.fingerprint}`;
      assert.equal(question.type, family === DESCRIBE ? 'multiAnswer' : 'transformationsLab');
      // The lab is a registry tool with its own schema; a typed-and-chosen board is not.
      if (question.type === 'transformationsLab') assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(question, { label }).errors, [], label);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${label}: certification answers it from the key`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${label}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${label}: one part wrong is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], label);
    });
  });
}

/* ---------------------------------------------------------------------------
 * The mathematics, re-derived from what the student reads.
 * ------------------------------------------------------------------------- */

test('identify: the lab draws the key\'s own cube root, its inflection point and the points one unit either side are on the grid, and the prompt gives no number', () => {
  everyInstance(IDENTIFY).forEach((instance) => {
    const question = build(IDENTIFY, instance);
    const lab = resolveTransformationsQuestion(question);
    assert.equal(lab.family, 'cubeRoot');
    assert.equal(lab.showB, false, 'no b box: a, h and k only');
    const { a, h, k } = lab.investigationSpec;
    assert.ok(a <= -2 && a >= -3 && h !== 0 && k !== 0, `${instance.fingerprint}: reflected, stretched, shifted both ways`);
    [[h, k], [h + 1, k + a], [h - 1, k - a]].forEach(([x, y]) => {
      assert.ok(Math.abs(evaluateTransformedFunction(lab.investigationSpec, x) - y) < 1e-9, 'on the drawn graph');
      assert.ok(x > lab.graphBounds.xMin && x < lab.graphBounds.xMax && y > lab.graphBounds.yMin && y < lab.graphBounds.yMax, `(${x}, ${y}) is inside the window`);
    });
    assert.doesNotMatch(question.prompt, /\d/);
    // The student who types what the graph shows is right.
    const work = { a: String(a), h: String(h), k: String(k) };
    assert.equal(gradeToolWork({ toolId: 'transformationsLab', question, work }).isCorrect, true);
    assert.equal(gradeServerResponse({ question, response: buildToolResponse({ question, toolId: 'transformationsLab', work }) }).isCorrect, true);
  });
});

const describedBy = (prompt) => {
  const match = /^Describe g\(x\)=(−?)f\((−?)(\d)\(x([+−])(\d)\)\)([+−])(\d)\.$/.exec(prompt);
  assert.ok(match, prompt);
  const [, outside, inside, b, shiftSign, shift, liftSign, lift] = match;
  return { a: outside ? -1 : 1, b: (inside ? -1 : 1) * Number(b), h: shiftSign === '+' ? -Number(shift) : Number(shift), k: liftSign === '+' ? Number(lift) : -Number(lift) };
};

test('describe: each part\'s one right choice is what g(x) in the prompt does, among three different choices, and the board grades by it', () => {
  everyInstance(DESCRIBE).forEach((instance) => {
    const question = build(DESCRIBE, instance);
    const { a, b, h, k } = describedBy(question.prompt);
    assert.ok(a === -1 && b > 1, `${question.prompt}: a reflection across the x-axis, as the original makes`);
    const expected = {
      xreflection: b < 0 ? 'across the y-axis' : 'none',
      ysreflection: a < 0 ? 'across the x-axis' : 'none',
      hscale: `compression by 1/${Math.abs(b)}`,
      horizontal: h < 0 ? `left ${-h}` : `right ${h}`,
      vertical: k > 0 ? `up ${k}` : `down ${-k}`,
    };
    assert.deepEqual(question.answerFields.map((field) => field.id), Object.keys(expected));
    question.answerFields.forEach((field) => {
      assert.equal(field.answer, expected[field.id], `${question.prompt} ${field.label}`);
      assert.equal(new Set(field.options).size, 3, 'three different choices');
      assert.equal(field.options.filter((option) => option === expected[field.id]).length, 1, 'exactly one right');
    });
    assert.ok(question.answerFields.some((field) => field.options[0] !== field.answer), 'the key is not always the first choice');
  });
});

test('map: the key is (0, 1) carried through the function the prompt states, by the lab\'s own mapping, and never on an axis', () => {
  everyInstance(MAP).forEach((instance) => {
    const question = build(MAP, instance);
    const match = /^Map the parent-function point \(0, 1\) through \$y=(-\d)\*2\^\(x([+-]\d)\)([+-]\d)\$\.$/.exec(question.prompt);
    assert.ok(match, question.prompt);
    const stated = { type: 'exponential', a: Number(match[1]), base: 2, h: -Number(match[2]), k: Number(match[3]) };
    const lab = resolveTransformationsQuestion(question);
    assert.deepEqual([lab.family, lab.parentPoint, lab.investigationSpec.base], ['exponential', [0, 1], 2]);
    assert.deepEqual(['a', 'h', 'k'].map((key) => lab.investigationSpec[key]), ['a', 'h', 'k'].map((key) => stated[key]), 'the lab draws the stated function');
    const image = mapParentPoint([0, 1], stated);
    assert.ok(image.every((coordinate) => coordinate !== 0));
    assert.ok(!question.prompt.includes(`(${image[0]}, ${image[1]})`), 'the prompt does not give the image');
    const work = { mappedX: String(image[0]), mappedY: String(image[1]) };
    assert.equal(gradeToolWork({ toolId: 'transformationsLab', question, work }).isCorrect, true);
    assert.equal(gradeServerResponse({ question, response: buildToolResponse({ question, toolId: 'transformationsLab', work }) }).isCorrect, true);
  });
});

test('a version never carries a hint, a step or a worked solution', () => {
  VERSIONS.forEach(([family]) => everyInstance(family).slice(0, 60).forEach((instance) => {
    const question = build(family, instance);
    ['hints', 'scaffold', 'steps', 'solution', 'workedSolution', 'solutionReview', 'guidedNotes', 'answerKey'].forEach((name) => {
      assert.equal(question[name], undefined, `${family.id}: no ${name}`);
    });
  }));
});

/* ---------------------------------------------------------------------------
 * The families recognize the live questions they stand in for — and nothing else.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId}: recognized by ${live.family.id} at the same rigor, with the live numbers, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: live.constraints });
    const values = valuesFor(live.family);
    const { dok, band } = familyDifficultyFor(live.family, values);
    assert.deepEqual([dok, band], [Number(question.dok), Number(question.difficultyBand)]);
    const evaluated = evaluateFamilyCandidate(live.family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${evaluated.issues}`);
    const rebuilt = build(live.family, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt, 'the same prompt');
    if (live.family === DESCRIBE) {
      const shape = (q) => q.answerFields.map(({ id, label, type, options, answer }) => ({ id, label, type, options: [...options].sort(), answer }));
      assert.deepEqual(shape(rebuilt), shape(question), 'the same parts, choices and key');
    } else {
      ['type', 'mode', 'family', 'function', 'parentPoint'].forEach((field) => assert.deepEqual(rebuilt[field], question[field], field));
    }
    assert.ok(measureFamilyCapacity(live.family, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a question that is not exactly one of these', () => {
  const identify = questionIn('q_dol-4_4_1');
  const describe = questionIn('q_dol-4_4_2');
  const map = questionIn('q_dol-4_4_3');
  const refused = [
    [IDENTIFY, 'another parent', mutate(identify, (q) => { q.family = 'cubic'; q.function.family = 'cubic'; q.function.type = 'cubic'; })],
    [IDENTIFY, 'another mode', mutate(identify, (q) => { q.mode = 'describe'; })],
    [IDENTIFY, 'a b box', mutate(identify, (q) => { q.function.b = 2; })],
    [IDENTIFY, 'a window of its own', mutate(identify, (q) => { q.graphBounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }; })],
    [IDENTIFY, 'starting boxes of its own', mutate(identify, (q) => { q.initial = { a: -1, h: 0, k: 0 }; })],
    [IDENTIFY, 'a fractional stretch', mutate(identify, (q) => { q.function.a = -0.5; })],
    [IDENTIFY, 'no horizontal shift', mutate(identify, (q) => { q.function.h = 0; })],
    [IDENTIFY, 'a stretch outside the lesson\'s', mutate(identify, (q) => { q.function.a = -5; })],
    [IDENTIFY, 'a prompt with more to it', mutate(identify, (q) => { q.prompt = 'Read the transformed cube-root graph through (1, −3) and determine a, h, and k.'; })],
    [DESCRIBE, 'another function', mutate(describe, (q) => { q.prompt = 'Describe g(x)=−f(3(x+2))+5.'; })],
    [DESCRIBE, 'a vertical stretch too', mutate(describe, (q) => { q.prompt = 'Describe g(x)=−2f(3(x+2))+4.'; })],
    [DESCRIBE, 'a wrong key', mutate(describe, (q) => { q.answerFields[3].answer = 'right 2'; })],
    [DESCRIBE, 'another choice', mutate(describe, (q) => { q.answerFields[2].options[1] = 'stretch by 1/3'; })],
    [DESCRIBE, 'another label', mutate(describe, (q) => { q.answerFields[0].label = 'Reflection'; })],
    [DESCRIBE, 'a part more', mutate(describe, (q) => { q.answerFields.push({ id: 'vscale', label: 'Vertical scale', type: 'choice', options: ['unchanged', 'stretch by 2'], answer: 'unchanged' }); })],
    [DESCRIBE, 'a part less', mutate(describe, (q) => { q.answerFields.pop(); })],
    [DESCRIBE, 'a typed part', mutate(describe, (q) => { q.answerFields[4] = { id: 'vertical', label: 'Vertical translation', answer: 'up 4' }; })],
    [MAP, 'another parent point', mutate(map, (q) => { q.parentPoint = [1, 2]; q.prompt = 'Map the parent-function point (1, 2) through $y=-3*2^(x-2)+1$.'; })],
    [MAP, 'another base', mutate(map, (q) => { q.function.base = 3; })],
    [MAP, 'a prompt for another function', mutate(map, (q) => { q.prompt = 'Map the parent-function point (0, 1) through $y=-3*2^(x-2)+2$.'; })],
    [MAP, 'a prompt in other words', mutate(map, (q) => { q.prompt = 'Where does (0, 1) land under $y=-3*2^(x-2)+1$?'; })],
    [MAP, 'an image on the x-axis', mutate(map, (q) => { q.function.k = 3; q.prompt = 'Map the parent-function point (0, 1) through $y=-3*2^(x-2)+3$.'; })],
    [MAP, 'another mode', mutate(map, (q) => { q.mode = 'anchor'; })],
  ];
  assert.ok(IDENTIFY.recognize(identify) && DESCRIBE.recognize(describe) && MAP.recognize(map), 'the three DOL questions as written are recognized');
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
});

test('recognize refuses every other question of the lesson: its parent-function reviews, Classwork and Practice', () => {
  LESSON.questions.filter((question) => question.activityRole !== 'dol').forEach((question) => {
    [IDENTIFY, DESCRIBE, MAP].forEach((family) => assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId} "${question.prompt}"`));
  });
});

test('the lesson\'s own DOL problems are kept out of every Recovery', () => {
  const questions = flattenAssignmentQuestions(LESSON.model.assignmentV5);
  assert.deepEqual(recoveryExclusionFingerprints({ questions, families: [IDENTIFY, DESCRIBE, MAP] }).sort(), [...LESSON_FINGERPRINTS].sort());
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on a live copy.
 * ------------------------------------------------------------------------- */

const liveCopy = (id) => ({
  ...structuredClone(LESSON.model.assignmentV5),
  id,
  title: LESSON.model.assignmentV5.assignment.title,
  courseId: 'algebra2',
  assignedClassIds: ['class-a2h'],
  assignmentRevision: 2,
});
const AT = '2026-11-05T15:00:00.000Z';

test('Prepare Recovery: the three DOL questions are added and the DOL becomes ready; the parent-function reviews keep the Warm-Up not ready; no question changes', () => {
  const assignment = liveCopy('live-l2-day-2');
  assert.equal(recoveryPreparationAvailable(assignment), true);
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}`), [
    'DOL Q1:q_dol-4_4_1:add:transformations.identifyCubeRoot',
    'DOL Q2:q_dol-4_4_2:add:transformations.describeEveryChange',
    'DOL Q3:q_dol-4_4_3:add:transformations.mapExponentialPoint',
  ]);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'unavailable', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  assert.deepEqual(report.notReady.map((row) => `${row.label}:${row.issues[0].code}`), ['Warm-Up Q1:no-certified-family', 'Warm-Up Q2:no-certified-family', 'Warm-Up Q3:no-certified-family']);
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

/* ---------------------------------------------------------------------------
 * A student who missed the DOL, after the teacher prepared it.
 * ------------------------------------------------------------------------- */

const CLASS = 'class-a2h';
const DAY = '2026-11-02';
const T0 = Date.parse('2026-11-02T16:00:00Z');
const T1 = Date.parse('2026-11-04T15:00:00Z');
const BEFORE = {
  ...liveCopy('live-l2-day-2-journey'),
  courseProfile: { course: 'algebra2', courseLevel: 'honors' },
  rigorVariant: 'honors',
  dueAt: '2026-11-03T23:59:00.000Z',
  lateDueAt: '2026-11-20T23:59:00.000Z',
  warmup: { instructionDate: DAY },
  dol: { instructionDate: DAY },
};
const PREPARED = (() => {
  const preview = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: preview.plan, planHash: preview.planHash, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
  return { ...BEFORE, recoveryContent: applied.recoveryContent };
})();
const QUESTIONS = getStoredAssignmentQuestions(PREPARED);
const DOL = QUESTIONS.map((question, index) => (question.activityRole === 'dol' ? index : null)).filter((index) => index !== null);
const MISSED = Object.fromEntries(DOL.map((index) => [index, { status: 'expired', attemptCount: 1, totalAttempts: 1, gradedBy: 'server', lastAttemptAt: new Date(T0 - 3_600_000).toISOString(), supportUsage: {} }]));

const contextFor = ({ assignment = PREPARED, records = {} } = {}) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const original = splitGradesBySection({ tracker: MISSED, assignment }).dol;
  return buildSectionRecoveryContext({
    assignment,
    section: 'dol',
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'dol'),
    questions,
    tracker: MISSED,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record: records.dol || null,
    studentId: 'student-missed-dol',
    classId: CLASS,
    classPeriod: 'Period 3',
    schedule: null,
    supportEvents: [],
    overrides: null,
    sectionModeFor: () => 'shared',
    nowValue: T1,
  });
};
const reproduce = (context, item) => {
  const reproduced = reproduceFamilyQuestionFromPin({
    question: runtimeRepairedQuestion(context.questionsByIndex[item.storageIndex]),
    assignmentId: context.assignmentId,
    storageIndex: item.storageIndex,
    pin: item.pin,
  });
  assert.ok(!reproduced.error, reproduced.error);
  return { ...reproduced, question: deliveredQuestionForGrading(reproduced.question) };
};

test('the missed DOL: Practice and the Recovery are fresh versions of each question, never one from the lesson, graded by the server', () => {
  assert.deepEqual(getStoredAssignmentQuestions(BEFORE), QUESTIONS, 'the originals are the questions students answered, byte for byte');
  const unprepared = contextFor({ assignment: BEFORE }).eligibility;
  assert.deepEqual([unprepared.state, unprepared.reason], [RECOVERY_STATE.UNAVAILABLE, 'generation-unavailable']);
  assert.equal(contextFor().eligibility.state, RECOVERY_STATE.LOCKED);
  const seen = contextFor().seenFingerprints;
  LESSON_FINGERPRINTS.forEach((fingerprint) => assert.ok(seen.includes(fingerprint), `${fingerprint} is never dealt as fresh`));

  let records = {};
  let context = contextFor();
  const dealt = [];
  for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item, 'a Practice question is dealt');
    const { question, instance } = reproduce(context, item);
    assert.equal(question.type, QUESTIONS[item.storageIndex].type, 'in the original\'s tool');
    const outcome = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
      at: T1 + step * 60_000,
    });
    assert.equal(outcome.response.isCorrect, true, 'the server marks the right answer right');
    dealt.push(item.pin.fingerprint);
    records = { dol: outcome.record };
    context = contextFor({ records });
  }
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, 'Practice on its own unlocks it');
  assert.equal(new Set(dealt).size, dealt.length, 'no Practice question repeats');
  dealt.forEach((fingerprint) => assert.ok(!LESSON_FINGERPRINTS.includes(fingerprint), `${fingerprint} is not a problem from the lesson`));

  const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
  const { plan } = started.record;
  assert.deepEqual(plan.items.map((item) => item.storageIndex), DOL, 'one Recovery question per DOL question, in order');
  const running = contextFor({ records: { dol: started.record } });
  const responses = {};
  plan.items.forEach((item, index) => {
    assert.ok(!LESSON_FINGERPRINTS.includes(item.pin.fingerprint));
    assert.ok(!dealt.includes(item.pin.fingerprint), `${item.itemId} was not already practised`);
    assert.equal(item.pin.familyId, LIVE[index].family.id, `DOL Q${index + 1} is recovered by its own family`);
    const { question, instance } = reproduce(running, item);
    const keys = recoveryKeyResponses(question, instance);
    assert.notEqual(gradeServerResponse({ question, response: keys.wrong })?.isCorrect, true);
    responses[item.itemId] = keys.right;
  });
  const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
  assert.equal(submitted.record.status, 'completed');
  assert.equal(submitted.record.rawScore, 100);
});
