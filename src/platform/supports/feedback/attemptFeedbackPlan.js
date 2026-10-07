/*
 * WHAT A CLASSROOM QUESTION SAYS AFTER AN ATTEMPT — THE PATH PATTERN.
 *
 *   specific feedback on a miss → a hint offered on the second miss →
 *   a worked solution once the question closes (pathSolutionSupport.mjs is
 *   the Path original; this is the same ladder for QuestionEngine).
 *
 * feedbackOpenForItem — the one gate. Specific feedback, a diagnosis or a
 * review may be shown only when outcome feedback is open for this activity
 * AND, for anything but immediate-feedback practice, the item is closed. A
 * DOL, quiz or test item that can still be answered gets none of it, even
 * after a release, and a server-graded host (Path, Test Cycle, Live
 * Challenge) keeps its own feedback.
 *
 * missFeedback — the sentence under "Not quite": an authored message keyed
 * to this wrong answer first, then the misconception / generic diagnosis
 * (missDiagnosis.js), then the authored attempt feedback for this attempt
 * number. Null when there is nothing specific to say — the platform never
 * pads it with a generic "check your work".
 */
import { buildPrivateSupport } from '../../../../functions/shared/pathSolutionSupport.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

export const feedbackOpenForItem = ({ showOutcomeFeedback = false, immediateFeedback = false, closed = false, serverGraded = false } = {}) => (
  Boolean(showOutcomeFeedback) && !serverGraded && (Boolean(immediateFeedback) || Boolean(closed))
);

/** The student's submitted values, as text, from the graded parts. */
export const submittedValues = (parts = []) => list(parts)
  .map((part) => part?.response)
  .flatMap((value) => (Array.isArray(value) ? [`(${value.join(', ')})`] : [value]))
  .filter((value) => typeof value === 'string' || typeof value === 'number')
  .map(text)
  .filter(Boolean);

export const missFeedback = ({ question = null, attemptNumber = 1, diagnosis = null, parts = [] } = {}) => {
  let support = null;
  try {
    support = buildPrivateSupport(question || {});
  } catch {
    support = null;
  }
  const given = submittedValues(parts).map((value) => value.toLowerCase().replace(/\s+/g, ''));
  const authoredMatch = list(support?.misconceptions).find((entry) => entry.match
    .some((candidate) => given.includes(text(candidate).toLowerCase().replace(/\s+/g, ''))));
  if (authoredMatch) return { message: authoredMatch.message, source: 'authored-misconception' };
  if (diagnosis?.message) return { message: diagnosis.message, source: diagnosis.source || 'diagnosis' };
  const feedback = list(support?.attemptFeedback);
  if (feedback.length) {
    const index = Math.min(Math.max(0, Number(attemptNumber) - 1), feedback.length - 1);
    return { message: feedback[index], source: 'authored-feedback' };
  }
  return null;
};

/** On the second miss onwards, a hint is offered (never shown unasked). */
export const hintOfferedAfterMiss = ({ attemptNumber = 1, hintsAvailable = false, open = true } = {}) => (
  Boolean(open) && Boolean(hintsAvailable) && Number(attemptNumber) >= 2
);

/** The closing sentence: points at a review only when there is one. */
export const closedAttemptText = ({ maximumAttempts = 1, reviewAvailable = false, allowReplacement = false } = {}) => {
  const review = reviewAvailable ? ' The worked solution is below.' : '';
  const replacement = allowReplacement
    ? (reviewAvailable ? ' Review it, then request a new question to continue.' : ' Request a new question to continue.')
    : '';
  return `That was the final allowed attempt (${maximumAttempts} total). This response is locked.${review}${replacement}`;
};
