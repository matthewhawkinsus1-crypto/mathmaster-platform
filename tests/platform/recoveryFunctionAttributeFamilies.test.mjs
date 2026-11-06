/*
 * RECOVERY V2 — LESSON 1 DAY 2'S EXIT TICKET: A GRAPHED PARABOLA'S INTERVALS
 * AND THE FILLING TANK (RC01's next shapes).
 *
 * Algebra II Honors Module 1 Lesson 1 Day 2's exit ticket had Recovery for its
 * Mapping Diagram only (Q2), so it was not ready. Its other two questions:
 *
 *   q_dol-4_4_1  where f(x) = −(x − 2)² + 9 increases, decreases, is positive
 *                and negative (Graph Analysis)       functions.intervalsFromGraph
 *   q_dol-4_4_3  a tank filled at 4 gallons a minute for 12 minutes: discrete
 *                or continuous, domain, range       functions.fillingTankAttributes
 *
 * These tests hold the families to what a student is owed — every version is
 * valid, its key is what the function or the situation gives (worked out here,
 * never read from the family), the graph workspace's own reading agrees, it is
 * marked right on the device and the server and a wrong answer is not — and
 * the lesson to what the teacher was promised: the exit ticket is ready, and
 * a student who missed it gets fresh versions, graded by the server.
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
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryExclusionFingerprints, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const DAY_TWO = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json', import.meta.url), 'utf8'));
const questionIn = (questionId) => DAY_TWO.questions.find((question) => question.questionId === questionId);
const INTERVALS = getPlatformQuestionFamily('functions.intervalsFromGraph');
const TANK = getPlatformQuestionFamily('functions.fillingTankAttributes');

const LIVE = Object.freeze([
  { family: INTERVALS, questionId: 'q_dol-4_4_1', params: { h: 2, s: 3 }, rigor: [3, 4] },
  { family: TANK, questionId: 'q_dol-4_4_3', params: { rate: 4, minutes: 12 }, rigor: [2, 2] },
]);
// Worked by hand: a vertex h of ±1..±7 and zeros h ± s for s 1..3: 14 × 3 = 42.
// A rate of 2..9 gallons a minute for 5..20 minutes, never the same number: 8 × 16 − 5 = 123.

const valuesOf = (family) => resolveFamilyConstraints(family, {}).values;
const everyInstance = (family) => {
  const walked = createFamilyInstanceSequence(family, valuesOf(family), 'function-attribute-test').exhaust(5000);
  assert.equal(walked.complete, true);
  return walked.instances;
};
const build = (family, instance) => {
  const live = LIVE.find((entry) => entry.family === family);
  return buildFamilyQuestion({
    family,
    instance,
    constraintValues: valuesOf(family),
    authored: recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: family.id, version: 1, constraints: {} } }),
  });
};

/** The function the prompt states: f(x) = −(x − h)² + k. */
const readParabola = (prompt) => {
  const match = /^For f\(x\) = −\(x ([+−]) (\d)\)² \+ (\d), state the intervals where the function is increasing, decreasing, positive, and negative\.$/.exec(prompt);
  assert.ok(match, prompt);
  return { h: match[1] === '+' ? -Number(match[2]) : Number(match[2]), k: Number(match[3]) };
};
/** The intervals, worked out from the function: it rises to the vertex, then falls; above the axis between its zeros. */
const intervalsOf = ({ h, k }) => {
  const s = Math.sqrt(k);
  assert.ok(Number.isInteger(s), 'whole-number zeros');
  return {
    increasing: `(−∞, ${h})`,
    decreasing: `(${h}, ∞)`,
    positive: `(${h - s}, ${h + s})`,
    negative: `(−∞, ${h - s}) ∪ (${h + s}, ∞)`,
  };
};
const typed = (answers) => ({ analysis: { answers } });

