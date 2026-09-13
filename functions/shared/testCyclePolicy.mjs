/*
 * THE TEST CYCLE POLICY, IN ONE PLACE BOTH SIDES CAN READ.
 *
 * A Test Cycle is ONE teacher-authored assessment package that a student meets
 * as ONE card:
 *
 *   Review -> Secure Test -> Corrections (if needed) -> Secure Retest
 *
 * Every rule that decides what a student may enter, and what a retest is
 * allowed to do to a recorded grade, is read from the normalized policy this
 * module produces. Cloud Functions deploy only functions/, so this lives here
 * and src/platform/assessment/testCycle.js re-exports it — one definition, no
 * second copy of a grading rule for a screen to disagree with.
 *
 * Pure by construction: no Firestore, no network, no clock of its own.
 */

export const TEST_CYCLE_MODE = 'testCycle';

/** District policy. A test is passed at 70. */
export const DEFAULT_PASSING_SCORE = 70;

/*
 * THE CAP, AND WHY IT IS THE POLICY AUTHORITY.
 *
 * The district rule is "the maximum recorded grade obtainable through
 * retesting is 70". A plain replace-if-higher retest would hand a student who
 * scored 52 and then 84 a recorded 84, which is not the policy the campus
 * operates. So the cap is a first-class field with a default, not an optional
 * decoration on top of a replace rule, and `recordedTestCycleGrade` applies it
 * before the comparison rather than after.
 */
export const DEFAULT_MAX_RECORDED_RETEST_GRADE = 70;

/** Roughly 70% weak-skill targeting, 30% anchor coverage. See testCycleRetest. */
export const DEFAULT_TARGETED_WEAK_SHARE = 0.7;
export const DEFAULT_ANCHOR_SHARE = 0.3;

export const CORRECTION_STRATEGIES = Object.freeze(['performanceTargeted', 'standardTargeted']);
export const RETEST_STRATEGIES = Object.freeze(['performanceTargetedParallel', 'anchorOnly']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

export const clampPercent = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
};

const clampShare = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

export const isTestCyclePolicy = (policy) => (
  isObject(policy) && clean(policy.mode) === TEST_CYCLE_MODE
);

export const isTestCycleAssignment = (assignment) => (
  isTestCyclePolicy(isObject(assignment) ? assignment.assessmentPolicy : null)
);

/**
 * The policy a teacher authored, with every gap filled by district default.
 *
 * Returns null for anything that is not a Test Cycle, so a caller can use the
 * return value itself as the "is this a Test Cycle?" answer and cannot
 * accidentally apply cycle rules to an ordinary assignment.
 *
 * The two shares are normalized so they sum to 1. A teacher who writes 0.8/0.3
 * means "mostly weak skills, some anchors", not "110% of a test", and the
 * retest planner needs a proportion it can divide a question count by.
 */
