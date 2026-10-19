/*
 * NAV-24 review B2: the pack-up line says "your work is saved" only when
 * nothing is owed. It reads the same save status as Home's line
 * (describeSaveStatus), so the two never disagree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSaveStatus } from '../../src/platform/student/saveStatusModel.js';
import { PACK_UP_SENTENCE, packUpWorkLine } from '../../src/platform/student/packUpLine.js';

const line = (input) => packUpWorkLine(describeSaveStatus(input));

test('saved only when nothing is pending', () => {
  assert.deepEqual(line({ persistenceStatus: 'idle' }), { kind: 'saved', sentence: PACK_UP_SENTENCE.saved });
  assert.equal(line({ persistenceStatus: 'durable' }).kind, 'saved');
  assert.equal(PACK_UP_SENTENCE.saved, 'Finish up — your work is saved.');
});

test('a rejected answer is not "saved" — likeliest when the DOL closes before the bell', () => {
  const rejected = line({ persistenceStatus: 'rejected' });
  assert.equal(rejected.kind, 'notSaved');
  assert.match(rejected.sentence, /not saved yet, so keep this tab open and tell your teacher/);
});

test('drafts that are not being saved on this device (Batch 3) are not "saved"', () => {
  assert.equal(line({ persistenceStatus: 'idle', draftsUnsaved: true }).kind, 'notSaved');
});

test('a queued submission or progress still owed: keep the tab open', () => {
  assert.equal(line({ persistenceStatus: 'queued' }).kind, 'unsent');
  assert.equal(line({ persistenceStatus: 'idle', outboxDepth: 2 }).kind, 'unsent');
  assert.equal(line({ persistenceStatus: 'idle', pendingGradeCount: 1 }).kind, 'unsent');
  assert.equal(line({ persistenceStatus: 'syncing', online: false }).kind, 'unsent', 'offline with work owed');
  assert.equal(line({ persistenceStatus: 'queued' }).sentence, 'Finish up — some work has not been sent yet, so keep this tab open.');
});

test('anything the line does not recognise is never "saved"', () => {
  assert.equal(packUpWorkLine(null).kind, 'notSaved');
  assert.equal(packUpWorkLine({ tone: 'something-new' }).kind, 'notSaved');
});
