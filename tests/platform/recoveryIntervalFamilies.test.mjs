/*
 * RECOVERY V2 — THE INTERVAL NUMBER LINE FAMILY (RC01).
 *
 * The coverage report (scripts/recovery-coverage-report.mjs) found that the
 * most common static Warm-Up/DOL shape no family recognized was the Interval
 * Number Line asking for the graph and the interval notation of a stated
 * inequality: five questions in Algebra II Honors Module 1, Lesson 1 Days 1
 * and 2. One platform family, intervals.graphAndWrite
 * (functions/shared/questionFamiliesIntervals.mjs), now recognizes them:
 *
 *   Day 1  q_warmup-1_1_1   −4 ≤ x < 3                segment
 *          q_warmup-1_1_2   x > 2                     ray
 *          q_warmup-1_1_3   x ≤ −5 or x > 1           twoRays
 *          q_dol-4_4_1      x < −1 or 2 ≤ x ≤ 5       rayAndSegment
 *   Day 2  q_warmup-1_1_2   −2 ≤ x < 4                segment
 *
 * These tests hold the family to what a student is owed — every version is a
 * valid question the server marks right with its own key and wrong with a
 * flipped endpoint; versions are distinct and plentiful; the interval is
 * re-derived here from the PROMPT with the platform's own inequality reader,
 * never read back from the family's key — and hold the lessons to what the
 * teacher was promised: Prepare Recovery makes both Warm-Ups ready, never
 * touches a question, and a student who missed the Warm-Up gets fresh
 * versions that are never a problem from the lesson.
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
import { recoveryExclusionFingerprints, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { intervalsToNotation, parseInequalityText, sameIntervals } from '../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const FAMILY_ID = 'intervals.graphAndWrite';
const family = getPlatformQuestionFamily(FAMILY_ID);
const DAY_ONE_FILE = 'teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json';
const DAY_TWO_FILE = 'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json';
const compile = (file) => compileTeacherImport(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const DAY_ONE = compile(DAY_ONE_FILE);
const DAY_TWO = compile(DAY_TWO_FILE);
const questionIn = (lesson, questionId) => lesson.questions.find((question) => question.questionId === questionId);

// The five live questions, and the shape each one is.
const LIVE = Object.freeze([
  { lesson: DAY_ONE, questionId: 'q_warmup-1_1_1', shape: 'segment', inequality: '−4 ≤ x < 3' },
  { lesson: DAY_ONE, questionId: 'q_warmup-1_1_2', shape: 'ray', inequality: 'x > 2' },
  { lesson: DAY_ONE, questionId: 'q_warmup-1_1_3', shape: 'twoRays', inequality: 'x ≤ −5 or x > 1' },
  { lesson: DAY_ONE, questionId: 'q_dol-4_4_1', shape: 'rayAndSegment', inequality: 'x < −1 or 2 ≤ x ≤ 5' },
  { lesson: DAY_TWO, questionId: 'q_warmup-1_1_2', shape: 'segment', inequality: '−2 ≤ x < 4' },
]);

// Worked by hand from the parameter domains (questionFamiliesIntervals.mjs):
//   segment and twoRays   lo in −9..7, hi in −7..9 with hi − lo ≥ 2: 17 + 16 + … + 1
//                         = 153 pairs, times 4 open/closed choices = 612
//   ray                   19 endpoints times 4 relations = 76
//   rayAndSegment         2 sides × 11 starts × 3 gaps × 3 widths × 2 ray ends ×
//                         4 segment ends = 1,584
const VERSIONS = Object.freeze({ segment: 612, ray: 76, twoRays: 612, rayAndSegment: 1584 });

const valuesFor = (shape) => resolveFamilyConstraints(family, { shape }).values;
const everyInstance = (shape) => {
  const walked = createFamilyInstanceSequence(family, valuesFor(shape), 'recovery-interval-family-test').exhaust(5000);
  assert.equal(walked.complete, true, `${shape}: the whole list was walked`);
  return walked.instances;
};
const build = (shape, instance) => buildFamilyQuestion({
  family,
  instance,
  constraintValues: valuesFor(shape),
  authored: { questionId: 'recovery-interval-test' },
});

/** What a student who graphs `pieces` and types `notation` sends. */
const studentWork = (question, pieces, notation) => buildToolResponse({
  question,
  toolId: 'intervalNumberLine',
  work: {
    intervals: pieces.map(({ min, max, minClosed, maxClosed }) => ({ min, max, minClosed, maxClosed })),
    notation,
  },
});
const PROMPT = /^Graph (.+) on the number line, then write it in interval notation\.$/;

