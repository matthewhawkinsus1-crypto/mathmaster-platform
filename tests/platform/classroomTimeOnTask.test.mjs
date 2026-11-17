// TIME ON TASK WAKES NEITHER CLASSROOM TRIGGER.
//
// Each Next writes the question's `timeSpent` to its record, and the browser's
// activity flush writes `assignmentActivity`; the completion reconcile may then
// write `classworkGradesByAssignment`. Both grade triggers woke on the record's
// `timeSpent` and did their whole work (an assignment, its links and the audit
// rows read) to compute the grade they had already sent. Neither reads time on
// task anywhere it decides a grade, a stage, a release, a hold or a return, so a
// change that moves only time on task is now no change to them
// (functions/lib/classroomTrackerChange.js).
//
// Proved here, with the real triggers against fakes of Firestore and Google's
// HTTP layer (helpers/sectionPassbackHarness.mjs):
//   * a time-only write reads nothing and sends nothing, in either trigger;
//   * everything else still wakes them: an answer, a record a Next creates, a
//     legacy record's new shape, a teacher's override, a release signal (the
//     device report's, which ends a persistence hold), a completed Recovery,
//     a Test Cycle projection, a support profile that changes the items owed;
//   * what they send, audit and write back is the same whatever the time on
//     task, before the due date, after it, at completion and while a final
//     grade is held for work a device still reports.
// The end-to-end count, against the emulator, is
// tests/integration/gradeWritesPerSubmit.test.mjs ("Next").

import test from 'node:test';
import assert from 'node:assert/strict';

import { fakeGoogle, passbackFirestore, requireFromFunctions, writeGrades } from './helpers/sectionPassbackHarness.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const { trackerChangedBeyondTimeOnTask } = requireFromFunctions('./lib/classroomTrackerChange.js');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';
const lesson = (dates) => ({
  schemaVersion: 5, assignedClassIds: ['c1'], ...dates,
  sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
});
const LINKS = {
  'pub-whole': {
    assignmentId: 'A1', status: 'published', publicationKind: 'assignment', sectionKey: 'whole',
    courseId: COURSE, courseworkId: 'cw-whole', teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: true,
  },
  'pub-classwork': {
    assignmentId: 'A1', status: 'published', publicationKind: 'section', sectionKey: 'classwork', sectionLabel: 'Classwork',
    courseId: COURSE, courseworkId: 'cw-classwork', teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
  },
};
const answered = (status, extra = {}) => ({ status, attemptCount: 1, totalAttempts: 1, partialCredit: status === 'correct' ? 100 : 0, bestPartialCredit: status === 'correct' ? 100 : 0, variantIndex: 0, lastSubmissionId: `sub-${status}`, ...extra });
const fixture = ({ dates = { dueAt: iso(7 * DAY) }, grades = {}, extra = {} } = {}) => passbackFirestore({
  assignments: { A1: lesson(dates) },
  classroomLinks: LINKS,
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: { A1: {} }, ...grades } },
  ...extra,
});
const BOTH = ['whole', 'section'];

/* --- the rule --------------------------------------------------------------- */

test('the rule: only a record that exists on both sides and differs only in timeSpent is unchanged', () => {
  const record = answered('attempted', { timeSpent: 40, detailRef: 'd1' });
  const tracker = { 0: record, 1: answered('correct', { timeSpent: 10 }) };
  assert.equal(trackerChangedBeyondTimeOnTask(tracker, structuredClone(tracker)), false, 'the same tracker');
  assert.equal(trackerChangedBeyondTimeOnTask(tracker, { ...tracker, 0: { ...record, timeSpent: 95 } }), false, 'a Next raised one question\'s time');
  assert.equal(trackerChangedBeyondTimeOnTask(tracker, { 0: { ...record, timeSpent: 95 }, 1: { ...tracker[1], timeSpent: 70 } }), false, 'several');
  const { timeSpent: _none, ...withoutTime } = record;
  assert.equal(trackerChangedBeyondTimeOnTask({ 0: withoutTime }, { 0: record }), false, 'time added to a record that had none');
  for (const [field, value] of [['status', 'correct'], ['attemptCount', 2], ['totalAttempts', 2], ['partialCredit', 50], ['bestPartialCredit', 50], ['stepCredit', 40], ['variantIndex', 1], ['lastSubmissionId', 'sub-2'], ['detailRef', 'd2'], ['lastAttemptAt', 'later']]) {
    assert.equal(trackerChangedBeyondTimeOnTask(tracker, { ...tracker, 0: { ...record, [field]: value } }), true, `${field} moves`);
    assert.equal(trackerChangedBeyondTimeOnTask(tracker, { ...tracker, 0: { ...record, [field]: value, timeSpent: 95 } }), true, `${field} moves, with time`);
  }
  assert.equal(trackerChangedBeyondTimeOnTask(tracker, { ...tracker, 2: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, timeSpent: 30 } }), true, 'a record a Next creates');
  assert.equal(trackerChangedBeyondTimeOnTask({ 0: 'attempted' }, { 0: { status: 'attempted', attemptCount: 1, totalAttempts: 1, timeSpent: 30 } }), true, 'a legacy string record turned into an object');
  assert.equal(trackerChangedBeyondTimeOnTask(tracker, { 1: tracker[1] }), true, 'a record removed');
  assert.equal(trackerChangedBeyondTimeOnTask(undefined, tracker), true, 'the assignment\'s first record');
});

