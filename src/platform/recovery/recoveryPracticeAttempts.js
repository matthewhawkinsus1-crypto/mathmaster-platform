/*
 * HOW MANY TRIES A RECOVERY PRACTICE QUESTION HAS — ONE ANSWER.
 *
 * Recovery practice takes ONE graded answer per item: the mastery gate counts
 * unique questions, so a second answer to the same item would not be new
 * evidence, and the server closes the item on the first graded answer, right
 * or wrong (SectionRecoveryRunner `handleGrade`). The engine used to be handed
 * the Practice policy's three tries anyway, so the student read "3 of 3 tries
 * left" and lost the item on the first miss (QA pass 3, HELP-19 in
 * 03-help-and-self-correction.md).
 *
 * A STEP ITEM TOO. No step spends a try (decision D1, `stepActionCountsAttempt`
 * in stepAlgebraStepVerification.mjs): a rejected move is a slip, and the only
 * try is the submitted answer, which is this one graded answer. The step
 * bookkeeping (recordQuestionStep) keeps the Practice policy's count, which no
 * step can spend.
 *
 * Display only. Nothing here grades or reaches the server.
 */
import { resolveQuestionMaximumAttempts } from '../../attemptPolicy.js';

export const RECOVERY_PRACTICE_ANSWERS = 1;

export const RECOVERY_PRACTICE_ONE_ANSWER = 'One answer per practice question.';

/*
 * THE LIMIT A RECOVERY ITEM'S STEPS ARE COUNTED UNDER, ON THE QUESTION DEALT
 * (P-7).
 *
 * Every Recovery question is an instance of a Question Family slot, named by
 * its pin, and the server marks the instance the pin names. Its tries are
 * counted on that question too, as the assignment counts a family slot's: the
 * stored slot has no answer fields, so a four-choice instance counted on it had
 * a constructed answer's three tries. QuestionEngine reports the instance as it
 * renders it (SectionRecoveryRunner `onRendered`); before that nothing can be
 * graded, and the stored slot stands in.
 *
 * Nothing a student sees changes today: no step spends a try (decision D1),
 * so this limit never closes an item, and an exit ticket's one try is one on
 * any question.
 *
 *   dealt           the question the item's pin dealt, once rendered
 *   stored          the stored slot (entry.questionsByIndex)
 *   activityPolicy  the policy the item runs under
 */
export const recoveryAttemptLimit = ({ dealt = null, stored = null, activityPolicy = null } = {}) => resolveQuestionMaximumAttempts({
  question: dealt || stored || {},
  activityPolicy,
});
