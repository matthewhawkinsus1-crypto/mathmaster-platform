// THE THREE #176 REGRESSION CASES THAT HAD NO TEST.
//
// Issue #176 (self-healing per-section Classroom passback) listed twelve
// regression cases. Nine are covered by model tests and by the trigger tests on
// helpers/sectionPassbackHarness.mjs. These are the other three (#554, item 7),
// end to end on the same harness: the real reconcile callable or due-date
// scheduler, the push queue it fills, and the real section trigger, against
// fakes of Firestore and of Google's HTTP layer.
//
//   1. A missing audit row, an existing publication and saved work: the
//      teacher's Reconcile creates the row and sends the grade.
//   2. Reconcile run again with nothing changed: no second return and no post,
//      the same grades, the same rows.
//   3. The due-date checkpoint across a class with a completed student, one
//      with partial work and one with none: each column gets that student's
//      own grade, and the completed sections keep theirs, FINAL, and are not
//      sent again, at the due date or at the final cutoff.
//
// The queue is released as drainClassroomPushQueue releases it: its own
// releaseSignalFor, one grade-document write per entry, and the trigger that
// write wakes. The drain's pacing is certified against the emulator in
// tests/integration/classroomPushPacing.test.mjs.
//
// Each student has their own fake Google: the fake keeps one submission state
// per column, and a class shares columns.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fakeGoogle,
  passbackFirestore,
  requireFromFunctions,
  returnsOnlyTurnedInWork,
  runCallable,
  writeGrades,
} from './helpers/sectionPassbackHarness.mjs';
import { canonicalPresentedSectionGrade } from '../../src/platform/grading/canonicalGradeProjection.js';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');
const { CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION } = requireFromFunctions('./lib/classroomSectionGradeReconciliation.js');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const COURSE = 'course-1';
const CLASS_ID = 'class-1';
const SECTIONS = ['warmup', 'classwork'];
const MAX_POINTS = 50;

// Warm-Up w1 (index 0); Classwork c1, c2 (1, 2).
const lesson = (extra = {}) => ({
  schemaVersion: 5, assignedClassIds: [CLASS_ID], releaseAt: iso(-30 * DAY), dueAt: iso(7 * DAY), lateDueAt: iso(9 * DAY),
  sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
  ...extra,
});
const column = (sectionKey) => ({
  assignmentId: 'A1', status: 'published', publicationKind: 'section', sectionKey, courseId: COURSE,
  courseworkId: `cw-${sectionKey}`, teacherUid: 't1', maxPoints: MAX_POINTS,
  gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
});
const answered = (index, status) => ({
  status, totalAttempts: 1, attemptCount: 1, variantIndex: 0, lastSubmissionId: `submit-${index}`,
  lastAttemptAt: '2026-11-10T15:00:00.000Z', partialCredit: status === 'correct' ? 100 : 0, bestPartialCredit: status === 'correct' ? 100 : 0,
});
// The Warm-Up done; Classwork c1 right, c2 not reached.
const WARMUP_DONE = { 0: answered(0, 'correct'), 1: answered(1, 'correct') };
const EVERYTHING_DONE = { 0: answered(0, 'correct'), 1: answered(1, 'correct'), 2: answered(2, 'correct') };
// The Warm-Up answered wrong with tries left; Classwork c1 right, c2 not reached.
const PARTIAL = { 0: answered(0, 'attempted'), 1: answered(1, 'correct') };

const classFixture = ({ assignment = lesson(), students }) => passbackFirestore({
  assignments: { A1: assignment },
  classroomLinks: Object.fromEntries(SECTIONS.map((key) => [`pub-${key}`, column(key)])),
  classroomRosterLinks: Object.fromEntries(Object.keys(students).map((id) => [rosterLinkDocumentId(COURSE, id), { googleUserId: `g-${id}` }])),
  grades: Object.fromEntries(Object.entries(students).map(([id, work]) => [id, {
    classId: CLASS_ID, profile: {}, gradesByAssignment: work ? { A1: structuredClone(work) } : {},
  }])),
});
const row = (db, studentId, key) => db.data(`classroomGradeSyncs/${gradeSyncDocumentId(`pub-${key}`, studentId)}`);
const rows = (db) => Object.fromEntries([...db.store.keys()].filter((key) => key.startsWith('classroomGradeSyncs/')).map((key) => [key, db.data(key)]));
// What one student's push asked Google, column by column (the trigger walks
// the columns in document-id order, which is not part of the contract).
const steps = (google) => Object.fromEntries(SECTIONS.map((key) => [key, google.calls
  .filter((call) => call.courseWorkId === `cw-${key}`)
  .map((call) => `${call.step}${call.refused ? ' (refused)' : ''}`)]));
