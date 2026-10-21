/*
 * RECOVERY V2 — A CLASS ON THE LIVE ALGEBRA I TRANSFORMATIONS LESSON, END TO END.
 *
 * The real lesson ("Algebra I — Vertical and Horizontal Transformations of
 * Linear Functions"), compiled exactly as a teacher's import compiles it, with
 * a class part-way through it. Then, in order, the way it will happen:
 *
 *   1. the DOL day: some students have finished, some are part-way;
 *   2. the teacher approves the Recovery upgrade (one field beside the questions);
 *   3. the part-way student finishes the ORIGINAL DOL — the same questions,
 *      graded the same way;
 *   4. the DOL closes; Recovery opens for the students below the cap;
 *   5. a student whose own assignment Practice shows mastery is unlocked by
 *      it; another unlocks through Recovery Practice; help, retries and
 *      teacher-graded answers never count;
 *   6. the Recovery: fresh versions of each DOL question — never the original,
 *      never one already practised — identical on every device, resumable;
 *   7. the grade: the higher of the original and the capped Recovery, the same
 *      on the student's panel, the teacher's audit, the Grade Export Hub and
 *      the Classroom passback; a Recovery never lowers a grade.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { ALGEBRA1_TRANSFORMATIONS_RECOVERY_V2 as MIGRATION } from '../../functions/shared/recoveryMigrations.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { recordedSectionScore } from '../../functions/shared/sectionRecoveryGrade.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { buildStudentRecoverySummary } from '../../src/platform/recovery/studentRecoveryModel.js';
import { buildTeacherRecoveryAudit } from '../../src/platform/recovery/teacherRecoveryAudit.js';
import { buildTeacherRecoveryRoster, RECOVERY_ROSTER_GROUP } from '../../src/platform/recovery/teacherRecoveryRoster.js';
import { projectSectionRecoveryForAssignment } from '../../src/platform/grading/sectionRecoveryGrades.js';
import { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } from '../../src/platform/grading/canonicalGradeProjection.js';

const require = createRequire(import.meta.url);
const { projectRecoveredGradeInputs, recoveryChangedAssignmentIds } = require('../../functions/lib/sectionRecoveryGrades.js');
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');

const LESSON = compileTeacherImport(readFileSync(new URL(`../../${MIGRATION.lessonFile}`, import.meta.url), 'utf8')).model;
const CLASS = 'class-p1';
const DOL_DAY = '2026-10-19';
const T0 = Date.parse('2026-10-19T16:00:00Z'); // the DOL day
const T1 = Date.parse('2026-10-21T15:00:00Z'); // two school days later; the final date is ahead

const liveAssignment = () => ({
  ...structuredClone(LESSON.assignmentV5),
  id: 'live-l2',
  title: LESSON.assignmentV5.assignment.title,
  courseProfile: { course: 'algebra1', courseLevel: 'standard' },
  rigorVariant: 'standard',
  assignedClassIds: [CLASS],
  dueAt: '2026-10-20T23:59:00.000Z',
  lateDueAt: '2026-10-31T23:59:00.000Z',
  warmup: { instructionDate: DOL_DAY },
  dol: { instructionDate: DOL_DAY },
});

const BEFORE = liveAssignment();
const QUESTIONS = getStoredAssignmentQuestions(BEFORE);
const at = (questionId) => QUESTIONS.findIndex((question) => question.questionId === questionId);
const indicesOf = (role) => QUESTIONS.map((question, index) => (question.activityRole === role ? index : null)).filter((index) => index !== null);
const WARMUP = indicesOf('warmup');
const PRACTICE = indicesOf('practice');
const DOL = indicesOf('dol');

const record = (status, overrides = {}) => ({
  status,
  attemptCount: 1,
  totalAttempts: 1,
  gradedBy: 'server',
  lastAttemptAt: new Date(T0 - 3_600_000).toISOString(),
  supportUsage: {},
  ...overrides,
});
const answered = (indices, status = 'correct', overrides = {}) => Object.fromEntries(indices.map((index) => [index, record(status, overrides)]));

// The approved upgrade, applied as the commit callable applies it.
const upgraded = (() => {
  const preview = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: MIGRATION, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: preview.plan, planHash: preview.planHash, migrationId: MIGRATION.id, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
  return { ...BEFORE, recoveryContent: applied.recoveryContent };
})();

const contextFor = ({ assignment = upgraded, studentId, tracker, section = 'dol', records = {}, overrides = null, nowValue = T1 }) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const original = splitGradesBySection({ tracker, assignment })[section];
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === section),
    questions,
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record: records[section] || null,
    studentId,
    classId: CLASS,
    classPeriod: 'Period 1',
    schedule: null,
    supportEvents: [],
    overrides,
    sectionModeFor: () => 'shared',
    nowValue,
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
const rightAnswer = (context, item) => { const r = reproduce(context, item); return recoveryKeyResponses(r.question, r.instance).right; };
const wrongAnswer = (context, item) => { const r = reproduce(context, item); return recoveryKeyResponses(r.question, r.instance).wrong; };

const bindingFingerprints = Object.values(upgraded.recoveryContent.bindings).flatMap((binding) => binding.originalFingerprints);

/* ---------------------------------------------------------------------------
 * The class, on the DOL day.
 * ------------------------------------------------------------------------- */

