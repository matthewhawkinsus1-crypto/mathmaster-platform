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
//      with partial work and one with none: each column with work gets that
//      student's own grade, a section with no work is sent nothing (Missing,
//      not a returned 0) until the final cutoff, and the completed sections
//      keep theirs, FINAL, and are not sent again, at the due date or at the
//      final cutoff.
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
  // (Its Warm-Up was answered, wrong: that is work, and its 0 is a grade.)
  assert.deepEqual(patchesOn(googleFor.partial, 'warmup'), [{ draftGrade: 0, assignedGrade: 0 }]);
  assert.deepEqual(patchesOn(googleFor.partial, 'classwork'), [{ draftGrade: points(50), assignedGrade: points(50) }]);
  for (const key of SECTIONS) {
    assert.equal(row(db, 'partial', key).grade, mathMasterGrade(db, 'partial', key), `partial ${key}: what MathMaster shows`);
    assert.equal(row(db, 'partial', key).stage, 'due-checkpoint');
  }

  // A section with no work at the due date is Missing, not a returned 0 (the
  // owner, 2026-11-19, #545): nothing is sent for it, so Classroom shows the
  // work as Missing, as MathMaster's own screens do. The final cutoff still
  // sends the 0 (the test below).
  for (const [id, key] of SECTIONS.map((section) => ['none', section])) {
    assert.deepEqual(steps(googleFor[id])[key], [], `${id} ${key}: Google is not asked`);
    assert.equal(row(db, id, key), undefined, `${id} ${key}: no row says a grade was sent`);
    assert.equal(mathMasterGrade(db, id, key), null, `${id} ${key}: MathMaster shows no grade`);
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
  // The final cutoff is where no work becomes a grade: the 0 is assigned and
  // returned, as before.
  assert.deepEqual(steps(googleFor.none), { warmup: ['list', 'patch', 'return'], classwork: ['list', 'patch', 'return'] });
  for (const key of SECTIONS) {
    assert.deepEqual(patchesOn(googleFor.none, key), [{ draftGrade: 0, assignedGrade: 0 }], `none ${key}`);
    assert.deepEqual([row(db, 'none', key).stage, row(db, 'none', key).grade, row(db, 'none', key).returnedToStudent], ['final-deadline', 0, true], `none ${key}`);
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

/* --- 4. Reconcile after an ordinary push: nothing to repair ---------------- */

// A reconcile resolves to the stage "manual-retry", and the stage is part of
// the evidence fingerprint. A column last sent by an ordinary push ("progress-50",
// "late-progress-50", "due-checkpoint") therefore never matched, and the first
// reconcile sent every unfinished column again with the same grade, over
// anything a teacher had typed in Classroom, and counted it as repaired
// (#545, option A). For a reconcile, "current" is the grade Classroom holds
// (lib/classroomSectionGradeReconciliation.js sectionGradeHeldByClassroom).
const reconcileRuns = requireFromFunctions('./lib/classroomReconcileRuns.js');
const lastRun = (db) => reconcileRuns.summarizeReconcileRun(db.data(`${reconcileRuns.CLASSROOM_RECONCILE_RUNS}/${reconcileRuns.reconcileRunDocumentId('A1', 't1')}`));
const runCounts = (db) => {
  const { repaired, upToDate, notSent, failed, waiting } = lastRun(db);
  return { repaired, upToDate, notSent, failed, waiting };
};

/** One student's unfinished work, pushed by the trigger as the student saved it; then a teacher's Reconcile. */
async function reconcileAfterOrdinaryPush({ assignment } = {}) {
  const db = classFixture({ assignment, students: { p: null } });
  const googleFor = { p: fakeGoogle({ states: { 'cw-warmup': 'TURNED_IN', 'cw-classwork': 'TURNED_IN' } }) };
  await writeGrades({ db, google: googleFor.p, studentId: 'p', change: (grades) => ({ ...grades, gradesByAssignment: { A1: structuredClone(PARTIAL) } }) });
  const before = rows(db);
  googleFor.p.calls.length = 0;
  await reconcile(db);
  assert.deepEqual(await releaseQueue({ db, googleFor }), ['section-grade-reconcile p']);
  return { db, google: googleFor.p, before };
}

test('Reconcile after an ordinary progress push makes no Classroom call and counts the columns already up to date', async () => {
  const { db, google, before } = await reconcileAfterOrdinaryPush();
  assert.deepEqual(Object.values(before).map((sent) => sent.stage).sort(), ['progress-100', 'progress-50'], 'the columns were sent as progress drafts');
  assert.deepEqual(google.calls, [], 'the same grades: Google is not asked');
  assert.deepEqual(rows(db), before, 'and the rows keep the stage they were sent with');
  assert.deepEqual(runCounts(db), { repaired: 0, upToDate: 2, notSent: 0, failed: 0, waiting: 0 });
});

test('Reconcile after a late-progress push makes no Classroom call and counts the columns already up to date', async () => {
  // Due a minute ago, late work open: the student's save went out as a late-progress grade, returned.
  const { db, google, before } = await reconcileAfterOrdinaryPush({ assignment: lesson({ dueAt: iso(-60_000) }) });
  assert.deepEqual(Object.values(before).map((sent) => [sent.stage, sent.returnedToStudent]).sort(), [['late-progress-100', true], ['late-progress-50', true]]);
  assert.deepEqual(google.calls, []);
  assert.deepEqual(rows(db), before);
  assert.deepEqual(runCounts(db), { repaired: 0, upToDate: 2, notSent: 0, failed: 0, waiting: 0 });
});

test('Reconcile after the due-date checkpoint makes no Classroom call and counts the columns already up to date', async () => {
  const { db, googleFor } = await classAtItsDueDate();
  assert.deepEqual(SECTIONS.map((key) => row(db, 'partial', key).stage), ['due-checkpoint', 'due-checkpoint']);
  const before = rows(db);
  Object.values(googleFor).forEach((google) => { google.calls.length = 0; });
  await reconcile(db);
  // The two students with saved work; the one with none has nothing to reconcile.
  assert.deepEqual((await releaseQueue({ db, googleFor })).sort(), ['section-grade-reconcile done', 'section-grade-reconcile partial']);
  assert.deepEqual(Object.values(googleFor).flatMap((google) => google.calls), []);
  assert.deepEqual(rows(db), before);
  assert.deepEqual(runCounts(db), { repaired: 0, upToDate: 4, notSent: 0, failed: 0, waiting: 0 });
});

test('Reconcile still repairs a column whose grade differs from what Classroom was sent', async () => {
  const { db, google } = await reconcileAfterOrdinaryPush();
  // The row says Classroom was sent 20%; the saved work is worth 50%.
  const stale = `classroomGradeSyncs/${gradeSyncDocumentId('pub-classwork', 'p')}`;
  db.store.set(stale, { ...db.data(stale), grade: 20, classroomGrade: points(20) });
  google.calls.length = 0;
  await reconcile(db);
  await releaseQueue({ db, googleFor: { p: google } });
  assert.deepEqual(steps(google), { warmup: [], classwork: ['list', 'patch'] });
  assert.deepEqual(patchesOn(google, 'classwork'), [{ draftGrade: points(50) }]);
  assert.deepEqual(runCounts(db), { repaired: 1, upToDate: 1, notSent: 0, failed: 0, waiting: 0 });
});

/* --- 5. an expired connection and a student of another course --------------- */

// The trigger asked for the teacher's Google client before it asked whether
// the student is in the course. With the caller's connection expired, every
// student of every other course was written "auth-error" on the caller's
// columns and counted as failed in the caller's run.
test('with the teacher\'s connection expired, a student who is not in the course is "not linked", not an auth error, and not a failure of the run', async () => {
  const db = classFixture({ students: { mine: PARTIAL, theirs: PARTIAL } });
  // `theirs` is in another class, and not on this course's roster.
  db.store.set('grades/theirs', { ...db.data('grades/theirs'), classId: 'class-2' });
  db.store.set('assignments/A1', { ...db.data('assignments/A1'), assignedClassIds: [CLASS_ID, 'class-2'] });
  for (const key of SECTIONS) db.store.set(`classroomLinks/pub-${key}`, { ...db.data(`classroomLinks/pub-${key}`), classId: CLASS_ID });
  db.store.delete(`classroomRosterLinks/${rosterLinkDocumentId(COURSE, 'theirs')}`);
  const classroomLib = requireFromFunctions('./lib/classroom.js');
  const connect = classroomLib.getClassroomClient;
  classroomLib.getClassroomClient = async () => { throw new Error('Google Classroom is not connected.'); };
  try {
    await reconcile(db);
    await releaseQueue({ db, googleFor: { mine: fakeGoogle(), theirs: fakeGoogle() } });
  } finally {
    classroomLib.getClassroomClient = connect;
  }
  assert.deepEqual(SECTIONS.map((key) => row(db, 'theirs', key).status), ['skipped-unlinked', 'skipped-unlinked']);
  // The caller's own student did fail, for the reason the teacher can fix.
  assert.deepEqual(SECTIONS.map((key) => row(db, 'mine', key).status), ['auth-error', 'auth-error']);
  assert.deepEqual(runCounts(db), { repaired: 0, upToDate: 0, notSent: 0, failed: 2, waiting: 0 });
});

/* --- 6. a grade already assigned, and a reconcile that would only draft it -- */

// At the due date the checkpoint assigns and returns the grade, extended time
// or not. A reconcile afterwards resolves to "manual-retry", which is held as
// a teacher's draft while the student's own extended time runs. The column
// then looked changed (visible before, a draft now): it was patched again as
// a draft, counted repaired, its row rewritten "TEACHER DRAFT", and the
// student's visible receipt swapped for a draft one. A draft cannot take an
// assigned grade back, so there is nothing to send.
test('Reconcile leaves a returned grade alone for a student on extended time, and their receipt stays visible', async () => {
  const overrides = await import('../../functions/shared/studentAssignmentOverrides.mjs');
  const { db, googleFor } = await classAtItsDueDate();
  // The partial student's own final cutoff is three weeks out, past the class's.
  db.store.set(`${overrides.STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION}/${overrides.studentAssignmentOverrideId('partial', 'A1')}`, {
    studentId: 'partial', assignmentId: 'A1', lateDueAt: iso(21 * DAY),
  });
  assert.deepEqual(
    SECTIONS.map((key) => [row(db, 'partial', key).stage, row(db, 'partial', key).studentVisible, row(db, 'partial', key).returnedToStudent]),
    [['due-checkpoint', true, true], ['due-checkpoint', true, true]],
  );
  const before = rows(db);
  const receiptBefore = structuredClone(db.data('grades/partial').classroomSectionSyncStatusByAssignment);
  assert.equal(receiptBefore.A1.classwork.studentVisible, true);
  Object.values(googleFor).forEach((google) => { google.calls.length = 0; });

  await reconcile(db);
  await releaseQueue({ db, googleFor });
  assert.deepEqual(googleFor.partial.calls, [], 'nothing is sent as a draft over the returned grade');
  assert.deepEqual(rows(db), before, 'the rows still say released to the student');
  assert.deepEqual(db.data('grades/partial').classroomSectionSyncStatusByAssignment, receiptBefore, 'and the student\'s receipt is the one they could see');
  assert.deepEqual(runCounts(db), { repaired: 0, upToDate: 4, notSent: 0, failed: 0, waiting: 0 });
});

/* --- 7. a row about an older post ------------------------------------------- */

test('Reconcile sends the grade to a column that was reposted since the row was written', async () => {
  const { db, google } = await reconcileAfterOrdinaryPush();
  // The Classwork column was posted again: a new Classroom post, the same publication.
  db.store.set('classroomLinks/pub-classwork', { ...db.data('classroomLinks/pub-classwork'), courseworkId: 'cw-classwork-reposted' });
  google.calls.length = 0;
  await reconcile(db);
  await releaseQueue({ db, googleFor: { p: google } });
  assert.deepEqual(google.calls.map((call) => [call.step, call.courseWorkId]), [['list', 'cw-classwork-reposted'], ['patch', 'cw-classwork-reposted']]);
  assert.equal(row(db, 'p', 'classwork').courseworkId, 'cw-classwork-reposted');
  assert.deepEqual(runCounts(db), { repaired: 1, upToDate: 1, notSent: 0, failed: 0, waiting: 0 });
});

/* --- 8. a Retry on a student with no work ----------------------------------- */

const retrySignal = (grades) => ({
  ...grades,
  classroomReleaseSignals: { ...grades.classroomReleaseSignals, A1: { requestedAt: new Date(Date.now() + (releases += 1)).toISOString(), reason: 'manual-retry' } },
});
const priorRow = (db, key, fields) => db.store.set(`classroomGradeSyncs/${gradeSyncDocumentId(`pub-${key}`, 'none')}`, {
  syncId: gradeSyncDocumentId(`pub-${key}`, 'none'), publicationId: `pub-${key}`, studentId: 'none', assignmentId: 'A1', courseworkId: `cw-${key}`, ...fields,
});

test('a Retry on a no-work student after the due date answers on a failed row, and leaves a row that names what the teacher must fix', async () => {
  // Due a minute ago, late work open; the student opened the lesson and answered nothing.
  const db = classFixture({ assignment: lesson({ dueAt: iso(-60_000) }), students: { none: {} } });
  const google = fakeGoogle();
  priorRow(db, 'warmup', { status: 'failed', stage: 'due-checkpoint', grade: 0, error: 'Google Classroom did not answer.', errorStatus: 'UNAVAILABLE' });
  priorRow(db, 'classwork', { status: 'skipped-unlinked', stage: 'due-checkpoint', grade: 0, message: 'Student is not linked to this Classroom course.' });
  const unlinkedBefore = structuredClone(row(db, 'none', 'classwork'));

  await writeGrades({ db, google, studentId: 'none', change: retrySignal });
  assert.deepEqual(google.calls, [], 'no 0 is sent');
  const answered = row(db, 'none', 'warmup');
  assert.deepEqual([answered.status, answered.grade, answered.error, answered.errorStatus], ['skipped-no-work', null, undefined, undefined]);
  assert.match(answered.message, /^No work yet, so nothing was sent/);
  // "Link roster first" is still true, and the final cutoff's grade would fail on it too.
  assert.deepEqual(row(db, 'none', 'classwork'), unlinkedBefore);
});

test('a correction sync\'s Retry on a no-work student leaves a row that carries the correction\'s event', async () => {
  const db = classFixture({ assignment: lesson({ dueAt: iso(-60_000) }), students: { none: {} } });
  db.store.set('grades/none', { ...db.data('grades/none'), profile: { workloadCorrections: { A1: { eventId: 'correction-1' } } } });
  priorRow(db, 'warmup', { status: 'failed', stage: 'due-checkpoint', grade: 0 });
  // The correction's sync authorization is certified with its own suite; here
  // it is taken as given, so the row this trigger writes is what is tested.
  const corrections = requireFromFunctions('./lib/retroactiveAccommodation.js');
  const real = { allowed: corrections.correctionSyncAllowed, waiver: corrections.readPracticeWaiver };
  corrections.correctionSyncAllowed = async () => true;
  corrections.readPracticeWaiver = async () => [];
  try {
    await writeGrades({ db, google: fakeGoogle(), studentId: 'none', change: retrySignal });
  } finally {
    corrections.correctionSyncAllowed = real.allowed;
    corrections.readPracticeWaiver = real.waiver;
  }
  const answered = row(db, 'none', 'warmup');
  assert.equal(answered.status, 'skipped-no-work');
  assert.equal(answered.correctionEventId, 'correction-1', 'the correction history finds this row');
});
