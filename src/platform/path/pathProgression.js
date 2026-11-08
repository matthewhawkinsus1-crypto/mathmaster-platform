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

/**
 * THE QUESTION RECORD MY MATH PATH GIVES QUESTIONENGINE: THE SESSION'S COUNT
 * (student-a11y-3).
 *
 * It was built from the issued question's `attemptsUsed`, and the container
 * moves that on only while the question stays open: once the server closes it
 * (its tries spent, or answered), the container holds the review for "Next
 * question" and leaves the stored count where it was. So on a closed one-try
 * question the engine still counted 0 of 1 used: "One try on this question"
 * over the review, Submit still offered, the work still editable, and on a
 * touch phone the number keypad stayed up over "Next question" until Done
 * (the keypad closes when the engine says the question is terminal). The
 * server is the truth: its attempt number, and a question it closed is closed.
 *
 * `closed` is the session holding this question's review for "Next question"
 * (MyMathPathProductionContainer passes onContinue only then). The container
 * holds on every response that closes a question, an older server's
 * needsNextQuestion alone included, so the grading it holds is this question's.
 * Without the hold the grading is not read: open after a miss, the stored count
 * is already the server's (the container moved it), and a teacher simulator's
 * forced outcome puts the next question on screen beside the last one's grading.
 * Answered, the question is complete; otherwise a miss closed it, and a miss
 * closes a question only once its tries are spent, so none is left.
 */
export const pathEngineQuestionRecord = ({ questionInstance = null, grading = null, closed = false, attemptsAllowed = 1 } = {}) => {
  const stored = Number(questionInstance?.attemptsUsed) || 0;
  if (!closed) return { status: stored > 0 ? 'attempted' : 'unattempted', attemptCount: stored };
  const attemptCount = latestAttemptCount(questionInstance, grading);
  if (grading?.isCorrect === true) return { status: 'correct', attemptCount };
  return { status: 'expired', attemptCount: Math.max(attemptCount, Number(attemptsAllowed) || 1) };
};

/**
 * Which question a Path session's header names: the one on screen. While a
 * closed question and its review are shown, the server has already counted it
 * (summary.completedQuestions), so it is that number, not the next one
 * (QA round 2, R2-m2: "Question 2 of 5" over Question 1's review).
 */
export const sessionHeaderQuestionNumber = ({ total = 5, done = 0, reviewing = false } = {}) => (
  Math.min(total, reviewing ? Math.max(1, done) : done + 1)
);
