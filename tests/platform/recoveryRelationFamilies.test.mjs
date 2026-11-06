/*
 * RECOVERY V2 — THE MAPPING DIAGRAM FAMILY (RC01).
 *
 * The Mapping Diagram (relationMapping) asking for the arrows of a short
 * relation, with its domain and range or whether it is a function, was the
 * next static Warm-Up/DOL shape no family recognized. relations.mappingDiagram
 * (functions/shared/questionFamiliesRelations.mjs) recognizes:
 *
 *   L1 Day 1  q_dol-4_4_3       {(−1, 3), (2, 0), (4, 3), (7, −2)}   mapping, domain, range, function   sharedOutput
 *   L1 Day 2  q_warmup-1_1_3    {(−2, 1), (0, 3), (2, 5)}            mapping, domain, range             oneToOne
 *   L1 Day 2  q_dol-4_4_2       {(−1, 2), (2, 5), (2, −3), (6, 1)}   mapping, domain, range, function   repeatedInput
 *   DOL 1     q_section-1_1_1   four pairs, two sharing an output    mapping, function                  sharedOutput
 *
 * (Algebra II Honors Module 1, and the District DOL 1 review.) The review's
 * DOL Q7 is the same task as its Warm-Up Q1 authored at DOK 2, difficulty 3
 * rather than DOK 1, difficulty 1: it is recognized, and refused for its rigor.
 *
 * These tests hold the family to what a student is owed — every version is a
 * valid question the server marks right with its own key and wrong with the
 * other verdict (or an output left out); the relation is re-derived here from
 * what the student READS with the grader's own readers, never from the
 * family's key — and hold the lessons to what the teacher was promised.
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
import { relationIsFunction, relationPairsOf } from '../../functions/shared/serverGrading/tools/relationMapping.mjs';
import { correctFunctionChoice } from '../../functions/shared/relationFunctionChoice.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const FAMILY = getPlatformQuestionFamily('relations.mappingDiagram');
const compile = (file) => compileTeacherImport(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const DAY_ONE_FILE = 'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json';
const DAY_TWO_FILE = 'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json';
const REVIEW_FILE = 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';
const DAY_ONE = compile(DAY_ONE_FILE);
const DAY_TWO = compile(DAY_TWO_FILE);
const REVIEW = compile(REVIEW_FILE);
const questionIn = (lesson, questionId) => lesson.questions.find((question) => question.questionId === questionId);

const LIVE = Object.freeze([
  { lesson: DAY_ONE, questionId: 'q_dol-4_4_3', constraints: { ask: 'mappingDomainRangeFunction', relation: 'sharedOutput', pairCount: 4 }, rigor: [2, 2] },
  { lesson: DAY_TWO, questionId: 'q_warmup-1_1_3', constraints: { ask: 'mappingDomainRange', relation: 'oneToOne', pairCount: 3 }, rigor: [1, 1] },
  { lesson: DAY_TWO, questionId: 'q_dol-4_4_2', constraints: { ask: 'mappingDomainRangeFunction', relation: 'repeatedInput', pairCount: 4 }, rigor: [2, 3] },
  { lesson: REVIEW, questionId: 'q_section-1_1_1', constraints: { ask: 'mappingFunction', relation: 'sharedOutput', pairCount: 4 }, rigor: [1, 1] },
]);
const SAMPLE = 300;

const valuesFor = (constraints) => resolveFamilyConstraints(FAMILY, constraints).values;
const sample = (constraints, count = SAMPLE) => {
  const sequence = createFamilyInstanceSequence(FAMILY, valuesFor(constraints), 'relation-family-test');
  return Array.from({ length: count }, (_, index) => sequence.instanceAt(index)).filter(Boolean);
};
/** A version as Recovery builds it: from a slot that carries the original's identity and none of its wording. */
const build = (live, instance) => buildFamilyQuestion({
  family: FAMILY,
  instance,
  constraintValues: valuesFor(live.constraints),
  authored: recoverySourceQuestion(questionIn(live.lesson, live.questionId), { questionFamily: { id: FAMILY.id, version: 1, constraints: live.constraints } }),
});
const shapeOf = (live) => `${live.constraints.ask}/${live.constraints.relation}/${live.constraints.pairCount}`;

/* ---------------------------------------------------------------------------
 * The family.
 * ------------------------------------------------------------------------- */

test('relations.mappingDiagram is registered, recognizes static questions, may serve Recovery, and its ask, relation and size are strict concepts', () => {
  assert.ok(FAMILY);
  assert.equal(typeof FAMILY.recognize, 'function');
  assert.equal(FAMILY.recovery.eligible, true);
  assert.deepEqual([...FAMILY.skill.alignments], ['A2.7I', 'A.12A']);
  assert.equal(FAMILY.constraintPolicy, 'strict');
  assert.deepEqual([...FAMILY.conceptConstraints], ['ask', 'relation', 'pairCount']);
  assert.equal(resolveFamilyConstraints(FAMILY, { relation: 'manyToMany' }).fatal, true);
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesRelations.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs']);
});

