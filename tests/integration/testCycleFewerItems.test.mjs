/*
 * FEWER QUESTIONS ON A SECURE TEST CYCLE, AGAINST THE REAL HANDLERS (TC15).
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-fewer-items \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleFewerItems.test.mjs"
 *
 * The owner's decision: for a student whose support plan lists "Reduced number
 * of items — same TEKS and rigor", their teacher chooses which secure Test
 * questions they skip; MathMaster never reshapes a Test by itself. This sits
 * the real secure Tests through the real Cloud Functions and reads back what
 * landed:
 *
 *   - only the teacher of record, only for a plan that lists it, only a choice
 *     that keeps every skill and at most half the Test;
 *   - the choice on the student's own record (who, when, an audit row), never
 *     on the shared assignment;
 *   - their Test is the plan they would have had minus the excused questions,
 *     set before or after sessions open, re-planned in place until they start
 *     — and locked once they do, even before the record has caught up;
 *   - they are told how many questions their Test has, and nothing else;
 *   - the grade is over the questions asked; Corrections come only from those;
 *     the Retest is shorter by the same share; a Retest that stands in for a
 *     missed Test leaves out the same questions;
 *   - the classmate without the accommodation takes, and is graded on, the
 *     whole Test exactly as before.
 *
 * Ids are prefixed `tc15` because the integration suites share one emulator.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CERT_TARGETS, CERT_WRONG_ANSWER, certAnswerFromPrompt, certAssessmentPolicy, certFamilies,
} from '../fixtures/testCycleCertificationFixture.mjs';
import {
  OTHER_TEACHER_EMAIL, TEACHER_EMAIL, admin, db, fns, readCorrectionPlan, readGradeDoc, readRecord, readRetestPlan,
  readSession, refusal, sitSecureExam, studentRequest, teacherRequest,
} from './testCycleCertificationHarness.mjs';
import { buildSecureIssuancePlan } from '../../functions/shared/testCycleIssuance.mjs';
import { normalizeTestBlueprint } from '../../functions/shared/testCycleBlueprint.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { withClassTestDay } from '../../functions/shared/testCycleAvailability.mjs';
import { SCHOOL_TIME_ZONE } from '../../functions/shared/sectionDeadline.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';

const PREFIX = 'tc15_';
const CLASS_F = 'tc15-class-f';
const CLASS_W = 'tc15-class-w';
const PERIOD_F = 'TC15 Period F';
const PERIOD_W = 'TC15 Period W';
// Ids carry no word the "names nothing" checks below look for.
const FEWER = `${PREFIX}cycle`;
const MISSED = `${PREFIX}missedcycle`;

const DAY = 86400000;
const dayKey = (offset) => zonedDateKey(Date.now() + offset * DAY, SCHOOL_TIME_ZONE);

const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families().filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`)).map((family) => family.id);

// The certification's Test: five skills, five questions each, weight 1 — 25
// questions, so every score below is exact.
const blueprint = () => ({
  blueprintId: `${PREFIX}blueprint`,
  version: 1,
  title: 'TC15 Unit 5 Test',
  courseId: 'algebra1',
  calculatorMode: 'questionSpecific',
  targets: CERT_TARGETS.map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: target.questionCount,
    familyIds: familyIdsFor(target.targetId),
  })),
});
const assignmentDoc = (id, classIds) => ({
  id,
  schemaVersion: 5,
  title: `TC15 Unit 5 ${id}`,
  courseId: 'algebra1',
  assignedClassIds: classIds,
  dueAt: '2099-01-01T00:00:00.000Z',
  lateDueAt: '2099-01-08T00:00:00.000Z',
  assignment: { title: `TC15 Unit 5 ${id}`, courseId: 'algebra1' },
  // The class's Retest is pinned to 10 questions, so "shorter by the same
  // share" is an exact number (20 of 25 → 8) — and a different one from
  // "no longer than their own Test", which would leave it at 10.
  assessmentPolicy: { ...certAssessmentPolicy(), retest: { ...certAssessmentPolicy().retest, questionCount: 10 } },
  testBlueprint: blueprint(),
  sections: [{
    id: 'review',
    role: 'review',
    title: 'Review',
    questions: [
      { questionId: `${PREFIX}review_1`, type: 'response', prompt: 'Review 1' },
      { questionId: `${PREFIX}review_2`, type: 'response', prompt: 'Review 2' },
    ],
  }],
});

/* --- support plans, as the profile editor saves them ---------------------- */