/** The tank's key, from the situation the prompt states. */
const tankKey = (prompt) => {
  const [, rate, minutes] = /^A tank is filled at (\d+) gallons per minute for exactly (\d+) minutes\. Let V\(t\)=\1t for 0 ≤ t ≤ \2\. Complete the attributes\.$/.exec(prompt) || [];
  assert.ok(rate, prompt);
  return { continuity: 'continuous', domain: `[0, ${minutes}]`, range: `[0, ${Number(rate) * Number(minutes)}]` };
};
const fieldsResponse = (values) => ({ kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value: String(value), isComplete: true })) });

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('both families are registered, recognize static questions, may serve Recovery, at the exit ticket\'s rigor and standard', () => {
  LIVE.forEach(({ family, rigor }) => {
    assert.equal(typeof family.recognize, 'function');
    assert.equal(family.recovery.eligible, true);
    assert.deepEqual([...family.skill.alignments], ['A2.7I']);
    const { dok, band } = familyDifficultyFor(family, valuesOf(family));
    assert.deepEqual([dok, band], rigor);
  });
  ['questionFamiliesGraphReading.mjs', 'questionFamiliesFunctionContexts.mjs'].forEach((file) => {
    const source = readFileSync(new URL(`../../functions/shared/${file}`, import.meta.url), 'utf8');
    assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], `${file} imports only the family contract`);
  });
});

