// The teacher-workflow harness's Period 3 clock (tests/browser/teacherWorkflow/
// fixture.js). `?p3StartMin` says how long ago Period 3 began. With no
// parameter it begins now, so the Warm-Up's ten-minute window is open: every
// journey that passes none depends on that, and the fixture's comment says so
// (it once said 40 while the code gave 0). The owner decided to keep 0
// (CI17): the first test below is what changing it to 40 would have to
// answer to. `?p3EndMin` defaults to 50.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTeacherWorkflowFixture } from '../browser/teacherWorkflow/fixture.js';

class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(Date.now()); }
  toMillis() { return this.ms; }
}
// Local noon, so no offset reaches another day and nothing is clamped.
const NOW = new Date(2026, 9, 1, 12, 0, 0, 0).getTime();
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const period3 = (query = '') => {
  const fixture = buildTeacherWorkflowFixture({ now: NOW, Timestamp, params: new URLSearchParams(query) });
  const today = Object.values(fixture['settings/classSchedule'].modifiedSchedules)[0];
  const { start, end } = today.periods['Period 3'];
  return { start: minutesOf(start), end: minutesOf(end) };
};
const NOON = 12 * 60;

test('with no p3StartMin, Period 3 begins now (the Warm-Up window is open)', () => {
  assert.equal(period3().start, NOON);
  assert.equal(period3('p3StartMin=').start, NOON);
  assert.equal(period3('p3StartMin=nope').start, NOON, 'an unreadable value falls back to the default');
});

test('p3StartMin moves the start back by that many minutes', () => {
  assert.equal(period3('p3StartMin=40').start, NOON - 40);
  assert.equal(period3('p3StartMin=3').start, NOON - 3);
});

test('p3EndMin defaults to 50 and moves the end', () => {
  assert.equal(period3().end, NOON + 50);
  assert.equal(period3('p3EndMin=3').end, NOON + 3);
});

// Near midnight, Period 3 still holds the moment the harness opens, read by
// the schedule code Teacher Home uses (resolvePeriodWindow). The fixture had
// clamped the end to 23:55 and the start to 00:05, so a journey that opened
// the harness in the five minutes either side of midnight found no class in
// session (CI run 138, 23:55 UTC).
const { resolvePeriodWindow } = await import('../../functions/shared/classSchedule.mjs');
const inSessionAt = (now, query = '') => {
  const fixture = buildTeacherWorkflowFixture({ now, Timestamp, params: new URLSearchParams(query) });
  const window = resolvePeriodWindow({ schedule: fixture['settings/classSchedule'], classPeriod: 'Period 3', nowValue: now });
  return Boolean(window) && now >= window.startMs && now <= window.endMs;
};

test('Period 3 is in session at every minute around midnight', () => {
  for (const [hour, minute, second] of [[23, 9, 0], [23, 54, 0], [23, 55, 20], [23, 58, 30], [23, 59, 59]]) {
    const now = new Date(2026, 10, 16, hour, minute, second, 0).getTime();
    assert.equal(inSessionAt(now), true, `${hour}:${minute}:${second} with no parameters`);
    assert.equal(inSessionAt(now, 'p3EndMin=3'), true, `${hour}:${minute}:${second} with p3EndMin=3`);
  }
  for (const [hour, minute] of [[0, 0], [0, 2], [0, 4], [0, 39]]) {
    const now = new Date(2026, 10, 17, hour, minute, 30, 0).getTime();
    assert.equal(inSessionAt(now), true, `${hour}:${minute} with no parameters`);
    assert.equal(inSessionAt(now, 'p3StartMin=40'), true, `${hour}:${minute} with p3StartMin=40`);
  }
});

test('at noon the window is exactly the one the parameters ask for', () => {
  assert.equal(inSessionAt(NOW), true);
  assert.equal(inSessionAt(NOW, 'p3StartMin=40'), true);
});