const ACCOMMODATION = 'reduced-item-count-same-rigor';
const planWith = (accommodations) => JSON.parse(JSON.stringify(buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false, accommodations, modifications: [],
  }],
  todayKey: '2026-10-01',
  updatedAt: '2026-10-01T12:00:00.000Z',
})));
const fewerItems25 = () => planWith([{ id: ACCOMMODATION, params: { itemReduction: { mode: 'percent', value: 25 } } }]);
const fewerItemsRecorded = () => planWith([{ id: ACCOMMODATION, params: {} }]);
const otherSupportOnly = () => planWith([{ id: 'extended-time', params: {} }]);

const ROSTER = {
  R: ['TC15_RHEA', CLASS_F, PERIOD_F, fewerItems25()],       // the student whose teacher chooses fewer questions
  N: ['TC15_NOOR', CLASS_F, PERIOD_F, otherSupportOnly()],   // a classmate whose plan does not list it
  L: ['TC15_LEIF', CLASS_F, PERIOD_F, fewerItemsRecorded()], // starts before the record has caught up
  M: ['TC15_MAYA', CLASS_W, PERIOD_W, fewerItems25()],       // misses the Test: a Retest stands in for it
};
const id = (key) => ROSTER[key][0];
const ALL_STUDENTS = Object.values(ROSTER).map(([studentId]) => studentId);

const choose = (assignmentId, studentId, excusedSlotIds, email = TEACHER_EMAIL) => fns.setTestCycleReducedItems.run(
  teacherRequest({ assignmentId, studentId, excusedSlotIds }, email),
);
const card = (studentId, assignmentId = FEWER) => fns.getStudentTestCycle.run(studentRequest(studentId, { assignmentId }));
const listing = (assignmentId = FEWER) => fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId }));
const completeReview = (studentId, assignmentId = FEWER) => db.collection('grades').doc(studentId).set({
  gradesByAssignment: { [assignmentId]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
}, { merge: true });
const sit = (options) => sitSecureExam({ ...options, answerFromPrompt: certAnswerFromPrompt, wrongAnswer: CERT_WRONG_ANSWER });
const slotIdsOf = (plan) => (plan?.entries || []).map((entry) => entry.slotId);
const historyRows = (record) => (record?.history || []).filter((row) => row.reason === 'reducedItems');

/** The plan this student would have had with nothing excused: the same rule, run here. */
const fullPlanFor = (studentId, assignmentId, { stage = 'test', attempt = 1 } = {}) => buildSecureIssuancePlan({
  blueprint: normalizeTestBlueprint(blueprint()), families: families(), studentId, assignmentId, stage, attempt,
});

const FIRST_CHOICE = ['tA#1', 'tB#1', 'tC#1', 'tD#1'];
const CHOICE = ['tA#2', 'tB#2', 'tC#2', 'tD#2', 'tE#2'];
// Words that would name the accommodation to the student.
const NAMES_IT = /fewer|reduc|accommodat|excus|support plan|skipp/i;
// A secure session's public payload carries `accommodationsConfirmed` for
// every student (a proctor flag); it is the same for the classmate and says
// nothing about this one, so it is left out of the check.
const sessionWords = (session) => {
  const { accommodationsConfirmed: _flag, ...rest } = session || {};
  return JSON.stringify(rest);
};

before(async () => {
  await Promise.all(families().map(({ id: familyId, ...fields }) => db.collection('pathQuestionBank').doc(familyId).set(fields)));
  await Promise.all([
    [CLASS_F, PERIOD_F],
    [CLASS_W, PERIOD_W],
  ].map(([classId, period]) => db.collection('classes').doc(classId).set({
    name: `TC15 ${period}`, course: 'algebra1', courseLevel: 'standard', period, teacherOfRecord: TEACHER_EMAIL, status: 'active',
  })));
  await Promise.all(Object.values(ROSTER).map(([studentId, classId, period, profile]) => db.collection('grades').doc(studentId).set({
    displayName: `${studentId.replace(/^TC15_/, '').toLowerCase()} learner`, classId, classPeriod: period,
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {}, profile,
  })));
  await Promise.all([
    db.collection('assignments').doc(FEWER).set(assignmentDoc(FEWER, [CLASS_F])),
    db.collection('assignments').doc(MISSED).set(assignmentDoc(MISSED, [CLASS_W])),
  ]);
});

after(async () => {
  const cleanup = [];
  for (const assignmentId of [FEWER, MISSED]) {
    // eslint-disable-next-line no-await-in-loop
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', assignmentId).get();
    cleanup.push(
      db.collection('assignments').doc(assignmentId).delete(),
      db.collection('testCycleAnswerReleases').doc(assignmentId).delete(),
      ...sessions.docs.map((doc) => doc.ref.delete()),
      ...ALL_STUDENTS.flatMap((studentId) => [
        db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).delete(),
        db.collection('testCycleCorrectionPlans').doc(`${assignmentId}__${studentId}`).delete(),
        db.collection('testCycleRetestPlans').doc(`${assignmentId}__${studentId}`).delete(),
      ]),
    );
  }
  // Only this file's period comes out of the shared bell schedule.
  const { FieldPath, FieldValue } = admin.firestore;
  cleanup.push(db.collection('settings').doc('classSchedule').update(
    new FieldPath('modifiedSchedules', dayKey(-1), 'periods', PERIOD_W), FieldValue.delete(),
  ).catch(() => {}));
  await Promise.allSettled([
    ...cleanup,
    ...families().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    ...[CLASS_F, CLASS_W].map((classId) => db.collection('classes').doc(classId).delete()),
    ...ALL_STUDENTS.map((studentId) => db.collection('grades').doc(studentId).delete()),
  ]);
});

