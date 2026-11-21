/*
 * THE SKILL A WORKED EXAMPLE TEACHES (WORKED_EXAMPLES.md section 6).
 *
 * The skill is the question's `familyId` when it has one, or else its first
 * `studentActions` entry with its primary standard ("multipleResponses A2.7G").
 * One example covers every question on its skill, so two places ask: the
 * coverage report (classworkCoverage.js, teacher-side) and the student's
 * Classwork, which opens an example before the first question on a new skill
 * (examplePlayer.js). It lives here so the student's screen does not load the
 * report.
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/** The question's first student action ("multipleResponses"), or ''. */
export const exampleKindOf = (question) => text(list(question?.studentActions)[0]);

/** The question's primary standard: its primary alignment, `primaryStandard`, or a curriculum-code `standard`. */
export const primaryStandardOf = (question) => {
  const primary = list(question?.alignments).find((alignment) => isObject(alignment) && alignment.role === 'primary' && text(alignment.code));
  return text(primary?.code) || text(question?.primaryStandard) || text(question?.standard);
};

/** The skill an example teaches: `familyId`, or the first student action with the primary standard. Null when neither is known. */
export const exampleSkillOf = (question) => {
  const familyId = text(question?.familyId);
  if (familyId) return familyId;
  const kind = exampleKindOf(question);
  if (!kind) return null;
  const standard = primaryStandardOf(question);
  return standard ? `${kind} ${standard}` : kind;
};
