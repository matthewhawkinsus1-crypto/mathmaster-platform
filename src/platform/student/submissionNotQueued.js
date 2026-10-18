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
