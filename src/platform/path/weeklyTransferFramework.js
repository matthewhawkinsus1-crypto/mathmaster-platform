// Which assessment's format a weekly TRANSFER slot uses.
//
// THE ONE THING THIS MAY CHANGE IS THE FORMAT. Whether a skill is transfer
// work at all is the evidence's call: course mastery is strong and exam-format
// proficiency is behind it (diagnoseGaps). That decides the purpose, the
// purpose decides the slots, and nothing here touches either — so a student's
// plan can never add a transfer session the teacher's expectation and the
// evidence did not already put in the week. It only decides WHICH test's
// format that session practises.
//
// The order of preference, first launchable wins:
//
//   1. The teacher chose a framework for the class (not "Auto"): that one.
//      The student's own plan does not override a teacher decision.
//   2. "Auto" — the teacher's setting says it follows each student's goal:
//      a. the test the student dated, when it is 28 days away or closer;
//      b. the student's goals where the evidence also shows a transfer gap;
//      c. the student's other goals, in their own order.
//   3. Whatever the evidence diagnosed, exactly as before any plan existed.
//
// "Launchable" is the secure bank's coverage for that TEKS in that framework,
// the same gate every transfer slot already passes, so a preference can never
// point a student at practice the bank cannot issue.
//
// Pure. The clock is injected.

import { isFrameworkSkillLaunchable } from '../../../functions/shared/pathCoverage.mjs';
import {
  ccmrPlanFrameworks, ccmrTestProximity, isCcmrFramework,
} from '../../../functions/shared/ccmrPlan.mjs';
import { FRAMEWORK_LABELS } from '../ccmr/assessmentCrosswalk.js';

export const TRANSFER_FRAMEWORK_REASON = Object.freeze({
  TEACHER: 'teacherFramework',
  TEST_SOON: 'testSoon',
  GOAL_WITH_GAP: 'goalWithGap',
  GOAL: 'studentGoal',
  EVIDENCE: 'evidence',
});

const list = (value) => (Array.isArray(value) ? value : []);

/** The teacher's framework setting, or null for "Auto" / nothing set. */
const teacherOwnedFramework = (value) => {
  const text = String(value ?? '').trim();
  return text && text !== 'auto' && isCcmrFramework(text) ? text : null;
};

/**
 * The ordered frameworks a transfer slot should try, with why each is there.
 *
 * `gapFrameworks` are the frameworks diagnoseGaps found a transfer gap in, in
 * its order — the first is the one the week used before plans existed.
 */
export const resolveTransferFrameworkPreference = ({
  teacherFramework = null,
  ccmrPlan = null,
  gapFrameworks = [],
  now = Date.now(),
} = {}) => {
  const order = [];
  const push = (framework, reason) => {
    if (!isCcmrFramework(framework) || order.some((entry) => entry.framework === framework)) return;
    order.push({ framework, reason });
  };
  const gaps = list(gapFrameworks).filter(isCcmrFramework);
  const teacher = teacherOwnedFramework(teacherFramework);
  let proximity = null;

  if (teacher) {
    push(teacher, TRANSFER_FRAMEWORK_REASON.TEACHER);
  } else {
    proximity = ccmrPlan ? ccmrTestProximity(ccmrPlan, { now }) : null;
    if (proximity?.soon) push(proximity.framework, TRANSFER_FRAMEWORK_REASON.TEST_SOON);
    const goals = ccmrPlanFrameworks(ccmrPlan);
    goals.filter((framework) => gaps.includes(framework))
      .forEach((framework) => push(framework, TRANSFER_FRAMEWORK_REASON.GOAL_WITH_GAP));
    goals.forEach((framework) => push(framework, TRANSFER_FRAMEWORK_REASON.GOAL));
  }
  gaps.forEach((framework) => push(framework, TRANSFER_FRAMEWORK_REASON.EVIDENCE));

  return { order, proximity, teacherFramework: teacher };
};

/**
 * The framework one transfer candidate practises.
 *
 * `evidenceFramework` is the framework that made this candidate transfer work
 * in the first place (already coverage-checked). It is the answer whenever no
 * preference is launchable for this TEKS, which is also the answer the week
 * gave before plans existed. `coverage === undefined` keeps pure legacy callers
 * working, exactly as publishedTransferFrameworkFor does.
 */
export const chooseTransferFramework = ({
  preference = null,
  teksCode,
  coverage = undefined,
  evidenceFramework = null,
} = {}) => {
  const launchable = (framework) => (coverage === undefined
    ? true
    : isFrameworkSkillLaunchable(coverage, teksCode, framework));
  const preferred = list(preference?.order).find((entry) => launchable(entry.framework));
  if (preferred) return { ...preferred };
  return evidenceFramework ? { framework: evidenceFramework, reason: TRANSFER_FRAMEWORK_REASON.EVIDENCE } : null;
};

/**
 * The sentence the student reads on a transfer slot whose format came from
 * their own plan. Null keeps the engine's ordinary transfer sentence.
 *
 * No day count: the week is frozen on its first day, and "in 12 days" would
 * still be saying 12 on Friday.
 */
export const transferExplanationFor = (choice = null) => {
  const label = FRAMEWORK_LABELS[choice?.framework];
  if (!label) return null;
  if (choice.reason === TRANSFER_FRAMEWORK_REASON.TEST_SOON) {
    return `Your ${label} is coming up, so this practice uses the ${label} format.`;
  }
  if (choice.reason === TRANSFER_FRAMEWORK_REASON.GOAL_WITH_GAP || choice.reason === TRANSFER_FRAMEWORK_REASON.GOAL) {
    return `You are preparing for the ${label}, so this practice uses its format.`;
  }
  return null;
};

export default resolveTransferFrameworkPreference;