for (const live of LIVE) {
  test(`${shapeOf(live)}: ${SAMPLE} versions build in the Mapping Diagram, are valid and distinct, and the server marks each one's key right and the wrong verdict wrong`, () => {
    const instances = sample(live.constraints);
    assert.equal(instances.length, SAMPLE);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, SAMPLE, 'no two versions are the same relation');
    assert.ok(measureFamilyCapacity(FAMILY, valuesFor(live.constraints), { budget: 2048 }).capacity > 1000, 'plenty of versions');
    instances.forEach((instance) => {
      const question = build(live, instance);
      const label = instance.fingerprint;
      assert.equal(question.type, 'relationMapping');
      assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(question, { label }).errors, [], label);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${label}: certification answers it from the key`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${label}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${label}: the wrong verdict is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], label);
    });
  });
}

/* ---------------------------------------------------------------------------
 * The relation, re-derived from what the student reads with the grader's own readers.
 * ------------------------------------------------------------------------- */

const STATED = /\{(.*)\}/;
const readSet = (prompt) => [...(STATED.exec(prompt)?.[1] || '').replaceAll('−', '-').matchAll(/\((-?\d+), (-?\d+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);

for (const live of LIVE) {
  test(`${shapeOf(live)}: every version is a relation of its kind, listed by input on −6..10, the prompt states it (or nothing), and a student who maps it and reads it off is right`, () => {
    sample(live.constraints, 150).forEach((instance) => {
      const question = build(live, instance);
      const pairs = relationPairsOf(question.pairs);
      assert.equal(pairs.length, live.constraints.pairCount);
      pairs.forEach(([x, y]) => assert.ok([x, y].every((value) => Number.isInteger(value) && value >= -6 && value <= 10), `(${x}, ${y})`));
      pairs.slice(1).forEach(([x], index) => assert.ok(x >= pairs[index][0], 'listed by input'));
      const inputs = pairs.map(([x]) => x);
      const outputs = pairs.map(([, y]) => y);
      const kind = relationIsFunction(pairs)
        ? (new Set(outputs).size === outputs.length ? 'oneToOne' : 'sharedOutput')
        : 'repeatedInput';
      assert.equal(kind, live.constraints.relation, `${JSON.stringify(pairs)} is ${live.constraints.relation}`);
      if (kind === 'sharedOutput') assert.equal(outputs.length - new Set(outputs).size, 1, 'exactly two inputs share an output');
      if (kind === 'repeatedInput') assert.equal(inputs.length - new Set(inputs).size, 1, 'exactly one input repeats');
      if (live.constraints.ask === 'mappingFunction') assert.doesNotMatch(question.prompt, /\d/, 'the relation is on the diagram, not in the prompt');
      else assert.deepEqual(readSet(question.prompt), pairs, `${question.prompt} states the relation`);
      assert.deepEqual(question.ask.slice().sort(), questionIn(live.lesson, live.questionId).ask.slice().sort(), 'the original\'s parts');
      // What a student who reads the diagram sends.
      const work = {
        plottedPoints: [],
        arrows: pairs,
        domainText: [...new Set(inputs)].join(', '),
        rangeText: [...new Set(outputs)].join(', '),
        isFunction: question.ask.includes('isFunction') ? correctFunctionChoice(relationIsFunction(pairs)) : '',
        fields: [],
      };
      const browser = gradeToolWork({ toolId: 'relationMapping', question, work });
      assert.equal(browser.isCorrect, true, JSON.stringify(pairs));
      assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true);
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'guidedNotes', 'answerKey'].forEach((name) => assert.equal(question[name], undefined, `no ${name}`));
    });
  });
}

/* ---------------------------------------------------------------------------
 * The family recognizes the live questions it stands in for — and nothing else.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId} (${shapeOf(live)}): recognized at the same rigor, with the live relation, leaving ${RECOVERY_MINIMUM_FRESH_VERSIONS}+ fresh versions`, () => {
    const question = questionIn(live.lesson, live.questionId);
    const recognized = FAMILY.recognize(question);
    assert.ok(recognized, 'recognized');
    assert.deepEqual(recognized.constraints, live.constraints);
    const values = valuesFor(live.constraints);
    const { dok, band } = familyDifficultyFor(FAMILY, values);
    assert.deepEqual([dok, band], live.rigor);
    assert.deepEqual([dok, band], [Number(question.dok), Number(question.difficultyBand)], 'the lesson\'s rigor');
    const evaluated = evaluateFamilyCandidate(FAMILY, values, recognized.params);
    assert.equal(evaluated.valid, true, `${evaluated.issues}`);
    const rebuilt = build(live, evaluated.instance);
    assert.deepEqual(relationPairsOf(rebuilt.pairs), relationPairsOf(question.pairs), 'the same relation, in the same order');
    assert.deepEqual(rebuilt.ask, question.ask);
    assert.ok(measureFamilyCapacity(FAMILY, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a Mapping Diagram question that is not exactly this task', () => {
  const base = questionIn(DAY_TWO, 'q_dol-4_4_2');
  assert.ok(FAMILY.recognize(base), 'the DOL question as written is recognized');
  const refused = {
    'a plot as well': mutate(base, (q) => { q.ask = [...q.ask, 'plot']; }),
    'only the domain': mutate(base, (q) => { q.ask = ['mapping', 'domain']; }),
    'an analysis field': mutate(base, (q) => { q.answerFields = [{ id: 'why', label: 'Why?', answer: 'x = 2 repeats' }]; }),
    'a decimal pair': mutate(base, (q) => { q.pairs[0].y = 2.5; }),
    'a value off the lesson\'s range': mutate(base, (q) => { q.pairs[3].y = 14; }),
    'inputs out of order': mutate(base, (q) => { q.pairs.reverse(); }),
    'inputs far apart': mutate(base, (q) => { q.pairs[3].x = 9; q.prompt = 'Represent {(−1, 2), (2, 5), (2, −3), (9, 1)} with a mapping. State the domain and range and decide whether it is a function.'; }),
    'two repeated inputs': mutate(base, (q) => { q.pairs[3].x = 2; q.pairs[0].x = 2; }),
    'a repeated input and a repeated output': mutate(base, (q) => { q.pairs[3].y = 5; q.prompt = 'Represent {(−1, 2), (2, 5), (2, −3), (6, 5)} with a mapping. State the domain and range and decide whether it is a function.'; }),
    'five pairs': mutate(base, (q) => { q.pairs.push({ x: 7, y: 0 }); }),
    'a prompt stating another relation': mutate(base, (q) => { q.prompt = 'Represent {(−1, 2), (2, 5), (2, −3), (6, 2)} with a mapping. State the domain and range and decide whether it is a function.'; }),
    'a prompt with more mathematics': mutate(base, (q) => { q.prompt = `${q.prompt} Then evaluate f(6) + 1.`; }),
    'a mode': mutate(base, (q) => { q.mode = 'plot'; }),
    'a workflow board': mutate(base, (q) => { q.workflow = [{ id: 'map', kind: 'mapping' }]; }),
  };
  Object.entries(refused).forEach(([why, question]) => assert.equal(FAMILY.recognize(question), null, why));
});

test('the lessons\' own relations — Classwork, Practice and the exit tickets — are kept out of every Recovery', () => {
  const excluded = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_ONE.model.assignmentV5), families: [FAMILY] });
  assert.deepEqual(excluded.sort(), [
    'relations.mappingDiagram:-1,3|2,0|4,3|7,-2',
    'relations.mappingDiagram:-2,5|1,0|4,5|6,-3',
    'relations.mappingDiagram:-3,4|0,1|2,4|5,-2',
  ]);
  // Day 2's repeated input is the same relation listed either way round.
  const dayTwo = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_TWO.model.assignmentV5), families: [FAMILY] });
  assert.ok(dayTwo.includes('relations.mappingDiagram:-1,2|2,-3|2,5|6,1'));
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on live copies.
 * ------------------------------------------------------------------------- */

