// WHAT A "RECONCILE SECTION GRADES" RUN DID: THE PURE RULES (issue #545, R1).
//
// The run's id and the caller ride from the reconcile callable through the
// push queue, its release signal and the requeue after Google's limit; the
// section trigger writes each student's column counts to the run's document,
// and the monitor shows them as one line. This file pins the rules with no
// Firestore: what a signal's scope is, which posts it covers, what a queue
// entry and its signal carry, how the counts add up, the line the teacher
// reads, and the rule that no work at the due date is Missing, not a returned
// 0. The whole path, on the emulators, with real sign-in tokens:
// tests/integration/callableBoundaries/classroomReconcileRuns.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileRunForAssignment, reconcileRunSummaryText } from '../../src/classroomGradeSyncUi.js';
import { readFileSync } from 'node:fs';

import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const runs = requireFromFunctions('./lib/classroomReconcileRuns.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');
const runtime = requireFromFunctions('./lib/classroomMissingWork.js');
const reconciliation = requireFromFunctions('./lib/classroomSectionGradeReconciliation.js');
const { gradeSyncStatusLabel, gradeSyncErrorText, isGradeSyncRetryEligible } = await import('../../src/classroomGradeSyncUi.js');

test('only a teacher\'s reconcile signal has a scope, and the scope is that teacher', () => {
  const signal = { reason: 'section-grade-reconcile', runId: 'run-1', scopeTeacherUid: 'teacher-a' };
  assert.deepEqual(runs.reconcileScopeOfSignal(signal), { teacherUid: 'teacher-a', runId: 'run-1' });
  // A content upgrade or question repair sends the same reason with no caller: every column, as before.
  assert.equal(runs.reconcileScopeOfSignal({ reason: 'section-grade-reconcile', source: 'teacher-question-repair' }), null);
  // A Retry is never scoped, whatever rides on it.
  assert.equal(runs.reconcileScopeOfSignal({ reason: 'manual-retry', scopeTeacherUid: 'teacher-a' }), null);
  assert.equal(runs.reconcileScopeOfSignal('legacy-string-signal'), null);
  assert.equal(runs.reconcileScopeOfSignal(null), null);
});

test('a scoped signal covers the caller\'s posts and no one else\'s; an unscoped one covers every post', () => {
  const scope = { teacherUid: 'teacher-a', runId: 'run-1' };
  assert.equal(runs.publicationInReconcileScope(scope, { teacherUid: 'teacher-a' }), true);
  assert.equal(runs.publicationInReconcileScope(scope, { teacherUid: 'teacher-b' }), false);
  // A post that records no teacher is not the caller's.
  assert.equal(runs.publicationInReconcileScope(scope, {}), false);
  assert.equal(runs.publicationInReconcileScope(null, { teacherUid: 'teacher-b' }), true);
  assert.equal(runs.publicationInReconcileScope(null, {}), true);
});

test('a run\'s queue entry has its own id, and every other push keeps the id it always had', () => {
  assert.equal(queue.queueEntryId('a1', 's1', 'manual-retry'), 'a1__s1__manual-retry');
  assert.equal(queue.queueEntryId('a1', 's1', 'section-grade-reconcile', ''), 'a1__s1__section-grade-reconcile');
  const mine = queue.queueEntryId('a1', 's1', 'section-grade-reconcile', 'teacher-a');
  const theirs = queue.queueEntryId('a1', 's1', 'section-grade-reconcile', 'teacher-b');
  assert.notEqual(mine, theirs, 'two teachers\' runs for one student do not replace each other');
});

test('the release signal carries the run and the caller, and nothing extra for any other push', () => {
  const released = queue.releaseSignalFor({
    reason: 'section-grade-reconcile', requestedAt: '2026-11-20T10:00:00.000Z', quotaRetry: 2, runId: 'run-1', scopeTeacherUid: 'teacher-a',
  }, '2026-11-20T10:01:00.000Z');
  assert.deepEqual(released, {
    requestedAt: '2026-11-20T10:01:00.000Z', reason: 'section-grade-reconcile', source: 'classroom-push-queue',
    firstRequestedAt: '2026-11-20T10:00:00.000Z', quotaRetry: 2, scopeTeacherUid: 'teacher-a', runId: 'run-1',
  });
  // The signal a checkpoint or a Retry has always written, field for field.
  assert.deepEqual(queue.releaseSignalFor({ reason: 'final-deadline', requestedAt: 'then' }, 'now'), {
    requestedAt: 'now', reason: 'final-deadline', source: 'classroom-push-queue', firstRequestedAt: 'then',
  });
  // A run id with no caller is not a run: it would scope nothing.
  assert.equal('runId' in queue.releaseSignalFor({ reason: 'manual-retry', runId: 'run-1' }, 'now'), false);
});