const patchesOn = (google, key) => google.calls.filter((call) => call.step === 'patch' && call.courseWorkId === `cw-${key}`).map((call) => call.body);
const points = (percent) => Math.round((percent / 100) * MAX_POINTS * 100) / 100;
// MathMaster's own grade for one column, as the browser shows it.
const mathMasterGrade = (db, studentId, sectionKey) => canonicalPresentedSectionGrade({
  student: db.data(`grades/${studentId}`), assignment: { id: 'A1', ...db.data('assignments/A1') }, sectionKey,
});

const TEACHER_REQUEST = { auth: { uid: 't1', token: { role: 'teacher' } }, data: { assignmentId: 'A1' } };
const reconcile = (db) => runCallable('section', 'reconcileClassroomSectionGrades', { db, request: TEACHER_REQUEST });
const dueDateScheduler = (db) => runCallable('section', 'queueClassroomSectionGradeCheckpoints', { db, request: { scheduleTime: new Date().toISOString() } });

/** What drainClassroomPushQueue does with each due entry, and the section trigger that write wakes. */
// Each release a moment after the last: a signal identical to the one before
// is no change, and the fakes answer fast enough for two to share a millisecond.
let releases = 0;
async function releaseQueue({ db, googleFor }) {
  const entries = [...db.store.keys()].filter((key) => key.startsWith(`${queue.CLASSROOM_PUSH_QUEUE}/`)).sort();
  releases += 1;
  const releasedAt = new Date(Date.now() + releases).toISOString();
  const released = [];
  for (const key of entries) {
    const entry = db.data(key);
    // eslint-disable-next-line no-await-in-loop
    await writeGrades({
      db,
      google: googleFor[entry.studentId],
      studentId: entry.studentId,
      change: (grades) => ({
        ...grades,
        classroomReleaseSignals: { ...grades.classroomReleaseSignals, [entry.assignmentId]: queue.releaseSignalFor(entry, releasedAt) },
      }),
    });
    // eslint-disable-next-line no-await-in-loop
    await db.doc(key).delete();
    released.push(`${entry.reason} ${entry.studentId}`);
  }
  return released;
}

/* --- 1. a missing row, an existing publication, saved work ----------------- */

test('Reconcile creates the missing row and sends the saved grade to the existing column', async () => {
  // Work saved while nothing reached Classroom: no row for either column.
  const db = classFixture({ students: { saved: WARMUP_DONE, fresh: null } });
  const googleFor = { saved: fakeGoogle({ states: { 'cw-warmup': 'TURNED_IN' } }), fresh: fakeGoogle() };
  assert.deepEqual(rows(db), {});

  const result = await reconcile(db);
  assert.equal(result.queuedStudents, 1, 'the student with saved work, and only them');
  assert.equal(result.publications, 2);
  assert.deepEqual(await releaseQueue({ db, googleFor }), ['section-grade-reconcile saved']);

  // The completed Warm-Up: assigned and returned. The unfinished Classwork: a
  // teacher draft of its real grade, before the due date.
  assert.deepEqual(steps(googleFor.saved), { warmup: ['list', 'patch', 'return'], classwork: ['list', 'patch'] });
  assert.deepEqual(patchesOn(googleFor.saved, 'warmup'), [{ draftGrade: points(100), assignedGrade: points(100) }]);
  assert.deepEqual(patchesOn(googleFor.saved, 'classwork'), [{ draftGrade: points(50) }]);
  for (const [key, expected] of Object.entries({
    warmup: { status: 'synced', stage: 'final-complete', grade: 100, classroomGrade: points(100), returnedToStudent: true, studentVisible: true },
    classwork: { status: 'synced', stage: 'manual-retry', grade: 50, classroomGrade: points(50), returnedToStudent: false, studentVisible: false },
  })) {
    const created = row(db, 'saved', key);
    assert.ok(created, `the ${key} row now exists`);
    assert.deepEqual(
      Object.fromEntries(Object.keys(expected).map((field) => [field, created[field]])),
      expected,
      key,
    );
    assert.equal(created.reconciliationVersion, CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION);
    assert.equal(created.grade, mathMasterGrade(db, 'saved', key), `${key}: what MathMaster shows`);
  }
  assert.deepEqual(googleFor.fresh.calls, [], 'a student with no saved work is not sent anything');
  assert.equal(row(db, 'fresh', 'warmup'), undefined);
});