const liveCopy = (lesson, id, courseId) => ({
  ...structuredClone(lesson.model.assignmentV5),
  id,
  title: lesson.model.assignmentV5.assignment.title,
  courseId,
  assignedClassIds: ['class-1'],
  assignmentRevision: 2,
});
const AT = '2026-11-05T15:00:00.000Z';
const preview = (assignment) => buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT }).report;
const familyChanges = (report) => report.changes.filter((change) => change.family.id === FAMILY.id).map((change) => `${change.label}:${change.questionId}`);

test('Prepare Recovery: the four Mapping Diagram questions are added; the review\'s Warm-Up becomes ready; its DOL Q7 is refused for its rigor; no question changes', () => {
  const dayOne = preview(liveCopy(DAY_ONE, 'live-l1-day-1', 'algebra2'));
  assert.deepEqual(familyChanges(dayOne), ['DOL Q3:q_dol-4_4_3']);
  const dayTwo = preview(liveCopy(DAY_TWO, 'live-l1-day-2', 'algebra2'));
  assert.deepEqual(familyChanges(dayTwo), ['Warm-Up Q3:q_warmup-1_1_3', 'DOL Q2:q_dol-4_4_2']);
  const reviewCopy = liveCopy(REVIEW, 'live-dol-1-review', 'algebra1');
  const review = preview(reviewCopy);
  assert.deepEqual(familyChanges(review), ['Warm-Up Q1:q_section-1_1_1']);
  assert.deepEqual(review.readiness.warmup, { before: 'unavailable', after: 'ready', message: null });
  const q7 = review.notReady.find((row) => row.label === 'DOL Q7');
  assert.deepEqual(q7.issues.map((entry) => entry.code), ['rigor-mismatch'], 'the same task authored at another rigor is not recovered at this one');
  assert.deepEqual(review.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(reviewCopy).map(recoverySourceSignature));
  [dayOne, dayTwo, review].forEach((report) => report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS)));
});

