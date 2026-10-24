/*
 * RT08: a student still on the page when their exit ticket closes gets the
 * receipt line without a reload. The receipts are read again a few times
 * after the close (the finalizer runs every minute), never by a listener.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RECEIPT_READS_AFTER_CLOSE_MS, receiptRereadsAfter } from '../../src/platform/assessment/dolReceiptRefresh.js';
import { executableSource } from './helpers/sourceContract.mjs';

const open = (assignmentId) => ({ assignmentId, open: true });
const closed = (assignmentId) => ({ assignmentId, open: false });

test('only the open assignment\'s exit ticket closing reads the receipts again', () => {
  assert.deepEqual(receiptRereadsAfter(open('a1'), closed('a1')), RECEIPT_READS_AFTER_CLOSE_MS);
  assert.ok(RECEIPT_READS_AFTER_CLOSE_MS.length <= 3 && RECEIPT_READS_AFTER_CLOSE_MS.at(-1) >= 120_000,
    'a few reads, reaching past two runs of the every-minute finalizer');
  // Another assignment opened, closed ones, reopened ones: nothing to wait for.
  assert.deepEqual(receiptRereadsAfter(open('a1'), closed('a2')), []);
  assert.deepEqual(receiptRereadsAfter(closed('a1'), closed('a1')), []);
  assert.deepEqual(receiptRereadsAfter(closed('a1'), open('a1')), []);
  assert.deepEqual(receiptRereadsAfter(open('a1'), open('a1')), []);
  assert.deepEqual(receiptRereadsAfter(null, closed('a1')), []);
  assert.deepEqual(receiptRereadsAfter(open('a1'), null), []);
});

test('App reads the receipts again on those timers, and clears them when the screen moves on', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /const state = getDOLState\(\{ assignment, schedule: classSchedule, classId: user\.classId \|\| null, classPeriod: user\.classPeriod, nowValue: now \}\);\s*return state\.enabled \? state\.status === 'active' : null;/);
  assert.match(app, /const timers = receiptRereadsAfter\(previous, next\)\.map\(\(delay\) => window\.setTimeout\(\(\) => setCheckpointReadRound\(\(round\) => round \+ 1\), delay\)\);\s*return \(\) => timers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\);\s*\}, \[activeAssignmentId, activeDolOpen\]\);/);
  // The one read of the receipts runs again for each round.
  assert.match(app, /collection\(db, 'studentResponseCheckpoints'\),[\s\S]{0,900}\}, \[user\?\.role, user\?\.id, activeAssignmentId, checkpointReadRound\]\);/);
  assert.doesNotMatch(app, /onSnapshot\(query\(\s*collection\(db, 'studentResponseCheckpoints'\)/, 'still no standing listener');
});
