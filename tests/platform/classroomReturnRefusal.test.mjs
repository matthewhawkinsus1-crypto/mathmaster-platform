// A SECTION GRADE CLASSROOM SAVED BUT WOULD NOT RETURN IS SAID SO, AND NOT ASKED FOR AGAIN.
//
// Nov 1-12, 2026 (issue #545): syncSectionGradeToClassroom logged about
// 100-200 "Section grade passback failed" errors a pass, from ordinary grade
// syncs as well as the pushes after a checkpoint. Google answered 400
// FAILED_PRECONDITION at return-submission: the grade had been patched, then
// returning the submission was refused. Google's grading guide says why: "The
// submission can only be returned if it has already been turned in by the
// student." MathMaster students work in MathMaster, and many never press Turn
// in on Classroom. The row was marked failed, and every later grade write sent
// the grade and asked for the return again.
//
// Now the row is "graded-not-returned" and says why in a teacher's words; the
// return is not asked for again while the submission is in the state Google
// refused it in, unless a teacher sends the grade again; the log is one counted
// warning per assignment. Every other error, and the per-minute limit, are
// handled as before. The real trigger runs here against fakes of Firestore and
// of Google's HTTP layer (helpers/sectionPassbackHarness.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERMISSION_DENIED,
  PRECONDITION,
  QUOTA,
  SERVER_TIMESTAMP,
  fakeGoogle,
  logged,
  passbackFirestore,
  requireFromFunctions,
  returnsOnlyTurnedInWork,
  writeGrades,
} from './helpers/sectionPassbackHarness.mjs';

const errors = requireFromFunctions('./lib/classroomPushErrors.js');
const classroomLib = requireFromFunctions('./lib/classroom.js');
const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');

const thrown = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the call to throw');
};
// The error the real lib/classroom.js throws when Google refuses `step`.
const refusedAt = (step, error) => {
  const fail = async () => { throw error; };
  const client = { courses: { courseWork: { studentSubmissions: {
    list: step === 'list' ? fail : async () => ({ data: { studentSubmissions: [{ id: 's', state: 'CREATED' }] } }),
    patch: step === 'patch' ? fail : async () => ({ data: { state: 'CREATED' } }),
    return: step === 'return' ? fail : async () => ({}),
  } } } };
  const args = { courseId: 'c', courseWorkId: 'w', submissionId: 's', googleUserId: 'g', grade: 90 };
  if (step === 'list') return thrown(classroomLib.findSubmissionForStudent(client, args));
  if (step === 'patch') return thrown(classroomLib.patchGrade(client, args));
  return thrown(classroomLib.returnSubmission(client, args));
};

/* --- which refusals these are -------------------------------------------- */