/* --- 2. Reconcile again, nothing changed ----------------------------------- */

test('Reconcile run again with nothing changed returns nothing twice, posts nothing, and leaves the same grades and rows', async () => {
  // One student turned the work in on Classroom; one never did, so Google
  // refuses to return theirs.
  const db = classFixture({ students: { turnedIn: WARMUP_DONE, notTurnedIn: WARMUP_DONE } });
  const googleFor = {
    turnedIn: fakeGoogle({ states: { 'cw-warmup': 'TURNED_IN' }, refuse: returnsOnlyTurnedInWork }),
    notTurnedIn: fakeGoogle({ refuse: returnsOnlyTurnedInWork }),
  };
  await reconcile(db);
  await releaseQueue({ db, googleFor });
  assert.deepEqual(steps(googleFor.turnedIn), { warmup: ['list', 'patch', 'return'], classwork: ['list', 'patch'] });
  assert.deepEqual(steps(googleFor.notTurnedIn), { warmup: ['list', 'patch', 'return (refused)'], classwork: ['list', 'patch'] });
  assert.equal(row(db, 'notTurnedIn', 'warmup').status, 'graded-not-returned');
  const rowsAfterFirst = rows(db);
  const sentFirst = Object.fromEntries(Object.entries(googleFor).map(([id, google]) => [id, google.calls.filter((call) => call.step === 'patch').map((call) => [call.courseWorkId, call.body])]));
  const writesBefore = db.writes.length;
  Object.values(googleFor).forEach((google) => { google.calls.length = 0; });

  const signalsBefore = Object.keys(googleFor).map((id) => db.data(`grades/${id}`).classroomReleaseSignals.A1);
  const again = await reconcile(db);
  assert.equal(again.queuedStudents, 2);
  await releaseQueue({ db, googleFor });
  assert.deepEqual(
    Object.keys(googleFor).map((id, index) => db.data(`grades/${id}`).classroomReleaseSignals.A1.requestedAt !== signalsBefore[index].requestedAt),
    [true, true],
    'the second Reconcile reached both students\' columns',
  );

  for (const [id, google] of Object.entries(googleFor)) {
    assert.deepEqual(google.calls.filter((call) => call.step === 'return'), [], `${id}: nothing is returned a second time`);
    // Whatever is sent again is what was sent before, once per column at most.
    const patches = google.calls.filter((call) => call.step === 'patch').map((call) => [call.courseWorkId, call.body]);
    for (const patch of patches) assert.ok(sentFirst[id].some((first) => JSON.stringify(first) === JSON.stringify(patch)), `${id}: the same grade`);
    for (const key of SECTIONS) {
      assert.ok(google.calls.filter((call) => call.courseWorkId === `cw-${key}` && call.step === 'patch').length <= 1, `${id} ${key}: at most one patch`);
    }
  }
  assert.deepEqual(rows(db), rowsAfterFirst, 'the same rows, field for field');
  assert.deepEqual(
    db.writes.slice(writesBefore).filter((write) => write.path.startsWith('classroomLinks/') || write.path.startsWith('assignments/')),
    [],
    'no post, no publication and no assignment is touched',
  );
});

/* --- 3. the due date, across a class --------------------------------------- */

