/*
 * WHAT AN ABSENCE DOES TO A GRADE, AND WHO DECIDES.
 *
 * The teacher decides. This module holds the arithmetic and the defaults; every
 * number in it is overridable per class, because "unexcused costs points" is a
 * campus-level judgement call and one Algebra I teacher's answer is not the
 * whole district's.
 *
 * THREE RULES, IN PRIORITY ORDER.
 *
 *   1. AN UNMARKED ABSENCE DOES NOTHING. Not a zero, not a penalty, not an
 *      extension. The platform observes app activity; it does not observe who
 *      was in the room. Until a human reconciles the day, no grade moves. A
 *      teacher who is out sick on Thursday must not come back to a class whose
 *      grades were quietly adjusted by a machine that guessed.
 *
 *   2. EVERY ABSENCE EXTENDS THE DEADLINE. Excused or not, a student who was
 *      not in the room is still responsible for the work, and gets one more
 *      meeting of that class for each meeting they missed. This is deliberately
 *      not conditioned on the reason: the extension is about opportunity, and a
 *      student who skipped still has to do the assignment.
 *
 *   3. AN UNEXCUSED ABSENCE MAY COST POINTS. This is the only place the reason
 *      changes the number, it is off by default at the platform level until a
 *      teacher turns it on for their class, and it is floored so that a run of
 *      unexcused days can never erase work a student genuinely did.
 *
 * WHY THE PENALTY IS FLOORED. An unbounded per-absence deduction turns a
 * two-week illness that was mismarked into a zero, and the student it lands on
 * is the one least able to get it corrected. The floor keeps the penalty a
 * penalty rather than an erasure, and it is what makes the feature safe to run
 * automatically against real grades.
 */

export const ATTENDANCE_MARK = Object.freeze({
  PRESENT: 'present',
  EXCUSED: 'excused',
  UNEXCUSED: 'unexcused',
  UNMARKED: 'unmarked',
});

export const ABSENT_MARKS = Object.freeze([ATTENDANCE_MARK.EXCUSED, ATTENDANCE_MARK.UNEXCUSED]);

export const DEFAULT_ABSENCE_POLICY = Object.freeze({
  // Deadline relief. On by default: it can only ever help a student, and it is
  // the half of the policy that has no downside to get wrong.
  extensionEnabled: true,
  meetingsPerMissedMeeting: 1,
  maxExtensionMeetings: 5,
  extendForUnexcused: true,

  // Points. Off by default at the platform level; a teacher switches it on for
  // their class and picks the numbers. Nothing here applies to an excused
  // absence, ever.
  unexcusedPenaltyEnabled: false,
  unexcusedPenaltyPointsPerAbsence: 10,
  unexcusedPenaltyMaxPoints: 30,
  // The lowest score the penalty may produce, on a 0-100 scale. A student who
  // earned 90 and missed four days unexcused lands here, not at zero.
  unexcusedPenaltyFloor: 50,
});

const bounded = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/** A stored settings blob is never trusted to be complete or well typed. */
export const normalizeAbsencePolicy = (policy = null) => {
  const base = DEFAULT_ABSENCE_POLICY;
  return Object.freeze({
    extensionEnabled: flag(policy?.extensionEnabled, base.extensionEnabled),
    meetingsPerMissedMeeting: bounded(policy?.meetingsPerMissedMeeting, base.meetingsPerMissedMeeting, { min: 0, max: 5 }),
    maxExtensionMeetings: bounded(policy?.maxExtensionMeetings, base.maxExtensionMeetings, { min: 0, max: 30 }),
    extendForUnexcused: flag(policy?.extendForUnexcused, base.extendForUnexcused),
    unexcusedPenaltyEnabled: flag(policy?.unexcusedPenaltyEnabled, base.unexcusedPenaltyEnabled),
    unexcusedPenaltyPointsPerAbsence: bounded(
      policy?.unexcusedPenaltyPointsPerAbsence, base.unexcusedPenaltyPointsPerAbsence, { min: 0, max: 100 },
    ),
    unexcusedPenaltyMaxPoints: bounded(policy?.unexcusedPenaltyMaxPoints, base.unexcusedPenaltyMaxPoints, { min: 0, max: 100 }),
    unexcusedPenaltyFloor: bounded(policy?.unexcusedPenaltyFloor, base.unexcusedPenaltyFloor, { min: 0, max: 100 }),
  });
};

const isRealScore = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return false;
  return Number.isFinite(Number(value));
};

