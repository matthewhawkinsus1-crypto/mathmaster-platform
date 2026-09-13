/*
 * THE RECORDED GRADE FOR A TEST CYCLE. ONE RULE, ONE PLACE.
 *
 *     recordedGrade = max(originalTestGrade, min(rawRetestGrade, cap))
 *
 * That single line is the whole district policy, and everything else in this
 * file exists to make sure nothing else in the platform ever computes it a
 * second time:
 *
 *   Student Grade Center     reads recordedGrade
 *   Assignment Result        reads recordedGrade
 *   Teacher gradebook        reads recordedGrade
 *   Google Classroom         reads recordedGrade
 *
 * WHY THE CAP IS INSIDE THE max(), NOT OUTSIDE IT.
 *
 * Capping after the comparison — min(max(test, retest), 70) — reads almost the
 * same and is wrong in the one case that matters most to a student who did
 * well: an original 75 would be pulled DOWN to 70 by a retest that should not
 * have been able to touch it at all. Capping the retest contribution first,
 * then taking the better of the two, means a retest can only ever raise a
 * recorded grade, and only ever as far as the cap.
 *
 *   Test 52, Retest 84 -> min(84,70)=70, max(52,70) = 70
 *   Test 52, Retest 64 -> min(64,70)=64, max(52,64) = 64
 *   Test 68, Retest 69 -> min(69,70)=69, max(68,69) = 69
 *   Test 68, Retest 92 -> min(92,70)=70, max(68,70) = 70
 *   Test 75, Retest 92 -> min(92,70)=70, max(75,70) = 75
 *
 * THE RAW RETEST SCORE IS NEVER DESTROYED. A student who earned 84 earned 84;
 * the cap governs what is RECORDED, not what happened. Both numbers are kept,
 * along with the capped contribution and an audit reason, so a teacher can
 * always answer "why is this 70?".
 *
 * Pure by construction: no Firestore, no network.
 */

import {
  DEFAULT_MAX_RECORDED_RETEST_GRADE,
  DEFAULT_PASSING_SCORE,
  clampPercent,
  normalizeTestCyclePolicy,
} from './testCyclePolicy.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/** A score that was never earned is null, and null is not zero. */
const optionalPercent = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clampPercent(numeric) : null;
};

export const GRADE_SOURCE = Object.freeze({
  NONE: 'none',
  ORIGINAL_TEST: 'originalTest',
  RETEST: 'retest',
});

/**
 * What a raw retest score is allowed to contribute.
 *
 * Returns null when there is no retest score, because "no retest" and "a
 * retest worth zero" are different facts and only one of them is true here.
 */
export const cappedRetestContribution = (rawRetestGrade, maxRecordedGrade = DEFAULT_MAX_RECORDED_RETEST_GRADE) => {
  const raw = optionalPercent(rawRetestGrade);
  if (raw === null) return null;
  return Math.min(raw, clampPercent(maxRecordedGrade, DEFAULT_MAX_RECORDED_RETEST_GRADE));
};

/**
 * The canonical rule. Everything above is commentary on this function.
 */
export const recordedTestCycleGrade = ({
  originalTestGrade = null,
  rawRetestGrade = null,
  maxRecordedGrade = DEFAULT_MAX_RECORDED_RETEST_GRADE,
} = {}) => {
  const original = optionalPercent(originalTestGrade);
  const contribution = cappedRetestContribution(rawRetestGrade, maxRecordedGrade);
  if (original === null && contribution === null) return null;
  if (original === null) return contribution;
  if (contribution === null) return original;
  return Math.max(original, contribution);
};

/**
 * The full, displayable grade state — every number a teacher or student needs
 * to understand the recorded grade, computed once from the two raw scores.
 */
export const buildTestCycleGradeState = ({
  originalTestGrade = null,
  rawRetestGrade = null,
  policy = null,
} = {}) => {
  const resolved = normalizeTestCyclePolicy(policy) || null;
  const maxRecordedGrade = resolved
    ? resolved.retest.maxRecordedGrade
    : DEFAULT_MAX_RECORDED_RETEST_GRADE;
  const passingScore = resolved ? resolved.passingScore : DEFAULT_PASSING_SCORE;

  const original = optionalPercent(originalTestGrade);
  const raw = optionalPercent(rawRetestGrade);
  const contribution = cappedRetestContribution(raw, maxRecordedGrade);
  const recordedGrade = recordedTestCycleGrade({
    originalTestGrade: original,
    rawRetestGrade: raw,
    maxRecordedGrade,
  });

  let source = GRADE_SOURCE.NONE;
  if (recordedGrade !== null) {
    source = contribution !== null && (original === null || contribution > original)
      ? GRADE_SOURCE.RETEST
      : GRADE_SOURCE.ORIGINAL_TEST;
  }

  const capApplied = raw !== null && raw > maxRecordedGrade;

  return {
    originalTestGrade: original,
    rawRetestGrade: raw,
    retestCappedContribution: contribution,
    maxRecordedGrade,
    passingScore,
    recordedGrade,
    recordedGradeSource: source,
    // True only when the cap actually changed what the retest could contribute.
    retestCapApplied: capApplied,
    // True when a retest happened and could not improve the recorded grade.
    retestDidNotImprove: contribution !== null && original !== null && contribution <= original,
    passed: recordedGrade !== null && recordedGrade >= passingScore,
    reason: buildGradeReason({ original, raw, recordedGrade, maxRecordedGrade, source, capApplied }),
  };
};

