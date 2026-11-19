// ONE RELEASE RULE FOR BOTH CLASSROOM TRIGGERS.
//
// Whether Classroom shows a student the grade MathMaster sends, and whether
// the submission is returned, is decided by classroomGradeReleasePolicy in
// functions/lib/classroomGradeRuntime.js. The section trigger always used it.
// The whole-assignment trigger, syncGradeToClassroom, used a copy of its own
// (in functions/index.js, then functions/classroomFunctions.js after #565's
// split), which never learned the Test Cycle stages added to
// the lib's in #223: a Test Cycle grade exists only once a teacher has
// released the secure result, so it is returned the moment it exists. With
// the copy, a released Test or Retest grade reached Classroom as a teacher's
// draft, assigned to nobody and returned to nobody. The copy is gone, and this
// fails if the trigger's module keeps a release policy of its own again, or if the
// trigger stops deciding with the lib's.
//
// The behaviour runs the real trigger against fakes of Firestore and of
// Google's HTTP layer (helpers/sectionPassbackHarness.mjs). The end-to-end
// release is tests/integration/testCycleCertification.test.mjs (F29, F30+F31).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRECONDITION, fakeGoogle, passbackFirestore, requireFromFunctions, writeGrades } from './helpers/sectionPassbackHarness.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { certAssignment } from '../fixtures/testCycleCertificationFixture.mjs';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');

const index = executableSource(readFileSync(new URL('../../functions/classroomFunctions.js', import.meta.url), 'utf8'));

test('the whole-assignment trigger\'s module keeps no release policy of its own: it decides with the lib\'s', () => {
  assert.doesNotMatch(index, /function\s+classroomGradeReleasePolicy\s*\(/, 'no copy of the rule in classroomFunctions.js');
  assert.doesNotMatch(index, /\b(?:const|let|var)\s+classroomGradeReleasePolicy\s*=/, 'nor one assigned to a name');
  assert.match(index, /const \{[^}]*\bclassroomGradeReleasePolicy\b[^}]*\} = require\("\.\/lib\/classroomGradeRuntime"\);/, 'the rule comes from the lib');
  const sync = region(index, 'exports.syncGradeToClassroom = onDocumentWritten(', 'exports.queueReleasedAssessmentGrades', 'syncGradeToClassroom');
  assert.match(sync, /const releasePolicy = classroomGradeReleasePolicy\(\{/, 'the trigger decides with it');
});

/* --- a released Test Cycle grade, through the real trigger ------------------ */

const STUDENT = 's1';
const COURSE = 'course-1';
const ASSIGNMENT = 'tc1';
const projection = ({ recordedGrade, source }) => ({
  recordedGrade, recordedGradeSource: source, stage: source === 'retest' ? 'complete' : 'corrections',
  reviewComplete: true, testState: 'released', retestState: source === 'retest' ? 'released' : 'none',
});
const fixture = () => passbackFirestore({
  assignments: { [ASSIGNMENT]: certAssignment({ classIds: ['c1'], assignmentId: ASSIGNMENT }) },
  classroomLinks: {
    'pub-whole': {
      assignmentId: ASSIGNMENT, status: 'published', publicationKind: 'assignment', sectionKey: 'whole',
      courseId: COURSE, courseworkId: 'cw-whole', teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: true,
    },
  },
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: {} } },
});
const release = (value) => (grades) => ({ ...grades, testCycleGrades: { [ASSIGNMENT]: projection(value) } });
const receiptOf = (db) => db.data(`grades/${STUDENT}`).classroomSyncStatusByAssignment?.[ASSIGNMENT];
const rowOf = (db) => db.data(`classroomGradeSyncs/${gradeSyncDocumentId('pub-whole', STUDENT)}`);

test('a released Test grade is assigned and returned, and the student\'s receipt says so', async () => {
  const db = fixture();
  const google = fakeGoogle();
  await writeGrades({ db, google, studentId: STUDENT, change: release({ recordedGrade: 52, source: 'test' }), triggers: ['whole'] });
  assert.deepEqual(google.steps('cw-whole'), ['list', 'patch', 'return']);
  assert.deepEqual(google.calls.find((call) => call.step === 'patch').body, { draftGrade: 52, assignedGrade: 52 });
  const row = rowOf(db);
  assert.deepEqual([row.status, row.stage, row.grade, row.studentVisible, row.returnedToStudent], ['synced', 'testcycle-test', 52, true, true]);
  const receipt = receiptOf(db);
  assert.deepEqual([receipt.stage, receipt.grade, receipt.studentVisible, receipt.returnedToStudent], ['testcycle-test', 52, true, true]);
});

test('a released Retest grade is assigned on the same column, which stays returned to the student', async () => {
  const db = fixture();
  const google = fakeGoogle();
  await writeGrades({ db, google, studentId: STUDENT, change: release({ recordedGrade: 52, source: 'test' }), triggers: ['whole'] });
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: release({ recordedGrade: 70, source: 'retest' }), triggers: ['whole'] });
  // The Test's return left the submission returned: the Retest's grade is
  // assigned on it, and it is not returned a second time.
  assert.deepEqual(google.steps('cw-whole'), ['list', 'patch']);
  assert.deepEqual(google.calls.find((call) => call.step === 'patch').body, { draftGrade: 70, assignedGrade: 70 });
  const row = rowOf(db);
  assert.deepEqual([row.status, row.stage, row.grade, row.studentVisible, row.returnedToStudent], ['synced', 'testcycle-retest', 70, true, true]);
  const receipt = receiptOf(db);
  assert.deepEqual([receipt.stage, receipt.grade, receipt.studentVisible, receipt.returnedToStudent], ['testcycle-retest', 70, true, true]);
});

// Returned now, a Test Cycle grade can also be one Classroom holds but would not
// return: Google returns only work the student turned in there, and MathMaster's
// students often never press Turn in ("graded-not-returned",
// lib/classroomPushErrors.js). The guard that never lowers a grade Classroom
// holds read only "synced" rows, so it let a lower grade through on such a row.
test('a Test grade Classroom holds but would not return is never lowered either', async () => {
  const db = fixture();
  const google = fakeGoogle({ refuse: (step) => (step === 'return' ? PRECONDITION() : null) });
  await writeGrades({ db, google, studentId: STUDENT, change: release({ recordedGrade: 70, source: 'test' }), triggers: ['whole'] });
  assert.deepEqual([rowOf(db).status, rowOf(db).grade], ['graded-not-returned', 70], 'the grade is in Classroom, its return refused');
  google.calls.length = 0;
  // A lower recorded grade that is not a teacher's adjustment (the canonical
  // rule never makes one; the guard is there in case it ever does).
  await writeGrades({ db, google, studentId: STUDENT, change: release({ recordedGrade: 52, source: 'test' }), triggers: ['whole'] });
  assert.deepEqual(google.steps('cw-whole').filter((step) => step === 'patch'), [], 'no lower grade is sent');
  const row = rowOf(db);
  assert.deepEqual([row.status, row.grade], ['skipped-would-lower', 70], 'the row keeps the grade Classroom holds and says why');
});
