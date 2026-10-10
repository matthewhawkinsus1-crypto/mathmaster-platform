import { buildPrivateSupport } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { buildToolSolutionReviewModel } from '../../../tools/shared/toolSolutionReview.js';
import { familyFor } from '../families/index.js';

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
 *   fromFamily true when `authored` was written by the question's support
 *             family (familyFor(question).workedSolution): the question has no
 *             authored reasoning steps of its own, and no tool review with
 *             steps, so the family's worked solution of THIS question fills
 *             the authored shape (headline, reasoning = its steps, answer
 *             summary); an authored headline, answerSummary, commonError and
 *             connection still win. It states the answer, which is why only
 *             this closed-question model asks for it — never hints, the
 *             back-up step or a sibling, which are shown while the item is open.
 *   hasContent / intro / speechText
 *
 * Pure and safe on any input: a builder or family that throws is "no tool
 * review" / "no family review".
 */
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

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

/** The question family's worked solution, in the authored shape; null when it has none. */
const familyReviewOf = (question) => {
  try {
    const worked = familyFor(question)?.workedSolution?.(question);
    if (!worked || typeof worked !== 'object') return null;
    const reasoning = list(worked.steps).map(clean).filter(Boolean);
    if (!reasoning.length) return null;
    return { headline: clean(worked.headline), reasoning, answerSummary: clean(worked.answerSummary) || null };
  } catch {
    return null;
  }
};

/** Authored fields win; the family supplies the steps (and whatever the author left out). */
const withFamilySteps = (authored, family) => ({
  headline: clean(authored?.headline) || family.headline,
  reasoning: family.reasoning,
  commonError: authored?.commonError || null,
  connection: authored?.connection || null,
  answerSummary: authored?.answerSummary || family.answerSummary,
});

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
  const tool = isToolQuestion ? toolReviewOf(question) : null;
  const ownReview = authoredReviewOf(question);
  // Steps of its own, or a tool review with steps: the family adds nothing.
  // The tool review is asked for even when the caller did not flag a tool
  // question (SolutionReview2 does not), so the rule holds for every caller.
  const toolSteps = (isToolQuestion ? tool : toolReviewOf(question))?.steps?.length;
  const family = ownReview?.reasoning?.length || toolSteps ? null : familyReviewOf(question);
  const authored = family ? withFamilySteps(ownReview, family) : ownReview;
  const fromFamily = Boolean(family);
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
  return { authored, tool, legacy, fromFamily, hasContent, intro, speechText };
};

/** Does this closed question have a worked solution to point at? */
export const closedQuestionHasReview = (args) => Boolean(buildClosedQuestionReview(args)?.hasContent);
