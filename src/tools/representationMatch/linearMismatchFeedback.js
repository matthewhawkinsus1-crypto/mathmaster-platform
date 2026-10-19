/*
 * WHAT A "FIND THE MISMATCH" CHECK SAYS (student pass 3, TOOL-5).
 *
 * After any miss it said "That card is actually consistent with the others",
 * including when the student had picked the right card and only the
 * correction under it was wrong (the grader's 0.6). The line now follows the
 * grader's two parts: the card, then the correction.
 *
 * Shown only where the activity shows outcome feedback: the tool's `feedback`
 * is null otherwise (useToolSubmission), and this is read from it.
 */

export const LINEAR_MISMATCH_FEEDBACK = Object.freeze({
  wrongCard: 'That card is consistent with the others, so it is not the mismatch. Recheck each card’s slope and intercept against the others.',
  correctionBlank: 'You found the card that does not match. Now choose what that card should say instead.',
  correctionWrong: 'You found the card that does not match, but your correction does not fix it. Choose what that card should say so it agrees with the others.',
});

export const linearMismatchFeedbackText = (parts) => {
  const list = Array.isArray(parts) ? parts : [];
  const card = list.find((part) => part?.id === 'mismatch');
  if (card?.isCorrect !== true) return LINEAR_MISMATCH_FEEDBACK.wrongCard;
  const correction = list.find((part) => part?.id === 'correction');
  if (correction && correction.isCorrect !== true) {
    return correction.isComplete === false ? LINEAR_MISMATCH_FEEDBACK.correctionBlank : LINEAR_MISMATCH_FEEDBACK.correctionWrong;
  }
  return LINEAR_MISMATCH_FEEDBACK.wrongCard;
};
