import { buildPrivateSupport } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { buildToolSolutionReviewModel } from '../../../tools/shared/toolSolutionReview.js';

/*
 * WHAT A CLOSED QUESTION'S WORKED SOLUTION IS MADE OF — one model for the
 * review panel (src/SolutionReviewPanel.jsx), so the panel, its Read aloud
 * text and the attempt message all agree on whether there is a review at all.
 *
 *   authored  the question's own solutionReview (Path shape), when it has one
 *   tool      the registry tool's builder output (text only)
 *   legacy    true when the legacy question-type review has something to show
 *             (`legacyContent` is injected — SolutionReview.jsx's
 *             legacySolutionReviewContent — so this module stays importable
 *             in node)
 *   hasContent / intro / speechText
 *
 * Pure and safe on any input: a builder that throws is "no tool review".
 */
const clean = (value) => String(value ?? '').trim();

const authoredReviewOf = (question) => {
  try {
    const review = buildPrivateSupport(question || {}).solutionReview;
    if (!review) return null;
    const hasBody = Boolean(review.headline || review.reasoning.length || review.answerSummary || review.commonError || review.connection);
    return hasBody ? review : null;
  } catch {
    return null;
  }
};

const toolReviewOf = (question) => {
  try {
    const model = buildToolSolutionReviewModel(question || {});
    if (!model) return null;
    const hasBody = Boolean(model.items.length || model.steps.length || model.why);
    return hasBody ? model : null;
  } catch {
    return null;
  }
};

const legacyHasContent = (question, legacyContent) => {
  try {
    return typeof legacyContent === 'function' && Boolean(legacyContent(question)?.hasContent);
  } catch {
    return false;
  }
};

export const buildClosedQuestionReview = ({ question = null, isToolQuestion = false, wasCorrect = false, legacyContent = null } = {}) => {
  if (!question || typeof question !== 'object') return null;
  const authored = authoredReviewOf(question);
  const tool = isToolQuestion ? toolReviewOf(question) : null;
  const legacy = !isToolQuestion && legacyHasContent(question, legacyContent);
  const hasContent = Boolean(authored || tool || legacy);
  const intro = !hasContent
    ? 'A worked solution is not available for this question yet. Ask your teacher to go over it with you.'
    : wasCorrect
      ? 'You got this one. Here is the reasoning behind it, so the next one is not a guess.'
      : 'This question is closed. Compare each step of your work with the worked solution.';
  const speechText = [
    authored?.headline, ...(authored?.reasoning || []), authored?.answerSummary, authored?.commonError,
    ...(tool?.steps || []), ...(tool?.items || []).map((item) => `${item.label}: ${item.value}`), tool?.why ? `Why it works: ${tool.why}` : '',
  ].map(clean).filter(Boolean).join(' ');
  return { authored, tool, legacy, hasContent, intro, speechText };
};

/** Does this closed question have a worked solution to point at? */
export const closedQuestionHasReview = (args) => Boolean(buildClosedQuestionReview(args)?.hasContent);
