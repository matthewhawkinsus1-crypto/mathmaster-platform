import { resolveErrorExit } from './navigationModel.js';

/*
 * ONE TRANSLATOR FROM AN ERROR TO WORDS A STUDENT CAN USE (student pass 3, NAV-11).
 *
 * Raw error words reached students: "internal" on the sign-in screen over
 * flaky Wi-Fi (the Firebase SDK turns a failed callable fetch into code and
 * message "internal"), "check the Firebase Functions log for the failing
 * action", a Test Cycle card that printed whatever its callable threw and
 * offered only "Try again".
 *
 * describeStudentError answers three things, every time:
 *
 *   text    what happened, in a student's words — a server sentence written
 *           for students is kept; a code, a stack or a developer's word is not
 *   retry   whether trying again can help (a refusal will say the same thing)
 *   exit    a named way out that is not Retry (navigationModel's
 *           resolveErrorExit, unused until now): "Back to My assignments"
 *
 * Pure: no React, no network.
 */

export const STUDENT_ERROR_TEXT = Object.freeze({
  offline: "Can't reach MathMaster right now. Check the Wi-Fi and try again.",
  generic: 'Something went wrong on our side. Try again, or tell your teacher if it keeps happening.',
});

// Codes that mean "the request did not get an answer": trying again can help.
const UNREACHABLE = new Set([
  'internal', 'unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'cancelled',
  'network-request-failed', 'resource-exhausted',
]);
// Codes that mean "the server answered, and the answer is no": its sentence
// (written for students) is the explanation; trying again will not change it.
const REFUSALS = new Set([
  'failed-precondition', 'permission-denied', 'not-found', 'invalid-argument', 'out-of-range', 'already-exists',
]);

// Words a student should never be shown: they name the machinery, not the problem.
const DEVELOPER_WORDS = /\b(firebase|firestore|functions? log|hosting|callable|stack|undefined|null|exception|typeerror|referenceerror|INTERNAL|cors|http\s*\d{3}|status code|deploy|bundle|chunk|offline mode|backend)\b/i;

const codeOf = (error) => String(error?.code || '').replace(/^(functions|auth|firestore)\//, '').trim();

/** A sentence a person wrote for a student, or '' when the message is not one. */
export const studentSafeSentence = (message) => {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 300) return '';
  // A bare code ("internal", "failed-precondition") is not a sentence.
  if (!/\s/.test(text)) return '';
  if (DEVELOPER_WORDS.test(text)) return '';
  return text;
};

export const describeStudentError = (error, { level = null, retryCount = 0, retryLimit = 2 } = {}) => {
  const code = codeOf(error);
  const message = typeof error === 'string' ? error : error?.message;
  const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
  const fetchFailed = /failed to fetch|networkerror|load failed|network request failed/i.test(String(message || ''));
  const exit = resolveErrorExit(level, { retryCount, retryLimit });

  let text;
  let retry;
  if (offline || fetchFailed || UNREACHABLE.has(code)) {
    text = STUDENT_ERROR_TEXT.offline;
    retry = true;
  } else if (REFUSALS.has(code)) {
    text = studentSafeSentence(message) || STUDENT_ERROR_TEXT.generic;
    // A refusal the server marks as retryable (details.retry) keeps the button.
    retry = error?.details?.retry === true;
  } else {
    text = studentSafeSentence(message) || STUDENT_ERROR_TEXT.generic;
    retry = true;
  }
  return {
    text,
    retry: retry && exit.offerRetry,
    exit: { level: exit.level, label: exit.label, shortLabel: exit.shortLabel },
    exhaustedMessage: retry ? exit.exhaustedMessage : null,
  };
};

export default describeStudentError;
