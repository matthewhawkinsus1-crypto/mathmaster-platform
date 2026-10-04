// A RECOVERY QUESTION MATHMASTER CANNOT GRADE, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-recovery-p0 \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/sectionRecoveryPlatformFailure.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The pure policy is pinned in tests/platform/sectionRecoveryPlatformFailure.test.mjs.
// This file drives the REAL exported Cloud Functions — the student's
// `advanceSectionRecovery` (Practice, Start, Submit), the teacher's
// `resolveHeldSectionRecovery`, and both Google Classroom grade triggers with
// the Classroom API stubbed — and reads back what production would store and
// what Classroom would be sent:
//
//   * a question whose authoritative pin no longer reproduces is never a
//     zero: its weight leaves the denominator when the rest still covers its
//     skill, and Classroom receives the corrected grade;
//   * when it was the only evidence for a skill, the Recovery is HELD: the
//     record says so, no grade replaces the original, and neither Classroom
//     trigger sends anything — each leaves a `recovery-held` audit row;
//   * only this student's teacher of record can resolve the hold, the
//     resolution is audited, and the passback resumes with it.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  db, fns, patchGradeCalls, refusal, repo, resetClassroomCalls, runClassroomSync, studentRequest, teacherRequest,
} from './canonicalPersistenceHarness.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';

const require = createRequire(import.meta.url);
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));
const sectionEntry = require(path.join(repo, 'functions/classroomSectionEntry.js'));

const P = 'srpf-';
const TEACHER = 'srpf.teacher@desotoisd.org';
const OTHER_TEACHER = 'srpf.other.teacher@desotoisd.org';
const CLASS = `${P}class`;
const OTHER_CLASS = `${P}other-class`;
const COURSE = `${P}course`;
const DAY = 86_400_000;
const NOW = Date.now();
const dateKey = (ms) => new Date(ms).toISOString().slice(0, 10);

const STUDENTS = Array.from({ length: 6 }, (_, index) => `${P}s${index}`);
// The students whose Recoveries this file walks.
const SAME_SKILL_STUDENT = STUDENTS[0];
const HELD_STUDENT = STUDENTS[1];
const ALL_FAILED_STUDENT = STUDENTS[2];
const REPAIR_STUDENT = STUDENTS[3];
const OVERRIDE_STUDENT = STUDENTS[4];

const twoStep = (questionId, questionWeight) => ({ questionId, type: 'stepAlgebra', prompt: 'Solve for x.', questionWeight, questionFamily: { id: 'linear.twoStepEquation' } });
const zeros = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight, questionFamily: { id: 'functions.identifyZeros' } });
const intercepts = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find both intercepts.', questionWeight, questionFamily: { id: 'functions.identifyIntercepts' } });

const ASSIGNMENTS = {
  sameSkill: { id: `${P}same-skill`, dol: [twoStep('d1', 4), zeros('d2', 3), twoStep('d3', 3)] },
  distinct: { id: `${P}distinct`, dol: [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)] },
  allFailed: { id: `${P}all-failed`, dol: [twoStep('d1', 4), zeros('d2', 3), twoStep('d3', 3)] },
  repair: { id: `${P}repair`, dol: [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)] },
  override: { id: `${P}override`, dol: [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)] },
};

const assignmentDoc = ({ id, dol }) => {
  const assignment = {
    id,
    title: `Recovery P0 ${id}`,
    schemaVersion: 5,
    assignedClassIds: [CLASS],
    // The DOL's day is past (Recovery is offered); the final submission date,
    // which is the Recovery end date, is still ahead.
    releaseAt: new Date(NOW - 10 * DAY).toISOString(),
    dueAt: new Date(NOW - 3 * DAY).toISOString(),
    lateDueAt: new Date(NOW + 5 * DAY).toISOString(),
    dol: { instructionDate: dateKey(NOW - 3 * DAY) },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: dol }],
  };
  assignment.generationSeats = { version: 1, byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: STUDENTS }) } };
  const { id: _id, ...stored } = assignment;
  return stored;
};

// The original DOL: only d2 right — 3 of 10 points of weight, 30%.
const ORIGINAL_TRACKER = {
  0: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  1: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
};

const questionsOf = (key) => getStoredAssignmentQuestions({ id: ASSIGNMENTS[key].id, ...assignmentDoc(ASSIGNMENTS[key]) });