test('a student\'s counts are tallied by column, and an unknown outcome is refused', () => {
  const tally = runs.reconcileTally();
  tally.count('repaired');
  tally.count('repaired');
  tally.count('notSent');
  assert.deepEqual(tally.counts, { repaired: 2, upToDate: 0, notSent: 1, failed: 0, waiting: 0 });
  assert.throws(() => tally.count('skipped'), /Unknown reconcile outcome/);
});

test('the monitor\'s summary adds up the current run\'s students and ignores a replaced run\'s late writes', () => {
  const summary = runs.summarizeReconcileRun({
    runId: 'run-2', assignmentId: 'a1', teacherUid: 'teacher-a', requestedAt: '2026-11-20T10:00:00.000Z', queuedStudents: 4, publications: 2,
    results: {
      'run-2': {
        k1: { repaired: 2, upToDate: 0, notSent: 0, failed: 0, waiting: 0 },
        k2: { repaired: 0, upToDate: 1, notSent: 1, failed: 0, waiting: 0 },
        k3: { repaired: 0, upToDate: 0, notSent: 0, failed: 1, waiting: 1 },
      },
      // A push of the run this one replaced, written after it.
      'run-1': { k9: { repaired: 5, upToDate: 5, notSent: 5, failed: 5, waiting: 5 } },
    },
  }, { nowMs: Date.parse('2026-11-20T10:05:00.000Z') });
  assert.deepEqual(summary, {
    assignmentId: 'a1', runId: 'run-2', requestedAt: '2026-11-20T10:00:00.000Z', publications: 2,
    queuedStudents: 4, reportedStudents: 3, pendingStudents: 1, unreportedStudents: 0,
    repaired: 2, upToDate: 1, notSent: 1, failed: 1, waiting: 1,
  });
  // The teacher's uid and the per-student entries stay on the server.
  assert.equal('teacherUid' in summary, false);
  assert.equal('results' in summary, false);
});

test('a run names no student: each entry is keyed by a digest of the run and the student', () => {
  const key = runs.reconcileStudentKey('run-1', 'student-12345');
  assert.match(key, /^[0-9a-f]{20}$/);
  assert.equal(key, runs.reconcileStudentKey('run-1', 'student-12345'), 'the same student in the same run is one entry');
  assert.notEqual(key, runs.reconcileStudentKey('run-2', 'student-12345'));
  assert.notEqual(key, runs.reconcileStudentKey('run-1', 'student-12346'));
});

test('the monitor\'s line reads as the owner asked, and says what is still to come', () => {
  const run = { runId: 'run-1', assignmentId: 'a1', repaired: 12, upToDate: 40, notSent: 3, failed: 2, waiting: 0, pendingStudents: 0 };
  assert.equal(reconcileRunSummaryText(run), 'Last reconcile: 12 repaired, 40 already up to date, 3 not sent, 2 failed');
  assert.equal(
    reconcileRunSummaryText({ ...run, waiting: 4, pendingStudents: 1 }),
    'Last reconcile: 12 repaired, 40 already up to date, 3 not sent, 2 failed (4 waiting for Google\'s limit; 1 student still in the queue)',
  );
  assert.equal(reconcileRunSummaryText(null), null);
  assert.equal(reconcileRunSummaryText({ assignmentId: 'a1' }), null, 'no run id, no line');
  assert.equal(reconcileRunForAssignment([run, { runId: 'run-9', assignmentId: 'a2' }], 'a2').runId, 'run-9');
  assert.equal(reconcileRunForAssignment([run], 'a3'), null);
  assert.equal(reconcileRunForAssignment(undefined, 'a1'), null);
});

