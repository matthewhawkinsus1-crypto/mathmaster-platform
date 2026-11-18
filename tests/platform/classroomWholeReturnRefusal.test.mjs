// A WHOLE-ASSIGNMENT GRADE CLASSROOM SAVED BUT WOULD NOT RETURN IS SAID SO, AND NOT ASKED FOR AGAIN.
//
// Issue #554, item 2. Google refuses to return a submission the student never
// turned in on Classroom: 400 FAILED_PRECONDITION at return-submission, after
// the grade was saved (its grading guide: only turned-in work can be returned).
// MathMaster students work in MathMaster. #546's follow-ups taught the section
// trigger to call such a column "Graded, not returned" and to stop asking
// (classroomReturnRefusal.test.mjs). syncGradeToClassroom, the
// whole-assignment trigger, did not: its row ended "failed", an error was
// logged, and every later write to the student's grades sent find, patch and
// return again, 3 Classroom calls a write for a grade Classroom already held.
//
// Now it handles the refusal as the section trigger does: the row is
// "graded-not-returned" and says why in a teacher's words, a later write with
// the same grade sends nothing, a new grade is saved without asking for the
// return while the submission is unchanged, the student's receipt names only
// the columns that went through, and "Retry all" still queues failed rows
// only. The real trigger runs here against fakes of Firestore and of Google's
// HTTP layer (helpers/sectionPassbackHarness.mjs).

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
  runCallable,
  writeGrades,
} from './helpers/sectionPassbackHarness.mjs';

const errors = requireFromFunctions('./lib/classroomPushErrors.js');
const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';
const LESSON = {
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY),
  sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
};
const wholeLink = (extra = {}) => ({
  schemaVersion: 2, assignmentId: 'A1', status: 'published', publicationKind: 'assignment', sectionKey: 'whole', courseId: COURSE,
  courseworkId: 'cw-whole', teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: true, ...extra,
});
const fixture = ({ assignment = LESSON, links = { 'pub-whole': wholeLink() }, profile = {} } = {}) => passbackFirestore({
  assignments: { A1: assignment },
  classroomLinks: links,
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile, gradesByAssignment: { A1: {} } } },
});
const row = (db, publicationId = 'pub-whole') => db.data(`classroomGradeSyncs/${gradeSyncDocumentId(publicationId, STUDENT)}`);
const lastWriteOf = (db) => db.writes.filter((write) => write.path === `classroomGradeSyncs/${gradeSyncDocumentId('pub-whole', STUDENT)}`).at(-1);
const receipt = (db) => db.data(`grades/${STUDENT}`).classroomSyncStatusByAssignment?.A1;
const answer = (index, record) => (grades) => ({
  ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, [index]: record } },
});
// Each signal a moment apart, as the queue releases them: a signal identical
// to the last one is no change, and wakes nothing. The fake answers so fast
// that two in a row can fall in the same millisecond.
let signalsSent = 0;
const signal = (reason) => (grades) => ({
  ...grades,
  classroomReleaseSignals: { A1: { requestedAt: new Date(Date.now() + (signalsSent += 1)).toISOString(), reason, source: 'classroom-push-queue' } },
});
const refuseReturns = (error) => (step) => (step === 'return' ? error() : null);
const errorsLogged = () => logged.filter((entry) => entry.level === 'error');
const warnings = () => logged.filter((entry) => entry.level === 'warn' && entry.message === 'Grades saved in Classroom but not returned');
const whole = (options) => ({ ...options, studentId: STUDENT, triggers: ['whole'] });

const ALL_RIGHT = { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'correct', totalAttempts: 1 }, 2: { status: 'correct', totalAttempts: 1 } };
// The student finishes the lesson: the whole-assignment grade is final, so it
// is assigned and returned.
const finish = async ({ states = {}, refuse = returnsOnlyTurnedInWork, ...options } = {}) => {
  logged.length = 0;
  const db = fixture(options);
  const google = fakeGoogle({ states, refuse });
  await writeGrades(whole({ db, google, change: (grades) => ({ ...grades, gradesByAssignment: { A1: structuredClone(ALL_RIGHT) } }) }));
  return { db, google };
};
const again = async ({ db, google }, change) => {
  google.calls.length = 0;
  logged.length = 0;
  await writeGrades(whole({ db, google, change }));
};

