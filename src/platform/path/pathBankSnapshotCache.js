/*
 * THE PATH SIMULATOR'S BANK SNAPSHOT: REUSED FOR 60 SECONDS, THEN LET GO
 * (platform engineering deep dive 2026-10-01, smaller items).
 *
 * fetchTeacherPathBankSnapshot reads every active pathQuestionBank document —
 * answer keys included — so the teacher's Path Simulator can run the published
 * bank. A short cache lets a remount within 60 seconds reuse that read instead
 * of downloading the bank again.
 *
 * The cache was a module variable, `{ at, records }`, that nothing ever
 * emptied. After 60 seconds the snapshot was no longer served, but it stayed
 * referenced — the whole bank, answer keys and all — for the rest of the
 * teacher's session.
 *
 * Now expiry lets go of it. A timer drops the reference when the 60 seconds
 * end. The timer's callback closes over a generation number and nothing else,
 * so a pending expiry keeps no records alive, and where the runtime offers
 * `unref` (Node; a browser timer is a plain number) it does not hold a process
 * open either. A timer can fire late — a background tab's timers are throttled
 * — so every read also checks the clock, and drops an expired snapshot instead
 * of serving it or keeping it.
 *
 * No Firebase here: the loader, the clock and the timers are passed in, so the
 * expiry is tested in node (pathBankSnapshotCache.test.mjs) with a fake clock.
 */

export const PATH_BANK_SNAPSHOT_TTL_MS = 60_000;

export const createPathBankSnapshotCache = ({
  load,
  ttlMs = PATH_BANK_SNAPSHOT_TTL_MS,
  now = () => Date.now(),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (timer) => clearTimeout(timer),
} = {}) => {
  // The only reference the cache keeps to a snapshot.
  let held = null;
  let timer = null;
  let generation = 0;

  const cancelTimer = () => {
    if (timer != null) clearTimer(timer);
    timer = null;
  };

  /** Let go of the snapshot, and of any expiry still pending for it. */
  const clear = () => {
    generation += 1;
    cancelTimer();
    held = null;
  };

  /** The snapshot if it is still within its 60 seconds; an expired one is dropped, not served. */
  const read = () => {
    if (held && now() - held.at >= ttlMs) clear();
    return held ? held.records : null;
  };

  const store = (records, at) => {
    cancelTimer();
    generation += 1;
    const stored = generation;
    held = { at, records };
    timer = setTimer(() => {
      if (generation === stored) clear();
    }, Math.max(0, at + ttlMs - now()));
    timer?.unref?.();
  };

  /**
   * The bank, from the cache when a read started less than 60 seconds ago,
   * otherwise from `load`. `force` always loads. As before, the 60 seconds
   * count from when the read that filled the cache began.
   */
  const fetch = async ({ force = false } = {}) => {
    const startedAt = now();
    if (!force) {
      const cached = read();
      if (cached) return cached;
    }
    const records = await load();
    store(records, startedAt);
    return records;
  };

  return {
    fetch,
    read,
    clear,
    /** Whether a snapshot is referenced at all — expired or not. */
    holdsSnapshot: () => held !== null,
  };
};

export default createPathBankSnapshotCache;
