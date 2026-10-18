/*
 * THE BUTTON THAT SPENDS A TRY SAYS SO (student pass 3, RUN-4; decision D9).
 *
 * The action that spent one of a student's tries had a dozen names — "Submit
 * Answer", "Submit Another Attempt", "Check construction", "Submit my
 * regression" — while "Check this stage" on the representations board was
 * free. The last try looked like every other, and a one-try item said nothing
 * until it was gone.
 *
 * D9: "Check" never costs a try and "Submit" always does. So the action that
 * spends one is called Submit, wherever it is (the engine's action bar and a
 * registry tool's own final button), and it carries its cost:
 *
 *   "Submit — uses 1 of 3 tries"        the first of several
 *   "Submit — uses 1 of 2 tries left"   after a miss
 *   "Submit — last try"                 one left of several (a distinct state)
 *   "Submit — your only try"            a one-try item, said before it is spent
 *   "Submit"                            tries that never run out (Live Challenge)
 *
 * A host that names the action itself (a secure Test's "Record answer" /
 * "Save answer") keeps its own words: there the host decides what the action
 * is, and a navigation-mode save costs nothing.
 */

export const SUBMIT_VERB = 'Submit';

const whole = (value, fallback = 0) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
};

/**
 * What one Submit costs right now.
 *   { kind: 'unlimited' | 'only' | 'last' | 'counted' | 'none',
 *     remaining, maximum, phrase, short }
 * `phrase` follows "Submit — "; `short` is the phone's second line, under
 * "Submit" in a one-row bar that leaves it ~80px at 344px wide: "1 of 3",
 * "last try", "only try" — each a part of the whole phrase, which is the
 * accessible name, so a student using speech input can say what they see.
 * 'none': nothing left to spend (the question is closed) — no cost to show.
 */
export const submitTryCost = ({
  maximumAttempts = 1,
  attemptCount = 0,
  remainingAttempts = null,
  attemptsDoNotExpire = false,
} = {}) => {
  const maximum = Math.max(1, whole(maximumAttempts, 1));
  if (attemptsDoNotExpire) return { kind: 'unlimited', remaining: null, maximum, phrase: '', short: '' };
  const remaining = remainingAttempts === null || remainingAttempts === undefined
    ? Math.max(0, maximum - Math.max(0, whole(attemptCount)))
    : Math.max(0, whole(remainingAttempts));
  if (remaining <= 0) return { kind: 'none', remaining: 0, maximum, phrase: '', short: '' };
  if (maximum === 1) return { kind: 'only', remaining, maximum, phrase: 'your only try', short: 'only try' };
  if (remaining === 1) return { kind: 'last', remaining, maximum, phrase: 'last try', short: 'last try' };
  return remaining >= maximum
    ? { kind: 'counted', remaining, maximum, phrase: `uses 1 of ${maximum} tries`, short: `1 of ${maximum}` }
    : { kind: 'counted', remaining, maximum, phrase: `uses 1 of ${remaining} tries left`, short: `1 of ${remaining}` };
};

/** "Submit — <phrase>", or "Submit" when there is no cost to say. */
export const submitLabelForCost = (cost) => (cost?.phrase ? `${SUBMIT_VERB} — ${cost.phrase}` : SUBMIT_VERB);

/**
 * The engine's action-bar label. A host label wins (secure Tests); while a
 * submit is in flight the button says so, in the host's word or Submit's.
 */
export const submitActionLabel = ({ hostLabel = null, submitting = false, cost = null } = {}) => {
  const host = typeof hostLabel === 'string' && hostLabel.trim() ? hostLabel.trim() : null;
  if (submitting) return host ? 'Recording…' : 'Submitting…';
  return host || submitLabelForCost(cost);
};

/**
 * The outcome of a miss that leaves tries, in the strip's word (D9). It said
 * "You have 2 attempts remaining on this version" — "attempts" beside a strip
 * that says "tries", and a version number the student never sees.
 */
export const missOutcomeText = (remainingAttempts) => {
  const left = Math.max(0, whole(remainingAttempts));
  if (left === 1) return 'Not quite. You have 1 try left — your last one.';
  return `Not quite. You have ${left} tries left.`;
};

/**
 * The tries strip above the question while it is open: the count, with the
 * last try and a one-try item named as such.
 */
export const triesLeftText = ({ maximumAttempts = 1, remainingAttempts = 0 } = {}) => {
  const maximum = Math.max(1, whole(maximumAttempts, 1));
  const left = Math.max(0, whole(remainingAttempts));
  if (maximum === 1 && left === 1) return 'One try on this question';
  if (left === 1) return `Last try · 1 of ${maximum} left`;
  return `${left} of ${maximum} tries left`;
};

/*
 * A miss, then the same answer typed back (HELP-24). The box said "You may
 * submit the same response again. No answer change is required." — true of
 * the button, and an invitation to spend a try on an answer already marked
 * wrong. It says what Submit costs instead (D9: Submit always costs a try).
 */
export const SAME_ANSWER_AGAIN = 'This is the same answer as your last try. Submitting it again uses another try.';
