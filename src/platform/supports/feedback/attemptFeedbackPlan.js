/*
 * WHAT A CLASSROOM QUESTION SAYS AFTER AN ATTEMPT — THE PATH PATTERN.
 *
 *   specific feedback on a miss → a hint offered on the second miss →
 *   a worked solution once the question closes (pathSolutionSupport.mjs is
 *   the Path original; this is the same ladder for QuestionEngine).
 *
 * feedbackOpenForItem — the one gate. Specific feedback, a diagnosis or a
 * review may be shown only when outcome feedback is open for this activity
 * AND, for anything but immediate-feedback practice, the item is closed AND
 * the teacher has released the assignment's feedback. A DOL, quiz or test item
 * that can still be answered gets none of it, and a server-graded host (Path,
 * Test Cycle, Live Challenge) keeps its own feedback.
 *
 * `closed` is the QUESTION closing (correct, or out of attempts) — never a
 * section lock, which a teacher can lift. `assessmentReleased` is the
 * assignment-level release only: a DOL shows right/wrong per item as soon as
 * the item closes, and "Grant one more DOL attempt" then reopens that same
 * item, so a per-item release must not open a review (PR #462 review B1).
 * An activity role nobody recognises fails closed (`roleKnown: false`).
 *
 * missFeedback — the sentence under "Not quite": an authored message keyed
 * to this wrong answer first, then the lesson's own common error when it is
 * the one the student made (commonErrorMiss, FB04), then the misconception /
 * generic diagnosis (missDiagnosis.js), then the authored attempt feedback for
 * this attempt number. Null when there is nothing specific to say — the
 * platform never pads it with a generic "check your work".
 */
import { buildPrivateSupport } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField, matchesFieldAnswer } from '../../../../functions/shared/answerUtils.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

export const feedbackOpenForItem = ({
  showOutcomeFeedback = false,
  immediateFeedback = false,
  closed = false,
  assessmentReleased = false,
  serverGraded = false,
  roleKnown = true,
} = {}) => (
  roleKnown === true
  && Boolean(showOutcomeFeedback)
  && !serverGraded
  && (Boolean(immediateFeedback) || (Boolean(closed) && assessmentReleased === true))
);

/** The student's submitted values, as text, from the graded parts. */
export const submittedValues = (parts = []) => list(parts)
  .map((part) => part?.response)
  .flatMap((value) => (Array.isArray(value) ? [`(${value.join(', ')})`] : [value]))
  .filter((value) => typeof value === 'string' || typeof value === 'number')
  .map(text)
  .filter(Boolean);

/*
 * THE LESSON'S OWN COMMON ERROR, WHEN IT IS THE ONE THE STUDENT MADE (FB04).
 *
 * A lesson item's solutionReview.commonError reads "<the mistake>; <why, and
 * the right answer>". It was shown only once the question closed, so a
 * student who wrote exactly that wrong answer heard "Not quite" and nothing
 * more (walkthrough 2026-10-22, DOL #3 PR 1). Now the mistake half is said on
 * a miss, and only when a wrong value the student submitted is one the
 * mistake half names, compared by the grader's own equivalence. The half
 * after ";" explains and gives the answer, so it still waits for the closed
 * question's review; a mistake half with no ";" after it, or one that names a
 * value the question accepts, is never said. Like everything missFeedback
 * returns, it shows only where feedbackOpenForItem allows outcome feedback.
 */
const MATH_WORDS = new Set(['sqrt', 'log', 'ln', 'sin', 'cos', 'tan', 'inf', 'pi']);
const isMathToken = (token) => {
  const bare = token.replace(/^\$/, '').replace(/[.;:!?]+$/, '');
  if (!bare) return false;
  return (bare.match(/[A-Za-z]{2,}/g) || []).every((word) => MATH_WORDS.has(word.toLowerCase()));
};
// Each run of consecutive math tokens with a digit in it: "0 ≤ y ≤ 80" and
// "0 ≤ y ≤ 100" in "Writing the range as 0 ≤ y ≤ 80 or 0 ≤ y ≤ 100".
const namedValues = (clause) => {
  const runs = [];
  let run = [];
  const close = () => {
    const value = run.join(' ').replace(/^\$/, '').replace(/[.,;:!?]+$/, '');
    if (/\d/.test(value)) runs.push(value);
    run = [];
  };
  clause.split(/\s+/).forEach((token) => {
    if (isMathToken(token)) run.push(token); else close();
  });
  close();
  return runs;
};
const KEY_FIELDS = ['answerFields', 'responses', 'responseFields'];
const questionKeys = (question = {}) => [
  ...KEY_FIELDS.flatMap((key) => list(question?.[key]).flatMap((field) => answerCandidatesForField(field || {}))),
  ...Object.entries(question || {})
    .filter(([key, value]) => (/^correct[A-Z]/.test(key) || key === 'answer') && (typeof value === 'string' || typeof value === 'number'))
    .map(([, value]) => value),
].map(text).filter(Boolean);

export const commonErrorMiss = ({ question = null, parts = [] } = {}) => {
  const authored = text(question?.solutionReview?.commonError);
  const split = authored.indexOf(';');
  // A family template's text before its numbers are filled in says nothing yet.
  if (split <= 0 || authored.includes('{{')) return null;
  const mistake = authored.slice(0, split).trim().replace(/[.,:]+$/, '');
  const named = namedValues(mistake);
  if (!named.length) return null;
  const same = (value, candidate) => {
    try { return matchesFieldAnswer(value, { answer: candidate }); } catch { return false; }
  };
  const keys = questionKeys(question);
  if (named.some((candidate) => keys.some((key) => same(key, candidate)))) return null;
  const wrong = list(parts).filter((part) => part && part.graded !== false && part.isCorrect === false);
  const made = submittedValues(wrong).some((value) => named.some((candidate) => same(value, candidate)));
  if (!made) return null;
  const sentence = /^[A-Z][a-z]/.test(mistake) ? `${mistake[0].toLowerCase()}${mistake.slice(1)}` : mistake;
  return { message: `A common slip here: ${sentence}.`, source: 'authored-common-error' };
};

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
  const commonError = commonErrorMiss({ question, parts });
  if (commonError) return commonError;
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
  // One word for them, tries (D9); "attempt", "total" and "response" were the
  // program's words. HELP-24: no "Your answer is locked." — the card's own
  // banner already says the question is closed, once.
  const tries = Math.max(1, Math.floor(Number(maximumAttempts)) || 1);
  const spent = tries === 1 ? 'That was your only try.' : `That was your last try (${tries} in all).`;
  return `${spent}${review}${replacement}`;
};
