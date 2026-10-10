// The CCMR plan — "I'm preparing for…" plus an optional test date — is server
// state now, written only through the setMyCcmrPlan callable. These are the
// rules that callable enforces (functions/shared/ccmrPlan.mjs), exercised as
// behaviour: what a student may save, what is refused, what the stored record
// carries, and how close a test is in the students' own time zone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CCMR_PLAN_COLLECTION,
  CCMR_PLAN_FRAMEWORKS,
  CCMR_PLAN_SOURCE,
  CCMR_TEST_SOON_DAYS,
  buildCcmrPlanRecord,
  ccmrPlanFrameworks,
  ccmrPlansEqual,
  ccmrTestDateBounds,
  ccmrTestProximity,
  daysUntilCcmrTest,
  normalizeStoredCcmrPlan,
  parseCcmrDateKey,
  publicCcmrPlan,
  validateCcmrPlanInput,
} from '../../functions/shared/ccmrPlan.mjs';
import { ASSESSMENT_FRAMEWORKS } from '../../src/platform/ccmr/assessmentCrosswalk.js';

// Noon in Chicago on 7 October 2026 (CDT, UTC-5).
const NOON = Date.parse('2026-10-07T17:00:00Z');
// 11:30pm in Chicago on 7 October — already 8 October in UTC.
const LATE_EVENING = Date.parse('2026-10-08T04:30:00Z');