/* ---------------------------------------------------------------------------
 * The family itself.
 * ------------------------------------------------------------------------- */

test('intervals.graphAndWrite is registered, recognizes static questions, may serve Recovery, and its shape is a strict concept', () => {
  assert.ok(family, 'registered');
  assert.equal(typeof family.recognize, 'function');
  assert.equal(family.recovery.eligible, true);
  assert.deepEqual([...family.skill.alignments], ['A2.7I']);
  assert.equal(family.constraintPolicy, 'strict', 'a slot that asks for a shape gets that shape or nothing');
  assert.deepEqual([...family.conceptConstraints], ['shape']);
  assert.equal(resolveFamilyConstraints(family, { shape: 'parabola' }).fatal, true);
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesIntervals.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs'], 'no tool math, no grader, no browser module');
});

for (const [shape, count] of Object.entries(VERSIONS)) {
  test(`${shape}: all ${count} versions build, are valid and distinct, and the server marks each one's key right and a flipped endpoint wrong`, () => {
    const instances = everyInstance(shape);
    assert.equal(instances.length, count, `${shape} has ${instances.length} versions`);
    assert.equal(measureFamilyCapacity(family, valuesFor(shape), { budget: 2048 }).capacity, count, 'the capacity certification reads is the same number');
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, count, 'no two versions are the same interval');
    instances.forEach((instance) => {
      const question = build(shape, instance);
      assert.equal(question.type, 'intervalNumberLine');
      assert.deepEqual(question.ask, ['graph', 'interval'], 'every version asks for the graph and the notation, as the lesson\'s do');
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], `${instance.fingerprint} is a valid question`);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, 'certification has a key response for intervals');
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${instance.fingerprint}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${instance.fingerprint}: a flipped endpoint is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], `${instance.fingerprint}: certification's key check passes`);
    });
  });
}

/* ---------------------------------------------------------------------------
 * The mathematics, re-derived from each version's own PROMPT with the
 * platform's inequality reader — never from the family's key.
 * ------------------------------------------------------------------------- */

const PIECES_OF_SHAPE = Object.freeze({
  segment: ['segment'],
  ray: ['ray'],
  twoRays: ['ray', 'ray'],
  rayAndSegment: ['ray', 'segment'],
});
const kindOf = ({ min, max }) => (Number.isFinite(min) && Number.isFinite(max) ? 'segment' : 'ray');

for (const shape of Object.keys(VERSIONS)) {
  test(`${shape}: the key is the inequality the prompt states, a student who graphs and writes it is right, and the numbers stay on the lesson's number line`, () => {
    everyInstance(shape).forEach((instance) => {
      const question = build(shape, instance);
      const match = PROMPT.exec(question.prompt);
      assert.ok(match, `the prompt states the inequality and the task: ${question.prompt}`);
      assert.equal(question.inequalityText, match[1], 'the tool\'s inequality is the one the prompt states');
      const stated = parseInequalityText(match[1]);
      assert.ok(stated, `the platform reads "${match[1]}"`);
      assert.ok(sameIntervals(stated, question.intervals), `${match[1]}: the key is the stated inequality`);
      assert.deepEqual(stated.map(kindOf).sort(), [...PIECES_OF_SHAPE[shape]].sort(), `${match[1]} is a ${shape}`);
      // Every finite end a whole number on −9..9, each one at least two past the last.
      const ends = stated.flatMap(({ min, max }) => [min, max]).filter(Number.isFinite);
      ends.forEach((end) => assert.ok(Number.isInteger(end) && Math.abs(end) <= 9, `${end} is on the number line`));
      ends.slice(1).forEach((end, index) => assert.ok(end - ends[index] >= 2, `${match[1]}: pieces neither empty nor touching`));
      // The student who graphs the stated inequality and writes its notation is right.
      const response = studentWork(question, stated, intervalsToNotation(stated));
      assert.equal(gradeServerResponse({ question, response })?.isCorrect, true, `${match[1]}: graphed and written as stated`);
    });
  });
}

test('a version never carries a hint, a step or a worked solution, and never shows its answer', () => {
  Object.keys(VERSIONS).forEach((shape) => {
    everyInstance(shape).slice(0, 80).forEach((instance) => {
      const question = build(shape, instance);
      ['hints', 'scaffold', 'steps', 'solution', 'workedSolution', 'solutionReview', 'guidedNotes'].forEach((name) => assert.equal(question[name], undefined, `${shape}: no ${name}`));
      assert.ok(!question.prompt.includes(instance.answer.display), `${instance.fingerprint}: the notation is not in the prompt`);
      assert.doesNotMatch(question.prompt, /[[\]∞∪]/, 'no interval notation at all in the prompt');
    });
  });
});