const correctResponse = ({ question, instance }) => {
  if (question.type === 'stepAlgebra') return { kind: 'opaque', type: 'stepAlgebra', value: `${question.variable || 'x'}=${question.generatedAnswer}`, fields: [] };
  const answer = instance.answer;
  const values = answer.kind === 'set' ? answer.value.map(String)
    : answer.kind === 'points' ? [`(${answer.value.xIntercept.join(', ')})`, `(${answer.value.yIntercept.join(', ')})`]
      : [String(answer.value)];
  return { kind: 'fields', type: question.type, value: '', fields: (question.answerFields || []).map((field, index) => ({ id: field.id, value: values[index] ?? '', isComplete: true })) };
};

const reproduceFor = (key, item) => reproduceFamilyQuestionFromPin({
  question: questionsOf(key)[item.storageIndex],
  assignmentId: ASSIGNMENTS[key].id,
  storageIndex: item.storageIndex,
  pin: item.pin,
});

const recovery = (studentId, key, action, payload = undefined) => fns.advanceSectionRecovery.run(studentRequest(studentId, {
  assignmentId: ASSIGNMENTS[key].id,
  section: 'dol',
  action,
  ...(payload ? { payload } : {}),
}));

const gradeDoc = async (studentId) => (await db.collection('grades').doc(studentId).get()).data() || {};
const recordOf = async (studentId, key) => (await gradeDoc(studentId)).sectionRecoveryByAssignment?.[ASSIGNMENTS[key].id]?.dol || null;

/** Practice (server-graded) until Recovery unlocks, then Start. */
const practiceAndStart = async (studentId, key) => {
  for (let step = 0; step < 24; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    const status = await recovery(studentId, key, 'status');
    if (status.state !== 'locked') break;
    const item = status.nextPracticeItem;
    assert.ok(item?.pin, `a Practice item is offered (${status.reason})`);
    // eslint-disable-next-line no-await-in-loop
    await recovery(studentId, key, 'practice', { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduceFor(key, item)) });
  }
  const started = await recovery(studentId, key, 'start');
  assert.equal(started.record.status, 'inProgress');
  return started.record;
};

/** The teacher re-tunes one DOL question after the student's plan was pinned. */
const retune = async (key, storageIndex, questionFamily) => {
  const ref = db.collection('assignments').doc(ASSIGNMENTS[key].id);
  const stored = (await ref.get()).data();
  stored.sections[0].questions[storageIndex] = { ...stored.sections[0].questions[storageIndex], questionFamily };
  await ref.set(stored);
};

const syncAudits = async (studentId, assignmentId) => (await db.collection('classroomGradeSyncs')
  .where('studentId', '==', studentId).get()).docs.map((doc) => doc.data()).filter((row) => row.assignmentId === assignmentId);

const runSectionSync = async (studentId, beforeData) => {
  const afterSnapshot = await db.collection('grades').doc(studentId).get();
  await sectionEntry.cloudFunctions.syncSectionGradeToClassroom.run({
    params: { studentId },
    data: { before: { exists: Boolean(beforeData), data: () => beforeData || undefined }, after: afterSnapshot },
  });
};

const cleanup = async () => {
  const collections = ['classes', 'grades', 'assignments', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs', 'studentSupportEvents'];
  for (const name of collections) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || String(doc.data()?.studentId || '').startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
  for (const studentId of STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    const audits = await db.collection('grades').doc(studentId).collection('gradeOverrideAudits').get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(audits.docs.map((doc) => doc.ref.delete()));
  }
};

before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS).set({ name: 'Recovery P0 — Period 2', period: 'Period 2', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  await db.collection('classes').doc(OTHER_CLASS).set({ name: 'Other — Period 5', period: 'Period 5', teacherOfRecord: OTHER_TEACHER, status: 'active', course: 'algebra1' });
  for (const key of Object.keys(ASSIGNMENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('assignments').doc(ASSIGNMENTS[key].id).set(assignmentDoc(ASSIGNMENTS[key]));
    for (const sectionKey of ['whole', 'dol']) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection('classroomLinks').doc(`${P}${key}-${sectionKey}`).set({
        schemaVersion: 2, publicationId: `${P}${key}-${sectionKey}`, assignmentId: ASSIGNMENTS[key].id,
        courseId: COURSE, courseName: 'Recovery P0', courseworkId: `${P}${key}-${sectionKey}-cw`,
        teacherUid: `uid-${TEACHER}`, status: 'published', maxPoints: 100,
        sectionKey, publicationKind: sectionKey === 'whole' ? 'assignment' : 'section',
        ...(sectionKey === 'whole' ? {} : { gradePassbackEnabled: false, sectionGradePassbackEnabled: true }),
      });
    }
  }
  for (const studentId of STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId, classId: CLASS, classPeriod: 'Period 2', assignedTeacherEmail: TEACHER, status: 'active',
      gradesByAssignment: Object.fromEntries(Object.values(ASSIGNMENTS).map(({ id }) => [id, ORIGINAL_TRACKER])),
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE, studentId)).set({ courseId: COURSE, studentId, googleUserId: `google-${studentId}` });
  }
});