const ok = (input, options = {}) => {
  const result = validateCcmrPlanInput(input, { now: NOON, ...options });
  assert.equal(result.ok, true, result.message);
  return result.plan;
};
const refused = (input, pattern, options = {}) => {
  const result = validateCcmrPlanInput(input, { now: NOON, ...options });
  assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to be refused`);
  assert.equal(result.code, 'invalid-argument');
  if (pattern) assert.match(result.message, pattern);
  return result;
};

test('the plan names exactly the frameworks the browser offers and the server launches', () => {
  // Three copies of one list would drift. The browser's checkboxes, the plan
  // validator and the session launcher must agree on what a framework is.
  assert.deepEqual([...CCMR_PLAN_FRAMEWORKS], [...ASSESSMENT_FRAMEWORKS]);
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const serverSet = index.match(/const PATH_ASSESSMENT_FRAMEWORKS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(serverSet, 'the session launcher keeps its framework set');
  const serverFrameworks = serverSet[1].split(',').map((entry) => entry.trim().replace(/^"|"$/g, '')).filter(Boolean);
  assert.deepEqual([...serverFrameworks].sort(), [...CCMR_PLAN_FRAMEWORKS].sort());
  assert.equal(CCMR_PLAN_COLLECTION, 'studentCcmrPlans');
});

test('goals keep the student\'s order, accept ids or objects, and drop repeats', () => {
  const plan = ok({ goals: ['act', { framework: 'digitalSAT' }, 'act'] });
  assert.deepEqual(plan.goals, [{ framework: 'act' }, { framework: 'digitalSAT' }]);
  assert.equal(plan.testDate, null);
  assert.equal(plan.testFramework, null);
  assert.equal(plan.source, CCMR_PLAN_SOURCE.STUDENT);
  assert.deepEqual(ok({}).goals, [], 'an empty plan is a real choice: preparing for nothing yet');
});

test('an unknown test, a malformed list or an unexpected field is refused, not guessed at', () => {
  refused({ goals: ['sat'] }, /does not know the test "sat"/);
  refused({ goals: [{ framework: 'GRE' }] }, /does not know the test/);
  refused({ goals: [42] }, /does not know the test/);
  refused({ goals: 'act' }, /must be a list/);
  refused(null, /tests you are preparing for/);
  refused(['act'], /tests you are preparing for/);
  refused({ goals: ['act'], isAdmin: true }, /Unknown CCMR plan field: isAdmin/);
  refused({ goals: ['act'], source: 'teacher' }, /Unknown plan source/);
});

test('a request carrying more goals than there are tests is capped before any work', () => {
  refused({ goals: Array.from({ length: 9 }, () => 'act') }, /at most 4 tests/);
  // Eight repeats of one test is still one goal.
  assert.deepEqual(ok({ goals: Array.from({ length: 8 }, () => 'act') }).goals, [{ framework: 'act' }]);
});

test('a test date must be a real day between today and two years from now', () => {
  assert.equal(ok({ goals: ['act'], testDate: '2026-10-30' }).testDate, '2026-10-30');
  assert.equal(ok({ goals: ['act'], testDate: '2026-10-07' }).testDate, '2026-10-07', 'today is allowed');
  assert.equal(ok({ goals: ['act'], testDate: '2028-10-07' }).testDate, '2028-10-07', 'two years out is allowed');
  refused({ goals: ['act'], testDate: '2026-02-30' }, /real calendar date/);
  refused({ goals: ['act'], testDate: '10/30/2026' }, /real calendar date/);
  refused({ goals: ['act'], testDate: '2026-10-30T00:00:00Z' }, /real calendar date/);
  refused({ goals: ['act'], testDate: '2026-09-01' }, /between today and 2 years/);
  refused({ goals: ['act'], testDate: '2028-10-30' }, /between today and 2 years/);
  // A cleared field is no date, not an error.
  assert.equal(ok({ goals: ['act'], testDate: '' }).testDate, null);
  assert.equal(ok({ goals: ['act'], testDate: null, testFramework: 'act' }).testFramework, null);
});

test('the server allows one day of slack so a late-evening student is never refused today', () => {
  // 11:30pm in Chicago is tomorrow in UTC. A server that judged "today" in UTC
  // would refuse the date the student's own screen offered as today.
  assert.equal(ok({ goals: ['act'], testDate: '2026-10-07' }, { now: LATE_EVENING }).testDate, '2026-10-07');
  const strict = ccmrTestDateBounds({ now: NOON });
  assert.deepEqual(strict, { min: '2026-10-07', max: '2028-10-07' });
  const lenient = ccmrTestDateBounds({ now: NOON, slackDays: 1 });
  assert.deepEqual(lenient, { min: '2026-10-06', max: '2028-10-08' });
  assert.equal(ok({ goals: ['act'], testDate: '2026-10-06' }).testDate, '2026-10-06', 'the server keeps the slack');
  refused({ goals: ['act'], testDate: '2026-10-06' }, /between today/, { slackDays: 0 });
});

test('a test date belongs to one of the student\'s goals', () => {
  assert.equal(ok({ goals: ['tsia2', 'act'], testDate: '2026-11-07' }).testFramework, 'tsia2', 'defaults to the first goal');
  assert.equal(ok({ goals: ['tsia2', 'act'], testDate: '2026-11-07', testFramework: 'act' }).testFramework, 'act');
  refused({ goals: ['tsia2'], testDate: '2026-11-07', testFramework: 'act' }, /one of the tests you are preparing for/);
  refused({ goals: [], testDate: '2026-11-07' }, /Choose the test you are preparing for/);
});

test('days to the test are counted in the students\' calendar, not UTC', () => {
  assert.equal(daysUntilCcmrTest('2026-10-30', { now: NOON }), 23);
  assert.equal(daysUntilCcmrTest('2026-10-07', { now: NOON }), 0);
  // UTC already says 8 October; Chicago still says the 7th, so the 8th is tomorrow.
  assert.equal(daysUntilCcmrTest('2026-10-08', { now: LATE_EVENING }), 1);
  assert.equal(daysUntilCcmrTest('2026-10-01', { now: NOON }), -6);
  assert.equal(daysUntilCcmrTest('not-a-date', { now: NOON }), null);
});

test('a test is "soon" from 28 days out through test day, and never once it has passed', () => {
  const plan = (testDate) => ({ goals: [{ framework: 'act' }], testDate, testFramework: 'act' });
  const in28 = ccmrTestProximity(plan('2026-11-04'), { now: NOON });
  assert.equal(CCMR_TEST_SOON_DAYS, 28);
  assert.deepEqual(in28, { framework: 'act', testDate: '2026-11-04', daysUntil: 28, past: false, soon: true });
  assert.equal(ccmrTestProximity(plan('2026-11-05'), { now: NOON }).soon, false, 'day 29 is not soon');
  assert.equal(ccmrTestProximity(plan('2026-10-07'), { now: NOON }).soon, true, 'test day is soon');
  const past = ccmrTestProximity(plan('2026-10-06'), { now: NOON });
  assert.equal(past.soon, false);
  assert.equal(past.past, true);
  assert.equal(ccmrTestProximity({ goals: [{ framework: 'act' }] }, { now: NOON }), null, 'no date, no proximity');
});

test('the first save records the plan with the student\'s authorization context', () => {
  const plan = ok({ goals: ['act', 'tsia2'], testDate: '2026-11-07', testFramework: 'tsia2' });
  const { record, unchanged } = buildCcmrPlanRecord({
    studentId: 'S1',
    plan,
    student: { classId: 'class-a', assignedTeacherEmail: 'Teacher.A@Example.test' },
    classRecord: { classId: 'class-a', teacherOfRecord: 'teacher.a@example.test' },
    now: NOON,
  });
  assert.equal(unchanged, false);
  assert.deepEqual(record, {
    schemaVersion: 1,
    studentId: 'S1',
    classId: 'class-a',
    originClassId: 'class-a',
    originTeacherEmail: 'teacher.a@example.test',
    authorizedTeacherEmails: ['teacher.a@example.test'],
    goals: [{ framework: 'act', since: NOON }, { framework: 'tsia2', since: NOON }],
    testDate: '2026-11-07',
    testFramework: 'tsia2',
    lastChangeSource: 'student',
    createdAt: NOON,
    updatedAt: NOON,
  });
});

test('a later save keeps when each goal was chosen and when the plan began', () => {
  const first = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['act'] }),
    classRecord: { classId: 'class-a', teacherOfRecord: 'teacher.a@example.test' },
    now: NOON,
  }).record;
  const later = NOON + 3 * 24 * 60 * 60 * 1000;
  const { record } = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['digitalSAT', 'act'] }, { now: later }),
    existing: first,
    classRecord: { classId: 'class-a', teacherOfRecord: 'teacher.a@example.test' },
    now: later,
  });
  assert.deepEqual(record.goals, [{ framework: 'digitalSAT', since: later }, { framework: 'act', since: NOON }]);
  assert.equal(record.createdAt, NOON);
  assert.equal(record.updatedAt, later);
});

test('after a class move the new teacher gains access and the origin teacher keeps it', () => {
  const first = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['act'] }),
    classRecord: { classId: 'class-a', teacherOfRecord: 'teacher.a@example.test' },
    now: NOON,
  }).record;
  const { record, unchanged } = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['act'] }),
    existing: first,
    classRecord: { classId: 'class-b', teacherOfRecord: 'teacher.b@example.test' },
    now: NOON + 1000,
  });
  assert.equal(unchanged, false, 'same goals, but the access list moved, so it is written');
  assert.equal(record.classId, 'class-b');
  assert.equal(record.originClassId, 'class-a');
  assert.equal(record.originTeacherEmail, 'teacher.a@example.test');
  assert.deepEqual(record.authorizedTeacherEmails, ['teacher.a@example.test', 'teacher.b@example.test']);
});

test('re-saving the same plan writes nothing', () => {
  const classRecord = { classId: 'class-a', teacherOfRecord: 'teacher.a@example.test' };
  const first = buildCcmrPlanRecord({ studentId: 'S1', plan: ok({ goals: ['act'], testDate: '2026-11-07' }), classRecord, now: NOON }).record;
  const again = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['act'], testDate: '2026-11-07', source: CCMR_PLAN_SOURCE.BROWSER_MIGRATION }),
    existing: first,
    classRecord,
    now: NOON + 5000,
  });
  assert.equal(again.unchanged, true);
  const moved = buildCcmrPlanRecord({ studentId: 'S1', plan: ok({ goals: ['act'], testDate: '2026-11-08' }), existing: first, classRecord, now: NOON + 5000 });
  assert.equal(moved.unchanged, false, 'a new date is a change');
  // Same class id, new teacher of record: the plan is the same but the people
  // who may read it are not, so the record must still be rewritten.
  const newTeacher = buildCcmrPlanRecord({
    studentId: 'S1',
    plan: ok({ goals: ['act'], testDate: '2026-11-07' }),
    existing: first,
    classRecord: { classId: 'class-a', teacherOfRecord: 'teacher.c@example.test' },
    now: NOON + 5000,
  });
  assert.equal(newTeacher.unchanged, false);
  assert.deepEqual(newTeacher.record.authorizedTeacherEmails, ['teacher.a@example.test', 'teacher.c@example.test']);
});

test('a stored plan is read defensively and handed out without its access list', () => {
  const stored = {
    goals: [{ framework: 'act', since: NOON }, { framework: 'nope' }, 'act', { framework: 'asvab' }],
    testDate: '2026-11-07',
    testFramework: 'tsia2',
    authorizedTeacherEmails: ['teacher.a@example.test'],
    updatedAt: NOON,
  };
  const plan = normalizeStoredCcmrPlan(stored);
  assert.deepEqual(plan.goals, [{ framework: 'act', since: NOON }, { framework: 'asvab', since: null }]);
  assert.equal(plan.testFramework, 'act', 'a date pointing at a test that is not a goal falls back to the first goal');
  assert.equal(normalizeStoredCcmrPlan({ goals: [], testDate: '2026-11-07' }).testDate, null);
  assert.equal(normalizeStoredCcmrPlan(null), null);
  assert.deepEqual(ccmrPlanFrameworks(stored), ['act', 'asvab']);
  assert.equal('authorizedTeacherEmails' in publicCcmrPlan(stored), false);
  assert.equal(parseCcmrDateKey('2026-02-29'), null, '2026 is not a leap year');
  assert.ok(ccmrPlansEqual({ goals: ['act'] }, { goals: [{ framework: 'act', since: 1 }] }));
  assert.ok(!ccmrPlansEqual({ goals: ['act', 'tsia2'] }, { goals: ['tsia2', 'act'] }), 'order is the student\'s priority');
});
