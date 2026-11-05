/*
 * RECOVERY V2 — THE DOMAIN AND RANGE OF A GRAPHED PARABOLA OR ABSOLUTE VALUE (RC01).
 *
 * Graph Analysis asking for the domain and range, in interval notation, of
 * y = ±(x − h)² + k or y = ±|x − h| + k had no family. With the interval and
 * Mapping Diagram families it was the last question keeping Algebra II Honors
 * Module 1 Lesson 1 Day 1's exit ticket from Recovery.
 * functions.domainRangeFromGraph (functions/shared/questionFamiliesGraphReading.mjs)
 * recognizes:
 *
 *   L1 Day 1  q_dol-4_4_2     f(x) = (x + 2)² − 5    quadratic, up    DOK 2, difficulty 2
 *   L1 Day 2  q_warmup-1_1_1  f(x) = |x + 1| − 2     absolute, up     DOK 1, difficulty 1
 *
 * These tests hold the family to what a student is owed — every version is a
 * valid question whose domain and range the graph workspace reads off the
 * function it draws, marked right with the family's key and wrong with the
 * range's closed end opened; the vertex is re-read from the prompt — and hold
 * the lessons to what the teacher was promised.
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
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryExclusionFingerprints, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const FAMILY = getPlatformQuestionFamily('functions.domainRangeFromGraph');
const compile = (file) => compileTeacherImport(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const DAY_ONE = compile('teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json');
const DAY_TWO = compile('teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json');
const questionIn = (lesson, questionId) => lesson.questions.find((question) => question.questionId === questionId);

const LIVE = Object.freeze([
  { lesson: DAY_ONE, questionId: 'q_dol-4_4_2', params: { h: -2, k: -5 }, constraints: { parent: 'quadratic', opens: 'up' }, rigor: [2, 2] },
  { lesson: DAY_TWO, questionId: 'q_warmup-1_1_1', params: { h: -1, k: -2 }, constraints: { parent: 'absolute', opens: 'up' }, rigor: [1, 1] },
]);
// Every setting a slot can ask for: h and k each ±1..6, so 12 × 12 = 144.
const SETTINGS = Object.freeze(['quadratic', 'absolute'].flatMap((parent) => ['up', 'down'].map((opens) => ({ parent, opens }))));
const VERSIONS = 144;

const valuesFor = (constraints) => resolveFamilyConstraints(FAMILY, constraints).values;
const everyInstance = (constraints) => {
  const walked = createFamilyInstanceSequence(FAMILY, valuesFor(constraints), 'graph-reading-test').exhaust(5000);
  assert.equal(walked.complete, true);
  return walked.instances;
};
const build = (constraints, instance, original = questionIn(DAY_ONE, 'q_dol-4_4_2')) => buildFamilyQuestion({
  family: FAMILY,
  instance,
  constraintValues: valuesFor(constraints),
  authored: recoverySourceQuestion(original, { questionFamily: { id: FAMILY.id, version: 1, constraints } }),
});
const label = (constraints) => `${constraints.parent}, opens ${constraints.opens}`;

test('functions.domainRangeFromGraph is registered, recognizes static questions, may serve Recovery, and its parent and direction are strict concepts', () => {
  assert.ok(FAMILY);
  assert.equal(typeof FAMILY.recognize, 'function');
  assert.equal(FAMILY.recovery.eligible, true);
  assert.deepEqual([...FAMILY.skill.alignments], ['A2.7I']);
  assert.equal(FAMILY.constraintPolicy, 'strict');
  assert.deepEqual([...FAMILY.conceptConstraints], ['parent', 'opens']);
  assert.equal(resolveFamilyConstraints(FAMILY, { parent: 'cubic' }).fatal, true);
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesGraphReading.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs']);
});

const readPrompt = (prompt) => {
  const match = /^Use the graph of f\(x\) = (−?)(?:\(x ([+−]) (\d)\)²|\|x ([+−]) (\d)\|) ([+−]) (\d)\. State the domain and range( in interval notation)?\.$/.exec(prompt);
  assert.ok(match, prompt);
  const [, minus, qSign, qShift, aSign, aShift, kSign, kSize, interval] = match;
  const sign = qSign ?? aSign;
  return {
    parent: qSign ? 'quadratic' : 'absolute',
    a: minus ? -1 : 1,
    h: sign === '+' ? -Number(qShift ?? aShift) : Number(qShift ?? aShift),
    k: kSign === '+' ? Number(kSize) : -Number(kSize),
    interval: Boolean(interval),
  };
};

for (const constraints of SETTINGS) {
  test(`${label(constraints)}: all ${VERSIONS} versions are valid and distinct; the workspace reads the function the prompt states, and marks the key right and an open end wrong`, () => {
    const instances = everyInstance(constraints);
    assert.equal(instances.length, VERSIONS);
    assert.deepEqual([measureFamilyCapacity(FAMILY, valuesFor(constraints), { budget: 2048 }).capacity], [VERSIONS]);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, VERSIONS);
    instances.forEach((instance) => {
      const question = build(constraints, instance);
      assert.equal(question.type, 'graphAnalysis');
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      // The function the prompt states is the one drawn.
      const stated = readPrompt(question.prompt);
      assert.deepEqual([stated.parent, stated.a, stated.h, stated.k], [question.functionSpec.type, question.functionSpec.a, question.functionSpec.h, question.functionSpec.k]);
      assert.equal(stated.interval, constraints.parent === 'quadratic', 'the lesson\'s own sentence for its parent');
      assert.ok(stated.h !== 0 && stated.k !== 0, 'the vertex is on neither axis');
      // The workspace's own reading: all real inputs, outputs from the vertex.
      const model = graphWorkspaceModelFor(question, { analysisMode: true });
      assert.deepEqual(model.analysisParts.map((part) => part.id), ['domain', 'range']);
      const work = (range) => ({ analysis: { answers: { domain: '(−∞, ∞)', range } } });
      const expected = stated.a > 0 ? `[${stated.k}, ∞)` : `(−∞, ${stated.k}]`;
      const browser = gradeToolWork({ toolId: 'graphAnalysis', question, work: work(expected) });
      assert.equal(browser.isCorrect, true, `${question.prompt} → ${expected}`);
      assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true);
      // The family's key, as certification sends it.
      const responses = recoveryKeyResponses(question, instance);
      assert.equal(gradeServerResponse({ question, response: responses.right }).isCorrect, true, `${instance.fingerprint}: its own key`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong }).isCorrect, true, `${instance.fingerprint}: an open end`);
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((name) => assert.equal(question[name], undefined));
      assert.doesNotMatch(question.prompt, /∞|\[|\]/, 'no interval in the prompt');
    });
  });
}

for (const live of LIVE) {
  test(`${live.questionId}: recognized as ${label(live.constraints)} at the same rigor, written exactly as the lesson writes it`, () => {
    const question = questionIn(live.lesson, live.questionId);
    const recognized = FAMILY.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: live.constraints });
    const values = valuesFor(live.constraints);
    const { dok, band } = familyDifficultyFor(FAMILY, values);
    assert.deepEqual([dok, band], live.rigor);
    assert.deepEqual([dok, band], [Number(question.dok), Number(question.difficultyBand)]);
    const evaluated = evaluateFamilyCandidate(FAMILY, values, recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live.constraints, evaluated.instance, question);
    assert.equal(rebuilt.prompt, question.prompt);
    assert.deepEqual(rebuilt.functionSpec, question.functionSpec);
    assert.deepEqual(rebuilt.analysisRequests, question.analysisRequests);
    assert.ok(measureFamilyCapacity(FAMILY, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a graph-reading question that is not exactly this task', () => {
  const base = questionIn(DAY_ONE, 'q_dol-4_4_2');
  assert.ok(FAMILY.recognize(base));
  const refused = {
    'a stretch': mutate(base, (q) => { q.functionSpec.a = 2; q.prompt = 'Use the graph of f(x) = 2(x + 2)² − 5. State the domain and range in interval notation.'; }),
    'a restricted domain': mutate(base, (q) => { q.functionSpec.domain = { min: -4, max: 1 }; }),
    'another parent': mutate(base, (q) => { q.functionSpec.type = 'squareRoot'; q.prompt = 'Use the graph of f(x) = √(x + 2) − 5. State the domain and range in interval notation.'; }),
    'a vertex on an axis': mutate(base, (q) => { q.functionSpec.k = 0; q.prompt = 'Use the graph of f(x) = (x + 2)² + 0. State the domain and range in interval notation.'; }),
    'a vertex off the lesson\'s grid': mutate(base, (q) => { q.functionSpec.h = -9; q.prompt = 'Use the graph of f(x) = (x + 9)² − 5. State the domain and range in interval notation.'; }),
    'increasing and decreasing as well': mutate(base, (q) => { q.analysisRequests.push({ id: 'increasing', kind: 'increasing', notation: 'interval' }); }),
    'the domain alone': mutate(base, (q) => { q.analysisRequests.pop(); }),
    'inequality notation': mutate(base, (q) => { q.analysisRequests[1].notation = 'inequality'; }),
    'an authored key': mutate(base, (q) => { q.analysisRequests[1].acceptedAnswers = ['[-5, inf)']; }),
    'a window of its own': mutate(base, (q) => { q.graph = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }; }),
    'a prompt for another function': mutate(base, (q) => { q.prompt = 'Use the graph of f(x) = (x + 2)² − 4. State the domain and range in interval notation.'; }),
    'a prompt with more to it': mutate(base, (q) => { q.prompt = 'Use the graph of f(x) = (x + 2)² − 5. State the domain and range in interval notation, then find f(1).'; }),
  };
  Object.entries(refused).forEach(([why, question]) => assert.equal(FAMILY.recognize(question), null, why));
  // The parent functions themselves (Lesson 2 Day 1's review) are not this task.
  const parentReview = compile('teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json');
  parentReview.questions.forEach((question) => assert.equal(FAMILY.recognize(question), null, question.questionId));
});

test('the lesson\'s own parabolas and absolute values are kept out of every Recovery', () => {
  assert.deepEqual(recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_ONE.model.assignmentV5), families: [FAMILY] }).sort(), [
    'functions.domainRangeFromGraph:absolute|1|2|-3',
    'functions.domainRangeFromGraph:quadratic|-1|1|4',
    'functions.domainRangeFromGraph:quadratic|1|-2|-5',
  ]);
});

/* ---------------------------------------------------------------------------
 * Prepare Recovery on Day 1, and a student who missed its DOL.
 * ------------------------------------------------------------------------- */