test('a FAILED_PRECONDITION at return, after the grade was saved, is a grade not returned', async () => {
  const refusal = errors.classroomReturnRefusal(await refusedAt('return', PRECONDITION()), { submissionState: 'CREATED' });
  assert.equal(refusal.reason, 'not-turned-in');
  assert.equal(refusal.submissionState, 'CREATED');
  assert.equal(refusal.audit.status, 'graded-not-returned');
  assert.equal(refusal.audit.returnRefusedReason, 'not-turned-in');
  assert.equal(refusal.audit.returnRefusedState, 'CREATED');
  // What Google said is kept for whoever looks into it.
  assert.equal(refusal.audit.errorStep, 'return-submission');
  assert.equal(refusal.audit.errorStatus, 'FAILED_PRECONDITION');
  assert.equal(refusal.audit.errorCode, 400);
  assert.deepEqual(refusal.audit.errorReasons, ['failedPrecondition']);
  assert.match(refusal.audit.message, /^Grade saved in Classroom, not returned: the student hasn't turned it in there/);
});

test('work never opened, opened, or unsubmitted is not turned in; anything else is a refusal of unknown cause', async () => {
  const error = await refusedAt('return', PRECONDITION());
  const reasonFor = (submissionState) => errors.classroomReturnRefusal(error, { submissionState }).reason;
  assert.deepEqual(['NEW', 'CREATED', 'RECLAIMED_BY_STUDENT', 'created'].map(reasonFor), Array(4).fill('not-turned-in'));
  assert.deepEqual(['TURNED_IN', null, ''].map(reasonFor), Array(3).fill('refused'));
  const unknown = errors.classroomReturnRefusal(error, { submissionState: 'TURNED_IN' });
  assert.match(unknown.audit.message, /Classroom refused to return it\. MathMaster won't ask again until the submission changes there/);
  assert.doesNotMatch(unknown.audit.message, /turned it in/, 'a refusal of turned-in work is not explained as work not turned in');
});

test('every other refusal is not one: another step, another status, or the per-minute limit', async () => {
  assert.equal(errors.classroomReturnRefusal(await refusedAt('patch', PRECONDITION()), { submissionState: 'CREATED' }), null);
  assert.equal(errors.classroomReturnRefusal(await refusedAt('list', PRECONDITION()), { submissionState: 'CREATED' }), null);
  assert.equal(errors.classroomReturnRefusal(await refusedAt('return', PERMISSION_DENIED()), { submissionState: 'CREATED' }), null);
  assert.equal(errors.classroomReturnRefusal(await refusedAt('return', QUOTA()), { submissionState: 'CREATED' }), null);
  assert.equal(errors.classroomReturnRefusal(new Error('socket hang up'), { submissionState: 'CREATED' }), null);
});

test('a refusal stands only for the same submission, in the same state', () => {
  const prior = { status: 'graded-not-returned', courseworkId: 'w', submissionId: 's', returnRefusedState: 'CREATED', returnRefusedReason: 'not-turned-in' };
  const same = { prior, courseworkId: 'w', submissionId: 's', submissionState: 'CREATED' };
  const standing = errors.standingClassroomReturnRefusal(same);
  assert.equal(standing.reason, 'not-turned-in');
  assert.equal(standing.audit.status, 'graded-not-returned');
  assert.equal('returnRefusedAt' in standing.audit, false, 'not asking again is not a new refusal');
  for (const changed of [
    { ...same, submissionState: 'TURNED_IN' },
    { ...same, submissionId: 'another' },
    { ...same, courseworkId: 'reposted' },
    { ...same, prior: { ...prior, status: 'failed' } },
    { ...same, prior: { ...prior, returnRefusedState: null }, submissionState: null },
  ]) assert.equal(errors.standingClassroomReturnRefusal(changed), null, JSON.stringify(changed));
});

/* --- the trigger ----------------------------------------------------------- */

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';
const link = (sectionKey) => ({
  assignmentId: 'A1', status: 'published', publicationKind: 'section', sectionKey, courseId: COURSE,
  courseworkId: `cw-${sectionKey}`, teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
});
const fixture = () => passbackFirestore({
  assignments: { A1: {
    schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY),
    sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
  } },
  classroomLinks: { 'pub-warmup': link('warmup'), 'pub-classwork': link('classwork') },
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: { A1: {} } } },
});
const row = (db, sectionKey) => db.data(`classroomGradeSyncs/${gradeSyncDocumentId(`pub-${sectionKey}`, STUDENT)}`);
const lastWriteOf = (db, sectionKey) => db.writes.filter((write) => write.path === `classroomGradeSyncs/${gradeSyncDocumentId(`pub-${sectionKey}`, STUDENT)}`).at(-1);
const answer = (index, record) => (grades) => ({
  ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, [index]: record } },
});
const signal = (reason) => (grades) => ({
  ...grades, classroomReleaseSignals: { A1: { requestedAt: new Date().toISOString(), reason, source: 'classroom-push-queue' } },
});
const refuseReturns = (error) => (step) => (step === 'return' ? error() : null);
const errorsLogged = () => logged.filter((entry) => entry.level === 'error');
const warnings = () => logged.filter((entry) => entry.level === 'warn' && entry.message === 'Section grades saved in Classroom but not returned');

