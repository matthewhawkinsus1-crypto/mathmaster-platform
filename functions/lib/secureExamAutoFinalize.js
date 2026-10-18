'use strict';

/*
 * THE ABANDONED-TEST FINALIZER'S BATCHES, AS PURE RULES.
 *
 * `finalizeAbandonedSecureExams` (functions/index.js) runs every few minutes.
 * Each run looks at a bounded number of sessions: the ones whose stored
 * `autoFinalizeAt` has passed (secureExam.autoFinalizeAtFor), and one page of
 * the sessions started before that hint existed.
 *
 * SESSIONS WRITTEN BEFORE THE HINT ARE DERIVED, NOT LEFT.
 *
 * A session started before this release has no `autoFinalizeAt`, and a query
 * cannot ask for a missing field. Its deadline is derived exactly as every
 * callable derives it (`deadlineFor` over the fields the session already
 * holds), so finishing it is what the student's own time-up would do on their
 * return: saves after that deadline are already refused, so the drafts the
 * server grades cannot change. The sweep pages through every unfinished,
 * started session by document id, and for each one with no hint either
 * finishes it (time up, and the grace passed) or writes the derived hint, which
 * hands it to the ordinary query.
 *
 * The sweep remembers where it is in `platformMigrations/{SWEEP_DOC_ID}` and
 * stops for good after a whole pass finds nothing to do, once that pass began
 * at least SWEEP_SETTLE_MS after the first run. The wait covers a release
 * rolling out: an instance still on the previous build can start a session
 * without the hint while the new functions are already running.
 */

const MAIN_BATCH_LIMIT = 50;
const SWEEP_PAGE_LIMIT = 100;
const SWEEP_SETTLE_MS = 6 * 60 * 60 * 1000;
// A session that could not be finished is looked at again after this long,
// so one that keeps failing cannot hold the batch's places forever.
const RETRY_BACKOFF_MS = 15 * 60 * 1000;
const SWEEP_DOC_ID = 'secureExamAutoFinalizeDeadlines';
// Started and not finished: the states a session without a hint can be in.
const SWEEP_STATES = Object.freeze(['in_progress', 'locked_integrity', 'locked_proctor']);

function initialSweepState(now) {
  return { cursor: null, passStartedAt: now, passFoundLegacy: 0, settleAfter: now + SWEEP_SETTLE_MS, completedAt: null };
}

/** The stored sweep state, or a fresh one; null once the sweep is complete. */
function sweepStateOf(stored, now) {
  if (!stored || typeof stored !== 'object') return initialSweepState(now);
  if (Number(stored.completedAt) > 0) return null;
  const settleAfter = Number(stored.settleAfter);
  const passStartedAt = Number(stored.passStartedAt);
  return {
    cursor: typeof stored.cursor === 'string' && stored.cursor ? stored.cursor : null,
    passStartedAt: Number.isFinite(passStartedAt) && passStartedAt > 0 ? passStartedAt : now,
    passFoundLegacy: Math.max(0, Number(stored.passFoundLegacy) || 0),
    settleAfter: Number.isFinite(settleAfter) && settleAfter > 0 ? settleAfter : now + SWEEP_SETTLE_MS,
    completedAt: null,
  };
}

/**
 * Where the sweep goes after one page: the next page, a new pass, or done.
 * `returned` is how many sessions the page held, `lastId` the last one's id,
 * `foundLegacy` how many of them had no hint.
 */
function nextSweepState(state, { now, returned, lastId, foundLegacy, pageLimit = SWEEP_PAGE_LIMIT }) {
  const found = state.passFoundLegacy + Math.max(0, Number(foundLegacy) || 0);
  if (returned >= pageLimit && lastId) return { ...state, cursor: String(lastId), passFoundLegacy: found };
  if (found === 0 && state.passStartedAt >= state.settleAfter) return { ...state, cursor: null, passFoundLegacy: 0, completedAt: now };
  return { ...state, cursor: null, passStartedAt: now, passFoundLegacy: 0 };
}

const sameSweepState = (left, right) => ['cursor', 'passStartedAt', 'passFoundLegacy', 'settleAfter', 'completedAt']
  .every((key) => (left?.[key] ?? null) === (right?.[key] ?? null));

module.exports = {
  MAIN_BATCH_LIMIT,
  RETRY_BACKOFF_MS,
  SWEEP_DOC_ID,
  SWEEP_PAGE_LIMIT,
  SWEEP_SETTLE_MS,
  SWEEP_STATES,
  nextSweepState,
  sameSweepState,
  sweepStateOf,
};
