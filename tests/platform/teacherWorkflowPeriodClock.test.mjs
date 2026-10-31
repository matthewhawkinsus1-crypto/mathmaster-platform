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