// Finished everything: every DOL question right.
const FINISHED = { id: 'student-finished', tracker: { ...answered(WARMUP), ...answered(PRACTICE), ...answered(DOL) } };
// Part-way: the Warm-Up, eight Practice questions on their own, and DOL Q1.
const PARTWAY_T0 = { ...answered(WARMUP), ...answered(PRACTICE.slice(0, 8)), ...answered([at('l2-dol-1')]) };

test('1–2. the upgrade adds Recovery without touching a question or a record, and nothing is offered while the DOL is open', () => {
  const studentsBefore = structuredClone([FINISHED.tracker, PARTWAY_T0]);
  // The questions students are answering are byte-identical.
  assert.deepEqual(getStoredAssignmentQuestions(upgraded), QUESTIONS);
  assert.deepEqual(upgraded.sections, BEFORE.sections);
  assert.deepEqual([FINISHED.tracker, PARTWAY_T0], studentsBefore, 'no student record is part of the upgrade');
  // Before the upgrade a closed DOL could not recover — after it, it can.
  const without = contextFor({ assignment: BEFORE, studentId: 'student-partway', tracker: { ...PARTWAY_T0, [at('l2-dol-2')]: record('expired') } });
  assert.equal(without.eligibility.state, RECOVERY_STATE.UNAVAILABLE);
  assert.equal(without.eligibility.reason, 'generation-unavailable');
  // On the DOL day itself, nothing is offered: Recovery is never the easier path.
  assert.deepEqual(buildStudentRecoverySummary({ assignment: upgraded, tracker: PARTWAY_T0, studentId: 'student-partway', classId: CLASS, classPeriod: 'Period 1', nowValue: T0 }), []);
});

test('3. the part-way student finishes the ORIGINAL DOL: the same questions, graded exactly as before the upgrade', () => {
  const before = getStoredAssignmentQuestions(BEFORE);
  const after = getStoredAssignmentQuestions(upgraded);
  ['l2-dol-2', 'l2-dol-3'].forEach((questionId) => {
    const original = before[at(questionId)];
    const now = after[at(questionId)];
    assert.deepEqual(now, original, `${questionId} is the question the student started`);
    // Their answer (the key) and a wrong one grade identically on both.
    const key = { kind: 'fields', type: 'multiAnswer', value: '', fields: original.answerFields.map((field) => ({ id: field.id, value: String(field.answer), isComplete: true })) };
    const wrong = { ...key, fields: key.fields.map((field, index) => (index === 0 ? { ...field, value: '999' } : field)) };
    assert.equal(gradeServerResponse({ question: runtimeRepairedQuestion(now), response: key }).isCorrect, true);
    assert.deepEqual(gradeServerResponse({ question: runtimeRepairedQuestion(now), response: key }), gradeServerResponse({ question: runtimeRepairedQuestion(original), response: key }));
    assert.deepEqual(gradeServerResponse({ question: runtimeRepairedQuestion(now), response: wrong }), gradeServerResponse({ question: runtimeRepairedQuestion(original), response: wrong }));
  });
});