// Work written before the due date, through the trigger as it happened; then
// the class's due date (or, with `deadline: 'final'`, its final cutoff) passes
// and the scheduler's checkpoint runs. With `turnedIn: false` nobody turned the
// work in on Classroom, so Google refuses every return.
async function classAtItsDueDate({ deadline = 'due', turnedIn = true } = {}) {
  const students = { done: EVERYTHING_DONE, partial: PARTIAL, none: null };
  const db = classFixture({ students: Object.fromEntries(Object.keys(students).map((id) => [id, null])) });
  const googleFor = Object.fromEntries(Object.keys(students).map((id) => [id, fakeGoogle(turnedIn
    ? { states: { 'cw-warmup': 'TURNED_IN', 'cw-classwork': 'TURNED_IN' } }
    : { refuse: returnsOnlyTurnedInWork })]));
  for (const [id, work] of Object.entries(students)) {
    if (!work) continue;
    // eslint-disable-next-line no-await-in-loop
    await writeGrades({ db, google: googleFor[id], studentId: id, change: (grades) => ({ ...grades, gradesByAssignment: { A1: structuredClone(work) } }) });
  }
  // The completed sections went out final (and returned, if Google would) when they were done.
  for (const key of SECTIONS) {
    assert.equal(row(db, 'done', key).stage, 'final-complete');
    assert.equal(row(db, 'done', key).status, turnedIn ? 'synced' : 'graded-not-returned');
    assert.equal(row(db, 'done', key).returnedToStudent, turnedIn);
  }
  db.store.set('assignments/A1', {
    ...db.data('assignments/A1'),
    ...(deadline === 'final' ? { dueAt: iso(-2 * DAY), lateDueAt: iso(-60_000) } : { dueAt: iso(-60_000) }),
  });
  const before = {
    rows: rows(db),
    trackers: Object.fromEntries(Object.keys(students).map((id) => [id, structuredClone(db.data(`grades/${id}`).gradesByAssignment)])),
  };
  Object.values(googleFor).forEach((google) => { google.calls.length = 0; });
  await dueDateScheduler(db);
  const released = await releaseQueue({ db, googleFor });
  return { db, googleFor, before, released };
}

test('the due-date checkpoint gives every student their own grade and leaves completed sections as they were', async () => {
  const { db, googleFor, before, released } = await classAtItsDueDate();
  assert.deepEqual(released.sort(), ['due-checkpoint done', 'due-checkpoint none', 'due-checkpoint partial'], 'the whole class, work or not');

  // The completed sections: the same grade, still returned, nothing recorded
  // differently about the work, and nothing returned again.
  for (const key of SECTIONS) {
    const now = row(db, 'done', key);
    const was = before.rows[`classroomGradeSyncs/${gradeSyncDocumentId(`pub-${key}`, 'done')}`];
    assert.equal(now.grade, was.grade, `done ${key}: the same grade`);
    assert.equal(now.classroomGrade, was.classroomGrade);
    assert.equal(now.returnedToStudent, true, `done ${key}: still returned`);
    assert.equal(googleFor.done.states[`cw-${key}`], 'RETURNED');
  }
  assert.equal(googleFor.done.calls.filter((call) => call.step === 'return').length, 0);
  for (const patch of googleFor.done.calls.filter((call) => call.step === 'patch')) {
    assert.deepEqual(patch.body, { draftGrade: points(100), assignedGrade: points(100) }, 'any grade sent again is the one it has');
  }

  // Partial work: its real grade, assigned at the due date. Never a zero for
  // the Classwork it earned half of.
  assert.deepEqual(patchesOn(googleFor.partial, 'warmup'), [{ draftGrade: 0, assignedGrade: 0 }]);
  assert.deepEqual(patchesOn(googleFor.partial, 'classwork'), [{ draftGrade: points(50), assignedGrade: points(50) }]);
  for (const key of SECTIONS) {
    assert.equal(row(db, 'partial', key).grade, mathMasterGrade(db, 'partial', key), `partial ${key}: what MathMaster shows`);
    assert.equal(row(db, 'partial', key).stage, 'due-checkpoint');
  }

  // No work at all: the row says so, nothing attempted and nothing earned.
  // (Whether that column should then hold a returned 0 or stay Missing until
  // the final cutoff is a policy question; MathMaster's own screens show it as
  // missing. Only the honest row is asserted.)
  for (const key of SECTIONS) {
    const none = row(db, 'none', key);
    assert.deepEqual([none.grade, none.attempted], [0, 0], `none ${key}`);
    assert.equal(mathMasterGrade(db, 'none', key), null, `none ${key}: MathMaster shows no grade`);
  }

  // Nobody's work changed: the checkpoint writes grades to Classroom, never to MathMaster.
  for (const [id, tracker] of Object.entries(before.trackers)) {
    assert.deepEqual(db.data(`grades/${id}`).gradesByAssignment, tracker, `${id}: the saved work is untouched`);
  }
});