test('no work between the due date and the final cutoff is Missing, not a 0 to send', () => {
  const none = { attempted: 0, total: 4, grade: 0 };
  assert.equal(runtime.noWorkIsMissingNotZero({ stage: 'due-checkpoint', progress: none }), true);
  assert.equal(runtime.noWorkIsMissingNotZero({ stage: 'manual-retry', progress: none }), true);
  // The final cutoff still sends what the student earned, a 0 included.
  assert.equal(runtime.noWorkIsMissingNotZero({ stage: 'final-deadline', progress: none }), false);
  // Any work at all is a grade.
  assert.equal(runtime.noWorkIsMissingNotZero({ stage: 'due-checkpoint', progress: { attempted: 1, total: 4, grade: 0 } }), false);
  // A released assessment is the teacher's decision to show the result.
  assert.equal(runtime.noWorkIsMissingNotZero({ stage: 'assessment-release', progress: none }), false);
});

test('for a reconcile a column is current when Classroom holds the same grade, whatever the last push was called', () => {
  const prior = {
    status: 'synced', stage: 'progress-50', reconciliationVersion: reconciliation.CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
    grade: 50, classroomGrade: 25, maxPoints: 50, studentVisible: false, returnedToStudent: false, courseworkId: 'cw-1',
  };
  const now = { grade: 50, classroomGrade: 25, maxPoints: 50, studentVisible: false, returnedToStudent: false, shouldReturn: false, courseworkId: 'cw-1' };
  const held = (priorPatch = {}, nowPatch = {}) => reconciliation.sectionGradeHeldByClassroom({ prior: { ...prior, ...priorPatch }, ...now, ...nowPatch });
  assert.equal(held(), true);
  assert.equal(held({ stage: 'late-progress-50' }), true, 'the stage label is not part of it');
  // Anything Classroom would show differently is a repair.
  assert.equal(held({}, { grade: 75, classroomGrade: 37.5 }), false, 'another grade');
  assert.equal(held({}, { maxPoints: 100, classroomGrade: 50 }), false, 'another maximum');
  assert.equal(held({}, { studentVisible: true, shouldReturn: true }), false, 'now visible to the student');
  assert.equal(held({ studentVisible: true }, { studentVisible: true, shouldReturn: true }), false, 'due back, and not returned');
  assert.equal(held({ studentVisible: true, returnedToStudent: true }, { studentVisible: true, shouldReturn: true, returnedToStudent: true }), true);
  // A refused return is asked again only by a Retry.
  assert.equal(held({ status: 'graded-not-returned', studentVisible: true }, { studentVisible: true, shouldReturn: true }), true);
  // A row that does not say Classroom holds a grade is never current.
  for (const status of ['failed', 'rate-limited', 'skipped-unlinked', 'skipped-no-work', 'recovery-held', undefined]) {
    assert.equal(held({ status }), false, String(status));
  }
  assert.equal(held({ grade: null }), false, 'no number was sent');
  // A row about an older post (the assignment was reposted) says nothing about this one.
  assert.equal(held({}, { courseworkId: 'cw-2' }), false, 'another post');
  assert.equal(held({ courseworkId: undefined }), false, 'a row that names no post');
  assert.equal(held({}, { courseworkId: null }), false);
  assert.equal(held({ reconciliationVersion: 0 }), false, 'a row from before the audit contract');
  assert.equal(reconciliation.sectionGradeHeldByClassroom(), false);
});

