/*
 * Grading declaration for the `fraction` question surface.
 *
 * Client-graded with a hard blocker for a fraction DRILL: the stored question
 * is not the question the student saw. QuestionEngine runs every stored
 * `fraction` item through problemGenerator.generateQuestion, and for a drill —
 * a question whose author wrote neither the sum nor the answer
 * (fractionAnswer.mjs fractionQuestionShape) — generateFraction draws n1/d1/
 * n2/d2 and the key ansNum/ansDen from a per-student seed. A shared grader is
 * a pure function of (question, work); the seed is in neither. A question
 * whose author wrote the sum or the answer is delivered as written (it used to
 * be redrawn too); the type stays device-graded as a whole, and its verdict is
 * on the authored numbers either way (gradeFractionResponse).
 *
 * Light: declarations only. The grader is ../../questionGraders/fraction.mjs.
 */
import { declareClientGraded } from '../../surfaceDeclarations.mjs';

export default declareClientGraded({
  blocker: "A fraction drill's sum is drawn in each student's browser from a per-student seed, so the stored question does not say which sum was asked. "
    + 'A drill is a `fraction` question whose author wrote neither the sum nor the answer (fractionAnswer.mjs '
    + 'fractionQuestionShape); one with authored operands or an authored answer is delivered as written. Before it '
    + "renders, a drill is regenerated: problemGenerator.generateQuestionFromKey runs generateFraction for it (no "
    + '`generator` object needed, so the generated-question exclusion never applies), replacing n1/d1/n2/d2 and the '
    + 'key ansNum/ansDen with draws from '
    + 'createRandom(`${generationKey}|v${generatorVersion}`). generationKey is `assignmentId|student key|question '
    + "index|variant:N`, where the student key is the student's uid or a shared-version key chosen by the section's "
    + 'variant mode, and a replacement variant is re-rolled until it differs from the previous one. None of that is '
    + 'part of the authoritative question a shared grader receives (it grades (question, work) only), so the server '
    + 'cannot know the delivered sum; the browser verdict (gradeFractionResponse) is kept, bounded by ingestion. To '
    + 'make such an item server-graded, re-author it as a Question Family slot (the server rebuilds its instance from '
    + 'the delivery pin) whose instances are a server-graded type such as `literal`.',
});