/**
 * Count the marked absences that bear on one assignment.
 *
 * Only days this class actually met, only days inside the assignment's own
 * window, and only marks a human has made. Anything still unmarked is counted
 * separately so a caller can hold a grade back rather than acting on a partial
 * picture.
 */
export const summarizeAssignmentAbsences = ({ marks = [], fromDateKey = null, toDateKey = null } = {}) => {
  const inWindow = (Array.isArray(marks) ? marks : []).filter((entry) => {
    const key = String(entry?.dateKey || '');
    if (!key) return false;
    if (entry?.classMet === false) return false;
    if (fromDateKey && key < fromDateKey) return false;
    if (toDateKey && key > toDateKey) return false;
    return true;
  });

  const of = (mark) => inWindow.filter((entry) => entry?.mark === mark);
  const excused = of(ATTENDANCE_MARK.EXCUSED);
  const unexcused = of(ATTENDANCE_MARK.UNEXCUSED);
  const unmarked = of(ATTENDANCE_MARK.UNMARKED);

  return {
    excused: excused.length,
    unexcused: unexcused.length,
    absent: excused.length + unexcused.length,
    unmarked: unmarked.length,
    // The teacher has not finished reconciling this window. Callers that write
    // to a family-visible gradebook should wait rather than publish a number
    // that is about to change.
    pending: unmarked.length > 0,
    dates: {
      excused: excused.map((entry) => entry.dateKey),
      unexcused: unexcused.map((entry) => entry.dateKey),
      unmarked: unmarked.map((entry) => entry.dateKey),
    },
  };
};

/** How many extra class meetings this student has earned on this assignment. */
export const extensionMeetingsFor = ({ absences = null, policy = null } = {}) => {
  const rules = normalizeAbsencePolicy(policy);
  if (!rules.extensionEnabled) return 0;
  const counted = (absences?.excused || 0)
    + (rules.extendForUnexcused ? (absences?.unexcused || 0) : 0);
  return Math.min(rules.maxExtensionMeetings, counted * rules.meetingsPerMissedMeeting);
};

/**
 * Apply the unexcused penalty to a score on a 0-100 scale.
 *
 * Returns the original score untouched whenever the policy is off, there are no
 * unexcused absences, or there is no real score — "this student has no grade
 * yet" is not a zero to be penalised.
 */
export const applyUnexcusedPenalty = ({ score = null, absences = null, policy = null } = {}) => {
  const rules = normalizeAbsencePolicy(policy);
  const unchanged = {
    score: isRealScore(score) ? Number(score) : null,
    originalScore: isRealScore(score) ? Number(score) : null,
    pointsDeducted: 0,
    unexcused: absences?.unexcused || 0,
    applied: false,
    reason: null,
  };

  if (!isRealScore(score)) return { ...unchanged, reason: 'no_score_to_penalize' };
  if (!rules.unexcusedPenaltyEnabled) return { ...unchanged, reason: 'penalty_not_enabled' };

  const count = Math.max(0, Math.trunc(Number(absences?.unexcused) || 0));
  if (count === 0) return { ...unchanged, reason: 'no_unexcused_absences' };

  const original = Number(score);
  const raw = Math.min(rules.unexcusedPenaltyMaxPoints, count * rules.unexcusedPenaltyPointsPerAbsence);
  // The floor never raises a score. A student already below it keeps what they
  // earned rather than being lifted to the floor by their own absence.
  const lowest = Math.min(original, rules.unexcusedPenaltyFloor);
  const penalized = Math.max(lowest, original - raw);

  return {
    score: penalized,
    originalScore: original,
    pointsDeducted: Number((original - penalized).toFixed(4)),
    unexcused: count,
    applied: penalized !== original,
    reason: penalized === original ? 'floor_reached' : 'unexcused_penalty_applied',
  };
};

/**
 * The whole attendance verdict for one student on one assignment, in one call:
 * how many meetings of extension they earned, and what the penalty does to
 * their score. Kept together so a surface cannot show the extension while
 * quietly forgetting the deduction, or the reverse.
 */
export const resolveAssignmentAttendance = ({
  score = null, marks = [], fromDateKey = null, toDateKey = null, policy = null,
} = {}) => {
  const rules = normalizeAbsencePolicy(policy);
  const absences = summarizeAssignmentAbsences({ marks, fromDateKey, toDateKey });
  return {
    policy: rules,
    absences,
    extensionMeetings: extensionMeetingsFor({ absences, policy: rules }),
    penalty: applyUnexcusedPenalty({ score, absences, policy: rules }),
  };
};

export default resolveAssignmentAttendance;
