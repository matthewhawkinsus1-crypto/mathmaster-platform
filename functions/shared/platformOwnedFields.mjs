/*
 * SERVER-SIDE MIRROR OF THE PROTECTED-FIELD CONTRACT.
 *
 * functions/ deploys as its own package (see firebase.json: source "functions"
 * only) and cannot import from src/, so this mirrors the field list and
 * behavior of src/platform/contract/platformOwnedFields.js exactly. Keep both
 * lists in sync by hand — tests/platform/platformOwnedFieldsParity.test.mjs
 * fails if they drift.
 *
 * Every field MathMaster owns. A teacher-supplied or AI-supplied replacement
 * question that invents these produces JSON that looks authoritative and
 * silently contradicts platform state (attempts, exclusion, mastery), so the
 * contract names them explicitly and every server-side question repair
 * restores MathMaster's own value instead of whatever the replacement did or
 * did not include.
 */
export const PLATFORM_OWNED_FIELDS = Object.freeze([
  'id', 'assignmentId', 'questionId', 'createdAt', 'updatedAt',
  'attempts', 'maxAttempts', 'attemptsAllowed', 'attemptPolicy',
  'hintPolicy', 'hintsAllowed', 'replacementPolicy', 'allowReplacement',
  'feedbackPolicy', 'feedbackReleased', 'feedbackReleasedAt',
  'masteryPolicy', 'masteryWeight', 'readinessBand', 'studentReadiness',
  'isAdvanced', 'advanced', 'honors', 'isHonors', 'courseLevel',
  'alignmentKeys', 'masteryEvidenceKeys', 'evidenceKeys',
  'gradesByAssignment', 'questionRecords', 'persistence', 'serverState',
  // Teacher decisions about an existing assignment, not authoring input. A
  // replacement that sets these overrides a choice a person made in the UI.
  'teacherExcluded', 'archived', 'archivedAt',
]);

const isQuestionObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Return the replacement question with every platform-owned field restored
 * from the question MathMaster already has: present with the existing value
 * when MathMaster carries one, absent when it does not. A replacement that
 * invented one loses it; a replacement that omitted one does not erase it.
 */
export const preservePlatformOwnedFields = (existingQuestion, replacementQuestion) => {
  if (!isQuestionObject(replacementQuestion)) return replacementQuestion;
  const existing = isQuestionObject(existingQuestion) ? existingQuestion : {};
  const next = { ...replacementQuestion };
  PLATFORM_OWNED_FIELDS.forEach((field) => {
    if (Object.hasOwn(existing, field)) {
      next[field] = existing[field];
    } else {
      delete next[field];
    }
  });
  return next;
};

export default PLATFORM_OWNED_FIELDS;