/* ---------------------------------------------------------------------------
 * The family recognizes the live questions it stands in for — and nothing else.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId} (${live.inequality}): recognized as a ${live.shape} at the same rigor, with the live key, leaving ${RECOVERY_MINIMUM_FRESH_VERSIONS}+ fresh versions`, () => {
    const question = questionIn(live.lesson, live.questionId);
    assert.equal(question?.inequalityText, live.inequality, 'the live question');
    const recognized = family.recognize(question);
    assert.ok(recognized, 'recognized');
    assert.deepEqual(recognized.constraints, { shape: live.shape });
    const { values } = resolveFamilyConstraints(family, recognized.constraints);
    const rigor = familyDifficultyFor(family, values);
    assert.equal(rigor.dok, Number(question.dok), 'DOK');
    assert.equal(rigor.band, Number(question.difficultyBand), 'difficulty band');
    assert.ok(family.skill.alignments.includes(question.alignments.find((entry) => entry.role === 'primary').code), 'the family assesses its primary TEKS');
    // The live problem is one of the family's own versions, with the live key:
    // which is how Recovery knows never to hand it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${evaluated.issues}`);
    const rebuilt = build(live.shape, evaluated.instance);
    assert.equal(rebuilt.inequalityText, question.inequalityText);
    assert.ok(sameIntervals(rebuilt.intervals, question.intervals), 'the same key');
    assert.deepEqual(rebuilt.ask, question.ask, 'the same stages');
    assert.ok(measureFamilyCapacity(family, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

test('recognize refuses a number-line question that is not exactly this task', () => {
  const base = questionIn(DAY_ONE, 'q_dol-4_4_1');
  assert.ok(family.recognize(base), 'the DOL question as written is recognized');
  const mutate = (change) => {
    const question = structuredClone(base);
    change(question);
    return question;
  };
  const refused = {
    'a key that disagrees with the stated inequality': mutate((q) => { q.intervals[1].maxClosed = false; }),
    'a ray the key stops at the edge of the picture': mutate((q) => { q.intervals[0].min = -8; }),
    'an inequality stage asked as well': mutate((q) => { q.ask = ['graph', 'interval', 'inequality']; }),
    'the graph alone': mutate((q) => { q.ask = ['graph']; }),
    'a decimal endpoint': mutate((q) => { q.inequalityText = 'x < −1.5 or 2 ≤ x ≤ 5'; q.intervals[0].max = -1.5; q.prompt = 'Graph x < −1.5 or 2 ≤ x ≤ 5, then write the interval in interval notation.'; }),
    'the pieces written highest first': mutate((q) => { q.inequalityText = '2 ≤ x ≤ 5 or x < −1'; q.prompt = 'Graph 2 ≤ x ≤ 5 or x < −1, then write the interval in interval notation.'; }),
    'a reversed clause': mutate((q) => { q.inequalityText = '−1 > x or 2 ≤ x ≤ 5'; q.prompt = 'Graph −1 > x or 2 ≤ x ≤ 5, then write the interval in interval notation.'; }),
    'a word problem around it': mutate((q) => { q.prompt = 'A thermostat is off below −1 degrees and between 2 and 5 degrees. Graph x < −1 or 2 ≤ x ≤ 5.'; }),
    'an equation to solve first': mutate((q) => { q.prompt = 'Solve 3x + 3 < 0 or 2 ≤ x ≤ 5, then graph x < −1 or 2 ≤ x ≤ 5.'; }),
    'a prompt that does not state it': mutate((q) => { q.prompt = 'Graph the inequality on the number line, then write the interval in interval notation.'; }),
    'another variable': mutate((q) => { q.variable = 't'; }),
    'a fractional snap step': mutate((q) => { q.step = 0.5; }),
    'a mode': mutate((q) => { q.mode = 'numberLine'; }),
    'a workflow board': mutate((q) => { q.workflow = [{ id: 'graph', kind: 'intervalInput' }]; }),
    'every number (two rays that overlap)': mutate((q) => {
      q.inequalityText = 'x < 3 or x > 1';
      q.intervals = [{ min: null, max: 3, minClosed: false, maxClosed: false }, { min: 1, max: null, minClosed: false, maxClosed: false }];
      q.prompt = 'Graph x < 3 or x > 1, then write the interval in interval notation.';
    }),
  };
  Object.entries(refused).forEach(([why, question]) => assert.equal(family.recognize(question), null, why));
});

test('recognize refuses the other Warm-Up and DOL questions of both lessons, and the contextual number lines of Algebra I Module 3', () => {
  [DAY_ONE, DAY_TWO].forEach((lesson) => lesson.questions
    .filter((question) => ['warmup', 'dol'].includes(question.activityRole) && question.type !== 'intervalNumberLine')
    .forEach((question) => assert.equal(family.recognize(question), null, `${question.questionId} (${question.type})`)));
  const moduleThree = compile('teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json');
  const contextual = moduleThree.questions.filter((question) => question.type === 'intervalNumberLine');
  assert.ok(contextual.length >= 2, 'the lesson has contextual number lines');
  contextual.forEach((question) => assert.equal(family.recognize(question), null, `${question.questionId}: "${question.prompt}"`));
});

// Every number-line problem in the Day 1 lesson, written out by hand from
// the lesson file: Warm-Up 1–3, classwork 1–2, Practice 1–2 and the DOL.
const DAY_ONE_INTERVALS = Object.freeze([
  'intervals.graphAndWrite:segment|[-4,3)',
  'intervals.graphAndWrite:ray|(2,inf)',
  'intervals.graphAndWrite:twoRays|(-inf,-5]U(1,inf)',
  'intervals.graphAndWrite:segment|[-3,5)',
  'intervals.graphAndWrite:twoRays|(-inf,-2)U[4,inf)',
  'intervals.graphAndWrite:segment|(-1,6]',
  'intervals.graphAndWrite:twoRays|(-inf,-4]U[3,inf)',
  'intervals.graphAndWrite:rayAndSegment|(-inf,-1)U[2,5]',
]);

test('the lesson\'s own interval problems — Warm-Up, classwork, Practice and DOL — are all kept out of every Recovery', () => {
  const excluded = recoveryExclusionFingerprints({ questions: flattenAssignmentQuestions(DAY_ONE.model.assignmentV5), families: [family] });
  assert.deepEqual([...excluded].sort(), [...DAY_ONE_INTERVALS].sort());
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on the live copies.
 * ------------------------------------------------------------------------- */

