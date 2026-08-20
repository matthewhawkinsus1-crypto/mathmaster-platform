// What a student is told after an attempt, and when.
//
// THE PROBLEM THIS SOLVES. A Path question used to answer every attempt with
// one word: "Correct." or "Not yet. Try again." A student who missed twice
// learned nothing from the miss, and a student who ran out of attempts was
// moved on without ever finding out what the mathematics was. The starter bank
// carried no solution content at all, so there was nothing to show even if the
// screen had asked for it.
//
// THE RULES, and each one is a rule because its opposite is a real failure:
//
//   1. NOTHING BEFORE THE ATTEMPT. Feedback, hints and the solution review are
//      all released by the SERVER, in the response to an attempt. None of them
//      travels in the question payload, so a student cannot read the answer out
//      of the network tab, and a wrong turn in the UI cannot reveal it early.
//
//   2. A WRONG ANSWER DOES NOT BUY THE SOLUTION. The progression is: attempt →
//      specific, non-revealing feedback → attempt → conceptual hint → attempt →
//      review. A system that shows the worked solution on the first miss has
//      taught the student that missing is how you find out the answer.
//
//   3. THE REVIEW EXISTS ONLY ONCE THE QUESTION IS CLOSED. Closed means either
//      answered correctly or out of attempts. There is no third way to reach
//      it.
//
//   4. A HINT IS NOT A SMALLER ANSWER. `hintRevealsAnswer` below is used by the
//      bank quality audit to reject a "hint" that simply contains the expected
//      value, which is the form every answer button eventually takes.
//
// Shared by the Cloud Function and the Teacher Path Simulator so a teacher
// testing a question sees exactly what a student would.

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

const clampText = (value, max = 400) => text(value).slice(0, max);

/**
 * The private support bundle, taken off an authored bank question.
 *
 * Stored on the session document beside the grading definition — never on the
 * public question payload.
 */
export const buildPrivateSupport = (question = {}) => {
  const review = question.solutionReview && typeof question.solutionReview === 'object'
    ? question.solutionReview
    : null;
  return {
    // Said after a miss, in order. Written to name what went wrong without
    // naming what is right.
    attemptFeedback: list(question.attemptFeedback).map((entry) => clampText(entry)).filter(Boolean).slice(0, 4),
    // Conceptual support, released later than feedback.
    supportHints: list(question.supportHints).map((entry) => clampText(entry)).filter(Boolean).slice(0, 3),
    // Feedback keyed to a specific wrong answer, which is the only kind that
    // can say something better than "check your work".
    misconceptions: list(question.misconceptions)
      .map((entry) => ({
        match: list(entry?.match).length ? list(entry.match).map((value) => text(value)) : [text(entry?.match)].filter(Boolean),
        message: clampText(entry?.message),
      }))
      .filter((entry) => entry.match.length && entry.message)
      .slice(0, 6),
    solutionReview: review ? {
      headline: clampText(review.headline, 160),
      reasoning: list(review.reasoning).map((entry) => clampText(entry, 400)).filter(Boolean).slice(0, 8),
      commonError: clampText(review.commonError, 400) || null,
      connection: clampText(review.connection, 400) || null,
      answerSummary: clampText(review.answerSummary, 240) || null,
    } : null,
  };
};

/** Does this question carry enough to teach from after it closes? */
export const hasSolutionSupport = (question = {}) => {
  const support = buildPrivateSupport(question);
  return Boolean(support.solutionReview?.reasoning?.length);
};

/**
 * Would this hint hand over the answer?
 *
 * Used by the quality audit rather than at runtime: a hint that contains the
 * expected value is an answer button wearing a hint's label, and the bank
 * should not accept one.
 */
export const hintRevealsAnswer = (hint, expectedValues = []) => {
  const haystack = text(hint).toLowerCase();
  if (!haystack) return false;
  return list(expectedValues)
    .map((value) => text(value).toLowerCase())
    .filter(Boolean)
    .some((value) => {
      // A long answer can be looked for anywhere. A short one needs boundaries,
      // or the digit "5" would match inside "15 minutes" and every hint on
      // earth would look like a leak. The trailing lookahead is what keeps
      // "12" from matching inside "12.5", while still catching the far more
      // common "… is x = 12." with a sentence-ending full stop.
      if (value.length >= 3) return haystack.includes(value);
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\w.\\-])${escaped}(?![\\d.]*\\d)`).test(haystack);
    });
};

const responseValues = (responsePayload = {}) => {
  const responses = responsePayload?.responses && typeof responsePayload.responses === 'object'
    ? responsePayload.responses
    : {};
  const raw = responsePayload?.raw && typeof responsePayload.raw === 'object' ? responsePayload.raw : {};
  return [
    ...Object.values(responses),
    ...Object.values(raw).filter((value) => typeof value === 'string' || typeof value === 'number'),
  ].map((value) => text(value)).filter(Boolean);
};

const matchMisconception = (support, responsePayload) => {
  const given = responseValues(responsePayload).map((value) => value.toLowerCase());
  if (!given.length) return null;
  const hit = list(support.misconceptions).find((entry) => entry.match
    .some((candidate) => given.includes(candidate.toLowerCase())));
  return hit ? hit.message : null;
};

const GENERIC_MISS = [
  'Not yet. Look again at what the question is asking you to find, then check each step of your work.',
  'Still not right. Try a different approach to the same question rather than repeating the last one.',
];

/**
 * Everything the server sends back about an attempt.
 *
 * @returns { feedback, support, solutionReview }
 *   feedback       what happened, in a sentence that does not give the answer
 *   support        the conceptual hint, if this is the attempt that earns one
 *   solutionReview the review, and ONLY when the question is finalized
 */
export const buildAttemptSupportPayload = ({
  support = null,
  attemptNumber = 1,
  attemptsAllowed = 3,
  isCorrect = false,
  questionFinalized = false,
  responsePayload = null,
} = {}) => {
  const bundle = support && typeof support === 'object' ? support : buildPrivateSupport({});
  const attemptsRemaining = Math.max(0, Number(attemptsAllowed || 0) - Number(attemptNumber || 0));

  if (isCorrect) {
    return {
      feedback: {
        tone: 'correct',
        message: 'Correct.',
      },
      support: null,
      solutionReview: bundle.solutionReview,
    };
  }

  if (questionFinalized) {
    return {
      feedback: {
        tone: 'closed',
        message: 'That is the last attempt for this question. Read the review below — the next question uses the same idea.',
      },
      support: null,
      solutionReview: bundle.solutionReview,
    };
  }

  // Still open. Specific first, generic only if the bank has nothing specific.
  const specific = matchMisconception(bundle, responsePayload);
  const authored = bundle.attemptFeedback[Math.min(Math.max(0, Number(attemptNumber) - 1), bundle.attemptFeedback.length - 1)];
  const message = specific
    || authored
    || GENERIC_MISS[Math.min(Math.max(0, Number(attemptNumber) - 1), GENERIC_MISS.length - 1)];

  // The hint arrives on the SECOND miss, not the first. One miss is a slip, and
  // a system that offers help the instant anything goes wrong trains a student
  // to wait for it.
  const hintIndex = Number(attemptNumber) - 2;
  const hint = hintIndex >= 0 ? bundle.supportHints[Math.min(hintIndex, bundle.supportHints.length - 1)] : null;

  return {
    feedback: {
      tone: 'retry',
      message,
      attemptsRemaining,
    },
    support: hint ? { kind: 'conceptualHint', hint } : null,
    // Never before the question closes. This is the line the whole file exists
    // to hold.
    solutionReview: null,
  };
};

export default buildAttemptSupportPayload;