/* --- who may choose, for whom, and what ------------------------------------ */

test('only the teacher of record, only for a plan that lists fewer items, only a choice that keeps every skill', async () => {
  const otherTeacher = await refusal(choose(FEWER, id('R'), ['tA#2'], OTHER_TEACHER_EMAIL));
  assert.equal(otherTeacher?.code, 'permission-denied');
  const asStudent = await refusal(fns.setTestCycleReducedItems.run(studentRequest(id('R'), { assignmentId: FEWER, studentId: id('R'), excusedSlotIds: ['tA#2'] })));
  assert.ok(asStudent, 'a student cannot choose');
  assert.notEqual(asStudent.code, null);

  const noPlan = await refusal(choose(FEWER, id('N'), ['tA#2']));
  assert.equal(noPlan?.code, 'failed-precondition');
  assert.match(noPlan.message, /support plan does not list fewer items, so their Test stays whole/);

  const wholeSkill = await refusal(choose(FEWER, id('R'), ['tA#1', 'tA#2', 'tA#3', 'tA#4', 'tA#5']));
  assert.equal(wholeSkill?.code, 'invalid-argument');
  assert.match(wholeSkill.message, /Keep at least one question on each skill: Solving linear equations/);

  const overHalf = await refusal(choose(FEWER, id('R'), ['tA#1', 'tA#2', 'tA#3', 'tB#1', 'tB#2', 'tB#3', 'tC#1', 'tC#2', 'tC#3', 'tD#1', 'tD#2', 'tD#3', 'tE#1']));
  assert.equal(overHalf?.code, 'invalid-argument');
  assert.match(overHalf.message, /At most 12 of the 25 questions can be skipped/);

  const notAList = await refusal(fns.setTestCycleReducedItems.run(teacherRequest({ assignmentId: FEWER, studentId: id('R') })));
  assert.equal(notAList?.code, 'invalid-argument');

  // Nothing was written by any refusal.
  assert.equal(await readRecord(FEWER, id('R')), undefined);
  assert.equal(await readRecord(FEWER, id('N')), undefined);
});

test('set before sessions open: on the student\'s own record, with who and when — never on the assignment', async () => {
  const assignmentBefore = (await db.collection('assignments').doc(FEWER).get()).data();
  const result = await choose(FEWER, id('R'), ['tD#1', 'tA#1', 'tC#1', 'tB#1']);
  assert.equal(result.changed, true);
  assert.equal(result.questions, 21);
  assert.equal(result.testQuestions, 25);
  assert.equal(result.label, 'Fewer questions: answers 21 of 25 (skips questions 1, 6, 11 and 16).');

  const record = await readRecord(FEWER, id('R'));
  assert.deepEqual(record.reducedItems.excusedSlotIds, FIRST_CHOICE, 'in Test order');
  assert.equal(record.reducedItems.questions, 21);
  assert.equal(record.reducedItems.setBy, TEACHER_EMAIL);
  assert.ok(Number(record.reducedItems.setAt) > 0);
  assert.equal(record.reducedItems.blueprintId, `${PREFIX}blueprint`);
  const [row] = historyRows(record);
  assert.equal(row.by, TEACHER_EMAIL);
  assert.equal(row.detail, result.label);

  assert.deepEqual((await db.collection('assignments').doc(FEWER).get()).data(), assignmentBefore, 'the shared assignment is untouched');
  // What the student's own grade document carries says nothing about it.
  assert.doesNotMatch(JSON.stringify((await readGradeDoc(id('R'))).testCycleGrades?.[FEWER] || {}), NAMES_IT);
});

