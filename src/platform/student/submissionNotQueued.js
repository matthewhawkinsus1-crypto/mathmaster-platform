/*
 * A SUBMISSION THIS DEVICE COULD NOT QUEUE WAS NOT SUBMITTED (Batch 3, RUN-3).
 *
 * An ordinary submission is written to the device's durable outbox first
 * (App.jsx handleGradeSubmit, enqueueDurableAction) and only then counted.
 * When that write fails — IndexedDB full, or blocked by a managed policy —
 * nothing was recorded anywhere. The host used to return `null`, which
 * QuestionEngine reads as "no server result, use the device's own verdict":
 * the screen said "Correct!", locked the question (so Submit was gone), and
 * the save line said "Saved on this device only" while the toast asked the
 * student to press Submit again.
 *
 * The host now returns this result instead. It is `blocked` feedback, the
 * shape QuestionEngine already shows for work that was not submitted: no
 * verdict, no attempt used, the question stays open with Submit, and the
 * message says exactly that. `notQueued` lets the engine tell it from a
 * server's refusal.
 */
export const SUBMISSION_NOT_QUEUED_MESSAGE = 'Not submitted. This device could not save your answer, so it was not sent and no try was used. Your answer is still here: keep this tab open and press Submit again.';

export const SUBMISSION_NOT_QUEUED = Object.freeze({
  blocked: true,
  notQueued: true,
  isCorrect: false,
  message: SUBMISSION_NOT_QUEUED_MESSAGE,
});

export const isSubmissionNotQueued = (result) => Boolean(result && result.blocked === true && result.notQueued === true);

/*
 * A STEP OR A NEW PROBLEM THIS DEVICE COULD NOT QUEUE (pass 3, wave 7).
 *
 * The same failure on the two other durable writes a student makes: a Step
 * Algebra step (App.jsx handleStepGrade, kind 'stepSubmission') and a request
 * for a new problem ('questionReplacement'). The host used to return `null`
 * and raise a toast under Work View; the solver applied the step as if it had
 * been saved, and the new-problem request had already thrown the old work
 * away. Now the host answers with these, and says nothing else:
 *
 *   STEP_NOT_QUEUED         the solver does not apply the step. The board
 *                           keeps it as it was, one alert in the solver says
 *                           so, and the student applies it again.
 *   REPLACEMENT_NOT_QUEUED  the question engine keeps the question and its
 *                           work, and says so under its New problem button.
 *
 * Neither carries a verdict, a credit or an attempt.
 */
export const STEP_NOT_QUEUED_MESSAGE = 'Step not saved. This device could not save this step, so it was not sent and no try was used. Your step is still here: keep this tab open and apply it again.';

export const STEP_NOT_QUEUED = Object.freeze({
  blocked: true,
  notQueued: true,
  step: true,
  message: STEP_NOT_QUEUED_MESSAGE,
});

export const isStepNotQueued = (result) => Boolean(result && result.notQueued === true && result.step === true);

export const REPLACEMENT_NOT_QUEUED_MESSAGE = 'No new problem yet. This device could not save your request, so nothing changed and no try was used. Keep this tab open and ask for the new problem again.';

export const REPLACEMENT_NOT_QUEUED = Object.freeze({
  blocked: true,
  notQueued: true,
  replacement: true,
  message: REPLACEMENT_NOT_QUEUED_MESSAGE,
});

export const isReplacementNotQueued = (result) => Boolean(result && result.notQueued === true && result.replacement === true);