// A completed Warm-Up is "final-complete": its grade is assigned and returned.
const completeWarmup = async ({ states = {}, refuse = returnsOnlyTurnedInWork } = {}) => {
  logged.length = 0;
  const db = fixture();
  const google = fakeGoogle({ states, refuse });
  await writeGrades({ db, google, studentId: STUDENT, change: answer(0, { status: 'correct', totalAttempts: 1 }) });
  return { db, google };
};

test('Google refuses to return work not turned in: the grade stays in Classroom and the row says why', async () => {
  const { db, google } = await completeWarmup();
  assert.deepEqual(google.steps('cw-warmup'), ['list', 'patch', 'return']);
  const warmup = row(db, 'warmup');
  assert.equal(warmup.status, 'graded-not-returned');
  assert.equal(warmup.grade, 100);
  assert.equal(warmup.classroomGrade, 100);
  assert.equal(warmup.stage, 'final-complete');
  assert.equal(warmup.returnedToStudent, false);
  assert.equal(warmup.submissionId, 'sub-cw-warmup');
  assert.equal(warmup.submissionState, 'CREATED');
  assert.equal(warmup.returnRefusedState, 'CREATED');
  assert.equal(warmup.returnRefusedAt, SERVER_TIMESTAMP);
  assert.equal(warmup.message, errors.RETURN_REFUSED_MESSAGES['not-turned-in']);
  assert.equal(warmup.errorStatus, 'FAILED_PRECONDITION');
  // The grade went to Classroom as it does today: assigned, not a draft.
  assert.ok(warmup.studentVisible);
  // The student's own receipt is only for a column that went through.
  assert.equal(db.data(`grades/${STUDENT}`).classroomSectionSyncStatusByAssignment, undefined);
});

test('the log is one counted warning per assignment, not an error per column', async () => {
  const { db } = await completeWarmup();
  assert.deepEqual(errorsLogged(), []);
  assert.deepEqual(warnings().map((entry) => entry.fields), [{
    assignmentId: 'A1', studentId: STUDENT, refused: 1, notAskedAgain: 0, submissionStates: ['CREATED'], reasons: ['not-turned-in'],
  }]);
  assert.equal(row(db, 'warmup').status, 'graded-not-returned');
});

test('a later write that leaves the column\'s grade alone does not call Google for it', async () => {
  const { db, google } = await completeWarmup();
  google.calls.length = 0;
  logged.length = 0;
  // A Classwork answer: its own column is sent as a draft, the Warm-Up is left alone.
  await writeGrades({ db, google, studentId: STUDENT, change: answer(1, { status: 'correct', totalAttempts: 1 }) });
  assert.deepEqual(google.steps('cw-warmup'), []);
  assert.deepEqual(google.steps('cw-classwork'), ['list', 'patch']);
  assert.equal(row(db, 'classwork').status, 'synced');
  assert.equal(row(db, 'warmup').status, 'graded-not-returned');
  assert.deepEqual(warnings(), []);
});

test('a new grade for the column is saved, and its return is not asked for while the submission is unchanged', async () => {
  const { db, google } = await completeWarmup();
  google.calls.length = 0;
  logged.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: answer(0, { status: 'correct', totalAttempts: 2 }) });
  assert.deepEqual(google.steps('cw-warmup'), ['list', 'patch'], 'the grade is sent; the return is not asked for');
  const warmup = row(db, 'warmup');
  assert.equal(warmup.status, 'graded-not-returned');
  assert.equal(warmup.message, errors.RETURN_REFUSED_MESSAGES['not-turned-in']);
  assert.equal(warmup.errorStatus, 'FAILED_PRECONDITION', 'Google\'s last answer is kept');
  assert.equal('returnRefusedAt' in lastWriteOf(db, 'warmup').data, false, 'no new refusal is recorded');
  assert.deepEqual(warnings().map((entry) => [entry.fields.refused, entry.fields.notAskedAgain]), [[0, 1]]);
  assert.deepEqual(errorsLogged(), []);
});