test(`functions.intervalsFromGraph: all 42 versions are valid and distinct; the workspace reads the function the prompt states, and marks the intervals right and any wrong one wrong`, () => {
  const instances = everyInstance(INTERVALS);
  assert.equal(instances.length, 42);
  assert.equal(measureFamilyCapacity(INTERVALS, valuesOf(INTERVALS), { budget: 2048 }).capacity, 42);
  assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, 42);
  instances.forEach((instance) => {
    const question = build(INTERVALS, instance);
    assert.equal(question.type, 'graphAnalysis');
    assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
    const stated = readParabola(question.prompt);
    assert.deepEqual(question.functionSpec, { type: 'quadratic', a: -1, h: stated.h, k: stated.k }, 'the function drawn is the one stated');
    assert.ok(stated.h !== 0, 'the vertex is off the y-axis');
    const model = graphWorkspaceModelFor(question, { analysisMode: true });
    assert.deepEqual(model.analysisParts.map((part) => part.kind), ['increasing', 'decreasing', 'positive', 'negative']);
    const expected = intervalsOf(stated);
    const browser = gradeToolWork({ toolId: 'graphAnalysis', question, work: typed(expected) });
    assert.equal(browser.isCorrect, true, `${question.prompt} → ${JSON.stringify(expected)}`);
    assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true, 'the server agrees');
    // Any one interval wrong — the rising and falling traded, or a sign region flipped — is wrong.
    const wrongs = [
      { ...expected, increasing: expected.decreasing, decreasing: expected.increasing },
      { ...expected, positive: expected.negative, negative: expected.positive },
      { ...expected, positive: `[${stated.h - Math.sqrt(stated.k)}, ${stated.h + Math.sqrt(stated.k)}]` },
    ];
    wrongs.forEach((wrong) => {
      const graded = gradeToolWork({ toolId: 'graphAnalysis', question, work: typed(wrong) });
      assert.notEqual(graded.isCorrect, true, `${question.prompt}: ${JSON.stringify(wrong)}`);
      assert.notEqual(gradeServerResponse({ question, response: graded.toolResponse }).isCorrect, true);
    });
    // The family's key, as certification sends it.
    const responses = recoveryKeyResponses(question, instance);
    assert.equal(gradeServerResponse({ question, response: responses.right }).isCorrect, true, `${instance.fingerprint}: its own key`);
    assert.notEqual(gradeServerResponse({ question, response: responses.wrong }).isCorrect, true, `${instance.fingerprint}: rising and falling traded`);
    assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
    ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
    assert.doesNotMatch(question.prompt, /∞|\[|\(-|\(−\d/, 'no interval in the prompt');
  });
});

test(`functions.fillingTankAttributes: all 123 versions are valid and distinct, their keys are what the situation gives, marked right on the device and the server, and every wrong choice is refused`, () => {
  const instances = everyInstance(TANK);
  assert.equal(instances.length, 123);
  assert.equal(measureFamilyCapacity(TANK, valuesOf(TANK), { budget: 2048 }).capacity, 123);
  assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, 123);
  instances.forEach((instance) => {
    const question = build(TANK, instance);
    assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
    const key = tankKey(question.prompt);
    assert.deepEqual(Object.fromEntries(question.answerFields.map((field) => [field.id, field.answer])), key, question.prompt);
    assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the device');
    assert.equal(gradeServerResponse({ question, response: fieldsResponse(key) }).isCorrect, true, 'on the server');
    question.answerFields.forEach((field) => {
      assert.equal(new Set(field.options).size, field.options.length, 'no repeated choice');
      assert.equal(field.options.filter((option) => option === field.answer).length, 1);
      field.options.filter((option) => option !== field.answer).forEach((wrong) => {
        const response = fieldsResponse({ ...key, [field.id]: wrong });
        assert.notEqual(gradeServerResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the server`);
        assert.notEqual(gradeOrdinaryResponse({ question, response }).isCorrect, true, `${field.id} = ${wrong} on the device`);
      });
    });
    assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
    assert.deepEqual(Object.values(lightRecoveryKeyCheck(question, instance)), [true, true, true], 'Pre-Flight\'s light check agrees');
    ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
  });
});

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
    const rebuilt = build(live.family, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt);
    if (live.family === INTERVALS) {
      assert.deepEqual(rebuilt.functionSpec, question.functionSpec);
      assert.deepEqual(rebuilt.analysisRequests, question.analysisRequests);
    } else {
      rebuilt.answerFields.forEach((field) => {
        const own = question.answerFields.find((entry) => entry.id === field.id);
        assert.deepEqual([field.label, field.answer, [...field.options].sort()], [own.label, own.answer, [...own.options].sort()], `${field.id}: the lesson's own choices`);
      });
    }
    assert.ok(measureFamilyCapacity(live.family, valuesOf(live.family)).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a question that is not exactly one of these, and every other question of the lesson', () => {
  const intervals = questionIn('q_dol-4_4_1');
  const tank = questionIn('q_dol-4_4_3');
  const refused = [
    [INTERVALS, 'opening up', mutate(intervals, (q) => { q.functionSpec.a = 1; })],
    [INTERVALS, 'zeros that are not whole numbers', mutate(intervals, (q) => { q.functionSpec.k = 8; q.prompt = q.prompt.replace('+ 9', '+ 8'); })],
    [INTERVALS, 'a prompt that names another function', mutate(intervals, (q) => { q.prompt = q.prompt.replace('(x − 2)', '(x − 3)'); })],
    [INTERVALS, 'a fifth request', mutate(intervals, (q) => { q.analysisRequests.push({ id: 'domain', kind: 'domain', notation: 'interval' }); })],
    [INTERVALS, 'a request with its own answers', mutate(intervals, (q) => { q.analysisRequests[0].acceptedAnswers = ['(-inf,2)']; })],
    [INTERVALS, 'a window of its own', mutate(intervals, (q) => { q.graph = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }; })],
    [TANK, 'a range that does not follow the rate', mutate(tank, (q) => { q.answerFields[2].answer = '[0, 50]'; })],
    [TANK, 'another rule', mutate(tank, (q) => { q.prompt = q.prompt.replace('V(t)=4t', 'V(t)=5t'); })],
    [TANK, 'another choice', mutate(tank, (q) => { q.answerFields[1].options[2] = '[0, ∞)'; })],
    [TANK, 'a fourth part', mutate(tank, (q) => { q.answerFields.push({ id: 'rate', label: 'Rate', answer: 4, answerFormat: 'number' }); })],
  ];
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
  DAY_TWO.questions.filter((question) => !LIVE.some((live) => live.questionId === question.questionId)).forEach((question) => {
    [INTERVALS, TANK].forEach((family) => assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId}`));
  });
  // Lesson 1 Day 1's domain-and-range parabola is the other graph family's, never this one's.
  const dayOne = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json', import.meta.url), 'utf8'));
  dayOne.questions.forEach((question) => assert.equal(INTERVALS.recognize(question), null, question.questionId));
});

/* ---------------------------------------------------------------------------
 * What the teacher sees, and a student who missed the exit ticket.
 * ------------------------------------------------------------------------- */

const liveCopy = (id) => ({
  ...structuredClone(DAY_TWO.model.assignmentV5),
  id,
  title: DAY_TWO.model.assignmentV5.assignment.title,
  courseId: 'algebra2',
  assignedClassIds: ['class-a2h'],
  assignmentRevision: 2,
});

test('Prepare Recovery on Day 2: the exit ticket\'s graph and tank questions are added with its Mapping Diagram, and the exit ticket becomes ready; no question changes', () => {
  const assignment = liveCopy('live-l1-day-2');
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-06T15:00:00.000Z' });
  assert.deepEqual(report.changes.filter((change) => change.section === 'dol').map((change) => `${change.label}:${change.family.id}`), [
    'DOL Q1:functions.intervalsFromGraph',
    'DOL Q2:relations.mappingDiagram',
    'DOL Q3:functions.fillingTankAttributes',
  ]);
  assert.deepEqual(report.readiness.dol, { before: 'unavailable', after: 'ready', message: null });
  assert.equal(report.readiness.warmup.after, 'ready');
  assert.deepEqual(report.notReady, []);
  assert.equal(report.fullyReadyAfter, true);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

const T0 = Date.parse('2026-11-04T16:00:00Z');
const T1 = Date.parse('2026-11-06T15:00:00Z');
const BEFORE = {
  ...liveCopy('live-l1-day-2-journey'),
  courseProfile: { course: 'algebra2', courseLevel: 'honors' },
  rigorVariant: 'honors',
  dueAt: '2026-11-05T05:59:00.000Z',
  lateDueAt: '2026-11-20T23:59:00.000Z',
  warmup: { instructionDate: '2026-11-04' },
  dol: { instructionDate: '2026-11-04' },
};
const PREPARED = (() => {
  const planned = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: planned.plan, planHash: planned.planHash, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
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
    studentId: 'student-missed-day-2-dol',
    classId: 'class-a2h',
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

test('the missed Day 2 exit ticket: Practice and the Recovery deal a fresh graph, mapping and tank, never the lesson\'s own, graded by the server', () => {
  assert.equal(contextFor({ assignment: BEFORE }).eligibility.state, RECOVERY_STATE.UNAVAILABLE, 'nothing before the teacher prepares it');
  assert.equal(contextFor().eligibility.state, RECOVERY_STATE.LOCKED);
  const lessonOwn = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_TWO.model.assignmentV5), families: [INTERVALS, TANK] });
  assert.deepEqual(lessonOwn.sort(), ['functions.fillingTankAttributes:4|12', 'functions.intervalsFromGraph:2|3']);
  let context = contextFor();
  for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item);
    assert.ok(!lessonOwn.includes(item.pin.fingerprint), 'never the lesson\'s own question');
    const { question, instance } = reproduce(context, item);
    const outcome = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
      at: T1 + step * 60_000,
    });
    assert.equal(outcome.response.isCorrect, true, `${question.type}: the server marks the key right`);
    context = contextFor({ records: { dol: outcome.record } });
  }
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED);
  const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
  const { plan } = started.record;
  assert.deepEqual(plan.items.map((item) => item.pin.familyId), ['functions.intervalsFromGraph', 'relations.mappingDiagram', 'functions.fillingTankAttributes']);
  const running = contextFor({ records: { dol: started.record } });
  const responses = {};
  plan.items.forEach((item) => {
    assert.ok(!lessonOwn.includes(item.pin.fingerprint));
    const { question, instance } = reproduce(running, item);
    responses[item.itemId] = recoveryKeyResponses(question, instance).right;
  });
  const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
  assert.equal(submitted.record.status, 'completed');
  assert.equal(submitted.record.rawScore, 100);
});