const liveCopy = (lesson, id) => ({
  ...structuredClone(lesson.model.assignmentV5),
  id,
  title: lesson.model.assignmentV5.assignment.title,
  courseId: 'algebra2',
  assignedClassIds: ['class-a2h'],
  assignmentRevision: 2,
});
const AT = '2026-10-25T15:00:00.000Z';

test('Prepare Recovery on Day 1: the Warm-Up becomes ready from the interval family; the DOL waits on the two questions no family writes; no question changes', () => {
  const assignment = liveCopy(DAY_ONE, 'live-interval-day-1');
  assert.equal(recoveryPreparationAvailable(assignment), true, 'the card says Recovery can be added');
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}:${change.constraints.shape}`), [
    'Warm-Up Q1:q_warmup-1_1_1:add:intervals.graphAndWrite:segment',
    'Warm-Up Q2:q_warmup-1_1_2:add:intervals.graphAndWrite:ray',
    'Warm-Up Q3:q_warmup-1_1_3:add:intervals.graphAndWrite:twoRays',
    'DOL Q1:q_dol-4_4_1:add:intervals.graphAndWrite:rayAndSegment',
  ]);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions} fresh versions`));
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'unavailable', message: null },
  });
  assert.deepEqual(report.notReady.map((row) => `${row.label}:${row.issues[0].code}`), ['DOL Q2:no-certified-family', 'DOL Q3:no-certified-family']);
  assert.deepEqual(report.recoveryContent, { versionBefore: 0, versionAfter: 1, bindingsBefore: 0, bindingsAfter: 4 });
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