// After finishing: DOL Q2 wrong (out of tries), DOL Q3 right.
const PARTWAY = { id: 'student-partway', tracker: { ...PARTWAY_T0, [at('l2-dol-2')]: record('expired', { attemptCount: 2, totalAttempts: 2 }), [at('l2-dol-3')]: record('correct') } };

test('4–5. the DOL closes: the part-way student\'s own Practice unlocks Recovery; the finished student needs none', () => {
  const summary = buildStudentRecoverySummary({ assignment: upgraded, tracker: PARTWAY.tracker, studentId: PARTWAY.id, classId: CLASS, classPeriod: 'Period 1', nowValue: T1 });
  const dol = summary.find((entry) => entry.section === 'dol');
  assert.equal(dol.state, RECOVERY_STATE.UNLOCKED, 'eight Practice questions on the DOL\'s skill, answered on their own, are mastery');
  assert.ok(dol.masterySources.assignmentPractice.correct >= 7);
  assert.equal(dol.assignmentPractice.role, 'counts');
  assert.deepEqual(dol.assignmentPractice.countingNumbers, PRACTICE.map((_, index) => index + 1), 'every Practice question in this lesson is on the DOL\'s TEKS');
  assert.match(dol.originalClosedLabel, /Your exit ticket was given in class on .*Oct.* 19 and is now closed\./);
  assert.ok(dol.endsAtLabel, 'the end date is shown');
  // The Warm-Up was all right: nothing to recover.
  assert.equal(summary.find((entry) => entry.section === 'warmup'), undefined);
  // The finished student: at the cap, not needed.
  assert.equal(contextFor({ studentId: FINISHED.id, tracker: FINISHED.tracker }).eligibility.state, RECOVERY_STATE.NOT_NEEDED);
});

test('5. help, a device\'s own verdict and a teacher\'s grade never count as the student\'s mastery', () => {
  const dolMissed = { ...answered(WARMUP), ...answered([at('l2-dol-1')], 'expired'), ...answered([at('l2-dol-2'), at('l2-dol-3')], 'expired') };
  const hinted = { ...dolMissed, ...answered(PRACTICE.slice(0, 8), 'correct', { supportUsage: { hintUsed: true } }) };
  const solved = { ...dolMissed, ...answered(PRACTICE.slice(0, 8), 'correct', { supportUsage: { workedExampleUsed: true } }) };
  const deviceGraded = { ...dolMissed, ...answered(PRACTICE.slice(0, 8), 'correct', { gradedBy: 'client' }) };
  const corrected = { ...dolMissed, ...answered(PRACTICE.slice(0, 8), 'correct', { partGrades: [{ liveCorrectionCredit: true }] }) };
  const own = { ...dolMissed, ...answered(PRACTICE.slice(0, 8)) };
  const teacherGraded = Object.fromEntries(PRACTICE.slice(0, 8).map((index) => [index, { active: true, score: 100 }]));
  const stateOf = (tracker, overrides = null) => contextFor({ studentId: 'student-x', tracker, overrides }).eligibility.state;
  assert.equal(stateOf(own), RECOVERY_STATE.UNLOCKED, 'the same answers, given on their own, do count');
  assert.equal(stateOf(hinted), RECOVERY_STATE.LOCKED, 'answers given with a hint are not mastery');
  assert.equal(stateOf(solved), RECOVERY_STATE.LOCKED, 'answers given after a worked example are not mastery');
  assert.equal(stateOf(deviceGraded), RECOVERY_STATE.LOCKED, 'a device\'s verdict the server did not mark is not evidence');
  assert.equal(stateOf(corrected), RECOVERY_STATE.LOCKED, 'credit a content correction granted is not a demonstration');
  assert.equal(stateOf(own, teacherGraded), RECOVERY_STATE.LOCKED, 'a question the teacher graded is not the student\'s own evidence');
  // The Warm-Up's skill (A.3C) is not the Practice's (A.3E): it must be practised for.
  const warmupMissed = { ...own, ...answered(WARMUP, 'expired') };
  const warmup = contextFor({ studentId: 'student-x', tracker: warmupMissed, section: 'warmup' });
  assert.equal(warmup.eligibility.state, RECOVERY_STATE.LOCKED);
  assert.equal(warmup.assignmentPractice.outcomes.length, 0);
});