test('once the student has turned it in, the next push returns it and the row is synced', async () => {
  const { db, google } = await completeWarmup();
  google.states['cw-warmup'] = 'TURNED_IN';
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: answer(0, { status: 'correct', totalAttempts: 2 }) });
  assert.deepEqual(google.steps('cw-warmup'), ['list', 'patch', 'return']);
  const warmup = row(db, 'warmup');
  assert.equal(warmup.status, 'synced');
  assert.equal(warmup.returnedToStudent, true);
  assert.equal(warmup.submissionState, 'RETURNED');
  for (const field of ['error', 'errorStatus', 'message', 'returnRefusedReason', 'returnRefusedState', 'returnRefusedAt']) {
    assert.equal(warmup[field], undefined, `a returned row keeps no ${field}`);
  }
  assert.equal(db.data(`grades/${STUDENT}`).classroomSectionSyncStatusByAssignment.A1.warmup.returnedToStudent, true);
});

test('a teacher\'s Retry asks Google again; a reconcile sends the grade again but does not', async () => {
  const retried = await completeWarmup();
  retried.google.calls.length = 0;
  logged.length = 0;
  await writeGrades({ db: retried.db, google: retried.google, studentId: STUDENT, change: signal('manual-retry') });
  assert.deepEqual(retried.google.steps('cw-warmup'), ['list', 'patch', 'return']);
  assert.equal(row(retried.db, 'warmup').status, 'graded-not-returned');
  assert.deepEqual(warnings().map((entry) => [entry.fields.refused, entry.fields.notAskedAgain]), [[1, 0]]);

  const reconciled = await completeWarmup();
  reconciled.google.calls.length = 0;
  await writeGrades({ db: reconciled.db, google: reconciled.google, studentId: STUDENT, change: signal('section-grade-reconcile') });
  assert.deepEqual(reconciled.google.steps('cw-warmup'), ['list', 'patch']);
  assert.equal(row(reconciled.db, 'warmup').status, 'graded-not-returned');
});

test('every other refusal at return is still a failed push, logged as an error', async () => {
  const { db } = await completeWarmup({ refuse: refuseReturns(PERMISSION_DENIED) });
  const warmup = row(db, 'warmup');
  assert.equal(warmup.status, 'failed');
  assert.equal(warmup.errorStatus, 'PERMISSION_DENIED');
  assert.equal(warmup.returnRefusedReason, undefined);
  assert.deepEqual(errorsLogged().map((entry) => [entry.message, entry.fields.step, entry.fields.googleStatus]), [
    ['Section grade passback failed', 'return-submission', 'PERMISSION_DENIED'],
  ]);
  assert.deepEqual(warnings(), []);
});

test('Google\'s per-minute limit at return is still waited out and queued again', async () => {
  const { db } = await completeWarmup({ refuse: refuseReturns(QUOTA) });
  assert.equal(row(db, 'warmup').status, 'rate-limited');
  const requeued = [...db.store.keys()].filter((key) => key.startsWith(`${queue.CLASSROOM_PUSH_QUEUE}/`));
  assert.equal(requeued.length, 1);
  assert.equal(db.data(requeued[0]).quotaRetry, 1);
  assert.deepEqual(warnings(), []);
});

test('a refusal of work that was turned in is not explained as work not turned in, and is not asked again', async () => {
  const { db, google } = await completeWarmup({ states: { 'cw-warmup': 'TURNED_IN' }, refuse: refuseReturns(PRECONDITION) });
  const warmup = row(db, 'warmup');
  assert.equal(warmup.status, 'graded-not-returned');
  assert.equal(warmup.returnRefusedReason, 'refused');
  assert.equal(warmup.message, errors.RETURN_REFUSED_MESSAGES.refused);
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: answer(0, { status: 'correct', totalAttempts: 2 }) });
  assert.deepEqual(google.steps('cw-warmup'), ['list', 'patch']);
});

