/*
 * THE PROTECTED-FIELD CONTRACT.
 *
 * Every field the platform owns. An AI that invents these produces JSON that
 * looks authoritative and silently contradicts instructional policy, so the
 * contract names them explicitly, every repair prompt forbids them, and the
 * importer preserves MathMaster's own values instead of whatever the reply did
 * or did not include.
 *
 * Omission is the dangerous case. Because the repair prompts tell the AI never
 * to return `teacherExcluded`, a correct reply leaves it out — and a plain
 * replace would read that absence as "the teacher un-excluded this question"
 * and show it in the diff as a change the teacher never made. One field is one
 * bug; the list is the contract, so the importer preserves all of it.
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
  // Teacher decisions about an existing assignment, not authoring input. An AI
  // that sets these overrides a choice a person made in the UI.
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