/* --- the refusal ----------------------------------------------------------- */

test('Google refuses to return work not turned in: the grade stays in Classroom and the row says why', async () => {
  const { db, google } = await finish();
  assert.deepEqual(google.steps('cw-whole'), ['list', 'patch', 'return']);
  const refused = row(db);
  assert.equal(refused.status, 'graded-not-returned');
  assert.deepEqual([refused.grade, refused.classroomGrade, refused.stage, refused.isFinal], [100, 100, 'final-complete', true]);
  assert.equal(refused.studentVisible, true, 'the grade went to Classroom assigned, as before');
  assert.equal(refused.returnedToStudent, false);
  assert.deepEqual([refused.submissionId, refused.submissionState, refused.returnRefusedState], ['sub-cw-whole', 'CREATED', 'CREATED']);
  assert.equal(refused.returnRefusedReason, 'not-turned-in');
  assert.equal(refused.returnRefusedAt, SERVER_TIMESTAMP);
  assert.equal(refused.message, errors.RETURN_REFUSED_MESSAGES['not-turned-in']);
  // What Google said is kept for whoever looks into it.
  assert.deepEqual([refused.errorStep, refused.errorStatus, refused.errorCode], ['return-submission', 'FAILED_PRECONDITION', 400]);
  // The student's receipt is only for a column that went through.
  assert.equal(receipt(db), undefined);
});

test('the log is one counted warning per assignment, not an error', async () => {
  await finish();
  assert.deepEqual(errorsLogged(), []);
  assert.deepEqual(warnings().map((entry) => entry.fields), [{
    assignmentId: 'A1', studentId: STUDENT, refused: 1, notAskedAgain: 0, submissionStates: ['CREATED'], reasons: ['not-turned-in'],
  }]);
});

test('a refusal of work that was turned in is not explained as work not turned in', async () => {
  const { db } = await finish({ states: { 'cw-whole': 'TURNED_IN' }, refuse: refuseReturns(PRECONDITION) });
  assert.equal(row(db).status, 'graded-not-returned');
  assert.equal(row(db).returnRefusedReason, 'refused');
  assert.equal(row(db).message, errors.RETURN_REFUSED_MESSAGES.refused);
});

/* --- what later writes send ------------------------------------------------ */

test('a later write that leaves the grade alone sends nothing: the row is current', async () => {
  const pushed = await finish();
  await again(pushed, answer(0, { status: 'correct', totalAttempts: 1, reviewedAt: 'later' }));
  assert.deepEqual(pushed.google.calls, [], 'was find, patch and return on every write');
  assert.equal(row(pushed.db).status, 'graded-not-returned');
  assert.deepEqual([...warnings(), ...errorsLogged()], []);
});

test('a new grade is saved, and its return is not asked for while the submission is unchanged', async () => {
  const pushed = await finish();
  await again(pushed, answer(1, { status: 'expired', totalAttempts: 3, bestPartialCredit: 50 }));
  assert.deepEqual(pushed.google.steps('cw-whole'), ['list', 'patch'], 'the grade is sent; the return is not asked for');
  const updated = row(pushed.db);
  assert.deepEqual([updated.status, updated.grade, updated.stage], ['graded-not-returned', 83, 'final-complete']);
  assert.equal(updated.message, errors.RETURN_REFUSED_MESSAGES['not-turned-in']);
  assert.equal(updated.errorStatus, 'FAILED_PRECONDITION', 'Google\'s last answer is kept');
  assert.equal('returnRefusedAt' in lastWriteOf(pushed.db).data, false, 'no new refusal is recorded');
  assert.deepEqual(warnings().map((entry) => [entry.fields.refused, entry.fields.notAskedAgain]), [[0, 1]]);
  assert.deepEqual(errorsLogged(), []);
  assert.equal(receipt(pushed.db), undefined);
});

