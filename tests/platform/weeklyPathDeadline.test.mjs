import test from 'node:test';
import assert from 'node:assert/strict';

import { WEEK_TIME_ZONE, buildWeeklyGoal, dueAtFor, weekKeyFor } from '../../src/platform/path/weeklyPathGoal.js';

const centralParts = (ms) => new Intl.DateTimeFormat('en-US', {
  timeZone: WEEK_TIME_ZONE,
  hour12: false,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).formatToParts(new Date(ms)).reduce((acc, part) => {
  if (part.type !== 'literal') acc[part.type] = part.value;
  return acc;
}, {});

test('the week closes at midnight Sunday night where the students are', () => {
  // Not midnight UTC. Sunday 23:59 UTC is 18:59 in Central time, so a UTC
  // deadline would mark every student working Sunday evening late for
  // finishing before the midnight they were told about.
  for (const iso of ['2026-09-02T12:00:00Z', '2026-01-14T12:00:00Z']) {
    const due = dueAtFor(Date.parse(iso));
    const parts = centralParts(due);
    assert.equal(parts.weekday, 'Sun', `${iso} must be due on a Sunday`);
    assert.equal(`${parts.hour}:${parts.minute}:${parts.second}`, '23:59:59', `${iso} must be due at local midnight`);
  }
});

test('the deadline holds across both daylight-saving changes', () => {
  // A fixed UTC offset is wrong for half the year: Central is UTC-5 in daylight
  // time and UTC-6 in standard time.
  const springForward = dueAtFor(Date.parse('2026-03-11T12:00:00Z'));
  const fallBack = dueAtFor(Date.parse('2026-11-04T12:00:00Z'));

  assert.equal(centralParts(springForward).hour, '23');
  assert.equal(centralParts(fallBack).hour, '23');
  // The two land on different UTC offsets, which is the whole point.
  assert.notEqual(new Date(springForward).getUTCHours(), new Date(fallBack).getUTCHours());
});

test('a new week is due on the Sunday of its own week, not the next one', () => {
  const now = Date.parse('2026-09-02T12:00:00Z');
  const goal = buildWeeklyGoal({
    plan: { sessions: [{ skillId: 's1', teksCode: 'A.5A', purpose: 'current_learning' }] },
    config: {},
    studentId: 'S1',
    now,
  });
  assert.equal(goal.weekKey, weekKeyFor(now));
  assert.equal(goal.weekKey, '2026-08-31');

  // Due after the week starts and within eight days of it — the Sunday of that
  // same Monday-to-Sunday week, allowing for the local-midnight offset.
  const weekStart = Date.parse(`${goal.weekKey}T00:00:00Z`);
  assert.ok(goal.dueAt > weekStart);
  assert.ok(goal.dueAt < weekStart + 8 * 24 * 60 * 60 * 1000);
  assert.equal(centralParts(goal.dueAt).weekday, 'Sun');
});

test('work finished Sunday evening is on time, and Monday is late', () => {
  const due = dueAtFor(Date.parse('2026-09-02T12:00:00Z'));
  // 11pm Central on the Sunday: the case a UTC deadline used to get wrong.
  const sundayNight = Date.parse('2026-09-07T04:00:00Z');
  const mondayMorning = Date.parse('2026-09-07T13:00:00Z');

  assert.ok(sundayNight <= due, 'Sunday 11pm Central must still count');
  assert.ok(mondayMorning > due, 'Monday morning must be late');
});

test('a teacher who picks a different due day still gets that day', () => {
  // The default moved, the setting did not disappear.
  const friday = dueAtFor(Date.parse('2026-09-02T12:00:00Z'), { dueDayOfWeek: 5 });
  assert.equal(centralParts(friday).weekday, 'Fri');
  assert.equal(centralParts(friday).hour, '23');
});

test('an environment without timezone data still produces a usable deadline', () => {
  // A deadline that throws is worse than one that is a few hours off.
  const due = dueAtFor(Date.parse('2026-09-02T12:00:00Z'), { timeZone: 'Not/AZone' });
  assert.ok(Number.isFinite(due));
  assert.ok(due > Date.parse('2026-09-06T00:00:00Z'));
});
