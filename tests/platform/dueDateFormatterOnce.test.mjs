// AN ASSIGNMENT'S DUE DATES ARE WRITTEN BY ONE FORMATTER, IN THE SAME WORDS.
//
// Measured on the student's flow (tests/browser/teacherWorkflow/
// studentRuntimePerformance.mjs: a production build, 4x-throttled), a Submit
// spent about 47 ms in formatDateTime. App writes the assignment's due dates on
// every render, a Submit renders App about seven times, and
// Date.prototype.toLocaleString with options builds a new formatter on every
// call. formatDateTime now keeps one Intl.DateTimeFormat with the same options.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime, studentDueDateLines } from '../../src/assignmentLifecycle.js';

const OPTIONS = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
const realToLocaleString = Date.prototype.toLocaleString;
afterEach(() => { Date.prototype.toLocaleString = realToLocaleString; });

const countToLocaleString = () => {
  const counter = { calls: 0 };
  Date.prototype.toLocaleString = function counted(...args) {
    counter.calls += 1;
    return realToLocaleString.apply(this, args);
  };
  return counter;
};

const DATES = ['2026-11-09', '2026-11-09T23:59:00.000Z', '2027-03-14T07:05:00-05:00', '2026-12-31', new Date(Date.UTC(2026, 1, 28, 18, 30)), 1_794_000_000_000];

test('a Submit\'s seven renders write the dates without building a formatter each time', () => {
  // The words each date read before: the same options, through toLocaleString.
  const expected = DATES.map((value) => {
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : new Date(value);
    return date ? realToLocaleString.call(date, undefined, OPTIONS) : null;
  });
  const counter = countToLocaleString();
  for (let render = 0; render < 7; render += 1) {
    DATES.forEach((value, index) => {
      const text = formatDateTime(value);
      if (expected[index] !== null) assert.equal(text, expected[index]);
      else assert.match(text, /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:59\s?PM$/, `a date-only due date is written as its last minute: ${text}`);
    });
  }
  assert.equal(counter.calls, 0, `toLocaleString was called ${counter.calls} times for ${7 * DATES.length} dates`);
});

test('the due-date lines read as they did', () => {
  const assignment = { dueAt: '2026-11-10T23:59:00', lateDueAt: '2026-11-13T23:59:00' };
  const lines = studentDueDateLines(assignment, null);
  assert.match(lines.dueLine, /Nov 10, 2026, 11:59\s?PM/);
  assert.match(lines.finalLine, /Nov 13, 2026, 11:59\s?PM/);
});

test('no date still reads "Not set", and a date that is not one still reads "Invalid Date"', () => {
  assert.equal(formatDateTime(null), 'Not set');
  assert.equal(formatDateTime(''), 'Not set');
  assert.equal(formatDateTime({ toMillis: () => Number.NaN }), 'Invalid Date');
  assert.equal(formatDateTime(8.7e15), 'Invalid Date');
});
