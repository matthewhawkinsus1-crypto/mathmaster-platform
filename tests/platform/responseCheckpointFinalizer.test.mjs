import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { buildResponseCheckpointAction, enqueueResponseCheckpoint } from '../../src/platform/performance/responseCheckpoint.js';
import { createMemoryOutboxStorage, listDurableActions } from '../../src/platform/performance/durableActionOutbox.js';

const require = createRequire(import.meta.url);
const { decideCheckpointFinalization, authoritativeCheckpointClose } = require('../../functions/lib/responseCheckpointFinalizer.js');
const cutoff = Date.parse('2026-09-14T15:00:00Z');
const checkpoint = (patch = {}) => ({
  status: 'active', isComplete: true, response: { responseKey: 'answer-7' }, activityRole: 'warmup',
  capturedAt: new Date(cutoff - 1000), serverAcknowledgedAt: new Date(cutoff - 1000),
  candidateFinalizeAt: new Date(cutoff), revision: 4,
  submissionEnvelope: { previousTotalAttempts: 0, record: { totalAttempts: 1 } }, ...patch,
});

test('a complete server-acknowledged response finalizes without a mounted assignment player', () => {
  assert.deepEqual(decideCheckpointFinalization({ checkpoint: checkpoint(), assignment: {}, gradeRecord: {}, now: cutoff }),
    { action: 'finalize', cutoff, reason: 'warmup-close' });
});

test('blank and incomplete work is retained but never promoted to an attempt', () => {
  assert.equal(decideCheckpointFinalization({ checkpoint: checkpoint({ isComplete: false }), assignment: {}, now: cutoff }).status, 'incomplete-at-close');
  assert.equal(decideCheckpointFinalization({ checkpoint: checkpoint({ response: { responseKey: '' } }), assignment: {}, now: cutoff }).action, 'close');
});

test('an untrusted response acknowledged after close is recoverable but cannot change a grade', () => {
  const result = decideCheckpointFinalization({ checkpoint: checkpoint({ serverAcknowledgedAt: new Date(cutoff + 1) }), assignment: {}, now: cutoff + 10 });
  assert.deepEqual(result, { action: 'close', status: 'recovered-after-close' });
});

test('manual submit and scheduler race resolves through the canonical attempt precondition', () => {
  const result = decideCheckpointFinalization({ checkpoint: checkpoint(), assignment: {}, gradeRecord: { totalAttempts: 1 }, now: cutoff });
  assert.equal(result.status, 'skipped-newer-submission');
});

test('stale checkpoints cannot roll a later manual or step submission backward', () => {
  assert.equal(decideCheckpointFinalization({ checkpoint: checkpoint({ submissionEnvelope: { previousTotalAttempts: 1 } }), assignment: {}, gradeRecord: { totalAttempts: 2 }, now: cutoff }).action, 'close');
});

test('teacher Warm-Up extension is re-read and reschedules the candidate', () => {
  const extended = cutoff + 300000;
  const cp = checkpoint({ finalizationContext: { classId: 'c1' } });
  const assignment = { warmup: { autoCloseByClassId: { c1: { closesAt: new Date(extended) } } } };
  assert.deepEqual(decideCheckpointFinalization({ checkpoint: cp, assignment, now: cutoff }), { action: 'reschedule', finalizeAt: extended });
});

test('teacher manual close is the authoritative reason and cutoff', () => {
  const closed = cutoff - 500;
  const cp = checkpoint({ finalizationContext: { classId: 'c1' } });
  const assignment = { warmup: { closedByClassId: { c1: { closedAt: new Date(closed) } } } };
  assert.deepEqual(authoritativeCheckpointClose(cp, assignment), { cutoff: closed, reason: 'manual-section-close' });
});

test('regular dueAt does not final-lock while a later lateDueAt exists', () => {
  const late = cutoff + 86400000;
  const cp = checkpoint({ activityRole: 'classwork' });
  assert.deepEqual(authoritativeCheckpointClose(cp, { dueAt: new Date(cutoff), lateDueAt: new Date(late) }), { cutoff: late, reason: 'assignment-final-deadline' });
});

test('whole assignment final deadline finalizes eligible outstanding work', () => {
  const cp = checkpoint({ activityRole: 'classwork', candidateFinalizeAt: new Date(cutoff - 100) });
  assert.equal(decideCheckpointFinalization({ checkpoint: cp, assignment: { dueAt: new Date(cutoff) }, gradeRecord: {}, now: cutoff }).action, 'finalize');
});

test('deterministic IndexedDB identity coalesces many response revisions', async () => {
  const storage = createMemoryOutboxStorage();
  const base = { identity: { studentId: 's', assignmentId: 'a', questionIndex: 2, questionId: 'q', variantIndex: 1 }, activityRole: 'dol', finalizeAt: new Date(cutoff), finalizationReason: 'dol-close', submissionEnvelope: { previousTotalAttempts: 0, record: {} } };
  await enqueueResponseCheckpoint({ ...base, revision: 1, answerState: { isComplete: true, responseKey: 'one' } }, { storage });
  await enqueueResponseCheckpoint({ ...base, revision: 2, answerState: { isComplete: true, responseKey: 'two' } }, { storage });
  const queued = await listDurableActions({ storage });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].payload.revision, 2);
});

test('incomplete response never enters the checkpoint outbox', () => {
  assert.equal(buildResponseCheckpointAction({ identity: { studentId: 's', assignmentId: 'a', questionIndex: 0 }, answerState: { isComplete: false } }), null);
});

test('secure material is rejected by the ordinary durable boundary', () => {
  assert.throws(() => buildResponseCheckpointAction({ identity: { studentId: 's', assignmentId: 'a', questionIndex: 0 }, answerState: { isComplete: true, responseKey: 'x' }, submissionEnvelope: { seed: 4 } }));
});