test('Prepare Recovery on Day 2: its number-line Warm-Up question makes the Warm-Up ready; nothing else changes', () => {
  const assignment = liveCopy(DAY_TWO, 'live-interval-day-2');
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.family.id}:${change.constraints.shape}`), [
    'Warm-Up Q2:q_warmup-1_1_2:intervals.graphAndWrite:segment',
  ]);
  assert.deepEqual(report.readiness.warmup, { before: 'unavailable', after: 'ready', message: null });
  assert.equal(report.readiness.dol.after, 'unavailable');
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

/* ---------------------------------------------------------------------------
 * A student who missed the Day 1 Warm-Up, after the teacher prepared it.
 * ------------------------------------------------------------------------- */

const CLASS = 'class-a2h';
const DAY = '2026-10-19';
const T0 = Date.parse('2026-10-19T16:00:00Z');
const T1 = Date.parse('2026-10-21T15:00:00Z');
const BEFORE = {
  ...liveCopy(DAY_ONE, 'live-interval-journey'),
  courseProfile: { course: 'algebra2', courseLevel: 'honors' },
  rigorVariant: 'honors',
  dueAt: '2026-10-20T23:59:00.000Z',
  lateDueAt: '2026-10-31T23:59:00.000Z',
  warmup: { instructionDate: DAY },
  dol: { instructionDate: DAY },
};
const PREPARED = (() => {
  const preview = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: preview.plan, planHash: preview.planHash, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
  return { ...BEFORE, recoveryContent: applied.recoveryContent };
})();
const QUESTIONS = getStoredAssignmentQuestions(PREPARED);
const WARMUP = QUESTIONS.map((question, index) => (question.activityRole === 'warmup' ? index : null)).filter((index) => index !== null);
const record = (status) => ({ status, attemptCount: 2, totalAttempts: 2, gradedBy: 'server', lastAttemptAt: new Date(T0 - 3_600_000).toISOString(), supportUsage: {} });
const MISSED = Object.fromEntries(WARMUP.map((index) => [index, record('expired')]));

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
    classPeriod: 'Period 2',
    schedule: null,
    supportEvents: [],
    overrides: null,
    sectionModeFor: () => 'shared',
    nowValue: T1,
  });
};
/** A pinned Recovery question, rebuilt as the server rebuilds it to grade it. */
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

test('the missed Day 1 Warm-Up: Practice and the Recovery are fresh interval questions, never one from the lesson, graded by the server', () => {
  // The originals are the questions students answered, byte for byte.
  assert.deepEqual(getStoredAssignmentQuestions(BEFORE), QUESTIONS);
  // Before the teacher prepared it, the Warm-Up could not recover at all.
  const unprepared = contextFor({ assignment: BEFORE }).eligibility;
  assert.deepEqual([unprepared.state, unprepared.reason], [RECOVERY_STATE.UNAVAILABLE, 'generation-unavailable']);
  assert.equal(contextFor().eligibility.state, RECOVERY_STATE.LOCKED, 'prepared: locked until Practice shows mastery');
  // What Practice and the Recovery deal around: every number-line problem in
  // the lesson, not only the Warm-Up's own.
  const seen = contextFor().seenFingerprints;
  DAY_ONE_INTERVALS.forEach((fingerprint) => assert.ok(seen.includes(fingerprint), `${fingerprint} is never dealt as fresh`));

  let records = {};
  let context = contextFor();
  const dealt = [];
  for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item, 'a Practice question is dealt');
    const { question, instance } = reproduce(context, item);
    assert.equal(question.type, 'intervalNumberLine', 'in the original\'s tool');
    assert.equal(item.pin.familyId, FAMILY_ID);
    const outcome = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
      at: T1 + step * 60_000,
    });
    assert.equal(outcome.response.isCorrect, true, 'the server marks the right graph and notation right');
    dealt.push(item.pin.fingerprint);
    records = { warmup: outcome.record };
    context = contextFor({ records });
  }
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, 'Practice on its own unlocks it');
  assert.equal(new Set(dealt).size, dealt.length, 'no Practice question repeats');
  dealt.forEach((fingerprint) => assert.ok(!DAY_ONE_INTERVALS.includes(fingerprint), `${fingerprint} is not a problem from the lesson`));

  const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
  const plan = started.record.plan;
  assert.deepEqual(plan.items.map((item) => item.storageIndex), WARMUP, 'one Recovery question per Warm-Up question, in order');
  const running = contextFor({ records: { warmup: started.record } });
  const shapes = ['segment', 'ray', 'twoRays'];
  const responses = {};
  plan.items.forEach((item, index) => {
    assert.ok(!DAY_ONE_INTERVALS.includes(item.pin.fingerprint), `${item.itemId} is not a problem from the lesson`);
    assert.ok(!dealt.includes(item.pin.fingerprint), `${item.itemId} was not already practised`);
    assert.match(item.pin.fingerprint, new RegExp(`^intervals\\.graphAndWrite:${shapes[index]}\\|`), `Warm-Up Q${index + 1} is recovered as a ${shapes[index]}, like the original`);
    const { question, instance } = reproduce(running, item);
    const keys = recoveryKeyResponses(question, instance);
    assert.notEqual(gradeServerResponse({ question, response: keys.wrong })?.isCorrect, true, 'a flipped endpoint is wrong');
    responses[item.itemId] = keys.right;
  });
  const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
  assert.equal(submitted.record.status, 'completed');
  assert.equal(submitted.record.rawScore, 100);
});