const buildGradeReason = ({ original, raw, recordedGrade, maxRecordedGrade, source, capApplied }) => {
  if (recordedGrade === null) return 'No secure Test score has been released yet.';
  if (raw === null) return `Recorded from the original Test (${original}%).`;
  if (source === GRADE_SOURCE.ORIGINAL_TEST) {
    return capApplied
      ? `Retest raw ${raw}% capped at ${maxRecordedGrade}%, which did not beat the original Test (${original}%). Original Test kept.`
      : `Retest ${raw}% did not beat the original Test (${original}%). Original Test kept.`;
  }
  return capApplied
    ? `Retest raw ${raw}% recorded at the ${maxRecordedGrade}% retest cap.`
    : `Retest ${raw}% replaced the original Test (${original}%).`;
};

export const GRADE_HISTORY_REASON = Object.freeze({
  TEST_RELEASED: 'testReleased',
  RETEST_RELEASED: 'retestReleased',
  TEACHER_OVERRIDE: 'teacherOverride',
});

/**
 * Append one audit row, and only when something actually changed.
 *
 * A history that records a row per render is not an audit trail, it is noise
 * that hides the three moments anybody ever looks for: the test landing, the
 * retest landing, and a teacher changing something by hand.
 */
export const appendTestCycleGradeHistory = (history, entry) => {
  const rows = list(history).filter(isObject);
  const next = {
    at: Number(entry?.at) || Date.now(),
    reason: String(entry?.reason || GRADE_HISTORY_REASON.TEACHER_OVERRIDE),
    recordedGrade: optionalPercent(entry?.recordedGrade),
    originalTestGrade: optionalPercent(entry?.originalTestGrade),
    rawRetestGrade: optionalPercent(entry?.rawRetestGrade),
    retestCappedContribution: optionalPercent(entry?.retestCappedContribution),
    detail: String(entry?.detail || '').slice(0, 400) || null,
  };
  const previous = rows[rows.length - 1] || null;
  if (
    previous
    && previous.reason === next.reason
    && previous.recordedGrade === next.recordedGrade
    && previous.rawRetestGrade === next.rawRetestGrade
    && previous.originalTestGrade === next.originalTestGrade
  ) {
    return rows;
  }
  return [...rows, next].slice(-50);
};

/*
 * GOOGLE CLASSROOM: ONE GRADE ITEM, UPDATED IN PLACE, NEVER LOWERED.
 *
 * A Test Cycle is ONE Classroom assessment item. The retest updates that item
 * or it does nothing — it never creates a second column, because a second
 * column is how a parent ends up looking at "Unit 3 Test 52" and "Unit 3
 * Retest 70" and having to guess which one counts.
 *
 * `previouslyPostedGrade` is what MathMaster last confirmed it wrote to that
 * item. The max() rule already makes recordedGrade monotonic, so this guard
 * should never fire — which is exactly why it is here. If it ever does fire,
 * something upstream regressed and a student's posted grade is the thing that
 * would have paid for it.
 */
export const testCycleClassroomPassback = ({
  recordedGrade = null,
  previouslyPostedGrade = null,
} = {}) => {
  const next = optionalPercent(recordedGrade);
  const posted = optionalPercent(previouslyPostedGrade);

  if (next === null) {
    return { shouldPost: false, grade: posted, reason: 'No recorded Test Cycle grade to post yet.' };
  }
  if (posted === null) {
    return { shouldPost: true, grade: next, reason: 'Posting the original recorded Test grade.' };
  }
  if (next > posted) {
    return { shouldPost: true, grade: next, reason: `Updating the same Classroom grade item from ${posted}% to ${next}%.` };
  }
  if (next < posted) {
    return {
      shouldPost: false,
      grade: posted,
      reason: `Refused to lower the posted Classroom grade from ${posted}% to ${next}%.`,
      refusedLowering: true,
    };
  }
  return { shouldPost: false, grade: posted, reason: 'Classroom already holds this recorded grade.' };
};