test('5. Recovery Practice: server-graded, never the original, never repeated — and a hint or a retry does not move the meter', () => {
  const student = 'student-practising';
  const tracker = { ...answered(WARMUP), ...answered(DOL, 'expired') };
  let records = {};
  const dealt = [];
  // A hinted right answer: graded, recorded, not mastery.
  let context = contextFor({ studentId: student, tracker, records });
  assert.equal(context.eligibility.state, RECOVERY_STATE.LOCKED);
  const first = nextRecoveryPracticeItem(context);
  let outcome = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: first.pin, practiceIndex: first.practiceIndex, response: rightAnswer(context, first), supportUsage: { hintUsed: true } }, at: T1 });
  assert.equal(outcome.response.isCorrect, true);
  records = { dol: outcome.record };
  dealt.push(first.pin.fingerprint);
  context = contextFor({ studentId: student, tracker, records });
  assert.equal(context.mastery.correct, 0, 'help is fine to use; it is not evidence');
  // The network drops and the same answer is sent again: refused, not counted twice.
  assert.throws(
    () => runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: first.pin, practiceIndex: first.practiceIndex, response: rightAnswer(context, first) }, at: T1 + 1000 }),
    (error) => error.code === 'practice-item-repeated',
  );
  // Then on their own, until it unlocks.
  for (let step = 1; step <= 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
    const item = nextRecoveryPracticeItem(context);
    outcome = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: rightAnswer(context, item) }, at: T1 + step * 60_000 });
    dealt.push(item.pin.fingerprint);
    records = { dol: outcome.record };
    context = contextFor({ studentId: student, tracker, records });
  }
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED);
  assert.equal(new Set(dealt).size, dealt.length, 'no Practice question repeats');
  dealt.forEach((fingerprint) => assert.ok(!bindingFingerprints.includes(fingerprint), 'Practice never re-serves a live question'));
  const dolFamilies = DOL.map((index) => upgraded.recoveryContent.bindings[QUESTIONS[index].questionId].questionFamily.id);
  assert.deepEqual([...new Set(records.dol.practice.items.map((item) => item.familyId))].sort(), [...new Set(dolFamilies)].sort(), 'Practice covers every DOL question\'s skill, from its certified family');
});

/* ---------------------------------------------------------------------------
 * The Recovery itself, and the grade.
 * ------------------------------------------------------------------------- */

const completeRecovery = ({ studentId, tracker, answer }) => {
  const started = runSectionRecoveryAction({ context: contextFor({ studentId, tracker }), action: RECOVERY_ACTION.START, at: T1 });
  const startedRecord = started.record;
  const context = contextFor({ studentId, tracker, records: { dol: startedRecord } });
  const responses = Object.fromEntries(startedRecord.plan.items.map((item, index) => [item.itemId, answer(context, item, index)]));
  const submitted = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 3_600_000 });
  return { started: startedRecord, completed: submitted.record, context };
};

