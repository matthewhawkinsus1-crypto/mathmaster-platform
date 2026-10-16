/*
 * NAV-12 (student pass 3): Home's timed "Do this next" card names the lesson
 * and says when the Warm-Up or exit ticket (DOL) closes — read from the
 * window's own state, so a student's extended DOL window is the one named —
 * instead of the lesson's due date.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeClosesAt, resolveNextAction } from '../../src/studentDashboardModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = new Date(2026, 9, 16, 14, 40).getTime(); // local 2:40 PM
const CLOSES = new Date(2026, 9, 16, 14, 45).getTime();
const lesson = { id: 'a1', title: 'Systems of Equations — Lesson 3', dueAt: '2026-10-17T23:59:00', lateDueAt: '2026-10-20T23:59:00' };
const fixedTime = (date) => `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${date.getHours() < 12 ? 'AM' : 'PM'}`;

test('NAV-12: the DOL card names its lesson and closes when the DOL window does', () => {
  const action = resolveNextAction({
    dashboard: { activeDols: [{ assignment: lesson, state: { endsAt: new Date(CLOSES) }, openQuestionIndices: [4] }] },
  });
  assert.equal(action.kind, 'dol');
  assert.equal(action.headline, 'Your exit ticket (DOL) is open');
  assert.match(action.detail, /^Systems of Equations — Lesson 3 — it is timed/);
  assert.equal(action.closesAt, CLOSES);
  assert.equal(action.questionIndex, 4);
});

test('NAV-12: the Warm-Up card names its lesson and its close too', () => {
  const action = resolveNextAction({
    dashboard: { activeWarmups: [{ assignment: lesson, state: { endsAt: CLOSES }, questionIndices: [0], records: [] }] },
  });
  assert.equal(action.kind, 'warmup');
  assert.match(action.detail, /^Systems of Equations — Lesson 3 — /);
  assert.equal(action.closesAt, CLOSES);
});

test('NAV-12: "Closes at 2:45 PM" today; the day as well when it is another day; nothing without a close', () => {
  assert.equal(describeClosesAt(CLOSES, { nowValue: NOW, formatTime: fixedTime }), 'Closes at 2:45 PM');
  const tomorrow = new Date(2026, 9, 17, 9, 5).getTime();
  assert.equal(describeClosesAt(tomorrow, { nowValue: NOW, formatTime: fixedTime, formatDay: () => 'Sat, Oct 17, 9:05 AM' }), 'Closes Sat, Oct 17, 9:05 AM');
  assert.equal(describeClosesAt(null, { nowValue: NOW }), null);
  assert.equal(describeClosesAt('soon', { nowValue: NOW }), null);
});

test('NAV-12: the card prints the close line instead of the due date for a timed kind', () => {
  const card = executableSource(readFileSync(new URL('../../src/components/student/WhatShouldIDoNow.jsx', import.meta.url), 'utf8'));
  assert.match(card, /^import \{ describeClosesAt \} from '\.\.\/\.\.\/studentDashboardModel\.js';$/m);
  assert.equal((card.match(/const TIMED_KINDS = new Set\(\['dol', 'warmup'\]\);/g) || []).length, 1);
  const lines = region(card, '{nextAction.assignment && TIMED_KINDS.has(nextAction.kind) && describeClosesAt(nextAction.closesAt) ? (', '{nextAction.actionLabel && (');
  // The close line comes first; the late and due lines are only the else branches.
  assert.ok(lines.indexOf('data-next-action-closes') < lines.indexOf('nextAction.lateLine ? ('));
  assert.ok(lines.indexOf('data-next-action-closes') < lines.indexOf("'Your due date: ' : 'Due '"));
});