test('their Test is the plan they would have had, minus the excused questions; the classmate\'s is the whole Test', async () => {
  const opened = await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: FEWER, classId: CLASS_F }));
  assert.equal(opened.createdSessions, 3);

  const reducedRecord = await readRecord(FEWER, id('R'));
  const reduced = await readSession(reducedRecord.test.examSessionId);
  assert.equal(reduced.requiredQuestions, 21);
  assert.equal(reducedRecord.test.totalQuestions, 21);
  assert.deepEqual(reduced.issuancePlan.excusedSlotIds, FIRST_CHOICE);
  const expected = fullPlanFor(id('R'), FEWER).entries.filter((entry) => !FIRST_CHOICE.includes(entry.slotId));
  assert.deepEqual(
    reduced.issuancePlan.entries.map((entry) => [entry.slotId, entry.familyId, entry.seedKey]),
    expected.map((entry) => [entry.slotId, entry.familyId, entry.seedKey]),
    'every other question exactly as it would have been',
  );

  const wholeRecord = await readRecord(FEWER, id('N'));
  const whole = await readSession(wholeRecord.test.examSessionId);
  assert.equal(whole.requiredQuestions, 25);
  assert.equal(whole.issuancePlan.entries.length, 25);
  assert.equal('excusedSlotIds' in whole.issuancePlan, false);
  assert.equal('reducedItems' in wholeRecord, false, 'a classmate\'s record keeps its shape');
});

test('changed before they start: their unstarted session is re-planned in place, nothing of the old choice left', async () => {
  const before = await readRecord(FEWER, id('R'));
  const result = await choose(FEWER, id('R'), CHOICE);
  assert.equal(result.questions, 20);
  const record = await readRecord(FEWER, id('R'));
  assert.equal(record.test.examSessionId, before.test.examSessionId, 'the same session, re-planned');
  const session = await readSession(record.test.examSessionId);
  assert.equal(session.status, 'not_started');
  assert.equal(session.requiredQuestions, 20);
  assert.equal(record.test.totalQuestions, 20);
  assert.deepEqual(session.issuancePlan.excusedSlotIds, CHOICE);
  assert.deepEqual(slotIdsOf(session.issuancePlan), fullPlanFor(id('R'), FEWER).entries.map((entry) => entry.slotId).filter((slotId) => !CHOICE.includes(slotId)));
  assert.ok(slotIdsOf(session.issuancePlan).includes('tA#1'), 'a question excused before is asked again');
  assert.equal(historyRows(record).length, 2);

  // The same choice again changes nothing and logs nothing.
  const again = await choose(FEWER, id('R'), [...CHOICE].reverse());
  assert.equal(again.changed, false);
  assert.equal(historyRows(await readRecord(FEWER, id('R'))).length, 2);
});

test('the student is told how many questions their Test has, and nothing that names why', async () => {
  await Promise.all([completeReview(id('R')), completeReview(id('N'))]);
  const reducedCard = await card(id('R'));
  assert.equal(reducedCard.stage, 'test');
  assert.equal(reducedCard.delivery.questionCount, 20);
  assert.deepEqual(reducedCard.testSkills.map((skill) => skill.questionCount), [4, 4, 4, 4, 4]);
  assert.doesNotMatch(JSON.stringify(reducedCard), NAMES_IT);

  const wholeCard = await card(id('N'));
  assert.equal(wholeCard.delivery.questionCount, 25);
  assert.deepEqual(wholeCard.testSkills.map((skill) => skill.questionCount), [5, 5, 5, 5, 5]);

  // The teacher's table says it, for this student only.
  const table = await listing();
  const reducedRow = table.rows.find((row) => row.studentId === id('R'));
  assert.deepEqual(
    { questions: reducedRow.reducedItems.questions, testQuestions: reducedRow.reducedItems.testQuestions, plan: reducedRow.reducedItems.planListsFewerItems, percent: reducedRow.reducedItems.planPercent, locked: reducedRow.reducedItems.locked, by: reducedRow.reducedItems.setBy },
    { questions: 20, testQuestions: 25, plan: true, percent: 25, locked: false, by: TEACHER_EMAIL },
  );
  assert.equal(reducedRow.test.totalQuestions, 20);
  assert.equal(table.rows.find((row) => row.studentId === id('N')).reducedItems, null);
  assert.equal(table.rows.find((row) => row.studentId === id('L')).reducedItems.planListsFewerItems, true, 'recorded only still lists it');
  assert.equal(table.testQuestions.length, 25);
  table.testQuestions.forEach((question) => assert.deepEqual(Object.keys(question).sort(), ['alignmentKey', 'anchor', 'dok', 'label', 'number', 'slotId', 'targetId']));
});