test('once the student has turned it in, the next push returns it: synced, and the receipt written', async () => {
  const pushed = await finish();
  pushed.google.states['cw-whole'] = 'TURNED_IN';
  await again(pushed, answer(1, { status: 'expired', totalAttempts: 3, bestPartialCredit: 50 }));
  assert.deepEqual(pushed.google.steps('cw-whole'), ['list', 'patch', 'return']);
  const returned = row(pushed.db);
  assert.deepEqual([returned.status, returned.returnedToStudent, returned.submissionState], ['synced', true, 'RETURNED']);
  for (const field of ['error', 'errorStatus', 'message', 'returnRefusedReason', 'returnRefusedState', 'returnRefusedAt']) {
    assert.equal(returned[field], undefined, `a returned row keeps no ${field}`);
  }
  assert.deepEqual([receipt(pushed.db).grade, receipt(pushed.db).returnedToStudent], [83, true]);
});

test('the class\'s final-deadline wake-up asks again: the stage moved, and the student may have turned it in', async () => {
  const pushed = await finish();
  await again(pushed, signal('final-deadline'));
  assert.deepEqual(pushed.google.steps('cw-whole'), [], 'before the cutoff the wake-up is not this student\'s');
  pushed.db.store.set('assignments/A1', { ...LESSON, dueAt: iso(-2 * DAY), lateDueAt: iso(-1 * DAY) });
  pushed.google.states['cw-whole'] = 'TURNED_IN';
  await again(pushed, signal('final-deadline'));
  assert.deepEqual(pushed.google.steps('cw-whole'), ['list', 'patch', 'return']);
  assert.deepEqual([row(pushed.db).status, row(pushed.db).stage], ['synced', 'final-deadline']);
});

test('a teacher\'s Retry asks Google for the return again', async () => {
  const pushed = await finish();
  await again(pushed, signal('manual-retry'));
  assert.deepEqual(pushed.google.steps('cw-whole'), ['list', 'patch', 'return']);
  assert.equal(row(pushed.db).status, 'graded-not-returned');
  assert.deepEqual(warnings().map((entry) => [entry.fields.refused, entry.fields.notAskedAgain]), [[1, 0]]);
});

/* --- every other error is handled as before -------------------------------- */

test('every other refusal at return is still a failed push, logged as an error', async () => {
  const { db } = await finish({ refuse: refuseReturns(PERMISSION_DENIED) });
  assert.equal(row(db).status, 'failed');
  assert.equal(row(db).errorStatus, 'PERMISSION_DENIED');
  assert.equal(row(db).returnRefusedReason, undefined);
  assert.deepEqual(errorsLogged().map((entry) => [entry.fields.step, entry.fields.googleStatus]), [['return-submission', 'PERMISSION_DENIED']]);
  assert.deepEqual(warnings(), []);
});

test('Google\'s per-minute limit at return is still waited out and queued again', async () => {
  const { db } = await finish({ refuse: refuseReturns(QUOTA) });
  assert.equal(row(db).status, 'rate-limited');
  const requeued = [...db.store.keys()].filter((key) => key.startsWith(`${queue.CLASSROOM_PUSH_QUEUE}/`));
  assert.equal(requeued.length, 1);
  assert.equal(db.data(requeued[0]).quotaRetry, 1);
  assert.deepEqual(warnings(), []);
});

