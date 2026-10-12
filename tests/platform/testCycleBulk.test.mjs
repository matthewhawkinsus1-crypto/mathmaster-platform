/*
 * A CLASS-WIDE OPERATION'S ACCOUNT OF ITSELF.
 *
 * The pure half of runTestCycleBulkAction (functions/shared/testCycleBulk.mjs):
 * what an operation is, which students it has not reached, and the one place
 * its headline is written. The rule under test is the last one: a teacher is
 * told "finished" only when nobody failed and nobody is left.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BULK_ACTION, BULK_MAX_TARGETS, BULK_OUTCOME, BULK_STATUS,
  bulkCounts, bulkOperationView, bulkStatus, newBulkOperation, normalizeBulkOperationId, normalizeBulkTargets,
  pendingBulkTargets, summarizeBulkOperation, withBulkResult,
} from '../../functions/shared/testCycleBulk.mjs';

const operation = (targetStudentIds, action = BULK_ACTION.WAIVE_REVIEW) => newBulkOperation({
  operationId: 'op-12345678', assignmentId: 'a1', action, targetStudentIds, scope: { kind: 'all' }, requestedBy: 'teacher@example.org', now: 1000,
});
const apply = (start, outcomes) => Object.entries(outcomes).reduce(
  (current, [studentId, outcome], index) => withBulkResult(current, studentId, typeof outcome === 'string' ? { outcome } : outcome, 2000 + index),
  start,
);

test('an operation is named by the browser, records who asked, and starts with everyone pending', () => {
  const created = operation(['s2', 's1', ' s1 ', '', 's3']);
  assert.deepEqual(created.targetStudentIds, ['s2', 's1', 's3'], 'each student once');
  assert.deepEqual([created.status, created.requestedBy, created.createdAt, created.completedAt], [BULK_STATUS.RUNNING, 'teacher@example.org', 1000, null]);
  assert.deepEqual(pendingBulkTargets(created), ['s2', 's1', 's3']);
  assert.deepEqual(bulkCounts(created), { total: 3, succeeded: 0, alreadyComplete: 0, notEligible: 0, failed: 0, pending: 3 });
  // The id is the idempotency key, so it has to be one we can store.
  for (const bad of ['', 'short', 'has spaces in it', 'a/b/c/d/e/f', 'x'.repeat(81), null]) assert.equal(normalizeBulkOperationId(bad), null);
  assert.equal(normalizeBulkOperationId('  waive-2026_10_12-abc  '), 'waive-2026_10_12-abc');
  assert.throws(() => newBulkOperation({ operationId: 'nope', assignmentId: 'a1', action: BULK_ACTION.WAIVE_REVIEW }), /needs an id/);
  assert.throws(() => newBulkOperation({ operationId: 'op-12345678', assignmentId: 'a1', action: 'deleteEverything' }), /supported class-wide action/);
  assert.equal(normalizeBulkTargets(Array.from({ length: BULK_MAX_TARGETS + 50 }, (_, index) => `s${index}`)).length, BULK_MAX_TARGETS);
});

test('each student gets one outcome; a student who has one is never revisited', () => {
  let current = withBulkResult(operation(['s1', 's2']), 's1', { outcome: BULK_OUTCOME.SUCCEEDED }, 2000);
  assert.deepEqual(pendingBulkTargets(current), ['s2']);
  assert.equal(current.status, BULK_STATUS.RUNNING);
  // A duplicate request reaching the same student must not rewrite history.
  const again = withBulkResult(current, 's1', { outcome: BULK_OUTCOME.FAILED, detail: 'late duplicate' }, 3000);
  assert.equal(again, current);
  assert.equal(again.results.s1.outcome, BULK_OUTCOME.SUCCEEDED);
  // An outcome that is not one of the four is not recorded at all.
  assert.equal(withBulkResult(current, 's2', { outcome: 'probably' }, 3000), current);
  current = withBulkResult(current, 's2', { outcome: BULK_OUTCOME.ALREADY_COMPLETE, detail: 'Review was already waived.' }, 4000);
  assert.deepEqual([current.status, current.completedAt, current.updatedAt], [BULK_STATUS.COMPLETED, 4000, 4000]);
  assert.deepEqual(pendingBulkTargets(current), []);
});

test('finished cleanly is the only thing called a success', () => {
  const clean = summarizeBulkOperation(apply(operation(['s1', 's2', 's3']), { s1: 'succeeded', s2: 'succeeded', s3: 'alreadyComplete' }));
  assert.deepEqual([clean.status, clean.tone, clean.finished], [BULK_STATUS.COMPLETED, 'success', true]);
  assert.equal(clean.headline, 'Waive Review finished for 3 students: 2 succeeded, 1 already complete, 0 failed.');
  assert.deepEqual(clean.failures, []);

  const one = summarizeBulkOperation(apply(operation(['s1'], BULK_ACTION.OPEN_TEST_SESSIONS), { s1: 'succeeded' }));
  assert.equal(one.headline, 'Open Test sessions finished for 1 student: 1 succeeded, 0 failed.');
  // Nobody to change is not a failure, and is not dressed up as work done.
  const empty = summarizeBulkOperation(operation([]));
  assert.deepEqual([empty.status, empty.tone, empty.headline], [BULK_STATUS.COMPLETED, 'success', 'Waive Review: no students to change.']);
});

test('one failure among thirty is reported as a failure, with that student\'s reason', () => {
  const ids = Array.from({ length: 30 }, (_, index) => `s${index + 1}`);
  const outcomes = Object.fromEntries(ids.map((studentId) => [studentId, 'succeeded']));
  outcomes.s7 = { outcome: BULK_OUTCOME.FAILED, detail: 'The secure Test plan for s7 could not be completed from approved families.' };
  outcomes.s9 = { outcome: BULK_OUTCOME.NOT_ELIGIBLE, detail: 'This student is inactive.' };
  const partial = summarizeBulkOperation(apply(operation(ids, BULK_ACTION.OPEN_TEST_SESSIONS), outcomes));
  assert.deepEqual([partial.status, partial.tone, partial.finished], [BULK_STATUS.COMPLETED_WITH_FAILURES, 'error', true]);
  assert.equal(partial.headline, 'Open Test sessions did not finish for everyone: 28 succeeded, 1 not eligible, 1 failed, of 30 students.');
  assert.doesNotMatch(partial.headline, /finished for/);
  assert.deepEqual(partial.failures, [{ studentId: 's7', detail: 'The secure Test plan for s7 could not be completed from approved families.' }]);
  assert.deepEqual(partial.notEligible, [{ studentId: 's9', detail: 'This student is inactive.' }]);
  assert.deepEqual(partial.counts, { total: 30, succeeded: 28, alreadyComplete: 0, notEligible: 1, failed: 1, pending: 0 });
  // A failure with no reason still says something a teacher can act on.
  assert.equal(summarizeBulkOperation(apply(operation(['s1']), { s1: 'failed' })).failures[0].detail, 'It did not go through.');
});

test('an operation that is not finished says how far it got, and never that it is done', () => {
  const partway = apply(operation(['s1', 's2', 's3', 's4']), { s1: 'succeeded', s2: 'alreadyComplete' });
  const progress = summarizeBulkOperation(partway);
  assert.deepEqual([progress.status, progress.tone, progress.finished], [BULK_STATUS.RUNNING, 'progress', false]);
  assert.equal(progress.headline, 'Waive Review: 2 of 4 students done so far (1 succeeded, 1 already complete, 0 failed). 2 still to do.');
  // A failure already recorded shows while the rest are still running.
  assert.equal(summarizeBulkOperation(apply(partway, { s3: 'failed' })).tone, 'error');
  assert.equal(bulkStatus(apply(partway, { s3: 'failed' })), BULK_STATUS.RUNNING);
});

test('the browser is sent every student\'s outcome in the operation\'s own order', () => {
  const view = bulkOperationView(apply(operation(['s3', 's1', 's2']), { s1: { outcome: 'failed', detail: 'No.' }, s3: 'succeeded' }));
  assert.deepEqual(view.results, [
    { studentId: 's3', outcome: 'succeeded', detail: null },
    { studentId: 's1', outcome: 'failed', detail: 'No.' },
    { studentId: 's2', outcome: 'pending', detail: null },
  ]);
  assert.deepEqual([view.operationId, view.assignmentId, view.action, view.actionLabel, view.requestedBy], ['op-12345678', 'a1', 'waiveReview', 'Waive Review', 'teacher@example.org']);
  assert.equal(view.status, BULK_STATUS.RUNNING);
  // Stored junk (a hand-edited document, an older shape) is read safely.
  const odd = bulkOperationView({ operationId: 'op-12345678', action: 'waiveReview', targetStudentIds: ['s1', null, 's1'], results: { s1: 'yes', s9: { outcome: 'succeeded' } } });
  assert.deepEqual(odd.results, [{ studentId: 's1', outcome: 'pending', detail: null }]);
  assert.deepEqual(odd.counts, { total: 1, succeeded: 0, alreadyComplete: 0, notEligible: 0, failed: 0, pending: 1 });
});
