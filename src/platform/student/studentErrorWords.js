/*
 * THE WORDS HALF OF studentErrorText.js (pass 3, wave 7).
 *
 * What happened, in a student's words, and whether trying again can help —
 * without the named way out, so a screen on the sign-in path (SessionGate)
 * or inside a game (the Live Challenge screens) can say it without loading
 * the navigation model. studentErrorText.js adds the exit and re-exports
 * these. Pure: no React, no network.
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

/*
 * WORDS NO PERSON WROTE FOR A STUDENT (pass 3, wave 7).
 *
 * Only a callable's message (code `functions/…`) is a sentence our server
 * wrote. A Firestore or Auth SDK error ("Missing or insufficient
 * permissions.") and a program error ("e.map is not a function") read like
 * sentences and pass the word filter, so they are never kept: the screen's
 * own fallback says what did not work instead.
 */
const PROGRAM_ERRORS = new Set(['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'EvalError', 'URIError']);
const fromCallable = (error) => String(error?.code || '').startsWith('functions/');
/*
 * The Functions SDK also makes `functions/…` errors itself (no answer from our
 * server): a bare code ("internal", "deadline-exceeded" on its own timeout)
 * or one of these sentences (@firebase/functions, index.esm.js). They are
 * never our server's words.
 */
const CALLABLE_SDK_SENTENCE = /^(?:Response is not valid JSON object|Response is missing data field|Request was cancelled|Firebase Functions instance was deleted)\.?$/i;
const sdkSentence = (error, message) => fromCallable(error) && CALLABLE_SDK_SENTENCE.test(String(message || '').trim());
const machineWords = (error) => {
  if (!error || typeof error !== 'object') return false;
  if (PROGRAM_ERRORS.has(error.name)) return true;
  if (sdkSentence(error, error.message)) return true;
  return error.name === 'FirebaseError' && !fromCallable(error);
};

/** A sentence a person wrote for a student, or '' when the message is not one. */
export const studentSafeSentence = (message) => {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 300) return '';
  // A bare code ("internal", "failed-precondition") is not a sentence.
  if (!/\s/.test(text)) return '';
  if (DEVELOPER_WORDS.test(text)) return '';
  return text;
};

/*
 * `fallback` is the screen's own sentence for what did not work ("Could not
 * load the Live Challenge."), used where no safe sentence comes with the error.
 */
export const describeStudentErrorWords = (error, { fallback = null } = {}) => {
  const code = codeOf(error);
  const message = typeof error === 'string' ? error : error?.message;
  const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
  const fetchFailed = /failed to fetch|networkerror|load failed|network request failed/i.test(String(message || ''));
  const ownWords = machineWords(error) ? '' : studentSafeSentence(message);
  const otherwise = studentSafeSentence(fallback) || STUDENT_ERROR_TEXT.generic;
  if (offline || fetchFailed) return { text: STUDENT_ERROR_TEXT.offline, retry: true };
  /*
   * OUR SERVER ANSWERED, WHATEVER THE CODE (review B1). A callable refusal
   * may carry an "unreachable" code with a sentence written for the student:
   * HttpsError('deadline-exceeded', 'Time was up before your answer arrived,
   * so it was not counted.') is an answer, not a dropped connection, and
   * calling it a Wi-Fi problem is untrue. Its sentence wins; asking again
   * only where the server says it can help.
   */
  if (UNREACHABLE.has(code) && fromCallable(error) && ownWords) return { text: ownWords, retry: error?.details?.retry === true };
  // No answer: the SDK's own bare code or timeout. A sentence the SDK made
  // (a malformed response, a cancelled request) is not a Wi-Fi problem either.
  if (UNREACHABLE.has(code)) return sdkSentence(error, message) ? { text: otherwise, retry: true } : { text: STUDENT_ERROR_TEXT.offline, retry: true };
  // A refusal the server marks as retryable (details.retry) keeps the button.
  if (REFUSALS.has(code)) return { text: ownWords || otherwise, retry: error?.details?.retry === true };
  return { text: ownWords || otherwise, retry: true };
};

/*
 * Just the sentence, for a screen that shows one line and logs the rest. The
 * technical text stays with the caller's console line, for support.
 */
export const studentErrorSentence = (error, fallback = null) => describeStudentErrorWords(error, { fallback }).text;
