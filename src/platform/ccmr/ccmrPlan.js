// The CCMR plan as the screens use it.
//
// The RULE for a plan lives in functions/shared/ccmrPlan.mjs, shared with the
// setMyCcmrPlan callable. This module is only what a screen needs on top of
// it: editing a plan without breaking it, shaping what a save sends, the words
// a student reads ("SAT math benchmark: 530 · 23 days to your test"), and the
// one decision about moving goals out of the old browser storage.
//
// Pure: no Firestore, no storage, no clock of its own.

import { EXAM_BENCHMARKS } from '../assessment/examDomainRegistry.js';
import {
  CCMR_PLAN_SOURCE,
  ccmrPlanFrameworks,
  ccmrTestDateBounds,
  ccmrTestProximity,
  daysUntilCcmrTest,
  isCcmrFramework,
  normalizeStoredCcmrPlan,
  parseCcmrDateKey,
  validateCcmrPlanInput,
} from '../../../functions/shared/ccmrPlan.mjs';

export { ccmrPlanFrameworks, ccmrTestDateBounds, normalizeStoredCcmrPlan, validateCcmrPlanInput };

// How students say the names. "Digital SAT" is the product; "SAT" is the test.
export const CCMR_SHORT_NAME = Object.freeze({
  digitalSAT: 'SAT',
  act: 'ACT',
  tsia2: 'TSIA2',
  asvab: 'ASVAB',
});

const shortName = (framework) => CCMR_SHORT_NAME[framework] || String(framework || '');

export const emptyCcmrPlan = () => ({ goals: [], testDate: null, testFramework: null });

const cleanPlan = (plan) => normalizeStoredCcmrPlan(plan) || emptyCcmrPlan();

/**
 * The plan with a new set of goals. A test date stays only while its test is
 * still a goal: a date left pointing at a test the student dropped would be
 * attributed to a different test, which is worse than asking again.
 */
export const ccmrPlanWithGoals = (plan, goals = []) => {
  const current = cleanPlan(plan);
  const next = [...new Set((Array.isArray(goals) ? goals : []).filter(isCcmrFramework))];
  const keepsTest = Boolean(current.testDate) && next.includes(current.testFramework);
  return {
    goals: next.map((framework) => ({
      framework,
      since: current.goals.find((goal) => goal.framework === framework)?.since ?? null,
    })),
    testDate: keepsTest ? current.testDate : null,
    testFramework: keepsTest ? current.testFramework : null,
  };
};

/** The plan with a test date set (or cleared, with an empty date). */
export const ccmrPlanWithTest = (plan, { testDate = null, testFramework = null } = {}) => {
  const current = cleanPlan(plan);
  const date = testDate && parseCcmrDateKey(testDate) != null ? String(testDate) : null;
  const frameworks = current.goals.map((goal) => goal.framework);
  const framework = frameworks.includes(testFramework) ? testFramework : (frameworks[0] || null);
  return {
    ...current,
    testDate: date && framework ? date : null,
    testFramework: date && framework ? framework : null,
  };
};

/**
 * What a save sends. A test date already behind the student is dropped: the
 * server refuses past dates, and toggling a goal must not fail because last
 * spring's test is still on file.
 */
export const ccmrPlanSaveRequest = (plan, { now = Date.now(), source = CCMR_PLAN_SOURCE.STUDENT } = {}) => {
  const current = cleanPlan(plan);
  const past = current.testDate != null && daysUntilCcmrTest(current.testDate, { now }) < 0;
  return {
    goals: current.goals.map((goal) => goal.framework),
    testDate: past ? null : current.testDate,
    testFramework: past ? null : current.testFramework,
    source,
  };
};

/**
 * Is this date one the screen should offer? Empty means "no date".
 *
 * The date already SAVED is not a draft. A test date that has since passed is
 * described as "Your test date has passed"; it used to raise this alert as
 * soon as the hub opened, before the student had typed anything (MP17).
 */
export const ccmrTestDateDraftProblem = (value, { now = Date.now(), saved = null } = {}) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (saved != null && text === String(saved).trim()) return null;
  if (parseCcmrDateKey(text) == null) return 'Enter a full date.';
  const { min, max } = ccmrTestDateBounds({ now });
  if (text < min || text > max) return 'Pick a date between today and two years from now.';
  return null;
};

/**
 * The line under the test-date field. On "Auto" the weekly Path's test
 * practice leans toward the dated test; a framework the teacher picked for the
 * class wins over the student's plan (weeklyTransferFramework.js), so there the
 * hub no longer promises it (MP17). The date still drives the countdown.
 */
export const ccmrTestDateGuidance = ({ teacherFramework = null } = {}) => {
  const framework = String(teacherFramework ?? '').trim();
  if (framework && framework !== 'auto' && isCcmrFramework(framework)) {
    return `Your teacher chose ${shortName(framework)} practice for your class's weekly Path. Your test date still counts down here.`;
  }
  return 'When your weekly Path includes test practice, it leans toward this test in the four weeks before it.';
};

// Spoken to the student by default; a teacher reading a student's plan is told
// about "the" test, not "your" test.
export const ccmrCountdownText = (daysUntil, { audience = 'student' } = {}) => {
  if (daysUntil == null) return '';
  const teacher = audience === 'teacher';
  if (daysUntil < 0) return teacher ? 'The test date has passed' : 'Your test date has passed';
  if (daysUntil === 0) return teacher ? 'The test is today' : 'Your test is today';
  const days = daysUntil === 1 ? '1 day' : `${daysUntil} days`;
  return `${days} to ${teacher ? 'the' : 'your'} test`;
};

