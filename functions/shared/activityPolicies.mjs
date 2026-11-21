/*
 * WHAT EACH KIND OF ACTIVITY ALLOWS.
 *
 * Shared because the deadline finalizer applies the SAME attempt policy a
 * manual Submit applies: a DOL gets one attempt whether the student pressed
 * Submit or the bell did. The two role-resolution helpers that need the
 * Assignment V5 projection stay in src/platform/policies/activityPolicies.js,
 * which re-exports everything here.
 */

export const ACTIVITY_ROLES = Object.freeze({
  WARMUP: 'warmup',
  CLASSWORK: 'classwork',
  DOL: 'dol',
  PRACTICE: 'practice',
  QUIZ: 'quiz',
  TEST: 'test',
  // The two instructional stages of a Test Cycle. Neither contributes points
  // to the recorded assessment grade — the secure Test and Retest do that, and
  // the canonical rule in testCycleGrade.mjs has no input from either.
  REVIEW: 'review',
  CORRECTIONS: 'corrections',
});

const makePolicy = (policy) => Object.freeze({
  ...policy,
  grading: Object.freeze({ ...policy.grading }),
  mastery: Object.freeze({ ...policy.mastery }),
});

export const ACTIVITY_POLICIES = Object.freeze({
  [ACTIVITY_ROLES.WARMUP]: makePolicy({
    role: ACTIVITY_ROLES.WARMUP,
    name: 'Warm-Up',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: false,
    grading: { mode: 'engagement', pointsPossible: 5, syncDefault: 'weeklyCombined', compositeWeight: 0 },
    mastery: { evidenceWeight: 0.8, evidenceType: 'diagnostic' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.CLASSWORK]: makePolicy({
    role: ACTIVITY_ROLES.CLASSWORK,
    name: 'Classwork',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'bundleWithLesson', compositeWeight: 0.4 },
    mastery: { evidenceWeight: 0.9, evidenceType: 'instructional' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.DOL]: makePolicy({
    role: ACTIVITY_ROLES.DOL,
    name: 'Exit Ticket / DOL',
    attempts: 1,
    allowReplacement: false,
    feedback: 'afterAssignmentSubmit',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0.35 },
    mastery: { evidenceWeight: 1.25, evidenceType: 'independent' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.PRACTICE]: makePolicy({
    role: ACTIVITY_ROLES.PRACTICE,
    name: 'Independent Practice',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    grading: { mode: 'accuracyWithRecovery', pointsPossible: 100, syncDefault: 'bundleOrLateDeadline', compositeWeight: 0.25 },
    mastery: { evidenceWeight: 1, evidenceType: 'independent' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.QUIZ]: makePolicy({
    role: ACTIVITY_ROLES.QUIZ,
    name: 'Quiz',
    attempts: 1,
    allowReplacement: false,
    feedback: 'teacherRelease',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0 },
    mastery: { evidenceWeight: 1.35, evidenceType: 'summative' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.REVIEW]: makePolicy({
    role: ACTIVITY_ROLES.REVIEW,
    name: 'Test Review',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    // Review prepares a student for the secure Test. It is modelled on the
    // blueprint and it earns no assessment points: a review that counted would
    // let a student raise a test grade without ever taking the test.
    grading: { mode: 'engagement', pointsPossible: 0, syncDefault: 'none', compositeWeight: 0 },
    mastery: { evidenceWeight: 0.9, evidenceType: 'instructional' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.CORRECTIONS]: makePolicy({
    role: ACTIVITY_ROLES.CORRECTIONS,
    name: 'Test Corrections',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    // Corrections unlock a retest; they never move a recorded grade themselves.
    grading: { mode: 'completion', pointsPossible: 0, syncDefault: 'none', compositeWeight: 0 },
    mastery: { evidenceWeight: 0.9, evidenceType: 'instructional' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.TEST]: makePolicy({
    role: ACTIVITY_ROLES.TEST,
    name: 'Unit Test',
    attempts: 1,
    allowReplacement: false,
    feedback: 'teacherRelease',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0 },
    mastery: { evidenceWeight: 1.4, evidenceType: 'summative' },
    calculatorDefault: 'questionSpecific',
  }),
});

export const isActivityRole = (value) => Object.values(ACTIVITY_ROLES).includes(String(value || '').toLowerCase());

export const normalizeActivityRole = (role, fallback = ACTIVITY_ROLES.CLASSWORK) => {
  const normalized = String(role || '').trim().toLowerCase();
  return isActivityRole(normalized) ? normalized : fallback;
};

/*
 * AN ASSIGNMENT MAY DECLARE UNLIMITED ATTEMPTS.
 *
 * The number of tries belongs to the section's role (above). One assignment-
 * level declaration changes it: `gradingPolicy.attemptPolicy: "unlimited"` in
 * the Assignment V5 file, stored with the assignment. It applies to the
 * Warm-Up, Classwork and Practice sections of that assignment and to nothing
 * else — a DOL, a quiz, a test, a Test Cycle's Review and Corrections keep
 * their own count whatever the file says, and an assignment that carries an
 * assessment policy (a Test Cycle) is never unlimited.
 *
 * ONE RESOLVER. `getEffectiveActivityPolicy(role, assignment)` is where the
 * declaration is read. Every place that counts tries — the question on the
 * student's screen, submission ingestion and the deadline finalizer on the
 * server, the teacher's case review and Pre-Flight — takes its number from
 * the policy this returns, so none of them can disagree. Called with a role
 * alone it returns exactly the object it always did.
 *
 * "Unlimited" is a number, not Infinity: it survives JSON, Firestore and the
 * integer arithmetic of the attempt policy (`maximum - used`, `used + 1 >=
 * maximum`), and no student reaches it. Anything that puts a count in front
 * of a person asks `attemptsAreUnlimited` first — of the maximum or of what
 * is left, which is why the test is a floor well below the number itself.
 */
export const ATTEMPT_POLICY = Object.freeze({ ROLE: 'rolePolicy', UNLIMITED: 'unlimited' });
export const ATTEMPT_POLICY_VALUES = Object.freeze(Object.values(ATTEMPT_POLICY));
export const UNLIMITED_ATTEMPTS = 1000000;
const UNLIMITED_ATTEMPTS_FLOOR = UNLIMITED_ATTEMPTS / 2;
export const UNLIMITED_ATTEMPT_ROLES = Object.freeze([
  ACTIVITY_ROLES.WARMUP,
  ACTIVITY_ROLES.CLASSWORK,
  ACTIVITY_ROLES.PRACTICE,
]);

/** True for the unlimited maximum and for what is left of it after any real number of tries. */
export const attemptsAreUnlimited = (count) => Number(count) >= UNLIMITED_ATTEMPTS_FLOOR;

/** "unlimited", or the number: for anything that prints an attempt limit. */
export const attemptLimitLabel = (count) => (attemptsAreUnlimited(count) ? 'unlimited' : String(count));

/**
 * Does this assignment declare unlimited attempts? Read from the stored
 * assignment or from its Assignment V5 form — both keep `gradingPolicy` at the
 * top level. Only the exact value counts; anything else is the role policy.
 */
export const assignmentDeclaresUnlimitedAttempts = (assignment) => {
  if (!assignment || typeof assignment !== 'object') return false;
  if (assignment.gradingPolicy?.attemptPolicy !== ATTEMPT_POLICY.UNLIMITED) return false;
  const assessmentPolicy = assignment.assessmentPolicy;
  return !(assessmentPolicy && typeof assessmentPolicy === 'object');
};

const UNLIMITED_ACTIVITY_POLICIES = Object.freeze(Object.fromEntries(
  UNLIMITED_ATTEMPT_ROLES.map((role) => [role, Object.freeze({
    ...ACTIVITY_POLICIES[role],
    attempts: UNLIMITED_ATTEMPTS,
    attemptsUnlimited: true,
  })]),
));

export const getEffectiveActivityPolicy = (role, assignment = null) => {
  const policy = ACTIVITY_POLICIES[normalizeActivityRole(role)];
  if (!assignment || !UNLIMITED_ACTIVITY_POLICIES[policy.role]) return policy;
  return assignmentDeclaresUnlimitedAttempts(assignment) ? UNLIMITED_ACTIVITY_POLICIES[policy.role] : policy;
};

export const toEnforcedActivityPolicy = (role, assignment = null) => {
  const policy = getEffectiveActivityPolicy(role, assignment);
  return {
    role: policy.role,
    attemptsAllowed: policy.attempts,
    allowReplacement: policy.allowReplacement,
    feedbackMode: policy.feedback,
    hintsAllowed: policy.hintsAllowed,
    remediationAllowed: policy.remediationAllowed,
    adaptiveDuringAttempt: policy.adaptiveDuringAttempt,
    calculatorDefault: policy.calculatorDefault,
    grading: { ...policy.grading },
    mastery: { ...policy.mastery },
  };
};