/* ---------------------------------------------------------------------------
 * A student who missed the review's Warm-Up, after the teacher prepared it.
 * ------------------------------------------------------------------------- */

const CLASS = 'class-1';
const DAY = '2026-11-02';
const T0 = Date.parse('2026-11-02T16:00:00Z');
const T1 = Date.parse('2026-11-04T15:00:00Z');
const BEFORE = {
  ...liveCopy(REVIEW, 'live-dol-1-journey', 'algebra1'),
  courseProfile: { course: 'algebra1', courseLevel: 'onLevel' },
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
const WARMUP = QUESTIONS.map((question, index) => (question.activityRole === 'warmup' ? index : null)).filter((index) => index !== null);
const MISSED = Object.fromEntries(WARMUP.map((index) => [index, { status: 'expired', attemptCount: 1, totalAttempts: 1, gradedBy: 'server', lastAttemptAt: new Date(T0 - 3_600_000).toISOString(), supportUsage: {} }]));
const REVIEW_RELATIONS = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(REVIEW.model.assignmentV5), families: [FAMILY] });

const contextFor = ({ assignment = PREPARED, records = {} } = {}) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const original = splitGradesBySection({ tracker: MISSED, assignment }).warmup;
  return buildSectionRecoveryContext({
    assignment,
    section: 'warmup',
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'warmup'),
    questions,
    tracker: MISSED,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record: records.warmup || null,
    studentId: 'student-missed-warmup',
    classId: CLASS,
    classPeriod: 'Period 1',
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

// Since RC01's next shapes the review's Warm-Up Q2–Q4 recover too
// (recoveryGraphRecognitionFamilies.test.mjs): the figure sorts and the vertex
// choice are dealt beside the relations, every one fresh and graded by the server.
const WARMUP_TYPES = ['relationMapping', 'figureMatch', 'graphChoicePreview'];

test('the review\'s missed Warm-Up: Practice and the Recovery are fresh questions, never one from the review, graded by the server', () => {
  assert.equal(REVIEW_RELATIONS.length, 3, 'the review\'s Warm-Up, Practice and DOL relations');
  assert.deepEqual(getStoredAssignmentQuestions(BEFORE), QUESTIONS);
  assert.equal(contextFor({ assignment: BEFORE }).eligibility.state, RECOVERY_STATE.UNAVAILABLE);
  assert.equal(contextFor().eligibility.state, RECOVERY_STATE.LOCKED);
  const seen = contextFor().seenFingerprints;
  REVIEW_RELATIONS.forEach((fingerprint) => assert.ok(seen.includes(fingerprint), `${fingerprint} is never dealt as fresh`));
  let context = contextFor();
  const dealt = [];
  for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item);
    const { question, instance } = reproduce(context, item);
    assert.ok(WARMUP_TYPES.includes(question.type), question.type);
    const outcome = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
      at: T1 + step * 60_000,
    });
    assert.equal(outcome.response.isCorrect, true);
    dealt.push(item.pin.fingerprint);
    context = contextFor({ records: { warmup: outcome.record } });
  }
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED);
  dealt.forEach((fingerprint) => assert.ok(!REVIEW_RELATIONS.includes(fingerprint)));
  const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
  const { plan } = started.record;
  assert.ok(plan.items.length >= 1 && plan.items.every((item) => WARMUP.includes(item.storageIndex)), 'every Recovery question recovers a Warm-Up question');
  assert.ok(plan.items.some((item) => item.storageIndex !== WARMUP[0]), 'Q2–Q4 recover too, not only the Mapping Diagram');
  const running = contextFor({ records: { warmup: started.record } });
  const responses = {};
  plan.items.forEach((item) => {
    assert.ok(!REVIEW_RELATIONS.includes(item.pin.fingerprint) && !dealt.includes(item.pin.fingerprint));
    const { question, instance } = reproduce(running, item);
    if (item.storageIndex === WARMUP[0]) assert.deepEqual(question.ask, ['mapping', 'isFunction']);
    else assert.ok(WARMUP_TYPES.includes(question.type), question.type);
    responses[item.itemId] = recoveryKeyResponses(question, instance).right;
  });
  const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
  assert.equal(submitted.record.status, 'completed');
  assert.equal(submitted.record.rawScore, 100);
});
