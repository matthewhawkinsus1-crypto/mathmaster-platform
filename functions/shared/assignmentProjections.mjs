/*
 * THE CANONICAL PROJECTIONS AN ATTEMPT UPDATES BESIDES ITS OWN RECORD.
 *
 * Writing `gradesByAssignment` is not the whole of recording an attempt. The
 * ordinary submission path also updates the classwork completion projection,
 * the accumulated support usage and the DOL section projection — and those are
 * read by things a student can feel:
 *
 *   `prerequisiteAccess` opens the next assignment only when the prerequisite's
 *   `classworkGradesByAssignment` score is 100.
 *
 * So a deadline auto-submit that wrote only the question record would record a
 * student's final classwork response and still leave them locked out of the
 * dependent assignment. The rules live here so the browser and the finalizer
 * compute the same projections from the same inputs.
 */
// Credit per record is already the attempt policy's job; see getQuestionCredit.

const seconds = (value) => Math.max(0, Number(value) || 0);

/**
 * Has this student met the assignment's classwork completion rule?
 *
 * `classworkIndices` is supplied by the caller because each side already has
 * its own equivalent projection of which questions are classwork — the browser
 * from the current-content projection, the server from the runtime question
 * list. The RULE is what must not differ.
 */
export const evaluateClassworkCompletionRule = ({
  classworkIndices = [],
  assignmentTracker = {},
  totalTimeSeconds = 0,
  completionRule = {},
} = {}) => {
  const indices = Array.isArray(classworkIndices) ? classworkIndices : [];
  if (!indices.length) return { met: false, score: null };
  const minSeconds = Math.max(0, Number(completionRule.minEngagementMinutes ?? 10) * 60);
  const requiredPercent = Math.max(0, Math.min(100, Number(completionRule.minimumQuestionCompletionPercent ?? 80)));
  const completed = indices.reduce((total, index) => {
    const status = assignmentTracker?.[index]?.status;
    return total + (status && status !== 'unattempted' ? 1 : 0);
  }, 0);
  const completionPercent = Math.round((completed / indices.length) * 100);
  const engagedSeconds = seconds(totalTimeSeconds);
  const met = engagedSeconds >= minSeconds && completionPercent >= requiredPercent;
  return { met, score: met ? 100 : null, engagedSeconds, completionPercent, minSeconds, requiredPercent };
};

/** The classwork grade entry an attempt produces, or null when unmet. */
export const classworkGradeProjection = ({ completion, existingGrade = null, recordedAt = new Date().toISOString() } = {}) => {
  if (!completion?.met) return null;
  return {
    score: 100,
    // The first time it was met is the time it was met.
    metAt: existingGrade?.metAt || recordedAt,
    engagedSeconds: completion.engagedSeconds,
    completionPercent: completion.completionPercent,
  };
};

/** Accommodations and modifications accumulate across an assignment. */
export const mergeSupportUsage = (existing = {}, incoming = {}) => ({
  modified: Boolean(existing?.modified || incoming?.modified),
  accommodations: [...new Set([...(existing?.accommodations || []), ...(incoming?.accommodations || [])])],
  modifications: [...new Set([...(existing?.modifications || []), ...(incoming?.modifications || [])])],
});

/**
 * The DOL section projection for one instructional date.
 *
 * Deliberately written as `section-in-progress` and NOT finalized: the existing
 * DOL finalization path stays the one thing that closes a DOL section, so an
 * auto-submitted response joins the section score rather than racing it.
 */
export const dolSectionProjection = ({
  existing = null,
  dateKey,
  score,
  questionIndices = [],
  recordedAt = new Date().toISOString(),
} = {}) => {
  if (!dateKey) return null;
  const previous = existing?.[dateKey] || null;
  if (previous?.finalized === true) return null;
  return {
    ...previous,
    finalized: false,
    score,
    questionIndex: questionIndices[0] ?? null,
    questionIndices,
    recordedAt,
    status: 'section-in-progress',
  };
};
