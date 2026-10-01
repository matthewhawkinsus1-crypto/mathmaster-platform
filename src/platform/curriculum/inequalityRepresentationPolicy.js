const clean = (value) => String(value ?? '').trim();
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9.]+/g, '');

const standardCandidates = (question = {}) => {
  const alignments = Array.isArray(question.alignments) ? question.alignments : [];
  return [
    question.courseId,
    question.course,
    question.standard,
    question.primaryStandard,
    question.assessedConstruct,
    ...alignments.flatMap((alignment) => [
      alignment?.code,
      alignment?.standard,
      alignment?.key,
      alignment?.alignmentKey,
    ]),
  ].map(clean).filter(Boolean);
};

export const isAlgebraOneQuestion = (question = {}) => {
  const candidates = standardCandidates(question);
  if (candidates.some((value) => ['algebra1', 'algebrai', 'alg1'].includes(token(value)))) {
    return true;
  }

  // Algebra I TEKS use A.xX (for example A.5B); Algebra II uses A2.xX.
  return candidates.some((value) => /(?:^|:)A\.\d+[A-Z]?$/i.test(value));
};

export const inequalitySolutionRepresentationStages = (question = {}) => {
  if (question.representSolution === false) return [];

  const explicit = Array.isArray(question.solutionRepresentations)
    ? question.solutionRepresentations
    : Array.isArray(question.representationAsk)
      ? question.representationAsk
      : null;

  const requested = (explicit || [])
    .map((value) => token(value))
    .filter((value) => ['graph', 'interval', 'inequality'].includes(value));

  // MathMaster's Algebra I curriculum contract explicitly keeps formal
  // interval notation above the Algebra I course ceiling. A solved inequality
  // may still be represented on a number line, which directly reinforces
  // open/closed endpoints without silently adding Algebra II notation.
  if (isAlgebraOneQuestion(question)) {
    return ['graph'];
  }

  // Preserve the richer default outside Algebra I, while allowing an authored
  // question to request a narrower representation set.
  return requested.length ? [...new Set(requested)] : ['graph', 'interval'];
};

/*
 * WHEN THE "GRAPH YOUR SOLUTION" STAGE IS DONE, AND WHAT IT IS GRADED AS.
 *
 * Once a student has solved an inequality, the relation solver asks them to
 * graph the solution (and, above Algebra I, write it in interval notation) in
 * an embedded number line. `representationCorrect` is that number line's last
 * Check: null before any, then whether the graph and notation matched the
 * student's own solved inequality.
 *
 * Where the activity shows outcomes at once the question is complete only
 * once that check passed — the number line says "Correct" / "Not yet" and the
 * student revises until it is right, which is the practice behaviour. On a
 * DOL, quiz or test that wait is the verdict (Submit appears only once the
 * graph is right), so there the stage is done once it has been checked, right
 * or wrong, and its correctness is graded at submission.
 */
export const solutionRepresentationStageStatus = ({ showImmediateFeedback = true, representationCorrect = null } = {}) => {
  const withheld = showImmediateFeedback === false;
  const checked = representationCorrect !== null && representationCorrect !== undefined;
  return {
    withheld,
    done: withheld ? checked : representationCorrect === true,
    correct: representationCorrect === true,
    // The neutral "recorded" line under the number line: withheld outcomes only.
    recordedNotice: withheld && checked,
  };
};