test('the grade counts only the questions they were asked; once they start, the choice is locked', async () => {
  const reducedSessionId = (await readRecord(FEWER, id('R'))).test.examSessionId;
  const started = await fns.startSecureExamSession.run(studentRequest(id('R'), { examSessionId: reducedSessionId }));
  assert.equal(started.session.navigation.total, 20, 'their Test says 20 questions');
  assert.doesNotMatch(sessionWords(started.session), NAMES_IT);

  const locked = await refusal(choose(FEWER, id('R'), ['tA#3']));
  assert.equal(locked?.code, 'failed-precondition');
  assert.match(locked.message, /Locked: this student has started their Test, so its questions cannot change now\./);
  assert.equal((await refusal(choose(FEWER, id('R'), [])))?.code, 'failed-precondition', 'not even given back mid-Test');
  assert.equal((await readSession(reducedSessionId)).requiredQuestions, 20);

  const issued = await sit({ studentId: id('R'), examSessionId: reducedSessionId, correctCount: 13, total: 20 });
  assert.equal(issued.length, 20);
  const answeredSlots = Object.values((await readSession(reducedSessionId)).responses || {}).map((response) => response.slotId);
  assert.ok(answeredSlots.every((slotId) => !CHOICE.includes(slotId)), 'no excused question was ever issued');
  await fns.finalizeSecureExam.run(studentRequest(id('R'), { examSessionId: reducedSessionId }));

  const wholeSessionId = (await readRecord(FEWER, id('N'))).test.examSessionId;
  await sit({ studentId: id('N'), examSessionId: wholeSessionId, correctCount: 13, total: 25 });
  await fns.finalizeSecureExam.run(studentRequest(id('N'), { examSessionId: wholeSessionId }));

  const released = await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: FEWER, stage: 'test', studentIds: [id('R'), id('N')] }));
  assert.equal(released.released, 2);

  const reduced = await readRecord(FEWER, id('R'));
  assert.equal(reduced.test.rawScore, 65, '13 of the 20 questions asked');
  assert.equal(reduced.test.totalQuestions, 20);
  assert.equal(reduced.recordedGrade, 65);
  assert.equal((await readGradeDoc(id('R'))).testCycleGrades[FEWER].recordedGrade, 65);
  const review = (await fns.getStudentSecureExamReview.run(studentRequest(id('R'), { examSessionId: reducedSessionId }))).review;
  assert.equal(review.plannedQuestions, 20);
  assert.equal(review.scorePercent, 65);
  assert.equal(review.possiblePoints, 20);

  const whole = await readRecord(FEWER, id('N'));
  assert.equal(whole.test.rawScore, 52, 'the classmate: 13 of 25, exactly as before');
  assert.equal(whole.recordedGrade, 52);
});

test('Corrections come only from questions they answered; their Retest is shorter by the same share', async () => {
  const corrections = (await readCorrectionPlan(FEWER, id('R'))).plan;
  assert.ok(corrections.targets.length > 0, 'a failed Test (65 against 70) builds corrections');
  const evidenceSlots = corrections.targets.flatMap((target) => target.evidence.map((item) => item.slotId));
  assert.ok(evidenceSlots.length > 0);
  assert.ok(evidenceSlots.every((slotId) => !CHOICE.includes(slotId)), 'nothing excused is ever corrected');

  for (const key of ['R', 'N']) {
    // eslint-disable-next-line no-await-in-loop
    const waived = await fns.teacherTestCycleAction.run(teacherRequest({ assignmentId: FEWER, studentId: id(key), action: 'waiveCorrections' }));
    assert.equal(waived.retestOpened, true, `${key}: the Retest opens`);
  }
  const reducedRetest = await readRetestPlan(FEWER, id('R'));
  assert.equal(reducedRetest.audit.questionCount, 8, 'the class Retest (10) shorter by the same share as their Test (20 of 25)');
  assert.equal(reducedRetest.audit.originalQuestionCount, 20, 'measured against the Test they sat');
  assert.equal(reducedRetest.plan.totalQuestions, 8);
  assert.ok(reducedRetest.blueprint.targets.every((target) => target.sourceTargetId), 'derived from the Test\'s own skills');
  const reducedRecord = await readRecord(FEWER, id('R'));
  assert.equal(reducedRecord.retest.totalQuestions, 8);
  assert.equal((await readSession(reducedRecord.retest.examSessionId)).requiredQuestions, 8);

  const wholeRetest = await readRetestPlan(FEWER, id('N'));
  assert.equal(wholeRetest.audit.questionCount, 10, 'the classmate\'s Retest is the class\'s');
  assert.equal(wholeRetest.audit.originalQuestionCount, 25);
});

