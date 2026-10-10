/*
 * WHAT A REFUSAL MEANS FOR A LOCKED ANSWER.
 *
 * A student's answer is locked the moment they press Lock In: the screen keeps
 * the exact envelope (payload and submission id) until the server has it
 * (ChallengeRound in LiveChallengeStudent.jsx). When the server refuses it, the
 * screen decides what that refusal means for the envelope. The rule is here, in
 * one place, for the screen and for the launch certification's simulated
 * device (tests/integration/support/liveChallengeSimStudent.mjs), which must
 * behave exactly as the screen does:
 *
 *   already-recorded  the server already holds this student's answer for the
 *                     round. The envelope is settled and nothing is lost.
 *   retry-at-go       the answer reached the server before the round's GO on
 *                     the SERVER'S clock. This device showed GO first because
 *                     its synced clock runs a little ahead, so the student
 *                     answered at a GO the server had not reached yet. The
 *                     answer was not graded and the refusal is not final: the
 *                     same envelope, with the same submission id, is sent
 *                     again once this device's server time passes startsAt
 *                     plus a margin.
 *   closed            the round is over for this answer (time up, closed,
 *                     gone). The screen catches up, as it always has.
 *   transient         anything else (offline, a server hiccup). The envelope
 *                     is kept for a retry.
 *
 * The server gives its reason for refusing an early answer in the HttpsError's
 * details, { reason: 'round_not_started' } (liveChallengeArrivalRefusal in
 * functions/index.js), and httpsCallable passes them to the client as
 * `error.details`. The message is matched only when no reason came with it.
 *
 * FAIRNESS. The server still refuses anything that arrives before GO; nothing
 * here changes that. A resend goes at GO and never after the student's own
 * deadline, so it buys no time. It is the same submission, so the server's
 * receipt for that id makes a second scoring impossible.
 *
 * Pure: tested in node (tests/platform/liveChallengeAnswerRefusal.test.mjs).
 */

export const REFUSAL_OUTCOME = Object.freeze({
  ALREADY_RECORDED: 'already-recorded',
  RETRY_AT_GO: 'retry-at-go',
  CLOSED: 'closed',
  TRANSIENT: 'transient',
});

// The server's reason for an answer that arrived before the round's GO
// (functions/shared/liveChallengeParity.mjs submissionArrivalDecision).
export const ROUND_NOT_STARTED = 'round_not_started';

// A refused answer is resent this long after GO, on this device's server time.
export const RESEND_AT_GO_MARGIN_MS = 250;

// Automatic resends of one envelope. After them the envelope is still kept and
// the screen asks the student to tap Retry.
export const RESEND_AT_GO_MAX = 3;

/** Whether the server refused this answer because it arrived before GO. */
export const refusedBeforeGo = (error) => {
  if (!/deadline-exceeded/.test(String(error?.code || ''))) return false;
  const reason = error?.details?.reason;
  if (typeof reason === 'string') return reason === ROUND_NOT_STARTED;
  return /has not started yet/i.test(String(error?.message || ''));
};

/** What a refused answer means for its locked envelope: a REFUSAL_OUTCOME. */
export const classifyAnswerRefusal = (error) => {
  const code = String(error?.code || '');
  if (/already-exists/.test(code)) return REFUSAL_OUTCOME.ALREADY_RECORDED;
  if (refusedBeforeGo(error)) return REFUSAL_OUTCOME.RETRY_AT_GO;
  if (/failed-precondition|deadline-exceeded|not-found/.test(code)) return REFUSAL_OUTCOME.CLOSED;
  return REFUSAL_OUTCOME.TRANSIENT;
};

/**
 * How long to wait before resending an envelope the server refused before GO,
 * or null when it must not be resent automatically.
 *
 * The resend goes once this device's server time passes startsAt plus the
 * margin. It also waits at least the margin after this refusal, doubling with
 * each one, so a clock further ahead than the margin gets a few spaced tries
 * rather than a burst. Null after RESEND_AT_GO_MAX resends, when the round's
 * start is unknown, or when the resend would go at or after `endsAtMs` (the
 * student's own deadline; 0 for a round with no deadline).
 *
 * @param {object} timing
 * @param {number} timing.serverNowMs   this device's estimate of server time
 * @param {number} timing.startsAtMs    the round's GO
 * @param {number} [timing.endsAtMs]    the student's deadline, 0 for none
 * @param {number} [timing.resendsSoFar] automatic resends of this envelope so far
 */
export const resendAtGoDelayMs = ({ serverNowMs, startsAtMs, endsAtMs = 0, resendsSoFar = 0 }) => {
  const nowMs = Number(serverNowMs);
  const goMs = Number(startsAtMs);
  const deadlineMs = Number(endsAtMs) || 0;
  const resends = Math.max(0, Math.floor(Number(resendsSoFar) || 0));
  if (!Number.isFinite(nowMs) || !(goMs > 0) || resends >= RESEND_AT_GO_MAX) return null;
  const sendAtMs = Math.max(goMs + RESEND_AT_GO_MARGIN_MS, nowMs + RESEND_AT_GO_MARGIN_MS * 2 ** resends);
  if (deadlineMs > 0 && sendAtMs >= deadlineMs) return null;
  return sendAtMs - nowMs;
};

/*
 * GRAPH FEATURE RUSH sends taps in batches, and its server refuses a batch
 * outside the round with a bare deadline-exceeded: "Time is up for this
 * round." whether it came after the deadline or just before GO
 * (submitGraphFeatureRushAttempts in functions/index.js), and a client-side
 * timeout has the same code. This device's own clock tells them apart: in the
 * round's last RUSH_TIME_UP_WINDOW_MS it is time up and the queue is dropped;
 * earlier it is a batch that reached the server before its GO (this clock runs
 * a little ahead) or a timeout, so the taps are kept and sent again.
 */
export const RUSH_TIME_UP_WINDOW_MS = 1_500;

/** Whether a refused rush batch means time is up (`code` is the error's code). */
export const rushRefusalIsTimeUp = (code, msUntilEnd) => (
  /deadline-exceeded/.test(String(code || '')) && Number(msUntilEnd) <= RUSH_TIME_UP_WINDOW_MS
);
