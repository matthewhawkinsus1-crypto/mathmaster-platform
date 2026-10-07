// A student's CCMR plan: the college, career and military readiness tests
// they are preparing for and, optionally, the date of the next one.
//
// WHY THIS IS SERVER STATE. "I'm preparing for the ACT" used to be kept in the
// browser's localStorage. On a shared Chromebook cart that tied the goal to the
// laptop rather than the student, and it vanished whenever a cart was wiped.
// Worse, the teacher's read-only view of a student read the TEACHER's browser,
// so it showed an empty plan (or someone else's) instead of the student's.
//
// ONE RULE, SEVERAL READERS. The setMyCcmrPlan callable validates with this
// module, the browser normalises what it reads with it, and the weekly Path
// asks it how close the test is. A plan is only ever judged by one rule.
//
// Pure: no Firestore and no clock of its own. The caller passes `now`.

import { ASSESSMENT_COVERAGE_FRAMEWORKS } from './pathCoverage.mjs';
import { buildAuthorizationContext, reauthorizeContext } from './authorizationContext.mjs';
import { zonedDateKey } from './instructionalCalendar.mjs';

export const CCMR_PLAN_COLLECTION = 'studentCcmrPlans';
export const CCMR_PLAN_SCHEMA_VERSION = 1;

// The assessments a plan may name. Not a new list: it is the server's existing
// framework list, so a framework the secure bank and coverage index do not know
// can never become a goal. The browser's list (ASSESSMENT_FRAMEWORKS in
// src/platform/ccmr/assessmentCrosswalk.js) is pinned equal by a test.
export const CCMR_PLAN_FRAMEWORKS = ASSESSMENT_COVERAGE_FRAMEWORKS;

// Within this many days of the test, the weekly Path prefers that test's
// format for its transfer practice.
export const CCMR_TEST_SOON_DAYS = 28;

// Texas schools. "Today" is today where the students are, not in UTC.
export const CCMR_PLAN_TIME_ZONE = 'America/Chicago';

export const CCMR_TEST_DATE_MAX_YEARS = 2;

/** Where a saved plan came from, so support can tell a migration from a choice. */
export const CCMR_PLAN_SOURCE = Object.freeze({
  STUDENT: 'student',
  BROWSER_MIGRATION: 'browserMigration',
});

const INPUT_KEYS = Object.freeze(['goals', 'testDate', 'testFramework', 'source']);

// Caps on what a request may carry. Four frameworks exist, so a list longer
// than this is not a plan, it is a payload, and it is refused before any work.
const MAX_RAW_GOALS = 8;
const MAX_FRAMEWORK_TEXT = 40;

const DAY = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const FRAMEWORK_SET = new Set(CCMR_PLAN_FRAMEWORKS);

