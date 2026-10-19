/*
 * WHAT FUNCTION OPERATIONS SAYS AFTER A SUBMIT (student pass 3, TOOL-5).
 *
 * It said "Some parts are correct. Review the operation panels and try the
 * remaining parts." after every miss, including one where no part was right.
 * Now it reads the shared grader's parts and says which are right, which are
 * still blank, and when none is right yet. The parts still to change are what
 * the attempt outcome's "Focus on" line names below it, so they are not listed
 * twice.
 *
 * Shown only where the activity shows outcome feedback: the tool's `feedback`
 * is null otherwise (useToolSubmission), and this is read from it.
 */

export const FUNCTION_OPERATIONS_ALL_RIGHT = 'All requested function operations and restrictions are correct.';

const list = (parts) => parts.map((part) => part.label || part.id).join(', ');

/** The sentence for this verdict and these graded parts. */
export const functionOperationsFeedbackText = ({ isCorrect = false, parts = [] } = {}) => {
  if (isCorrect) return FUNCTION_OPERATIONS_ALL_RIGHT;
  const graded = Array.isArray(parts) ? parts.filter((part) => part && typeof part === 'object') : [];
  const right = graded.filter((part) => part.isCorrect === true);
  const blank = graded.filter((part) => part.isCorrect !== true && part.isComplete === false);
  const sentences = [right.length
    ? `Correct so far: ${list(right)}. Review the other ${graded.length - right.length === 1 ? 'part' : 'parts'}.`
    : 'No part is correct yet. Review each operation panel.'];
  if (blank.length) sentences.push(`Still blank: ${list(blank)}.`);
  return sentences.join(' ');
};