export const normalizeTestCyclePolicy = (policy) => {
  if (!isTestCyclePolicy(policy)) return null;
  const review = isObject(policy.review) ? policy.review : {};
  // `policy.test` is deliberately not read: nothing about the secure Test is
  // configurable. See the `test` block below.
  const corrections = isObject(policy.corrections) ? policy.corrections : {};
  const retest = isObject(policy.retest) ? policy.retest : {};

  const requestedWeak = clampShare(retest.targetedWeakShare, DEFAULT_TARGETED_WEAK_SHARE);
  const requestedAnchor = clampShare(retest.anchorShare, DEFAULT_ANCHOR_SHARE);
  const shareTotal = requestedWeak + requestedAnchor;
  const targetedWeakShare = shareTotal > 0 ? requestedWeak / shareTotal : DEFAULT_TARGETED_WEAK_SHARE;

  return Object.freeze({
    mode: TEST_CYCLE_MODE,
    passingScore: clampPercent(policy.passingScore, DEFAULT_PASSING_SCORE),
    review: Object.freeze({
      // Review is instructional. Hints and rich tools are the point of it.
      required: review.required !== false,
      hintsAllowed: true,
      secure: false,
    }),
    test: Object.freeze({
      // Not configurable. A Test Cycle test IS the secure runtime; a policy
      // that could turn this off would be a second, unmonitored testing path.
      secure: true,
      feedback: 'teacherRelease',
      attemptsPerItem: 1,
    }),
    corrections: Object.freeze({
      requiredForRetest: corrections.requiredForRetest !== false,
      strategy: CORRECTION_STRATEGIES.includes(clean(corrections.strategy))
        ? clean(corrections.strategy)
        : 'performanceTargeted',
      // Corrections teach. They are deliberately NOT secure, and they never
      // touch the recorded grade — see testCycleGrade.
      secure: false,
      hintsAllowed: true,
      gradeImpact: 'none',
    }),
    retest: Object.freeze({
      secure: true,
      feedback: 'teacherRelease',
      attemptsPerItem: 1,
      strategy: RETEST_STRATEGIES.includes(clean(retest.strategy))
        ? clean(retest.strategy)
        : 'performanceTargetedParallel',
      maxRecordedGrade: clampPercent(retest.maxRecordedGrade, DEFAULT_MAX_RECORDED_RETEST_GRADE),
      targetedWeakShare,
      anchorShare: 1 - targetedWeakShare,
      // A retest is shorter than or equal to the Test unless the teacher says
      // otherwise in as many words. Both fields are explicit so "the retest is
      // longer than the test" can never be something the planner decided.
      questionCount: Number.isFinite(Number(retest.questionCount)) && Number(retest.questionCount) > 0
        ? Math.max(1, Math.min(60, Math.round(Number(retest.questionCount))))
        : null,
      allowLongerThanTest: retest.allowLongerThanTest === true,
    }),
  });
};

/** The default policy, used when a Test Cycle names a mode and nothing else. */
export const defaultTestCyclePolicy = () => normalizeTestCyclePolicy({ mode: TEST_CYCLE_MODE });

/*
 * TEACHER OVERRIDES ARE PER STUDENT, AND ARE READ, NEVER INFERRED.
 *
 * "Corrections waived" and "retest disabled" change what a student is allowed
 * to do. Guessing either from a date or an empty plan would put a decision in
 * a teacher's mouth, so each is an explicit stored flag whose absence means
 * "the teacher has not said that".
 */
export const normalizeTeacherControls = (controls) => {
  const source = isObject(controls) ? controls : {};
  return Object.freeze({
    requireCorrections: source.requireCorrections !== false,
    correctionsWaived: source.correctionsWaived === true,
    retestUnlocked: source.retestUnlocked === true,
    retestDisabled: source.retestDisabled === true,
    // A passing student never sees a retest unless a teacher says so out loud.
    retestAllowedAfterPass: source.retestAllowedAfterPass === true,
  });
};

export const TEACHER_CONTROL_ACTIONS = Object.freeze([
  'requireCorrections',
  'waiveCorrections',
  'unlockRetest',
  'disableRetest',
  'resetSecureSession',
]);

/** Apply one named teacher action to stored controls. Unknown actions throw. */
export const applyTeacherControlAction = (controls, action) => {
  const current = normalizeTeacherControls(controls);
  const name = clean(action);
  if (!TEACHER_CONTROL_ACTIONS.includes(name)) {
    throw new Error(`Unsupported Test Cycle teacher action: ${action}`);
  }
  if (name === 'requireCorrections') {
    return normalizeTeacherControls({ ...current, requireCorrections: true, correctionsWaived: false });
  }
  if (name === 'waiveCorrections') {
    return normalizeTeacherControls({ ...current, correctionsWaived: true });
  }
  if (name === 'unlockRetest') {
    // Unlocking is an override of the corrections gate AND of a prior disable.
    return normalizeTeacherControls({ ...current, retestUnlocked: true, retestDisabled: false });
  }
  if (name === 'disableRetest') {
    return normalizeTeacherControls({ ...current, retestDisabled: true, retestUnlocked: false });
  }
  // resetSecureSession clears no control: it re-issues a session, and the
  // stage machine decides what the student may enter afterwards.
  return current;
};
