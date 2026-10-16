/*
 * WORKED SOLUTIONS THAT TEACH LITTLE — a Pre-Flight WARNING, never a block
 * (student pass 3, HELP-11 and HELP-18).
 *
 * After the last miss a student reads the worked solution. For 60 of 265 real
 * Warm-Up/Classwork/Practice items it stated only the answer ("Slope: -1/2 ·
 * b: 5"), and almost none named the usual mistake. Pre-Flight now says so, so
 * the teacher can add what the platform cannot invent:
 *
 *   answer only     the closed-question review (closedQuestionReview.js) has
 *                   no reasoning steps: no authored solutionReview.reasoning,
 *                   no tool review with steps, no question-family worked
 *                   solution, and no composed workflow (whose review walks the
 *                   steps). An item with no review at all is named too.
 *   no common error no authored solutionReview.commonError — the one line a
 *                   student who missed it reads as "Watch out:".
 *   choice reasons  answerFields[].optionRationales that can never be shown
 *                   (oneTryChoice.js).
 *
 * One message per kind for the whole assignment, listing the questions:
 * a per-question warning for something most items lack would bury the rest
 * of Pre-Flight.
 */
import { buildPrivateSupport } from '../../../functions/shared/pathSolutionSupport.mjs';
import { buildToolSolutionReviewModel } from '../../tools/shared/toolSolutionReview.js';
import { buildClosedQuestionReview } from '../supports/review/closedQuestionReview.js';
import { optionRationaleProblems } from '../supports/feedback/oneTryChoice.js';
import { readComposedQuestion } from '../workflow/questionWorkflow.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);

const safely = (read, fallback) => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

const numbersText = (numbers) => {
  const shown = numbers.slice(0, 12).join(', ');
  return numbers.length > 12 ? `${shown} and ${numbers.length - 12} more` : shown;
};

/** 'steps' | 'answerOnly' | 'none' — what the worked solution of a closed `question` shows. */
export const workedSolutionDepth = (question) => {
  if (!question || typeof question !== 'object') return 'none';
  const composed = safely(() => readComposedQuestion(question), null);
  if (composed?.composed && asArray(composed.workflow).length) return 'steps';
  const isToolQuestion = Boolean(safely(() => buildToolSolutionReviewModel(question), null));
  const review = safely(() => buildClosedQuestionReview({ question, isToolQuestion }), null);
  if (!review) return 'none';
  if (review.hasSteps) return 'steps';
  // The legacy question-type review is not readable here (it lives in a .jsx
  // file); it states answers, graphs and forms, never reasoning, so an item
  // it alone covers is "answer only" exactly like a bare authored answer.
  return 'answerOnly';
};

export const hasAuthoredCommonError = (question) => Boolean(clean(safely(() => buildPrivateSupport(question || {}).solutionReview?.commonError, '')));

export const auditAssignmentSolutionReviews = (questions = [], { deliveredOnly = true } = {}) => {
  const answerOnly = [];
  const noCommonError = [];
  const reasonProblems = [];
  asArray(questions).forEach((question, index) => {
    if (deliveredOnly && question?.teacherExcluded === true) return;
    const number = index + 1;
    if (workedSolutionDepth(question) !== 'steps') answerOnly.push(number);
    if (!hasAuthoredCommonError(question)) noCommonError.push(number);
    optionRationaleProblems(question).forEach((problem) => reasonProblems.push(`Question ${number}: ${problem}.`));
  });
  const warnings = [];
  if (answerOnly.length) {
    warnings.push(`${answerOnly.length === 1 ? 'Question' : `${answerOnly.length} questions —`} ${numbersText(answerOnly)} ${answerOnly.length === 1 ? 'shows' : 'show'} only the answer after the last try, with no worked steps. Add solutionReview.reasoning (a few short steps) so a student who missed it can see how to get there.`);
  }
  if (noCommonError.length) {
    warnings.push(`${noCommonError.length === 1 ? 'Question' : `${noCommonError.length} questions —`} ${numbersText(noCommonError)} ${noCommonError.length === 1 ? 'has' : 'have'} no solutionReview.commonError. One line naming the usual mistake is shown to every student who reads the worked solution.`);
  }
  warnings.push(...reasonProblems);
  return { warnings, answerOnly, noCommonError };
};

export default auditAssignmentSolutionReviews;
