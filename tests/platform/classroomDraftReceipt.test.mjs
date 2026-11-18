// A CLASSROOM RECEIPT NO STUDENT SCREEN SHOWS IS NOT WRITTEN TO THE GRADE RECORD.
//
// After a push goes through, both Classroom grade triggers write the student a
// receipt on grades/{studentId}. Every write to that document runs both
// triggers again and is sent to every teacher listening to the gradebook.
// Before the due date nearly every answer that moves the grade is pushed as a
// teacher's draft, which the student cannot see in Classroom, and no student
// screen shows a draft receipt (the toast, Home's card, the result page and the
// Grade Center read only a receipt whose `studentVisible` is true). So a draft
// receipt over no receipt, or over another draft, is not written
// (functions/lib/classroomGradeRuntime.js classroomReceiptNeedsWriting). The
// push itself, and the audit row the teacher's monitor reads, are as before; a
// receipt the student can see, and a draft that replaces one, are written as
// before.
//
// The real triggers run against fakes of Firestore and of Google's HTTP layer
// (helpers/sectionPassbackHarness.mjs). The end-to-end count, against the
// emulator, is tests/integration/gradeWritesPerSubmit.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fakeGoogle, passbackFirestore, requireFromFunctions, writeGrades } from './helpers/sectionPassbackHarness.mjs';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const { classroomReceiptNeedsWriting } = requireFromFunctions('./lib/classroomGradeRuntime.js');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';
// Due in a week: progress before it goes to Classroom as a teacher's draft.
const LESSON = {
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY),
  sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
};
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
const fixture = (grades = {}) => passbackFirestore({
  assignments: { A1: LESSON },
  classroomLinks: LINKS,
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: { A1: {} }, ...grades } },
});
const answered = (...indices) => (grades) => ({
  ...grades,
  gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, ...Object.fromEntries(indices.map((index) => [index, { status: 'correct', totalAttempts: 1 }])) } },
});
const submit = (db, google, change) => writeGrades({ db, google, studentId: STUDENT, change, triggers: ['whole', 'section'] });
const row = (db, publicationId) => db.data(`classroomGradeSyncs/${gradeSyncDocumentId(publicationId, STUDENT)}`);
const patches = (google, courseWorkId) => google.calls.filter((call) => call.step === 'patch' && call.courseWorkId === courseWorkId).map((call) => call.body);
// The triggers' own writes to the grade record: the student's write itself is
// made by the harness and is not one of them.
const receiptWrites = (db) => db.writes.filter((write) => write.path === `grades/${STUDENT}`).map((write) => write.field);
const receipts = (db) => {
  const grade = db.data(`grades/${STUDENT}`);
  return { whole: grade.classroomSyncStatusByAssignment?.A1, classwork: grade.classroomSectionSyncStatusByAssignment?.A1?.classwork };
};

test('the rule: a receipt is written when the student can see it, or when it replaces one they could', () => {
  const draft = { studentVisible: false };
  const shown = { studentVisible: true };
  assert.equal(classroomReceiptNeedsWriting(shown, undefined), true);
  assert.equal(classroomReceiptNeedsWriting(shown, draft), true);
  assert.equal(classroomReceiptNeedsWriting(shown, shown), true);
  assert.equal(classroomReceiptNeedsWriting(draft, shown), true, 'a draft replacing a shown receipt is written, as before');
  assert.equal(classroomReceiptNeedsWriting(draft, undefined), false);
  assert.equal(classroomReceiptNeedsWriting(draft, null), false);
  assert.equal(classroomReceiptNeedsWriting(draft, draft), false);
});

test('before the due date an answer that moves the grade is sent as a draft to both columns, and no receipt is written', async () => {
  const db = fixture();
  const google = fakeGoogle();
  await submit(db, google, answered(1));
  // The pushes are exactly as before: a draft grade, nothing assigned, nothing returned.
  assert.equal(patches(google, 'cw-whole').length, 1);
  assert.equal(patches(google, 'cw-classwork').length, 1);
  for (const body of [...patches(google, 'cw-whole'), ...patches(google, 'cw-classwork')]) {
    assert.ok('draftGrade' in body && !('assignedGrade' in body), 'a teacher\'s draft');
  }
  assert.equal(google.steps().includes('return'), false);
  // The teacher's monitor reads the audit rows, written as before.
  for (const publicationId of ['pub-whole', 'pub-classwork']) {
    assert.equal(row(db, publicationId).status, 'synced');
    assert.equal(row(db, publicationId).studentVisible, false);
    assert.match(row(db, publicationId).stage, /^progress-/);
  }
  // No screen shows a draft: the grade record is not written again for one.
  assert.deepEqual(receiptWrites(db), []);
  assert.deepEqual(receipts(db), { whole: undefined, classwork: undefined });
});

test('a draft over a draft receipt is not written either: the stored one stays', async () => {
  const stored = { stage: 'progress-25', grade: 10, isFinal: false, studentVisible: false, returnedToStudent: false };
  const db = fixture({
    classroomSyncStatusByAssignment: { A1: stored },
    classroomSectionSyncStatusByAssignment: { A1: { classwork: stored } },
  });
  const google = fakeGoogle();
  await submit(db, google, answered(1));
  assert.equal(patches(google, 'cw-whole').length, 1, 'the new draft grade still reaches Classroom');
  assert.equal(patches(google, 'cw-classwork').length, 1);
  assert.deepEqual(receiptWrites(db), []);
  assert.deepEqual(receipts(db), { whole: stored, classwork: stored });
});

test('a draft that replaces a receipt the student could see is written, as before', async () => {
  const shown = { stage: 'due-checkpoint', grade: 40, isFinal: false, studentVisible: true, returnedToStudent: true };
  const db = fixture({
    classroomSyncStatusByAssignment: { A1: shown },
    classroomSectionSyncStatusByAssignment: { A1: { classwork: shown } },
  });
  const google = fakeGoogle();
  await submit(db, google, answered(1));
  assert.deepEqual(receiptWrites(db).sort(), ['classroomSectionSyncStatusByAssignment.A1.classwork', 'classroomSyncStatusByAssignment.A1']);
  const { whole, classwork } = receipts(db);
  assert.equal(whole.studentVisible, false);
  assert.match(whole.stage, /^progress-/);
  assert.equal(classwork.studentVisible, false);
});

test('a grade the student can see writes its receipt: the finished lesson, to both columns', async () => {
  const db = fixture();
  const google = fakeGoogle();
  await submit(db, google, answered(0, 1, 2));
  assert.deepEqual(receiptWrites(db).sort(), ['classroomSectionSyncStatusByAssignment.A1.classwork', 'classroomSyncStatusByAssignment.A1']);
  const { whole, classwork } = receipts(db);
  assert.deepEqual([whole.stage, whole.isFinal, whole.studentVisible, whole.grade], ['final-complete', true, true, 100]);
  assert.deepEqual([classwork.stage, classwork.isFinal, classwork.studentVisible, classwork.grade], ['final-complete', true, true, 100]);
});