// A completed section's column is final the moment it is finished
// (lib/classroomGradeRuntime.js, resolveClassroomGradeStage). A class-wide
// wake-up used to relabel it "due-checkpoint" (isFinal false) or
// "final-deadline", and the new label made the column look changed, so it was
// sent again: a list and a patch for every finished column at each wake-up,
// and the monitor and the receipt lost "FINAL" at the due date (#545).
test('a completed section stays FINAL at the due-date checkpoint and is not sent again', async () => {
  const { db, googleFor } = await classAtItsDueDate();
  const sent = steps(googleFor.done);
  // The teacher's grade monitor and the student's receipt read stage and
  // isFinal; Google already holds this grade, assigned and returned.
  assert.deepEqual(
    Object.fromEntries(SECTIONS.map((key) => [key, { stage: row(db, 'done', key).stage, isFinal: row(db, 'done', key).isFinal, sentAgain: sent[key] }])),
    Object.fromEntries(SECTIONS.map((key) => [key, { stage: 'final-complete', isFinal: true, sentAgain: [] }])),
  );
});

test('at the final-deadline wake-up a completed section stays FINAL and is not sent again, and unfinished work is made final', async () => {
  const { db, googleFor, released } = await classAtItsDueDate({ deadline: 'final' });
  assert.deepEqual(released.sort(), ['final-deadline done', 'final-deadline none', 'final-deadline partial'], 'the whole class, work or not');
  const sent = steps(googleFor.done);
  assert.deepEqual(
    Object.fromEntries(SECTIONS.map((key) => [key, { stage: row(db, 'done', key).stage, isFinal: row(db, 'done', key).isFinal, sentAgain: sent[key] }])),
    Object.fromEntries(SECTIONS.map((key) => [key, { stage: 'final-complete', isFinal: true, sentAgain: [] }])),
  );
  // Work the student did not finish is final now: assigned and returned.
  assert.deepEqual(steps(googleFor.partial), { warmup: ['list', 'patch', 'return'], classwork: ['list', 'patch', 'return'] });
  for (const key of SECTIONS) {
    assert.deepEqual([row(db, 'partial', key).stage, row(db, 'partial', key).isFinal, row(db, 'partial', key).returnedToStudent], ['final-deadline', true, true], `partial ${key}`);
  }
});

test('a completed section Classroom would not return is not sent again at the class\'s wake-ups either', async () => {
  // Nobody turned the work in on Classroom, so Google refused the return when
  // the section was finished. The column already holds the grade; as on any
  // other write that leaves it alone, a wake-up does not send it again. A new
  // grade, or a teacher's Retry, asks for the return again
  // (tests/platform/classroomReturnRefusal.test.mjs).
  for (const deadline of ['due', 'final']) {
    // eslint-disable-next-line no-await-in-loop
    const { db, googleFor } = await classAtItsDueDate({ deadline, turnedIn: false });
    assert.deepEqual(steps(googleFor.done), { warmup: [], classwork: [] }, `${deadline}: nothing sent for the finished columns`);
    for (const key of SECTIONS) {
      assert.deepEqual([row(db, 'done', key).status, row(db, 'done', key).stage], ['graded-not-returned', 'final-complete'], `${deadline} ${key}`);
    }
  }
});