test('a grade already assigned and returned is held when a reconcile would only send it as a draft (a student on extended time)', () => {
  // The column went out at the due-date checkpoint: visible to the student, returned.
  const HOUR = 3_600_000;
  const due = Date.parse('2026-11-10T15:00:00.000Z');
  const assignment = { dueAt: new Date(due).toISOString(), lateDueAt: new Date(due + 24 * HOUR).toISOString() };
  const gradeRuntime = requireFromFunctions('./lib/classroomGradeRuntime.js');
  const ownCutoff = due + 72 * HOUR;
  const now = due + 30 * HOUR; // past the class's final cutoff, inside the student's own
  const atCheckpoint = gradeRuntime.classroomGradeReleasePolicy({ stage: 'due-checkpoint', assignment, nowValue: due + HOUR, studentFinalCutoff: ownCutoff });
  assert.deepEqual([atCheckpoint.studentVisible, atCheckpoint.shouldReturn], [true, true]);
  // A reconcile's stage after the due date: held as a draft for this student.
  const atReconcile = gradeRuntime.classroomGradeReleasePolicy({ stage: 'manual-retry', assignment, nowValue: now, studentFinalCutoff: ownCutoff });
  assert.deepEqual([atReconcile.studentVisible, atReconcile.shouldReturn, atReconcile.heldUntilMs], [false, false, ownCutoff]);

  const prior = {
    status: 'synced', stage: 'due-checkpoint', reconciliationVersion: reconciliation.CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
    grade: 50, classroomGrade: 25, maxPoints: 50, studentVisible: true, returnedToStudent: true, courseworkId: 'cw-1',
  };
  const push = {
    grade: 50, classroomGrade: 25, maxPoints: 50, courseworkId: 'cw-1', returnedToStudent: true,
    studentVisible: atReconcile.studentVisible, shouldReturn: atReconcile.shouldReturn,
  };
  assert.equal(reconciliation.sectionGradeHeldByClassroom({ prior, ...push }), true, 'the draft would change nothing in Classroom');
  // The same grade, assigned but never returned: still nothing a draft would change.
  assert.equal(reconciliation.sectionGradeHeldByClassroom({ prior: { ...prior, status: 'graded-not-returned', returnedToStudent: false }, ...push, returnedToStudent: false }), true);
  // A different grade is still sent.
  assert.equal(reconciliation.sectionGradeHeldByClassroom({ prior, ...push, grade: 75, classroomGrade: 37.5 }), false);
  // The other direction is a repair: Classroom holds a draft, and the grade is now due back.
  assert.equal(reconciliation.sectionGradeHeldByClassroom({ prior: { ...prior, studentVisible: false, returnedToStudent: false }, ...push, studentVisible: true, shouldReturn: true, returnedToStudent: false }), false);
});

