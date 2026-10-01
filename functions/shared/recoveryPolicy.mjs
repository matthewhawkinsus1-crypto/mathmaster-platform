/*
 * PRACTICE-BASED RECOVERY — THE POLICY, IN ONE PLACE BOTH SIDES READ.
 *
 * Recovery is a second, generated opportunity at a Warm-Up or DOL, unlocked by
 * RECENT INDEPENDENT Practice mastery after the original opportunity has
 * closed. Every number that decides who may recover, and what recovery may do
 * to a recorded grade, is read from the normalized policy this module
 * produces — never a literal at a call site. Tune it here (or per assignment
 * in `gradingPolicy.recovery`) and every surface moves together.
 *
 * NAMING. "Recovery" here always means this Practice-based recovery. The
 * platform's older teacher-driven DOL controls (reopen a window, grant an
 * attempt — assessmentRecovery.js, `dol.recoveryByClassId`) are a different
 * thing and are left exactly as they were.
 *
 * Pure by construction: no Firestore, no network, no clock.
 */

export const RECOVERY_POLICY_VERSION = 1;

export const RECOVERY_SECTIONS = Object.freeze(['warmup', 'dol']);

export const RECOVERY_TYPE = Object.freeze({
  // The ordinary path after a missed or low Warm-Up/DOL: capped.
  RECOVERY: 'recovery',
  // The student had a teacher-recorded excused absence on the original day:
  // the make-up may earn full credit.
  EXCUSED_MAKE_UP: 'excusedMakeUp',
});

/*
 * THE DEFAULTS, AND WHY.
 *
 *   mastery 7 of the last 8 unique, independent Practice items
 *     — "recent", so a student who struggled early and then learned is not
 *     held back by a lifetime percentage; "unique", so re-answering the same
 *     question does not count twice; "independent", so an item answered with
 *     a hint or worked example does not count as mastery.
 *   Warm-Up recovery 3 questions, recorded score capped at 85
 *     — a Warm-Up measures readiness before instruction. Recovering it after
 *     the lesson is a different (easier) situation, so it can raise the grade
 *     but not to full credit.
 *   DOL recovery capped at 90
 *     — final = higher of original and min(recovery, 90): a recovery can only
 *     ever raise a grade, and only as far as the cap.
 *   one automatic recovery per original Warm-Up/DOL
 *     — Practice stays available afterwards; another graded attempt is a
 *     teacher decision, not a loop.
 */
const DEFAULTS = Object.freeze({
  enabled: true,
  automaticOpportunities: 1,
  // When true, recovery waits for the whole assignment's grading cutoff, not
  // just the section's own window.
  waitForAssignmentClose: false,
  mastery: Object.freeze({
    windowSize: 8,
    requiredCorrect: 7,
    lookbackDays: 21,
    // 'anyIndependentAttempt': correct without help, on any attempt before the
    // solution was shown. 'firstAttempt': correct on the first try only.
    correctOn: 'anyIndependentAttempt',
    requireSkillCoverage: true,
    // An excused make-up still asks the student to show they now know it.
    excusedRequiresMastery: true,
  }),
  warmup: Object.freeze({
    enabled: true,
    questionCount: 3,
    maxRecordedScore: 85,
    excusedMaxRecordedScore: 100,
  }),
  dol: Object.freeze({
    enabled: true,
    maxRecordedScore: 90,
    excusedMaxRecordedScore: 100,
  }),
});

export const DEFAULT_RECOVERY_POLICY = DEFAULTS;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clampInt = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};

const clampPercent = (value, fallback) => clampInt(value, 0, 100, fallback);

/** Where an assignment may override the platform defaults. */
export const authoredRecoveryPolicy = (assignment) => {
  if (isObject(assignment?.gradingPolicy?.recovery)) return assignment.gradingPolicy.recovery;
  if (isObject(assignment?.recoveryPolicy)) return assignment.recoveryPolicy;
  return {};
};

/**
 * The policy for one assignment: platform defaults with the assignment's
 * overrides applied, every value bounded.
 */
export const normalizeRecoveryPolicy = (assignmentOrPolicy = null) => {
  const authored = isObject(assignmentOrPolicy?.gradingPolicy) || isObject(assignmentOrPolicy?.recoveryPolicy)
    ? authoredRecoveryPolicy(assignmentOrPolicy)
    : (isObject(assignmentOrPolicy) ? assignmentOrPolicy : {});
  const mastery = isObject(authored.mastery) ? authored.mastery : {};
  const warmup = isObject(authored.warmup) ? authored.warmup : {};
  const dol = isObject(authored.dol) ? authored.dol : {};

  const windowSize = clampInt(mastery.windowSize, 3, 20, DEFAULTS.mastery.windowSize);
  const requiredCorrect = clampInt(mastery.requiredCorrect, 1, windowSize, Math.min(DEFAULTS.mastery.requiredCorrect, windowSize));

  return Object.freeze({
    version: RECOVERY_POLICY_VERSION,
    enabled: authored.enabled !== false,
    automaticOpportunities: clampInt(authored.automaticOpportunities, 0, 3, DEFAULTS.automaticOpportunities),
    waitForAssignmentClose: authored.waitForAssignmentClose === true,
    mastery: Object.freeze({
      windowSize,
      requiredCorrect,
      lookbackDays: clampInt(mastery.lookbackDays, 1, 180, DEFAULTS.mastery.lookbackDays),
      correctOn: mastery.correctOn === 'firstAttempt' ? 'firstAttempt' : 'anyIndependentAttempt',
      requireSkillCoverage: mastery.requireSkillCoverage !== false,
      excusedRequiresMastery: mastery.excusedRequiresMastery !== false,
    }),
    warmup: Object.freeze({
      enabled: warmup.enabled !== false,
      questionCount: clampInt(warmup.questionCount, 2, 5, DEFAULTS.warmup.questionCount),
      maxRecordedScore: clampPercent(warmup.maxRecordedScore, DEFAULTS.warmup.maxRecordedScore),
      excusedMaxRecordedScore: clampPercent(warmup.excusedMaxRecordedScore, DEFAULTS.warmup.excusedMaxRecordedScore),
    }),
    dol: Object.freeze({
      enabled: dol.enabled !== false,
      maxRecordedScore: clampPercent(dol.maxRecordedScore, DEFAULTS.dol.maxRecordedScore),
      excusedMaxRecordedScore: clampPercent(dol.excusedMaxRecordedScore, DEFAULTS.dol.excusedMaxRecordedScore),
    }),
  });
};

/** The cap a recovery of this section and type may contribute. */
export const recoveryCapFor = (policy, section, type = RECOVERY_TYPE.RECOVERY) => {
  const normalized = policy?.version === RECOVERY_POLICY_VERSION ? policy : normalizeRecoveryPolicy(policy);
  const sectionPolicy = normalized[section] || normalized.dol;
  return type === RECOVERY_TYPE.EXCUSED_MAKE_UP ? sectionPolicy.excusedMaxRecordedScore : sectionPolicy.maxRecordedScore;
};
