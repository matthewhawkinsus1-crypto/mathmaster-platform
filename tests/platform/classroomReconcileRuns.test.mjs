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
  });
  assert.deepEqual(summary, {
    assignmentId: 'a1', runId: 'run-2', requestedAt: '2026-11-20T10:00:00.000Z', publications: 2,
    queuedStudents: 4, reportedStudents: 3, pendingStudents: 1,
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
});
