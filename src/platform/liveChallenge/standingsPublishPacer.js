/*
 * WHEN THE HOST ASKS FOR A LIVE STANDINGS SNAPSHOT.
 *
 * The host console already listens to every player's public row (it needs
 * them: who has answered, who is racing, the projector's board). Students no
 * longer do: they listen to one standings snapshot
 * (functions/shared/liveChallengeStandingsProjection.mjs). This pacer turns
 * "the standings the host sees changed" into at most one publish request per
 * interval:
 *
 *   leading edge   the first change after a quiet second is published after a
 *                  short coalescing window (a burst of answers rides one
 *                  snapshot), so a lone answer reaches screens in well under
 *                  a second;
 *   trailing edge  a change during the interval, or while a publish is in
 *                  flight, schedules exactly one more, at the interval's end —
 *                  so the last answer of a burst is never left unpublished;
 *   server says    when the server answers "too soon" it names when to try,
 *                  and the pacer waits that long — and no longer: a refused
 *                  request published nothing, so it does not start a new
 *                  interval (it once did, and every other request was refused,
 *                  doubling the cadence).
 *
 * The server enforces the same interval and decides what the snapshot says;
 * the host only says WHEN. A host that stops (asleep, offline, closed) leaves
 * the live board stale and nothing else: answers, scoring and the exact
 * round-close and final snapshots never depend on it.
 *
 * Pure timing logic with an injected clock and timer, so it is tested in node
 * and mirrored by the launch certification's simulated host.
 */

export const STANDINGS_PUBLISH_INTERVAL_MS = 1_000;
export const STANDINGS_PUBLISH_COALESCE_MS = 150;
// A failed request (offline, a server error) is retried, but no faster than this.
export const STANDINGS_PUBLISH_RETRY_MS = 3_000;

/**
 * `publish()` sends one request and resolves with the server's reply
 * ({ published, retryAfterMs } or anything); a rejection counts as a failure.
 */
export function createStandingsPublishPacer({
  publish,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  intervalMs = STANDINGS_PUBLISH_INTERVAL_MS,
  coalesceMs = STANDINGS_PUBLISH_COALESCE_MS,
  retryMs = STANDINGS_PUBLISH_RETRY_MS,
  onSent = null,
} = {}) {
  let lastSentAt = -Infinity;
  let timer = null;
  let dueAt = null;
  let inFlight = false;
  // A change seen since the last request was sent: one more is owed.
  let dirty = false;
  let stopped = false;
  let notBefore = -Infinity;

  const arm = (at) => {
    if (stopped) return;
    if (timer !== null && dueAt !== null && dueAt <= at) return;
    if (timer !== null) clearTimer(timer);
    dueAt = at;
    timer = setTimer(fire, Math.max(0, at - now()));
  };

  const nextSlot = () => Math.max(now() + coalesceMs, lastSentAt + intervalMs, notBefore);

  function fire() {
    timer = null;
    dueAt = null;
    if (stopped || !dirty) return;
    if (inFlight) return; // the reply re-arms
    const at = now();
    if (at < lastSentAt + intervalMs || at < notBefore) { arm(Math.max(lastSentAt + intervalMs, notBefore)); return; }
    dirty = false;
    inFlight = true;
    const counted = lastSentAt;
    lastSentAt = at;
    onSent?.(at);
    Promise.resolve()
      .then(() => publish())
      .then((reply) => {
        const retryAfterMs = Number(reply?.retryAfterMs);
        if (reply && reply.published === false && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
          // Too soon for the server: what this request carried is still owed,
          // and since it wrote nothing the interval runs from the last request
          // that did — the next try is when the server says.
          notBefore = now() + retryAfterMs;
          lastSentAt = counted;
          dirty = true;
        }
      }, () => {
        notBefore = now() + retryMs;
        dirty = true;
      })
      .finally(() => {
        inFlight = false;
        if (dirty && !stopped) arm(nextSlot());
      });
  }

  return Object.freeze({
    /** The standings the host sees changed. */
    changed() {
      if (stopped) return;
      dirty = true;
      if (!inFlight) arm(nextSlot());
    },
    /** Nothing more is owed: the room left the live phases. */
    stop() {
      stopped = true;
      dirty = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
      dueAt = null;
    },
    get state() {
      return Object.freeze({ inFlight, dirty, dueAt, lastSentAt: Number.isFinite(lastSentAt) ? lastSentAt : null, stopped });
    },
  });
}

/**
 * What the host's board says, for "did it change": who is ranked, where, with
 * what score, and how many. Work in progress counts (it moves the live board);
 * which stage the clock is in does not.
 */
export const hostStandingsSignature = (leaderboard = []) => (Array.isArray(leaderboard) ? leaderboard : [])
  .map((row) => `${row.playerKey}:${row.rank}:${row.liveScore ?? row.score}:${row.alias}`)
  .join('|');

/**
 * Whether a room is in a moment that has live standings to publish: the
 * lobby (players arriving) and a running match — except while a Graph
 * Feature Rush round is open, when every student's screen is on its own
 * graphs and has its standings listener paused.
 */
export const roomPublishesLiveStandings = (room = null, { questionSetRoom = false } = {}) => {
  if (!room || !['lobby', 'running'].includes(room.status)) return false;
  if (questionSetRoom && room.status === 'running' && room.roundState !== 'closed') return false;
  return true;
};