export const isCcmrFramework = (value) => FRAMEWORK_SET.has(String(value ?? ''));

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Milliseconds at UTC midnight of a real calendar date, or null. */
export const parseCcmrDateKey = (value) => {
  const text = String(value ?? '').trim();
  if (!DATE_KEY.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  // Date.UTC rolls 2026-02-31 over to March 3rd. A date that does not survive
  // the round trip is not a real calendar date.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return ms;
};

const dateKeyFromUtcMs = (ms) => new Date(ms).toISOString().slice(0, 10);

const addDays = (key, days) => {
  const ms = parseCcmrDateKey(key);
  return ms == null ? '' : dateKeyFromUtcMs(ms + days * DAY);
};

const addYears = (key, years) => {
  const ms = parseCcmrDateKey(key);
  if (ms == null) return '';
  const date = new Date(ms);
  return dateKeyFromUtcMs(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
};

/** Today's calendar date where the students are. */
export const ccmrTodayKey = (now = Date.now(), timeZone = CCMR_PLAN_TIME_ZONE) => zonedDateKey(now, timeZone);

/**
 * The dates a test may be set to: today through two years from today.
 *
 * `slackDays` widens the window on the server only. A student in Mountain time
 * at 11pm, or a laptop whose clock is a little off, must not be refused a date
 * the browser itself offered. The browser uses the strict window.
 */
export const ccmrTestDateBounds = ({ now = Date.now(), timeZone = CCMR_PLAN_TIME_ZONE, slackDays = 0 } = {}) => {
  const today = ccmrTodayKey(now, timeZone);
  return {
    min: addDays(today, -Math.max(0, slackDays)),
    max: addDays(addYears(today, CCMR_TEST_DATE_MAX_YEARS), Math.max(0, slackDays)),
  };
};

/** Whole calendar days from today to the test (0 = today, negative = past). */
export const daysUntilCcmrTest = (testDate, { now = Date.now(), timeZone = CCMR_PLAN_TIME_ZONE } = {}) => {
  const test = parseCcmrDateKey(testDate);
  const today = parseCcmrDateKey(ccmrTodayKey(now, timeZone));
  if (test == null || today == null) return null;
  return Math.round((test - today) / DAY);
};

const reject = (message) => ({ ok: false, code: 'invalid-argument', message });

/**
 * Validate what a student sent. Returns the clean plan or a reason.
 *
 * Accepts goals as framework ids or as `{ framework }` objects, keeps the
 * student's order, and drops repeats. Refuses rather than guesses: an unknown
 * framework, a date that is not a real day, or a test date for a test the
 * student is not preparing for is an error the screen can show.
 */
export const validateCcmrPlanInput = (input, {
  now = Date.now(),
  timeZone = CCMR_PLAN_TIME_ZONE,
  slackDays = 1,
} = {}) => {
  if (!isPlainObject(input)) return reject('Send your plan as the tests you are preparing for and an optional test date.');
  const unknownKey = Object.keys(input).find((key) => !INPUT_KEYS.includes(key));
  if (unknownKey) return reject(`Unknown CCMR plan field: ${String(unknownKey).slice(0, MAX_FRAMEWORK_TEXT)}.`);

  const rawGoals = input.goals ?? [];
  if (!Array.isArray(rawGoals)) return reject('Goals must be a list of tests.');
  if (rawGoals.length > MAX_RAW_GOALS) return reject(`Choose at most ${CCMR_PLAN_FRAMEWORKS.length} tests.`);

  const goals = [];
  for (const entry of rawGoals) {
    const framework = isPlainObject(entry) ? entry.framework : entry;
    if (typeof framework !== 'string' || !isCcmrFramework(framework)) {
      return reject(`MathMaster does not know the test "${String(framework ?? '').slice(0, MAX_FRAMEWORK_TEXT)}".`);
    }
    if (!goals.some((goal) => goal.framework === framework)) goals.push({ framework });
  }

  const source = input.source ?? CCMR_PLAN_SOURCE.STUDENT;
  if (!Object.values(CCMR_PLAN_SOURCE).includes(source)) return reject('Unknown plan source.');

  const rawDate = input.testDate == null ? '' : String(input.testDate).trim();
  if (!rawDate) {
    // No date, so nothing for a test framework to describe.
    return { ok: true, plan: { goals, testDate: null, testFramework: null, source } };
  }
  if (rawDate.length !== 10 || parseCcmrDateKey(rawDate) == null) {
    return reject('Use a real calendar date for your test date (YYYY-MM-DD).');
  }
  const bounds = ccmrTestDateBounds({ now, timeZone, slackDays });
  if (rawDate < bounds.min || rawDate > bounds.max) {
    return reject(`Choose a test date between today and ${CCMR_TEST_DATE_MAX_YEARS} years from now.`);
  }
  if (!goals.length) return reject('Choose the test you are preparing for before adding a test date.');

  const testFramework = input.testFramework == null || input.testFramework === ''
    ? goals[0].framework
    : input.testFramework;
  if (!goals.some((goal) => goal.framework === testFramework)) {
    return reject('Your test date must be for one of the tests you are preparing for.');
  }

  return { ok: true, plan: { goals, testDate: rawDate, testFramework, source } };
};

/**
 * A stored plan, made safe to read. Null when there is no usable plan.
 *
 * The callable only ever writes valid plans, so this is defence against a
 * document edited by hand or written by an older build — never a second rule.
 */
export const normalizeStoredCcmrPlan = (raw) => {
  if (!isPlainObject(raw)) return null;
  const goals = [];
  (Array.isArray(raw.goals) ? raw.goals : []).forEach((entry) => {
    const framework = isPlainObject(entry) ? entry.framework : entry;
    if (!isCcmrFramework(framework) || goals.some((goal) => goal.framework === framework)) return;
    const since = Number(isPlainObject(entry) ? entry.since : null);
    goals.push({ framework, since: Number.isFinite(since) && since > 0 ? since : null });
  });
  const testDate = goals.length && parseCcmrDateKey(raw.testDate) != null ? String(raw.testDate) : null;
  const testFramework = testDate
    ? (goals.some((goal) => goal.framework === raw.testFramework) ? raw.testFramework : goals[0].framework)
    : null;
  const number = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
  return {
    goals,
    testDate,
    testFramework,
    updatedAt: number(raw.updatedAt),
    createdAt: number(raw.createdAt),
  };
};

/** The framework ids of a plan, in the student's order. */
export const ccmrPlanFrameworks = (plan) => (normalizeStoredCcmrPlan(plan)?.goals || []).map((goal) => goal.framework);

/** Same goals, same order, same test? Timestamps and access lists aside. */
export const ccmrPlansEqual = (left, right) => {
  const a = normalizeStoredCcmrPlan(left) || { goals: [], testDate: null, testFramework: null };
  const b = normalizeStoredCcmrPlan(right) || { goals: [], testDate: null, testFramework: null };
  return a.goals.length === b.goals.length
    && a.goals.every((goal, index) => goal.framework === b.goals[index].framework)
    && a.testDate === b.testDate
    && a.testFramework === b.testFramework;
};

const sameEmails = (left, right) => {
  const a = [...new Set((Array.isArray(left) ? left : []).map((value) => String(value).toLowerCase()))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).map((value) => String(value).toLowerCase()))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

/**
 * The document setMyCcmrPlan writes, or `unchanged: true` when it would write
 * nothing new.
 *
 * Authorization is copied from the student's roster row exactly as for the
 * other per-student documents (functions/shared/authorizationContext.mjs): the
 * first save records the class and teacher of record; a later save after a
 * class move keeps that origin teacher and adds the current one, the same rule
 * a class reassignment applies.
 *
 * `since` on each goal is when the student first chose it, kept across saves,
 * so "preparing for the ACT since September" stays true after a date change.
 */
export const buildCcmrPlanRecord = ({
  studentId,
  plan,
  existing = null,
  student = null,
  classRecord = null,
  now = Date.now(),
} = {}) => {
  const id = String(studentId || '').trim();
  if (!id) throw new Error('A student is required to save a CCMR plan.');
  const previous = isPlainObject(existing) ? existing : null;

  let authorization;
  if (previous && previous.originTeacherEmail !== undefined) {
    const change = reauthorizeContext(previous, { classRecord: classRecord || (student ? {
      classId: student.classId ?? null,
      teacherOfRecord: student.assignedTeacherEmail ?? null,
    } : null) });
    authorization = {
      studentId: id,
      classId: change ? change.classId : (previous.classId ?? null),
      originClassId: previous.originClassId ?? null,
      originTeacherEmail: previous.originTeacherEmail ?? null,
      authorizedTeacherEmails: change ? change.authorizedTeacherEmails : (previous.authorizedTeacherEmails || []),
    };
  } else {
    authorization = buildAuthorizationContext({ studentId: id, classRecord, student });
  }

  const previousSince = new Map((normalizeStoredCcmrPlan(previous)?.goals || [])
    .map((goal) => [goal.framework, goal.since]));
  const goals = (plan?.goals || []).map((goal) => ({
    framework: goal.framework,
    since: previousSince.get(goal.framework) || now,
  }));

  const unchanged = Boolean(previous)
    && ccmrPlansEqual(previous, plan)
    && (previous.classId ?? null) === (authorization.classId ?? null)
    && sameEmails(previous.authorizedTeacherEmails, authorization.authorizedTeacherEmails);

  const record = {
    schemaVersion: CCMR_PLAN_SCHEMA_VERSION,
    ...authorization,
    studentId: id,
    goals,
    testDate: plan?.testDate || null,
    testFramework: plan?.testDate ? (plan.testFramework || goals[0]?.framework || null) : null,
    lastChangeSource: plan?.source || CCMR_PLAN_SOURCE.STUDENT,
    createdAt: Number(previous?.createdAt) || now,
    updatedAt: now,
  };
  return { record, unchanged };
};

/** What a student or teacher screen is given: the plan, never the access list. */
export const publicCcmrPlan = (record) => {
  const plan = normalizeStoredCcmrPlan(record);
  return plan ? { ...plan } : null;
};

/**
 * How close the student's test is, or null when there is no dated test.
 *
 * `soon` is the 28-day window the weekly Path uses; a test that has passed is
 * reported as `past` and is never soon.
 */
export const ccmrTestProximity = (plan, {
  now = Date.now(),
  timeZone = CCMR_PLAN_TIME_ZONE,
  soonDays = CCMR_TEST_SOON_DAYS,
} = {}) => {
  const clean = normalizeStoredCcmrPlan(plan);
  if (!clean?.testDate || !clean.testFramework) return null;
  const daysUntil = daysUntilCcmrTest(clean.testDate, { now, timeZone });
  if (daysUntil == null) return null;
  return {
    framework: clean.testFramework,
    testDate: clean.testDate,
    daysUntil,
    past: daysUntil < 0,
    soon: daysUntil >= 0 && daysUntil <= soonDays,
  };
};

export default validateCcmrPlanInput;
