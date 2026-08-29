/**
 * Client-side progression compatibility.
 *
 * Current servers send questionFinalized explicitly. Older production
 * releases may only send isCorrect / attemptsRemaining / needsNextQuestion.
 * A correct or exhausted response must never strand the student because the
 * browser and callable were deployed minutes apart.
 */
export const gradingClosesQuestion = (grading = null) => {
  if (!grading || typeof grading !== 'object') return false;
  if (grading.questionFinalized === true) return true;
  if (grading.isCorrect === true) return true;

  const remaining = Number(grading.attemptsRemaining);
  const attempt = Number(grading.attemptNumber);
  return Number.isFinite(remaining) && remaining <= 0
    && Number.isFinite(attempt) && attempt > 0;
};

export const responseClosesQuestion = (result = null) => (
  Boolean(result?.needsNextQuestion)
  || gradingClosesQuestion(result?.grading)
);

export const latestAttemptCount = (questionInstance = null, grading = null) => {
  const stored = Number(questionInstance?.attemptsUsed) || 0;
  const returned = Number(grading?.attemptNumber) || 0;
  return Math.max(stored, returned);
};
