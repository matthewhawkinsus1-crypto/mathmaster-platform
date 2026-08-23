// Where am I, and what does Back mean here?
//
// THE RULE, AND WHY IT IS NOT OBVIOUS. "Back means one logical level up. Do not
// use Home as the universal substitute for Back."
//
// Every exit in the student app resolved to the assignments list. That is
// correct exactly once — from the assignments list's own children — and wrong
// everywhere else. A student inside a Path SESSION who pressed the app-level
// exit landed on Home, two levels away from the Path they were working through,
// and had to navigate back down to resume. A student inside a question in an
// assignment did the same.
//
// Going to Home is never BROKEN, which is why this survives so long: nothing
// errors, nothing is lost, and the student simply does more work than they
// should to get where they were. It shows up as "the app feels like it forgets
// where I was".
//
// The model is a stack of named levels. `back` pops exactly one. The label is
// derived from the level being returned TO, so a button never says "Back" on
// its own — a student should be able to read where it goes before pressing it.
//
// Pure. No React, no routing library, no history object.

/** The places a student can be. Ordered shallow to deep within each branch. */
export const LEVEL = Object.freeze({
  HOME: 'home',

  // Assignments branch
  ASSIGNMENTS: 'assignments',
  ASSIGNMENT: 'assignment',
  ASSIGNMENT_QUESTION: 'assignmentQuestion',

  // My Math Path branch
  MATH_PATH: 'mathPath',
  PATH_SKILL: 'pathSkill',
  PATH_SESSION: 'pathSession',
  PATH_QUESTION: 'pathQuestion',

  // College and career readiness branch
  CCMR: 'ccmr',
  CCMR_PATHWAY: 'ccmrPathway',
  CCMR_SESSION: 'ccmrSession',

  // Standalone
  SECURE_EXAMS: 'secureExams',
  LIVE_CHALLENGE: 'liveChallenge',
  PRACTICE_HISTORY: 'practiceHistory',
});

/**
 * The parent of each level.
 *
 * Home has no parent, which is what makes "is there a Back here?" answerable
 * rather than assumed.
 */
const PARENT = Object.freeze({
  [LEVEL.ASSIGNMENTS]: LEVEL.HOME,
  [LEVEL.ASSIGNMENT]: LEVEL.ASSIGNMENTS,
  [LEVEL.ASSIGNMENT_QUESTION]: LEVEL.ASSIGNMENT,

  [LEVEL.MATH_PATH]: LEVEL.HOME,
  [LEVEL.PATH_SKILL]: LEVEL.MATH_PATH,
  [LEVEL.PATH_SESSION]: LEVEL.MATH_PATH,
  [LEVEL.PATH_QUESTION]: LEVEL.PATH_SESSION,

  [LEVEL.CCMR]: LEVEL.HOME,
  [LEVEL.CCMR_PATHWAY]: LEVEL.CCMR,
  [LEVEL.CCMR_SESSION]: LEVEL.CCMR_PATHWAY,

  [LEVEL.SECURE_EXAMS]: LEVEL.HOME,
  [LEVEL.LIVE_CHALLENGE]: LEVEL.HOME,
  [LEVEL.PRACTICE_HISTORY]: LEVEL.MATH_PATH,

  [LEVEL.HOME]: null,
});

/**
 * What a student calls each place.
 *
 * Never the internal name. "pathSession" is a state; "this session" is a place
 * a fourteen-year-old recognises.
 */
export const LEVEL_LABEL = Object.freeze({
  [LEVEL.HOME]: 'Home',
  [LEVEL.ASSIGNMENTS]: 'My assignments',
  [LEVEL.ASSIGNMENT]: 'this assignment',
  [LEVEL.ASSIGNMENT_QUESTION]: 'this question',
  [LEVEL.MATH_PATH]: 'My Math Path',
  [LEVEL.PATH_SKILL]: 'this skill',
  [LEVEL.PATH_SESSION]: 'this session',
  [LEVEL.PATH_QUESTION]: 'this question',
  [LEVEL.CCMR]: 'College &amp; Career',
  [LEVEL.CCMR_PATHWAY]: 'this pathway',
  [LEVEL.CCMR_SESSION]: 'this practice',
  [LEVEL.SECURE_EXAMS]: 'Exams',
  [LEVEL.LIVE_CHALLENGE]: 'Live Challenge',
  [LEVEL.PRACTICE_HISTORY]: 'My practice history',
});

export const parentOf = (level) => PARENT[level] ?? null;

/**
 * The trail from Home down to where the student is.
 *
 * Used for a restrained context line on deeper screens — "My Math Path ›
 * this session" — so a student can answer "where am I?" without pressing
 * anything. Home is included so the trail always has a root.
 */
export const breadcrumb = (level) => {
  const trail = [];
  let current = level;
  const guard = new Set();
  while (current && !guard.has(current)) {
    guard.add(current);
    trail.unshift(current);
    current = parentOf(current);
  }
  return trail;
};

/**
 * Where Back goes from here, and what the button should say.
 *
 * Returns null at Home — there is nowhere up from the top, and a Back button
 * that goes nowhere is worse than no Back button.
 */
export const resolveBack = (level) => {
  const parent = parentOf(level);
  if (!parent) return null;
  return {
    level: parent,
    // The destination, not the direction. A student should know where a button
    // goes before they press it.
    label: `Back to ${LEVEL_LABEL[parent]}`,
    shortLabel: LEVEL_LABEL[parent],
  };
};

/**
 * The depth of a level, for deciding whether a breadcrumb earns its space.
 * Home and its immediate children do not need one.
 */
export const depthOf = (level) => Math.max(0, breadcrumb(level).length - 1);

/**
 * EVERY error state must offer a way out that is not Retry.
 *
 * A dead end is not usually built on purpose — it is what remains when a screen
 * has an error branch and nobody asked what the student does next. This gives
 * that branch an answer it cannot forget, and it is deliberately never Home
 * unless Home is genuinely the parent.
 */
export const resolveErrorExit = (level, { retryCount = 0, retryLimit = 2 } = {}) => {
  const back = resolveBack(level) || { level: LEVEL.HOME, label: 'Back to Home', shortLabel: 'Home' };
  return {
    ...back,
    // Retry is offered while it is still plausibly the answer. After that it is
    // a trap: the same button producing the same error is not a choice.
    offerRetry: retryCount < retryLimit,
    // Said plainly. A student who has pressed Retry twice needs to be told the
    // problem is not theirs to solve.
    exhaustedMessage: retryCount >= retryLimit
      ? 'That has not worked twice now. This is not something you did — tell your teacher, and try something else in the meantime.'
      : null,
  };
};

export default resolveBack;