/* --- a time-only write reads nothing ----------------------------------------- */

const WORKED = {
  gradesByAssignment: { A1: { 0: answered('correct', { timeSpent: 40 }), 1: answered('attempted', { timeSpent: 25 }) } },
  assignmentActivity: { A1: { totalTimeSeconds: 300, onTimeSeconds: 300, lastActiveAt: iso(-60_000) } },
};
const runOnce = async ({ grades = WORKED, change, triggers = BOTH, dates }) => {
  const db = fixture({ grades, dates });
  const google = fakeGoogle();
  db.reads.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change, triggers });
  return { db, google };
};

test('a Next, the activity flush and a completion reconcile read nothing and send nothing, in either trigger', async () => {
  const timeOnly = (grades) => ({
    ...grades,
    gradesByAssignment: { A1: { 0: { ...grades.gradesByAssignment.A1[0], timeSpent: 400 }, 1: { ...grades.gradesByAssignment.A1[1], timeSpent: 700 } } },
    assignmentActivity: { A1: { totalTimeSeconds: 1500, onTimeSeconds: 1500, lastActiveAt: iso(0) } },
    classworkGradesByAssignment: { A1: { score: 100, completionPercent: 100, engagedSeconds: 1500 } },
  });
  for (const trigger of BOTH) {
    // eslint-disable-next-line no-await-in-loop
    const { db, google } = await runOnce({ change: timeOnly, triggers: [trigger] });
    assert.deepEqual(db.reads, [], `${trigger}: nothing read`);
    assert.deepEqual(google.calls, [], `${trigger}: nothing sent`);
    assert.deepEqual(db.writes, [], `${trigger}: nothing written`);
  }
});

const WAKES = [
  ['an answer', BOTH, (grades) => ({ ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, 1: answered('correct', { timeSpent: 25, lastSubmissionId: 'sub-2' }) } } })],
  ['a record a Next creates', BOTH, (grades) => ({ ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, 2: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0, timeSpent: 30 } } } })],
  ['a teacher\'s override', BOTH, (grades) => ({ ...grades, teacherGradeOverridesByAssignment: { A1: { 1: { active: true, score: 100, totalAttempts: 1, variantIndex: 0, submissionId: 'sub-attempted' } } } })],
  ['a release signal', BOTH, (grades) => ({ ...grades, classroomReleaseSignals: { A1: { requestedAt: iso(0), reason: 'manual-retry' } } })],
  ['a completed Recovery', BOTH, (grades) => ({ ...grades, sectionRecoveryByAssignment: { A1: { warmup: { status: 'completed', recordedScore: 80, rawScore: 80, cap: 100, type: 'recovery' } } } })],
  ['a Test Cycle projection', ['whole'], (grades) => ({ ...grades, testCycleGrades: { A1: { recordedGrade: 70, recordedGradeSource: 'test', stage: 'corrections' } } })],
];
for (const [name, triggers, change] of WAKES) {
  test(`still wakes the triggers: ${name}`, async () => {
    for (const trigger of triggers) {
      // eslint-disable-next-line no-await-in-loop
      const { db } = await runOnce({ change, triggers: [trigger] });
      assert.ok(db.reads.some((read) => read.path === 'assignments/A1'), `${trigger} reads the assignment for ${name}`);
    }
  });
}

// A reduced-item-count accommodation saved on open work changes the items the
// student owes (tests/platform/profileChangeClassroomResend.test.mjs): each
// trigger works the assignment through to what Classroom was last told.
test('still wakes the triggers: a support profile that changes the items the student owes', async () => {
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  const revision = (n, accommodations) => ({
    id: `r${n}`, revisionId: `r${n}`, revision: n, status: 'active', effectiveStart: yesterday, createdAtMs: Date.now() - DAY, accommodations, modifications: [],
  });
  const reduced = { id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: 50 } }, appliesTo: [] };
  const before = buildSupportProjection({ revisions: [revision(1, [])], todayKey });
  const after = buildSupportProjection({ revisions: [revision(1, []), revision(2, [reduced])], todayKey });
  const eight = { ...lesson({ dueAt: iso(7 * DAY) }), sections: [{ role: 'classwork', questions: Array.from({ length: 8 }, (_, index) => ({ id: `c${index}` })) }] };
  for (const trigger of BOTH) {
    const db = passbackFirestore({
      assignments: { A1: eight },
      classroomLinks: LINKS,
      classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
      grades: { [STUDENT]: { classId: 'c1', profile: before, ...WORKED } },
    });
    // eslint-disable-next-line no-await-in-loop
    await writeGrades({ db, google: fakeGoogle(), studentId: STUDENT, change: (grades) => ({ ...grades, profile: after }), triggers: [trigger] });
    const link = trigger === 'whole' ? 'pub-whole' : 'pub-classwork';
    assert.ok(db.reads.some((read) => read.path === `classroomGradeSyncs/${gradeSyncDocumentId(link, STUDENT)}`), `${trigger} reads what Classroom was last told`);
  }
});