const liveCopy = (lesson, id) => ({
  ...structuredClone(lesson.model.assignmentV5),
  id,
  title: lesson.model.assignmentV5.assignment.title,
  courseId: 'algebra2',
  assignedClassIds: ['class-a2h'],
  assignmentRevision: 2,
});

test('Prepare Recovery on Day 1: the exit ticket becomes ready (interval, graph and Mapping Diagram families); Day 2\'s Warm-Up gains its graph question; no question changes', () => {
  const dayOne = liveCopy(DAY_ONE, 'live-l1-day-1-ready');
  const { report } = buildRecoveryUpgradePreview({ assignment: dayOne, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-05T15:00:00.000Z' });
  assert.deepEqual(report.changes.filter((change) => change.section === 'dol').map((change) => `${change.label}:${change.family.id}`), [
    'DOL Q1:intervals.graphAndWrite',
    'DOL Q2:functions.domainRangeFromGraph',
    'DOL Q3:relations.mappingDiagram',
  ]);
  assert.deepEqual(report.readiness.dol, { before: 'unavailable', after: 'ready', message: null });
  assert.deepEqual(report.notReady, []);
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(dayOne).map(recoverySourceSignature));
  const dayTwo = buildRecoveryUpgradePreview({ assignment: liveCopy(DAY_TWO, 'live-l1-day-2-ready'), manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-05T15:00:00.000Z' }).report;
  assert.deepEqual(dayTwo.changes.filter((change) => change.family.id === FAMILY.id).map((change) => change.label), ['Warm-Up Q1']);
  assert.deepEqual(dayTwo.notReady.map((row) => row.label), ['DOL Q1', 'DOL Q3'], 'Day 2\'s exit ticket still has two questions no family writes');
});

const CLASS = 'class-a2h';
const DAY = '2026-11-02';
const T0 = Date.parse('2026-11-02T16:00:00Z');
const T1 = Date.parse('2026-11-04T15:00:00Z');
const BEFORE = {
  ...liveCopy(DAY_ONE, 'live-l1-day-1-journey'),
  courseProfile: { course: 'algebra2', courseLevel: 'honors' },
  rigorVariant: 'honors',
  dueAt: '2026-11-03T23:59:00.000Z',
  lateDueAt: '2026-11-20T23:59:00.000Z',
  warmup: { instructionDate: DAY },
  dol: { instructionDate: DAY },
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
    studentId: 'student-missed-dol',
    classId: CLASS,
    classPeriod: 'Period 5',
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

test('the missed Day 1 exit ticket: Practice and the Recovery deal a fresh number line, graph and mapping, graded by the server', () => {
  assert.deepEqual(getStoredAssignmentQuestions(BEFORE), QUESTIONS);
  assert.equal(contextFor({ assignment: BEFORE }).eligibility.state, RECOVERY_STATE.UNAVAILABLE);
  assert.equal(contextFor().eligibility.state, RECOVERY_STATE.LOCKED);
  const lessonGraphs = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_ONE.model.assignmentV5), families: [FAMILY] });
  const seen = contextFor().seenFingerprints;
  lessonGraphs.forEach((fingerprint) => assert.ok(seen.includes(fingerprint), `${fingerprint} is never dealt as fresh`));
  let context = contextFor();
  for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item);
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
  assert.deepEqual(plan.items.map((item) => item.pin.familyId), ['intervals.graphAndWrite', 'functions.domainRangeFromGraph', 'relations.mappingDiagram']);
  const running = contextFor({ records: { dol: started.record } });
  const responses = {};
  plan.items.forEach((item) => {
    assert.ok(!lessonGraphs.includes(item.pin.fingerprint));
    const { question, instance } = reproduce(running, item);
    responses[item.itemId] = recoveryKeyResponses(question, instance).right;
  });
  const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
  assert.equal(submitted.record.status, 'completed');
  assert.equal(submitted.record.rawScore, 100);
});
