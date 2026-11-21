/*
 * WHICH SKILL A QUESTION'S WORKED EXAMPLE TEACHES, AND WHAT THE QUESTION SAYS
 * ABOUT ITS OWN EXAMPLE (WORKED_EXAMPLES.md section 6).
 *
 * One reading, used on both sides: the teacher's coverage report
 * (classworkCoverage.js, which re-exports these) and the student's example
 * player (lessonExample.js). Kept apart from the coverage report so that
 * nothing a student loads imports the report.
 *
 * THE SKILL is the question's `familyId` when it has one, or else its first
 * `studentActions` entry with its primary standard ("multipleResponses A2.7G").
 *
 * The fields read (`example`, `lessonSupports`) are optional in the V5
 * contract and may be absent; every read is defensive. Pure: no React, no I/O.
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

const lessonExampleIds = (lessonSupports) => new Set(list(lessonSupports?.examples)
  .map((example) => (isObject(example) ? text(example.id) : ''))
  .filter(Boolean));

/*
 * What the question says about its own example:
 *   { kind: 'own', exampleId }      it names one the lesson has, or writes one inline;
 *   { kind: 'exempt', reason }      `{ none: "setup" }`: it needs none ("setup", "explain");
 *   { kind: 'missing', exampleId }  it names an id the lesson does not have: not coverage;
 *   null                            it says nothing.
 */
export const questionExampleClaim = (question, lessonSupports = null) => {
  const example = question?.example;
  if (example == null || example === false) return null;
  if (typeof example === 'string') {
    const id = text(example);
    if (!id) return null;
    return lessonExampleIds(lessonSupports).has(id) ? { kind: 'own', exampleId: id } : { kind: 'missing', exampleId: id };
  }
  if (!isObject(example)) return null;
  if (example.none !== undefined && example.none !== null && example.none !== false) {
    return { kind: 'exempt', reason: text(example.none) || 'none' };
  }
  const id = text(example.id) || text(example.ref) || text(example.exampleId);
  // An inline example: one the question writes itself (its own steps, moves or sibling).
  const inline = list(example.steps).length > 0 || list(example.moves).length > 0 || isObject(example.sibling);
  if (inline) return { kind: 'own', exampleId: id || null };
  if (id) return lessonExampleIds(lessonSupports).has(id) ? { kind: 'own', exampleId: id } : { kind: 'missing', exampleId: id };
  return null;
};
