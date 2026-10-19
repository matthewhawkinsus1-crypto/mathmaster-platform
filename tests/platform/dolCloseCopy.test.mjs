/*
 * A CLOSED DOL NEVER PROMISES A SUBMISSION "WHEN TIME ENDS" (QA R2-m4).
 *
 * After "Close now" the student read "The DOL timer has ended" above "Your
 * latest completed response will be submitted automatically when time ends".
 * describeDolClose decides every line: the open-only promise, who closed it,
 * and whether the latest completed response was recorded (receipt only).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeDolClose, DOL_OPEN_NOTICE } from '../../src/platform/assessment/dolCloseCopy.js';

const lines = (copy) => [copy.lockMessage, copy.openNotice, copy.closeReceipt].filter(Boolean);
const PROMISE = /will be submitted automatically when time ends/i;

test('an open, timed DOL promises the automatic submission and locks nothing', () => {
  const copy = describeDolClose({ status: 'active', teacherClosed: false, outcome: null });
  assert.equal(copy.state, 'open');
  assert.equal(copy.openNotice, DOL_OPEN_NOTICE);
  assert.match(copy.openNotice, PROMISE);
  assert.equal(copy.lockMessage, '');
  assert.equal(copy.closeReceipt, '');
});

test('a DOL reopened after a teacher close is open again, not closed', () => {
  // teacherClosed can survive a recovery window; the live status wins.
  const copy = describeDolClose({ status: 'active', teacherClosed: true, outcome: 'auto-submitted' });
  assert.equal(copy.state, 'open');
  assert.match(copy.openNotice, PROMISE);
  assert.equal(copy.closeReceipt, '');
});

test('closed by the timer: says time is up, never the open-DOL promise, and reports the recording', () => {
  const copy = describeDolClose({ status: 'ended', teacherClosed: false, outcome: 'auto-submitted' });
  assert.equal(copy.state, 'closed-by-timer');
  assert.match(copy.lockMessage, /time is up/i);
  assert.match(copy.lockMessage, /no new submission is allowed/i);
  assert.doesNotMatch(copy.lockMessage, /teacher/i);
  assert.equal(copy.openNotice, '');
  assert.match(copy.closeReceipt, /latest completed response was submitted/i);
  for (const line of lines(copy)) assert.doesNotMatch(line, PROMISE);
});

test('closed by the teacher: names the teacher, never "timer", never the open-DOL promise', () => {
  const copy = describeDolClose({ status: 'ended', teacherClosed: true, outcome: 'auto-submitted' });
  assert.equal(copy.state, 'closed-by-teacher');
  assert.match(copy.lockMessage, /your teacher closed/i);
  assert.match(copy.lockMessage, /no new submission is allowed/i);
  assert.equal(copy.openNotice, '');
  assert.match(copy.closeReceipt, /latest completed response was submitted when your teacher closed/i);
  for (const line of lines(copy)) {
    assert.doesNotMatch(line, /timer/i);
    assert.doesNotMatch(line, /time is up|time ended/i);
    assert.doesNotMatch(line, PROMISE);
  }
});

test('closed with no completed response: says nothing was submitted, by either closer', () => {
  for (const teacherClosed of [true, false]) {
    const copy = describeDolClose({ status: 'ended', teacherClosed, outcome: 'incomplete-at-close' });
    assert.match(copy.closeReceipt, /no completed response was available to submit/i);
    assert.doesNotMatch(copy.closeReceipt, /was submitted/i);
    assert.equal(copy.openNotice, '');
    for (const line of lines(copy)) assert.doesNotMatch(line, PROMISE);
  }
});

test('a student who pressed Submit hears their work is saved', () => {
  for (const teacherClosed of [true, false]) {
    const copy = describeDolClose({ status: 'ended', teacherClosed, outcome: 'explicitly-submitted' });
    assert.match(copy.closeReceipt, /submitted work has been saved/i);
  }
});

test('closed before the receipt arrives: "checking", never "submitted" and never the promise', () => {
  for (const teacherClosed of [true, false]) {
    const copy = describeDolClose({ status: 'ended', teacherClosed, outcome: null });
    assert.match(copy.closeReceipt, /checking whether your latest completed response was recorded/i);
    assert.doesNotMatch(copy.closeReceipt, /submitted/i);
    assert.equal(copy.openNotice, '');
    assert.notEqual(copy.lockMessage, '');
  }
});

test('a DOL that is not open yet shows no DOL lines at all', () => {
  for (const status of ['waiting', 'unscheduled', undefined]) {
    const copy = describeDolClose({ status, teacherClosed: false, outcome: null });
    assert.deepEqual(lines(copy), [], String(status));
  }
});