/* --- a support-profile change (TT23) -------------------------------------- */

// A support-profile change re-sends only a grade Classroom holds, and only
// when it moved (studentWorkloadIndices.profileChangeNeedsPush). A grade
// Classroom saved but would not return is held there: the row tells the
// teacher to return it in Classroom, which returns the grade it holds.
const { buildSupportProjection } = await import('../../functions/shared/supportProfileModel.mjs');
const { studentOmittedIndices } = await import('../../functions/shared/reducedWorkload.mjs');
const today = new Date().toISOString().slice(0, 10);
const revision = ({ n, percent = null }) => ({
  id: `r${n}`, revisionId: `r${n}`, revision: n, status: 'active', effectiveStart: today, createdAtMs: Date.now() - (10 - n) * 1000,
  accommodations: percent === null ? [] : [{ id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo: [] }],
  modifications: [],
});
const profileOf = (revisions) => buildSupportProjection({ revisions, todayKey: today });
// Fewer items, same rigor, at 25%; then taken off.
const REDUCED_25 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 })]);
const TAKEN_OFF = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 }), revision({ n: 3 })]);
// Eight Classwork items, due in a week: open work, which a profile change moves.
const openClasswork = {
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY), lateDueAt: iso(8 * DAY),
  sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: Array.from({ length: 8 }, (_, i) => ({
    questionId: `cw-q${i}`, id: `cw-q${i}`, type: 'numeric', prompt: `Solve ${i}.`, standard: i % 2 ? 'A.5A' : 'A.5B', dok: 2,
  })) }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
};

test('a support-profile change corrects a grade Classroom saved but would not return', async () => {
  logged.length = 0;
  const db = passbackFirestore({
    assignments: { A1: openClasswork },
    classroomLinks: { 'pub-classwork': link('classwork') },
    classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
    grades: { [STUDENT]: { classId: 'c1', profile: REDUCED_25, gradesByAssignment: { A1: {} } } },
  });
  const google = fakeGoogle({ refuse: returnsOnlyTurnedInWork });
  // The student finishes the six items they owe: Classwork is complete at
  // 100%, saved in Classroom, and Google refuses to return it.
  const omitted = studentOmittedIndices({ assignment: { id: 'A1', ...openClasswork }, profile: REDUCED_25, tracker: {} });
  assert.equal(omitted.size, 2);
  const owed = [...Array(8).keys()].filter((index) => !omitted.has(index));
  await writeGrades({
    db, google, studentId: STUDENT,
    change: (grades) => ({ ...grades, gradesByAssignment: { A1: Object.fromEntries(owed.map((index) => [index, { status: 'correct', totalAttempts: 1 }])) } }),
  });
  assert.deepEqual(google.steps('cw-classwork'), ['list', 'patch', 'return']);
  assert.equal(row(db, 'classwork').status, 'graded-not-returned');
  assert.equal(row(db, 'classwork').grade, 100);

  // The reduction is taken off: the student owes all eight, and MathMaster
  // shows 6 of 8. Classroom gets that grade, as a draft while the work is open
  // again, as a synced column would.
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: (grades) => ({ ...grades, profile: TAKEN_OFF }) });
  assert.deepEqual(google.calls.map((call) => [call.step, call.body]), [['list', undefined], ['patch', { draftGrade: 75 }]]);
  const corrected = row(db, 'classwork');
  assert.equal(corrected.grade, 75);
  assert.equal(corrected.status, 'synced');
  assert.equal(corrected.studentVisible, false);
  assert.equal(corrected.returnRefusedReason, undefined, 'it no longer reads as a grade Classroom would not return');

  // The same profile saved again moves nothing and sends nothing.
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: (grades) => ({ ...grades, profile: structuredClone(TAKEN_OFF) }) });
  assert.deepEqual(google.calls, []);
  assert.deepEqual(errorsLogged(), []);
});
