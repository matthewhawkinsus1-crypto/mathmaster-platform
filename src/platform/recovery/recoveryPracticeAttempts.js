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
export const RECOVERY_PRACTICE_ANSWERS = 1;

export const RECOVERY_PRACTICE_ONE_ANSWER = 'One answer per practice question.';