test('a start the record has not caught up with already locks the choice', async () => {
  const first = await choose(FEWER, id('L'), ['tA#3']);
  assert.equal(first.questions, 24);
  const record = await readRecord(FEWER, id('L'));
  assert.equal((await readSession(record.test.examSessionId)).requiredQuestions, 24, 're-planned while unstarted');
  // The student's start has landed on the session; its sync to the record has not.
  await db.collection('examSessions').doc(record.test.examSessionId).update({ status: 'in_progress', startedAt: Date.now() });
  assert.equal((await readRecord(FEWER, id('L'))).test.state, 'assigned');
  const locked = await refusal(choose(FEWER, id('L'), ['tA#3', 'tB#3']));
  assert.equal(locked?.code, 'failed-precondition');
  assert.match(locked.message, /^Locked: this student has started their Test/);
  const session = await readSession(record.test.examSessionId);
  assert.equal(session.requiredQuestions, 24, 'the Test under way is not re-planned');
  assert.deepEqual(session.issuancePlan.excusedSlotIds, ['tA#3']);
});

test('a Retest that stands in for a missed Test leaves out the same questions', async () => {
  const opened = await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: MISSED, classId: CLASS_W }));
  assert.equal(opened.createdSessions, 1);
  // The class sat the Test yesterday, in its period on the bell schedule; this
  // student did not start it.
  await db.collection('settings').doc('classSchedule').set({
    modifiedSchedules: { [dayKey(-1)]: { periods: { [PERIOD_W]: { enabled: true, start: '00:00', end: '23:59' } } } },
  }, { merge: true });
  await db.collection('assignments').doc(MISSED).update({ testAvailability: withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }) });
  await completeReview(id('M'), MISSED);

  const missedCard = await card(id('M'), MISSED);
  assert.equal(missedCard.stage, 'retest');
  assert.equal(missedCard.schedule.missedTest, true);
  const before = await readRecord(MISSED, id('M'));
  assert.equal(before.retest.withoutOriginal, true);
  assert.equal((await readSession(before.retest.examSessionId)).requiredQuestions, 25);

  const result = await choose(MISSED, id('M'), CHOICE);
  assert.equal(result.questions, 20);
  const record = await readRecord(MISSED, id('M'));
  assert.equal(record.retest.examSessionId, before.retest.examSessionId, 'the same stand-in, re-planned');
  const standIn = await readSession(record.retest.examSessionId);
  assert.equal(standIn.status, 'not_started');
  assert.equal(standIn.requiredQuestions, 20);
  assert.deepEqual(slotIdsOf(standIn.issuancePlan), fullPlanFor(id('M'), MISSED, { stage: 'retest' }).entries.map((entry) => entry.slotId).filter((slotId) => !CHOICE.includes(slotId)));
  assert.equal(record.retest.totalQuestions, 20);
  const retestPlan = await readRetestPlan(MISSED, id('M'));
  assert.equal(retestPlan.plan.totalQuestions, 20);
  assert.equal(retestPlan.audit.questionCount, 20);
  assert.equal(retestPlan.audit.withoutOriginal, true);
  // The original Test, still unstarted, follows the same choice.
  assert.equal((await readSession(record.test.examSessionId)).requiredQuestions, 20);

  // Their card counts the Retest they will sit, skill by skill.
  const after = await card(id('M'), MISSED);
  assert.deepEqual(after.testSkills.map((skill) => skill.questionCount), [4, 4, 4, 4, 4]);
  assert.doesNotMatch(JSON.stringify(after), NAMES_IT);
});
