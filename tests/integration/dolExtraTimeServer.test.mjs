// EXTRA TIME ON THE EXIT TICKET (D7, H-117) AND CLASSROOM'S OWN CUTOFF
// (H-116), AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-d7 \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/dolExtraTimeServer.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The rules are pinned in tests/platform/dolExtraTime.test.mjs and
// tests/platform/classroomStudentCutoff.test.mjs. This file runs the REAL
// exported Cloud Functions and proves:
//   * the checkpoint finalizer: a DOL response a student with extra time
//     finished inside THEIR window is finalized for credit, one finished after
//     it is not, and one still inside it is rescheduled to their close — while
//     classmates without the accommodation are judged by the class window
//     exactly as before;
//   * Recovery waits behind the student's own open DOL;
//   * ingestion reopens a finalized DOL inside the student's extended teacher
//     reopen window, and not a classmate's;
//   * Classroom: a class-wide final wake-up is not returned to a student whose
//     own cutoff is later; their own time is recorded, the scheduler wakes
//     them when it arrives, and the grade is final then.
//
// Every id starts with `d7-`. The bell schedule is shared emulator state, so
// this file adds its own uniquely named periods to today's modified schedule
// (merge) and removes only those.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  db, fns, repo, resetClassroomCalls, studentRequest, teacherRequest,
} from './canonicalPersistenceHarness.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import {
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  studentAssignmentOverrideId,
} from '../../functions/shared/studentAssignmentOverrides.mjs';

const require = createRequire(import.meta.url);
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));
const queue = require(path.join(repo, 'functions/lib/classroomPushQueue.js'));
const { FieldPath, FieldValue } = require(path.join(repo, 'functions/node_modules/firebase-admin')).firestore;

const P = 'd7-';
const ZONE = 'America/Chicago';
const TEACHER = 'd7.teacher@desotoisd.org';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now();
const TODAY = zonedDateKey(NOW, ZONE);
// Whole minutes, so a bell time is exact.
const MINUTE_NOW = Math.floor(NOW / MINUTE) * MINUTE;
const clock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
// A period must start and end on today's school date; near midnight in
// Chicago there is no such hour behind us, so the window tests stand down.
const PERIOD_FITS_TODAY = zonedDateKey(MINUTE_NOW - 75 * MINUTE, ZONE) === TODAY && zonedDateKey(MINUTE_NOW + 5 * MINUTE, ZONE) === TODAY;
const skipNearMidnight = PERIOD_FITS_TODAY ? false : 'Chicago is within 75 minutes of midnight: no same-day class period fits';

// Two classes. ENDED: the period ended 6 minutes ago, so the class DOL closed
// 11 minutes ago (5 minutes before the bell) and a student with 1.5× time
// (10 → 15 minutes) closed 6 minutes ago. OPEN: the period ends in 2 minutes,
// so the class DOL closed 3 minutes ago and the extended student's closes in 2.
const ENDED = { classId: `${P}class-ended`, period: 'D7 Period Ended', endMs: MINUTE_NOW - 6 * MINUTE };
const OPEN = { classId: `${P}class-open`, period: 'D7 Period Open', endMs: MINUTE_NOW + 2 * MINUTE };
const REOPEN = { classId: `${P}class-reopen`, period: 'D7 Period Reopen', endMs: MINUTE_NOW - 30 * MINUTE };
const CLASSROOM = { classId: `${P}class-classroom`, period: 'D7 Period Classroom', endMs: MINUTE_NOW - 30 * MINUTE };
const CLASSES = [ENDED, OPEN, REOPEN, CLASSROOM];
const classCloseOf = (klass) => klass.endMs - 5 * MINUTE;
const extendedCloseOf = (klass) => klass.endMs; // + 5 minutes of extra time