test('a student\'s counts are written again after contention, a deadline or a blip, and given up only after that', async () => {
  const fakeDb = (failures) => {
    const calls = [];
    return {
      calls,
      collection: () => ({ doc: (id) => ({ update: async (...args) => {
        calls.push([id, args[1]]);
        const failure = failures.shift();
        if (failure) throw Object.assign(new Error(failure.message || 'refused'), { code: failure.code });
      } }) }),
    };
  };
  const scope = { teacherUid: 'teacher-a', runId: 'run-1' };
  const record = (db, errors) => runs.recordReconcileStudent(db, {
    assignmentId: 'a1', scope, studentId: 's1', counts: { repaired: 1 }, wait: async () => {}, onError: (error) => errors.push(error.code),
  });
  // ABORTED (contention), then DEADLINE_EXCEEDED, then it goes through.
  let errors = [];
  let db = fakeDb([{ code: 10 }, { code: 4 }]);
  assert.equal(await record(db, errors), true);
  assert.equal(db.calls.length, 3);
  assert.deepEqual(db.calls[2][1], { repaired: 1, upToDate: 0, notSent: 0, failed: 0, waiting: 0 }, 'the same whole value each time');
  assert.deepEqual(errors, []);
  // Still unavailable after every attempt: logged once, and the push goes on.
  errors = [];
  db = fakeDb([{ code: 14 }, { code: 14 }, { code: 14 }, { code: 14 }]);
  assert.equal(await record(db, errors), false);
  assert.equal(db.calls.length, 4);
  assert.deepEqual(errors, [14]);
  // An error that will not pass is not retried.
  errors = [];
  db = fakeDb([{ code: 7 }]);
  assert.equal(await record(db, errors), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(errors, [7]);
  // The run's document is gone: nothing to write, and nothing to report.
  errors = [];
  db = fakeDb([{ code: 5 }]);
  assert.equal(await record(db, errors), false);
  assert.deepEqual([db.calls.length, errors], [1, []]);
  // No run on the signal: nothing is written.
  db = fakeDb([]);
  assert.equal(await runs.recordReconcileStudent(db, { assignmentId: 'a1', scope: { teacherUid: 'teacher-a', runId: null }, studentId: 's1', counts: {} }), false);
  assert.equal(db.calls.length, 0);
});

test('a student who never reports is waited for only so long, then said to be unknown', () => {
  const requestedAt = '2026-11-20T10:00:00.000Z';
  const run = { runId: 'run-1', assignmentId: 'a1', requestedAt, queuedStudents: 3, results: { 'run-1': { k1: { repaired: 1 } } } };
  const at = (ms) => runs.summarizeReconcileRun(run, { nowMs: Date.parse(requestedAt) + ms });
  assert.deepEqual([at(60_000).pendingStudents, at(60_000).unreportedStudents], [2, 0], 'still in the queue');
  const late = at(runs.RECONCILE_REPORT_TIMEOUT_MS + 1);
  assert.deepEqual([late.pendingStudents, late.unreportedStudents], [0, 2], 'longer than the queue ever holds a push');
  assert.equal(
    reconcileRunSummaryText(late),
    'Last reconcile: 1 repaired, 0 already up to date, 0 not sent, 0 failed (2 students did not report; check their rows)',
  );
});

test('a Retry on a student with no work answers on the row, and only on a row that does not say Classroom holds a grade', () => {
  const due = (prior, extra = {}) => runtime.noWorkRetryRowIsDue({ signalReason: 'manual-retry', priorExists: true, prior, ...extra });
  assert.equal(due({ status: 'failed' }), true);
  assert.equal(due({ status: 'rate-limited' }), true);
  // Something the teacher still has to fix, which the final cutoff's grade will fail on too.
  assert.equal(due({ status: 'skipped-unlinked' }), false, 'still "Link roster first"');
  assert.equal(due({ status: 'auth-error' }), false, 'still "reconnect Google Classroom"');
  // Classroom holds that grade (a 0 returned before this shipped, say): still true.
  assert.equal(due({ status: 'synced' }), false);
  assert.equal(due({ status: 'graded-not-returned' }), false);
  // No row, no new row: a due-date wake-up for a whole class writes nothing.
  assert.equal(due({}, { priorExists: false }), false);
  assert.equal(due({ status: 'failed' }, { signalReason: 'due-checkpoint' }), false);
  const row = runtime.noWorkRetryRow({ stage: 'manual-retry', progress: { attempted: 0, total: 4 }, clearedErrors: { error: 'cleared' } });
  assert.deepEqual(row, {
    error: 'cleared', status: 'skipped-no-work', stage: 'manual-retry', grade: null, attempted: 0, total: 4,
    isFinal: false, studentVisible: false, returnedToStudent: false, message: runtime.CLASSROOM_NO_WORK_MESSAGE,
  });
  // In the monitor: said plainly, with why, and no longer offered to "Retry all".
  assert.equal(gradeSyncStatusLabel(row), 'No work yet: Missing in Classroom');
  assert.equal(gradeSyncErrorText(row), runtime.CLASSROOM_NO_WORK_MESSAGE);
  assert.equal(isGradeSyncRetryEligible({ ...row, publicationId: 'p', assignmentId: 'a', studentId: 's' }), false);
});

test('both grade triggers keep to the caller\'s posts for a reconcile, and hold no work at the due date', () => {
  // The whole-assignment trigger is in the backend's domain modules; the
  // section trigger has always had its own entry file.
  const whole = functionsDeclaration('syncGradeToClassroom');
  const section = readFileSync(path.join(root, 'functions/classroomSectionEntry.js'), 'utf8');
  for (const [name, source, progress] of [['whole-assignment', whole, 'progress'], ['section', section, 'progress: gradeResult']]) {
    // The posts it sends to are filtered by the signal's scope.
    assert.match(source, /publicationInReconcileScope\(reconcileScope, /, name);
    // The due-date rule is applied to the stage it resolved.
    assert.ok(source.includes(`if (noWorkIsMissingNotZero({ stage, ${progress} }))`), name);
    // Only a Retry forces a send.
    assert.match(executableSource(source), /const forceRetry = [^;]*"manual-retry" && quotaRetry === 0;/, name);
    assert.doesNotMatch(executableSource(source), /forceRetry = [^;]*section-grade-reconcile/, name);
    // A requeue after Google's limit keeps the run and the caller.
    assert.match(source, /requeueClassroomPushAfterQuota\(db, \{[^}]*runId: releaseSignal\?\.runId,[^}]*scopeTeacherUid: releaseSignal\?\.scopeTeacherUid,/, name);
  }
  // The section trigger asks whether the student is in the course before it
  // asks for the teacher's Google client: an expired connection must not mark
  // another course's students "auth-error".
  const roster = section.indexOf('const rosterLinkId = rosterLinkDocumentId(courseId, event.params.studentId);');
  // (The last one: the publish callable also builds a client, far above.)
  const client = section.lastIndexOf('classroom = await classroomLib.getClassroomClient(teacherUid);');
  assert.ok(roster > 0 && client > roster, 'roster link first, then the client');
});
