import { resolveErrorExit } from './navigationModel.js';
import { STUDENT_ERROR_TEXT, describeStudentErrorWords, studentErrorSentence, studentSafeSentence } from './studentErrorWords.js';

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
 * The words (text, retry) are studentErrorWords.js's, shared with screens
 * that show only a sentence. Pure: no React, no network.
 */

export { STUDENT_ERROR_TEXT, studentErrorSentence, studentSafeSentence };

/*
 * `fallback` is the screen's own sentence for what did not work ("Could not
 * load the Live Challenge."), used where no safe sentence comes with the error.
 */
export const describeStudentError = (error, { level = null, retryCount = 0, retryLimit = 2, fallback = null } = {}) => {
  const { text, retry, noAnswer } = describeStudentErrorWords(error, { fallback });
  const exit = resolveErrorExit(level, { retryCount, retryLimit });
  return {
    text,
    // The limit is for an answer that keeps being the same. A request that got
    // no answer (the Wi-Fi dropped) is not that: the connection comes back, and
    // Try again is how a student gets back with it, so it is never taken away
    // (TC17). The student is still told, after the limit, that it is not theirs
    // to fix (exhaustedMessage below).
    retry: retry && (exit.offerRetry || noAnswer === true),
    exit: { level: exit.level, label: exit.label, shortLabel: exit.shortLabel },
    exhaustedMessage: retry ? exit.exhaustedMessage : null,
  };
};

export default describeStudentError;