const EXTRA_TIME = Object.freeze({ inclusionStatus: false, accommodations: ['extra-time'], modifications: [] });
const NO_EXTRA_TIME = Object.freeze({ inclusionStatus: false, accommodations: ['text-to-speech'], modifications: [] });
// An individualized due date three days after the class's (supportDeadline.mjs).
const EXTRA_TIME_DUE_DATE = buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2025-08-01', effectiveEnd: null,
    inclusionStatus: false, accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'hours', value: 72 } }, appliesTo: [] }], modifications: [],
  }],
  todayKey: TODAY,
});

const STUDENTS = {
  endedExtra: { id: `${P}ended-extra`, klass: ENDED, profile: EXTRA_TIME },
  endedExtraLate: { id: `${P}ended-extra-late`, klass: ENDED, profile: EXTRA_TIME },
  endedPlain: { id: `${P}ended-plain`, klass: ENDED, profile: NO_EXTRA_TIME },
  endedPlainOnTime: { id: `${P}ended-plain-ontime`, klass: ENDED, profile: NO_EXTRA_TIME },
  openExtra: { id: `${P}open-extra`, klass: OPEN, profile: EXTRA_TIME },
  openPlain: { id: `${P}open-plain`, klass: OPEN, profile: NO_EXTRA_TIME },
  reopenExtra: { id: `${P}reopen-extra`, klass: REOPEN, profile: EXTRA_TIME },
  reopenPlain: { id: `${P}reopen-plain`, klass: REOPEN, profile: NO_EXTRA_TIME },
  classroomExtra: { id: `${P}cr-extra`, klass: CLASSROOM, profile: EXTRA_TIME_DUE_DATE },
  classroomExtension: { id: `${P}cr-extension`, klass: CLASSROOM, profile: NO_EXTRA_TIME },
  classroomPlain: { id: `${P}cr-plain`, klass: CLASSROOM, profile: NO_EXTRA_TIME },
};

const question = (assignmentId, index, activityRole, accepted) => ({
  questionId: `${assignmentId}-q${index}`,
  id: `${assignmentId}-q${index}`,
  type: 'literal',
  activityRole,
  prompt: `Question ${index}`,
  solveFor: 'y',
  acceptedAnswers: [accepted],
});

const dolLesson = (id, klass, dol = {}) => ({
  title: `D7 ${id}`,
  assignedClassIds: [klass.classId],
  schemaVersion: 5,
  releaseAt: new Date(NOW - DAY).toISOString(),
  dueAt: new Date(NOW + DAY).toISOString(),
  lateDueAt: new Date(NOW + 2 * DAY).toISOString(),
  sections: [
    { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [question(id, 0, 'classwork', 'x+5')] },
    { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [question(id, 1, 'dol', '9')] },
  ],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  dol: { enabled: true, minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5, instructionDate: TODAY, ...dol },
});

const A_ENDED = `${P}dol-ended`;
const A_OPEN = `${P}dol-open`;
const A_REOPEN = `${P}dol-reopen`;
const A_CLASSROOM = `${P}classroom`;
const DOL_INDEX = 1;

const checkpointId = (studentId, assignmentId) => `${P}cp-${studentId}-${assignmentId}`;
const checkpoint = ({ student, assignmentId, acknowledgedAt }) => ({
  schemaVersion: 2,
  documentId: checkpointId(student.id, assignmentId),
  studentId: student.id,
  assignmentId,
  classId: student.klass.classId,
  questionIndex: DOL_INDEX,
  questionId: `${assignmentId}-q${DOL_INDEX}`,
  variantIndex: 0,
  activityRole: 'dol',
  revision: 1,
  response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
  isComplete: true,
  previousTotalAttempts: 0,
  candidateFinalizeAt: new Date(classCloseOf(student.klass)),
  serverAcknowledgedAt: new Date(acknowledgedAt),
  status: 'active',
  secure: false,
});
const readCheckpoint = async (student, assignmentId) => (await db.collection('studentResponseCheckpoints').doc(checkpointId(student.id, assignmentId)).get()).data();
const readGrade = async (student) => (await db.collection('grades').doc(student.id).get()).data() || {};
const sweep = (assignmentId, klass) => fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId, classId: klass.classId }, TEACHER));