after(cleanup);

test('Q3 no longer reproduces but Q1 still covers its skill: Q3 is left out, never scored 0, and Classroom gets the corrected grade', async () => {
  const studentId = SAME_SKILL_STUDENT;
  const started = await practiceAndStart(studentId, 'sameSkill');
  const responses = Object.fromEntries(started.plan.items.slice(0, 2).map((item) => [item.itemId, correctResponse(reproduceFor('sameSkill', item))]));
  await retune('sameSkill', 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  const before = await gradeDoc(studentId);
  const submitted = await recovery(studentId, 'sameSkill', 'submit', { responses });
  // Before the fix: rawScore 70 — Q3's 3 points of weight counted as wrong.
  assert.equal(submitted.rawScore, 100);
  assert.equal(submitted.recordedScore, 90);
  const record = await recordOf(studentId, 'sameSkill');
  assert.equal(record.status, 'completed');
  assert.equal(record.results.r3.status, 'platform-unavailable');
  assert.equal(record.results.r3.credit, null);
  assert.deepEqual(record.evidence.excludedItemIds, ['r3']);
  assert.equal(JSON.stringify(record.plan), JSON.stringify(started.plan), 'the stored pins are byte-identical');

  resetClassroomCalls();
  await runClassroomSync(studentId, before);
  const patches = patchGradeCalls().filter((call) => String(call.courseWorkId || '').startsWith(`${P}sameSkill-`));
  assert.ok(patches.length >= 1, 'the corrected grade reaches Classroom');
  assert.equal(patches.at(-1).grade ?? patches.at(-1).assignedGrade, 90, 'every DOL question credited at the recorded 90, not 70');
});

test('Q3 was the only evidence for its skill: the Recovery is held — no grade replaced, nothing sent to Classroom, each column audited', async () => {
  const studentId = HELD_STUDENT;
  const started = await practiceAndStart(studentId, 'distinct');
  const responses = Object.fromEntries(started.plan.items.slice(0, 2).map((item) => [item.itemId, correctResponse(reproduceFor('distinct', item))]));
  await retune('distinct', 2, { id: 'functions.identifyIntercepts', constraints: { interceptRange: [-6, 6] } });
  const before = await gradeDoc(studentId);
  const submitted = await recovery(studentId, 'distinct', 'submit', { responses });
  // Before the fix: completed at 70, replacing the 30 original.
  assert.equal(submitted.held, true);
  assert.equal(submitted.rawScore, null);
  assert.equal(submitted.recordedScore, null);
  const record = await recordOf(studentId, 'distinct');
  assert.equal(record.status, 'held');
  assert.equal(record.hold.reason, 'skill-without-evidence');
  assert.equal(record.results.r3.classification, 'pin-fingerprint-mismatch');

  const status = await recovery(studentId, 'distinct', 'status');
  assert.equal(status.state, 'held');

  resetClassroomCalls();
  await runClassroomSync(studentId, before);
  await runSectionSync(studentId, before);
  assert.equal(patchGradeCalls().filter((call) => String(call.courseWorkId || '').startsWith(`${P}distinct-`)).length, 0, 'nothing reaches Classroom while the Recovery is held');
  const audits = await syncAudits(studentId, ASSIGNMENTS.distinct.id);
  const held = audits.filter((row) => row.status === 'recovery-held');
  assert.deepEqual(held.map((row) => row.publicationId).sort(), [`${P}distinct-dol`, `${P}distinct-whole`], 'the whole-assignment and DOL columns each record the hold');
  held.forEach((row) => {
    assert.equal(row.isFinal, false);
    assert.equal(row.studentVisible, false);
    assert.deepEqual(row.recoveryHeldSections, ['dol']);
  });

  // Only the teacher of record may resolve it.
  const outsider = await refusal(fns.resolveHeldSectionRecovery.run(teacherRequest({ studentId, assignmentId: ASSIGNMENTS.distinct.id, section: 'dol', action: 'finalizeGraded' }, OTHER_TEACHER)));
  assert.equal(outsider?.code, 'permission-denied');
  const student = await refusal(fns.resolveHeldSectionRecovery.run(studentRequest(studentId, { studentId, assignmentId: ASSIGNMENTS.distinct.id, section: 'dol', action: 'finalizeGraded' })));
  assert.ok(student, 'a student cannot resolve their own hold');
  assert.equal((await recordOf(studentId, 'distinct')).status, 'held');

  const heldData = await gradeDoc(studentId);
  const resolved = await fns.resolveHeldSectionRecovery.run(teacherRequest({
    studentId, assignmentId: ASSIGNMENTS.distinct.id, section: 'dol', action: 'finalizeGraded', note: 'Two of three is enough for this student.',
  }, TEACHER));
  assert.equal(resolved.status, 'completed');
  const finalized = await recordOf(studentId, 'distinct');
  assert.equal(finalized.rawScore, 100);
  assert.equal(finalized.hold.resolution.action, 'finalizeGraded');
  assert.equal(finalized.hold.resolution.actor.email, TEACHER);
  assert.equal(JSON.stringify(finalized.plan), JSON.stringify(started.plan));
  const audit = (await db.collection('grades').doc(studentId).collection('gradeOverrideAudits').get()).docs.map((doc) => doc.data());
  assert.ok(audit.some((row) => row.scope === 'sectionRecovery' && row.action === 'finalizeGraded' && row.actor?.email === TEACHER), 'the resolution is audited');

  resetClassroomCalls();
  await runClassroomSync(studentId, heldData);
  const patches = patchGradeCalls().filter((call) => String(call.courseWorkId || '').startsWith(`${P}distinct-`));
  assert.ok(patches.length >= 1, 'the passback resumes once a teacher resolves the hold');
  assert.equal(patches.find((call) => call.courseWorkId === `${P}distinct-whole-cw`)?.grade, 90, 'finalized over the two graded questions: min(100, 90) beats the 30 original');
});

test('every question unavailable: held with no score, and the opportunity is not reported as a 0% Recovery', async () => {
  const studentId = ALL_FAILED_STUDENT;
  await practiceAndStart(studentId, 'allFailed');
  await retune('allFailed', 0, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  await retune('allFailed', 1, { id: 'functions.identifyZeros', constraints: { zeroRange: [7, 9] } });
  await retune('allFailed', 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [-40, -30] } });
  const submitted = await recovery(studentId, 'allFailed', 'submit', { responses: {} });
  // Before the fix: rawScore 0, "Recovery 0% did not beat the original".
  assert.equal(submitted.held, true);
  const record = await recordOf(studentId, 'allFailed');
  assert.equal(record.status, 'held');
  assert.equal(record.rawScore, null);
  assert.equal(record.hold.reason, 'no-graded-items');
  // The student cannot resubmit a held Recovery; a teacher decides.
  const again = await refusal(recovery(studentId, 'allFailed', 'submit', { responses: {} }));
  assert.ok(again, 'a held Recovery is not re-submittable by the student');
});

