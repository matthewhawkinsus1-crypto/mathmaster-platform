/*
 * THE QUESTION THE STUDENT WAS SHOWN, REBUILT ON THE SERVER.
 *
 * QuestionEngine never renders a stored question verbatim. Before any tool
 * sees it, every host applies two pure transforms:
 *
 *   1. repairQuestionForCurrentRuntime  — known compatibility repairs (an old
 *      stored `stepAlgebra2` intercept question opens the mature Step Algebra
 *      engine, a Sign & Solution item without factors is opened correctly, a
 *      pre-construction synthetic graph stage is removed, ...);
 *   2. normalizeContextualQuestion      — the word-problem layer's defaults.
 *
 * A server that graded the RAW stored question could mark a student against a
 * question shape the browser never rendered (a `stepAlgebra2` response arriving
 * for a question the student saw as `stepAlgebra`). So the server applies the
 * same two transforms — the same modules, moved to functions/shared/runtime so
 * both sides import one copy.
 *
 * What is deliberately NOT reproduced here, and why that is safe:
 *
 *   - legacy seeded generators, variant pools and `auto` band profiles: those
 *     questions are excluded from server grading altogether
 *     (serverResponseGrading.mjs `commonServerGradingExclusion`);
 *   - Question Family instances: rebuilt from their validated delivery pin by
 *     questionFamilyGrading.mjs before they reach a grader;
 *   - student supports (applyStudentSupportToQuestion): presentation fields,
 *     a translated prompt (the authored one is kept as `authoredPrompt`),
 *     `prefillFirstStep`, and trimming multiple-choice `choices` to two for
 *     `reduce-complexity`. No shared grader reads a field a support changes
 *     — each grades the student's own work against the question's key — so a
 *     support never changes a verdict.
 *     tests/platform/gradersIgnoreStudentSupports.test.mjs holds that line.
 *
 * Pure. Idempotent: repairing an already-repaired question changes nothing.
 */
import { repairQuestionForCurrentRuntime } from '../runtime/assignmentRuntimeRepair.mjs';
import { normalizeContextualQuestion } from '../runtime/wordProblemLayer.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Transform 1 alone. A Question Family TEMPLATE is resolved from this, never
 * from the normalized form: QuestionEngine repairs, then generates, then
 * normalizes the generated instance. A local template's fingerprint covers
 * its whole document, `context` included, so rebuilding it from a
 * context-normalized template hashed a different document — every pin for a
 * template with a word-problem context failed to replay here (and in
 * Recovery grading), and the student's work was held instead of graded.
 */
export const runtimeRepairedQuestion = (question) => {
  if (!isObject(question)) return question;
  try {
    const result = repairQuestionForCurrentRuntime(question, { source: 'serverGrading' });
    if (isObject(result?.question)) return result.question;
  } catch {
    // The repair fails closed to the stored question, exactly as the browser
    // runtime does (QuestionEngine keeps the literal question on a throw).
  }
  return question;
};

export const deliveredQuestionForGrading = (question) => {
  if (!isObject(question)) return question;
  return normalizeContextualQuestion(runtimeRepairedQuestion(question));
};
