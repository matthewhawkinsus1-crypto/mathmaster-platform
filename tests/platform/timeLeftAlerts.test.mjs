// Pass 3, RUN-10: timed work warns at 2:00 and 0:30, once each, and the pill
// shows seconds in the last minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIME_ALERT_THRESHOLDS,
  UNFINISHED_WORK_LINE,
  formatTimeLeft,
  resetTimeAlerts,
  takeDueTimeAlert,
} from '../../src/platform/student/timeLeftAlerts.js';

// Ticks a countdown second by second and collects every warning said.
const run = ({ key, fromMs, toMs = 0, stepMs = 1000 }) => {
  const said = [];
  let previous = null;
  for (let remaining = fromMs; remaining > toMs; remaining -= stepMs) {
    const alert = takeDueTimeAlert({ key, remainingMs: remaining, previousRemainingMs: previous });
    if (alert) said.push({ at: remaining, ...alert });
    previous = remaining;
  }
  return said;
};

test('a watched countdown warns at 2:00 and 0:30, once each', () => {
  resetTimeAlerts();
  const said = run({ key: 'dol|1', fromMs: 5 * 60_000 });
  assert.deepEqual(said.map((alert) => [alert.at, alert.words]), [[120_000, '2 minutes left'], [30_000, '30 seconds left']]);
  assert.deepEqual(TIME_ALERT_THRESHOLDS.map((threshold) => threshold.ms), [120_000, 30_000]);
});

test('a remount in the same window does not repeat a warning', () => {
  resetTimeAlerts();
  run({ key: 'dol|2', fromMs: 3 * 60_000, toMs: 100_000 });
  // The student moves to another question; the timer mounts again at 1:40.
  const again = run({ key: 'dol|2', fromMs: 100_000, toMs: 40_000 });
  assert.deepEqual(again, []);
  // A new window (extra time moved the end) warns again.
  assert.equal(takeDueTimeAlert({ key: 'dol|3', remainingMs: 100_000 })?.words, 'Less than 2 minutes left');
});

test('first seen inside the last 30 seconds: one warning, the urgent one', () => {
  resetTimeAlerts();
  const said = run({ key: 'warmup|1', fromMs: 25_000 });
  assert.deepEqual(said.map((alert) => alert.words), ['Less than 30 seconds left']);
});

test('no warning with plenty of time, or after time is up', () => {
  resetTimeAlerts();
  assert.equal(takeDueTimeAlert({ key: 'x', remainingMs: 121_000 }), null);
  assert.equal(takeDueTimeAlert({ key: 'y', remainingMs: 0 }), null);
  assert.equal(takeDueTimeAlert({ key: '', remainingMs: 10_000 }), null);
});

test('the pill shows seconds in the last minute and never "0 min" while time is left', () => {
  assert.equal(formatTimeLeft(59_000), '0:59');
  assert.equal(formatTimeLeft(42_300), '0:43');
  assert.equal(formatTimeLeft(1_000), '0:01');
  assert.equal(formatTimeLeft(60_000), '1 min');
  assert.equal(formatTimeLeft(4 * 60_000 + 59_000), '4 min');
  assert.equal(formatTimeLeft(65 * 60_000), '1 h 5 min');
  for (let ms = 500; ms < 60_000; ms += 500) assert.doesNotMatch(formatTimeLeft(ms), /^0 min|0m/);
});

test('the line about unfinished work matches what each close does', () => {
  // A DOL and a Warm-Up turn in completed answers only (dolCloseCopy).
  assert.match(UNFINISHED_WORK_LINE.section, /only completed answers/);
  assert.match(UNFINISHED_WORK_LINE.section, /not finished is not/);
  // A secure test turns in what was saved.
  assert.match(UNFINISHED_WORK_LINE.test, /turned in with the answers you have entered/);
});
