/*
 * Does a literal question ask to be solved on the balance workspace?
 *
 * Moved here from src/literalWorkspace.js (which re-exports it) because the
 * SERVER must route the question the same way the browser does: a literal
 * question on the workspace is answered with a final equation, not a typed
 * expression, and grading it as a typed expression marks correct work wrong.
 *
 * Opt-in, never inferred. Every existing literal question expects the
 * type-the-answer grader, and quietly changing what a student is asked to do
 * because a field happened to parse would be a worse failure than not offering
 * the workspace at all.
 */
const text = (value) => String(value ?? '').trim();

export const usesLiteralWorkspace = (question = {}) => {
  if (!question || question.type !== 'literal') return false;
  if (question.workspace === true || question.solveOnBalance === true) return true;
  return text(question.presentation).toLowerCase() === 'workspace';
};