test('6. the Recovery: a fresh version of every DOL question, never the original, the same on every device, resumable after a lost connection', () => {
  const started = runSectionRecoveryAction({ context: contextFor({ studentId: PARTWAY.id, tracker: PARTWAY.tracker }), action: RECOVERY_ACTION.START, at: T1 });
  const plan = started.record.plan;
  assert.deepEqual(plan.items.map((item) => item.storageIndex), DOL, 'one Recovery question per DOL question, in order');
  const context = contextFor({ studentId: PARTWAY.id, tracker: PARTWAY.tracker, records: { dol: started.record } });
  plan.items.forEach((item) => {
    // Original and Recovery instances are told apart by their fingerprints.
    assert.ok(!bindingFingerprints.includes(item.pin.fingerprint), `${item.itemId} is not the live question`);
    const family = upgraded.recoveryContent.bindings[QUESTIONS[item.storageIndex].questionId].questionFamily.id;
    assert.equal(item.pin.familyId, family, `${item.itemId} comes from its question's certified family`);
    // Two devices (or a refresh) rebuild exactly the same question and key.
    const onLaptop = reproduce(context, item);
    const onChromebook = reproduce(context, item);
    assert.deepEqual(onChromebook.question, onLaptop.question);
    assert.equal(onLaptop.question.type, QUESTIONS[item.storageIndex].type, 'the same tool as the original');
    assert.equal(serverRecoveryKeyCheck(onLaptop.question, onLaptop.instance).isCorrect, true, 'graded by the server');
  });
  // The connection drops after Start; Start again resumes the same Recovery.
  const resumed = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 5_000 });
  assert.equal(resumed.changed, false);
  assert.deepEqual(resumed.response.plan, plan);
});

test('7. the grade: the higher of the original and the capped Recovery — on the panel, the audit, Grade Export and Classroom alike', async () => {
  const { completed, context } = completeRecovery({ studentId: PARTWAY.id, tracker: PARTWAY.tracker, answer: rightAnswer });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.rawScore, 100);
  const original = splitGradesBySection({ tracker: PARTWAY.tracker, assignment: upgraded }).dol.score;
  assert.ok(original < 90, `the original DOL was ${original}%`);
  const expected = recordedSectionScore({ originalScore: original, rawRecoveryScore: 100, cap: 90 });
  assert.equal(expected, 90);
  assert.equal(context.policy.dol.maxRecordedScore, 90);

  const student = {
    id: PARTWAY.id,
    gradesByAssignment: { [upgraded.id]: PARTWAY.tracker },
    sectionRecoveryByAssignment: { [upgraded.id]: { dol: completed } },
    teacherGradeOverridesByAssignment: {},
  };
  // The student's panel.
  const panel = buildStudentRecoverySummary({ assignment: upgraded, tracker: PARTWAY.tracker, recoveryForAssignment: { dol: completed }, studentId: PARTWAY.id, classId: CLASS, classPeriod: 'Period 1', nowValue: T1 + 7_200_000 })
    .find((entry) => entry.section === 'dol');
  assert.deepEqual(panel.result, { original: `${original}%`, recovery: '100%', final: '90%' });
  // The teacher's audit, with what unlocked it.
  const [audit] = buildTeacherRecoveryAudit({ student, assignment: upgraded, nowValue: T1 + 7_200_000 });
  assert.equal(audit.final, '90%');
  assert.match(audit.evidence, /from the assignment's own Practice/);
  // The Grade Export Hub's section and assignment grades.
  assert.equal(canonicalPresentedSectionGrade({ student, assignment: upgraded, sectionKey: 'dol' }), 90);
  const withoutRecovery = canonicalPresentedAssignmentGrade({ student: { ...student, sectionRecoveryByAssignment: {} }, assignment: upgraded });
  assert.ok(canonicalPresentedAssignmentGrade({ student, assignment: upgraded }) > withoutRecovery);
  // Classroom passback projects the same DOL as the browser, and wakes once.
  const server = await projectRecoveredGradeInputs({
    assignment: upgraded,
    tracker: PARTWAY.tracker,
    questions: getStoredAssignmentQuestions(upgraded),
    overrides: {},
    recoveryForAssignment: { dol: completed },
    gradeProgress: assignmentGradeProgress,
  });
  const browser = projectSectionRecoveryForAssignment({ tracker: PARTWAY.tracker, assignment: upgraded, recoveryByAssignment: { [upgraded.id]: { dol: completed } } });
  assert.equal(server.states.dol.recordedScore, 90);
  assert.equal(browser.states.dol.recordedScore, 90);
  assert.deepEqual(recoveryChangedAssignmentIds({ sectionRecoveryByAssignment: { [upgraded.id]: { dol: completed } } }, { sectionRecoveryByAssignment: { [upgraded.id]: { dol: { ...completed, status: 'inProgress' } } } }), [upgraded.id]);
  assert.deepEqual(recoveryChangedAssignmentIds({ sectionRecoveryByAssignment: { [upgraded.id]: { dol: completed } } }, { sectionRecoveryByAssignment: { [upgraded.id]: { dol: completed } } }), [], 'nothing re-sent when nothing changed');
});

