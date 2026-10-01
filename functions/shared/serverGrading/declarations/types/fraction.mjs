/*
 * Grading declaration for the `fraction` question surface.
 *
 * Client-graded with a hard blocker: the stored question is not the question
 * the student saw. QuestionEngine runs every stored `fraction` item through
 * problemGenerator.generateQuestion, whose generateQuestionFromKey calls
 * generateFraction for type 'fraction' UNCONDITIONALLY — no `generator` object
 * is needed, so commonServerGradingExclusion's generated-question check never
 * sees it — and replaces n1/d1/n2/d2 and the key ansNum/ansDen with numbers
 * drawn from a per-student seed. A shared grader is a pure function of
 * (question, work); the seed is in neither.
 *
 * Light: declarations only. The grader is ../../questionGraders/fraction.mjs.
 */
import { declareClientGraded } from '../../surfaceDeclarations.mjs';

export default declareClientGraded({
  blocker: "Each student's fraction sum is drawn in their browser from a per-student seed, so the stored question does not say which sum was asked. "
    + 'Every stored `fraction` question is regenerated before it renders: problemGenerator.generateQuestionFromKey runs '
    + "generateFraction for type 'fraction' unconditionally (no `generator` object needed, so the generated-question "
    + 'exclusion never applies), replacing n1/d1/n2/d2 and the key ansNum/ansDen with draws from '
    + 'createRandom(`${generationKey}|v${generatorVersion}`). generationKey is `assignmentId|student key|question '
    + "index|variant:N`, where the student key is the student's uid or a shared-version key chosen by the section's "
    + 'variant mode, and a replacement variant is re-rolled until it differs from the previous one. None of that is '
    + 'part of the authoritative question a shared grader receives (it grades (question, work) only), so the server '
    + 'cannot know the delivered sum; the browser verdict (gradeFractionResponse) is kept, bounded by ingestion. To '
    + 'make such an item server-graded, re-author it as a Question Family slot (the server rebuilds its instance from '
    + 'the delivery pin) whose instances are a server-graded type such as `literal`.',
});
