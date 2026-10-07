// What the CCMR screens do with a student's saved plan
// (src/platform/ccmr/ccmrPlan.js): edit it without breaking it, send a save
// the server will accept, describe it in a student's words, and move goals out
// of the old browser storage exactly once.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CCMR_SHORT_NAME,
  ccmrCountdownText,
  ccmrPlanSaveRequest,
  ccmrPlanWithGoals,
  ccmrPlanWithTest,
  ccmrTestDateDraftProblem,
  decideLegacyCcmrMigration,
  describeCcmrPlan,
} from '../../src/platform/ccmr/ccmrPlan.js';
import { validateCcmrPlanInput } from '../../functions/shared/ccmrPlan.mjs';

// Noon in Chicago, 7 October 2026.
const NOW = Date.parse('2026-10-07T17:00:00Z');
const plan = (goals, testDate = null, testFramework = null) => ({
  goals: goals.map((framework) => ({ framework, since: 1 })),
  testDate,
  testFramework,
});

test('dropping the test a date belongs to drops the date, never re-labels it', () => {
  const next = ccmrPlanWithGoals(plan(['act', 'tsia2'], '2026-10-30', 'tsia2'), ['act']);
  assert.deepEqual(next, { goals: [{ framework: 'act', since: 1 }], testDate: null, testFramework: null });
  const kept = ccmrPlanWithGoals(plan(['act', 'tsia2'], '2026-10-30', 'tsia2'), ['tsia2', 'digitalSAT', 'nope']);
  assert.deepEqual(kept.goals, [{ framework: 'tsia2', since: 1 }, { framework: 'digitalSAT', since: null }]);
  assert.equal(kept.testDate, '2026-10-30');
  assert.equal(kept.testFramework, 'tsia2');
});

test('a test date is attached to one of the goals, and an empty date clears it', () => {
  const dated = ccmrPlanWithTest(plan(['act', 'tsia2']), { testDate: '2026-10-30', testFramework: 'tsia2' });
  assert.equal(dated.testDate, '2026-10-30');
  assert.equal(dated.testFramework, 'tsia2');
  assert.equal(ccmrPlanWithTest(plan(['act']), { testDate: '2026-10-30', testFramework: 'asvab' }).testFramework, 'act');
  assert.equal(ccmrPlanWithTest(plan(['act'], '2026-10-30', 'act'), { testDate: null }).testDate, null);
  assert.equal(ccmrPlanWithTest(plan([]), { testDate: '2026-10-30' }).testDate, null, 'no goal, no test');
});

test('a save request is one the server accepts, even with last spring\'s test still on file', () => {
  const request = ccmrPlanSaveRequest(plan(['act', 'tsia2'], '2026-10-30', 'tsia2'), { now: NOW });
  assert.deepEqual(request, { goals: ['act', 'tsia2'], testDate: '2026-10-30', testFramework: 'tsia2', source: 'student' });
  assert.equal(validateCcmrPlanInput(request, { now: NOW }).ok, true);
  const stale = ccmrPlanSaveRequest(plan(['act'], '2026-04-11', 'act'), { now: NOW });
  assert.equal(stale.testDate, null);
  assert.equal(stale.testFramework, null);
  assert.equal(validateCcmrPlanInput(stale, { now: NOW }).ok, true, 'a goal toggle must not fail on an old test date');
});

test('the date field offers today through two years out, and says so', () => {
  assert.equal(ccmrTestDateDraftProblem('', { now: NOW }), null, 'empty means no date');
  assert.equal(ccmrTestDateDraftProblem('2026-10-07', { now: NOW }), null);
  assert.equal(ccmrTestDateDraftProblem('2028-10-07', { now: NOW }), null);
  assert.match(ccmrTestDateDraftProblem('2026-10-06', { now: NOW }), /between today and two years/);
  assert.match(ccmrTestDateDraftProblem('2028-10-08', { now: NOW }), /between today and two years/);
  assert.match(ccmrTestDateDraftProblem('2026-13-01', { now: NOW }), /full date/);
});

test('each goal shows its published benchmark, and the dated test shows the countdown', () => {
  const described = describeCcmrPlan(plan(['digitalSAT', 'act', 'tsia2', 'asvab'], '2026-10-30', 'digitalSAT'), { now: NOW });
  assert.deepEqual(described.lines.map((line) => line.text), [
    'SAT math benchmark: 530 · 23 days to your test',
    'ACT math benchmark: 22',
    'TSIA2 math benchmark: 950',
    'ASVAB: no single math benchmark score',
  ]);
  assert.equal(described.test.daysUntil, 23);
  assert.equal(described.test.dateLabel, 'Fri, Oct 30, 2026');
  assert.equal(described.test.testName, 'SAT');
  assert.equal(CCMR_SHORT_NAME.digitalSAT, 'SAT');
  assert.equal(describeCcmrPlan(plan(['act']), { now: NOW }).test, null);
  assert.deepEqual(describeCcmrPlan(null, { now: NOW }).lines, []);
});

test('the countdown reads naturally on the last days and after the test', () => {
  assert.equal(ccmrCountdownText(2), '2 days to your test');
  assert.equal(ccmrCountdownText(1), '1 day to your test');
  assert.equal(ccmrCountdownText(0), 'Your test is today');
  assert.equal(ccmrCountdownText(-3), 'Your test date has passed');
  assert.equal(describeCcmrPlan(plan(['act'], '2026-10-07', 'act'), { now: NOW }).lines[0].text, 'ACT math benchmark: 22 · Your test is today');
});

test('browser goals move to the account once, only when the server says there is no plan', () => {
  const base = { loaded: true, exists: false, fromCache: false, legacyGoals: ['act', 'act', 'bogus', 'tsia2'] };
  assert.deepEqual(decideLegacyCcmrMigration(base), {
    action: 'migrate',
    request: { goals: ['act', 'tsia2'], testDate: null, testFramework: null, source: 'browserMigration' },
  });
  assert.equal(validateCcmrPlanInput(decideLegacyCcmrMigration(base).request, { now: NOW }).ok, true);
  // The offline cache cannot prove there is no plan on the server.
  assert.equal(decideLegacyCcmrMigration({ ...base, fromCache: true }).action, 'none');
  assert.equal(decideLegacyCcmrMigration({ ...base, loaded: false }).action, 'none');
  // A teacher viewing read-only never writes for the student.
  assert.equal(decideLegacyCcmrMigration({ ...base, readOnly: true }).action, 'none');
  // Once per visit.
  assert.equal(decideLegacyCcmrMigration({ ...base, attempted: true }).action, 'none');
  // The server already has a plan: the browser copy is stale and goes away.
  assert.equal(decideLegacyCcmrMigration({ ...base, exists: true }).action, 'clear');
  assert.equal(decideLegacyCcmrMigration({ ...base, legacyGoals: [] }).action, 'none');
});