export const ccmrTestDateLabel = (testDate) => {
  const ms = parseCcmrDateKey(testDate);
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

/**
 * One line per goal: the benchmark that test publishes, and the countdown on
 * the line of the test that has a date.
 *
 * Numbers come from EXAM_BENCHMARKS only. The ASVAB publishes no single math
 * benchmark (its index is not an AFQT score), so its line says so rather than
 * inventing one.
 */
export const describeCcmrPlan = (plan, { now = Date.now(), audience = 'student' } = {}) => {
  const current = cleanPlan(plan);
  const proximity = ccmrTestProximity(current, { now });
  const countdown = proximity ? ccmrCountdownText(proximity.daysUntil, { audience }) : '';
  const lines = current.goals.map(({ framework }) => {
    const threshold = EXAM_BENCHMARKS[framework]?.readinessThreshold;
    const benchmark = threshold != null
      ? `${shortName(framework)} math benchmark: ${threshold}`
      : `${shortName(framework)}: no single math benchmark score`;
    const isTest = proximity?.framework === framework;
    return {
      framework,
      benchmark,
      isTest,
      text: isTest ? `${benchmark} · ${countdown}` : benchmark,
    };
  });
  return {
    lines,
    test: proximity ? {
      ...proximity,
      countdown,
      dateLabel: ccmrTestDateLabel(proximity.testDate),
      testName: shortName(proximity.framework),
    } : null,
  };
};

/**
 * The one-time move out of browser storage.
 *
 *   migrate  the server has confirmed there is no plan, and this browser still
 *            holds goals this student chose before: save them, once.
 *   clear    the server already has a plan; the old browser copy is stale and
 *            must never be able to overwrite it later.
 *   none     anything else — including a teacher viewing read-only, a reply
 *            served from the offline cache (which cannot prove "no plan"), a
 *            migration already attempted this visit, a reply that belongs to
 *            another student (`current` false: the view moved on), or a read
 *            that failed (MP17: these two guards lived in the container, where
 *            a test could not reach them).
 */
export const decideLegacyCcmrMigration = ({
  current = true,
  error = null,
  readOnly = false,
  loaded = false,
  exists = false,
  fromCache = true,
  legacyGoals = [],
  attempted = false,
} = {}) => {
  const goals = [...new Set((Array.isArray(legacyGoals) ? legacyGoals : []).filter(isCcmrFramework))];
  if (!current || error || readOnly || !loaded || fromCache || !goals.length) return { action: 'none' };
  if (exists) return { action: 'clear' };
  if (attempted) return { action: 'none' };
  return {
    action: 'migrate',
    request: { goals, testDate: null, testFramework: null, source: CCMR_PLAN_SOURCE.BROWSER_MIGRATION },
  };
};

/*
 * THE LIVE CONTAINER'S PLAN SUBSCRIPTION, AS PURE STEPS (MyMathPathApp).
 *
 * MP17 (a verifier minor of push D): three of the container's guards could be
 * broken with every wiring test green, because they were expressions inside a
 * React component that node cannot run. They are here now, tested by what
 * they do (tests/platform/ccmrPlanClient.test.mjs), and the container calls
 * them.
 *
 * The state is the container's: { studentId, plan, loaded, exists, fromCache,
 * error }, for the student the subscription was opened for.
 */

/** Two plans are the same when everything a screen reads from them is. */
export const sameCcmrPlan = (left, right) => (
  JSON.stringify(normalizeStoredCcmrPlan(left)) === JSON.stringify(normalizeStoredCcmrPlan(right))
);

/**
 * The next state from one snapshot. The plan object is KEPT when nothing in it
 * changed: the snapshot that only confirms the cached copy (the server
 * answering) used to hand down a new object, and the weekly plan was rebuilt
 * for every such snapshot (MP17).
 */
export const ccmrPlanStateFromSnapshot = (previous, {
  studentId = null, plan = null, exists = false, fromCache = false,
} = {}) => {
  const same = previous?.studentId === studentId && sameCcmrPlan(previous?.plan ?? null, plan);
  return {
    studentId,
    plan: same ? (previous?.plan ?? null) : plan,
    loaded: true,
    exists: Boolean(exists),
    fromCache: fromCache === true,
    error: null,
  };
};

/** What a save returned lands only on the student it was saved for. */
export const ccmrPlanStateAfterSave = (previous, { studentId = null, plan = null } = {}) => (
  previous?.studentId === studentId ? { ...previous, plan, exists: Boolean(plan) } : previous
);

/**
 * What the container hands the screen.
 *
 *   plan      this student's plan, never the student the view showed before
 *   editable  the SERVER has answered. A copy from this device's cache, even
 *             of a real plan, can be older than a plan saved on another
 *             device, and a save built on it would overwrite that one. It used
 *             to unlock editing (MP17).
 *   settled   the week may be planned: the server answered, a cached copy of
 *             a real plan, a failed read, or the offline wait ran out
 *   error     this student's read error
 */
export const ccmrPlanContainerView = ({ state = null, studentId = null, waitExpired = false } = {}) => {
  const current = Boolean(state) && state.studentId === studentId;
  const known = current && Boolean(state.loaded) && !state.error && (Boolean(state.exists) || state.fromCache === false);
  return {
    current,
    plan: current ? (state.plan ?? null) : null,
    editable: current && Boolean(state.loaded) && !state.error && state.fromCache === false,
    settled: current && (known || Boolean(state.error) || Boolean(waitExpired)),
    error: current ? (state.error || null) : null,
  };
};
