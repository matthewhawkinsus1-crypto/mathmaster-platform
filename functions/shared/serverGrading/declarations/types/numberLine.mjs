/*
 * Grading declaration for the `numberLine` question surface.
 *
 * Client-graded with a hard blocker: the stored question is not the question
 * the student saw. QuestionEngine runs every stored `numberLine` item through
 * problemGenerator.generateQuestion, whose generateQuestionFromKey calls
 * generateNumberLine for type 'numberLine' UNCONDITIONALLY — no `generator`
 * object is needed, so commonServerGradingExclusion's generated-question check
 * never sees it — and replaces `target` (the key) and `choices` with values
 * drawn from a per-student seed. A shared grader is a pure function of
 * (question, work); the seed is in neither.
 *
 * Light: declarations only. The grader is ../../questionGraders/numberLine.mjs.
 */
import { declareClientGraded } from '../../surfaceDeclarations.mjs';

export default declareClientGraded({
  blocker: "Each student's target point is drawn in their browser from a per-student seed, so the stored question does not say which point was asked. "
    + 'Every stored `numberLine` question is regenerated before it renders: problemGenerator.generateQuestionFromKey '
    + "runs generateNumberLine for type 'numberLine' unconditionally (no `generator` object needed, so the "
    + 'generated-question exclusion never applies), replacing the key `target` and the offered `choices` with draws '
    + 'from createRandom(`${generationKey}|v${generatorVersion}`). generationKey is `assignmentId|student key|question '
    + "index|variant:N`, where the student key is the student's uid or a shared-version key chosen by the section's "
    + 'variant mode, and a replacement variant is re-rolled until it differs from the previous one. None of that is '
    + 'part of the authoritative question a shared grader receives (it grades (question, work) only), so the server '
    + 'cannot know the delivered target; the browser verdict (gradeNumberLineResponse) is kept, bounded by ingestion. '
    + 'To make such an item server-graded, re-author it as a Question Family slot (the server rebuilds its instance '
    + 'from the delivery pin) whose instances are a server-graded type.',
});
