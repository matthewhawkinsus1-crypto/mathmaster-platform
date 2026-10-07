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

/** Is this date one the screen should offer? Empty means "no date". */
export const ccmrTestDateDraftProblem = (value, { now = Date.now() } = {}) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (parseCcmrDateKey(text) == null) return 'Enter a full date.';
  const { min, max } = ccmrTestDateBounds({ now });
  if (text < min || text > max) return 'Pick a date between today and two years from now.';
  return null;
};

export const ccmrCountdownText = (daysUntil) => {
  if (daysUntil == null) return '';
  if (daysUntil < 0) return 'Your test date has passed';
  if (daysUntil === 0) return 'Your test is today';
  if (daysUntil === 1) return '1 day to your test';
  return `${daysUntil} days to your test`;
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
export const describeCcmrPlan = (plan, { now = Date.now() } = {}) => {
  const current = cleanPlan(plan);
  const proximity = ccmrTestProximity(current, { now });
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
      text: isTest ? `${benchmark} · ${ccmrCountdownText(proximity.daysUntil)}` : benchmark,
    };
  });
  return {
    lines,
    test: proximity ? {
      ...proximity,
      countdown: ccmrCountdownText(proximity.daysUntil),
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
 *            served from the offline cache (which cannot prove "no plan"), or
 *            a migration already attempted this visit.
 */
export const decideLegacyCcmrMigration = ({
  readOnly = false,
  loaded = false,
  exists = false,
  fromCache = true,
  legacyGoals = [],
  attempted = false,
} = {}) => {
  const goals = [...new Set((Array.isArray(legacyGoals) ? legacyGoals : []).filter(isCcmrFramework))];
  if (readOnly || !loaded || fromCache || !goals.length) return { action: 'none' };
  if (exists) return { action: 'clear' };
  if (attempted) return { action: 'none' };
  return {
    action: 'migrate',
    request: { goals, testDate: null, testFramework: null, source: CCMR_PLAN_SOURCE.BROWSER_MIGRATION },
  };
};
