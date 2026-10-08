/*
 * A FAILED TEST CYCLE ACTION, SAID IN WORDS A TEACHER CAN ACT ON.
 *
 * The teacher panel used to print `error.message` from the callable as-is.
 * For a callable that never answered, that is the single word "internal": the
 * Firebase client reports a fetch with no usable response as code `internal`
 * with the code itself as the message. A common cause is a function whose
 * Cloud Run service does not let browsers in: Google answers the CORS
 * preflight with a 403 the browser cannot read. The Firebase CLI grants that
 * access only when it creates a callable, so a deployed, healthy function can
 * stay closed (scripts/verify-callable-access.mjs). Not deployed, failing to
 * start, or a dropped network look the same from here. A teacher who pressed
 * "Waive Review" was told "internal" and nothing else: not what failed,
 * whether anything changed, or what to try next.
 *
 * Three cases, told apart by what the client actually received:
 *   - no answer at all: lowercase "internal" (or unavailable / deadline);
 *   - an unhandled server error: "INTERNAL", which the callable wrapper sends;
 *   - a refusal the server wrote (HttpsError with a sentence): shown as-is,
 *     because "That student is not assigned this Test Cycle." is already right.
 *
 * Pure: no React, no Firebase.
 */

const NO_ANSWER_CODES = new Set(['unavailable', 'deadline-exceeded']);

const codeOf = (error) => String(error?.code || '').replace(/^functions\//, '').trim();

export const describeTestCycleCallError = (error, { action = 'That action', callable = '' } = {}) => {
  const code = codeOf(error);
  const message = String(error?.message || '').replace(/^Firebase:\s*/i, '').trim();
  const fn = callable ? ` (Cloud Function "${callable}")` : '';

  // What the callable wrapper sends for an exception the handler did not catch.
  if (code === 'internal' && message === 'INTERNAL') {
    return `${action} failed with a server error${fn}. `
      + 'Refresh to see whether it was applied. If it happens again, the Cloud Functions log for that function has the cause.';
  }
  // The client's own code word standing in for a message: nothing came back.
  const bareCode = !message || message.toLowerCase() === code;
  if (bareCode && (code === 'internal' || NO_ANSWER_CODES.has(code))) {
    return `${action} did not go through: the server did not answer${fn}. `
      + 'Refresh to see whether it was applied, then try again. '
      + 'If it keeps happening on a working connection, that function is probably closed to browsers (its Cloud Run invoker access), '
      + 'not deployed, or failing to start.';
  }
  if (!bareCode) return message;
  return `${action} did not complete${code ? ` (${code})` : ''}. Refresh and try again.`;
};
