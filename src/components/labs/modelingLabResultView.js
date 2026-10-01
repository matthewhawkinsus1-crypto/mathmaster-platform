/*
 * WHAT THE MODELING LAB SHOWS ONCE IT IS SUBMITTED.
 *
 * The lab is graded on the server the moment it is submitted, and its player
 * printed the result right there — "Server-graded modeling result · 73%" and
 * the rubric feedback — on every activity. On a DOL, quiz or test the outcome
 * is withheld until the activity releases it (QuestionEngine's
 * showOutcomeFeedback false); every other question says only "Feedback opens
 * later" there. So there the lab says it was submitted and nothing about how
 * it did, the same for every result. Where outcomes are shown it is the result
 * it always was.
 *
 * No React here, so it is tested in node (tests/platform/solverRuntimeOutcomePolicy).
 */
export const modelingLabResultView = ({ evaluation = null, revealEvaluation = true } = {}) => {
  if (!evaluation) return null;
  if (revealEvaluation === false) {
    return { tone: 'withheld', title: 'Modeling lab submitted', detail: 'Your result opens later.' };
  }
  return {
    tone: evaluation.isMastered ? 'mastered' : 'growth',
    title: `${evaluation.provisional ? 'Sandbox evaluation' : 'Server-graded modeling result'} · ${Math.round(Number(evaluation.compositeScore || 0) * 100)}%`,
    detail: evaluation.feedback,
  };
};

export default modelingLabResultView;