test('"Retry all" still queues failed rows only: a grade Classroom saved but would not return is not one', async () => {
  // Two courses: Google refuses the first return for its precondition and the
  // second for a permission it lacks.
  const links = { 'pub-whole': wholeLink(), 'pub-other': wholeLink({ courseId: 'course-2', courseworkId: 'cw-other' }) };
  const db = fixture({ links });
  db.store.set(`classroomRosterLinks/${rosterLinkDocumentId('course-2', STUDENT)}`, { googleUserId: 'g-s1' });
  const google = fakeGoogle({ refuse: (step, courseWorkId, state) => (courseWorkId === 'cw-other' && step === 'return' ? PERMISSION_DENIED() : returnsOnlyTurnedInWork(step, courseWorkId, state)) });
  await writeGrades(whole({ db, google, change: (grades) => ({ ...grades, gradesByAssignment: { A1: structuredClone(ALL_RIGHT) } }) }));
  assert.deepEqual([row(db, 'pub-whole').status, row(db, 'pub-other').status], ['graded-not-returned', 'failed']);
  const result = await runCallable('whole', 'retryAllClassroomGradeSyncs', { db, request: { auth: { uid: 't1', token: { role: 'teacher' } }, data: {} } });
  assert.deepEqual(result, { failedRows: 1, queued: 1, assignments: 1 });
});

/* --- a support-profile change (TT23) --------------------------------------- */

// A support-profile change re-sends only a grade Classroom holds, and only
// when it moved (studentWorkloadIndices.profileChangeNeedsPush): a grade
// Classroom saved but would not return is held there.
const { buildSupportProjection } = await import('../../functions/shared/supportProfileModel.mjs');
const today = new Date().toISOString().slice(0, 10);
const revision = ({ n, percent = null }) => ({
  id: `r${n}`, revisionId: `r${n}`, revision: n, status: 'active', effectiveStart: today, createdAtMs: Date.now() - (10 - n) * 1000,
  accommodations: percent === null ? [] : [{ id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo: [] }],
  modifications: [],
});
const profileOf = (revisions) => buildSupportProjection({ revisions, todayKey: today });
const REDUCED_25 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 })]);
const TAKEN_OFF = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25 }), revision({ n: 3 })]);
const OPEN_CLASSWORK = {
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY), lateDueAt: iso(8 * DAY),
  sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: Array.from({ length: 8 }, (_, i) => ({
    questionId: `cw-q${i}`, id: `cw-q${i}`, type: 'numeric', prompt: `Solve ${i}.`, standard: i % 2 ? 'A.5A' : 'A.5B', dok: 2,
  })) }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
};

test('a support-profile change corrects a whole-assignment grade Classroom saved but would not return', async () => {
  const { studentOmittedIndices } = await import('../../functions/shared/reducedWorkload.mjs');
  logged.length = 0;
  const db = fixture({ assignment: OPEN_CLASSWORK, profile: REDUCED_25 });
  const google = fakeGoogle({ refuse: returnsOnlyTurnedInWork });
  const omitted = studentOmittedIndices({ assignment: { id: 'A1', ...OPEN_CLASSWORK }, profile: REDUCED_25, tracker: {} });
  const owed = [...Array(8).keys()].filter((index) => !omitted.has(index));
  await writeGrades(whole({ db, google, change: (grades) => ({ ...grades, gradesByAssignment: { A1: Object.fromEntries(owed.map((index) => [index, { status: 'correct', totalAttempts: 1 }])) } }) }));
  assert.deepEqual([row(db).status, row(db).grade], ['graded-not-returned', 100]);

  // The reduction is taken off: MathMaster shows 6 of 8, and Classroom gets
  // that grade as a draft while the work is open again.
  await again({ db, google }, (grades) => ({ ...grades, profile: TAKEN_OFF }));
  assert.deepEqual(google.calls.map((call) => [call.step, call.body]), [['list', undefined], ['patch', { draftGrade: 75 }]]);
  assert.deepEqual([row(db).status, row(db).grade, row(db).studentVisible, row(db).returnRefusedReason], ['synced', 75, false, undefined]);

  // The same profile saved again moves nothing and sends nothing.
  await again({ db, google }, (grades) => ({ ...grades, profile: structuredClone(TAKEN_OFF) }));
  assert.deepEqual(google.calls, []);
  assert.deepEqual(errorsLogged(), []);
});
