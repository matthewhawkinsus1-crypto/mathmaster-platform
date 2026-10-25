// What the CCMR screens do with a student's saved plan
// (src/platform/ccmr/ccmrPlan.js): edit it without breaking it, send a save
// the server will accept, describe it in a student's words, and move goals out
// of the old browser storage exactly once.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CCMR_SHORT_NAME,
  ccmrCountdownText,
  ccmrPlanContainerView,
  ccmrPlanFrameworks,
  ccmrPlanSaveRequest,
  ccmrPlanStateAfterSave,
  ccmrPlanStateFromSnapshot,
  ccmrPlanWithGoals,
  ccmrPlanWithTest,
  ccmrTestDateDraftProblem,
  ccmrTestDateGuidance,
  decideLegacyCcmrMigration,
  describeCcmrPlan,
  sameCcmrPlan,
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

test('a teacher reading the plan is told about "the" test, not "your" test', () => {
  const teacher = describeCcmrPlan(plan(['act'], '2026-10-30', 'act'), { now: NOW, audience: 'teacher' });
  assert.equal(teacher.lines[0].text, 'ACT math benchmark: 22 · 23 days to the test');
  assert.equal(teacher.test.countdown, '23 days to the test');
  assert.equal(ccmrCountdownText(1, { audience: 'teacher' }), '1 day to the test');
  assert.equal(ccmrCountdownText(0, { audience: 'teacher' }), 'The test is today');
  assert.equal(ccmrCountdownText(-1, { audience: 'teacher' }), 'The test date has passed');
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

// --- MP17: the CCMR verifier minors of push D ---------------------------------

test('a saved test date that has passed is described, never flagged as an error on load (MP17)', () => {
  // The hub opens with the saved date in the field. It has passed: the
  // countdown says so, and the field raises nothing the student did not type.
  assert.equal(ccmrTestDateDraftProblem('2026-04-11', { now: NOW, saved: '2026-04-11' }), null);
  assert.equal(describeCcmrPlan(plan(['act'], '2026-04-11', 'act'), { now: NOW }).lines[0].text, 'ACT math benchmark: 22 · Your test date has passed');
  // A past date the student types is still refused, and so is a broken one.
  assert.match(ccmrTestDateDraftProblem('2026-04-12', { now: NOW, saved: '2026-04-11' }), /between today and two years/);
  assert.match(ccmrTestDateDraftProblem('2026-13-01', { now: NOW, saved: '2026-04-11' }), /full date/);
  assert.match(ccmrTestDateDraftProblem('2026-04-11', { now: NOW }), /between today and two years/, 'without a saved date it is a draft like any other');
});

test('the date field promises the weekly lean only where the teacher left the framework on Auto (MP17)', () => {
  const lean = 'When your weekly Path includes test practice, it leans toward this test in the four weeks before it.';
  assert.equal(ccmrTestDateGuidance({}), lean);
  assert.equal(ccmrTestDateGuidance({ teacherFramework: 'auto' }), lean);
  assert.equal(ccmrTestDateGuidance({ teacherFramework: 'not-a-test' }), lean);
  assert.equal(ccmrTestDateGuidance({ teacherFramework: 'act' }), "Your teacher chose ACT practice for your class's weekly Path. Your test date still counts down here.");
  assert.match(ccmrTestDateGuidance({ teacherFramework: 'digitalSAT' }), /^Your teacher chose SAT practice/);
});

// The container's subscription state for one student, as MyMathPathApp keeps it.
const state = (overrides = {}) => ({ studentId: 's1', plan: null, loaded: true, exists: false, fromCache: false, error: null, ...overrides });

test('the container never shows one student\'s plan to the next (MP17)', () => {
  const saved = plan(['act'], '2026-10-30', 'act');
  // A teacher's read-only view moves from s1 to s2 before s2's plan arrives.
  const stale = ccmrPlanContainerView({ state: state({ plan: saved, exists: true }), studentId: 's2', waitExpired: true });
  assert.equal(stale.plan, null);
  assert.equal(stale.editable, false);
  assert.equal(stale.settled, false, 'the week waits for its own student, however long the wait');
  assert.equal(ccmrPlanContainerView({ state: state({ error: 'gone' }), studentId: 's2' }).error, null);
  // The student's own state is handed down as it is.
  assert.equal(ccmrPlanContainerView({ state: state({ plan: saved, exists: true }), studentId: 's1' }).plan, saved);
});

test('editing waits for the server; a cached copy, even of a real plan, may be stale (MP17)', () => {
  const saved = plan(['act']);
  const cachedReal = ccmrPlanContainerView({ state: state({ plan: saved, exists: true, fromCache: true }), studentId: 's1' });
  assert.equal(cachedReal.editable, false, 'a save built on a cached copy could overwrite a newer plan');
  assert.equal(cachedReal.settled, true, 'the week may still be planned from it');
  const server = ccmrPlanContainerView({ state: state({ plan: saved, exists: true, fromCache: false }), studentId: 's1' });
  assert.equal(server.editable, true);
  assert.equal(server.settled, true);
  const serverNone = ccmrPlanContainerView({ state: state({ fromCache: false }), studentId: 's1' });
  assert.equal(serverNone.editable, true, 'the server saying "no plan" is an answer');
  assert.equal(serverNone.settled, true);
  // A cached "no plan" proves nothing: not editable, and the week waits a few seconds.
  const cachedNone = ccmrPlanContainerView({ state: state({ fromCache: true }), studentId: 's1' });
  assert.equal(cachedNone.editable, false);
  assert.equal(cachedNone.settled, false);
  assert.equal(ccmrPlanContainerView({ state: state({ fromCache: true }), studentId: 's1', waitExpired: true }).settled, true);
  // Not loaded yet, or failed.
  assert.equal(ccmrPlanContainerView({ state: state({ loaded: false, fromCache: true }), studentId: 's1' }).editable, false);
  const failed = ccmrPlanContainerView({ state: state({ error: 'Your CCMR plan could not be loaded.' }), studentId: 's1' });
  assert.equal(failed.editable, false);
  assert.equal(failed.settled, true, 'a failed read does not hold the week back');
  assert.equal(failed.error, 'Your CCMR plan could not be loaded.');
});

test('the server confirming the cached plan keeps the same plan object, so the week is not rebuilt (MP17)', () => {
  const cached = ccmrPlanStateFromSnapshot(state({ studentId: 's1', loaded: false }), { studentId: 's1', plan: plan(['act']), exists: true, fromCache: true });
  // The server's snapshot carries an equal plan in a new object.
  const confirmed = ccmrPlanStateFromSnapshot(cached, { studentId: 's1', plan: plan(['act']), exists: true, fromCache: false });
  assert.equal(confirmed.plan, cached.plan, 'same content, same object');
  assert.equal(confirmed.fromCache, false);
  assert.equal(confirmed.loaded, true);
  // A real change is a new object.
  const changed = ccmrPlanStateFromSnapshot(confirmed, { studentId: 's1', plan: plan(['act', 'tsia2']), exists: true, fromCache: false });
  assert.notEqual(changed.plan, confirmed.plan);
  assert.deepEqual(ccmrPlanFrameworks(changed.plan), ['act', 'tsia2']);
  // Another student's snapshot never reuses this one's object.
  const other = ccmrPlanStateFromSnapshot(confirmed, { studentId: 's2', plan: plan(['act']), exists: true, fromCache: false });
  assert.notEqual(other.plan, confirmed.plan);
  assert.equal(other.studentId, 's2');
  assert.equal(sameCcmrPlan(plan(['act']), plan(['act'])), true);
  assert.equal(sameCcmrPlan(plan(['act']), plan(['act'], '2026-10-30', 'act')), false);
});

test('a save lands only on the student it was saved for, and a moved view never migrates (MP17)', () => {
  const before = state({ studentId: 's1', plan: plan(['act']), exists: true });
  const saved = plan(['act', 'tsia2']);
  assert.deepEqual(ccmrPlanStateAfterSave(before, { studentId: 's1', plan: saved }), { ...before, plan: saved, exists: true });
  assert.equal(ccmrPlanStateAfterSave(before, { studentId: 's2', plan: saved }), before, 'a late save for the last student changes nothing');
  assert.equal(ccmrPlanStateAfterSave(before, { studentId: 's1', plan: null }).exists, false);
  const base = { loaded: true, exists: false, fromCache: false, legacyGoals: ['act'] };
  assert.equal(decideLegacyCcmrMigration(base).action, 'migrate');
  assert.equal(decideLegacyCcmrMigration({ ...base, current: false }).action, 'none', 'a reply that belongs to another student');
  assert.equal(decideLegacyCcmrMigration({ ...base, error: 'failed' }).action, 'none', 'a failed read is not "no plan"');
});