test('teacher repair: a replacement question is a NEW question; the student answers only it, and the old pin and answers stay exactly as they were', async () => {
  const studentId = REPAIR_STUDENT;
  const started = await practiceAndStart(studentId, 'repair');
  const responses = Object.fromEntries(started.plan.items.slice(0, 2).map((item) => [item.itemId, correctResponse(reproduceFor('repair', item))]));
  await retune('repair', 2, { id: 'functions.identifyIntercepts', constraints: { interceptRange: [-6, 6] } });
  const submitted = await recovery(studentId, 'repair', 'submit', { responses });
  assert.equal(submitted.held, true);
  const held = await recordOf(studentId, 'repair');

  const issued = await fns.resolveHeldSectionRecovery.run(teacherRequest({
    studentId, assignmentId: ASSIGNMENTS.repair.id, section: 'dol', action: 'issueReplacement', note: 'The question was re-tuned after she started.',
  }, TEACHER));
  assert.equal(issued.status, 'inProgress');
  assert.deepEqual(issued.replacements, [{ from: 'r3', to: 'r3-replacement-1' }]);
  const repaired = await recordOf(studentId, 'repair');
  const old = repaired.plan.items.find((item) => item.itemId === 'r3');
  assert.equal(JSON.stringify(old.pin), JSON.stringify(held.plan.items[2].pin), 'the historical pin is byte-identical');
  assert.equal(old.supersededBy, 'r3-replacement-1');
  assert.equal(JSON.stringify(repaired.results), JSON.stringify(held.results), 'no earlier result is rewritten');
  const replacement = repaired.plan.items.find((item) => item.itemId === 'r3-replacement-1');
  assert.equal(replacement.replaces, 'r3');
  assert.notEqual(replacement.pin.fingerprint, old.pin.fingerprint);
  assert.notEqual(replacement.pin.slot, old.pin.slot, 'a new identity, not the next instance on the failed list');
  assert.equal(replacement.issueReason, 'pin-fingerprint-mismatch', 'why it replaced the unavailable item is recorded');
  const audits = (await db.collection('grades').doc(studentId).collection('gradeOverrideAudits').get()).docs.map((doc) => doc.data());
  assert.ok(audits.some((row) => row.action === 'issueReplacement' && row.replacements?.[0]?.to === 'r3-replacement-1'));

  // The student sees the Recovery in progress again and answers ONLY the new
  // question; a forged answer for an already-graded one is never re-marked.
  const status = await recovery(studentId, 'repair', 'status');
  assert.equal(status.state, 'inProgress');
  // Built from the question as it is NOW (the teacher's re-tune included).
  const current = (await db.collection('assignments').doc(ASSIGNMENTS.repair.id).get()).data();
  const currentQuestion = getStoredAssignmentQuestions({ id: ASSIGNMENTS.repair.id, ...current })[replacement.storageIndex];
  const fresh = reproduceFamilyQuestionFromPin({ question: currentQuestion, assignmentId: ASSIGNMENTS.repair.id, storageIndex: replacement.storageIndex, pin: replacement.pin });
  assert.equal(fresh.error ?? null, null, 'the replacement replays from its own pin');
  const done = await recovery(studentId, 'repair', 'submit', {
    responses: { 'r3-replacement-1': correctResponse(fresh), r1: { kind: 'opaque', type: 'stepAlgebra', value: 'x=99999', fields: [] } },
  });
  assert.equal(done.held, false);
  assert.equal(done.rawScore, 100, 'r1 and r2 keep their original results; the replacement is graded on its own pin');
  const final = await recordOf(studentId, 'repair');
  assert.equal(JSON.stringify(final.results.r1), JSON.stringify(held.results.r1), 'r1 is never re-marked');
  assert.equal(final.results.r3.status, 'platform-unavailable', 'r3 stays what it was');
  assert.equal(final.results['r3-replacement-1'].isCorrect, true);
});