test('still wakes the triggers: a legacy string record a Next turns into an object', async () => {
  const legacy = { gradesByAssignment: { A1: { 0: 'attempted' } } };
  for (const trigger of BOTH) {
    // eslint-disable-next-line no-await-in-loop
    const { db } = await runOnce({ grades: legacy, change: (grades) => ({ ...grades, gradesByAssignment: { A1: { 0: { status: 'attempted', attemptCount: 1, totalAttempts: 1, variantIndex: 0, timeSpent: 30 } } } }), triggers: [trigger] });
    assert.ok(db.reads.some((read) => read.path === 'assignments/A1'), `${trigger} reads the assignment`);
  }
});

/* --- the grade sent is the same whatever the time on task -------------------- */

// The same answer, on two students identical but for their time on task.
const withTime = (grades, seconds) => ({
  ...grades,
  gradesByAssignment: { A1: Object.fromEntries(Object.entries(grades.gradesByAssignment.A1).map(([key, record]) => [key, { ...record, timeSpent: seconds }])) },
  assignmentActivity: { A1: { totalTimeSeconds: seconds * 10, onTimeSeconds: seconds * 10, lastActiveAt: iso(-60_000) } },
  ...(seconds ? { classworkGradesByAssignment: { A1: { score: 100, completionPercent: 100, engagedSeconds: seconds * 10 } } } : {}),
});
const outcome = async ({ dates, grades, change, extra }) => {
  const db = fixture({ dates, grades, extra });
  const google = fakeGoogle();
  await writeGrades({ db, google, studentId: STUDENT, change, triggers: BOTH });
  const rows = Object.fromEntries(['pub-whole', 'pub-classwork'].map((id) => {
    const row = db.data(`classroomGradeSyncs/${gradeSyncDocumentId(id, STUDENT)}`);
    return [id, row ? [row.status, row.stage, row.grade, row.studentVisible, row.returnedToStudent, row.persistencePending ?? null] : null];
  }));
  const grade = db.data(`grades/${STUDENT}`);
  const receipt = (value) => (value ? [value.stage, value.grade, value.studentVisible, value.returnedToStudent] : null);
  return {
    calls: google.calls.map((call) => [call.step, call.courseWorkId, call.body || null]),
    rows,
    receipts: [receipt(grade.classroomSyncStatusByAssignment?.A1), receipt(grade.classroomSectionSyncStatusByAssignment?.A1?.classwork)],
  };
};
const START = { gradesByAssignment: { A1: { 0: answered('correct'), 1: answered('correct') } } };
const answerLast = (grades) => ({ ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, 2: answered('correct', { lastSubmissionId: 'sub-3', timeSpent: grades.gradesByAssignment.A1[0].timeSpent }) } } });
const answerSecondWrong = (grades) => ({ ...grades, gradesByAssignment: { A1: { 0: grades.gradesByAssignment.A1[0], 1: answered('attempted', { lastSubmissionId: 'sub-2', timeSpent: grades.gradesByAssignment.A1[0].timeSpent }) } } });
// Each scene, and the whole-assignment column's monitor row it ends on.
const SCENES = [
  ['before the due date: a teacher\'s draft', { dueAt: iso(7 * DAY) }, { gradesByAssignment: { A1: { 0: answered('correct') } } }, answerSecondWrong, {},
    ['synced', 'progress-50', 33, false, false]],
  ['after the due date: late progress, returned', { dueAt: iso(-DAY), lateDueAt: iso(7 * DAY) }, { gradesByAssignment: { A1: { 0: answered('correct') } } }, answerSecondWrong, {},
    ['synced', 'late-progress-50', 33, true, true]],
  ['the last answer: final, returned', { dueAt: iso(7 * DAY) }, START, answerLast, {},
    ['synced', 'final-complete', 100, true, true]],
  ['the last answer while a device still reports work: held', { dueAt: iso(7 * DAY) }, START, answerLast, {
    studentDevicePersistenceReports: { [`${STUDENT}__chromebook`]: { studentId: STUDENT, queuedGradeBearingByAssignment: { A1: 1 } } },
  }, ['sync-pending', 'sync-pending', 100, false, false]],
];
for (const [name, dates, start, change, extra, wholeRow] of SCENES) {
  test(`the same grade, stage, return and receipt whatever the time on task: ${name}`, async () => {
    const none = await outcome({ dates, grades: withTime(start, 0), change, extra });
    const much = await outcome({ dates, grades: withTime(start, 5400), change, extra });
    assert.deepEqual(none.rows['pub-whole'].slice(0, 5), wholeRow, 'the scene is what it says');
    assert.deepEqual(much, none);
  });
}
