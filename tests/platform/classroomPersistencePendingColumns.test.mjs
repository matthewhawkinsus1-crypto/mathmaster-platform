// THE WHOLE-ASSIGNMENT TRIGGER'S PERSISTENCE HOLD IS WRITTEN ON ITS OWN COLUMNS ONLY.
//
// syncGradeToClassroom holds a final grade while a device still holds a
// queued answer, or other known work is unresolved, and says so on each
// column's row as "sync-pending". It wrote that row for every published link
// of the assignment, split-section columns too. A section column's row belongs
// to syncSectionGradeToClassroom: the two triggers key a column's row the same
// way, so the hold replaced the section trigger's own record ("synced", or
// "graded-not-returned") with a status that column never had, the whole
// assignment's grade, and isFinal, studentVisible and returnedToStudent false.
// The section trigger does not hold for persistence. It took its column for
// unsent, and on its next run sent the grade Classroom already held again, and
// asked again for a return Google had already refused.
//
// The hold now writes only the columns this trigger sends to, the rule its
// Recovery hold already follows: passback on, with a course. Everything before
// it, including each student's own later wake-ups (H-116, NV02), is
// untouched. The real triggers run here against fakes of Firestore and of
// Google's HTTP layer (helpers/sectionPassbackHarness.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fakeGoogle,
  passbackFirestore,
  requireFromFunctions,
  returnsOnlyTurnedInWork,
  runTrigger,
  writeGradeDocument,
  writeGrades,
} from './helpers/sectionPassbackHarness.mjs';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const { studentAssignmentOverrideId } = await import('../../functions/shared/studentAssignmentOverrides.mjs');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';
const OWN_FINAL = iso(2 * DAY);

const link = (extra) => ({
  schemaVersion: 2, assignmentId: 'A1', status: 'published', courseId: COURSE, teacherUid: 't1', maxPoints: 100, ...extra,
});
const section = (sectionKey) => link({
  publicationKind: 'section', sectionKey, courseworkId: `cw-${sectionKey}`, gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
});
// The class's final cutoff was an hour ago. The student has an extension
// two days on, and a Chromebook still holding one answer for this assignment.
const fixture = () => passbackFirestore({
  assignments: { A1: {
    schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(-2 * DAY), lateDueAt: iso(-1 * HOUR),
    sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
  } },
  classroomLinks: {
    'pub-whole': link({ publicationKind: 'assignment', sectionKey: 'whole', courseworkId: 'cw-whole', gradePassbackEnabled: true }),
    // Published with passback off, or with no course to send to: neither has
    // a grade column this trigger sends to.
    'pub-off': link({ publicationKind: 'assignment', sectionKey: 'whole', courseId: 'course-2', courseworkId: 'cw-off', gradePassbackEnabled: false }),
    'pub-nocourse': link({ publicationKind: 'assignment', sectionKey: 'whole', courseId: '', courseworkId: 'cw-nocourse', gradePassbackEnabled: true }),
    'pub-warmup': section('warmup'),
    'pub-classwork': section('classwork'),
  },
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  studentAssignmentOverrides: { [studentAssignmentOverrideId(STUDENT, 'A1')]: { lateDueAt: OWN_FINAL } },
  studentDevicePersistenceReports: { 'device-1': { studentId: STUDENT, queuedGradeBearingByAssignment: { A1: 1 } } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: { A1: {} } } },
});
const rowPath = (publicationId) => `classroomGradeSyncs/${gradeSyncDocumentId(publicationId, STUDENT)}`;
const row = (db, publicationId) => db.data(rowPath(publicationId));
const rowWrites = (db, from = 0) => db.writes.slice(from).filter((write) => write.path.startsWith('classroomGradeSyncs/')).map((write) => write.path);
const completeAll = (grades) => ({
  ...grades,
  gradesByAssignment: { A1: Object.fromEntries([0, 1, 2].map((index) => [index, { status: 'correct', totalAttempts: 1 }])) },
});
const finalDeadlineWakeUp = (grades) => ({
  ...grades, classroomReleaseSignals: { A1: { requestedAt: new Date().toISOString(), reason: 'final-deadline', source: 'classroom-push-queue' } },
});

// The student finishes the assignment. Google returns the Warm-Up (turned in
// there) and refuses to return the Classwork (not turned in); the
// whole-assignment column is held.
const finishWithAnswerQueued = async () => {
  const db = fixture();
  const google = fakeGoogle({ states: { 'cw-warmup': 'TURNED_IN' }, refuse: returnsOnlyTurnedInWork });
  const event = writeGradeDocument({ db, studentId: STUDENT, change: completeAll });
  await runTrigger('section', { db, google, event });
  const sectionRows = { warmup: row(db, 'pub-warmup'), classwork: row(db, 'pub-classwork') };
  const wholeFrom = db.writes.length;
  await runTrigger('whole', { db, google, event });
  return { db, google, sectionRows, wholeWrites: rowWrites(db, wholeFrom) };
};

test('the hold is written on the whole-assignment column, and on no section column\'s row', async () => {
  const { db, google, sectionRows, wholeWrites } = await finishWithAnswerQueued();
  assert.equal(sectionRows.warmup.status, 'synced');
  assert.equal(sectionRows.classwork.status, 'graded-not-returned');

  const held = row(db, 'pub-whole');
  assert.equal(held.status, 'sync-pending');
  assert.equal(held.persistencePending, true);
  assert.deepEqual(held.persistencePendingReasons, ['device-queue']);
  assert.equal(held.isFinal, false);
  assert.equal(held.grade, 100);
  assert.deepEqual(google.steps('cw-whole'), [], 'a held grade is not sent');

  assert.deepEqual(wholeWrites, [rowPath('pub-whole')], 'the whole-assignment trigger wrote its own row and no other');
  assert.deepEqual(row(db, 'pub-warmup'), sectionRows.warmup, 'the section trigger\'s record of its column stands');
  assert.deepEqual(row(db, 'pub-classwork'), sectionRows.classwork);
  assert.equal(row(db, 'pub-off'), undefined, 'a publication with passback off has no column to hold');
  assert.equal(row(db, 'pub-nocourse'), undefined, 'nor does one with no course');
});

test('the next wake-up sends nothing to the section columns, and the student\'s own later cutoff is still recorded', async () => {
  const { db, google, sectionRows } = await finishWithAnswerQueued();
  google.calls.length = 0;
  // The class's final-deadline wake-up, delivered to both triggers.
  await writeGrades({ db, google, studentId: STUDENT, change: finalDeadlineWakeUp, triggers: ['section', 'whole'] });

  assert.deepEqual(google.calls, [], 'Classroom already holds both section grades, and refused the one return');
  assert.deepEqual(row(db, 'pub-warmup'), sectionRows.warmup);
  assert.deepEqual(row(db, 'pub-classwork'), sectionRows.classwork);
  assert.equal(row(db, 'pub-whole').status, 'sync-pending', 'the answer is still queued');
  // H-116: the class's wake-up reached the student before their own cutoff.
  // Each trigger still records that time for its own scheduler.
  assert.equal(db.data('classroomGradeCheckpointState/A1')?.pendingStudentFinalAt?.[STUDENT], OWN_FINAL);
  assert.equal(db.data('classroomSectionGradeCheckpointState/A1')?.pendingStudentFinalAt?.[STUDENT], OWN_FINAL);
});