test('7. a Recovery never lowers a grade: a weaker second try leaves the original standing', () => {
  // DOL Q1 and Q3 right, Q2 wrong (the part-way student); the Recovery all wrong.
  const { completed } = completeRecovery({ studentId: PARTWAY.id, tracker: PARTWAY.tracker, answer: wrongAnswer });
  assert.equal(completed.status, 'completed');
  assert.ok(completed.rawScore < 50, `raw Recovery ${completed.rawScore}%`);
  const student = { id: PARTWAY.id, gradesByAssignment: { [upgraded.id]: PARTWAY.tracker }, sectionRecoveryByAssignment: { [upgraded.id]: { dol: completed } }, teacherGradeOverridesByAssignment: {} };
  const original = splitGradesBySection({ tracker: PARTWAY.tracker, assignment: upgraded }).dol.score;
  assert.equal(canonicalPresentedSectionGrade({ student, assignment: upgraded, sectionKey: 'dol' }), original);
  assert.equal(
    canonicalPresentedAssignmentGrade({ student, assignment: upgraded }),
    canonicalPresentedAssignmentGrade({ student: { ...student, sectionRecoveryByAssignment: {} }, assignment: upgraded }),
  );
});

test('the teacher sees the whole class: who is practising, unlocked, finished or needs nothing — and why', () => {
  const { completed } = completeRecovery({ studentId: PARTWAY.id, tracker: PARTWAY.tracker, answer: rightAnswer });
  const gradeDoc = (id, tracker, recovery = null) => ({
    id,
    name: { first: id.replace('student-', ''), last: 'Student' },
    gradesByAssignment: { [upgraded.id]: tracker },
    sectionRecoveryByAssignment: recovery ? { [upgraded.id]: recovery } : {},
    teacherGradeOverridesByAssignment: {},
  });
  const dolMissed = { ...answered(WARMUP), ...answered(DOL, 'expired') };
  const roster = buildTeacherRecoveryRoster({
    assignment: upgraded,
    students: [
      gradeDoc('student-finished', FINISHED.tracker),
      gradeDoc('student-partway', PARTWAY.tracker, { dol: completed }),
      gradeDoc('student-practising', dolMissed),
      gradeDoc('student-ready', { ...dolMissed, ...answered(PRACTICE.slice(0, 8)) }),
    ],
    classId: CLASS,
    classPeriod: 'Period 1',
    nowValue: T1 + 7_200_000,
  });
  const groupOf = (id) => roster.students.find((entry) => entry.id === id)?.dol?.group;
  assert.equal(groupOf('student-finished'), RECOVERY_ROSTER_GROUP.NOT_NEEDED);
  assert.equal(groupOf('student-partway'), RECOVERY_ROSTER_GROUP.COMPLETED);
  assert.equal(groupOf('student-practising'), RECOVERY_ROSTER_GROUP.PRACTICING);
  assert.equal(groupOf('student-ready'), RECOVERY_ROSTER_GROUP.UNLOCKED);
  const practising = roster.students.find((entry) => entry.id === 'student-practising').dol;
  assert.match(practising.reasonText, /^0 of the last 8 right on their own; needs 7\.$/);
  assert.equal(roster.sections.dol.counts[RECOVERY_ROSTER_GROUP.PRACTICING], 1);
  assert.ok(roster.students.every((entry) => !/^student-/.test(entry.name)), 'a name, never an id');
});