const schedulePeriods = () => Object.fromEntries(CLASSES.map((klass) => [klass.period, {
  enabled: true, start: clock(klass.endMs - 60 * MINUTE), end: clock(klass.endMs),
}]));

const teardown = async () => {
  for (const name of ['assignments', 'classes', 'studentResponseCheckpoints', 'studentSubmissionReceipts', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs', 'classroomGradeCheckpointState', queue.CLASSROOM_PUSH_QUEUE, STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION]) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || doc.id.includes(P) || String(doc.data()?.studentId || '').startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
  for (const student of Object.values(STUDENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(db.collection('grades').doc(student.id)).catch(() => {});
  }
  const scheduleRef = db.collection('settings').doc('classSchedule');
  const schedule = await scheduleRef.get();
  if (schedule.exists && schedule.data()?.modifiedSchedules?.[TODAY]?.periods) {
    await scheduleRef.update(...CLASSES.flatMap((klass) => [new FieldPath('modifiedSchedules', TODAY, 'periods', klass.period), FieldValue.delete()]));
  }
};

before(async () => {
  await teardown();
  await db.collection('settings').doc('classSchedule').set({ modifiedSchedules: { [TODAY]: { periods: schedulePeriods() } } }, { merge: true });
  for (const klass of CLASSES) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classes').doc(klass.classId).set({ name: klass.period, period: klass.period, teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  }
  for (const student of Object.values(STUDENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(student.id).set({
      displayName: student.id, classId: student.klass.classId, classPeriod: student.klass.period,
      assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {}, profile: student.profile,
    });
  }
  await db.collection('assignments').doc(A_ENDED).set(dolLesson(A_ENDED, ENDED));
  await db.collection('assignments').doc(A_OPEN).set(dolLesson(A_OPEN, OPEN));
});

after(async () => {
  await teardown();
});

/* ------------------------------------------------- the checkpoint finalizer */

test('the finalizer: inside the extended window is on time, after it is late; the class window is unchanged for everyone else', { skip: skipNearMidnight }, async () => {
  const { endedExtra, endedExtraLate, endedPlain, endedPlainOnTime } = STUDENTS;
  const insideExtended = classCloseOf(ENDED) + 3 * MINUTE; // after the class's close, before theirs
  await db.collection('studentResponseCheckpoints').doc(checkpointId(endedExtra.id, A_ENDED)).set(checkpoint({ student: endedExtra, assignmentId: A_ENDED, acknowledgedAt: insideExtended }));
  await db.collection('studentResponseCheckpoints').doc(checkpointId(endedExtraLate.id, A_ENDED)).set(checkpoint({ student: endedExtraLate, assignmentId: A_ENDED, acknowledgedAt: extendedCloseOf(ENDED) + MINUTE }));
  await db.collection('studentResponseCheckpoints').doc(checkpointId(endedPlain.id, A_ENDED)).set(checkpoint({ student: endedPlain, assignmentId: A_ENDED, acknowledgedAt: insideExtended }));
  await db.collection('studentResponseCheckpoints').doc(checkpointId(endedPlainOnTime.id, A_ENDED)).set(checkpoint({ student: endedPlainOnTime, assignmentId: A_ENDED, acknowledgedAt: classCloseOf(ENDED) - 2 * MINUTE }));

  const result = await sweep(A_ENDED, ENDED);
  assert.equal(result.complete, true);

  const onTime = await readCheckpoint(endedExtra, A_ENDED);
  assert.equal(onTime.status, 'auto-submitted', 'finished inside their own window: finalized for credit');
  assert.equal((await readGrade(endedExtra)).gradesByAssignment?.[A_ENDED]?.[String(DOL_INDEX)]?.status, 'correct');
  assert.equal((await readGrade(endedExtra)).dolGradesByAssignment?.[A_ENDED]?.[TODAY]?.finalized, true);

  const late = await readCheckpoint(endedExtraLate, A_ENDED);
  assert.equal(late.status, 'recovered-after-close', 'after their own close: late, no grade');
  assert.equal(late.finalizationReceipt.cutoff.toMillis(), extendedCloseOf(ENDED), 'judged against their own close');

  // Without the accommodation: the class window, as before.
  const plainLate = await readCheckpoint(endedPlain, A_ENDED);
  assert.equal(plainLate.status, 'recovered-after-close', 'the same moment is late for a classmate without extra time');
  assert.equal(plainLate.finalizationReceipt.cutoff.toMillis(), classCloseOf(ENDED));
  const plainOnTime = await readCheckpoint(endedPlainOnTime, A_ENDED);
  assert.equal(plainOnTime.status, 'auto-submitted');
});

test('the finalizer reschedules a student still inside their own window to their close, and closes a classmate\'s', { skip: skipNearMidnight }, async () => {
  const { openExtra, openPlain } = STUDENTS;
  const acknowledgedAt = classCloseOf(OPEN) + MINUTE; // after the class's close
  await db.collection('studentResponseCheckpoints').doc(checkpointId(openExtra.id, A_OPEN)).set(checkpoint({ student: openExtra, assignmentId: A_OPEN, acknowledgedAt: Math.min(acknowledgedAt, Date.now()) }));
  await db.collection('studentResponseCheckpoints').doc(checkpointId(openPlain.id, A_OPEN)).set(checkpoint({ student: openPlain, assignmentId: A_OPEN, acknowledgedAt: Math.min(acknowledgedAt, Date.now()) }));
  await sweep(A_OPEN, OPEN);

  const extended = await readCheckpoint(openExtra, A_OPEN);
  assert.equal(extended.status, 'active', 'their DOL is still open');
  assert.equal(extended.candidateFinalizeAt.toMillis(), extendedCloseOf(OPEN), 'looked at again at their own close');
  assert.equal((await readCheckpoint(openPlain, A_OPEN)).status, 'recovered-after-close');
});

/* ------------------------------------------------------------------ Recovery */

test('Recovery waits behind the student\'s own open DOL, and not behind a classmate\'s closed one', { skip: skipNearMidnight }, async () => {
  const forExtra = await fns.advanceSectionRecovery.run(studentRequest(STUDENTS.openExtra.id, { assignmentId: A_OPEN, section: 'dol', action: 'status' }));
  assert.equal(forExtra.eligibility.reason, 'original-still-open');
  const forPlain = await fns.advanceSectionRecovery.run(studentRequest(STUDENTS.openPlain.id, { assignmentId: A_OPEN, section: 'dol', action: 'status' }));
  assert.notEqual(forPlain.eligibility.reason, 'original-still-open', 'the class DOL has closed for the classmate');
});

/* ---------------------------------------------------------------- ingestion */

// Ingestion does not judge the DOL window: it accepts a DOL answer until the
// assignment's own final cutoff, for every student, as before D7. The window
// is enforced by the student's device (getDOLState, now the student's own) and
// by the checkpoint finalizer (above). What ingestion must not do is refuse
// the answer a student with extra time submits inside their window.
//
// Pre-existing, recorded in the handoff: functions/index.js recomputes the DOL
// projection after buildIngestedAttempt without `allowReopen`, so ingestion
// never reopens a finalized DOL projection for anyone, inside a teacher's
// reopen or not (DOL scores are computed from the question records, not the
// projection). buildIngestedAttempt's own reopen check reads the student's
// extra time now, so it is right if that is ever changed.
test('ingestion: a DOL answer inside the student\'s extended window is accepted and recorded', { skip: skipNearMidnight }, async () => {
  const { reopenExtra, reopenPlain } = STUDENTS;
  await db.collection('assignments').doc(A_REOPEN).set(dolLesson(A_REOPEN, REOPEN, {
    recoveryByClassId: { [REOPEN.classId]: { dateKey: TODAY, openedAt: new Date(NOW - 20 * MINUTE).toISOString(), closesAt: new Date(NOW - 2 * MINUTE).toISOString(), openedBy: TEACHER, reason: 'teacher-recovery' } },
  }));
  const envelope = (student) => ({
    schemaVersion: 1,
    actionId: `${P}reopen-${student.id}`,
    kind: 'ordinarySubmission',
    assignmentId: A_REOPEN,
    questionIndex: DOL_INDEX,
    questionId: `${A_REOPEN}-q${DOL_INDEX}`,
    variantIndex: 0,
    activityRole: 'dol',
    // After the teacher's reopen closed for the class, inside the extended student's.
    capturedAt: NOW - MINUTE,
    previousTotalAttempts: 0,
    record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
    capturedSectionAccess: null,
    hasClassworkGrade: false,
    hasDolGrade: true,
  });
  for (const student of [reopenExtra, reopenPlain]) {
    // eslint-disable-next-line no-await-in-loop
    const { receipts } = await fns.ingestStudentSubmissions.run(studentRequest(student.id, { submissions: [envelope(student)] }));
    assert.equal(receipts[0].disposition, 'accepted', JSON.stringify(receipts[0]));
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await readGrade(student)).gradesByAssignment[A_REOPEN][String(DOL_INDEX)].status, 'correct');
  }
});

/* ------------------------------------------------------------------- H-116 */

const classroomAssignment = () => ({
  title: 'D7 Classroom lesson',
  assignedClassIds: [CLASSROOM.classId],
  schemaVersion: 5,
  releaseAt: new Date(NOW - 3 * DAY).toISOString(),
  dueAt: new Date(NOW - 2 * HOUR).toISOString(),
  lateDueAt: new Date(NOW - HOUR).toISOString(), // the class's final cutoff passed an hour ago
  sections: [
    { id: `${A_CLASSROOM}-cw`, role: 'classwork', title: 'Classwork', questions: [question(A_CLASSROOM, 0, 'classwork', 'x+5'), question(A_CLASSROOM, 1, 'classwork', '2x')] },
  ],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
});
const COURSE = `${P}course`;
const syncAudit = async (student) => (await db.collection('classroomGradeSyncs').where('studentId', '==', student.id).get()).docs
  .map((doc) => doc.data()).find((data) => data.assignmentId === A_CLASSROOM) || null;
const stateDoc = async () => (await db.collection('classroomGradeCheckpointState').doc(A_CLASSROOM).get()).data() || {};
const wake = async (student, signal) => {
  const ref = db.collection('grades').doc(student.id);
  const beforeData = (await ref.get()).data();
  await ref.update(new FieldPath('classroomReleaseSignals', A_CLASSROOM), signal);
  resetClassroomCalls();
  await fns.syncGradeToClassroom.run({ params: { studentId: student.id }, data: { before: { exists: true, data: () => beforeData }, after: await ref.get() } });
};

test('Classroom: the class\'s final wake-up is not returned to a student whose own cutoff is later; it is recorded for their own time', async () => {
  const { classroomExtra, classroomExtension, classroomPlain } = STUDENTS;
  await db.collection('assignments').doc(A_CLASSROOM).set(classroomAssignment());
  await db.collection('classroomLinks').doc(`${P}publication`).set({
    schemaVersion: 2, publicationId: `${P}publication`, assignmentId: A_CLASSROOM, courseId: COURSE, courseName: 'D7',
    courseworkId: `${P}coursework`, teacherUid: `uid-${TEACHER}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  // An attendance extension that ends 20 seconds from now (their own cutoff
  // arrives during this test), and the extra-time student's due three days out.
  await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(studentAssignmentOverrideId(classroomExtension.id, A_CLASSROOM)).set({
    studentId: classroomExtension.id, assignmentId: A_CLASSROOM, classId: CLASSROOM.classId,
    lateDueAt: new Date(Date.now() + 20_000).toISOString(), authorizedTeacherEmails: [TEACHER], revision: 1,
  });
  for (const student of [classroomExtra, classroomExtension, classroomPlain]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE, student.id)).set({ courseId: COURSE, studentId: student.id, googleUserId: `google-${student.id}` });
    // One of two answered: real, unfinished work.
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(student.id).update(new FieldPath('gradesByAssignment', A_CLASSROOM), {
      0: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, variantIndex: 0 },
    });
  }
  // What the scheduler had already done at the class's cutoff.
  await db.collection('classroomGradeCheckpointState').doc(A_CLASSROOM).set({
    assignmentId: A_CLASSROOM, reconcileVersion: 2, finalQueuedAt: new Date(NOW - HOUR).toISOString(),
    finalDueAt: new Date(Date.parse(classroomAssignment().lateDueAt)).toISOString(), dueQueuedAt: new Date(NOW - 2 * HOUR).toISOString(),
    dueAt: new Date(Date.parse(classroomAssignment().dueAt)).toISOString(),
  });

  const classWake = { reason: 'final-deadline', requestedAt: new Date(NOW - HOUR).toISOString() };
  await wake(classroomPlain, classWake);
  const plain = await syncAudit(classroomPlain);
  assert.equal(plain.stage, 'final-deadline', 'without an individual deadline: final at the class cutoff, as before');
  assert.equal(plain.isFinal, true);
  assert.equal(plain.studentVisible, true);

  await wake(classroomExtra, classWake);
  const extra = await syncAudit(classroomExtra);
  assert.ok(extra, 'their progress is still synced');
  assert.equal(extra.isFinal, false, `their own cutoff is three days away (${extra.stage})`);
  assert.equal(extra.studentVisible, false, 'and nothing is returned to them in Classroom');

  await wake(classroomExtension, classWake);
  const extension = await syncAudit(classroomExtension);
  assert.equal(extension.isFinal, false);

  const state = await stateDoc();
  const ownFinal = Date.parse(classroomAssignment().dueAt) + 72 * HOUR;
  assert.equal(Date.parse(state.pendingStudentFinalAt[classroomExtra.id]), ownFinal, 'their own cutoff is recorded for the scheduler');
  assert.ok(state.pendingStudentFinalAt[classroomExtension.id]);
  assert.equal(state.pendingStudentFinalAt[classroomPlain.id], undefined);
});

test('Classroom: the scheduler wakes the student at their own cutoff, and the grade is final then', async () => {
  const { classroomExtension, classroomExtra, classroomPlain } = STUDENTS;
  const pending = Date.parse((await stateDoc()).pendingStudentFinalAt[classroomExtension.id]);
  // Their own cutoff (20 s after the previous test began) has to pass.
  const wait = pending - Date.now() + 1_000;
  if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait); });

  await fns.queueClassroomGradeCheckpoints.run({});
  const entry = async (student) => (await db.collection(queue.CLASSROOM_PUSH_QUEUE).doc(queue.queueEntryId(A_CLASSROOM, student.id, 'final-deadline')).get()).data() || null;
  assert.ok(await entry(classroomExtension), 'woken at their own cutoff');
  assert.equal(await entry(classroomExtra), null, 'the extra-time student\'s cutoff is days away: not yet');
  assert.equal(await entry(classroomPlain), null, 'the class was woken already: nobody else is');
  const state = await stateDoc();
  assert.equal(state.pendingStudentFinalAt[classroomExtension.id], undefined, 'their entry is retired');
  assert.ok(state.pendingStudentFinalAt[classroomExtra.id]);

  // The queue releases the wake-up; the trigger now calls the grade final.
  await db.doc('classroomPushQueueState/drain').delete().catch(() => {});
  await queue.drainClassroomPushQueue(db, { nowMs: Date.now() });
  const beforeData = { ...(await readGrade(classroomExtension)), classroomReleaseSignals: {} };
  resetClassroomCalls();
  await fns.syncGradeToClassroom.run({ params: { studentId: classroomExtension.id }, data: { before: { exists: true, data: () => beforeData }, after: await db.collection('grades').doc(classroomExtension.id).get() } });
  const final = await syncAudit(classroomExtension);
  assert.equal(final.stage, 'final-deadline');
  assert.equal(final.isFinal, true);
  assert.equal(final.studentVisible, true);
});