test('an assignment-level teacher override still decides the whole grade while a Recovery is held — the DOL column keeps waiting', async () => {
  const studentId = OVERRIDE_STUDENT;
  const started = await practiceAndStart(studentId, 'override');
  const responses = Object.fromEntries(started.plan.items.slice(0, 2).map((item) => [item.itemId, correctResponse(reproduceFor('override', item))]));
  await retune('override', 2, { id: 'functions.identifyIntercepts', constraints: { interceptRange: [-6, 6] } });
  await recovery(studentId, 'override', 'submit', { responses });
  assert.equal((await recordOf(studentId, 'override')).status, 'held');

  const before = await gradeDoc(studentId);
  await fns.overrideStudentAssignmentGrade.run(teacherRequest({
    studentId,
    assignmentId: ASSIGNMENTS.override.id,
    action: 'issueZero',
    reasonCode: 'accountSwitching',
    note: 'Confirmed in class.',
    academicIntegrityConsequence: { scope: 'assignment', participantRole: 'individual', incidentReason: 'accountSwitching', teacherConfirmed: true },
  }, TEACHER));
  const audits = (await db.collection('grades').doc(studentId).collection('gradeOverrideAudits').get()).docs.map((doc) => doc.data());
  assert.ok(audits.some((row) => row.action === 'issueZero' && row.overrideActiveAfter === true), 'the override is audited');

  resetClassroomCalls();
  await runClassroomSync(studentId, before);
  await runSectionSync(studentId, before);
  const patches = patchGradeCalls().filter((call) => String(call.courseWorkId || '').startsWith(`${P}override-`));
  assert.deepEqual(patches.map((call) => [call.courseWorkId, call.grade]), [[`${P}override-whole-cw`, 0]], 'the teacher\'s explicit decision reaches Classroom; the held DOL column does not');
  const held = (await syncAudits(studentId, ASSIGNMENTS.override.id)).filter((row) => row.status === 'recovery-held');
  assert.deepEqual(held.map((row) => row.publicationId), [`${P}override-dol`]);
  // The Recovery itself is untouched by the override: still held, still the teacher's to resolve.
  assert.equal((await recordOf(studentId, 'override')).status, 'held');
});
