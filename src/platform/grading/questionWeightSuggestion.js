// The value MathMaster suggests for a question: teacher-side (the question
// editor's "Suggest", the AI weight review pack). Kept out of questionWeights.js,
// whose totals every student screen reads, because measuring the work brings
// the grading manifest and the whole Question Family registry.
import { estimateQuestionValue } from '../../../functions/shared/questionValue.mjs';

/*
 * The value MathMaster gives a question when it is created — the SAME rule
 * the authoring compiler stamps, the editor's "Suggest" offers and the AI
 * weight review is shown (functions/shared/questionValue.mjs). It counts the
 * work the question's own grader assesses (cards, fields, stages, modes), so a
 * rich tool's board is no longer measured as one answer because it has no
 * `answerFields`.
 */
export const suggestedQuestionWeight = (question = {}) => estimateQuestionValue(question).value;
